-- Borne des portions (v67), sur la vraie base. Simule, SANS RIEN GARDER, le
-- rattrapage des sessions historiques de plus de 12 h : fuseau du profil,
-- source « inferred », portions générées par le déclencheur. Lève une
-- exception à la fin : tout est annulé.
--
-- À lancer après v67, ou dans le MÊME appel execute_sql juste après son SQL.
-- Résultat attendu : « DAY PARTS BOUND TESTS PASSED ».

do $tests$
declare
  checks integer := 0;
  n integer;
  r record;
  v_session uuid;
  v_user uuid;
  v_before jsonb;
  v_count integer;
begin
  -- ── Les sessions historiques > 12 h reçoivent des portions fidèles ────────
  select jsonb_object_agg(id::text, jsonb_build_array(duration_seconds, started_at, ended_at))
  into v_before from public.sessions where duration_seconds > 43200;
  select count(*) into v_count from jsonb_object_keys(v_before);

  update public.sessions s
  set timezone = coalesce(public.gamification_timezone(s.user_id), 'Europe/Paris'),
      timezone_source = 'inferred'
  where s.duration_seconds > 43200 and s.timezone is null;
  get diagnostics n = row_count;
  if n <> v_count then
    raise exception 'FAIL [% legacy sessions updated, expected %]', n, v_count;
  end if;

  for r in
    select s.id, s.duration_seconds,
      (select sum(p.seconds) from public.session_day_parts p where p.session_id = s.id) as parts_sum,
      (select count(*) from public.session_day_parts p where p.session_id = s.id) as parts_n,
      (select max(p.seconds) from public.session_day_parts p where p.session_id = s.id) as parts_max
    from public.sessions s where s.duration_seconds > 43200
  loop
    if r.parts_sum is distinct from r.duration_seconds or r.parts_n = 0 then
      raise exception 'FAIL [legacy session %: parts % ≠ duration %]', r.id, r.parts_sum, r.duration_seconds;
    end if;
    if jsonb_build_array(r.duration_seconds, (select started_at from public.sessions where id = r.id), (select ended_at from public.sessions where id = r.id))
       <> v_before -> r.id::text then
      raise exception 'FAIL [legacy session % was modified]', r.id;
    end if;
    checks := checks + 1;
  end loop;
  if checks <> v_count then
    raise exception 'FAIL [checked % of % legacy sessions]', checks, v_count;
  end if;
  if not exists (select 1 from public.session_day_parts where seconds > 43200) then
    raise exception 'FAIL [expected at least one legacy part over 12 h]';
  end if;
  checks := checks + 1;

  -- ── La borne de 26 h refuse une valeur absurde ─────────────────────────────
  select s.id, s.user_id into v_session, v_user from public.sessions s where s.duration_seconds > 43200 limit 1;
  begin
    insert into public.session_day_parts (session_id, user_id, local_date, seconds)
    values (v_session, v_user, '1999-01-01', 93601);
    raise exception 'FAIL [part over 26 h accepted]';
  exception when check_violation then checks := checks + 1;
  end;
  begin
    insert into public.session_day_parts (session_id, user_id, local_date, seconds)
    values (v_session, v_user, '1999-01-02', 0);
    raise exception 'FAIL [empty part accepted]';
  exception when check_violation then checks := checks + 1;
  end;

  -- ── Les nouvelles sessions restent limitées à 12 h ─────────────────────────
  begin
    insert into public.sessions (user_id, duration_seconds, started_at, ended_at, timezone)
    values (v_user, 43201, now() - interval '12 hours 1 second', now(), 'Europe/Brussels');
    raise exception 'FAIL [new session over 12 h accepted]';
  exception when sqlstate '22023' then checks := checks + 1;
  end;

  raise exception 'DAY PARTS BOUND TESTS PASSED: % checks (everything rolled back)', checks;
end;
$tests$;
