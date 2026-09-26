-- Classement sur une fenêtre commune (v79), sur la vraie base. Étudiants et
-- université jetables, exception finale : RIEN n'est gardé.
-- Résultat attendu : « LEADERBOARD WINDOW TESTS PASSED ».

create function pg_temp.sess(u uuid, starts timestamptz, secs integer, tz text) returns uuid language plpgsql as $$
declare sid uuid := gen_random_uuid();
begin
  insert into public.sessions (id, user_id, duration_seconds, started_at, ended_at, timezone)
  values (sid, u, secs, starts, starts + make_interval(secs => secs), tz);
  return sid;
end $$;

-- Le classement tel qu'un membre le voit : (id, secondes, rang) sérialisé.
create function pg_temp.board(viewer uuid, period text, scope text, uni text default null) returns jsonb language plpgsql as $$
declare res jsonb;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', viewer, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select jsonb_agg(jsonb_build_object('u', user_id, 's', total_seconds, 'k', streak_days, 'start', period_start) order by ord)
  into res
  from (select b.*, row_number() over () ord from public.get_leaderboard_v2(period, 'time', scope, uni, null, null) b) x;
  reset role;
  return res;
end $$;

do $tests$
declare
  suffix constant text := substr(md5(clock_timestamp()::text), 1, 8);
  u uuid[] := array(select gen_random_uuid() from generate_series(1, 5));
  bxl_day timestamptz := (select starts_at from public.leaderboard_window('day', 'Europe/Brussels'));
  bxl_week timestamptz := (select starts_at from public.leaderboard_window('week', 'Europe/Brussels'));
  tokyo_day timestamptz := (select starts_at from public.leaderboard_window('day', 'Asia/Tokyo'));
  a jsonb; b jsonb; c jsonb;
  r record;
  checks integer := 0;
  i integer;
