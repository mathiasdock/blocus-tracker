-- Portions quotidiennes des sessions (v65), sur la vraie base. Crée des
-- étudiants jetables, joue chaque rôle comme l'app, puis lève une exception :
-- RIEN n'est gardé.
--
-- À lancer après v65, ou dans le MÊME appel execute_sql juste après son SQL.
-- Résultat attendu : « SESSION DAY PARTS TESTS PASSED ».
--
-- Les cas limites de répartition sont EXACTEMENT ceux de
-- tests/fixtures/session-day-parts-cases.json (le bloc JSON ci-dessous en est
-- une copie conforme, vérifiée par tests/session-day-parts.test.mjs) : la même
-- liste valide la règle SQL ici et son miroir JavaScript (mode démo) là-bas.

do $tests$
declare
  fixture constant jsonb := '{"parts":[{"name":"14:00-15:30 Bruxelles","timezone":"Europe/Brussels","started_at":"2026-09-24T12:00:00Z","ended_at":"2026-09-24T13:30:00Z","duration_seconds":5400,"expected":[{"local_date":"2026-09-24","seconds":5400}]},{"name":"23:30-00:30 Bruxelles","timezone":"Europe/Brussels","started_at":"2026-09-24T21:30:00Z","ended_at":"2026-09-24T22:30:00Z","duration_seconds":3600,"expected":[{"local_date":"2026-09-24","seconds":1800},{"local_date":"2026-09-25","seconds":1800}]},{"name":"23:30-01:30 Bruxelles, nuit du passage à l''heure d''hiver (25 oct)","timezone":"Europe/Brussels","started_at":"2026-10-24T21:30:00Z","ended_at":"2026-10-24T23:30:00Z","duration_seconds":7200,"expected":[{"local_date":"2026-10-24","seconds":1800},{"local_date":"2026-10-25","seconds":5400}]},{"name":"23:30-03:30 Bruxelles, traverse le recul d''une heure (5 h réelles)","timezone":"Europe/Brussels","started_at":"2026-10-24T21:30:00Z","ended_at":"2026-10-25T02:30:00Z","duration_seconds":18000,"expected":[{"local_date":"2026-10-24","seconds":1800},{"local_date":"2026-10-25","seconds":16200}]},{"name":"23:30-01:30 (second 01:30) New York, nuit du 1er novembre","timezone":"America/New_York","started_at":"2026-11-01T03:30:00Z","ended_at":"2026-11-01T06:30:00Z","duration_seconds":10800,"expected":[{"local_date":"2026-10-31","seconds":1800},{"local_date":"2026-11-01","seconds":9000}]},{"name":"23:30-03:30 New York, nuit du passage à l''heure d''été (8 mars)","timezone":"America/New_York","started_at":"2026-03-08T04:30:00Z","ended_at":"2026-03-08T07:30:00Z","duration_seconds":10800,"expected":[{"local_date":"2026-03-07","seconds":1800},{"local_date":"2026-03-08","seconds":9000}]},{"name":"Santiago, minuit qui n''existe pas (6 sept)","timezone":"America/Santiago","started_at":"2026-09-06T03:30:00Z","ended_at":"2026-09-06T04:30:00Z","duration_seconds":3600,"expected":[{"local_date":"2026-09-05","seconds":1800},{"local_date":"2026-09-06","seconds":1800}]},{"name":"Santiago, fin de l''heure d''été (avril)","timezone":"America/Santiago","started_at":"2026-04-05T02:30:00Z","ended_at":"2026-04-05T05:30:00Z","duration_seconds":10800,"expected":[{"local_date":"2026-04-04","seconds":5400},{"local_date":"2026-04-05","seconds":5400}]},{"name":"Démarrée à New York 22:30-23:45, synchronisée plus tard en Belgique","timezone":"America/New_York","started_at":"2026-09-25T02:30:00Z","ended_at":"2026-09-25T03:45:00Z","duration_seconds":4500,"expected":[{"local_date":"2026-09-24","seconds":4500}]},{"name":"Chrono de groupe : intervalle 2 h, 1 h 30 étudiée","timezone":"Europe/Brussels","started_at":"2026-09-24T21:00:00Z","ended_at":"2026-09-24T23:00:00Z","duration_seconds":5400,"expected":[{"local_date":"2026-09-24","seconds":2700},{"local_date":"2026-09-25","seconds":2700}]},{"name":"Arrondi : 20 s réparties sur 23 s d''intervalle","timezone":"Europe/Brussels","started_at":"2026-09-24T21:59:50Z","ended_at":"2026-09-24T22:00:13Z","duration_seconds":20,"expected":[{"local_date":"2026-09-24","seconds":8},{"local_date":"2026-09-25","seconds":12}]},{"name":"Intervalle nul","timezone":"Europe/Brussels","started_at":"2026-09-24T21:59:59Z","ended_at":"2026-09-24T21:59:59Z","duration_seconds":5,"expected":[{"local_date":"2026-09-24","seconds":5}]},{"name":"Finit pile à minuit","timezone":"Europe/Brussels","started_at":"2026-09-24T21:00:00Z","ended_at":"2026-09-24T22:00:00Z","duration_seconds":3600,"expected":[{"local_date":"2026-09-24","seconds":3600}]},{"name":"Commence pile à minuit","timezone":"Europe/Brussels","started_at":"2026-09-24T22:00:00Z","ended_at":"2026-09-24T23:00:00Z","duration_seconds":3600,"expected":[{"local_date":"2026-09-25","seconds":3600}]},{"name":"Kolkata (+05:30) 23:45-00:15","timezone":"Asia/Kolkata","started_at":"2026-09-24T18:15:00Z","ended_at":"2026-09-24T18:45:00Z","duration_seconds":1800,"expected":[{"local_date":"2026-09-24","seconds":900},{"local_date":"2026-09-25","seconds":900}]},{"name":"Kiritimati (+14) 23:40-00:20","timezone":"Pacific/Kiritimati","started_at":"2026-09-24T09:40:00Z","ended_at":"2026-09-24T10:20:00Z","duration_seconds":2400,"expected":[{"local_date":"2026-09-24","seconds":1200},{"local_date":"2026-09-25","seconds":1200}]},{"name":"Pago Pago (-11) 23:40-00:20","timezone":"Pacific/Pago_Pago","started_at":"2026-09-25T10:40:00Z","ended_at":"2026-09-25T11:20:00Z","duration_seconds":2400,"expected":[{"local_date":"2026-09-24","seconds":1200},{"local_date":"2026-09-25","seconds":1200}]},{"name":"UTC 23:30-00:30","timezone":"UTC","started_at":"2026-09-24T23:30:00Z","ended_at":"2026-09-25T00:30:00Z","duration_seconds":3600,"expected":[{"local_date":"2026-09-24","seconds":1800},{"local_date":"2026-09-25","seconds":1800}]},{"name":"Intervalle plus court que la durée (tolérance 5 min)","timezone":"Europe/Brussels","started_at":"2026-09-24T21:50:00Z","ended_at":"2026-09-24T22:10:00Z","duration_seconds":1400,"expected":[{"local_date":"2026-09-24","seconds":700},{"local_date":"2026-09-25","seconds":700}]},{"name":"Intervalle de 27 h sur trois jours, 1 h étudiée","timezone":"Europe/Brussels","started_at":"2026-09-23T20:00:00Z","ended_at":"2026-09-24T23:00:00Z","duration_seconds":3600,"expected":[{"local_date":"2026-09-23","seconds":266},{"local_date":"2026-09-24","seconds":3200},{"local_date":"2026-09-25","seconds":134}]},{"name":"Millisecondes (horodatage de l''app)","timezone":"Europe/Brussels","started_at":"2026-09-24T21:40:12.345Z","ended_at":"2026-09-24T22:20:12.345Z","duration_seconds":2400,"expected":[{"local_date":"2026-09-24","seconds":1187},{"local_date":"2026-09-25","seconds":1213}]}],"timezones":[{"timezone":"Europe/Brussels","valid":true},{"timezone":"America/New_York","valid":true},{"timezone":"America/Argentina/Buenos_Aires","valid":true},{"timezone":"America/Port-au-Prince","valid":true},{"timezone":"Asia/Calcutta","valid":true},{"timezone":"Etc/GMT+5","valid":true},{"timezone":"UTC","valid":true},{"timezone":"EST","valid":false},{"timezone":"EST5EDT","valid":false},{"timezone":"+02","valid":false},{"timezone":"Mars/Olympus_Mons","valid":false},{"timezone":"","valid":false},{"timezone":"Europe/Brussels; drop table sessions","valid":false}]}';
  suffix constant text := substr(md5(clock_timestamp()::text), 1, 8);
  u uuid[] := array(select gen_random_uuid() from generate_series(1, 4));
  -- u[1] moi (profil Bruxelles, appareil New York) · u[2] ami · u[3] inconnu · u[4] admin
  checks integer := 0;
  c jsonb;
  got jsonb;
  n integer;
  v_after text[];
  s_ny uuid := gen_random_uuid();
  s_missing uuid := gen_random_uuid();
  s_invalid uuid := gen_random_uuid();
  s_forged uuid := gen_random_uuid();
  s_offline uuid := gen_random_uuid();
  s_group uuid := gen_random_uuid();
  s_legacy uuid := gen_random_uuid();
  v_tz text;
  history_before integer;
