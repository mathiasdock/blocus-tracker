-- Réactivation d'un joker rendu (v75), sur la vraie base. Étudiants jetables,
-- exception finale : RIEN n'est gardé. À lancer après v75, ou dans le MÊME
-- appel execute_sql juste après son SQL.
-- Résultat attendu : « STREAK FREEZE REACTIVATION TESTS PASSED ».
--
-- Le contrôle s'exécute à la validation de la transaction (déclencheur
-- différé) ; un test tient dans UNE transaction, donc `flush()` force ce
-- passage après chaque opération, comme le ferait la fin d'une requête de l'app.

create function pg_temp.flush() returns void language plpgsql as $$
begin
  set constraints all immediate;
  set constraints all deferred;
end $$;

create function pg_temp.sess(u uuid, d date, at time, secs integer) returns uuid language plpgsql as $$
declare sid uuid := gen_random_uuid();
begin
  insert into public.sessions (id, user_id, duration_seconds, started_at, ended_at, timezone)
  values (sid, u, secs, (d + at) at time zone 'Europe/Brussels',
          (d + at) at time zone 'Europe/Brussels' + make_interval(secs => secs), 'Europe/Brussels');
  perform pg_temp.flush();
  return sid;
end $$;

create function pg_temp.redeem(u uuid, d date) returns integer language plpgsql as $$
declare r record;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select * into r from public.redeem_streak_freezes(array[d], (now() at time zone 'Europe/Brussels')::date);
  reset role;
  perform set_config('request.jwt.claims', '', true);
  return r.used_now;
end $$;

create function pg_temp.stock(u uuid) returns integer language sql as $$
  select case when p.streak_freeze_month = to_char((now() at time zone 'Europe/Brussels')::date, 'YYYY-MM')
              then p.streak_freezes else 2 end
  from public.profiles p where p.id = u
$$;

create function pg_temp.frozen(u uuid, d date) returns boolean language sql as $$
  select exists (select 1 from public.streak_freeze_days f where f.user_id = u and f.used_on = d)
$$;

create function pg_temp.state(u uuid, d date) returns text language sql as $$
  select s.state from public.study_day_states(u, d, d, (now() at time zone 'Europe/Brussels')::date) s
$$;

do $tests$
declare
  suffix constant text := substr(md5(clock_timestamp()::text), 1, 8);
  u uuid[] := array(select gen_random_uuid() from generate_series(1, 9));
  t constant date := (now() at time zone 'Europe/Brussels')::date;
  m constant text := to_char((now() at time zone 'Europe/Brussels')::date, 'YYYY-MM');
  checks integer := 0;
  real_before text;
  s1 uuid; s2 uuid; s3 uuid;
  r record;
  used_at_before timestamptz;
