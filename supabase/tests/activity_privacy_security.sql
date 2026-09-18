-- Activity privacy: audience, blocking in both directions, write rules.
-- Creates throw-away students and posts, runs the real policies as those
-- students (role `authenticated`), then raises an exception so NOTHING is kept.
-- Run in the Supabase SQL editor or MCP execute_sql after
-- 20260918120000_activity_blocks.sql.
--
-- Expected result: an error whose message starts with "ACTIVITY TESTS PASSED".
-- Any message starting with "FAIL" names the broken check.

do $tests$
declare
  suffix constant text := substr(md5(clock_timestamp()::text), 1, 8);
  u uuid[] := array(select gen_random_uuid() from generate_series(1, 4));
  checks integer := 0;
  v_public uuid;
  v_friends uuid;
  v_blocker_post uuid;
  n integer;
begin
  -- u1 = the reader. u2 = a friend. u3 = a stranger the reader blocks.
  -- u4 = a stranger who blocks the reader.
  insert into auth.users (id, email, raw_user_meta_data)
  select u[i], 'activity-' || suffix || '-' || i || '@example.invalid',
    jsonb_build_object('pseudo', 'act' || suffix || i, 'study_year', 'BAC 1')
  from generate_series(1, 4) as i;

  -- Every row is written under its own author's claims: the insert rate-limit
  -- trigger refuses a write with no signed-in student behind it.
  perform set_config('request.jwt.claims', json_build_object('sub', u[1], 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', u[1]::text, true);
  insert into public.friendships (requester, addressee, status) values (u[1], u[2], 'accepted');
  perform set_config('request.jwt.claims', json_build_object('sub', u[3], 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', u[3]::text, true);
  insert into public.posts (user_id, image_url, caption, visibility)
  values (u[3], 'x', 'public de u3', 'public') returning id into v_public;
  perform set_config('request.jwt.claims', json_build_object('sub', u[2], 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', u[2]::text, true);
  insert into public.posts (user_id, image_url, caption, visibility)
  values (u[2], 'x', 'amis de u2', 'friends') returning id into v_friends;
  perform set_config('request.jwt.claims', json_build_object('sub', u[1], 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', u[1]::text, true);
  insert into public.posts (user_id, image_url, caption, visibility)
  values (u[1], 'x', 'post du lecteur', 'public') returning id into v_blocker_post;

  -- Before any block: the reader sees the public post and their friend's
  -- friends-only post, and nothing from the unrelated stranger u4.
  perform set_config('request.jwt.claims', json_build_object('sub', u[1], 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', u[1]::text, true);
  set local role authenticated;
  if not exists (select 1 from public.posts where id = v_public)
     or not exists (select 1 from public.posts where id = v_friends) then
    raise exception 'FAIL [audience rules broken before blocking]';
  end if;
  checks := checks + 1;
  reset role;

  -- A stranger cannot read a friends-only post: the existing rule is intact.
  perform set_config('request.jwt.claims', json_build_object('sub', u[3], 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', u[3]::text, true);
  set local role authenticated;
  if exists (select 1 from public.posts where id = v_friends) then
    raise exception 'FAIL [friends-only post leaked to a stranger]';
  end if;
  checks := checks + 1;
  reset role;

  -- The reader blocks u3.
  perform set_config('request.jwt.claims', json_build_object('sub', u[1], 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', u[1]::text, true);
  set local role authenticated;
  insert into public.user_blocks (blocker_id, blocked_id) values (u[1], u[3]);
  if exists (select 1 from public.posts where id = v_public) then
    raise exception 'FAIL [a blocked student still appears in the timeline]';
  end if;
  checks := checks + 1;
  reset role;

  -- u4 blocks the reader. The reader must stop seeing u4 — without any way to
  -- learn that they were blocked.
  perform set_config('request.jwt.claims', json_build_object('sub', u[4], 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', u[4]::text, true);
  set local role authenticated;
  insert into public.user_blocks (blocker_id, blocked_id) values (u[4], u[1]);
  reset role;
  declare v_u4 uuid;
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', u[4], 'role', 'authenticated')::text, true);
    perform set_config('request.jwt.claim.sub', u[4]::text, true);
    insert into public.posts (user_id, image_url, caption, visibility)
    values (u[4], 'x', 'public de u4', 'public') returning id into v_u4;
    perform set_config('request.jwt.claims', json_build_object('sub', u[1], 'role', 'authenticated')::text, true);
    perform set_config('request.jwt.claim.sub', u[1]::text, true);
    set local role authenticated;
    if exists (select 1 from public.posts where id = v_u4) then
      raise exception 'FAIL [a student who blocked me still reaches my timeline]';
    end if;
    checks := checks + 1;
    if exists (select 1 from public.user_blocks where blocker_id <> u[1]) then
      raise exception 'FAIL [blocks of other students are readable]';
    end if;
    checks := checks + 1;
    reset role;
  end;

  -- A blocked student cannot encourage or comment the blocker's post.
  perform set_config('request.jwt.claims', json_build_object('sub', u[3], 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', u[3]::text, true);
  set local role authenticated;
  begin
    insert into public.likes (post_id, user_id, emoji) values (v_blocker_post, u[3], '👍');
    raise exception 'FAIL [a blocked student reacted to the blocker post]';
  exception when insufficient_privilege then checks := checks + 1;
  end;
  begin
    insert into public.comments (post_id, user_id, content) values (v_blocker_post, u[3], 'coucou');
    raise exception 'FAIL [a blocked student commented the blocker post]';
  exception when insufficient_privilege then checks := checks + 1;
  end;
  reset role;

  -- A friend still can: blocking is the exception, not the rule.
  perform set_config('request.jwt.claims', json_build_object('sub', u[2], 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', u[2]::text, true);
  set local role authenticated;
  insert into public.likes (post_id, user_id, emoji) values (v_blocker_post, u[2], '👍');
  insert into public.comments (post_id, user_id, content) values (v_blocker_post, u[2], 'bravo');
  checks := checks + 1;
  -- Nobody may write in someone else's name.
  begin
    insert into public.likes (post_id, user_id, emoji) values (v_blocker_post, u[1], '👍');
    raise exception 'FAIL [a reaction was written in someone else name]';
  exception when insufficient_privilege then checks := checks + 1;
  end;
  reset role;

  -- The reader no longer sees the reactions and comments of a blocked student.
  perform set_config('request.jwt.claims', json_build_object('sub', u[3], 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', u[3]::text, true);
  insert into public.likes (post_id, user_id, emoji) values (v_friends, u[3], '👍');
  perform set_config('request.jwt.claims', json_build_object('sub', u[1], 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', u[1]::text, true);
  set local role authenticated;
  select count(*) into n from public.likes where post_id = v_friends and user_id = u[3];
  if n <> 0 then
    raise exception 'FAIL [a blocked student reaction is still visible]';
  end if;
  checks := checks + 1;
  -- The reader still reads their own post, its encouragement and its comment.
  if not exists (select 1 from public.posts where id = v_blocker_post)
     or not exists (select 1 from public.likes where post_id = v_blocker_post and user_id = u[2])
     or not exists (select 1 from public.comments where post_id = v_blocker_post and user_id = u[2]) then
    raise exception 'FAIL [blocking hid legitimate activity]';
  end if;
  checks := checks + 1;
  reset role;

  -- Anonymous visitors reach nothing, and the helper stays internal.
  -- An anonymous visitor reaches nothing: no policy names `anon`, so the
  -- table answers an empty set rather than refusing — either way, no row.
  set local role anon;
  select count(*) into n from public.posts;
  if n <> 0 then
    raise exception 'FAIL [anon reads posts]';
  end if;
  checks := checks + 1;
  reset role;
  set local role authenticated;
  begin
    perform public.activity_blocked_with(u[3]);
    checks := checks + 1;  -- readable by a signed-in student about themselves
  exception when insufficient_privilege then
    raise exception 'FAIL [the block helper is not callable by the app]';
  end;
  reset role;

  -- The dead table is gone.
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'post_views') then
    raise exception 'FAIL [post_views still exists]';
  end if;
  checks := checks + 1;

  raise exception 'ACTIVITY TESTS PASSED: % checks (everything rolled back)', checks;
end
$tests$;