begin
  -- ── Fenêtres ─────────────────────────────────────────────────────────────
  select * into r from public.leaderboard_window('day', 'Europe/Brussels');
  if r.starts_at <> ((now() at time zone 'Europe/Brussels')::date)::timestamp at time zone 'Europe/Brussels' or r.period_days <> 1 then
    raise exception 'FAIL [day window %]', to_jsonb(r);
  end if;
  select * into r from public.leaderboard_window('week', 'Europe/Brussels');
  if extract(isodow from r.start_date) <> 1 or r.period_days <> 7 or (r.starts_at at time zone 'Europe/Brussels')::time <> time '00:00' then
    raise exception 'FAIL [week window %]', to_jsonb(r);
  end if;
  select * into r from public.leaderboard_window('month', 'Europe/Brussels');
  if extract(day from r.start_date) <> 1 or r.period_days not between 28 and 31 then
    raise exception 'FAIL [month window %]', to_jsonb(r);
  end if;
  -- Bruxelles et New York au même instant : deux minuits différents ; Tokyo aussi.
  if (select starts_at from public.leaderboard_window('day', 'America/New_York')) = bxl_day
     or tokyo_day = bxl_day then
    raise exception 'FAIL [timezones share a midnight]';
  end if;
  if public.leaderboard_timezone(null) <> 'Europe/Brussels'
     or public.leaderboard_timezone('Université Libre de Bruxelles') <> 'Europe/Brussels'
     or public.leaderboard_timezone('University of Central Florida') <> 'America/New_York'
     or public.leaderboard_timezone('Université inconnue') <> 'Europe/Brussels' then
    raise exception 'FAIL [leaderboard_timezone]';
  end if;
  checks := checks + 4;

  -- ── Cinq amis mutuels (u1..u4) + u5 sans session ─────────────────────────
  insert into auth.users (id, email, created_at, raw_user_meta_data)
  select u[i], 'lb-' || suffix || '-' || i || '@example.invalid', now() - interval '60 days',
         jsonb_build_object('pseudo', 'lb' || suffix || i, 'study_year', 'BAC 1')
  from generate_series(1, 5) i;
  update public.profiles set timezone = 'Europe/Brussels', university = 'LB Test ' || suffix where id = any(u);
  update public.profiles set timezone = 'America/New_York' where id = u[2];   -- en voyage à New York
  -- Le limiteur d'insertions exige un auteur : chaque lien est créé par son demandeur.
  for i in 1..4 loop
    perform set_config('request.jwt.claims', json_build_object('sub', u[i], 'role', 'authenticated')::text, true);
    insert into public.friendships (requester, addressee, status)
    select u[i], u[j], 'accepted' from generate_series(i + 1, 5) j;
  end loop;
  perform set_config('request.jwt.claims', '', true);

  -- u1 (Bruxelles) : 40 min ce matin (heure de Bruxelles), si la journée a commencé.
  if now() > bxl_day + interval '2 hours' then
    perform pg_temp.sess(u[1], bxl_day + interval '1 hour', 2400, 'Europe/Brussels');
  end if;
  -- u2 (à New York) : 23:30 → 00:30 à Bruxelles = 30 min pour aujourd'hui,
  -- enregistrée depuis New York (17:30 là-bas).
  if now() > bxl_day + interval '31 minutes' then
    perform pg_temp.sess(u[2], bxl_day - interval '30 minutes', 3600, 'America/New_York');
  end if;
  -- u3 et u4 : égalité parfaite (20 min chacun), ordre stable.
  if now() > bxl_day + interval '3 hours' then
    perform pg_temp.sess(u[3], bxl_day + interval '2 hours', 1200, 'Europe/Brussels');
    perform pg_temp.sess(u[4], bxl_day + interval '2 hours', 1200, 'Asia/Tokyo');
  end if;
  -- Semaine : u3 a aussi dimanche 23:30 → lundi 00:30 (30 min comptées).
  if now() > bxl_week + interval '31 minutes' and bxl_week < bxl_day then
    perform pg_temp.sess(u[3], bxl_week - interval '30 minutes', 3600, 'Europe/Brussels');
  end if;

  a := pg_temp.board(u[1], 'day', 'friends');
  b := pg_temp.board(u[2], 'day', 'friends');
  -- Deux membres, même classement : mêmes lignes, mêmes secondes, même ordre, même début.
  if a is distinct from b then raise exception 'FAIL [two viewers differ: % vs %]', a, b; end if;
  if (select count(distinct x->>'start') from jsonb_array_elements(a) x) <> 1
     or (a->0->>'start')::timestamptz <> bxl_day then
    raise exception 'FAIL [not the Brussels day window: %]', a;
  end if;
  -- Session traversant minuit : seule la partie après minuit compte.
  if now() > bxl_day + interval '31 minutes'
     and (select (x->>'s')::int from jsonb_array_elements(a) x where x->>'u' = u[2]::text) <> 1800 then
    raise exception 'FAIL [midnight clip: %]', a;
  end if;
  -- Utilisateur sans session : présent à 0 chez les amis.
  if (select (x->>'s')::int from jsonb_array_elements(a) x where x->>'u' = u[5]::text) <> 0 then
    raise exception 'FAIL [no-session friend]';
  end if;
  -- Égalité : même rang de départ, ordre identique pour tous (pseudo, puis id).
  if now() > bxl_day + interval '3 hours'
     and (select array_agg(x->>'u' order by ord) from jsonb_array_elements(a) with ordinality t(x, ord) where x->>'u' in (u[3]::text, u[4]::text))
         <> array[u[3]::text, u[4]::text] then
    raise exception 'FAIL [tie order]';
  end if;
  checks := checks + 5;

  -- Le téléphone de u2 change de fuseau (profil) : rien ne bouge.
  update public.profiles set timezone = 'Asia/Tokyo' where id = u[2];
  c := pg_temp.board(u[2], 'day', 'friends');
  if c is distinct from a then raise exception 'FAIL [device timezone moved the board]'; end if;
  checks := checks + 1;

  -- Semaine : lundi 00:00 Bruxelles, la session dimanche → lundi ne compte que pour 30 min.
  a := pg_temp.board(u[1], 'week', 'friends');
  b := pg_temp.board(u[3], 'week', 'friends');
  if a is distinct from b or (a->0->>'start')::timestamptz <> bxl_week then
    raise exception 'FAIL [week board]';
  end if;
  if now() > bxl_week + interval '31 minutes' and bxl_week < bxl_day and now() > bxl_day + interval '3 hours'
     and (select (x->>'s')::int from jsonb_array_elements(a) x where x->>'u' = u[3]::text) <> 1200 + 1800 then
    raise exception 'FAIL [week clip: %]', a;
  end if;
  checks := checks + 2;

  -- Série affichée = série officielle.
  if exists (select 1 from jsonb_array_elements(a) x
             where (x->>'k')::int <> (select current_streak from public.study_streaks((x->>'u')::uuid))) then
    raise exception 'FAIL [streak is not the official one]';
  end if;
  checks := checks + 1;

  -- ── Université à Tokyo : sa propre fenêtre ───────────────────────────────
  insert into public.university_communities (id, full_name, timezone) values ('lb-test-' || suffix, 'LB Test ' || suffix, 'Asia/Tokyo');
  a := pg_temp.board(u[1], 'day', 'all', 'LB Test ' || suffix);
  if a is not null and (a->0->>'start')::timestamptz <> tokyo_day then
    raise exception 'FAIL [university timezone not used: %]', a;
  end if;
  if public.leaderboard_timezone('LB Test ' || suffix) <> 'Asia/Tokyo' then raise exception 'FAIL [uni tz lookup]'; end if;
  checks := checks + 1;

  -- ── Mon rang (Stats) : même fenêtre, même découpage ──────────────────────
  perform set_config('request.jwt.claims', json_build_object('sub', u[2], 'role', 'authenticated')::text, true);
  set local role authenticated;
  select * into r from public.get_my_study_rank('day');
  reset role;
  if now() > bxl_day + interval '31 minutes' and r.my_secs <> 1800 then raise exception 'FAIL [my rank clip: %]', to_jsonb(r); end if;
  checks := checks + 1;

  raise exception 'LEADERBOARD WINDOW TESTS PASSED: % checks (everything rolled back)', checks;
end;
$tests$;
