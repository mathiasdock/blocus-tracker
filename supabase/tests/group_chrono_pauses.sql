-- Chrono de groupe avec pauses (v66), sur la vraie base, avec la vraie
-- fonction finish_group_chrono appelée comme l'app. Lève une exception à la
-- fin : RIEN n'est gardé.
--
-- À lancer après v66, ou dans le MÊME appel execute_sql juste après son SQL.
-- Résultat attendu : « GROUP CHRONO PAUSES TESTS PASSED ».
--
-- sanitize_group_chrono_insert force started_at = now() à la création : le
-- temps écoulé est simulé ensuite par le propriétaire (started_at et
-- total_paused_seconds), comme il s'écoulerait réellement.

do $tests$
declare
  suffix constant text := substr(md5(clock_timestamp()::text), 1, 8);
  u uuid[] := array(select gen_random_uuid() from generate_series(1, 2));
  g uuid;
  cs uuid;
  sc record;
  st timestamptz;
  checks integer := 0;
  n integer;
  got jsonb;
begin
  insert into auth.users (id, email, created_at, raw_user_meta_data)
  select u[i], 'grp-pauses-' || suffix || '-' || i || '@example.invalid', now() - interval '30 days',
    jsonb_build_object('pseudo', 'gp' || suffix || i, 'study_year', 'BAC 1')
  from generate_series(1, 2) as i;
  perform set_config('request.jwt.claims', json_build_object('sub', u[1], 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', u[1]::text, true);
  insert into public.study_groups (name, created_by) values ('Pauses ' || suffix, u[1]) returning id into g;
  insert into public.group_members (group_id, user_id, role) values (g, u[1], 'admin') on conflict do nothing;
  insert into public.group_members (group_id, user_id, role) values (g, u[2], 'member') on conflict do nothing;

  -- ── Chrono de groupe : intervalle / temps étudié ──────────────────────────
  for sc in select * from (values
    (1, '60/55', 60, 5, 'active'),
    (2, '60/45', 60, 15, 'active'),
    (3, '120/90', 120, 30, 'active'),
    (4, 'arrêté en pause : 60/40 + 10 min de pause finale', 60, 10, 'paused')
  ) v(k, label, interval_min, paused_min, status) loop
    insert into public.group_chrono_sessions (group_id, started_by, status, started_at)
    values (g, u[1], 'active', now()) returning id into cs;
    insert into public.group_chrono_members (session_id, user_id, status, joined_at)
    values (cs, u[1], 'accepted', now()), (cs, u[2], 'accepted', now());
    -- Chaque cas démarre à une seconde distincte (k) pour être retrouvé ensuite.
    st := now() - make_interval(mins => sc.interval_min, secs => sc.k);
    update public.group_chrono_sessions
    set started_at = st,
        total_paused_seconds = sc.paused_min * 60,
        status = sc.status,
        last_pause_at = case when sc.status = 'paused' then now() - interval '10 minutes' end
    where id = cs;

    set local role authenticated;
    perform public.finish_group_chrono(cs);
    reset role;

    select jsonb_agg(jsonb_build_object(
      'dur', s.duration_seconds,
      'parts_sum', (select sum(p.seconds) from public.session_day_parts p where p.session_id = s.id),
      'src', s.timezone_source))
    into got
    from public.sessions s where s.user_id = any(u) and s.started_at = st;

    n := coalesce(jsonb_array_length(got), 0);
    if n <> 2 then
      raise exception 'FAIL [% : % member sessions saved, expected 2]', sc.label, n;
    end if;
    if exists (
      select 1 from jsonb_array_elements(got) e
      where (e->>'dur')::int <> (sc.interval_min - sc.paused_min - case when sc.status = 'paused' then 10 else 0 end) * 60 + sc.k
         or (e->>'parts_sum')::int <> (e->>'dur')::int
         or e->>'src' <> 'profile'
    ) then
      raise exception 'FAIL [% : %]', sc.label, got;
    end if;
    if (select status from public.group_chrono_sessions where id = cs) <> 'finished' then
      raise exception 'FAIL [% : timer not finished]', sc.label;
    end if;
    checks := checks + 1;
  end loop;

  -- Le marqueur ne survit pas à l'appel.
  if coalesce(current_setting('blocus.group_chrono_finish', true), '') = 'on' then
    raise exception 'FAIL [group chrono marker left on]';
  end if;
  checks := checks + 1;

  -- ── Sessions solo : la règle ±5 min reste entière ─────────────────────────
  set local role authenticated;
  begin
    insert into public.sessions (user_id, duration_seconds, started_at, ended_at)
    values (u[1], 2700, now() - interval '3 days 60 minutes', now() - interval '3 days');
    raise exception 'FAIL [solo 60/45 accepted]';
  exception when sqlstate '22023' then checks := checks + 1;
  end;
  begin
    insert into public.sessions (user_id, duration_seconds, started_at, ended_at)
    values (u[1], 3600, now() - interval '4 days 45 minutes', now() - interval '4 days');
    raise exception 'FAIL [solo duration longer than interval accepted]';
  exception when sqlstate '22023' then checks := checks + 1;
  end;
  insert into public.sessions (user_id, duration_seconds, started_at, ended_at)
  values (u[1], 3300, now() - interval '5 days 60 minutes', now() - interval '5 days');
  checks := checks + 1;
  reset role;

  -- ── Même marqué « chrono de groupe », jamais plus long que l'intervalle ──
  perform set_config('blocus.group_chrono_finish', 'on', true);
  begin
    insert into public.sessions (user_id, duration_seconds, started_at, ended_at)
    values (u[1], 7200, now() - interval '6 days 60 minutes', now() - interval '6 days');
    raise exception 'FAIL [group duration longer than interval accepted]';
  exception when sqlstate '22023' then checks := checks + 1;
  end;
  perform set_config('blocus.group_chrono_finish', '', true);

  raise exception 'GROUP CHRONO PAUSES TESTS PASSED: % checks (everything rolled back)', checks;
end;
$tests$;
