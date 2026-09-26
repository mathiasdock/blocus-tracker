-- Série officielle (v73), sur la vraie base. Étudiants jetables, puis
-- exception finale : RIEN n'est gardé.
-- À lancer après v73, ou dans le MÊME appel execute_sql juste après son SQL.
-- Résultat attendu : « OFFICIAL STREAK TESTS PASSED ».

do $tests$
declare
  suffix constant text := substr(md5(clock_timestamp()::text), 1, 8);
  u uuid[] := array(select gen_random_uuid() from generate_series(1, 3));
  checks integer := 0;
  r record;
  lv record;
  legacy_before integer;
begin
  -- ── Droits ─────────────────────────────────────────────────────────────────
  if not has_function_privilege('authenticated', 'public.get_my_streak(date)', 'execute')
     or has_function_privilege('anon', 'public.get_my_streak(date)', 'execute')
     or has_function_privilege('authenticated', 'public.study_streak_reminder_states(uuid[], timestamptz)', 'execute')
     or has_function_privilege('anon', 'public.study_streak_reminder_states(uuid[], timestamptz)', 'execute')
     or not has_function_privilege('service_role', 'public.study_streak_reminder_states(uuid[], timestamptz)', 'execute') then
    raise exception 'FAIL [privileges]';
  end if;
  checks := checks + 1;

  insert into auth.users (id, email, created_at, raw_user_meta_data)
  select u[i], 'official-streak-' || suffix || '-' || i || '@example.invalid', now() - interval '60 days',
         jsonb_build_object('pseudo', 'ost' || suffix || i, 'study_year', 'BAC 1')
  from generate_series(1, 3) i;
  update public.profiles set timezone = 'Europe/Brussels' where id = any(u);

  -- Bascule de test dans le passé (la base refuse les sessions futures) ;
  -- la vraie date (2026-10-05) est vérifiée par tests/study_day_states.sql.
  update public.study_day_rules set new_rules_from = date '2026-09-10';

  -- u1 : 05 (1 s, avant) · joker 06 (+1) · 07 · 08 · 09 · 10 (300 s) · joker 11 (+0) · 12 · 13 (299 s)
  insert into public.sessions (user_id, duration_seconds, started_at, ended_at, timezone)
  select u[1], d.secs, d.at, d.at + make_interval(secs => d.secs), 'Europe/Brussels'
  from (values (1, timestamptz '2026-09-05T10:00:00Z'), (600, '2026-09-07T10:00:00Z'), (600, '2026-09-08T10:00:00Z'),
               (600, '2026-09-09T10:00:00Z'), (300, '2026-09-10T10:00:00Z'), (600, '2026-09-12T10:00:00Z'),
               (299, '2026-09-13T10:00:00Z')) d(secs, at);
  insert into public.streak_freeze_days (user_id, used_on) values (u[1], '2026-09-06'), (u[1], '2026-09-11');

  -- Série affichée le 13 : 13 n'est pas étudié (4:59) → la journée reste ouverte.
  select * into r from public.study_streaks(u[1], date '2026-09-13');
  -- 05, 06 (joker +1), 07, 08, 09, 10, 11 (joker +0), 12 = 7
  if r.current_streak <> 7 or r.best_streak <> 7 or r.studied_days <> 6 then
    raise exception 'FAIL [u1 streaks %/%/%]', r.current_streak, r.best_streak, r.studied_days;
  end if;
  checks := checks + 1;

  -- Rappel : le 13 à 20 h (Bruxelles), 4:59 ne valide pas → série en danger.
  select * into r from public.study_streak_reminder_states(array[u[1]], timestamptz '2026-09-13T18:00:00Z');
  if r.today <> date '2026-09-13' or r.studied_today or r.today_preserves_streak or r.current_streak <> 7 then
    raise exception 'FAIL [u1 reminder at 4:59: %]', to_jsonb(r);
  end if;
  -- Une seconde de plus : 5:00, la journée est validée, plus de rappel.
  insert into public.sessions (user_id, duration_seconds, started_at, ended_at, timezone)
  values (u[1], 1, '2026-09-13T12:00:00Z', '2026-09-13T12:00:01Z', 'Europe/Brussels');
  select * into r from public.study_streak_reminder_states(array[u[1]], timestamptz '2026-09-13T18:00:00Z');
  if not r.studied_today or not r.today_preserves_streak or r.current_streak <> 8 then
    raise exception 'FAIL [u1 reminder at 5:00: %]', to_jsonb(r);
  end if;
  checks := checks + 2;

  -- u2 : hors blocus neutre pour la série ET la meilleure série.
  insert into public.blocus_periods (user_id, start_date, end_date) values (u[2], '2026-09-01', '2026-09-05'), (u[2], '2026-09-08', '2026-09-30');
  insert into public.sessions (user_id, duration_seconds, started_at, ended_at, timezone)
  select u[2], 600, d, d + interval '600 seconds', 'Europe/Brussels'
  from unnest(array[timestamptz '2026-09-04T10:00:00Z', '2026-09-05T10:00:00Z', '2026-09-08T10:00:00Z', '2026-09-09T10:00:00Z']) d;
  select * into r from public.study_streaks(u[2], date '2026-09-10');
  -- 04, 05, (06, 07 hors blocus : neutres), 08, 09 = 4, sans cassure
  if r.current_streak <> 4 or r.best_streak <> 4 then
    raise exception 'FAIL [u2 blocus %/%]', r.current_streak, r.best_streak;
  end if;
  -- Aujourd'hui hors blocus : la série est en pause, jamais « en danger ».
  select * into r from public.study_streak_reminder_states(array[u[2]], timestamptz '2026-09-06T18:00:00Z');
  if not r.today_preserves_streak or r.studied_today then
    raise exception 'FAIL [u2 reminder off blocus: %]', to_jsonb(r);
  end if;
  checks := checks + 2;

  -- ── get_my_streak : ma série, mes règles, « aujourd'hui » borné ─────────────
  perform set_config('request.jwt.claims', json_build_object('sub', u[1], 'role', 'authenticated')::text, true);
  set local role authenticated;
  select * into r from public.get_my_streak((now() at time zone 'Europe/Brussels')::date);
  if r.today <> (now() at time zone 'Europe/Brussels')::date or r.min_seconds <> 300 or r.legacy_min_seconds <> 1
     or r.new_rules_from <> date '2026-09-10' then
    raise exception 'FAIL [get_my_streak: %]', to_jsonb(r);
  end if;
  -- Une date lointaine ne réécrit rien : on retombe sur la date du serveur.
  select * into r from public.get_my_streak(date '2026-01-01');
  if r.today <> (now() at time zone 'Europe/Brussels')::date then
    raise exception 'FAIL [get_my_streak clamp: %]', r.today;
  end if;
  -- Les fonctions internes restent fermées aux clients.
  begin
    perform public.study_streaks(u[2]);
    raise exception 'FAIL [client can call study_streaks]';
  exception when insufficient_privilege then null;
  end;
  checks := checks + 3;

  -- ── Niveaux : série et meilleure série canoniques, XP = best × 10 ─────────
  select * into lv from public.get_gamification_levels(array[u[2]]);
  reset role;
  select * into r from public.study_streaks(u[2]);
  if lv.streak <> r.current_streak or lv.streak_xp <> r.best_streak * 10 then
    raise exception 'FAIL [levels: streak % vs %, streak_xp % vs %]', lv.streak, r.current_streak, lv.streak_xp, r.best_streak * 10;
  end if;
  checks := checks + 1;

  -- ── Les consommateurs legacy ne bougent pas ────────────────────────────────
  -- Missions, badges et défi du jour lisent toujours gamification_current_streak
  -- (jour de début, joker +1, aucun seuil).
  legacy_before := public.gamification_current_streak(u[3]);
  if legacy_before <> 0 then raise exception 'FAIL [legacy baseline]'; end if;
  if exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace and n.nspname = 'public'
    where p.proname in ('award_badges_for_user', 'refresh_daily_missions_for_user', 'gamification_pick_challenge')
      and (pg_get_functiondef(p.oid) ~ 'study_streaks' or pg_get_functiondef(p.oid) !~ 'gamification_current_streak')
  ) then
    raise exception 'FAIL [a legacy consumer changed engine]';
  end if;
  if pg_get_functiondef('public.get_gamification_levels(uuid[])'::regprocedure) ~ 'gamification_(current|best)_streak' then
    raise exception 'FAIL [levels still read the legacy streak]';
  end if;
  checks := checks + 2;

  raise exception 'OFFICIAL STREAK TESTS PASSED: % checks (everything rolled back)', checks;
end;
$tests$;
