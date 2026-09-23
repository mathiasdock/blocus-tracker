-- Course spaces: membership, privacy, moderation and legacy retirement.
-- Creates two throw-away institutions and seven throw-away students, runs the real
-- functions as those students (and as the authenticated / anon roles for RLS), then
-- raises an exception so NOTHING is kept. Run in the Supabase SQL editor or MCP execute_sql
-- after 20260917061842_course_spaces.sql.
--
-- Expected result: an error whose message starts with "COURSE SPACES TESTS PASSED".
-- Any message starting with "FAIL" names the broken check.

do $tests$
declare
  suffix constant text := substr(md5(clock_timestamp()::text), 1, 8);
  inst_a constant text := 'zz-course-spaces-a-' || suffix;
  inst_b constant text := 'zz-course-spaces-b-' || suffix;
  u uuid[] := array(select gen_random_uuid() from generate_series(1, 7));
  checks integer := 0;
  n integer;
  v_offer_a uuid;
  v_room uuid;
  v_room_again uuid;
  v_room_other uuid;
  v_msg uuid;
  v_msg2 uuid;
  v_legacy uuid;
  v_admin uuid;
begin
  -- Students 1-6 at A (6 becomes an admin), 7 at B.
  insert into auth.users (id, email, raw_user_meta_data)
  select u[i], 'course-spaces-' || suffix || '-' || i || '@example.invalid',
    jsonb_build_object(
      'pseudo', 'cs' || suffix || i,
      'university', case when i <= 6 then 'Blocus Spaces Institution A ' || suffix else 'Blocus Spaces Institution B ' || suffix end,
      'study_year', 'BAC 1')
  from generate_series(1, 7) as i;

  perform set_config('request.jwt.claims', json_build_object('sub', u[1], 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', u[1]::text, true);
  insert into public.study_spaces (id, kind, name, parent_id) values
    (inst_a, 'university', 'Blocus Spaces Institution A ' || suffix, 'study-hub'),
    (inst_b, 'university', 'Blocus Spaces Institution B ' || suffix, 'study-hub');

  insert into public.courses (user_id, name) values
    (u[1], 'Advertising Strategy'), (u[2], 'Advertising Strategies'),
    (u[3], 'Zyzzyva personal notes'),
    (u[7], 'Advertising Strategy'), (u[7], 'Advertising Strategy II');

  for i in 1..7 loop
    perform set_config('request.jwt.claims', json_build_object('sub', u[i], 'role', 'authenticated')::text, true);
    perform set_config('request.jwt.claim.sub', u[i]::text, true);
    perform * from public.resolve_my_course_links();
  end loop;
  select id into v_offer_a from public.course_offerings where institution_id = inst_a and identity_key = 'advertising strategy';
  if v_offer_a is null then
    raise exception 'FAIL [setup: canonical course A missing]';
  end if;

  -- A canonical course has no room until somebody joins (no empty rooms by default).
  if exists (select 1 from public.course_rooms where offering_id = v_offer_a) then
    raise exception 'FAIL [lazy: room created before any join]';
  end if;
  checks := checks + 1;

  -- Lazy creation, idempotent join, one room per canonical course.
  perform set_config('request.jwt.claims', json_build_object('sub', u[1], 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', u[1]::text, true);
  v_room := public.join_course_room(v_offer_a);
  v_room_again := public.join_course_room(v_offer_a);
  perform set_config('request.jwt.claims', json_build_object('sub', u[2], 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', u[2]::text, true);
  v_room_other := public.join_course_room(v_offer_a);
  if v_room_other <> v_room or v_room_again <> v_room
     or (select count(*) from public.course_rooms where offering_id = v_offer_a) <> 1
     or (select count(*) from public.course_room_members where room_id = v_room) <> 2 then
    raise exception 'FAIL [lazy room creation duplicated]';
  end if;
  checks := checks + 1;

  -- The database itself refuses a second room for the same canonical course
  -- (what makes concurrent first joins converge on one room).
  begin
    insert into public.course_rooms (offering_id) values (v_offer_a);
    raise exception 'FAIL [unique room per course not enforced]';
  exception when unique_violation then checks := checks + 1;
  end;

  -- Institution boundary: B cannot join A, and never sees A in search.
  perform set_config('request.jwt.claims', json_build_object('sub', u[7], 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', u[7]::text, true);
  begin
    perform public.join_course_room(v_offer_a);
    raise exception 'FAIL [cross institution join accepted]';
  exception when raise_exception then
    if sqlerrm like 'FAIL%' then raise; end if;
    if sqlerrm <> 'Course space not available' then raise exception 'FAIL [cross institution join]: %', sqlerrm; end if;
    checks := checks + 1;
  end;
  if exists (select 1 from public.search_course_spaces('advertising') s where s.offering_id = v_offer_a)
     or exists (select 1 from public.course_space_summaries(array[v_offer_a]) s) then
    raise exception 'FAIL [cross institution search or summary]';
  end if;
  checks := checks + 1;

  -- Search returns canonical titles of the caller's institution only, never a personal name.
  perform set_config('request.jwt.claims', json_build_object('sub', u[4], 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', u[4]::text, true);
  if not exists (select 1 from public.search_course_spaces('advert') s where s.offering_id = v_offer_a and s.offering_title = 'Advertising Strategy')
     or exists (select 1 from public.search_course_spaces('zyzzyva'))
     or exists (select 1 from public.search_course_spaces('a')) then
    raise exception 'FAIL [search scope]';
  end if;
  checks := checks + 1;

  -- Posting is for members only; content rules and anti-spam.
  perform set_config('request.jwt.claims', json_build_object('sub', u[1], 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', u[1]::text, true);
  select id into v_msg from public.post_course_room_message(v_room, '  Bonjour la classe  ');
  if (select content from public.community_messages where id = v_msg) <> 'Bonjour la classe'
     or (select content_type from public.community_messages where id = v_msg) <> 'discussion' then
    raise exception 'FAIL [post trimmed discussion]';
  end if;
  checks := checks + 1;

  begin
    perform public.post_course_room_message(v_room, 'Bonjour la classe');
    raise exception 'FAIL [duplicate accepted]';
  exception when raise_exception then
    if sqlerrm like 'FAIL%' then raise; end if;
    if sqlerrm <> 'Duplicate message' then raise exception 'FAIL [duplicate]: %', sqlerrm; end if;
    checks := checks + 1;
  end;
  begin
    perform public.post_course_room_message(v_room, 'x', 'community:' || u[2] || '/' || v_room || '/1-a.png', 'image', 'a.png');
    raise exception 'FAIL [foreign attachment path accepted]';
  exception when raise_exception then
    if sqlerrm like 'FAIL%' then raise; end if;
    if sqlerrm <> 'Invalid attachment' then raise exception 'FAIL [attachment path]: %', sqlerrm; end if;
    checks := checks + 1;
  end;
  perform public.post_course_room_message(v_room, null, 'community:' || u[1] || '/' || v_room || '/17-abc.pdf', 'file', 'plan.pdf');
  perform public.post_course_room_message(v_room, 'Examen', null, null, null, current_date + 30);
  begin
    perform public.post_course_room_message(v_room, 'Trop loin', null, null, null, current_date + 1000);
    raise exception 'FAIL [far exam date accepted]';
  exception when raise_exception then
    if sqlerrm like 'FAIL%' then raise; end if;
    checks := checks + 1;
  end;
  begin
    perform public.post_course_room_message(v_room, repeat('a', 1001));
    raise exception 'FAIL [long message accepted]';
  exception when raise_exception then
    if sqlerrm like 'FAIL%' then raise; end if;
    checks := checks + 1;
  end;
  begin
    insert into public.community_messages (room_id, user_id, content, parent_id) values (v_room, u[1], 'thread', v_msg);
    raise exception 'FAIL [thread accepted in a course space]';
  exception when raise_exception then
    if sqlerrm like 'FAIL%' then raise; end if;
    checks := checks + 1;
  end;

  perform set_config('request.jwt.claims', json_build_object('sub', u[3], 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', u[3]::text, true);
  begin
    perform public.post_course_room_message(v_room, 'Intrus');
    raise exception 'FAIL [non-member post accepted]';
  exception when raise_exception then
    if sqlerrm like 'FAIL%' then raise; end if;
    if sqlerrm <> 'Join this course space to post' then raise exception 'FAIL [non-member post]: %', sqlerrm; end if;
    checks := checks + 1;
  end;

  -- Burst limit: 6 messages per 30 seconds.
  perform set_config('request.jwt.claims', json_build_object('sub', u[2], 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', u[2]::text, true);
  for i in 1..6 loop
    perform public.post_course_room_message(v_room, 'burst ' || i);
  end loop;
  begin
    perform public.post_course_room_message(v_room, 'burst 7');
    raise exception 'FAIL [burst accepted]';
  exception when raise_exception then
    if sqlerrm like 'FAIL%' then raise; end if;
    if sqlerrm <> 'Rate limit exceeded' then raise exception 'FAIL [burst]: %', sqlerrm; end if;
    checks := checks + 1;
  end;

  -- RLS as a member (2) and a non-member (3).
  select count(*) into n from public.community_messages where room_id = v_room;
  perform set_config('request.jwt.claims', json_build_object('sub', u[2], 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', u[2]::text, true);
  set local role authenticated;
  if (select count(*) from public.community_messages where room_id = v_room) <> n then
    raise exception 'FAIL [member cannot read the room]';
  end if;
  checks := checks + 1;
  if (select count(*) from public.course_room_members) <> 1
     or exists (select 1 from public.course_room_members where user_id <> u[2]) then
    raise exception 'FAIL [member identities readable]';
  end if;
  checks := checks + 1;
  begin
    perform 1 from public.course_rooms;
    raise exception 'FAIL [rooms table readable]';
  exception when insufficient_privilege then checks := checks + 1;
  end;
  begin
    insert into public.course_room_members (room_id, user_id) values (v_room, u[3]);
    raise exception 'FAIL [membership insert accepted]';
  exception when insufficient_privilege then checks := checks + 1;
  end;
  begin
    delete from public.course_room_members where user_id = u[1];
    raise exception 'FAIL [membership delete accepted]';
  exception when insufficient_privilege then checks := checks + 1;
  end;
  begin
    insert into public.community_messages (room_id, user_id, content) values (v_room, u[2], 'direct insert');
    raise exception 'FAIL [direct insert accepted]';
  exception when insufficient_privilege then checks := checks + 1;
  end;
  if exists (select 1 from public.course_links where user_id <> u[2]) then
    raise exception 'FAIL [course links of others readable]';
  end if;
  checks := checks + 1;
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub', u[3], 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', u[3]::text, true);
  set local role authenticated;
  if exists (select 1 from public.community_messages where room_id = v_room)
     or exists (select 1 from public.course_room_members where room_id = v_room) then
    raise exception 'FAIL [non-member reads the room]';
  end if;
  checks := checks + 1;
  -- Leaving someone else is impossible: leave only removes the caller.
  perform public.leave_course_room(v_room);
  reset role;
  if (select count(*) from public.course_room_members where room_id = v_room) <> 2 then
    raise exception 'FAIL [leave removed another member]';
  end if;
  checks := checks + 1;

  -- Summaries: counts below 3 withheld; last activity only for members.
  perform set_config('request.jwt.claims', json_build_object('sub', u[3], 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', u[3]::text, true);
  if not exists (select 1 from public.course_space_summaries(array[v_offer_a]) s
                 where s.room_id = v_room and not s.joined and s.member_count is null and s.last_message_at is null) then
    raise exception 'FAIL [summary for a non-member of a small room]';
  end if;
  checks := checks + 1;
  foreach n in array array[4, 5] loop
    perform set_config('request.jwt.claims', json_build_object('sub', u[n], 'role', 'authenticated')::text, true);
    perform set_config('request.jwt.claim.sub', u[n]::text, true);
    perform public.join_course_room(v_offer_a);
  end loop;
  perform set_config('request.jwt.claims', json_build_object('sub', u[3], 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', u[3]::text, true);
  if not exists (select 1 from public.course_space_summaries(array[v_offer_a]) s where s.member_count = 4 and s.last_message_at is null) then
    raise exception 'FAIL [summary count from 3 members]';
  end if;
  checks := checks + 1;

  -- Leave revokes access immediately.
  perform set_config('request.jwt.claims', json_build_object('sub', u[5], 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', u[5]::text, true);
  perform public.leave_course_room(v_room);
  set local role authenticated;
  if exists (select 1 from public.community_messages where room_id = v_room) then
    raise exception 'FAIL [left member still reads]';
  end if;
  checks := checks + 1;
  reset role;
  begin
    perform public.post_course_room_message(v_room, 'still here?');
    raise exception 'FAIL [left member still posts]';
  exception when raise_exception then
    if sqlerrm like 'FAIL%' then raise; end if;
    checks := checks + 1;
  end;
  perform public.join_course_room(v_offer_a);

  -- Blocks hide the blocked student's messages for the blocker only.
  perform set_config('request.jwt.claims', json_build_object('sub', u[2], 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', u[2]::text, true);
  set local role authenticated;
  insert into public.user_blocks (blocker_id, blocked_id) values (u[2], u[1]);
  if exists (select 1 from public.community_messages where room_id = v_room and user_id = u[1]) then
    raise exception 'FAIL [blocked messages visible]';
  end if;
  checks := checks + 1;
  begin
    insert into public.user_blocks (blocker_id, blocked_id) values (u[1], u[2]);
    raise exception 'FAIL [block on behalf of someone else]';
  exception when insufficient_privilege then checks := checks + 1;
  end;
  delete from public.user_blocks where blocked_id = u[1];
  if not exists (select 1 from public.community_messages where room_id = v_room and user_id = u[1]) then
    raise exception 'FAIL [unblock does not restore]';
  end if;
  checks := checks + 1;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', u[4], 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', u[4]::text, true);
  set local role authenticated;
  if (select count(*) from public.community_messages where room_id = v_room and user_id = u[1]) = 0 then
    raise exception 'FAIL [a block leaked to another member]';
  end if;
  checks := checks + 1;
  reset role;

  -- Reports: reporters stop seeing the message; three reporters hide it for others,
  -- never for its author. Own messages and non-members cannot report.
  perform set_config('request.jwt.claims', json_build_object('sub', u[1], 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', u[1]::text, true);
  select id into v_msg2 from public.post_course_room_message(v_room, 'Achetez mes fiches');
  begin
    perform public.report_course_message(v_msg2, 'spam');
    raise exception 'FAIL [own report accepted]';
  exception when raise_exception then
    if sqlerrm like 'FAIL%' then raise; end if;
    checks := checks + 1;
  end;
  perform set_config('request.jwt.claims', json_build_object('sub', u[3], 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', u[3]::text, true);
  begin
    perform public.report_course_message(v_msg2, 'spam');
    raise exception 'FAIL [non-member report accepted]';
  exception when raise_exception then
    if sqlerrm like 'FAIL%' then raise; end if;
    checks := checks + 1;
  end;
  perform set_config('request.jwt.claims', json_build_object('sub', u[2], 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', u[2]::text, true);
  perform public.report_course_message(v_msg2, 'spam');
  set local role authenticated;
  if exists (select 1 from public.community_messages where id = v_msg2) then
    raise exception 'FAIL [reporter still sees the message]';
  end if;
  checks := checks + 1;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', u[5], 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', u[5]::text, true);
  set local role authenticated;
  if not exists (select 1 from public.community_messages where id = v_msg2) then
    raise exception 'FAIL [one report hid the message for everyone]';
  end if;
  checks := checks + 1;
  reset role;
  perform public.report_course_message(v_msg2, 'abuse');
  perform set_config('request.jwt.claims', json_build_object('sub', u[4], 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', u[4]::text, true);
  perform public.report_course_message(v_msg2, 'other');
  if (select hidden_at from public.community_messages where id = v_msg2) is null then
    raise exception 'FAIL [three reports did not hide]';
  end if;
  checks := checks + 1;
  perform set_config('request.jwt.claims', json_build_object('sub', u[6], 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', u[6]::text, true);
  perform public.join_course_room(v_offer_a);
  set local role authenticated;
  if exists (select 1 from public.community_messages where id = v_msg2) then
    raise exception 'FAIL [hidden message visible to members]';
  end if;
  checks := checks + 1;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', u[1], 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', u[1]::text, true);
  set local role authenticated;
  if not exists (select 1 from public.community_messages where id = v_msg2) then
    raise exception 'FAIL [author lost their hidden message]';
  end if;
  checks := checks + 1;
  begin
    perform * from public.admin_course_reports();
    raise exception 'FAIL [admin reports open to students]';
  exception when raise_exception then
    if sqlerrm like 'FAIL%' then raise; end if;
    checks := checks + 1;
  end;
  reset role;

  -- Admin path: student 6 is made an admin through the owner-only function
  -- (migration v56 refuses any other way), inside this rolled-back transaction.
  perform public.set_admin_role(u[6], true, 'course spaces test fixture');
  v_admin := u[6];
  if v_admin is not null then
    perform set_config('request.jwt.claims', json_build_object('sub', u[6], 'role', 'authenticated')::text, true);
    perform set_config('request.jwt.claim.sub', u[6]::text, true);
    set local role authenticated;
    if not exists (select 1 from public.admin_course_reports() r where r.message_id = v_msg2 and r.reports = 3 and r.hidden) then
      raise exception 'FAIL [admin does not see the report]';
    end if;
    perform public.admin_resolve_course_report(v_msg2, false);
    reset role;
    if (select hidden_at from public.community_messages where id = v_msg2) is not null
       or exists (select 1 from public.course_message_reports where message_id = v_msg2 and resolved_at is null) then
      raise exception 'FAIL [admin dismiss]';
    end if;
    set local role authenticated;
    perform public.admin_resolve_course_report(v_msg2, true);
    reset role;
    if exists (select 1 from public.community_messages where id = v_msg2) then
      raise exception 'FAIL [admin removal]';
    end if;
    checks := checks + 1;
  end if;

  -- Legacy Communities data: private, nothing deleted, no new legacy posts.
  perform set_config('request.jwt.claims', json_build_object('sub', u[1], 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', u[1]::text, true);
  insert into public.community_messages (community, user_id, content)
  values (inst_a, u[1], 'Ancien message') returning id into v_legacy;
  insert into public.study_space_members (user_id, space_id) values (u[1], inst_a) on conflict do nothing;
  perform set_config('request.jwt.claims', json_build_object('sub', u[2], 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', u[2]::text, true);
  set local role authenticated;
  if exists (select 1 from public.community_messages where id = v_legacy)
     or exists (select 1 from public.study_space_members where user_id = u[1]) then
    raise exception 'FAIL [legacy data readable by others]';
  end if;
  checks := checks + 1;
  begin
    insert into public.community_messages (community, user_id, content) values (inst_a, u[2], 'legacy post');
    raise exception 'FAIL [legacy post accepted]';
  exception when insufficient_privilege then checks := checks + 1;
  end;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', u[1], 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', u[1]::text, true);
  set local role authenticated;
  if not exists (select 1 from public.community_messages where id = v_legacy)
     or not exists (select 1 from public.study_space_members where user_id = u[1]) then
    raise exception 'FAIL [author lost legacy data]';
  end if;
  checks := checks + 1;
  reset role;

  -- The existing badge rule still counts course-space messages (no gamification change).
  if (select count(*) from public.community_messages where user_id = u[2]) < 6 then
    raise exception 'FAIL [course space messages outside community_messages]';
  end if;
  checks := checks + 1;

  -- Anonymous visitors reach nothing.
  set local role anon;
  begin
    perform 1 from public.course_room_members;
    raise exception 'FAIL [anon reads memberships]';
  exception when insufficient_privilege then checks := checks + 1;
  end;
  begin
    perform public.join_course_room(v_offer_a);
    raise exception 'FAIL [anon joins]';
  exception when insufficient_privilege then checks := checks + 1;
  end;
  reset role;

  raise exception 'COURSE SPACES TESTS PASSED: % checks (everything rolled back)', checks;
end
$tests$;
