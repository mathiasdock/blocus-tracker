-- Jokers (v74), sur la vraie base. Étudiants jetables, puis exception finale :
-- RIEN n'est gardé. À lancer après v74, ou dans le MÊME appel execute_sql
-- juste après son SQL. Résultat attendu : « STREAK FREEZE TESTS PASSED ».
--
-- Les dates sont relatives à aujourd'hui (Bruxelles) : la base refuse les
-- sessions futures, et redeem n'accepte que les 31 derniers jours. La bascule
-- des règles est avancée à T-20 le temps du test ; la vraie date (2026-10-05)
-- est vérifiée par tests/study_day_states.sql.

do $tests$
declare
  suffix constant text := substr(md5(clock_timestamp()::text), 1, 8);
  u uuid[] := array(select gen_random_uuid() from generate_series(1, 3));
  t constant date := (now() at time zone 'Europe/Brussels')::date;
  cut constant date := t - 20;
  checks integer := 0;
  r record;
  n integer;
  real_freezes_before integer;
  sid uuid;
  sid_move uuid;
begin
  select count(*) into real_freezes_before from public.streak_freeze_days;

  -- ── Droits ─────────────────────────────────────────────────────────────────
  if not has_function_privilege('authenticated', 'public.redeem_streak_freezes(date[], date)', 'execute')
     or has_function_privilege('anon', 'public.redeem_streak_freezes(date[], date)', 'execute')
     or has_function_privilege('authenticated', 'public.refund_streak_freeze_for_day(uuid, date)', 'execute')
     or has_table_privilege('authenticated', 'public.streak_freeze_refunds', 'insert')
     or has_table_privilege('authenticated', 'public.streak_freeze_refunds', 'delete')
     or exists (select 1 from pg_proc where proname = 'redeem_streak_freezes' and pronargs = 1) then
    raise exception 'FAIL [privileges / old signature]';
  end if;
  checks := checks + 1;

  insert into auth.users (id, email, created_at, raw_user_meta_data)
  select u[i], 'streak-freeze-' || suffix || '-' || i || '@example.invalid', now() - interval '90 days',
         jsonb_build_object('pseudo', 'sfz' || suffix || i, 'study_year', 'BAC 1')
  from generate_series(1, 3) i;
  update public.profiles set timezone = 'Europe/Brussels' where id = any(u);
  update public.study_day_rules set new_rules_from = cut;

  -- u1 (tout en Bruxelles) :
  --   T-25 : 1 s (avant la bascule → étudié)    T-24 : joker historique (+1)
  --   T-10 : 600 s (étudié)   T-9 : 299 s (4:59)   T-8 : 300 s (5:00)
  --   T-7  : rien             T-6 : 200 s          T-5 : 400 s
  insert into public.sessions (id, user_id, duration_seconds, started_at, ended_at, timezone)
  select gen_random_uuid(), u[1], x.secs, x.at, x.at + make_interval(secs => x.secs), 'Europe/Brussels'
  from (values
    (1,   ((t - 25) + time '10:00') at time zone 'Europe/Brussels'),
    (600, ((t - 10) + time '10:00') at time zone 'Europe/Brussels'),
    (299, ((t - 9)  + time '10:00') at time zone 'Europe/Brussels'),
    (300, ((t - 8)  + time '10:00') at time zone 'Europe/Brussels'),
    (200, ((t - 6)  + time '10:00') at time zone 'Europe/Brussels'),
    (400, ((t - 5)  + time '10:00') at time zone 'Europe/Brussels')
  ) x(secs, at);
  insert into public.streak_freeze_days (user_id, used_on, created_at) values (u[1], t - 24, now() - interval '24 days');

  -- ── Joker historique : intact, préserve et compte +1 ───────────────────────
  select * into r from public.study_day_states(u[1], t - 24, t - 24, t);
  if r.state <> 'neutral' or not r.preserves_streak or not r.increments_streak or r.is_studied then
    raise exception 'FAIL [historical freeze: %]', to_jsonb(r);
  end if;
  checks := checks + 1;

  perform set_config('request.jwt.claims', json_build_object('sub', u[1], 'role', 'authenticated')::text, true);
  set local role authenticated;

  -- ── Refus serveur ──────────────────────────────────────────────────────────
  -- Jour déjà étudié (600 s).
  begin
    perform public.redeem_streak_freezes(array[t - 10]);
    raise exception 'FAIL [studied day accepted]';
  exception when invalid_parameter_value then
    if sqlerrm !~ 'already studied' then raise; end if;
  end;
  -- 5:00 pile après la bascule : étudié → refusé.
  begin
    perform public.redeem_streak_freezes(array[t - 8]);
    raise exception 'FAIL [5:00 day accepted]';
  exception when invalid_parameter_value then
    if sqlerrm !~ 'already studied' then raise; end if;
  end;
  -- 1 s AVANT la bascule : étudié selon la règle historique → refusé.
  begin
    perform public.redeem_streak_freezes(array[t - 25]);
    raise exception 'FAIL [legacy studied day accepted]';
  exception when invalid_parameter_value then
    if sqlerrm !~ 'already studied' then raise; end if;
  end;
  -- Aujourd'hui, demain, trop vieux, trois jours d'un coup : règles existantes.
  begin
    perform public.redeem_streak_freezes(array[t]);
    raise exception 'FAIL [today accepted]';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.redeem_streak_freezes(array[t - 40]);
    raise exception 'FAIL [old day accepted]';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.redeem_streak_freezes(array[t - 7, t - 6, t - 4]);
    raise exception 'FAIL [three days accepted]';
  exception when invalid_parameter_value then null;
  end;
  -- Un refus n'a rien consommé.
  if exists (select 1 from public.streak_freeze_days where user_id = u[1] and used_on <> t - 24) then
    raise exception 'FAIL [a refused call wrote a freeze]';
  end if;
  checks := checks + 6;

  -- ── 4:59 après la bascule : encore éligible ────────────────────────────────
  select * into r from public.redeem_streak_freezes(array[t - 9], t);
  if r.used_now <> 1 or r.remaining_stock <> 1 then
    raise exception 'FAIL [4:59 redeem: %]', to_jsonb(r);
  end if;
  -- Répété : idempotent, rien de plus consommé.
  select * into r from public.redeem_streak_freezes(array[t - 9], t);
  if r.used_now <> 0 or r.remaining_stock <> 1 then
    raise exception 'FAIL [repeat redeem: %]', to_jsonb(r);
  end if;
  reset role;
  -- Joker après la bascule : neutre, préserve, +0, jamais « étudié ».
  select * into r from public.study_day_states(u[1], t - 9, t - 9, t);
  if r.state <> 'neutral' or not r.preserves_streak or r.increments_streak or r.is_studied then
    raise exception 'FAIL [post-cutover freeze: %]', to_jsonb(r);
  end if;
  if (select stock_month from public.streak_freeze_days where user_id = u[1] and used_on = t - 9) <> to_char(t, 'YYYY-MM') then
    raise exception 'FAIL [stock_month not recorded]';
  end if;
  checks := checks + 3;

  -- ── Synchronisation tardive → remboursement ────────────────────────────────
  -- La session hors ligne de T-9 (1 s de plus) arrive : 299 + 1 = 300.
  sid := gen_random_uuid();
  perform set_config('request.jwt.claims', json_build_object('sub', u[1], 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into public.sessions (id, user_id, duration_seconds, started_at, ended_at, timezone)
  values (sid, u[1], 1, ((t - 9) + time '12:00') at time zone 'Europe/Brussels',
          ((t - 9) + time '12:00:01') at time zone 'Europe/Brussels', 'Europe/Brussels');
  -- Envoyée une deuxième fois (file hors ligne rejouée) : même id, ignorée.
  insert into public.sessions (id, user_id, duration_seconds, started_at, ended_at, timezone)
  values (sid, u[1], 1, ((t - 9) + time '12:00') at time zone 'Europe/Brussels',
          ((t - 9) + time '12:00:01') at time zone 'Europe/Brussels', 'Europe/Brussels')
  on conflict (id) do nothing;
  -- Deuxième appareil : une autre session du même jour arrive juste après.
  insert into public.sessions (id, user_id, duration_seconds, started_at, ended_at, timezone)
  values (gen_random_uuid(), u[1], 120, ((t - 9) + time '15:00') at time zone 'Europe/Brussels',
          ((t - 9) + time '15:02') at time zone 'Europe/Brussels', 'Europe/Brussels');
  -- L'étudiant voit son propre historique, et rien d'écrit à la main.
  select count(*) into n from public.streak_freeze_refunds where used_on = t - 9;
  if n <> 1 then raise exception 'FAIL [own refund not readable: %]', n; end if;
  reset role;

  select count(*) into n from public.streak_freeze_refunds where user_id = u[1] and used_on = t - 9;
  if n <> 1 then raise exception 'FAIL [refunds for T-9: %]', n; end if;
  select * into r from public.streak_freeze_refunds where user_id = u[1] and used_on = t - 9;
  if not r.stock_restored or r.studied_seconds <> 300 or r.used_at is null then
    raise exception 'FAIL [refund row: %]', to_jsonb(r);
  end if;
  if exists (select 1 from public.streak_freeze_days where user_id = u[1] and used_on = t - 9) then
    raise exception 'FAIL [refunded freeze still active]';
  end if;
  if (select streak_freezes from public.profiles where id = u[1]) <> 2 then
    raise exception 'FAIL [stock not restored exactly once: %]', (select streak_freezes from public.profiles where id = u[1]);
  end if;
  select * into r from public.study_day_states(u[1], t - 9, t - 9, t);
  if r.state <> 'studied' or r.has_freeze then
    raise exception 'FAIL [refunded day state: %]', to_jsonb(r);
  end if;
  -- Le joker historique, lui, n'a pas bougé.
  if not exists (select 1 from public.streak_freeze_days where user_id = u[1] and used_on = t - 24) then
    raise exception 'FAIL [historical freeze touched]';
  end if;
  checks := checks + 4;

  -- ── Modification d'une session qui fait passer le jour au-dessus du seuil ──
  -- Joker sur T-6 (200 s), puis la session de T-5 (400 s) est déplacée sur T-6.
  perform set_config('request.jwt.claims', json_build_object('sub', u[1], 'role', 'authenticated')::text, true);
  set local role authenticated;
  select * into r from public.redeem_streak_freezes(array[t - 6], t);
  if r.used_now <> 1 or r.remaining_stock <> 1 then raise exception 'FAIL [redeem T-6: %]', to_jsonb(r); end if;
  select id into sid_move from public.sessions where user_id = u[1] and duration_seconds = 400;
  update public.sessions
  set started_at = ((t - 6) + time '18:00') at time zone 'Europe/Brussels',
      ended_at = ((t - 6) + time '18:06:40') at time zone 'Europe/Brussels'
  where id = sid_move;
  reset role;
  if exists (select 1 from public.streak_freeze_days where user_id = u[1] and used_on = t - 6)
     or (select count(*) from public.streak_freeze_refunds where user_id = u[1] and used_on = t - 6) <> 1
     or (select streak_freezes from public.profiles where id = u[1]) <> 2 then
    raise exception 'FAIL [edited session refund]';
  end if;
  checks := checks + 1;

  -- ── Session supprimée APRÈS le remboursement ───────────────────────────────
  -- Comportement actuel (décision produit en attente) : rien n'est repris
  -- automatiquement. Le jour redevient manqué, le joker reste rendu, l'historique
  -- est intact, et l'étudiant peut en reposer un s'il le souhaite.
  perform set_config('request.jwt.claims', json_build_object('sub', u[1], 'role', 'authenticated')::text, true);
  set local role authenticated;
  delete from public.sessions where id = sid_move;
  reset role;
  select * into r from public.study_day_states(u[1], t - 6, t - 6, t);
  if r.state <> 'missed' or (select streak_freezes from public.profiles where id = u[1]) <> 2
     or (select count(*) from public.streak_freeze_refunds where user_id = u[1] and used_on = t - 6) <> 1 then
    raise exception 'FAIL [after delete: %]', to_jsonb(r);
  end if;
  perform set_config('request.jwt.claims', json_build_object('sub', u[1], 'role', 'authenticated')::text, true);
  set local role authenticated;
  select * into r from public.redeem_streak_freezes(array[t - 6], t);
  reset role;
  if r.used_now <> 1 or r.remaining_stock <> 1 then raise exception 'FAIL [re-redeem after delete: %]', to_jsonb(r); end if;
  checks := checks + 2;

  -- ── Joker d'un mois de stock précédent : rendu, stock inchangé ─────────────
  insert into public.streak_freeze_days (user_id, used_on, stock_month) values (u[1], t - 7, '1999-01');
  insert into public.sessions (id, user_id, duration_seconds, started_at, ended_at, timezone)
  values (gen_random_uuid(), u[1], 600, ((t - 7) + time '09:00') at time zone 'Europe/Brussels',
          ((t - 7) + time '09:10') at time zone 'Europe/Brussels', 'Europe/Brussels');
  select * into r from public.streak_freeze_refunds where user_id = u[1] and used_on = t - 7;
  if r.stock_restored or (select streak_freezes from public.profiles where id = u[1]) <> 1 then
    raise exception 'FAIL [previous-month refund: %]', to_jsonb(r);
  end if;
  checks := checks + 1;

  -- ── u2 : hors blocus → pas de joker ────────────────────────────────────────
  insert into public.blocus_periods (user_id, start_date, end_date) values (u[2], t - 30, t - 12);
  insert into public.sessions (id, user_id, duration_seconds, started_at, ended_at, timezone)
  values (gen_random_uuid(), u[2], 600, ((t - 13) + time '10:00') at time zone 'Europe/Brussels',
          ((t - 13) + time '10:10') at time zone 'Europe/Brussels', 'Europe/Brussels');
  perform set_config('request.jwt.claims', json_build_object('sub', u[2], 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    perform public.redeem_streak_freezes(array[t - 3]);
    raise exception 'FAIL [off-blocus day accepted]';
  exception when invalid_parameter_value then
    if sqlerrm !~ 'outside blocus' then raise; end if;
  end;
  -- Dans le blocus et manqué : accepté.
  select * into r from public.redeem_streak_freezes(array[t - 12]);
  if r.used_now <> 1 then raise exception 'FAIL [in-blocus redeem]'; end if;
  reset role;
  checks := checks + 2;

  -- ── u3 : voyage et minuit ──────────────────────────────────────────────────
  -- Profil à Bruxelles, session enregistrée à New York : 23:00 à NY le jour
  -- T-4 = 05:00 à Bruxelles le jour T-3. Elle appartient à T-4 (fuseau de la
  -- session), c'est donc le joker de T-4 qui est rendu, pas celui de T-3.
  perform set_config('request.jwt.claims', json_build_object('sub', u[3], 'role', 'authenticated')::text, true);
  set local role authenticated;
  select * into r from public.redeem_streak_freezes(array[t - 4, t - 3], t);
  if r.used_now <> 2 then raise exception 'FAIL [u3 redeem: %]', to_jsonb(r); end if;
  insert into public.sessions (id, user_id, duration_seconds, started_at, ended_at, timezone)
  values (gen_random_uuid(), u[3], 600, ((t - 4) + time '23:00') at time zone 'America/New_York',
          ((t - 4) + time '23:10') at time zone 'America/New_York', 'America/New_York');
  reset role;
  if not exists (select 1 from public.streak_freeze_refunds where user_id = u[3] and used_on = t - 4)
     or not exists (select 1 from public.streak_freeze_days where user_id = u[3] and used_on = t - 3) then
    raise exception 'FAIL [travel refund picked the wrong day]';
  end if;
  -- Autour de minuit (Bruxelles) : 23:58 → 00:08, soit 2 min sur T-2 et 8 min
  -- sur T-1. Joker sur les deux : seul T-1 (8 min ≥ 5) est rendu.
  insert into public.streak_freeze_days (user_id, used_on, stock_month) values (u[3], t - 2, to_char(t, 'YYYY-MM')), (u[3], t - 1, to_char(t, 'YYYY-MM'));
  insert into public.sessions (id, user_id, duration_seconds, started_at, ended_at, timezone)
  values (gen_random_uuid(), u[3], 600, ((t - 2) + time '23:58') at time zone 'Europe/Brussels',
          ((t - 1) + time '00:08') at time zone 'Europe/Brussels', 'Europe/Brussels');
  if exists (select 1 from public.streak_freeze_refunds where user_id = u[3] and used_on = t - 2)
     or not exists (select 1 from public.streak_freeze_refunds where user_id = u[3] and used_on = t - 1) then
    raise exception 'FAIL [midnight split refund]';
  end if;
  -- L'appareil a un jour d'avance (voyage vers l'est) : « hier » pour lui est
  -- aujourd'hui pour le serveur. Accepté grâce à p_today (±1 jour), pas au-delà.
  perform set_config('request.jwt.claims', json_build_object('sub', u[3], 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    perform public.redeem_streak_freezes(array[t], t + 5);
    raise exception 'FAIL [far p_today accepted]';
  exception when invalid_parameter_value then null;
  end;
  perform set_config('request.jwt.claims', json_build_object('sub', u[1], 'role', 'authenticated')::text, true);
  select * into r from public.redeem_streak_freezes(array[t], t + 1);
  reset role;
  if r.used_now <> 1 then raise exception 'FAIL [device one day ahead: %]', to_jsonb(r); end if;
  checks := checks + 4;

  -- ── Rien de réel touché ────────────────────────────────────────────────────
  if (select count(*) from public.streak_freeze_days where not (user_id = any(u))) <> real_freezes_before
     or exists (select 1 from public.streak_freeze_refunds where not (user_id = any(u))) then
    raise exception 'FAIL [real accounts touched]';
  end if;
  checks := checks + 1;

  raise exception 'STREAK FREEZE TESTS PASSED: % checks (everything rolled back)', checks;
end;
$tests$;
