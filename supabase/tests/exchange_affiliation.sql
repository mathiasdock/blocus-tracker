-- Transactional smoke test. A final exception rolls every fixture back.
-- Expected: EXCHANGE AFFILIATION TESTS PASSED
do $test$
declare
  suffix text := substr(md5(clock_timestamp()::text), 1, 8);
  student uuid := gen_random_uuid();
  home_id text := 'zz-exchange-home-' || suffix;
  host_id text;
  v_course_id uuid;
begin
  insert into auth.users(id, email, raw_user_meta_data)
  values (student, 'exchange-' || suffix || '@example.invalid',
    jsonb_build_object('pseudo', 'ex' || suffix, 'university', 'Exchange Home ' || suffix));
  perform set_config('request.jwt.claims', json_build_object('sub', student, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', student::text, true);
  update public.profiles set timezone = 'America/New_York' where id = student;
  insert into public.study_spaces(id, kind, name, parent_id)
  values (home_id, 'university', 'Exchange Home ' || suffix, 'study-hub');

  perform public.save_my_exchange('Exchange Host ' || suffix, '2026-08-20', '2026-08-30');
  select exchange_institution_id into host_id from public.profiles where id = student;
  if host_id is null or public.course_institution_of(student) <> home_id then
    raise exception 'FAIL ended exchange institution';
  end if;

  insert into public.courses(user_id, name, created_at)
  values (student, 'Marketing', '2026-07-01 12:00:00+00') returning id into v_course_id;
  if (select study_institution_id from public.courses where id = v_course_id) is not null then
    raise exception 'FAIL course before exchange';
  end if;

  insert into public.sessions(user_id, course_id, duration_seconds, started_at, ended_at, timezone)
  values (student, v_course_id, 1800, '2026-08-20 03:00:00+00', '2026-08-20 03:30:00+00', 'America/New_York');
  if (select study_institution_id from public.courses where id = v_course_id) is not null then
    raise exception 'FAIL session before local exchange day';
  end if;

  insert into public.sessions(user_id, course_id, duration_seconds, started_at, ended_at, timezone)
  values (student, v_course_id, 1800, '2026-08-20 14:00:00+00', '2026-08-20 14:30:00+00', 'America/New_York');
  if (select study_institution_id from public.courses where id = v_course_id) is distinct from host_id
    or not exists(select 1 from public.course_population(host_id) pop where pop.course_id = v_course_id) then
    raise exception 'FAIL course during exchange';
  end if;

  insert into public.sessions(user_id, course_id, duration_seconds, started_at, ended_at, timezone)
  values (student, v_course_id, 1800, '2026-09-02 14:00:00+00', '2026-09-02 14:30:00+00', 'America/New_York');
  if (select study_institution_id from public.courses where id = v_course_id) is not null
    or not exists(select 1 from public.course_population(home_id) pop where pop.course_id = v_course_id) then
    raise exception 'FAIL course after exchange';
  end if;

  perform public.save_my_exchange('Exchange Host ' || suffix, '2026-08-20', '2026-10-01');
  if public.course_institution_of(student) <> host_id then
    raise exception 'FAIL active exchange institution';
  end if;
  perform public.save_my_exchange(null, null, null);
  if (select exchange_institution_id from public.profiles where id = student) is not null
    or public.course_institution_of(student) <> home_id then
    raise exception 'FAIL cancel restores home';
  end if;
  raise exception 'EXCHANGE AFFILIATION TESTS PASSED';
end
$test$;
