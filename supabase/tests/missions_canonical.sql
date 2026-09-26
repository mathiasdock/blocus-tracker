-- Missions sur les jours canoniques (v76), sur la vraie base. Étudiants
-- jetables, exception finale : RIEN n'est gardé. À lancer après v76, ou dans
-- le MÊME appel execute_sql juste après son SQL.
-- Résultat attendu : « MISSIONS CANONICAL TESTS PASSED ».
--
-- Les dates sont relatives à aujourd'hui (Bruxelles). La bascule des règles du
-- jour étudié est avancée à T-30 et la complétion tardive ouverte à T-40 le
-- temps du test ; les vraies valeurs (2026-10-05, 2026-09-26) sont vérifiées
-- au début. Les déclencheurs différés tournent à chaque `flush()`.

create function pg_temp.flush() returns void language plpgsql as $$
begin
  set constraints all immediate;
  set constraints all deferred;
end $$;

-- Session de `secs` secondes démarrant le jour d à `at`, dans le fuseau tz.
create function pg_temp.sess(u uuid, d date, at time, secs integer, course uuid default null, tz text default 'Europe/Brussels')
returns uuid language plpgsql as $$
declare sid uuid := gen_random_uuid();
begin
  insert into public.sessions (id, user_id, course_id, duration_seconds, started_at, ended_at, timezone)
  values (sid, u, course, secs, (d + at) at time zone tz, (d + at) at time zone tz + make_interval(secs => secs), tz);
  perform pg_temp.flush();
  return sid;
end $$;

-- Attribue une mission quotidienne comme l'aurait fait ensure_… ce jour-là.
create function pg_temp.assign(u uuid, d date, mission text, params jsonb default '{}', slot integer default 1)
returns void language sql as $$
  insert into public.daily_mission_assignments (user_id, mission_date, slot, mission_id, xp, timezone_snapshot, kind, params)
  values (u, d, slot, mission, public.gamification_mission_xp(mission), 'Europe/Brussels',
          case when mission like 'c\_%' then 'challenge' else 'daily' end, params)
$$;

create function pg_temp.done(u uuid, d date, mission text) returns boolean language sql as $$
  select completed_at is not null from public.daily_mission_assignments
  where user_id = u and mission_date = d and mission_id = mission
$$;

create function pg_temp.ledger(u uuid, key text) returns integer language sql as $$
  select count(*)::integer from public.xp_ledger where user_id = u and source_key = key
$$;

do $tests$
declare
  suffix constant text := substr(md5(clock_timestamp()::text), 1, 8);
  u uuid[] := array(select gen_random_uuid() from generate_series(1, 10));
  t constant date := (now() at time zone 'Europe/Brussels')::date;
  wk constant date := public.gamification_week_start((now() at time zone 'Europe/Brussels')::date) - 14;  -- lundi, il y a deux semaines
  checks integer := 0;
  c1 uuid; c2 uuid; c3 uuid;
  s1 uuid; s2 uuid;
  r record;
  first_done timestamptz;
  ledger_before bigint;
