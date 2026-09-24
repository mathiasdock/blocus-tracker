-- ════════════════════════════════════════════════════════════════════════════
-- v69 — Phase 3A : rattrapage du fuseau des sessions historiques (confiance
--       haute et moyenne uniquement)
-- ════════════════════════════════════════════════════════════════════════════
--
-- Renseigne timezone, timezone_source = 'inferred', timezone_basis et
-- day_parts_version sur les sessions historiques dont le fuseau est prouvé
-- (voir v68 pour les preuves). Le déclencheur a10 génère alors leurs portions
-- dans session_day_parts (répartition au prorata de l'intervalle, y compris
-- pour les anciennes sessions dont l'intervalle dépasse la durée).
--
-- NE TOUCHE JAMAIS : started_at, ended_at, duration_seconds, course_id, note,
-- XP, badges, missions, jokers. Les déclencheurs de validation et de
-- gamification ne se déclenchent que sur UPDATE OF duration_seconds,
-- started_at, ended_at : ces colonnes ne figurent pas dans le SET.
--
-- Hors périmètre, laissées en mode historique (timezone nul, aucune portion) :
--   • confiance faible : seul le profil par défaut ou l'université l'indique ;
--   • aucune preuve : comptes sans profil.
--
-- Dry-run du 2026-09-24 (état de la base au moment de l'écriture) :
--   bracketed 469 · near 60 · single_class 905 = 1 434 sessions ;
--   1 052 de confiance faible et 26 sans profil non migrées.
-- La transaction s'annule d'elle-même si ces nombres ne sont plus exacts, si
-- une somme de portions diffère d'une durée, si une colonne d'origine change,
-- si une session non ciblée bouge, ou si une ligne de gamification est écrite.
-- ════════════════════════════════════════════════════════════════════════════

do $backfill$
declare
  c_expected constant jsonb := '{"bracketed": 469, "near": 60, "single_class": 905}';
  c_expected_total constant integer := 1434;
  v_counts jsonb;
  v_core_before text;
  v_core_after text;
  v_untouched_before text;
  v_untouched_after text;
  n integer;
begin
  -- ── 1. Le plan, recalculé sur l'état actuel ────────────────────────────────
  create temp table _tz_plan on commit drop as
    with cls as (
      -- Classes de règles horaires : deux fuseaux de même classe donnent les mêmes jours en 2026.
      select z.tz, md5(string_agg(((g at time zone z.tz) - (g at time zone 'UTC'))::text, ',' order by g)) k
      from (
        select distinct tz from (
          select timezone tz from public.profiles
          union select timezone_snapshot from public.daily_mission_assignments
          union select timezone_snapshot from public.weekly_mission_assignments
          union select raw_user_meta_data->>'timezone' from auth.users where raw_user_meta_data ? 'timezone'
          union select timezone from public.sessions where timezone_source = 'device'
        ) x where public.is_valid_session_timezone(tz)
      ) z,
      generate_series(timestamptz '2026-01-01Z', timestamptz '2027-01-01Z', interval '1 hour') g
      group by z.tz
    ), snaps as (
      -- Instantanés horodatés : le fuseau du profil au moment où une mission a été
      -- créée, celui envoyé à l'inscription, et celui capturé par les nouvelles sessions.
      select s.user_id, s.at_, s.tz, c.k
      from (
        select user_id, created_at at_, timezone_snapshot tz from public.daily_mission_assignments where timezone_snapshot <> 'Europe/Paris'
        union all select user_id, created_at, timezone_snapshot from public.weekly_mission_assignments where timezone_snapshot <> 'Europe/Paris'
        union all select id, created_at, raw_user_meta_data->>'timezone' from auth.users where raw_user_meta_data ? 'timezone'
        union all select user_id, started_at, timezone from public.sessions where timezone_source = 'device'
      ) s join cls c using (tz)
    ), uev as (
      -- Classes observées pour un compte (instantanés + profil s'il n'est pas la valeur par défaut).
      select user_id, count(distinct k) classes
      from (
        select user_id, k from snaps
        union all select p.id, c.k from public.profiles p join cls c on c.tz = p.timezone where p.timezone <> 'Europe/Paris'
      ) e group by user_id
    ), leg as (
      select s.id, s.user_id, s.started_at, s.ended_at, s.duration_seconds, p.timezone profile_tz
      from public.sessions s join public.profiles p on p.id = s.user_id
      where s.timezone is null
    ), ctx as (
      select l.*, pv.tz ptz, pv.at_ pat, nx.tz ntz, nx.at_ nat, u.classes,
        coalesce(pv.at_ >= l.started_at - interval '7 days', false) has_prev7,
        coalesce(nx.at_ <= l.started_at + interval '7 days', false) has_next7
      from leg l
      left join uev u on u.user_id = l.user_id
      left join lateral (select tz, at_ from snaps x where x.user_id = l.user_id and x.at_ <= l.started_at order by x.at_ desc limit 1) pv on true
      left join lateral (select tz, at_ from snaps x where x.user_id = l.user_id and x.at_ >= l.started_at order by x.at_ limit 1) nx on true
    ), near as (
      select c.*,
        case when c.pat is not null and (c.nat is null or c.started_at - c.pat <= c.nat - c.started_at) then c.ptz else c.ntz end nearest_tz
      from ctx c
    ), judged as (
      select n.*,
        (select jsonb_agg(jsonb_build_array(p.local_date, p.seconds) order by p.local_date)
           from public.compute_session_day_parts(n.started_at, n.ended_at, n.duration_seconds, n.ptz) p) prev_parts,
        (select jsonb_agg(jsonb_build_array(p.local_date, p.seconds) order by p.local_date)
           from public.compute_session_day_parts(n.started_at, n.ended_at, n.duration_seconds, n.ntz) p) next_parts,
        -- Tous les fuseaux vus à ±7 jours donnent-ils les mêmes portions que le plus proche ?
        not exists (
          select 1 from (select distinct x.tz from snaps x where x.user_id = n.user_id
                           and x.at_ between n.started_at - interval '7 days' and n.started_at + interval '7 days') d
          where (select jsonb_agg(jsonb_build_array(p.local_date, p.seconds) order by p.local_date)
                   from public.compute_session_day_parts(n.started_at, n.ended_at, n.duration_seconds, d.tz) p)
            is distinct from
                (select jsonb_agg(jsonb_build_array(p.local_date, p.seconds) order by p.local_date)
                   from public.compute_session_day_parts(n.started_at, n.ended_at, n.duration_seconds, n.nearest_tz) p)
        ) agree7
      from near n
    ), plan as (
      select j.id, j.user_id, j.started_at, j.ended_at, j.duration_seconds,
        case
          when j.has_prev7 and j.has_next7 and j.prev_parts = j.next_parts then 'bracketed'
          when (j.has_prev7 or j.has_next7) and j.agree7 then 'near'
          when not (j.has_prev7 or j.has_next7) and j.classes = 1 then 'single_class'
        end basis,
        case
          when j.has_prev7 or j.has_next7 then j.nearest_tz
          else coalesce(
            (select x.tz from snaps x where x.user_id = j.user_id and x.tz <> 'Europe/Paris'
              order by abs(extract(epoch from x.at_ - j.started_at)) limit 1),
            j.profile_tz)
        end tz
      from judged j
    )
    select id, user_id, tz, basis, started_at, ended_at, duration_seconds
    from plan where basis is not null;

  select jsonb_object_agg(basis, cnt) into v_counts
  from (select basis, count(*) cnt from _tz_plan group by basis) x;
  if v_counts is distinct from c_expected then
    raise exception 'v69 aborted: plan counts % differ from the dry-run %', v_counts, c_expected;
  end if;

  if exists (select 1 from _tz_plan p join public.sessions s on s.id = p.id where s.timezone is not null) then
    raise exception 'v69 aborted: a planned session already has a timezone';
  end if;

  if exists (
    select 1 from _tz_plan p
    where (select coalesce(sum(x.seconds), 0) from public.compute_session_day_parts(p.started_at, p.ended_at, p.duration_seconds, p.tz) x)
          <> p.duration_seconds
  ) then
    raise exception 'v69 aborted: a planned session would get parts not summing to its duration';
  end if;

  -- ── 2. Empreintes avant écriture ───────────────────────────────────────────
  create temp table _legacy_before on commit drop as
    select id from public.sessions where timezone is null;

  select md5(string_agg(concat_ws('|', s.id, s.user_id, s.course_id, s.duration_seconds, s.note, s.started_at, s.ended_at), ',' order by s.id))
  into v_core_before
  from public.sessions s join _legacy_before b using (id);

  select md5(string_agg(concat_ws('|', s.id, s.timezone, s.timezone_source, s.timezone_basis, s.day_parts_version), ',' order by s.id))
  into v_untouched_before
  from public.sessions s join _legacy_before b using (id)
  where s.id not in (select id from _tz_plan);

  -- ── 3. Écriture : seulement les champs de fuseau ───────────────────────────
  update public.sessions s
  set timezone = p.tz,
      timezone_source = 'inferred',
      timezone_basis = p.basis,
      day_parts_version = 1
  from _tz_plan p
  where s.id = p.id and s.timezone is null;
  get diagnostics n = row_count;
  if n <> c_expected_total then
    raise exception 'v69 aborted: % sessions updated, expected %', n, c_expected_total;
  end if;

  -- ── 4. Vérifications dans la même transaction ──────────────────────────────
  select md5(string_agg(concat_ws('|', s.id, s.user_id, s.course_id, s.duration_seconds, s.note, s.started_at, s.ended_at), ',' order by s.id))
  into v_core_after
  from public.sessions s join _legacy_before b using (id);
  if v_core_after is distinct from v_core_before then
    raise exception 'v69 aborted: an original session column changed';
  end if;

  select md5(string_agg(concat_ws('|', s.id, s.timezone, s.timezone_source, s.timezone_basis, s.day_parts_version), ',' order by s.id))
  into v_untouched_after
  from public.sessions s join _legacy_before b using (id)
  where s.id not in (select id from _tz_plan);
  if v_untouched_after is distinct from v_untouched_before then
    raise exception 'v69 aborted: a session outside the plan changed';
  end if;

  if exists (
    select 1 from _tz_plan p
    where (select coalesce(sum(d.seconds), 0) from public.session_day_parts d where d.session_id = p.id) <> p.duration_seconds
  ) then
    raise exception 'v69 aborted: generated parts do not sum to the duration';
  end if;

  if exists (
    select 1 from public.session_day_parts d join _legacy_before b on b.id = d.session_id
    where d.session_id not in (select id from _tz_plan)
  ) then
    raise exception 'v69 aborted: a session outside the plan got parts';
  end if;

  -- Toute ligne écrite par CETTE transaction porte now() (horodatage de début
  -- de transaction) : aucune ne doit exister côté gamification ni activité.
  if exists (select 1 from public.xp_ledger where created_at = now())
     or exists (select 1 from public.user_badges where earned_at = now())
     or exists (select 1 from public.daily_mission_assignments where created_at = now() or completed_at = now() or claimed_at = now())
     or exists (select 1 from public.weekly_mission_assignments where created_at = now() or completed_at = now() or claimed_at = now())
     or exists (select 1 from public.streak_freeze_days where created_at = now())
     or exists (select 1 from public.user_activity_totals where updated_at = now())
     or exists (select 1 from public.posts where created_at = now()) then
    raise exception 'v69 aborted: the backfill wrote gamification or activity rows';
  end if;

  raise notice 'v69: % sessions backfilled %', n, v_counts;
end
$backfill$;
