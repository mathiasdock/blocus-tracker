-- Admin redesign, phase 2: analytics definitions, edge cases and access.
--
-- A dated synthetic dataset (spring 2000) is replayed through the four admin
-- read functions of v61 with blocus.analytics_now pinned to 2000-04-12 12:00
-- UTC. Every real account, session, course, report and deletion is dated 2026,
-- after that instant, so the as-of filters keep them all out and every
-- expected value below is exact. The v61 deletion snapshot is exercised with
-- two real deletions (their snapshots are dated today, also outside the
-- replay). Everything runs in one transaction that raises at the end.
--
-- The fixture, relative to T = 2000-04-12 12:00 UTC (CEST, UTC+2):
--   A1  activated, returned, 5 Brussels days, active now and last week
--   A2  one 599-second session only (not a real session)
--   A3  one real session at EXACTLY signup + 168 h: late, returned
--   A4  one real session at signup + 167 h 59 min: activated, not returned
--   A5  activated; second session at EXACTLY signup + 336 h: not returned
--   A6  signed up 2 days ago, nothing yet: pending
--   A7  signed up yesterday, already studied: activated, return window open
--   A8  account without profile
--   A9  admin (excluded everywhere; the caller of the functions)
--   A10 suspended (excluded from every number, listed as suspended)
--   A11 two sessions on the same UTC date but two Brussels days
--   A12 placeholder email (@blocus.local)
--   A13 studies filled in and one course; searchable as « Éloïse »
--   A14 dormant: one real session 40 days ago
--   A15 one 9-hour session (long) 3 days ago: counts 8 h in study-time sums (v61_2)
--   A16 signed up Sunday 23:30 Brussels → week of Monday 2000-03-20
--   A17 signed up Monday 00:30 Brussels (same UTC date) → week of 2000-03-27
--   A18 self-deletes (v61 snapshot), A19 suspended then deleted by the admin
--   D1..D6 anonymous deletion rows dated 2000 (cohort handling)
--
-- Expected output:
--   ERROR: ADMIN ANALYTICS TESTS PASSED: <n> checks (everything rolled back)
do $tests$
declare
  suffix constant text := substr(md5(clock_timestamp()::text), 1, 8);
  t_now constant timestamptz := '2000-04-12 12:00:00+00';
  c1 constant timestamptz := '2000-03-23 12:00:00+00';
  u uuid[] := array(select gen_random_uuid() from generate_series(1, 19));
  inst constant text := 'zz-analytics-' || suffix;
  checks integer := 0;
  v_room uuid;
  v_msg uuid;
  j_today jsonb;
  j_act jsonb;
  j_lists jsonb;
  j_details jsonb;
  j_week jsonb;
  d record;
