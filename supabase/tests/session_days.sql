-- Vue canonique session_days (v70), sur la vraie base. Crée des étudiants
-- jetables, joue chaque rôle comme l'app, puis lève une exception : RIEN n'est
-- gardé.
--
-- À lancer après v70, ou dans le MÊME appel execute_sql juste après son SQL.
-- Résultat attendu : « SESSION DAYS TESTS PASSED ».

do $tests$
declare
  suffix constant text := substr(md5(clock_timestamp()::text), 1, 8);
  u uuid[] := array(select gen_random_uuid() from generate_series(1, 4));
  -- u[1] moi · u[2] ami · u[3] inconnu · u[4] admin
  checks integer := 0;
  n integer;
  got jsonb;
  s_device uuid := gen_random_uuid();
  s_legacy uuid := gen_random_uuid();
  s_inferred uuid := gen_random_uuid();
begin
  -- ── Structure ──────────────────────────────────────────────────────────────
  if not exists (
    select 1 from pg_class c where c.oid = 'public.session_days'::regclass and c.relkind = 'v'
      and 'security_invoker=true' = any(c.reloptions)
  ) then
    raise exception 'FAIL [session_days must be a security_invoker view]';
  end if;
  if has_table_privilege('anon', 'public.session_days', 'select')
     or has_table_privilege('authenticated', 'public.session_days', 'insert')
     or has_table_privilege('authenticated', 'public.session_days', 'update')
     or has_table_privilege('authenticated', 'public.session_days', 'delete')
     or not has_table_privilege('authenticated', 'public.session_days', 'select') then
    raise exception 'FAIL [session_days privileges]';
  end if;
  checks := checks + 1;

  -- ── Toutes les sessions réelles : somme = durée, provenance connue ─────────
  if exists (
    select 1 from public.sessions s
    where (select coalesce(sum(d.seconds), 0) from public.session_days d where d.session_id = s.id) <> s.duration_seconds
  ) then
    raise exception 'FAIL [a session''s days do not sum to its duration]';
  end if;
  if exists (select 1 from public.session_days where provenance is null) then
    raise exception 'FAIL [a row has no provenance]';
  end if;
  -- Invariant v65 : portions si et seulement si fuseau.
  if exists (select 1 from public.sessions s where s.timezone is not null and not exists (select 1 from public.session_day_parts p where p.session_id = s.id))
     or exists (select 1 from public.session_day_parts p join public.sessions s on s.id = p.session_id where s.timezone is null) then
    raise exception 'FAIL [parts exist if and only if the session has a timezone]';
  end if;
  -- Règle legacy : une ligne, durée entière, jour de début à Bruxelles.
  if exists (
    select 1 from public.sessions s
    where s.timezone is null
      and (select jsonb_agg(jsonb_build_array(d.local_date, d.seconds, d.provenance)) from public.session_days d where d.session_id = s.id)
          <> jsonb_build_array(jsonb_build_array((s.started_at at time zone 'Europe/Brussels')::date, s.duration_seconds, 'legacy'))
  ) then
    raise exception 'FAIL [legacy rule]';
  end if;
  checks := checks + 3;

  -- ── Étudiants jetables ─────────────────────────────────────────────────────
  insert into auth.users (id, email, created_at, raw_user_meta_data)
  select u[i], 'session-days-' || suffix || '-' || i || '@example.invalid', now() - interval '30 days',
    jsonb_build_object('pseudo', 'sd' || suffix || i, 'study_year', 'BAC 1')
  from generate_series(1, 4) as i;
  update public.profiles set timezone = 'Europe/Brussels' where id = u[1];
  perform set_config('request.jwt.claims', json_build_object('sub', u[1], 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', u[1]::text, true);
  insert into public.friendships (requester, addressee, status, accepted_at) values (u[1], u[2], 'accepted', now());
  perform set_config('request.jwt.claims', '', true);
  perform set_config('request.jwt.claim.sub', '', true);
  perform public.set_admin_role(u[4], true, 'session days test fixture');

  -- Une session capturée (23:30 → 00:30 à New York), une qui deviendra legacy,
  -- une qui deviendra inferred.
  perform set_config('request.jwt.claims', json_build_object('sub', u[1], 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', u[1]::text, true);
  set local role authenticated;
  insert into public.sessions (id, user_id, duration_seconds, started_at, ended_at, timezone)
  values (s_device, u[1], 3600, '2026-09-20T03:30:00Z', '2026-09-20T04:30:00Z', 'America/New_York'),
         (s_legacy, u[1], 3600, '2026-05-20T21:30:00Z', '2026-05-20T22:30:00Z', 'Europe/Brussels'),
         (s_inferred, u[1], 1800, '2026-05-21T10:00:00Z', '2026-05-21T10:30:00Z', 'Europe/Brussels');
  reset role;
  -- Par la base : l'une redevient historique, l'autre est « rattrapée ».
  update public.sessions set timezone = null, timezone_source = null, timezone_basis = null, day_parts_version = null where id = s_legacy;
  update public.sessions set timezone_source = 'inferred', timezone_basis = 'near' where id = s_inferred;

  select jsonb_agg(jsonb_build_array(d.local_date, d.seconds, d.provenance) order by d.session_id, d.local_date) into got
  from public.session_days d where d.session_id = s_device;
  if got <> '[["2026-09-19", 1800, "captured"], ["2026-09-20", 1800, "captured"]]'::jsonb then
    raise exception 'FAIL [captured rows: %]', got;
  end if;
  -- 23:30 → 00:30 à Bruxelles, en legacy : UNE ligne, pas de découpage.
  select jsonb_agg(jsonb_build_array(d.local_date, d.seconds, d.provenance)) into got from public.session_days d where d.session_id = s_legacy;
  if got <> '[["2026-05-20", 3600, "legacy"]]'::jsonb then
    raise exception 'FAIL [legacy row: %]', got;
  end if;
  select jsonb_agg(d.provenance) into got from public.session_days d where d.session_id = s_inferred;
  if got <> '["inferred"]'::jsonb then
    raise exception 'FAIL [inferred provenance: %]', got;
  end if;
  checks := checks + 3;

  -- Le profil part à l'autre bout du monde : la session legacy ne bouge pas.
  update public.profiles set timezone = 'Pacific/Kiritimati' where id = u[1];
  select jsonb_agg(d.local_date) into got from public.session_days d where d.session_id = s_legacy;
  if got <> '["2026-05-20"]'::jsonb then
    raise exception 'FAIL [legacy day moved with the profile timezone: %]', got;
  end if;
  checks := checks + 1;

  -- course_id vient de la session.
  if exists (select 1 from public.session_days d join public.sessions s on s.id = d.session_id
             where d.session_id in (s_device, s_legacy, s_inferred) and d.course_id is distinct from s.course_id) then
    raise exception 'FAIL [course_id]';
  end if;
  checks := checks + 1;

  -- ── Droits de lecture ──────────────────────────────────────────────────────
  set local role authenticated;
  select count(*) into n from public.session_days where user_id = u[1];
  if n <> 4 then raise exception 'FAIL [owner sees % rows, expected 4]', n; end if;
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub', u[2], 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', u[2]::text, true);
  set local role authenticated;
  select count(*) into n from public.session_days where user_id = u[1];
  if n <> 4 then raise exception 'FAIL [friend sees % rows, expected 4]', n; end if;
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub', u[3], 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', u[3]::text, true);
  set local role authenticated;
  select count(*) into n from public.session_days where user_id = u[1];
  if n <> 0 then raise exception 'FAIL [stranger sees % rows]', n; end if;
  -- Écritures refusées.
  begin
    insert into public.session_days (session_id, user_id, local_date, seconds, course_id, provenance)
    values (s_device, u[3], current_date, 60, null, 'captured');
    raise exception 'FAIL [insert through session_days allowed]';
  exception when insufficient_privilege or object_not_in_prerequisite_state or feature_not_supported then null;
  end;
  begin
    delete from public.session_days where session_id = s_device;
    raise exception 'FAIL [delete through session_days allowed]';
  exception when insufficient_privilege or object_not_in_prerequisite_state or feature_not_supported then null;
  end;
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub', u[4], 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', u[4]::text, true);
  set local role authenticated;
  select count(*) into n from public.session_days where user_id = u[1];
  if n <> 4 then raise exception 'FAIL [admin sees % rows, expected 4]', n; end if;
  reset role;

  set local role anon;
  begin
    select count(*) into n from public.session_days;
    raise exception 'FAIL [anon can read session_days (% rows)]', n;
  exception when insufficient_privilege then null;
  end;
  reset role;
  checks := checks + 6;

  raise exception 'SESSION DAYS TESTS PASSED: % checks (everything rolled back)', checks;
end;
$tests$;
