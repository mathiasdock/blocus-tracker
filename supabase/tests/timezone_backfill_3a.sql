-- Phase 3A (v68 + v69) : vérification du rattrapage, en lecture seule. Lève une
-- exception à la fin : rien n'est gardé (et rien n'est écrit de toute façon).
--
-- À lancer après v69, ou dans le MÊME appel execute_sql juste après v68 + v69
-- (dry-run). Résultat attendu : « TIMEZONE BACKFILL 3A TESTS PASSED ».

do $tests$
declare
  checks integer := 0;
  n integer;
  v jsonb;
begin
  -- ── Périmètre exact ─────────────────────────────────────────────────────────
  select jsonb_object_agg(timezone_basis, cnt) into v
  from (select timezone_basis, count(*) cnt from public.sessions where timezone_source = 'inferred' group by 1) x;
  if v is distinct from '{"bracketed": 469, "near": 60, "single_class": 905}'::jsonb then
    raise exception 'FAIL [inferred sessions by basis: %]', v;
  end if;
  checks := checks + 1;

  -- Aucune session inférée hors des trois preuves, aucune preuve hors 'inferred'.
  if exists (select 1 from public.sessions where timezone_source = 'inferred' and timezone_basis is null)
     or exists (select 1 from public.sessions where timezone_basis is not null and timezone_source <> 'inferred') then
    raise exception 'FAIL [basis / source mismatch]';
  end if;
  checks := checks + 1;

  -- ── Portions : somme exacte, et rien pour l'historique non migré ────────────
  if exists (
    select 1 from public.sessions s
    where s.timezone_source = 'inferred'
      and (select coalesce(sum(p.seconds), 0) from public.session_day_parts p where p.session_id = s.id) <> s.duration_seconds
  ) then
    raise exception 'FAIL [an inferred session has parts not summing to its duration]';
  end if;
  checks := checks + 1;

  if exists (select 1 from public.session_day_parts p join public.sessions s on s.id = p.session_id where s.timezone is null) then
    raise exception 'FAIL [a legacy session has parts]';
  end if;
  checks := checks + 1;

  -- Les sessions sans profil restent toutes en mode historique.
  select count(*) into n from public.sessions s
  where not exists (select 1 from public.profiles p where p.id = s.user_id) and s.timezone is not null;
  if n <> 0 then
    raise exception 'FAIL [% sessions of accounts without profile got a timezone]', n;
  end if;
  checks := checks + 1;

  -- ── Voyages : le passé n'est pas réécrit dans le fuseau actuel du profil ────
  -- Il existe des sessions inférées dans un autre fuseau que le profil actuel,
  -- et chacune des sessions 'bracketed'/'near' a un instantané de SON fuseau à
  -- moins de 7 jours.
  select count(*) into n from public.sessions s join public.profiles p on p.id = s.user_id
  where s.timezone_source = 'inferred'
    and (s.started_at at time zone s.timezone) <> (s.started_at at time zone p.timezone);
  if n = 0 then
    raise exception 'FAIL [no inferred session kept a timezone different from the current profile]';
  end if;
  checks := checks + 1;

  if exists (
    select 1 from public.sessions s
    where s.timezone_basis in ('bracketed', 'near')
      and not exists (
        select 1 from (
          select user_id, created_at at_, timezone_snapshot tz from public.daily_mission_assignments
          union all select user_id, created_at, timezone_snapshot from public.weekly_mission_assignments
          union all select id, created_at, raw_user_meta_data->>'timezone' from auth.users where raw_user_meta_data ? 'timezone'
          union all select user_id, started_at, timezone from public.sessions where timezone_source = 'device'
        ) x
        where x.user_id = s.user_id and x.tz = s.timezone
          and x.at_ between s.started_at - interval '7 days' and s.started_at + interval '7 days')
  ) then
    raise exception 'FAIL [a bracketed/near session has no snapshot of its timezone within 7 days]';
  end if;
  checks := checks + 1;

  -- ── Gamification : ces colonnes ne peuvent déclencher ni validation ni calcul ─
  if exists (
    select 1 from pg_trigger t
    where t.tgrelid = 'public.sessions'::regclass
      and t.tgname in ('refresh_gamification_sessions', 'validate_new_study_session')
      and exists (
        select 1 from unnest(t.tgattr::int2[]) a
        join pg_attribute pa on pa.attrelid = t.tgrelid and pa.attnum = a
        where pa.attname in ('timezone', 'timezone_source', 'timezone_basis', 'day_parts_version'))
  ) then
    raise exception 'FAIL [a gamification or validation trigger listens to timezone columns]';
  end if;
  checks := checks + 1;

  raise exception 'TIMEZONE BACKFILL 3A TESTS PASSED: % checks (read-only)', checks;
end;
$tests$;