begin
  -- ── Câblage ────────────────────────────────────────────────────────────────
  if public.mission_late_completion_from() <> date '2026-09-26'
     or (select new_rules_from from public.study_day_rules) <> date '2026-10-05'
     or not exists (select 1 from pg_trigger where tgname = 'b20_refresh_missions_for_day' and tgdeferrable and tginitdeferred)
     or has_function_privilege('authenticated', 'public.refresh_daily_missions_for_date(uuid, date)', 'execute')
     or has_function_privilege('authenticated', 'public.mission_day_metrics(uuid, date)', 'execute')
     or exists (
       select 1 from pg_proc p where p.proname in ('refresh_daily_missions_for_date', 'refresh_daily_missions_for_user',
         'refresh_weekly_missions_for_week', 'refresh_weekly_missions_for_user', 'ensure_daily_missions_for_user',
         'ensure_weekly_missions_for_user', 'gamification_pick_challenge', 'get_my_weekly_missions', 'get_my_daily_missions')
       and p.prosrc ~ 'gamification_current_streak') then
    raise exception 'FAIL [wiring]';
  end if;
  checks := checks + 1;

  insert into auth.users (id, email, created_at, raw_user_meta_data)
  select u[i], 'missions-' || suffix || '-' || i || '@example.invalid', now() - interval '120 days',
         jsonb_build_object('pseudo', 'msn' || suffix || i, 'study_year', 'BAC 1')
  from generate_series(1, 10) i;
  update public.profiles set timezone = 'Europe/Brussels' where id = any(u);
  insert into public.courses (id, user_id, name, color) values
    (gen_random_uuid(), u[5], 'Cours A', '#10B981'), (gen_random_uuid(), u[5], 'Cours B', '#3B82F6');
  select id into c1 from public.courses where user_id = u[5] and name = 'Cours A';
  select id into c2 from public.courses where user_id = u[5] and name = 'Cours B';

  -- ── Complétion tardive fermée avant 2026-09-26 (missions historiques) ─────
  perform pg_temp.assign(u[1], t - 10, 'm_25m');
  perform pg_temp.sess(u[1], t - 10, '10:00', 1800);
  if t - 10 < date '2026-09-26' and pg_temp.done(u[1], t - 10, 'm_25m') then
    raise exception 'FAIL [historical mission paid without decision]';
  end if;
  checks := checks + 1;

  -- Le temps du test : bascule des règles à T-30, complétion tardive dès T-40.
  update public.study_day_rules set new_rules_from = t - 30;
  execute $f$create or replace function public.mission_late_completion_from() returns date
    language sql immutable as $b$ select (now() at time zone 'Europe/Brussels')::date - 40 $b$$f$;

  -- ── Daily : 24:59 / 25:00 ; plusieurs sessions cumulées ───────────────────
  perform pg_temp.assign(u[1], t - 3, 'm_25m');
  perform pg_temp.sess(u[1], t - 3, '09:00', 1499);
  if pg_temp.done(u[1], t - 3, 'm_25m') then raise exception 'FAIL [24:59 completed]'; end if;
  perform pg_temp.sess(u[1], t - 3, '15:00', 1);
  if not pg_temp.done(u[1], t - 3, 'm_25m') or pg_temp.ledger(u[1], (t - 3)::text || ':m_25m') <> 1 then
    raise exception 'FAIL [25:00 not completed]';
  end if;
  perform pg_temp.assign(u[2], t - 3, 'm_25m');
  perform pg_temp.sess(u[2], t - 3, '08:00', 500);
  perform pg_temp.sess(u[2], t - 3, '12:00', 500);
  perform pg_temp.sess(u[2], t - 3, '18:00', 500);
  if not pg_temp.done(u[2], t - 3, 'm_25m') then raise exception 'FAIL [cumulated sessions]'; end if;
  checks := checks + 3;

  -- ── Daily : 23:30 → 00:30, mission d'hier complétée après minuit ──────────
  -- m_1h le jour D (40 min déjà faites), m_25m le jour D+1. La session
  -- 23:30 → 00:30 donne 30 min à chacun : D = 70 min, D+1 = 30 min.
  perform pg_temp.assign(u[3], t - 5, 'm_1h');
  perform pg_temp.assign(u[3], t - 4, 'm_25m');
  perform pg_temp.sess(u[3], t - 5, '14:00', 2400);
  if pg_temp.done(u[3], t - 5, 'm_1h') then raise exception 'FAIL [40 min is not 1 h]'; end if;
  perform pg_temp.sess(u[3], t - 5, '23:30', 3600);
  if not pg_temp.done(u[3], t - 5, 'm_1h') or not pg_temp.done(u[3], t - 4, 'm_25m') then
    raise exception 'FAIL [midnight split: D %, D+1 %]', pg_temp.done(u[3], t - 5, 'm_1h'), pg_temp.done(u[3], t - 4, 'm_25m');
  end if;
  -- Le fuseau actuel du profil ne déplace rien : on part à New York, rien ne bouge.
  update public.profiles set timezone = 'America/New_York' where id = u[3];
  select * into r from public.mission_day_metrics(u[3], t - 4);
  if r.day_seconds <> 1800 then raise exception 'FAIL [profile tz moved minutes: %]', r.day_seconds; end if;
  checks := checks + 2;

  -- ── Daily : session hors ligne synchronisée le lendemain, puis renvoyée ───
  perform pg_temp.assign(u[4], t - 2, 'm_1h');
  s1 := pg_temp.sess(u[4], t - 2, '20:00', 3600);         -- arrive « aujourd'hui »
  insert into public.sessions (id, user_id, duration_seconds, started_at, ended_at, timezone)
  values (s1, u[4], 3600, ((t - 2) + time '20:00') at time zone 'Europe/Brussels',
          ((t - 2) + time '21:00') at time zone 'Europe/Brussels', 'Europe/Brussels')
  on conflict (id) do nothing;                              -- renvoyée
  perform pg_temp.flush();
  perform public.refresh_daily_missions_for_date(u[4], t - 2);
  perform public.refresh_daily_missions_for_date(u[4], t - 2);
  if not pg_temp.done(u[4], t - 2, 'm_1h') or pg_temp.ledger(u[4], (t - 2)::text || ':m_1h') <> 1 then
    raise exception 'FAIL [offline sync / double reward]';
  end if;
  select completed_at into first_done from public.daily_mission_assignments where user_id = u[4] and mission_date = t - 2;
  -- Suppression puis réduction : récompense et mission conservées, inchangées.
  select count(*) into ledger_before from public.xp_ledger where user_id = u[4];
  delete from public.sessions where id = s1;
  perform pg_temp.flush();
  perform public.refresh_daily_missions_for_date(u[4], t - 2);
  if not pg_temp.done(u[4], t - 2, 'm_1h')
     or (select completed_at from public.daily_mission_assignments where user_id = u[4] and mission_date = t - 2) <> first_done
     or (select count(*) from public.xp_ledger where user_id = u[4]) <> ledger_before then
    raise exception 'FAIL [reward taken back]';
  end if;
  -- Pas de création rétroactive : une session un jour sans mission n'en crée pas.
  perform pg_temp.sess(u[4], t - 6, '10:00', 3600);
  if exists (select 1 from public.daily_mission_assignments where user_id = u[4] and mission_date = t - 6) then
    raise exception 'FAIL [retroactive assignment]';
  end if;
  checks := checks + 3;

  -- ── Daily : cours (minutes par cours = portions de session_days) ──────────
  perform pg_temp.assign(u[5], t - 2, 'm_2courses');
  perform pg_temp.assign(u[5], t - 2, 'm_least_studied', jsonb_build_object('course_id', c2, 'target', 19), 2);
  perform pg_temp.sess(u[5], t - 2, '09:00', 900, c1);
  perform pg_temp.sess(u[5], t - 2, '11:00', 840, c2);
  if pg_temp.done(u[5], t - 2, 'm_2courses') then raise exception 'FAIL [14 min is not 15]'; end if;
  perform pg_temp.sess(u[5], t - 2, '23:55', 720, c2);   -- 5 min le jour même, 7 le lendemain
  if not pg_temp.done(u[5], t - 2, 'm_2courses') or not pg_temp.done(u[5], t - 2, 'm_least_studied') then
    raise exception 'FAIL [course minutes from session_days]';
  end if;
  checks := checks + 1;

  -- ── Daily : sessions individuelles (famille C) ────────────────────────────
  perform pg_temp.assign(u[6], t - 2, 'm_s50');
  perform pg_temp.assign(u[6], t - 2, 'm_two_sessions', '{}', 2);
  perform pg_temp.assign(u[6], t - 2, 'm_noon', '{}', 3);
  perform pg_temp.sess(u[6], t - 2, '13:00', 1800);
  perform pg_temp.sess(u[6], t - 2, '15:00', 1800);
  if pg_temp.done(u[6], t - 2, 'm_s50') or not pg_temp.done(u[6], t - 2, 'm_two_sessions') or pg_temp.done(u[6], t - 2, 'm_noon') then
    raise exception 'FAIL [two 30 min sessions are not one 50 min session]';
  end if;
  -- 22:00 à New York = 04:00 le lendemain à Bruxelles (fuseau du profil) : la
  -- session appartient au jour local de SON fuseau, T-3 — pas à T-2.
  perform pg_temp.sess(u[6], t - 3, '22:00', 3000, null, 'America/New_York');
  perform pg_temp.assign(u[6], t - 3, 'm_s50', '{}', 1);
  perform public.refresh_daily_missions_for_date(u[6], t - 3);
  perform public.refresh_daily_missions_for_date(u[6], t - 2);
  if not pg_temp.done(u[6], t - 3, 'm_s50') or pg_temp.done(u[6], t - 2, 'm_s50') then
    raise exception 'FAIL [session attributed to its own timezone day]';
  end if;
  checks := checks + 2;

  -- ── Weekly : lundi, dimanche, dimanche → lundi, cours, jours étudiés ──────
  -- Semaine wk (lundi) … wk+6 (dimanche), tout après la bascule (T-30).
  insert into public.weekly_mission_assignments (user_id, week_start, slot, mission_id, target, xp, timezone_snapshot) values
    (u[7], wk, 1, 'w_hours', 60, 150, 'Europe/Brussels'),
    (u[7], wk, 2, 'w_days', 3, 120, 'Europe/Brussels'),
    (u[7], wk, 3, 'w_courses', 2, 90, 'Europe/Brussels'),
    (u[7], wk + 7, 1, 'w_hours', 30, 150, 'Europe/Brussels');
  insert into public.courses (id, user_id, name, color) values (gen_random_uuid(), u[7], 'X', '#10B981'), (gen_random_uuid(), u[7], 'Y', '#3B82F6');
  select id into c1 from public.courses where user_id = u[7] and name = 'X';
  select id into c2 from public.courses where user_id = u[7] and name = 'Y';
  insert into public.blocus_periods (user_id, start_date, end_date) values (u[7], wk - 30, wk + 2), (u[7], wk + 4, wk + 40);
  insert into public.streak_freeze_days (user_id, used_on) values (u[7], wk + 2);
  perform pg_temp.sess(u[7], wk, '10:00', 299, c1);          -- lundi 4:59 → pas étudié
  perform pg_temp.sess(u[7], wk + 1, '10:00', 300, c1);      -- mardi 5:00 → étudié
                                                              -- mercredi : joker seul
                                                              -- jeudi : hors blocus, rien
  perform pg_temp.sess(u[7], wk + 4, '08:00', 100, c2);      -- vendredi 3 × 100 s = 5:00
  perform pg_temp.sess(u[7], wk + 4, '12:00', 100, c2);
  perform pg_temp.sess(u[7], wk + 4, '18:00', 100, c2);
  select * into r from public.weekly_mission_progress(u[7], wk);
  if r.studied_days <> 2 then raise exception 'FAIL [studied days: %]', r.studied_days; end if;
  if exists (select 1 from public.weekly_mission_assignments where user_id = u[7] and week_start = wk and mission_id = 'w_days' and completed_at is not null) then
    raise exception 'FAIL [w_days completed at 2]';
  end if;
  -- Dimanche 23:30 → lundi 00:30 (cours X) : 30 min à chaque semaine.
  perform pg_temp.sess(u[7], wk + 6, '23:30', 3600, c1);
  select * into r from public.weekly_mission_progress(u[7], wk);
  if r.studied_days <> 3 or r.minutes <> 30 + (299 + 300 + 300) / 60 then
    raise exception 'FAIL [week wk: %]', to_jsonb(r);
  end if;
  select * into r from public.weekly_mission_progress(u[7], wk + 7);
  if r.minutes <> 30 then raise exception 'FAIL [next week gets the Monday half: %]', to_jsonb(r); end if;
  if not exists (select 1 from public.weekly_mission_assignments where user_id = u[7] and week_start = wk and mission_id = 'w_days' and completed_at is not null)
     or not exists (select 1 from public.weekly_mission_assignments where user_id = u[7] and week_start = wk + 7 and mission_id = 'w_hours' and completed_at is not null)
     or exists (select 1 from public.weekly_mission_assignments where user_id = u[7] and week_start = wk and mission_id in ('w_hours', 'w_courses') and completed_at is not null) then
    raise exception 'FAIL [weekly completion]';
  end if;
  -- Deux cours à ≥ 15 min et ≥ 60 min dans la semaine : tout est complété, une fois.
  perform pg_temp.sess(u[7], wk + 5, '10:00', 1800, c2);
  if (select count(*) from public.weekly_mission_assignments where user_id = u[7] and week_start = wk and completed_at is not null) <> 3
     or (select count(*) from public.xp_ledger where user_id = u[7] and source = 'weekly_mission') <> 4 then
    raise exception 'FAIL [weekly all + no double]';
  end if;
  -- Changement de fuseau en cours de semaine : la session garde SON jour local.
  perform pg_temp.sess(u[7], wk + 3, '22:00', 600, null, 'America/New_York');
  select * into r from public.weekly_mission_progress(u[7], wk);
  if r.studied_days <> 5 then raise exception 'FAIL [NY session day: %]', to_jsonb(r); end if;
  checks := checks + 5;

  -- Avant la bascule : un jour avec 1 s compte (règle historique).
  perform pg_temp.sess(u[8], public.gamification_week_start(t - 60), '10:00', 1);
  select * into r from public.weekly_mission_progress(u[8], public.gamification_week_start(t - 60));
  if r.studied_days <> 1 then raise exception 'FAIL [legacy 1 s day: %]', to_jsonb(r); end if;
  checks := checks + 1;

  -- ── Série : le défi lit la série officielle ───────────────────────────────
  -- 3 jours de 200 s (après la bascule) : l'ancien moteur voyait 3, l'officiel 0.
  perform pg_temp.sess(u[9], t - 1, '10:00', 200);
  perform pg_temp.sess(u[9], t - 2, '10:00', 200);
  perform pg_temp.sess(u[9], t - 3, '10:00', 200);
  select * into r from public.gamification_pick_challenge(u[9], t, 'Europe/Brussels');
  if r.mission_id = 'c_protect_streak' then raise exception 'FAIL [legacy streak used: %]', to_jsonb(r); end if;
  perform pg_temp.sess(u[10], t - 1, '10:00', 600);
  perform pg_temp.sess(u[10], t - 2, '10:00', 600);
  perform pg_temp.sess(u[10], t - 3, '10:00', 600);
  select * into r from public.gamification_pick_challenge(u[10], t, 'Europe/Brussels');
  if r.mission_id <> 'c_protect_streak'
     or (r.params ->> 'streak')::integer <> (select current_streak from public.study_streaks(u[10], t)) then
    raise exception 'FAIL [official streak in challenge: %]', to_jsonb(r);
  end if;
  -- « Hier » en minutes depuis session_days : une session commencée avant-hier
  -- à 23:58 donne 2 min à avant-hier et 40 min à hier. L'ancien calcul (jour de
  -- début) voyait 0 min hier.
  perform pg_temp.sess(u[8], t - 2, '23:58', 2520);
  select * into r from public.gamification_pick_challenge(u[8], t, 'Europe/Brussels');
  if r.mission_id <> 'c_beat_yesterday' or (r.params ->> 'minutes')::integer <> 40 then
    raise exception 'FAIL [yesterday minutes from session_days: %]', to_jsonb(r);
  end if;
  checks := checks + 3;

  -- ── Attribution du jour et lecture client ─────────────────────────────────
  perform public.refresh_daily_missions_for_user(u[10]);
  perform public.refresh_weekly_missions_for_user(u[10]);
  if (select count(*) from public.daily_mission_assignments where user_id = u[10] and mission_date = t) < 3
     or not exists (select 1 from public.weekly_mission_assignments where user_id = u[10] and week_start = public.gamification_week_start(t)) then
    raise exception 'FAIL [today assignment]';
  end if;
  perform set_config('request.jwt.claims', json_build_object('sub', u[10], 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform * from public.get_my_daily_missions();
  select count(*) into ledger_before from public.get_my_weekly_missions();
  reset role;
  if ledger_before < 2 then raise exception 'FAIL [get_my_weekly_missions]'; end if;
  checks := checks + 1;

  raise exception 'MISSIONS CANONICAL TESTS PASSED: % checks (everything rolled back)', checks;
end;
$tests$;