begin
  select md5(coalesce(string_agg(user_id || used_on::text, ',' order by user_id, used_on), '')) into real_before
  from public.streak_freeze_days;

  if has_function_privilege('authenticated', 'public.reconcile_streak_freeze_day(uuid, date)', 'execute')
     or exists (select 1 from pg_proc where proname in ('refund_streak_freeze_for_day', 'refund_streak_freeze_after_day_part'))
     or not exists (select 1 from pg_trigger where tgname = 'b10_reconcile_streak_freeze' and tgdeferrable and tginitdeferred) then
    raise exception 'FAIL [privileges / trigger]';
  end if;
  checks := checks + 1;

  insert into auth.users (id, email, created_at, raw_user_meta_data)
  select u[i], 'freeze-react-' || suffix || '-' || i || '@example.invalid', now() - interval '120 days',
         jsonb_build_object('pseudo', 'frx' || suffix || i, 'study_year', 'BAC 1')
  from generate_series(1, 9) i;
  update public.profiles set timezone = 'Europe/Brussels' where id = any(u);
  update public.study_day_rules set new_rules_from = t - 20;
  perform set_config('app.gamification_internal', 'on', true);

  -- ── u1 : remboursement AVEC crédit, puis suppression ───────────────────────
  if pg_temp.redeem(u[1], t - 9) <> 1 or pg_temp.stock(u[1]) <> 1 then raise exception 'FAIL [u1 redeem]'; end if;
  select created_at into used_at_before from public.streak_freeze_days where user_id = u[1] and used_on = t - 9;
  s1 := pg_temp.sess(u[1], t - 9, '10:00', 300);
  select * into r from public.streak_freeze_refunds where user_id = u[1] and used_on = t - 9;
  if pg_temp.frozen(u[1], t - 9) or not r.stock_restored or pg_temp.stock(u[1]) <> 2 then
    raise exception 'FAIL [u1 refund credited: %]', to_jsonb(r);
  end if;
  delete from public.sessions where id = s1;
  perform pg_temp.flush();
  select * into r from public.streak_freeze_refunds where user_id = u[1] and used_on = t - 9;
  if not pg_temp.frozen(u[1], t - 9) or r.reactivated_at is null or not r.reactivation_debited
     or pg_temp.stock(u[1]) <> 1 or pg_temp.state(u[1], t - 9) <> 'neutral'
     or (select created_at from public.streak_freeze_days where user_id = u[1] and used_on = t - 9) <> used_at_before then
    raise exception 'FAIL [u1 reactivated after delete: %]', to_jsonb(r);
  end if;
  -- Répété (même contrôle relancé, suppression rejouée) : rien ne bouge.
  perform public.reconcile_streak_freeze_day(u[1], t - 9);
  perform public.reconcile_streak_freeze_day(u[1], t - 9);
  delete from public.sessions where id = s1;
  perform pg_temp.flush();
  if pg_temp.stock(u[1]) <> 1 or (select count(*) from public.streak_freeze_refunds where user_id = u[1]) <> 1
     or (select count(*) from public.streak_freeze_days where user_id = u[1]) <> 1 then
    raise exception 'FAIL [u1 idempotence]';
  end if;
  checks := checks + 3;

  -- Cycle complet : la même journée re-étudiée puis re-vidée → une 2e ligne.
  s1 := pg_temp.sess(u[1], t - 9, '11:00', 400);
  delete from public.sessions where id = s1;
  perform pg_temp.flush();
  if (select count(*) from public.streak_freeze_refunds where user_id = u[1]) <> 2
     or (select count(*) from public.streak_freeze_refunds where user_id = u[1] and reactivated_at is not null) <> 2
     or not pg_temp.frozen(u[1], t - 9) or pg_temp.stock(u[1]) <> 1 then
    raise exception 'FAIL [u1 second cycle]';
  end if;
  checks := checks + 1;

  -- ── u1 : réduction de durée sous 5 min (comme l'app : la fin reste) ───────
  if pg_temp.redeem(u[1], t - 8) <> 1 or pg_temp.stock(u[1]) <> 0 then raise exception 'FAIL [u1 redeem 2]'; end if;
  s2 := pg_temp.sess(u[1], t - 8, '10:00', 400);
  if pg_temp.frozen(u[1], t - 8) or pg_temp.stock(u[1]) <> 1 then raise exception 'FAIL [u1 refund 2]'; end if;
  update public.sessions set duration_seconds = 120, started_at = ended_at - interval '120 seconds' where id = s2;
  perform pg_temp.flush();
  if not pg_temp.frozen(u[1], t - 8) or pg_temp.stock(u[1]) <> 0 or pg_temp.state(u[1], t - 8) <> 'neutral' then
    raise exception 'FAIL [u1 reactivated after reduction]';
  end if;
  checks := checks + 1;

  -- ── u2 : déplacement de date ; plusieurs sessions le même jour ────────────
  perform pg_temp.redeem(u[2], t - 7);
  s1 := pg_temp.sess(u[2], t - 7, '10:00', 360);
  if pg_temp.frozen(u[2], t - 7) or pg_temp.stock(u[2]) <> 2 then raise exception 'FAIL [u2 refund]'; end if;
  update public.sessions
  set started_at = ((t - 3) + time '10:00') at time zone 'Europe/Brussels',
      ended_at = ((t - 3) + time '10:06') at time zone 'Europe/Brussels'
  where id = s1;
  perform pg_temp.flush();
  if not pg_temp.frozen(u[2], t - 7) or pg_temp.stock(u[2]) <> 1 or pg_temp.state(u[2], t - 3) <> 'studied' then
    raise exception 'FAIL [u2 reactivated after move]';
  end if;
  -- Trois sessions de 200 s : le joker n'est repris que quand le TOTAL passe sous 300 s.
  perform pg_temp.redeem(u[2], t - 6);
  s1 := pg_temp.sess(u[2], t - 6, '09:00', 200);
  s2 := pg_temp.sess(u[2], t - 6, '12:00', 200);
  s3 := pg_temp.sess(u[2], t - 6, '15:00', 200);
  if pg_temp.frozen(u[2], t - 6) or pg_temp.stock(u[2]) <> 1 then raise exception 'FAIL [u2 multi refund]'; end if;
  delete from public.sessions where id = s1;
  perform pg_temp.flush();
  if pg_temp.frozen(u[2], t - 6) or pg_temp.stock(u[2]) <> 1 then raise exception 'FAIL [u2 400 s still studied]'; end if;
  delete from public.sessions where id = s2;
  perform pg_temp.flush();
  if not pg_temp.frozen(u[2], t - 6) or pg_temp.stock(u[2]) <> 0 then raise exception 'FAIL [u2 200 s reactivated]'; end if;
  checks := checks + 3;

  -- ── u3 : session à cheval sur minuit, raccourcie ──────────────────────────
  -- 23:54 → 00:06 : 6 min sur T-6, 6 min sur T-5 (joker). Raccourcie à 4 min
  -- (début 00:02) : T-5 n'a plus que 4 min → joker réactivé ; T-6 intact.
  perform pg_temp.redeem(u[3], t - 5);
  insert into public.sessions (id, user_id, duration_seconds, started_at, ended_at, timezone)
  values (gen_random_uuid(), u[3], 720, ((t - 6) + time '23:54') at time zone 'Europe/Brussels',
          ((t - 5) + time '00:06') at time zone 'Europe/Brussels', 'Europe/Brussels')
  returning id into s1;
  perform pg_temp.flush();
  if pg_temp.frozen(u[3], t - 5) then raise exception 'FAIL [u3 midnight refund]'; end if;
  update public.sessions set duration_seconds = 240, started_at = ended_at - interval '240 seconds' where id = s1;
  perform pg_temp.flush();
  if not pg_temp.frozen(u[3], t - 5) or pg_temp.stock(u[3]) <> 1 or pg_temp.frozen(u[3], t - 6) then
    raise exception 'FAIL [u3 midnight edit]';
  end if;
  checks := checks + 1;

  -- ── u4 : remboursement SANS crédit (stock déjà plein ; mois précédent) ────
  update public.profiles set streak_freezes = 2, streak_freeze_month = m where id = u[4];
  insert into public.streak_freeze_days (user_id, used_on, stock_month) values (u[4], t - 4, m), (u[4], t - 3, '1999-01');
  s1 := pg_temp.sess(u[4], t - 4, '10:00', 300);
  s2 := pg_temp.sess(u[4], t - 3, '10:00', 300);
  if exists (select 1 from public.streak_freeze_refunds where user_id = u[4] and stock_restored) or pg_temp.stock(u[4]) <> 2 then
    raise exception 'FAIL [u4 refunds must not credit]';
  end if;
  delete from public.sessions where id in (s1, s2);
  perform pg_temp.flush();
  if not pg_temp.frozen(u[4], t - 4) or not pg_temp.frozen(u[4], t - 3) or pg_temp.stock(u[4]) <> 2
     or exists (select 1 from public.streak_freeze_refunds where user_id = u[4] and (reactivation_debited or reactivated_at is null)) then
    raise exception 'FAIL [u4 free reactivation]';
  end if;
  checks := checks + 2;

  -- ── u5 : l'exploit, stock de départ 2 : A puis B, le crédit paie A ────────
  perform pg_temp.redeem(u[5], t - 9);                        -- A : 2 → 1
  s1 := pg_temp.sess(u[5], t - 9, '10:00', 300);              -- rendu : 1 → 2
  perform pg_temp.redeem(u[5], t - 8);                        -- B : 2 → 1
  delete from public.sessions where id = s1;                  -- A repris : 1 → 0
  perform pg_temp.flush();
  if not pg_temp.frozen(u[5], t - 8) or not pg_temp.frozen(u[5], t - 9) or pg_temp.stock(u[5]) <> 0 then
    raise exception 'FAIL [u5 A paid, B kept]';
  end if;
  -- ── u6 : l'exploit, stock de départ 1 : crédit dépensé sur B → A perdu ────
  update public.profiles set streak_freezes = 1, streak_freeze_month = m where id = u[6];
  perform pg_temp.redeem(u[6], t - 9);                        -- A : 1 → 0
  s1 := pg_temp.sess(u[6], t - 9, '10:00', 300);              -- rendu : 0 → 1
  perform pg_temp.redeem(u[6], t - 8);                        -- B : 1 → 0
  delete from public.sessions where id = s1;                  -- plus rien : A perdu
  perform pg_temp.flush();
  select * into r from public.streak_freeze_refunds where user_id = u[6];
  if not pg_temp.frozen(u[6], t - 8) or pg_temp.frozen(u[6], t - 9) or pg_temp.stock(u[6]) <> 0
     or (select streak_freezes from public.profiles where id = u[6]) < 0
     or r.forfeited_at is null or r.reactivated_at is not null or pg_temp.state(u[6], t - 9) <> 'missed' then
    raise exception 'FAIL [u6 no free protection: %]', to_jsonb(r);
  end if;
  -- Perdu = clos : rejouer ne le réactive pas.
  perform public.reconcile_streak_freeze_day(u[6], t - 9);
  if pg_temp.frozen(u[6], t - 9) then raise exception 'FAIL [u6 forfeited reopened]'; end if;
  checks := checks + 3;

  -- ── u7 : changement de mois entre le remboursement et la réactivation ─────
  perform pg_temp.redeem(u[7], t - 9);                        -- 2 → 1
  s1 := pg_temp.sess(u[7], t - 9, '10:00', 300);              -- crédité : 1 → 2
  -- Le mois se termine : l'ancien cycle est clos, le nouveau n'est pas rechargé
  -- tant que rien ne le lit (recharge paresseuse). Stock « ancien » vidé.
  update public.profiles set streak_freezes = 0, streak_freeze_month = '1999-01' where id = u[7];
  update public.streak_freeze_refunds set stock_month = '1999-01' where user_id = u[7];
  delete from public.sessions where id = s1;
  perform pg_temp.flush();
  if not pg_temp.frozen(u[7], t - 9) or pg_temp.stock(u[7]) <> 1
     or (select streak_freeze_month from public.profiles where id = u[7]) <> m then
    raise exception 'FAIL [u7 month change: stock %]', pg_temp.stock(u[7]);
  end if;
  checks := checks + 1;

  -- ── u8 : ancien joker (avant la bascule), plus de 31 jours ────────────────
  insert into public.streak_freeze_days (user_id, used_on, created_at) values (u[8], t - 40, now() - interval '39 days');
  s1 := pg_temp.sess(u[8], t - 40, '10:00', 1);               -- 1 s suffit avant la bascule
  if pg_temp.frozen(u[8], t - 40) then raise exception 'FAIL [u8 legacy refund]'; end if;
  delete from public.sessions where id = s1;
  perform pg_temp.flush();
  select * into r from public.study_day_states(u[8], t - 40, t - 40, t);
  if not r.has_freeze or r.state <> 'neutral' or not r.increments_streak then
    raise exception 'FAIL [u8 legacy joker must stay +1: %]', to_jsonb(r);
  end if;
  -- Une NOUVELLE pose à 40 jours reste refusée.
  begin
    perform pg_temp.redeem(u[8], t - 39);
    raise exception 'FAIL [u8 new redeem beyond 31 days accepted]';
  exception when invalid_parameter_value then reset role;
  end;
  checks := checks + 2;

  -- ── u9 : série et meilleure série = les valeurs attendues ─────────────────
  -- Après la bascule, joker réactivé = neutre +0 : 10, (11 joker), 12.
  s1 := pg_temp.sess(u[9], t - 12, '10:00', 600);
  perform pg_temp.redeem(u[9], t - 11);
  s2 := pg_temp.sess(u[9], t - 11, '10:00', 600);
  s3 := pg_temp.sess(u[9], t - 10, '10:00', 600);
  select * into r from public.study_streaks(u[9], t - 10);
  if r.current_streak <> 3 then raise exception 'FAIL [u9 studied: %]', to_jsonb(r); end if;
  delete from public.sessions where id = s2;
  perform pg_temp.flush();
  select * into r from public.study_streaks(u[9], t - 10);
  if r.current_streak <> 2 or r.best_streak <> 2 or r.studied_days <> 2 or not pg_temp.frozen(u[9], t - 11) then
    raise exception 'FAIL [u9 reactivated +0: %]', to_jsonb(r);
  end if;
  checks := checks + 2;

  -- ── Rien de réel touché ────────────────────────────────────────────────────
  if (select md5(coalesce(string_agg(user_id || used_on::text, ',' order by user_id, used_on), ''))
      from public.streak_freeze_days where not (user_id = any(u))) <> real_before
     or exists (select 1 from public.streak_freeze_refunds where not (user_id = any(u))) then
    raise exception 'FAIL [real accounts touched]';
  end if;
  checks := checks + 1;

  raise exception 'STREAK FREEZE REACTIVATION TESTS PASSED: % checks (everything rolled back)', checks;
end;
$tests$;
