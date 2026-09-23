-- Admin redesign, phase 1: permission matrix.
--
-- Three identities are exercised against the real policies, triggers and
-- functions: a normal member, a suspended member and an admin — plus the
-- server-only functions (service role) and the owner-only admin-role function.
-- Creates throw-away students, a throw-away institution and course room, runs
-- everything as those students (role `authenticated`), then raises an
-- exception so NOTHING is kept.
--
-- Run after migrations v55–v60, or in the SAME execute_sql call right after
-- their SQL as a dry-run before applying them (one call = one transaction).
--
-- Expected result: an error whose message starts with
-- "ADMIN PHASE 1 TESTS PASSED". Any message starting with "FAIL" names the
-- broken check.

do $tests$
declare
  suffix constant text := substr(md5(clock_timestamp()::text), 1, 8);
  inst constant text := 'zz-admin-p1-' || suffix;
  -- u1 = N (normal member)   u2 = B (friend of N and S)   u3 = S (suspended)
  -- u4 = A (admin)           u5 = T (moderation / deletion target)
  -- u6 = a second admin, only to prove that admins cannot be deleted here.
  u uuid[] := array(select gen_random_uuid() from generate_series(1, 6));
  checks integer := 0;
  n integer;
  r record;
  v_json jsonb;
  v_text text;
  v_bool boolean;
  v_ids uuid[];
  v_room uuid;
  m uuid[] := array[]::uuid[];
  v_msg uuid;
  v_msg_s uuid;
  v_post_n uuid;
  v_post_s uuid;
  v_post_b uuid;
  v_post_b_friends uuid;
  v_comment uuid;
  v_fb uuid;
  v_ann uuid;
  v_week date;
  v_deleted_before integer;
  v_last_admin uuid;
  base timestamptz := now() - interval '2 hours';
