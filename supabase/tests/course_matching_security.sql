-- Canonical course matching: resolver behaviour, privacy and security.
-- Creates two throw-away institutions and nine throw-away students, runs the real
-- functions as those students (and as the authenticated / anon roles for RLS), then
-- raises an exception so NOTHING is kept. Run in the Supabase SQL editor or MCP execute_sql.
--
-- Expected result: an error whose message starts with "COURSE MATCHING TESTS PASSED".
-- Any message starting with "FAIL" names the broken check.

do $tests$
declare
  suffix constant text := substr(md5(clock_timestamp()::text), 1, 8);
  inst_a constant text := 'zz-course-matching-a-' || suffix;
  inst_b constant text := 'zz-course-matching-b-' || suffix;
  u uuid[] := array(select gen_random_uuid() from generate_series(1, 9));
  checks integer := 0;
  n integer;
  keys text[];
  v_offering uuid;
  v_course uuid;
  v_status text;
  v_rule text;
begin
  -- Students 1-7 study at A, 8-9 at B. Student 2 is in another program, student 4 in BAC 2.
  insert into auth.users (id, email, raw_user_meta_data)
  select u[i], 'course-matching-' || suffix || '-' || i || '@example.invalid',
    jsonb_build_object(
      'pseudo', 'cm' || suffix || i,
      'university', case when i <= 7 then 'Blocus Test Institution A ' || suffix else 'Blocus Test Institution B ' || suffix end,
      'study_year', case when i = 4 then 'BAC 2' else 'BAC 1' end,
      'study_field', case when i = 2 then 'Communication' else 'Marketing' end)
  from generate_series(1, 9) as i;

  perform set_config('request.jwt.claims', json_build_object('sub', u[1], 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', u[1]::text, true);
  insert into public.study_spaces (id, kind, name, parent_id) values
    (inst_a, 'university', 'Blocus Test Institution A ' || suffix, 'study-hub'),
    (inst_b, 'university', 'Blocus Test Institution B ' || suffix, 'study-hub');

  insert into public.courses (user_id, name) values
    (u[1], 'Advertising Strategy'), (u[2], 'Advertising Strategies'),              -- same course, two programs
    (u[1], 'Droit du travail'), (u[2], 'Droit du travail'),                        -- same course; 2 will reject
    (u[1], 'Anglais'), (u[2], 'anglais'),                                           -- generic name, same year
    (u[4], 'Statistiques'), (u[5], 'Statistiques'),                                 -- generic name, different years
    (u[1], 'Histoire du capitalisme'), (u[4], 'Histoire du capitalisme'),          -- distinctive name, different years
    (u[1], 'Compta'), (u[2], 'Compta 2'), (u[3], 'Compta 2'),                      -- sequence marker
    (u[1], 'Math'), (u[5], 'Math Q2'), (u[6], 'Math Q2'),                          -- sequence marker
    (u[1], 'ADV3008 Brand Management'), (u[2], 'ADV3008'),                         -- course code
    (u[3], 'ADV Strat'), (u[5], 'ADV Strat'), (u[6], 'ADV Strat'), (u[7], 'ADV Strat'), -- alias
    (u[5], 'Droit fiscal'), (u[6], 'Droit fiscal'), (u[7], 'Droit fiscal'),        -- contested
    (u[5], 'Progra'), (u[6], 'Progra'), (u[3], 'Programmation'), (u[7], 'Programmation'), -- spelling variants
    (u[1], 'Mémoire'), (u[2], 'Mémoire'),                                          -- not a course
    (u[8], 'Advertising Strategy'), (u[9], 'Advertising Strategy');                -- same name, other institution

  -- Every student opens the future screen once.
  for i in 1..9 loop
    perform set_config('request.jwt.claims', json_build_object('sub', u[i], 'role', 'authenticated')::text, true);
    perform set_config('request.jwt.claim.sub', u[i]::text, true);
    perform * from public.resolve_my_course_links();
  end loop;

  -- Canonical courses emerge only from 2+ students; no variant duplicates, no activity labels.
  select array_agg(identity_key order by identity_key collate "C") into keys
  from public.course_offerings where institution_id = inst_a;
  if keys is distinct from array['#cadv3008', 'advertising strategy', 'anglais', 'compta #s2', 'droit fiscal',
      'droit travail', 'histoire capitalism', 'math #sq2', 'programmation', 'statistic'] then
    raise exception 'FAIL [emergence A]: %', keys;
  end if;
  checks := checks + 1;

  select array_agg(identity_key) into keys from public.course_offerings where institution_id = inst_b;
  if keys is distinct from array['advertising strategy'] then
    raise exception 'FAIL [emergence B]: %', keys;
  end if;
  checks := checks + 1;

  if exists (select 1 from public.course_offerings o where o.institution_id = inst_a
             and o.generic <> (o.identity_key in ('anglais', 'statistic', 'programmation', 'compta #s2', 'math #sq2'))) then
    raise exception 'FAIL [generic flags]';
  end if;
  checks := checks + 1;

  -- Automatic links: exactly the HIGH identities.
  select array_agg(c.name || ' -> ' || o.title || ' / ' || l.rule order by c.name collate "C", l.user_id)
  into keys
  from public.course_links l
  join public.courses c on c.id = l.course_id
  join public.course_offerings o on o.id = l.offering_id
  where l.status = 'auto' and o.institution_id = inst_a;
  if cardinality(keys) is distinct from 9
     or (select count(*) from public.course_links l join public.courses c on c.id = l.course_id
         where l.status = 'auto' and l.user_id = any(u[1:7])
           and c.name in ('Advertising Strategy', 'Advertising Strategies', 'Droit du travail', 'Droit du Travail',
                          'ADV3008 Brand Management', 'ADV3008', 'Droit fiscal')) <> 9 then
    raise exception 'FAIL [auto links A]: %', keys;
  end if;
  checks := checks + 1;

  if exists (select 1 from public.course_links l join public.courses c on c.id = l.course_id
             where l.status = 'auto' and c.name in ('ADV3008 Brand Management', 'ADV3008') and l.rule <> 'code_match') then
    raise exception 'FAIL [code match rule]';
  end if;
  checks := checks + 1;

  -- Same exact name at another institution never links across.
  if exists (select 1 from public.course_links l
             join public.course_offerings o on o.id = l.offering_id
             join public.profiles p on p.id = l.user_id
             where (o.institution_id = inst_b and l.user_id = any(u[1:7]))
                or (o.institution_id = inst_a and l.user_id = any(u[8:9]))) then
    raise exception 'FAIL [cross institution link]';
  end if;
  if (select count(*) from public.course_links l join public.course_offerings o on o.id = l.offering_id
      where o.institution_id = inst_b and l.status = 'auto') <> 2 then
    raise exception 'FAIL [institution B auto links]';
  end if;
  checks := checks + 1;

  -- Suggestions for student 1: generic same year and distinctive across years are asked;
  -- generic across years, sequence differences and a shared code are not suggestions.
  perform set_config('request.jwt.claims', json_build_object('sub', u[1], 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', u[1]::text, true);
  select array_agg(r.offering_title || ' / ' || r.status || ' / ' || r.confidence || ' / ' || r.rule
                   order by r.offering_title collate "C", r.status)
  into keys
  from public.resolve_my_course_links() r;
  if keys is distinct from array[
      'ADV3008 Brand Management / auto / high / code_match',
      'Advertising Strategy / auto / high / same_title',
      'Anglais / suggested / medium / generic_name',
      'Droit du travail / auto / high / same_title',
      'Histoire du capitalisme / suggested / medium / years_differ'] then
    raise exception 'FAIL [student 1 state]: %', keys;
  end if;
  checks := checks + 1;

  -- Student 4 (BAC 2): Statistiques is also used in BAC 1, generic -> unresolved, not asked.
  perform set_config('request.jwt.claims', json_build_object('sub', u[4], 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', u[4]::text, true);
  select array_agg(r.offering_title || ' / ' || r.status || ' / ' || r.rule order by r.offering_title collate "C")
  into keys from public.resolve_my_course_links() r;
  if keys is distinct from array['Histoire du capitalisme / suggested / years_differ'] then
    raise exception 'FAIL [student 4 state]: %', keys;
  end if;
  checks := checks + 1;

  -- Student 5: "Progra" is asked about "Programmation" (no separate Progra canonical course),
  -- "ADV Strat" about "Advertising Strategy"; Math Q2 is generic same year.
  perform set_config('request.jwt.claims', json_build_object('sub', u[5], 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', u[5]::text, true);
  select array_agg(r.offering_title || ' / ' || r.status || ' / ' || r.rule order by r.offering_title collate "C")
  into keys from public.resolve_my_course_links() r;
  if keys is distinct from array[
      'Advertising Strategy / suggested / abbreviation',
      'Droit fiscal / auto / same_title',
      'Math Q2 / suggested / generic_name',
      'Programmation / suggested / abbreviation'] then
    raise exception 'FAIL [student 5 state]: %', keys;
  end if;
  checks := checks + 1;

  -- Remembered rejection: student 2 says no to Droit du travail.
  perform set_config('request.jwt.claims', json_build_object('sub', u[2], 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', u[2]::text, true);
  select c.id, l.offering_id into v_course, v_offering
  from public.courses c join public.course_links l on l.course_id = c.id
  where c.user_id = u[2] and c.name = 'Droit du travail';
  perform public.reject_course_link(v_course, v_offering);
  perform * from public.resolve_my_course_links();
  perform * from public.resolve_my_course_links();
  if (select l.status from public.course_links l where l.course_id = v_course and l.offering_id = v_offering) <> 'rejected'
     or exists (select 1 from public.resolve_my_course_links() r where r.course_id = v_course) then
    raise exception 'FAIL [rejection remembered]';
  end if;
  checks := checks + 1;
  perform set_config('request.jwt.claims', json_build_object('sub', u[1], 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', u[1]::text, true);
  perform * from public.resolve_my_course_links();
  if not exists (select 1 from public.course_links l join public.courses c on c.id = l.course_id
                 where c.user_id = u[1] and c.name = 'Droit du travail' and l.status = 'auto') then
    raise exception 'FAIL [one rejection must not unlink others]';
  end if;
  checks := checks + 1;

  -- Two rejections make the identity contested: student 7 loses the automatic link, is asked instead.
  for i in 5..6 loop
    perform set_config('request.jwt.claims', json_build_object('sub', u[i], 'role', 'authenticated')::text, true);
    perform set_config('request.jwt.claim.sub', u[i]::text, true);
    select c.id, l.offering_id into v_course, v_offering
    from public.courses c join public.course_links l on l.course_id = c.id
    where c.user_id = u[i] and c.name = 'Droit fiscal';
    perform public.reject_course_link(v_course, v_offering);
  end loop;
  perform set_config('request.jwt.claims', json_build_object('sub', u[7], 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', u[7]::text, true);
  select r.status, r.rule into v_status, v_rule
  from public.resolve_my_course_links() r where r.offering_title = 'Droit fiscal';
  if v_status is distinct from 'suggested' or v_rule is distinct from 'contested'
     or exists (select 1 from public.course_links l join public.courses c on c.id = l.course_id
                where c.user_id = u[7] and c.name = 'Droit fiscal' and l.status = 'auto') then
    raise exception 'FAIL [contested]: % %', v_status, v_rule;
  end if;
  checks := checks + 1;

  -- Alias threshold: one confirmation is not enough, three independent confirmations are.
  select id into v_offering from public.course_offerings where institution_id = inst_a and identity_key = 'advertising strategy';
  perform set_config('request.jwt.claims', json_build_object('sub', u[3], 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', u[3]::text, true);
  select id into v_course from public.courses where user_id = u[3] and name = 'ADV Strat';
  perform public.confirm_course_link(v_course, v_offering);
  perform set_config('request.jwt.claims', json_build_object('sub', u[7], 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', u[7]::text, true);
  select r.status, r.rule into v_status, v_rule
  from public.resolve_my_course_links() r where r.offering_id = v_offering;
  if v_status is distinct from 'suggested' or v_rule is distinct from 'abbreviation' then
    raise exception 'FAIL [single confirmation]: % %', v_status, v_rule;
  end if;
  checks := checks + 1;

  foreach n in array array[5, 6] loop
    perform set_config('request.jwt.claims', json_build_object('sub', u[n], 'role', 'authenticated')::text, true);
    perform set_config('request.jwt.claim.sub', u[n]::text, true);
    select id into v_course from public.courses where user_id = u[n] and name = 'ADV Strat';
    perform public.confirm_course_link(v_course, v_offering);
  end loop;
  perform set_config('request.jwt.claims', json_build_object('sub', u[7], 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', u[7]::text, true);
  select r.status, r.rule into v_status, v_rule
  from public.resolve_my_course_links() r where r.offering_id = v_offering;
  if v_status is distinct from 'auto' or v_rule is distinct from 'trusted_alias' then
    raise exception 'FAIL [trusted alias]: % %', v_status, v_rule;
  end if;
  checks := checks + 1;

  -- Personal course names are never rewritten.
  if exists (select 1 from public.courses where user_id = any(u) and name = 'Advertising Strategy' and user_id = any(u[3:7])) then
    raise exception 'FAIL [personal names rewritten]';
  end if;
  if (select count(*) from public.courses where user_id = any(u) and name = 'ADV Strat') <> 4 then
    raise exception 'FAIL [personal names changed]';
  end if;
  checks := checks + 1;

  -- A confirmation cannot target a LOW pair, another institution, or someone else's course.
  perform set_config('request.jwt.claims', json_build_object('sub', u[1], 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', u[1]::text, true);
  begin
    perform public.confirm_course_link(
      (select id from public.courses where user_id = u[1] and name = 'Compta'),
      (select id from public.course_offerings where institution_id = inst_a and identity_key = 'compta #s2'));
    raise exception 'FAIL [confirm low pair accepted]';
  exception when raise_exception then
    if sqlerrm like 'FAIL%' then raise; end if;
    checks := checks + 1;
  end;
  begin
    perform public.confirm_course_link(
      (select id from public.courses where user_id = u[1] and name = 'Advertising Strategy'),
      (select id from public.course_offerings where institution_id = inst_b));
    raise exception 'FAIL [confirm other institution accepted]';
  exception when raise_exception then
    if sqlerrm like 'FAIL%' then raise; end if;
    if sqlerrm <> 'Course identity not available' then raise exception 'FAIL [confirm other institution]: %', sqlerrm; end if;
    checks := checks + 1;
  end;
  begin
    perform public.confirm_course_link(
      (select id from public.courses where user_id = u[2] and name = 'Advertising Strategies'),
      (select id from public.course_offerings where institution_id = inst_a and identity_key = 'advertising strategy'));
    raise exception 'FAIL [confirm foreign course accepted]';
  exception when raise_exception then
    if sqlerrm like 'FAIL%' then raise; end if;
    if sqlerrm <> 'Course not found' then raise exception 'FAIL [confirm foreign course]: %', sqlerrm; end if;
    checks := checks + 1;
  end;
  begin
    perform public.reject_course_link(
      (select id from public.courses where user_id = u[2] and name = 'Advertising Strategies'),
      (select id from public.course_offerings where institution_id = inst_a and identity_key = 'advertising strategy'));
    raise exception 'FAIL [reject foreign course accepted]';
  exception when raise_exception then
    if sqlerrm like 'FAIL%' then raise; end if;
    if sqlerrm <> 'Course not found' then raise exception 'FAIL [reject foreign course]: %', sqlerrm; end if;
    checks := checks + 1;
  end;

  -- Canonical courses carry no personal column.
  select array_agg(column_name::text order by column_name::text collate "C") into keys
  from information_schema.columns where table_schema = 'public' and table_name = 'course_offerings';
  if keys is distinct from array['code', 'created_at', 'generic', 'id', 'identity_key', 'institution_id', 'title'] then
    raise exception 'FAIL [offering columns]: %', keys;
  end if;
  checks := checks + 1;

  -- RLS as student 1 (authenticated role).
  perform set_config('request.jwt.claims', json_build_object('sub', u[1], 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', u[1]::text, true);
  select count(*) into n from public.course_links where user_id = u[1];
  set local role authenticated;

  if (select count(*) from public.course_links) <> n
     or exists (select 1 from public.course_links where user_id <> u[1]) then
    raise exception 'FAIL [rls: other students links visible]';
  end if;
  checks := checks + 1;
  if exists (select 1 from public.course_links where status = 'rejected') then
    raise exception 'FAIL [rls: rejections of others visible]';
  end if;
  checks := checks + 1;
  if exists (select 1 from public.course_offerings where institution_id = inst_b)
     or (select count(*) from public.course_offerings)
        <> (select count(distinct offering_id) from public.course_links) then
    raise exception 'FAIL [rls: canonical courses without a decision visible]';
  end if;
  checks := checks + 1;
  if exists (select 1 from public.resolve_my_course_links() r
             where not exists (select 1 from public.courses c where c.id = r.course_id and c.user_id = u[1])) then
    raise exception 'FAIL [definer leak: resolve returned another student course]';
  end if;
  checks := checks + 1;

  begin
    insert into public.course_links (course_id, offering_id, user_id, status, confidence, rule, course_key)
    select c.id, o.id, u[1], 'confirmed', 'high', 'forged', 'x'
    from public.courses c, public.course_offerings o where c.user_id = u[1] limit 1;
    raise exception 'FAIL [rls: insert course link]';
  exception when insufficient_privilege then checks := checks + 1;
  end;
  begin
    update public.course_links set status = 'confirmed' where user_id = u[2];
    raise exception 'FAIL [rls: update other student link]';
  exception when insufficient_privilege then checks := checks + 1;
  end;
  begin
    delete from public.course_links where user_id = u[2];
    raise exception 'FAIL [rls: delete other student link]';
  exception when insufficient_privilege then checks := checks + 1;
  end;
  begin
    insert into public.course_offerings (institution_id, identity_key, title) values (inst_a, 'forged', 'Forged');
    raise exception 'FAIL [rls: insert canonical course]';
  exception when insufficient_privilege then checks := checks + 1;
  end;
  begin
    perform * from public.course_population(inst_a);
    raise exception 'FAIL [internal: course_population callable]';
  exception when insufficient_privilege then checks := checks + 1;
  end;
  begin
    perform * from public.course_candidates(u[2], inst_a);
    raise exception 'FAIL [internal: course_candidates callable]';
  exception when insufficient_privilege then checks := checks + 1;
  end;
  begin
    perform public.course_institution_of(u[2]);
    raise exception 'FAIL [internal: course_institution_of callable]';
  exception when insufficient_privilege then checks := checks + 1;
  end;
  begin
    perform public.course_emerge_offerings(inst_a);
    raise exception 'FAIL [internal: course_emerge_offerings callable]';
  exception when insufficient_privilege then checks := checks + 1;
  end;
  reset role;

  -- Student 2 sees their own rejection.
  perform set_config('request.jwt.claims', json_build_object('sub', u[2], 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', u[2]::text, true);
  set local role authenticated;
  if (select count(*) from public.course_links where status = 'rejected') <> 1 then
    raise exception 'FAIL [owner cannot read own rejection]';
  end if;
  checks := checks + 1;
  reset role;

  -- Anonymous visitors reach nothing.
  set local role anon;
  begin
    perform 1 from public.course_links;
    raise exception 'FAIL [anon: read course links]';
  exception when insufficient_privilege then checks := checks + 1;
  end;
  begin
    perform * from public.resolve_my_course_links();
    raise exception 'FAIL [anon: resolve callable]';
  exception when insufficient_privilege then checks := checks + 1;
  end;
  reset role;

  -- Machine decisions follow the personal course: a rename withdraws an automatic link,
  -- a confirmed link stays (the student decided).
  update public.courses set name = 'Advertising Strategy 2' where user_id = u[1] and name = 'Advertising Strategy';
  perform set_config('request.jwt.claims', json_build_object('sub', u[1], 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', u[1]::text, true);
  perform * from public.resolve_my_course_links();
  if exists (select 1 from public.course_links l join public.courses c on c.id = l.course_id
             where c.user_id = u[1] and c.name = 'Advertising Strategy 2' and l.status = 'auto') then
    raise exception 'FAIL [rename keeps automatic link]';
  end if;
  checks := checks + 1;

  update public.courses set name = 'ADV Strategy' where user_id = u[3] and name = 'ADV Strat';
  perform set_config('request.jwt.claims', json_build_object('sub', u[3], 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', u[3]::text, true);
  perform * from public.resolve_my_course_links();
  if not exists (select 1 from public.course_links l join public.courses c on c.id = l.course_id
                 where c.user_id = u[3] and c.name = 'ADV Strategy' and l.status = 'confirmed') then
    raise exception 'FAIL [rename drops confirmed link]';
  end if;
  checks := checks + 1;

  -- Changing institution withdraws the automatic links of the old institution; decisions stay.
  perform set_config('request.jwt.claims', json_build_object('sub', u[2], 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', u[2]::text, true);
  update public.profiles set university = 'Blocus Test Institution B ' || suffix where id = u[2];
  perform * from public.resolve_my_course_links();
  if exists (select 1 from public.course_links l join public.course_offerings o on o.id = l.offering_id
             where l.user_id = u[2] and l.status = 'auto' and o.institution_id = inst_a)
     or not exists (select 1 from public.course_links l where l.user_id = u[2] and l.status = 'rejected') then
    raise exception 'FAIL [institution change]';
  end if;
  checks := checks + 1;

  raise exception 'COURSE MATCHING TESTS PASSED: % checks (everything rolled back)', checks;
end
$tests$;