begin
  execute $ddl$
    create function pg_temp.expect(p_label text, p_got jsonb, p_expected jsonb)
    returns void language plpgsql as $f$
    begin
      if p_got is distinct from p_expected then
        raise exception 'FAIL [%]: expected %, got %', p_label, p_expected, p_got;
      end if;
    end
    $f$
  $ddl$;

  -- ── Accounts ─────────────────────────────────────────────────────────────
  insert into auth.users (id, email, email_confirmed_at, created_at, raw_user_meta_data)
  select u[a.i],
         case when a.i = 12 then 'analytics-' || suffix || '-12@blocus.local'
              else 'analytics-' || suffix || '-' || a.i || '@example.invalid' end,
         a.ts, a.ts,
         jsonb_build_object('pseudo', 'zzt' || suffix || a.i)
  from (values
    (1, c1), (2, c1), (3, c1), (4, c1), (5, c1),
    (6, timestamptz '2000-04-10 12:00+00'),
    (7, timestamptz '2000-04-11 12:00+00'),
    (8, c1), (9, c1), (10, c1), (11, c1), (12, c1), (13, c1),
    (14, timestamptz '2000-02-12 12:00+00'),
    (15, c1),
    (16, timestamptz '2000-03-26 21:30+00'),
    (17, timestamptz '2000-03-26 22:30+00'),
    (18, c1), (19, c1)
  ) as a(i, ts);

  update public.profiles
     set first_name = 'Éloïse', university = 'Université Analytics', broad_field = 'business', study_year = 'BAC 1'
   where id = u[13];
  delete from public.profiles where id = u[8];
  perform public.set_admin_role(u[9], true, 'analytics test fixture');
  perform public.admin_set_suspension(u[9], u[10], true, 'analytics test fixture');

  -- ── v61 deletion snapshots (dated today, so outside the replay) ─────────
  insert into public.sessions (user_id, started_at, ended_at, duration_seconds)
  values (u[18], c1 + interval '1 hour', c1 + interval '1 hour' + interval '1200 seconds', 1200);
  perform set_config('request.jwt.claims', json_build_object('sub', u[18], 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', u[18]::text, true);
  perform public.self_delete_user();
  perform set_config('request.jwt.claims', '', true);
  perform set_config('request.jwt.claim.sub', '', true);
  select * into d from public.deleted_accounts
   where deleted_at >= now() and deleted_kind = 'self' and signup_week = date '2000-03-20';
  if not found or d.was_activated is distinct from true or d.returned_week2 is distinct from false
     or d.was_admin or d.was_suspended then
    raise exception 'FAIL [self-delete snapshot]: %', row_to_json(d);
  end if;
  checks := checks + 1;

  perform public.admin_set_suspension(u[9], u[19], true, 'analytics test fixture');
  perform public.admin_delete_account(u[9], u[19], 'analytics test fixture');
  select * into d from public.deleted_accounts
   where deleted_at >= now() and deleted_kind = 'admin' and signup_week = date '2000-03-20';
  if not found or not d.was_suspended or d.was_admin
     or d.was_activated is distinct from false or d.returned_week2 is distinct from false then
    raise exception 'FAIL [admin-delete snapshot of a suspended account]: %', row_to_json(d);
  end if;
  checks := checks + 1;

  -- ── Sessions (inserted as the database owner, no caller) ───────────────
  insert into public.sessions (user_id, started_at, ended_at, duration_seconds)
  select x.uid, x.st, x.st + make_interval(secs => x.dur), x.dur
  from (values
    (u[1], timestamptz '2000-03-23 13:00+00', 600),
    (u[1], timestamptz '2000-03-25 10:00+00', 1200),
    (u[1], timestamptz '2000-03-27 10:00+00', 1800),
    (u[1], timestamptz '2000-03-30 14:00+00', 3600),
    (u[1], timestamptz '2000-04-10 12:00+00', 2400),
    (u[2], timestamptz '2000-03-23 14:00+00', 599),
    (u[3], timestamptz '2000-03-30 12:00+00', 900),
    (u[4], timestamptz '2000-03-30 11:59+00', 1000),
    (u[5], timestamptz '2000-03-23 13:00+00', 1800),
    (u[5], timestamptz '2000-04-06 12:00+00', 900),
    (u[7], timestamptz '2000-04-11 13:00+00', 1500),
    (u[9], timestamptz '2000-03-23 13:00+00', 3000),
    (u[10], timestamptz '2000-03-23 13:00+00', 3000),
    (u[10], timestamptz '2000-04-10 10:00+00', 1200),
    (u[11], timestamptz '2000-04-05 21:30+00', 700),
    (u[11], timestamptz '2000-04-05 22:30+00', 800),
    (u[14], timestamptz '2000-03-03 12:00+00', 1200),
    (u[15], timestamptz '2000-04-09 12:00+00', 32400)
  ) as x(uid, st, dur);

  -- ── Courses, planning, friends, course room, report, feedback, jobs ────
  insert into public.courses (user_id, name, created_at)
  values (u[13], 'Cours analytics', c1 + interval '2 hours');
  insert into public.objectives (user_id, title, target_minutes, scheduled_date, created_at)
  values (u[1], 'Réviser', 60, date '2000-04-01', timestamptz '2000-04-01 10:00+00'),
         (u[6], 'Réviser', 60, date '2000-04-11', timestamptz '2000-04-11 10:00+00');

  perform set_config('request.jwt.claims', json_build_object('sub', u[1], 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', u[1]::text, true);
  insert into public.friendships (requester, addressee, status, created_at, accepted_at)
  values (u[1], u[3], 'accepted', timestamptz '2000-03-28 10:00+00', timestamptz '2000-03-28 10:00+00');

  perform set_config('request.jwt.claims', json_build_object('sub', u[5], 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', u[5]::text, true);
  insert into public.study_spaces (id, kind, name, parent_id)
  values (inst, 'university', 'Analytics Institution ' || suffix, 'study-hub');
  insert into public.course_rooms (kind, institution_id, title)
  values ('university', inst, 'Analytics Institution ' || suffix)
  returning id into v_room;
  insert into public.community_messages (room_id, user_id, content)
  values (v_room, u[5], 'Question analytics')
  returning id into v_msg;
  update public.community_messages set created_at = timestamptz '2000-04-02 10:00+00' where id = v_msg;
  perform set_config('request.jwt.claims', '', true);
  perform set_config('request.jwt.claim.sub', '', true);

  insert into public.course_message_reports (message_id, reporter_id, reason, created_at)
  values (v_msg, u[1], 'spam', timestamptz '2000-04-03 10:00+00');
  insert into public.app_feedback (user_id, type, message, status, created_at)
  values (u[2], 'bug', 'Analytics fixture', 'new', timestamptz '2000-04-05 10:00+00');
  insert into public.system_job_runs (job, started_at, finished_at, status)
  values ('push_daily', t_now - interval '30 hours', t_now - interval '30 hours' + interval '1 minute', 'ok'),
         ('purge_posts', t_now - interval '2 hours', t_now - interval '2 hours' + interval '10 seconds', 'error');

  insert into public.deleted_accounts
    (deleted_kind, account_age_months, signup_week, was_activated, returned_week2, was_admin, was_suspended, deleted_at)
  values
    ('self', 0, date '2000-03-20', true, true, false, false, timestamptz '2000-04-01 10:00+00'),   -- D1
    ('self', 0, date '2000-03-20', false, false, false, false, timestamptz '2000-04-01 10:00+00'), -- D2
    ('admin', 0, date '2000-03-20', true, true, false, true, timestamptz '2000-04-01 10:00+00'),   -- D3 suspended
    ('self', 0, date '2000-03-20', true, true, true, false, timestamptz '2000-04-01 10:00+00'),    -- D4 admin
    (null, null, null, null, null, false, false, timestamptz '2000-04-01 10:00+00'),               -- D5 no week
    ('self', 0, date '2000-03-27', true, null, false, false, timestamptz '2000-04-02 10:00+00');   -- D6 unknown return

  -- ── Read everything as the admin, through the real API role ────────────
  perform set_config('blocus.analytics_now', t_now::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', u[9], 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', u[9]::text, true);
  set local role authenticated;

  j_today := public.admin_today();
  j_act := public.admin_activation();
  j_lists := jsonb_build_object(
    'all', public.admin_members(null, 'all', 'signup_desc', null, 0),
    'page1', public.admin_members(null, 'all', 'signup_desc', 2, 0),
    'page2', public.admin_members(null, 'all', 'signup_desc', 2, 2),
    'asc', public.admin_members(null, 'all', 'signup_asc', 1, 0),
    'last', public.admin_members(null, 'all', 'last_session_desc', 3, 0),
    't30', public.admin_members(null, 'all', 'time_30d_desc', 1, 0),
    'active', public.admin_members(null, 'active', 'signup_desc', null, 0),
    'none', public.admin_members(null, 'no_real_session', 'signup_desc', null, 0),
    'dormant', public.admin_members(null, 'dormant', 'signup_desc', null, 0),
    'suspended', public.admin_members(null, 'suspended', 'signup_desc', null, 0),
    'eloise', public.admin_members('ELOÏSE', 'all', 'signup_desc', null, 0),
    'at', public.admin_members('@zzt' || suffix || '15', 'all', 'signup_desc', null, 0),
    'uuid', public.admin_members(u[1]::text, 'all', 'signup_desc', null, 0),
    'percent', public.admin_members('%', 'all', 'signup_desc', null, 0)
  );
  j_details := jsonb_build_object(
    'a1', public.admin_member_detail(u[1]),
    'a2', public.admin_member_detail(u[2]),
    'a3', public.admin_member_detail(u[3]),
    'a5', public.admin_member_detail(u[5]),
    'a6', public.admin_member_detail(u[6]),
    'a7', public.admin_member_detail(u[7]),
    'a8', public.admin_member_detail(u[8]),
    'a14', public.admin_member_detail(u[14]),
    'a15', public.admin_member_detail(u[15])
  );

  begin
    perform public.admin_members(null, 'nope');
    raise exception 'FAIL [unknown segment accepted]';
  exception when invalid_parameter_value then checks := checks + 1;
  end;
  begin
    perform public.admin_members(null, 'all', 'nope');
    raise exception 'FAIL [unknown sort accepted]';
  exception when invalid_parameter_value then checks := checks + 1;
  end;
  begin
    perform public.admin_members(null, 'all', 'signup_desc', 0);
    raise exception 'FAIL [page size 0 accepted]';
  exception when invalid_parameter_value then checks := checks + 1;
  end;
  begin
    perform public.admin_members(null, 'all', 'signup_desc', 501);
    raise exception 'FAIL [page size 501 accepted]';
  exception when invalid_parameter_value then checks := checks + 1;
  end;
  begin
    perform public.admin_members(null, 'all', 'signup_desc', 10, -1);
    raise exception 'FAIL [negative offset accepted]';
  exception when invalid_parameter_value then checks := checks + 1;
  end;
  begin
    perform public.admin_member_detail(gen_random_uuid());
    raise exception 'FAIL [unknown member accepted]';
  exception when invalid_parameter_value then checks := checks + 1;
  end;
  -- Internal building blocks stay out of reach, even for an admin.
  begin
    perform * from public.admin_member_facts(now());
    raise exception 'FAIL [admin_member_facts callable by the app]';
  exception when insufficient_privilege then checks := checks + 1;
  end;
  begin
    perform * from public.admin_signup_cohorts(now());
    raise exception 'FAIL [admin_signup_cohorts callable by the app]';
  exception when insufficient_privilege then checks := checks + 1;
  end;
  begin
    perform public.admin_analytics_now();
    raise exception 'FAIL [admin_analytics_now callable by the app]';
  exception when insufficient_privilege then checks := checks + 1;
  end;
  begin
    perform * from public.deletion_snapshot(u[1]);
    raise exception 'FAIL [deletion_snapshot callable by the app]';
  exception when insufficient_privilege then checks := checks + 1;
  end;

  -- A normal member and a suspended member are refused by all four reads.
  perform set_config('request.jwt.claims', json_build_object('sub', u[1], 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', u[1]::text, true);
  begin perform public.admin_today(); raise exception 'FAIL [member reads today]';
  exception when insufficient_privilege then checks := checks + 1; end;
  begin perform public.admin_members(); raise exception 'FAIL [member reads members]';
  exception when insufficient_privilege then checks := checks + 1; end;
  begin perform public.admin_member_detail(u[2]); raise exception 'FAIL [member reads a detail]';
  exception when insufficient_privilege then checks := checks + 1; end;
  begin perform public.admin_activation(); raise exception 'FAIL [member reads activation]';
  exception when insufficient_privilege then checks := checks + 1; end;
  perform set_config('request.jwt.claims', json_build_object('sub', u[10], 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', u[10]::text, true);
  begin perform public.admin_today(); raise exception 'FAIL [suspended member reads today]';
  exception when insufficient_privilege then checks := checks + 1; end;
  begin perform public.admin_members(); raise exception 'FAIL [suspended member reads members]';
  exception when insufficient_privilege then checks := checks + 1; end;
  reset role;
  set local role anon;
  begin perform public.admin_today(); raise exception 'FAIL [anon reads today]';
  exception when insufficient_privilege then checks := checks + 1; end;
  begin perform public.admin_activation(); raise exception 'FAIL [anon reads activation]';
  exception when insufficient_privilege then checks := checks + 1; end;
  reset role;

  -- ── Today ─────────────────────────────────────────────────────────────
  perform pg_temp.expect('today accounts', j_today #> '{members,accounts}', '15');
  perform pg_temp.expect('today suspended', j_today #> '{members,suspended}', '1');
  perform pg_temp.expect('today active', j_today #> '{active_members,current}', '5');
  perform pg_temp.expect('today active previous', j_today #> '{active_members,previous}', '3');
  perform pg_temp.expect('today new accounts', j_today #> '{new_accounts,current}', '2');
  perform pg_temp.expect('today new accounts previous', j_today #> '{new_accounts,previous}', '0');
  perform pg_temp.expect('today study seconds', j_today #> '{study_seconds,current}', '35100');
  perform pg_temp.expect('today study seconds previous', j_today #> '{study_seconds,previous}', '5500');
  perform pg_temp.expect('today long sessions', j_today #> '{study_seconds,long_sessions_current}', '1');
  perform pg_temp.expect('today long seconds', j_today #> '{study_seconds,long_session_seconds_current}', '32400');
  perform pg_temp.expect('today cohort', j_today -> 'latest_complete_cohort',
    '{"week_start": "2000-03-27", "cohort_size": 2, "activated": 1, "activation_rate": null, "small": true}');
  perform pg_temp.expect('today open reports', j_today #> '{queue,open_reports}', '1');
  perform pg_temp.expect('today new feedback', j_today #> '{queue,new_feedback}', '1');
  perform pg_temp.expect('today push failures', j_today #> '{queue,push_failures_7d}', '0');
  perform pg_temp.expect('today jobs', (select jsonb_agg(jsonb_build_object('job', x->'job', 'status', x->'last_status', 'overdue', x->'overdue'))
                                        from jsonb_array_elements(j_today->'jobs') x),
    '[{"job": "purge_posts", "status": "error", "overdue": false}, {"job": "push_daily", "status": "ok", "overdue": true}]');
  perform pg_temp.expect('today window', to_jsonb((j_today #>> '{window,current_start}')::timestamptz = t_now - interval '168 hours'), 'true');
  checks := checks + 17;

  -- ── Activation funnel (existing members, independent steps) ─────────────
  perform pg_temp.expect('funnel', j_act -> 'funnel', '{
    "accounts": 15, "profile_created": 14, "studies_completed": 1, "course_added": 1,
    "real_session": 8, "real_days_2": 3, "real_days_5": 1,
    "activation": {"eligible": 13, "activated": 3, "rate": 0.2308},
    "return_week2": {"eligible": 13, "returned": 3, "rate": 0.2308}}');
  checks := checks + 1;

  -- ── Cohorts: 10 weeks, fair windows, small groups without a rate ────────
  perform pg_temp.expect('cohort weeks', to_jsonb(jsonb_array_length(j_act->'cohorts')), '10');
  perform pg_temp.expect('first cohort week', j_act #> '{cohorts,0,week_start}', '"2000-02-07"');
  select c into j_week from jsonb_array_elements(j_act->'cohorts') c where c->>'week_start' = '2000-03-20';
  perform pg_temp.expect('W1 size', jsonb_build_array(j_week->'accounts', j_week->'deleted', j_week->'cohort_size'), '[11, 2, 13]');
  perform pg_temp.expect('W1 activation', (j_week->'activation') - 'complete_at', '{"complete": true, "activated": 4, "rate": 0.3077}');
  perform pg_temp.expect('W1 return', (j_week->'return_week2') - 'complete_at', '{"complete": true, "returned": 4, "unknown": 0, "rate": 0.3077}');
  perform pg_temp.expect('W1 activation complete at', to_jsonb((j_week #>> '{activation,complete_at}')::timestamptz = timestamptz '2000-04-02 22:00+00'), 'true');
  select c into j_week from jsonb_array_elements(j_act->'cohorts') c where c->>'week_start' = '2000-03-27';
  perform pg_temp.expect('W2 size', jsonb_build_array(j_week->'accounts', j_week->'deleted', j_week->'cohort_size'), '[1, 1, 2]');
  perform pg_temp.expect('W2 small cohort', (j_week->'activation') - 'complete_at', '{"complete": true, "activated": 1, "rate": null}');
  perform pg_temp.expect('W2 return pending', (j_week->'return_week2') - 'complete_at', '{"complete": false, "returned": null, "unknown": 1, "rate": null}');
  select c into j_week from jsonb_array_elements(j_act->'cohorts') c where c->>'week_start' = '2000-04-10';
  perform pg_temp.expect('current week open', jsonb_build_array(j_week->'cohort_size', j_week #> '{activation,complete}', j_week #> '{activation,activated}', j_week #> '{activation,rate}'), '[2, false, null, null]');
  select c into j_week from jsonb_array_elements(j_act->'cohorts') c where c->>'week_start' = '2000-02-07';
  perform pg_temp.expect('late member week', jsonb_build_array(j_week->'cohort_size', j_week #> '{activation,activated}', j_week #> '{activation,rate}', j_week #> '{return_week2,returned}'), '[1, 0, null, 0]');
  select c into j_week from jsonb_array_elements(j_act->'cohorts') c where c->>'week_start' = '2000-03-06';
  perform pg_temp.expect('empty week', jsonb_build_array(j_week->'cohort_size', j_week #> '{activation,activated}', j_week #> '{activation,rate}'), '[0, 0, null]');
  perform pg_temp.expect('deletions', j_act -> 'deletions', '{"total": 6, "in_cohorts": 3, "without_signup_week": 1, "excluded": 2}');
  perform pg_temp.expect('feature usage', j_act -> 'feature_usage', '{
    "active_30d": 7, "planning": 1, "friends": 2, "course_rooms": 1,
    "planning_rate": 0.1429, "friends_rate": 0.2857, "course_rooms_rate": 0.1429}');
  perform pg_temp.expect('definitions', j_act #> '{definitions,real_session_seconds}', '600');
  checks := checks + 15;

  -- ── Members list ──────────────────────────────────────────────────────
  perform pg_temp.expect('segment counts', j_lists #> '{all,counts}', '{
    "all": 16, "active": 5, "no_real_session": 7, "dormant": 1,
    "incomplete_signup": 14, "placeholder_email": 1, "suspended": 1}');
  perform pg_temp.expect('all total', j_lists #> '{all,total}', '16');
  perform pg_temp.expect('all rows', to_jsonb(jsonb_array_length(j_lists #> '{all,rows}')), '16');
  perform pg_temp.expect('no admin in the list', to_jsonb(exists (
    select 1 from jsonb_array_elements(j_lists #> '{all,rows}') r where r->>'user_id' = u[9]::text)), 'false');
  perform pg_temp.expect('page 1', (select jsonb_agg(r->'user_id') from jsonb_array_elements(j_lists #> '{page1,rows}') r),
    jsonb_build_array(u[7], u[6]));
  perform pg_temp.expect('page 2', (select jsonb_agg(r->'user_id') from jsonb_array_elements(j_lists #> '{page2,rows}') r),
    jsonb_build_array(u[17], u[16]));
  perform pg_temp.expect('page keeps the total', j_lists #> '{page2,total}', '16');
  perform pg_temp.expect('oldest first', j_lists #> '{asc,rows,0,user_id}', to_jsonb(u[14]));
  perform pg_temp.expect('last session first', (select jsonb_agg(r->'user_id') from jsonb_array_elements(j_lists #> '{last,rows}') r),
    jsonb_build_array(u[7], u[1], u[10]));
  perform pg_temp.expect('most time in 30 days', j_lists #> '{t30,rows,0,user_id}', to_jsonb(u[15]));
  perform pg_temp.expect('active segment', (select jsonb_agg(r->'user_id' order by r->>'user_id') from jsonb_array_elements(j_lists #> '{active,rows}') r),
    (select jsonb_agg(to_jsonb(x) order by x::text) from unnest(array[u[1], u[5], u[7], u[11], u[15]]) x));
  perform pg_temp.expect('no real session segment', (select jsonb_agg(r->'user_id' order by r->>'user_id') from jsonb_array_elements(j_lists #> '{none,rows}') r),
    (select jsonb_agg(to_jsonb(x) order by x::text) from unnest(array[u[2], u[6], u[8], u[12], u[13], u[16], u[17]]) x));
  perform pg_temp.expect('dormant segment', (select jsonb_agg(r->'user_id') from jsonb_array_elements(j_lists #> '{dormant,rows}') r),
    jsonb_build_array(u[14]));
  perform pg_temp.expect('suspended segment', (select jsonb_agg(r->'user_id') from jsonb_array_elements(j_lists #> '{suspended,rows}') r),
    jsonb_build_array(u[10]));
  perform pg_temp.expect('accent-insensitive search', (select jsonb_agg(r->'user_id') from jsonb_array_elements(j_lists #> '{eloise,rows}') r),
    jsonb_build_array(u[13]));
  perform pg_temp.expect('search with @', (select jsonb_agg(r->'user_id') from jsonb_array_elements(j_lists #> '{at,rows}') r),
    jsonb_build_array(u[15]));
  perform pg_temp.expect('search by id', (select jsonb_agg(r->'user_id') from jsonb_array_elements(j_lists #> '{uuid,rows}') r),
    jsonb_build_array(u[1]));
  perform pg_temp.expect('wildcards are literal', j_lists #> '{percent,total}', '0');
  perform pg_temp.expect('search narrows the counts', j_lists #> '{eloise,counts,all}', '1');
  checks := checks + 19;

  -- ── Member details ────────────────────────────────────────────────────
  perform pg_temp.expect('A1 study', (j_details #> '{a1,study}') - 'last_real_session_at', '{
    "real_sessions": 5, "short_sessions": 0, "real_days": 5, "real_seconds_7d": 2400,
    "real_seconds_30d": 9600, "real_seconds_total": 9600, "long_sessions_total": 0,
    "active_7d": true, "dormant": false}');
  perform pg_temp.expect('A1 activation', jsonb_build_array(j_details #> '{a1,activation,status}', j_details #> '{a1,activation,returned_week2}', j_details #> '{a1,activation,hours_to_first_real_session}'),
    '["activated", true, 1.0]');
  perform pg_temp.expect('A1 last session', to_jsonb((j_details #>> '{a1,study,last_real_session_at}')::timestamptz = timestamptz '2000-04-10 12:00+00'), 'true');
  perform pg_temp.expect('A1 recent sessions', to_jsonb(jsonb_array_length(j_details #> '{a1,recent_sessions}')), '5');
  perform pg_temp.expect('A1 newest first', to_jsonb((j_details #>> '{a1,recent_sessions,0,started_at}')::timestamptz = timestamptz '2000-04-10 12:00+00'), 'true');
  perform pg_temp.expect('A1 social', (j_details #> '{a1,social}') - 'groups' - 'referrals' - 'course_rooms', '{"friends": 1, "course_room_posts_30d": 0}');
  perform pg_temp.expect('A1 planning', j_details #> '{a1,courses,objectives_30d}', '1');
  perform pg_temp.expect('A2 short only', jsonb_build_array(j_details #> '{a2,study,real_sessions}', j_details #> '{a2,study,short_sessions}', j_details #> '{a2,activation,status}', j_details #> '{a2,recent_sessions,0,real}'),
    '[0, 1, "not_activated", false]');
  perform pg_temp.expect('A3 late', jsonb_build_array(j_details #> '{a3,activation,status}', j_details #> '{a3,activation,returned_week2}'), '["late", true]');
  perform pg_temp.expect('A5 room post', j_details #> '{a5,social,course_room_posts_30d}', '1');
  perform pg_temp.expect('A6 pending', jsonb_build_array(j_details #> '{a6,activation,status}', j_details #> '{a6,activation,returned_week2}'), '["pending", null]');
  perform pg_temp.expect('A7 early', jsonb_build_array(j_details #> '{a7,activation,status}', j_details #> '{a7,activation,returned_week2}'), '["activated", null]');
  perform pg_temp.expect('A8 without profile', jsonb_build_array(j_details #> '{a8,account,has_profile}', j_details #> '{a8,profile,pseudo}'), '[false, null]');
  perform pg_temp.expect('A14 dormant', j_details #> '{a14,study,dormant}', 'true');
  -- v61_2 : une session de 9 h compte 8 h dans les sommes, reste brute ailleurs.
  perform pg_temp.expect('A15 capped totals', jsonb_build_array(j_details #> '{a15,study,real_seconds_7d}', j_details #> '{a15,study,real_seconds_total}', j_details #> '{a15,study,long_sessions_total}', j_details #> '{a15,recent_sessions,0,duration_seconds}'), '[28800, 28800, 1, 32400]');
  checks := checks + 15;

  -- ── No email ever leaves the database ─────────────────────────────────
  if (j_today::text || j_act::text || j_lists::text || j_details::text) ~ '"email"\s*:'
     or (j_lists::text || j_details::text) like '%example.invalid%'
     or (j_lists::text || j_details::text) like '%@blocus.local%' then
    raise exception 'FAIL [an email address left the database]';
  end if;
  checks := checks + 1;
  perform pg_temp.expect('placeholder flag', (select r->'placeholder_email' from jsonb_array_elements(j_lists #> '{all,rows}') r where r->>'user_id' = u[12]::text), 'true');
  checks := checks + 1;

  raise exception 'ADMIN ANALYTICS TESTS PASSED: % checks (everything rolled back)', checks;
end
$tests$;