begin
  -- ── Fixtures (as the database owner; each row under its author's claims,
  --    because the insert rate-limit triggers need a signed-in student) ──────
  insert into auth.users (id, email, created_at, raw_user_meta_data)
  select u[i], 'admin-p1-' || suffix || '-' || i || '@example.invalid',
    now() - interval '3 days',
    jsonb_build_object('pseudo', 'ap1' || suffix || i, 'study_year', 'BAC 1')
  from generate_series(1, 6) as i;

  -- A becomes admin through the owner-only mechanism (this also proves it works).
  v_json := public.set_admin_role(u[4], true, 'phase 1 test fixture');
  if coalesce((v_json->>'changed')::boolean, false) is not true then
    raise exception 'FAIL [set_admin_role did not grant the fixture admin]';
  end if;
  checks := checks + 1;

  perform set_config('request.jwt.claims', json_build_object('sub', u[1], 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', u[1]::text, true);
  insert into public.friendships (requester, addressee, status) values (u[1], u[2], 'accepted');
  insert into public.posts (user_id, image_url, caption, visibility)
  values (u[1], 'x', 'public de N', 'public') returning id into v_post_n;
  insert into public.app_feedback (user_id, type, message)
  values (u[1], 'suggestion', 'idée de test') returning id into v_fb;
  insert into public.study_spaces (id, kind, name, parent_id)
  values (inst, 'university', 'Blocus Admin P1 ' || suffix, 'study-hub');

  perform set_config('request.jwt.claims', json_build_object('sub', u[2], 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', u[2]::text, true);
  insert into public.posts (user_id, image_url, caption, visibility)
  values (u[2], 'x', 'public de B', 'public') returning id into v_post_b;
  insert into public.posts (user_id, image_url, caption, visibility)
  values (u[2], 'x', 'amis de B', 'friends') returning id into v_post_b_friends;

  perform set_config('request.jwt.claims', json_build_object('sub', u[1], 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', u[1]::text, true);
  insert into public.comments (post_id, user_id, content)
  values (v_post_b, u[1], 'bravo') returning id into v_comment;

  perform set_config('request.jwt.claims', json_build_object('sub', u[3], 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', u[3]::text, true);
  insert into public.friendships (requester, addressee, status) values (u[3], u[2], 'accepted');
  insert into public.posts (user_id, image_url, caption, visibility)
  values (u[3], 'x', 'public de S', 'public') returning id into v_post_s;
  insert into public.likes (post_id, user_id, emoji) values (v_post_b, u[3], '👍');
  insert into public.private_messages (sender_id, receiver_id, content)
  values (u[3], u[2], 'message envoyé avant la suspension');
  insert into public.sessions (user_id, started_at, ended_at, duration_seconds)
  values (u[3], now() - interval '1 day', now() - interval '1 day' + interval '30 minutes', 1800);

  -- T studied 15 minutes an hour after signing up: activated within 168 h.
  perform set_config('request.jwt.claims', json_build_object('sub', u[5], 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', u[5]::text, true);
  insert into public.sessions (user_id, started_at, ended_at, duration_seconds)
  values (u[5], now() - interval '3 days' + interval '1 hour',
          now() - interval '3 days' + interval '1 hour' + interval '15 minutes', 900);

  -- A course room with seven messages in a known order, plus one by S.
  insert into public.course_rooms (kind, institution_id, title)
  values ('university', inst, 'Salon admin P1 ' || suffix) returning id into v_room;
  insert into public.course_room_members (room_id, user_id)
  values (v_room, u[1]), (v_room, u[2]), (v_room, u[3]), (v_room, u[5]);
  for i in 1..7 loop
    perform set_config('request.jwt.claims', json_build_object('sub', u[(array[1, 2, 5])[1 + (i - 1) % 3]], 'role', 'authenticated')::text, true);
    perform set_config('request.jwt.claim.sub', u[(array[1, 2, 5])[1 + (i - 1) % 3]]::text, true);
    insert into public.community_messages (room_id, user_id, content)
    values (v_room, u[(array[1, 2, 5])[1 + (i - 1) % 3]], 'message ' || i)
    returning id into v_msg;
    update public.community_messages set created_at = base + (i * interval '5 minutes') where id = v_msg;
    m := m || v_msg;
  end loop;
  perform set_config('request.jwt.claims', json_build_object('sub', u[3], 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', u[3]::text, true);
  insert into public.community_messages (room_id, user_id, content)
  values (v_room, u[3], 'message de S') returning id into v_msg_s;
  update public.community_messages set created_at = base + interval '1 hour' where id = v_msg_s;

  -- B reports message 4 (written by N) through the real member function.
  perform set_config('request.jwt.claims', json_build_object('sub', u[2], 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', u[2]::text, true);
  set local role authenticated;
  perform public.report_course_message(m[4], 'abuse');
  reset role;
  if not exists (select 1 from public.course_message_reports where message_id = m[4] and resolved_at is null) then
    raise exception 'FAIL [a member could not report a message]';
  end if;
  checks := checks + 1;

  -- ── A. Privileges that no role of the app may hold ────────────────────────
  for r in
    select * from (values
      ('public.set_admin_role(uuid,boolean,text)',                     false, false, false),
      ('public.log_admin_action(uuid,text,uuid,text,text,text,jsonb,text)', false, false, true),
      ('public.assert_admin()',                                        false, false, false),
      ('public.assert_admin_actor(uuid)',                              false, false, false),
      ('public.deletion_snapshot(uuid)',                               false, false, false),
      ('public.admin_moderate_profile(uuid,uuid,text,text)',           false, false, true),
      ('public.admin_set_suspension(uuid,uuid,boolean,text)',          false, false, true),
      ('public.admin_delete_account(uuid,uuid,text)',                  false, false, true),
      ('public.admin_delete_user(uuid)',                               false, false, null),
      ('public.admin_course_report_context(uuid)',                     false, true,  null),
      ('public.admin_remove_post(uuid,text)',                          false, true,  null),
      ('public.admin_remove_comment(uuid,text)',                       false, true,  null)
    ) as t(fn, for_anon, for_authenticated, for_service)
  loop
    if has_function_privilege('anon', r.fn, 'execute') <> r.for_anon
       or has_function_privilege('authenticated', r.fn, 'execute') <> r.for_authenticated
       or (r.for_service is not null and has_function_privilege('service_role', r.fn, 'execute') <> r.for_service) then
      raise exception 'FAIL [wrong execute privileges on %]', r.fn;
    end if;
    checks := checks + 1;
  end loop;

  if has_column_privilege('authenticated', 'public.profiles', 'is_admin', 'UPDATE')
     or has_column_privilege('authenticated', 'public.profiles', 'locked', 'UPDATE')
     or has_column_privilege('anon', 'public.profiles', 'is_admin', 'UPDATE') then
    raise exception 'FAIL [a client role can still write is_admin or locked]';
  end if;
  if not has_column_privilege('authenticated', 'public.profiles', 'bio', 'UPDATE') then
    raise exception 'FAIL [members lost the right to edit their bio]';
  end if;
  checks := checks + 1;

  if has_table_privilege('authenticated', 'public.admin_audit_log', 'INSERT')
     or has_table_privilege('authenticated', 'public.admin_audit_log', 'UPDATE')
     or has_table_privilege('authenticated', 'public.admin_audit_log', 'DELETE')
     or has_table_privilege('service_role', 'public.admin_audit_log', 'INSERT')
     or has_table_privilege('authenticated', 'public.system_job_runs', 'INSERT') then
    raise exception 'FAIL [a client can write an admin journal]';
  end if;
  checks := checks + 1;

  select count(*) into n
  from pg_class c
  join pg_namespace ns on ns.oid = c.relnamespace
  where ns.nspname = 'public' and c.relkind = 'r'
    and c.relname not in ('admin_audit_log', 'system_job_runs', 'deleted_accounts')
    and not exists (
      select 1 from pg_trigger t where t.tgrelid = c.oid and t.tgname = 'a00_block_suspended_actor'
    );
  if n > 0 then
    raise exception 'FAIL [% table(s) without the suspension trigger]', n;
  end if;
  checks := checks + 1;

  if exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and policyname in ('admin_update_profiles', 'posts_read_admin', 'comments_read_admin',
                         'likes_read_admin', 'admin_delete_posts')
  ) then
    raise exception 'FAIL [an open admin policy is still in place]';
  end if;
  checks := checks + 1;

  -- ── B. Normal member ───────────────────────────────────────────────────────
  perform set_config('request.jwt.claims', json_build_object('sub', u[1], 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', u[1]::text, true);
  set local role authenticated;

  update public.profiles set bio = 'bio de N' where id = u[1];
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'FAIL [a member cannot edit their own bio]'; end if;
  checks := checks + 1;

  begin
    update public.profiles set is_admin = true where id = u[1];
    raise exception 'FAIL [a member made themselves admin]';
  exception when insufficient_privilege then checks := checks + 1;
  end;
  begin
    update public.profiles set locked = true where id = u[1];
    raise exception 'FAIL [a member changed a suspension flag]';
  exception when insufficient_privilege then checks := checks + 1;
  end;

  update public.profiles set bio = 'modifié par N' where id = u[5];
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL [a member edited another profile]'; end if;
  checks := checks + 1;

  begin
    perform public.set_admin_role(u[1], true, 'self promotion');
    raise exception 'FAIL [a member ran set_admin_role]';
  exception when insufficient_privilege then checks := checks + 1;
  end;
  begin
    perform public.admin_set_suspension(u[1], u[5], true, 'from a member');
    raise exception 'FAIL [a member ran admin_set_suspension]';
  exception when insufficient_privilege then checks := checks + 1;
  end;
  begin
    perform public.admin_delete_account(u[1], u[5], 'from a member');
    raise exception 'FAIL [a member ran admin_delete_account]';
  exception when insufficient_privilege then checks := checks + 1;
  end;
  begin
    perform public.admin_moderate_profile(u[1], u[5], 'clear_bio', 'from a member');
    raise exception 'FAIL [a member ran admin_moderate_profile]';
  exception when insufficient_privilege then checks := checks + 1;
  end;
  begin
    perform public.log_admin_action(u[1], 'forged_entry');
    raise exception 'FAIL [a member wrote in the admin journal]';
  exception when insufficient_privilege then checks := checks + 1;
  end;
  begin
    perform public.admin_remove_post(v_post_b, 'from a member');
    raise exception 'FAIL [a member removed a post as admin]';
  exception when insufficient_privilege then checks := checks + 1;
  end;
  begin
    perform 1 from public.admin_course_report_context(m[4]);
    raise exception 'FAIL [a member read a report context]';
  exception when insufficient_privilege then checks := checks + 1;
  end;
  begin
    insert into public.admin_audit_log (action) values ('forged_entry');
    raise exception 'FAIL [a member inserted into the admin journal]';
  exception when insufficient_privilege then checks := checks + 1;
  end;
  begin
    insert into public.system_job_runs (job) values ('forged_job');
    raise exception 'FAIL [a member inserted a job run]';
  exception when insufficient_privilege then checks := checks + 1;
  end;

  select count(*) into n from public.admin_audit_log;
  if n <> 0 then raise exception 'FAIL [a member read the admin journal]'; end if;
  checks := checks + 1;

  -- Everyday writes still work for a member in good standing.
  insert into public.sessions (user_id, started_at, ended_at, duration_seconds)
  values (u[1], now() - interval '1 day', now() - interval '1 day' + interval '20 minutes', 1200);
  insert into public.posts (user_id, image_url, caption, visibility)
  values (u[1], 'x', 'autre publication de N', 'public');
  insert into public.private_messages (sender_id, receiver_id, content) values (u[1], u[2], 'salut');
  if not exists (select 1 from public.posts where id = v_post_b) then
    raise exception 'FAIL [a member no longer sees a public post]';
  end if;
  checks := checks + 1;
  reset role;

  -- ── C. Suspending S (server-only function, as the database owner) ─────────
  perform set_config('request.jwt.claims', '', true);
  perform set_config('request.jwt.claim.sub', '', true);

  begin
    perform public.admin_set_suspension(u[1], u[3], true, 'actor is not an admin');
    raise exception 'FAIL [a non-admin actor suspended someone]';
  exception when insufficient_privilege then checks := checks + 1;
  end;
  begin
    perform public.admin_set_suspension(u[4], u[3], true, '');
    raise exception 'FAIL [a suspension without a reason was accepted]';
  exception when invalid_parameter_value then checks := checks + 1;
  end;
  begin
    perform public.admin_set_suspension(u[4], u[4], true, 'suspending myself');
    raise exception 'FAIL [an admin suspended themselves]';
  exception when insufficient_privilege then checks := checks + 1;
  end;

  v_json := public.admin_set_suspension(u[4], u[3], true, 'test suspension');
  if not (select locked from public.profiles where id = u[3]) then
    raise exception 'FAIL [the suspension did not apply]';
  end if;
  if not exists (
    select 1 from public.admin_audit_log
    where action = 'member_suspended' and actor_id = u[4] and target_user_id = u[3]
      and reason = 'test suspension'
  ) then
    raise exception 'FAIL [the suspension is not in the admin journal]';
  end if;
  checks := checks + 1;

  begin
    update public.profiles set locked = false where id = u[3];
    raise exception 'FAIL [the owner lifted a suspension outside the protected function]';
  exception when insufficient_privilege then checks := checks + 1;
  end;
  begin
    update public.profiles set is_admin = true where id = u[5];
    raise exception 'FAIL [the owner granted admin outside the protected function]';
  exception when insufficient_privilege then checks := checks + 1;
  end;

  -- ── D. Suspended member ────────────────────────────────────────────────────
  perform set_config('request.jwt.claims', json_build_object('sub', u[3], 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', u[3]::text, true);
  set local role authenticated;

  begin
    insert into public.sessions (user_id, started_at, ended_at, duration_seconds)
    values (u[3], now() - interval '2 hours', now() - interval '1 hour', 3600);
    raise exception 'FAIL [a suspended member recorded a session]';
  exception when insufficient_privilege then checks := checks + 1;
  end;
  begin
    update public.profiles set bio = 'toujours là' where id = u[3];
    raise exception 'FAIL [a suspended member edited their profile]';
  exception when insufficient_privilege then checks := checks + 1;
  end;
  begin
    insert into public.posts (user_id, image_url, caption, visibility) values (u[3], 'x', 'nouveau', 'public');
    raise exception 'FAIL [a suspended member published]';
  exception when insufficient_privilege then checks := checks + 1;
  end;
  begin
    insert into public.private_messages (sender_id, receiver_id, content) values (u[3], u[2], 'encore moi');
    raise exception 'FAIL [a suspended member sent a private message]';
  exception when insufficient_privilege then checks := checks + 1;
  end;
  begin
    insert into public.friendships (requester, addressee, status) values (u[3], u[1], 'pending');
    raise exception 'FAIL [a suspended member sent a friend request]';
  exception when insufficient_privilege then checks := checks + 1;
  end;
  begin
    delete from public.posts where id = v_post_s;
    raise exception 'FAIL [a suspended member deleted content]';
  exception when insufficient_privilege then checks := checks + 1;
  end;
  -- Through a SECURITY DEFINER member function (bypasses policies, not triggers).
  begin
    perform public.report_course_message(m[2], 'spam');
    raise exception 'FAIL [a suspended member wrote through a member function]';
  exception when insufficient_privilege then checks := checks + 1;
  end;

  select locked into v_bool from public.profiles where id = u[3];
  if not coalesce(v_bool, false) then
    raise exception 'FAIL [a suspended member cannot read their own suspension]';
  end if;
  checks := checks + 1;
  reset role;

  -- ── E. Everyone else: a suspended member disappears and cannot be contacted ─
  perform set_config('request.jwt.claims', json_build_object('sub', u[2], 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', u[2]::text, true);
  set local role authenticated;

  if exists (select 1 from public.posts where id = v_post_s) then
    raise exception 'FAIL [a suspended member post is still visible]';
  end if;
  if exists (select 1 from public.likes where post_id = v_post_b and user_id = u[3]) then
    raise exception 'FAIL [a suspended member reaction is still visible]';
  end if;
  if exists (select 1 from public.community_messages where id = v_msg_s) then
    raise exception 'FAIL [a suspended member room message is still visible]';
  end if;
  if not exists (select 1 from public.community_messages where id = m[1]) then
    raise exception 'FAIL [a room member no longer reads the room]';
  end if;
  checks := checks + 1;

  if not exists (
    select 1 from public.private_messages where sender_id = u[3] and receiver_id = u[2]
  ) then
    raise exception 'FAIL [the conversation history with a suspended member vanished]';
  end if;
  checks := checks + 1;

  begin
    insert into public.private_messages (sender_id, receiver_id, content) values (u[2], u[3], 'coucou');
    raise exception 'FAIL [a message reached a suspended member]';
  exception when insufficient_privilege then checks := checks + 1;
  end;

  select count(*) into n from public.get_leaderboard_v2('week', 'time', 'all', null, null, null) lb
  where lb.user_id = u[3];
  if n > 0 then raise exception 'FAIL [a suspended member is in the leaderboard]'; end if;
  select count(*) into n from public.get_public_leaderboard('week', null) lb where lb.user_id = u[3];
  if n > 0 then raise exception 'FAIL [a suspended member is in the legacy leaderboard]'; end if;
  checks := checks + 1;
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub', u[1], 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', u[1]::text, true);
  set local role authenticated;
  begin
    insert into public.friendships (requester, addressee, status) values (u[1], u[3], 'pending');
    raise exception 'FAIL [a friend request reached a suspended member]';
  exception when insufficient_privilege then checks := checks + 1;
  end;
  reset role;

  -- ── F. Admin ───────────────────────────────────────────────────────────────
  perform set_config('request.jwt.claims', json_build_object('sub', u[4], 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', u[4]::text, true);
  set local role authenticated;

  select count(*) into n from public.community_messages where room_id = v_room;
  if n <> 0 then raise exception 'FAIL [an admin read a course room: % rows]', n; end if;
  checks := checks + 1;

  select array_agg(c.message_id order by c.created_at, c.message_id),
         string_agg(c.message_position, ',' order by c.created_at, c.message_id)
  into v_ids, v_text
  from public.admin_course_report_context(m[4]) c;
  if v_ids is distinct from array[m[2], m[3], m[4], m[5], m[6]]
     or v_text is distinct from 'before,before,reported,after,after' then
    raise exception 'FAIL [report context is not 2 before + reported + 2 after: %]', v_text;
  end if;
  checks := checks + 1;

  begin
    perform 1 from public.admin_course_report_context(m[7]);
    raise exception 'FAIL [an admin read the context of an unreported message]';
  exception when insufficient_privilege then checks := checks + 1;
  end;

  if exists (select 1 from public.posts where id = v_post_b_friends) then
    raise exception 'FAIL [an admin read a friends-only post]';
  end if;
  checks := checks + 1;

  delete from public.posts where id = v_post_n;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL [an admin deleted a post outside the audited function]'; end if;
  checks := checks + 1;

  update public.profiles set bio = 'modifié par un admin' where id = u[5];
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL [an admin edited a profile freely]'; end if;
  checks := checks + 1;

  begin
    update public.profiles set is_admin = true where id = u[5];
    raise exception 'FAIL [an admin granted admin from the client]';
  exception when insufficient_privilege then checks := checks + 1;
  end;
  begin
    perform public.set_admin_role(u[5], true, 'from the admin client');
    raise exception 'FAIL [an admin ran set_admin_role from the client]';
  exception when insufficient_privilege then checks := checks + 1;
  end;
  begin
    perform public.admin_set_suspension(u[4], u[5], true, 'from the admin client');
    raise exception 'FAIL [an admin ran a server-only function from the client]';
  exception when insufficient_privilege then checks := checks + 1;
  end;
  begin
    perform public.admin_delete_account(u[4], u[5], 'from the admin client');
    raise exception 'FAIL [an admin deleted an account from the client]';
  exception when insufficient_privilege then checks := checks + 1;
  end;
  begin
    perform public.log_admin_action(u[4], 'forged_entry');
    raise exception 'FAIL [an admin wrote the journal directly]';
  exception when insufficient_privilege then checks := checks + 1;
  end;

  -- Audited moderation of the activity feed.
  perform public.admin_remove_post(v_post_n, 'test removal');
  perform public.admin_remove_comment(v_comment, 'test removal');

  -- Dismissing the report closes the report-scoped access.
  perform public.admin_resolve_course_report(m[4], false);
  begin
    perform 1 from public.admin_course_report_context(m[4]);
    raise exception 'FAIL [report context still readable after resolution]';
  exception when insufficient_privilege then checks := checks + 1;
  end;

  -- Announcements and feedback, still edited directly, are journaled.
  insert into public.app_announcements (title, message, type, is_active, created_by)
  values ('Annonce de test', 'Message', 'info', true, u[4]) returning id into v_ann;
  update public.app_feedback set status = 'read' where id = v_fb;
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'FAIL [an admin cannot classify a suggestion]'; end if;
  checks := checks + 1;

  select count(*) into n from public.admin_audit_log where actor_id = u[4];
  if n < 5 then raise exception 'FAIL [the admin cannot read the admin journal: % rows]', n; end if;
  checks := checks + 1;

  begin
    insert into public.admin_audit_log (action) values ('forged_entry');
    raise exception 'FAIL [an admin inserted into the journal]';
  exception when insufficient_privilege then checks := checks + 1;
  end;
  begin
    update public.admin_audit_log set reason = 'rewritten' where actor_id = u[4];
    raise exception 'FAIL [an admin rewrote the journal]';
  exception when insufficient_privilege then checks := checks + 1;
  end;
  begin
    delete from public.admin_audit_log where actor_id = u[4];
    raise exception 'FAIL [an admin erased the journal]';
  exception when insufficient_privilege then checks := checks + 1;
  end;
  reset role;

  -- ── G. Journal content and server-only functions (database owner) ─────────
  perform set_config('request.jwt.claims', '', true);
  perform set_config('request.jwt.claim.sub', '', true);

  if exists (select 1 from public.posts where id = v_post_n)
     or exists (select 1 from public.comments where id = v_comment) then
    raise exception 'FAIL [audited removal did not remove]';
  end if;
  for r in
    select * from (values
      ('report_context_viewed'), ('post_removed'), ('comment_removed'), ('report_dismissed'),
      ('announcement_created'), ('feedback_status_changed'), ('admin_role_granted')
    ) as t(action)
  loop
    if not exists (select 1 from public.admin_audit_log where action = r.action and created_at >= now()) then
      raise exception 'FAIL [journal entry missing: %]', r.action;
    end if;
    checks := checks + 1;
  end loop;

  begin
    update public.admin_audit_log set reason = 'rewritten' where actor_id = u[4];
    raise exception 'FAIL [the owner rewrote the journal]';
  exception when insufficient_privilege then checks := checks + 1;
  end;
  begin
    delete from public.admin_audit_log where actor_id = u[4];
    raise exception 'FAIL [the owner erased the journal]';
  exception when insufficient_privilege then checks := checks + 1;
  end;

  -- Targeted moderation.
  update public.profiles set bio = 'bio à retirer', avatar_url = 'https://example.invalid/a.png' where id = u[5];
  v_json := public.admin_moderate_profile(u[4], u[5], 'reset_username', 'offensive name test');
  select pseudo into v_text from public.profiles where id = u[5];
  if v_text not like 'user\_%' or v_text is distinct from v_json->>'pseudo' then
    raise exception 'FAIL [username reset: %]', v_text;
  end if;
  perform public.admin_moderate_profile(u[4], u[5], 'clear_bio', 'test');
  perform public.admin_moderate_profile(u[4], u[5], 'remove_avatar', 'test');
  if exists (select 1 from public.profiles where id = u[5] and (bio is not null or avatar_url is not null)) then
    raise exception 'FAIL [bio or avatar not removed]';
  end if;
  if (select count(*) from public.admin_audit_log where target_user_id = u[5] and action like 'profile_%') <> 3 then
    raise exception 'FAIL [moderation actions not journaled]';
  end if;
  checks := checks + 1;

  begin
    perform public.admin_moderate_profile(u[4], u[4], 'clear_bio', 'moderating myself');
    raise exception 'FAIL [an admin moderated an admin]';
  exception when insufficient_privilege then checks := checks + 1;
  end;
  begin
    perform public.admin_moderate_profile(u[1], u[5], 'clear_bio', 'not an admin');
    raise exception 'FAIL [a non-admin actor moderated a profile]';
  exception when insufficient_privilege then checks := checks + 1;
  end;
  begin
    perform public.admin_moderate_profile(u[4], u[5], 'clear_bio', '');
    raise exception 'FAIL [a moderation without a reason was accepted]';
  exception when invalid_parameter_value then checks := checks + 1;
  end;
  begin
    perform public.admin_moderate_profile(u[4], u[5], 'wipe_everything', 'test');
    raise exception 'FAIL [an unknown moderation action was accepted]';
  exception when invalid_parameter_value then checks := checks + 1;
  end;

  -- Account deletion (server-only, after the route removed the files).
  begin
    perform public.admin_delete_account(u[4], u[4], 'deleting myself');
    raise exception 'FAIL [an admin deleted their own account here]';
  exception when insufficient_privilege then checks := checks + 1;
  end;
  begin
    perform public.admin_delete_account(u[1], u[5], 'not an admin');
    raise exception 'FAIL [a non-admin actor deleted an account]';
  exception when insufficient_privilege then checks := checks + 1;
  end;
  begin
    perform public.admin_delete_account(u[4], u[5], '');
    raise exception 'FAIL [a deletion without a reason was accepted]';
  exception when invalid_parameter_value then checks := checks + 1;
  end;
  perform public.set_admin_role(u[6], true, 'second fixture admin');
  begin
    perform public.admin_delete_account(u[4], u[6], 'deleting an admin');
    raise exception 'FAIL [an admin account was deleted here]';
  exception when insufficient_privilege then checks := checks + 1;
  end;

  select (date_trunc('week', created_at at time zone 'Europe/Brussels'))::date
  into v_week from auth.users where id = u[5];
  select count(*) into v_deleted_before from public.deleted_accounts;
  perform public.admin_delete_account(u[4], u[5], 'test deletion');
  if exists (select 1 from auth.users where id = u[5]) or exists (select 1 from public.profiles where id = u[5]) then
    raise exception 'FAIL [the account survived its deletion]';
  end if;
  if not exists (
    select 1 from public.deleted_accounts
    where deleted_kind = 'admin' and signup_week = v_week and was_activated is true
  ) then
    raise exception 'FAIL [anonymous deletion snapshot is wrong]';
  end if;
  if not exists (
    select 1 from public.admin_audit_log
    where action = 'account_deleted' and target_user_id = u[5] and actor_id = u[4]
  ) then
    raise exception 'FAIL [the deletion is not in the admin journal]';
  end if;
  checks := checks + 1;

  -- A suspended member keeps the right to erase their own account.
  perform set_config('request.jwt.claims', json_build_object('sub', u[3], 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', u[3]::text, true);
  set local role authenticated;
  perform public.self_delete_user();
  reset role;
  perform set_config('request.jwt.claims', '', true);
  perform set_config('request.jwt.claim.sub', '', true);
  if exists (select 1 from auth.users where id = u[3]) then
    raise exception 'FAIL [a suspended member could not delete their own account]';
  end if;
  if (select count(*) from public.deleted_accounts) <> v_deleted_before + 2 then
    raise exception 'FAIL [self-deletion snapshot missing]';
  end if;
  checks := checks + 1;

  -- Admin role: owner-only mechanism, last admin protected.
  v_json := public.set_admin_role(u[6], false, 'end of test');
  v_json := public.set_admin_role(u[4], false, 'end of test');
  if (select is_admin from public.profiles where id = u[4]) then
    raise exception 'FAIL [set_admin_role did not revoke]';
  end if;
  if not exists (
    select 1 from public.admin_audit_log
    where action = 'admin_role_revoked' and target_user_id = u[4] and actor_kind = 'database'
  ) then
    raise exception 'FAIL [admin role change not journaled]';
  end if;
  checks := checks + 1;
  begin
    perform public.set_admin_role(u[1], true, '');
    raise exception 'FAIL [admin role granted without a reason]';
  exception when invalid_parameter_value then checks := checks + 1;
  end;
  if (select count(*) from public.profiles where is_admin) = 1 then
    select id into v_last_admin from public.profiles where is_admin;
    begin
      perform public.set_admin_role(v_last_admin, false, 'removing the last admin');
      raise exception 'FAIL [the last admin was removed]';
    exception when insufficient_privilege then checks := checks + 1;
    end;
  end if;

  raise exception 'ADMIN PHASE 1 TESTS PASSED: % checks (everything rolled back)', checks;
end
$tests$;