begin
  -- ── Ordre des déclencheurs AFTER ───────────────────────────────────────────
  select array_agg(t.tgname::text order by t.tgname::text) into v_after
  from pg_trigger t
  where t.tgrelid = 'public.sessions'::regclass and not t.tgisinternal and (t.tgtype & 2) = 0;
  if array_position(v_after, 'a10_sync_session_day_parts') is null
     or array_position(v_after, 'a10_sync_session_day_parts') > array_position(v_after, 'refresh_gamification_sessions')
     or array_position(v_after, 'a10_sync_session_day_parts') > array_position(v_after, 'session_activity_after_insert') then
    raise exception 'FAIL [AFTER trigger order: %]', v_after;
  end if;
  if not exists (
    select 1 from pg_trigger t
    where t.tgrelid = 'public.sessions'::regclass and t.tgname = 'a01_set_session_timezone' and (t.tgtype & 2) = 2
  ) or 'a01_set_session_timezone' < 'a00_block_suspended_actor' then
    raise exception 'FAIL [a01_set_session_timezone must be a BEFORE trigger after a00]';
  end if;
  checks := checks + 2;

  -- ── Parité : règle SQL sur les cas partagés ────────────────────────────────
  for c in select * from jsonb_array_elements(fixture->'parts') loop
    select coalesce(jsonb_agg(jsonb_build_object('local_date', p.local_date::text, 'seconds', p.seconds) order by p.local_date), '[]'::jsonb)
    into got
    from public.compute_session_day_parts(
      (c->>'started_at')::timestamptz, (c->>'ended_at')::timestamptz,
      (c->>'duration_seconds')::int, c->>'timezone') p;
    if got <> c->'expected' then
      raise exception 'FAIL [parity "%": got % expected %]', c->>'name', got, c->'expected';
    end if;
    checks := checks + 1;
  end loop;
  for c in select * from jsonb_array_elements(fixture->'timezones') loop
    if public.is_valid_session_timezone(c->>'timezone') <> (c->>'valid')::boolean then
      raise exception 'FAIL [timezone "%" valid should be %]', c->>'timezone', c->>'valid';
    end if;
    checks := checks + 1;
  end loop;

  select count(*) into history_before from public.sessions where timezone is null;

  -- ── Étudiants jetables ─────────────────────────────────────────────────────
  insert into auth.users (id, email, created_at, raw_user_meta_data)
  select u[i], 'day-parts-' || suffix || '-' || i || '@example.invalid', now() - interval '30 days',
    jsonb_build_object('pseudo', 'dp' || suffix || i, 'study_year', 'BAC 1')
  from generate_series(1, 4) as i;
  update public.profiles set timezone = 'Europe/Brussels' where id = u[1];
  -- Écrite sous l'identité de son auteur (les déclencheurs anti-spam l'exigent).
  perform set_config('request.jwt.claims', json_build_object('sub', u[1], 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', u[1]::text, true);
  insert into public.friendships (requester, addressee, status, accepted_at)
  values (u[1], u[2], 'accepted', now());
  perform set_config('request.jwt.claims', '', true);
  perform set_config('request.jwt.claim.sub', '', true);
  perform public.set_admin_role(u[4], true, 'session day parts test fixture');

  -- ── En tant que u[1], comme l'app ──────────────────────────────────────────
  perform set_config('request.jwt.claims', json_build_object('sub', u[1], 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', u[1]::text, true);
  set local role authenticated;

  -- 1. Fuseau de l'appareil : 23:30 → 00:30 à New York (19 → 20 sept).
  insert into public.sessions (id, user_id, duration_seconds, started_at, ended_at, timezone)
  values (s_ny, u[1], 3600, '2026-09-20T03:30:00Z', '2026-09-20T04:30:00Z', 'America/New_York');
  select to_jsonb(s) into got from (select timezone, timezone_source, day_parts_version from public.sessions where id = s_ny) s;
  if got <> '{"timezone":"America/New_York","timezone_source":"device","day_parts_version":1}'::jsonb then
    raise exception 'FAIL [device timezone row: %]', got;
  end if;
  select jsonb_agg(jsonb_build_object('d', local_date::text, 's', seconds, 'u', user_id = u[1]) order by local_date) into got
  from public.session_day_parts where session_id = s_ny;
  if got <> '[{"d":"2026-09-19","s":1800,"u":true},{"d":"2026-09-20","s":1800,"u":true}]'::jsonb then
    raise exception 'FAIL [device timezone parts: %]', got;
  end if;
  checks := checks + 2;

  -- 2. Sans fuseau (ancienne version de l'app) → fuseau du profil.
  insert into public.sessions (id, user_id, duration_seconds, started_at, ended_at)
  values (s_missing, u[1], 3600, '2026-09-18T21:30:00Z', '2026-09-18T22:30:00Z');
  select jsonb_build_object('tz', timezone, 'src', timezone_source) into got from public.sessions where id = s_missing;
  if got <> '{"tz":"Europe/Brussels","src":"profile"}'::jsonb
     or (select jsonb_agg(seconds order by local_date) from public.session_day_parts where session_id = s_missing) <> '[1800,1800]'::jsonb then
    raise exception 'FAIL [missing timezone: %]', got;
  end if;
  checks := checks + 1;

  -- 3. Fuseau invalide → fuseau du profil.
  insert into public.sessions (id, user_id, duration_seconds, started_at, ended_at, timezone)
  values (s_invalid, u[1], 600, '2026-09-18T10:00:00Z', '2026-09-18T10:10:00Z', 'EST5EDT');
  if (select timezone_source from public.sessions where id = s_invalid) <> 'profile' then
    raise exception 'FAIL [invalid timezone accepted]';
  end if;
  checks := checks + 1;

  -- 4. Source et version forgées par le client → réécrites.
  insert into public.sessions (id, user_id, duration_seconds, started_at, ended_at, timezone, timezone_source, day_parts_version)
  values (s_forged, u[1], 600, '2026-09-17T10:00:00Z', '2026-09-17T10:10:00Z', 'Europe/Brussels', 'inferred', 9);
  select jsonb_build_object('src', timezone_source, 'v', day_parts_version) into got from public.sessions where id = s_forged;
  if got <> '{"src":"device","v":1}'::jsonb then
    raise exception 'FAIL [forged source/version kept: %]', got;
  end if;
  checks := checks + 1;

  -- 5. Session hors ligne commencée à New York, envoyée des jours plus tard
  --    (profil Bruxelles) : les jours restent ceux de New York.
  insert into public.sessions (id, user_id, duration_seconds, started_at, ended_at, timezone)
  values (s_offline, u[1], 4500, '2026-09-15T02:30:00Z', '2026-09-15T03:45:00Z', 'America/New_York');
  if (select jsonb_agg(jsonb_build_object('d', local_date::text, 's', seconds)) from public.session_day_parts where session_id = s_offline)
     <> '[{"d":"2026-09-14","s":4500}]'::jsonb then
    raise exception 'FAIL [offline session parts]';
  end if;
  checks := checks + 1;

  -- 6. Modification depuis l'app : durée réduite (fin conservée, début recalculé
  --    comme le fait l'app) ; un fuseau renvoyé par le client est ignoré.
  update public.sessions
  set duration_seconds = 2400, started_at = '2026-09-20T03:50:00Z', timezone = 'Asia/Tokyo'
  where id = s_ny;
  select jsonb_build_object('tz', timezone, 'parts', (select jsonb_agg(jsonb_build_object('d', local_date::text, 's', seconds) order by local_date) from public.session_day_parts where session_id = s_ny))
  into got from public.sessions where id = s_ny;
  if got <> '{"tz":"America/New_York","parts":[{"d":"2026-09-19","s":600},{"d":"2026-09-20","s":1800}]}'::jsonb then
    raise exception 'FAIL [update: %]', got;
  end if;
  checks := checks + 1;

  -- 7. Aucune écriture directe dans session_day_parts.
  begin
    insert into public.session_day_parts (session_id, user_id, local_date, seconds) values (s_ny, u[1], '2026-01-01', 60);
    raise exception 'FAIL [client insert into session_day_parts allowed]';
  exception when insufficient_privilege then checks := checks + 1;
  end;
  begin
    update public.session_day_parts set seconds = 1 where session_id = s_ny;
    raise exception 'FAIL [client update of session_day_parts allowed]';
  exception when insufficient_privilege then checks := checks + 1;
  end;
  begin
    delete from public.session_day_parts where session_id = s_ny;
    raise exception 'FAIL [client delete from session_day_parts allowed]';
  exception when insufficient_privilege then checks := checks + 1;
  end;

  -- 8. Suppression : les portions partent avec la session.
  delete from public.sessions where id = s_forged;
  if exists (select 1 from public.session_day_parts where session_id = s_forged) then
    raise exception 'FAIL [parts survived session delete]';
  end if;
  checks := checks + 1;
  reset role;

  -- ── Lecture (RLS) ──────────────────────────────────────────────────────────
  perform set_config('request.jwt.claims', json_build_object('sub', u[2], 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', u[2]::text, true);
  set local role authenticated;
  select count(*) into n from public.session_day_parts where user_id = u[1];
  if n <> 6 then raise exception 'FAIL [friend sees % parts, expected 6]', n; end if;
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub', u[3], 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', u[3]::text, true);
  set local role authenticated;
  select count(*) into n from public.session_day_parts where user_id = u[1];
  if n <> 0 then raise exception 'FAIL [stranger sees % parts]', n; end if;
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub', u[4], 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', u[4]::text, true);
  set local role authenticated;
  select count(*) into n from public.session_day_parts where user_id = u[1];
  if n <> 6 then raise exception 'FAIL [admin sees % parts, expected 6]', n; end if;
  reset role;

  -- anon n'a même pas le droit de lire la table (aucun GRANT).
  set local role anon;
  begin
    select count(*) into n from public.session_day_parts;
    raise exception 'FAIL [anon can read session_day_parts (% rows)]', n;
  exception when insufficient_privilege then null;
  end;
  reset role;
  checks := checks + 4;

  -- ── Chrono de groupe : finish_group_chrono (SECURITY DEFINER) est appelée
  --    par UN membre (u[1]) et insère la session d'un AUTRE (u[2]) sans fuseau :
  --    la base doit prendre le fuseau du profil de u[2].
  perform set_config('request.jwt.claims', json_build_object('sub', u[1], 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', u[1]::text, true);
  insert into public.sessions (id, user_id, duration_seconds, note, started_at, ended_at)
  values (s_group, u[2], 6960, 'Chrono de groupe - test', '2026-09-16T21:00:00Z', '2026-09-16T23:00:00Z');
  select jsonb_build_object('src', timezone_source, 'parts', (select jsonb_agg(seconds order by local_date) from public.session_day_parts where session_id = s_group))
  into got from public.sessions where id = s_group;
  -- Profil de u[2] = défaut Europe/Paris : 23:00 → 01:00, intervalle 2 h, 1 h 56 étudiée.
  if got <> '{"src":"profile","parts":[3480,3480]}'::jsonb
     or (select timezone from public.sessions where id = s_group) <> 'Europe/Paris' then
    raise exception 'FAIL [group chrono: %]', got;
  end if;
  update public.profiles set timezone = 'Asia/Tokyo' where id = u[2];
  insert into public.sessions (id, user_id, duration_seconds, note, started_at, ended_at)
  values (gen_random_uuid(), u[2], 600, 'Chrono de groupe - test 2', '2026-09-16T10:00:00Z', '2026-09-16T10:10:00Z')
  returning timezone into v_tz;
  if v_tz <> 'Asia/Tokyo' then
    raise exception 'FAIL [group chrono must use the member profile timezone, got %]', v_tz;
  end if;
  update public.profiles set timezone = 'Europe/Paris' where id = u[2];
  checks := checks + 2;

  -- Le relais ne répond qu'au sujet de l'appelant.
  set local role authenticated;
  if public.session_default_timezone(u[2]) <> 'Europe/Paris'
     or public.session_default_timezone(u[1]) <> 'Europe/Brussels' then
    raise exception 'FAIL [session_default_timezone leaks another profile timezone]';
  end if;
  reset role;
  checks := checks + 1;

  -- ── Une session historique (sans fuseau) reste sans portion ───────────────
  insert into public.sessions (id, user_id, duration_seconds, started_at, ended_at)
  values (s_legacy, u[1], 1200, '2026-09-10T10:00:00Z', '2026-09-10T10:20:00Z');
  update public.sessions set timezone = null, timezone_source = null, day_parts_version = null where id = s_legacy;
  if exists (select 1 from public.session_day_parts where session_id = s_legacy) then
    raise exception 'FAIL [legacy-shaped session kept parts]';
  end if;
  perform set_config('request.jwt.claims', json_build_object('sub', u[1], 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', u[1]::text, true);
  set local role authenticated;
  update public.sessions set duration_seconds = 900, started_at = '2026-09-10T10:05:00Z', timezone = 'Europe/Brussels' where id = s_legacy;
  reset role;
  if (select timezone from public.sessions where id = s_legacy) is not null
     or exists (select 1 from public.session_day_parts where session_id = s_legacy) then
    raise exception 'FAIL [editing a legacy session gave it a timezone or parts]';
  end if;
  checks := checks + 1;

  -- ── L'historique réel n'a pas bougé ────────────────────────────────────────
  select count(*) into n from public.sessions where timezone is null and user_id <> all(u);
  if n <> history_before then
    raise exception 'FAIL [historical sessions changed: % → %]', history_before, n;
  end if;
  checks := checks + 1;

  -- ── Suppression du compte : sessions et portions partent ensemble ─────────
  delete from auth.users where id = u[1];
  if exists (select 1 from public.session_day_parts where user_id = u[1]) then
    raise exception 'FAIL [parts survived account deletion]';
  end if;
  checks := checks + 1;

  raise exception 'SESSION DAY PARTS TESTS PASSED: % checks (everything rolled back)', checks;
end;
$tests$;
