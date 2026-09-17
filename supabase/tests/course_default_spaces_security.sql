-- Default academic spaces: automatic membership, institution scoping, privacy.
-- Creates two throw-away institutions and six throw-away students, runs the real
-- functions as those students (and as the authenticated / anon roles for RLS), then
-- raises an exception so NOTHING is kept. Run in the Supabase SQL editor or MCP
-- execute_sql after 20260917104500_default_academic_spaces.sql.
--
-- Expected result: an error whose message starts with "DEFAULT SPACES TESTS PASSED".
-- Any message starting with "FAIL" names the broken check.

do $tests$
declare
  suffix constant text := substr(md5(clock_timestamp()::text), 1, 8);
  inst_a constant text := 'zz-default-a-' || suffix;
  inst_b constant text := 'zz-default-b-' || suffix;
  u uuid[] := array(select gen_random_uuid() from generate_series(1, 6));
  checks integer := 0;
  n integer;
  v_uni_a uuid;
  v_uni_b uuid;
  v_prog_a uuid;
  v_prog_b uuid;
  v_prog_free uuid;
  v_prog_law uuid;
  v_msg uuid;
begin
  -- Students 1-3 and 5 at A, 4 at B, 6 without a university.
  insert into auth.users (id, email, raw_user_meta_data)
  select u[i], 'default-spaces-' || suffix || '-' || i || '@example.invalid',
    jsonb_build_object(
      'pseudo', 'ds' || suffix || i,
      'university', case
        when i = 4 then 'Blocus Default Institution B ' || suffix
        when i = 6 then ''
        else 'Blocus Default Institution A ' || suffix end,
      'study_year', 'BAC 1')
  from generate_series(1, 6) as i;

  perform set_config('request.jwt.claims', json_build_object('sub', u[1], 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', u[1]::text, true);
  insert into public.study_spaces (id, kind, name, parent_id) values
    (inst_a, 'university', 'Blocus Default Institution A ' || suffix, 'study-hub'),
    (inst_b, 'university', 'Blocus Default Institution B ' || suffix, 'study-hub');

  update public.profiles set broad_field = 'business' where id in (u[1], u[2], u[4]);
  update public.profiles set study_field = 'Kinésithérapie du sport', broad_field = null where id = u[3];
  update public.profiles set study_field = null, broad_field = null where id in (u[5], u[6]);
  update public.profiles set university = null where id = u[6];

  -- A student with a university AND a program gets exactly two spaces, joined.
  perform set_config('request.jwt.claims', json_build_object('sub', u[1], 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', u[1]::text, true);
  select count(*) into n from public.ensure_my_default_rooms() where joined;
  if n <> 2 then
    raise exception 'FAIL [two default spaces expected, got %]', n;
  end if;
  checks := checks + 1;
  select room_id into v_uni_a from public.ensure_my_default_rooms() where kind = 'university';
  select room_id into v_prog_a from public.ensure_my_default_rooms() where kind = 'program';
  if (select title from public.course_rooms where id = v_uni_a) <> 'Blocus Default Institution A ' || suffix
     or (select title from public.course_rooms where id = v_prog_a) <> 'Business & Management' then
    raise exception 'FAIL [default space titles]';
  end if;
  checks := checks + 1;

  -- Calling it again changes nothing: no duplicate room, no duplicate membership.
  perform * from public.ensure_my_default_rooms();
  perform * from public.ensure_my_default_rooms();
  if (select count(*) from public.course_rooms where institution_id = inst_a) <> 2
     or (select count(*) from public.course_room_members m where m.user_id = u[1]) <> 2 then
    raise exception 'FAIL [duplicate default rooms or memberships]';
  end if;
  checks := checks + 1;

  -- A second student of the same institution and program lands in the SAME rooms.
  perform set_config('request.jwt.claims', json_build_object('sub', u[2], 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', u[2]::text, true);
  perform * from public.ensure_my_default_rooms();
  if (select count(*) from public.course_rooms where institution_id = inst_a) <> 2
     or not exists (select 1 from public.course_room_members where room_id = v_prog_a and user_id = u[2]) then
    raise exception 'FAIL [same institution and program must share the rooms]';
  end if;
  checks := checks + 1;

  -- The same program name at ANOTHER institution is another space.
  perform set_config('request.jwt.claims', json_build_object('sub', u[4], 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', u[4]::text, true);
  select room_id into v_uni_b from public.ensure_my_default_rooms() where kind = 'university';
  select room_id into v_prog_b from public.ensure_my_default_rooms() where kind = 'program';
  if v_prog_b is null or v_prog_b = v_prog_a
     or (select title from public.course_rooms where id = v_prog_b) <> 'Business & Management'
     or (select institution_id from public.course_rooms where id = v_prog_b) <> inst_b then
    raise exception 'FAIL [program space is not institution scoped]';
  end if;
  checks := checks + 1;

  -- A profile with only a free-text program still gets a program space.
  perform set_config('request.jwt.claims', json_build_object('sub', u[3], 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', u[3]::text, true);
  select room_id into v_prog_free from public.ensure_my_default_rooms() where kind = 'program';
  if v_prog_free is null or v_prog_free = v_prog_a
     or (select title from public.course_rooms where id = v_prog_free) <> 'Kinésithérapie du sport' then
    raise exception 'FAIL [free-text program space]';
  end if;
  checks := checks + 1;

  -- No program declared: the university space alone, and no empty program room.
  perform set_config('request.jwt.claims', json_build_object('sub', u[5], 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', u[5]::text, true);
  select count(*) into n from public.ensure_my_default_rooms();
  if n <> 1 or not exists (select 1 from public.course_room_members where room_id = v_uni_a and user_id = u[5]) then
    raise exception 'FAIL [missing program must give the university space only]';
  end if;
  checks := checks + 1;

  -- No university: no default space at all.
  perform set_config('request.jwt.claims', json_build_object('sub', u[6], 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', u[6]::text, true);
  select count(*) into n from public.ensure_my_default_rooms();
  if n <> 0 or exists (select 1 from public.course_room_members where user_id = u[6]) then
    raise exception 'FAIL [no university must give no default space]';
  end if;
  checks := checks + 1;

  -- Changing the program moves the student; the university space is untouched.
  perform set_config('request.jwt.claims', json_build_object('sub', u[1], 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', u[1]::text, true);
  update public.profiles set broad_field = 'law' where id = u[1];
  select room_id into v_prog_law from public.ensure_my_default_rooms() where kind = 'program';
  if v_prog_law = v_prog_a
     or exists (select 1 from public.course_room_members where room_id = v_prog_a and user_id = u[1])
     or not exists (select 1 from public.course_room_members where room_id = v_prog_law and user_id = u[1])
     or not exists (select 1 from public.course_room_members where room_id = v_uni_a and user_id = u[1]) then
    raise exception 'FAIL [program change did not move the membership]';
  end if;
  checks := checks + 1;

  -- Changing the institution moves both memberships, without duplicates. The
  -- student still reads Law, so their program space is Law AT THE NEW SCHOOL —
  -- never the Law space of the old one, never a program space across schools.
  update public.profiles set university = 'Blocus Default Institution B ' || suffix where id = u[1];
  perform * from public.ensure_my_default_rooms();
  if exists (select 1 from public.course_room_members where user_id = u[1] and room_id in (v_uni_a, v_prog_law))
     or not exists (select 1 from public.course_room_members where user_id = u[1] and room_id = v_uni_b)
     or (select count(*) from public.course_room_members where user_id = u[1]) <> 2
     or not exists (
       select 1 from public.course_room_members m
       join public.course_rooms r on r.id = m.room_id
       where m.user_id = u[1] and r.kind = 'program' and r.institution_id = inst_b and r.title = 'Law') then
    raise exception 'FAIL [institution change did not move the memberships]';
  end if;
  checks := checks + 1;
  update public.profiles set university = 'Blocus Default Institution A ' || suffix, broad_field = 'business' where id = u[1];
  perform * from public.ensure_my_default_rooms();

  -- Leaving a default space is remembered: the sync does not put it back.
  perform set_config('request.jwt.claims', json_build_object('sub', u[2], 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', u[2]::text, true);
  perform public.leave_course_room(v_uni_a);
  perform * from public.ensure_my_default_rooms();
  if exists (select 1 from public.course_room_members where room_id = v_uni_a and user_id = u[2])
     or not exists (select 1 from public.course_room_optouts where room_id = v_uni_a and user_id = u[2]) then
    raise exception 'FAIL [a deliberate leave was undone]';
  end if;
  checks := checks + 1;
  if not exists (select 1 from public.ensure_my_default_rooms() r where r.room_id = v_uni_a and not r.joined) then
    raise exception 'FAIL [a left default space disappeared instead of offering to join again]';
  end if;
  checks := checks + 1;

  -- Joining again clears the memory.
  perform public.join_default_room(v_uni_a);
  if not exists (select 1 from public.course_room_members where room_id = v_uni_a and user_id = u[2])
     or exists (select 1 from public.course_room_optouts where room_id = v_uni_a and user_id = u[2]) then
    raise exception 'FAIL [join_default_room]';
  end if;
  checks := checks + 1;

  -- Another institution's default spaces are out of reach.
  perform set_config('request.jwt.claims', json_build_object('sub', u[4], 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', u[4]::text, true);
  begin
    perform public.join_default_room(v_uni_a);
    raise exception 'FAIL [cross institution default join accepted]';
  exception when raise_exception then
    if sqlerrm like 'FAIL%' then raise; end if;
    if sqlerrm <> 'Course space not available' then raise exception 'FAIL [cross institution default join]: %', sqlerrm; end if;
    checks := checks + 1;
  end;
  -- Another program of the SAME institution is out of reach too.
  perform set_config('request.jwt.claims', json_build_object('sub', u[3], 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', u[3]::text, true);
  begin
    perform public.join_default_room(v_prog_a);
    raise exception 'FAIL [another program joined]';
  exception when raise_exception then
    if sqlerrm like 'FAIL%' then raise; end if;
    if sqlerrm <> 'Course space not available' then raise exception 'FAIL [another program]: %', sqlerrm; end if;
    checks := checks + 1;
  end;
  -- A course room cannot be joined through the default path.
  begin
    perform public.join_default_room(gen_random_uuid());
    raise exception 'FAIL [unknown room joined]';
  exception when raise_exception then
    if sqlerrm like 'FAIL%' then raise; end if;
    checks := checks + 1;
  end;

  -- The conversation follows the course-space rules: members write and read,
  -- others see nothing.
  perform set_config('request.jwt.claims', json_build_object('sub', u[1], 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', u[1]::text, true);
  select id into v_msg from public.post_course_room_message(v_uni_a, 'Bonjour a tout le campus');
  checks := checks + 1;
  perform set_config('request.jwt.claims', json_build_object('sub', u[5], 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', u[5]::text, true);
  set local role authenticated;
  if not exists (select 1 from public.community_messages where id = v_msg) then
    raise exception 'FAIL [member cannot read the university space]';
  end if;
  checks := checks + 1;
  if exists (select 1 from public.course_room_optouts where user_id <> u[5]) then
    raise exception 'FAIL [opt-outs of others readable]';
  end if;
  checks := checks + 1;
  begin
    insert into public.course_room_optouts (user_id, room_id) values (u[5], v_uni_a);
    raise exception 'FAIL [opt-out insert accepted]';
  exception when insufficient_privilege then checks := checks + 1;
  end;
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub', u[4], 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', u[4]::text, true);
  set local role authenticated;
  if exists (select 1 from public.community_messages where id = v_msg) then
    raise exception 'FAIL [another institution reads the university space]';
  end if;
  checks := checks + 1;
  reset role;
  begin
    perform public.post_course_room_message(v_uni_a, 'Intrus');
    raise exception 'FAIL [non-member posted in a default space]';
  exception when raise_exception then
    if sqlerrm like 'FAIL%' then raise; end if;
    if sqlerrm <> 'Join this course space to post' then raise exception 'FAIL [non-member default post]: %', sqlerrm; end if;
    checks := checks + 1;
  end;

  -- Moderation reaches default spaces: a report names the space by its title.
  perform set_config('request.jwt.claims', json_build_object('sub', u[5], 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', u[5]::text, true);
  perform public.report_course_message(v_msg, 'spam');
  if not exists (
    select 1 from public.course_message_reports where message_id = v_msg and reporter_id = u[5]
  ) then
    raise exception 'FAIL [report in a default space]';
  end if;
  checks := checks + 1;

  -- Anonymous visitors reach nothing.
  set local role anon;
  begin
    perform * from public.ensure_my_default_rooms();
    raise exception 'FAIL [anon syncs default spaces]';
  exception when insufficient_privilege then checks := checks + 1;
  end;
  begin
    perform 1 from public.course_room_optouts;
    raise exception 'FAIL [anon reads opt-outs]';
  exception when insufficient_privilege then checks := checks + 1;
  end;
  reset role;

  -- The internal program helper stays internal.
  set local role authenticated;
  begin
    perform * from public.course_program_of(u[1]);
    raise exception 'FAIL [course_program_of executable by students]';
  exception when insufficient_privilege then checks := checks + 1;
  end;
  reset role;

  raise exception 'DEFAULT SPACES TESTS PASSED: % checks (everything rolled back)', checks;
end
$tests$;
