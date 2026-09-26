-- v77 — Clôture de la Phase 5B : récompenses de missions manquées (opération
-- ponctuelle, validée par Mathias le 2026-09-26).
--
-- 14 missions quotidiennes (6 comptes, 680 XP, du 2026-08-01 au 2026-09-03)
-- dont les conditions étaient réellement remplies selon les jours canoniques
-- (session_days) mais qui n'avaient jamais été recalculées : session arrivée
-- après minuit ou synchronisée plus tard, portions à cheval sur minuit.
-- Liste figée à partir du dry-run ; aucune autre mission n'est touchée.
--
-- Même mécanisme que refresh_daily_missions_for_date (v76) :
--   · completed_at / claimed_at posés seulement s'ils sont vides ;
--   · XP via xp_ledger (source 'daily_mission', clé 'date:mission', XP de
--     l'attribution) ON CONFLICT DO NOTHING — relancer ne redonne rien ;
--   · une ligne admin_audit_log (journal en ajout seul) par récompense
--     réellement versée : la trace de l'opération.
-- Garde-fous : chaque mission doit exister, avoir encore ses conditions
-- remplies (mesures canoniques), et le lot entier doit valoir 14 / 680 XP ;
-- sinon rien n'est écrit.

do $backfill$
declare
  v_missing integer;
  v_unmet integer;
  v_xp integer;
  v_count integer;
  v_paid integer := 0;
  v_paid_xp integer := 0;
  v_rows integer;
  r record;
begin
  drop table if exists pg_temp.backfill_5b, pg_temp.backfill_targets;
  create temp table backfill_5b (user_prefix text, mission_date date, mission_id text) on commit drop;
  insert into backfill_5b values
    ('415f1524', '2026-08-01', 'm_3h'),
    ('a24f122a', '2026-08-06', 'm_2h'),
    ('a24f122a', '2026-08-06', 'm_streak'),
    ('31747255', '2026-08-10', 'm_25m'),
    ('31747255', '2026-08-10', 'm_s25'),
    ('31747255', '2026-08-11', 'm_25m'),
    ('94214b63', '2026-08-11', 'm_1h'),
    ('94214b63', '2026-08-11', 'm_s25'),
    ('c77178ef', '2026-08-13', 'm_s90'),
    ('c77178ef', '2026-08-14', 'm_streak'),
    ('31747255', '2026-08-26', 'm_1h'),
    ('31747255', '2026-08-26', 'm_s25'),
    ('31747255', '2026-08-27', 'm_25m'),
    ('19f74848', '2026-09-03', 'm_2courses');

  create temp table backfill_targets on commit drop as
  select a.user_id, a.mission_date, a.mission_id, a.xp, a.completed_at, x.day_seconds, x.max_session, x.courses_15,
         case a.mission_id
           when 'm_25m' then x.day_seconds >= 1500
           when 'm_1h' then x.day_seconds >= 3600
           when 'm_2h' then x.day_seconds >= 7200
           when 'm_3h' then x.day_seconds >= 10800
           when 'm_s25' then x.max_session >= 1500
           when 'm_s90' then x.max_session >= 5400
           when 'm_2courses' then x.courses_15 >= 2
           when 'm_streak' then (select s.is_studied from public.study_day_states(a.user_id, a.mission_date, a.mission_date, a.mission_date) s)
           else false
         end as met
  from backfill_5b b
  join public.profiles p on left(p.id::text, 8) = b.user_prefix
  join public.daily_mission_assignments a on a.user_id = p.id and a.mission_date = b.mission_date and a.mission_id = b.mission_id
  cross join lateral public.mission_day_metrics(a.user_id, a.mission_date) x;

  select 14 - count(*), count(*) filter (where not met), coalesce(sum(xp), 0), count(*)
  into v_missing, v_unmet, v_xp, v_count
  from backfill_targets;
  if v_missing <> 0 or v_unmet <> 0 or v_xp <> 680 then
    raise exception 'Backfill 5B aborted: % missing, % no longer met, % XP (expected 14 / 0 / 680)', v_missing, v_unmet, v_xp;
  end if;

  for r in select * from backfill_targets order by mission_date, user_id, mission_id loop
    update public.daily_mission_assignments
    set completed_at = coalesce(completed_at, now()),
        claimed_at = coalesce(claimed_at, now())
    where user_id = r.user_id and mission_date = r.mission_date and mission_id = r.mission_id;

    insert into public.xp_ledger (user_id, source, source_key, xp)
    values (r.user_id, 'daily_mission', r.mission_date::text || ':' || r.mission_id, r.xp)
    on conflict (user_id, source, source_key) do nothing;
    get diagnostics v_rows = row_count;

    if v_rows = 1 then
      v_paid := v_paid + 1;
      v_paid_xp := v_paid_xp + r.xp;
      insert into public.admin_audit_log (actor_kind, action, target_user_id, target_type, target_id, reason, details)
      values ('database', 'mission_backfill_5b', r.user_id, 'daily_mission', r.mission_date::text || ':' || r.mission_id,
              'Phase 5B : mission réussie selon les jours canoniques, jamais recalculée (validé par Mathias le 2026-09-26)',
              jsonb_build_object('xp', r.xp, 'mission_date', r.mission_date, 'mission_id', r.mission_id,
                                 'day_seconds', r.day_seconds, 'max_session', r.max_session, 'courses_15', r.courses_15,
                                 'migration', 'v77_backfill_5b_missions'));
    end if;
  end loop;

  raise notice 'Backfill 5B: % rewards paid now (% XP), % already paid before', v_paid, v_paid_xp, v_count - v_paid;
end;
$backfill$;
