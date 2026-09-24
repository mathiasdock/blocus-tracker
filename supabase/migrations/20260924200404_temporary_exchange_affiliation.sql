-- A temporary exchange changes the student's current academic home, not the
-- permanent university on their profile. Personal courses retain their own
-- institution so they cannot silently become home-university courses later.
alter table public.profiles
  add column exchange_university text,
  add column exchange_institution_id text references public.study_spaces(id),
  add column exchange_start_date date,
  add column exchange_end_date date;

alter table public.profiles
  add constraint profiles_exchange_dates_check check (
    (exchange_university is null and exchange_institution_id is null and exchange_start_date is null and exchange_end_date is null)
    or (char_length(btrim(exchange_university)) between 2 and 180
      and exchange_institution_id is not null
      and exchange_start_date is not null and exchange_end_date is not null
      and exchange_start_date <= exchange_end_date)
  );

alter table public.courses
  add column study_institution_id text references public.study_spaces(id);

create index courses_study_institution_active_idx
  on public.courses(study_institution_id, user_id) where archived_at is null;
create index sessions_course_studied_at_idx
  on public.sessions(course_id, started_at desc) where duration_seconds > 0;

comment on column public.profiles.university is
  'Permanent/home institution. A dated exchange never overwrites this value.';
comment on column public.profiles.exchange_end_date is
  'Inclusive last exchange day in the profile timezone; no cleanup job is needed.';
comment on column public.courses.study_institution_id is
  'Institution of the course at its latest positive study session (or creation if unstudied). NULL means the home institution.';

grant select (exchange_university, exchange_institution_id, exchange_start_date, exchange_end_date)
  on public.profiles to authenticated;
grant select (study_institution_id) on public.courses to authenticated;

-- Match the browser's local calendar convention without relying on the
-- database server's UTC date. Legacy/invalid timezone values fall back to UTC.
create function public.exchange_local_date(p_instant timestamptz, p_timezone text)
returns date language sql stable set search_path = public as $$
  select (p_instant at time zone coalesce(
    (select name from pg_timezone_names where name = nullif(p_timezone, '') limit 1),
    'UTC'
  ))::date
$$;
revoke all on function public.exchange_local_date(timestamptz,text) from public, anon, authenticated;

create function public.course_home_institution_of(p_user uuid)
returns text language sql stable set search_path = public as $$
  select s.id
  from public.profiles p
  join public.study_spaces s on s.kind = 'university'
    and public.study_name_key(s.name) = public.study_name_key(p.university)
  where p.id = p_user and char_length(btrim(coalesce(p.university, ''))) >= 2
  limit 1
$$;
revoke all on function public.course_home_institution_of(uuid) from public, anon, authenticated;

-- Used by the default University/Program spaces and the current-campus
-- search. The end date is inclusive; the next local day restores home.
create or replace function public.course_institution_of(p_user uuid)
returns text language sql stable set search_path = public as $$
  select case
    when p.exchange_start_date <= public.exchange_local_date(now(), p.timezone)
      and p.exchange_end_date >= public.exchange_local_date(now(), p.timezone)
      then coalesce(host.id, home.id)
    else home.id
  end
  from public.profiles p
  left join public.study_spaces home on home.kind = 'university'
    and public.study_name_key(home.name) = public.study_name_key(p.university)
  left join public.study_spaces host on host.kind = 'university'
    and host.id = p.exchange_institution_id
  where p.id = p_user
  limit 1
$$;
revoke all on function public.course_institution_of(uuid) from public, anon, authenticated;

-- Population is course-scoped, never just profile-scoped. A course last
-- studied at the host stays there after exchange expiry until it is studied
-- outside the exchange; the existing matching algorithm stays intact.
create or replace function public.course_population(p_institution text)
returns table (
  course_id uuid, user_id uuid, name text, identity_key text, code text,
  content text[], generic boolean, non_course boolean, study_year text
)
language sql stable set search_path = public as $$
  select c.id, c.user_id, c.name, ci.identity_key, ci.code, ci.content,
    ci.generic, ci.non_course,
    case when y.k in ('autre', 'other') then null else y.k end
  from public.courses c
  join public.profiles p on p.id = c.user_id
  left join public.study_spaces home on home.kind = 'university'
    and public.study_name_key(home.name) = public.study_name_key(p.university)
  cross join lateral public.course_identity(c.name) ci
  cross join lateral (select nullif(public.study_name_key(coalesce(p.study_year, '')), '') as k) y
  where c.archived_at is null
    and coalesce(c.study_institution_id, home.id) = p_institution
$$;
revoke all on function public.course_population(text) from public, anon, authenticated;

-- A new course with no sessions starts in the university of its creation day.
create function public.assign_exchange_institution_to_course()
returns trigger language plpgsql security definer set search_path = public as $$
declare host_id text;
begin
  select s.id into host_id
  from public.profiles p
  join public.study_spaces s on s.kind = 'university'
    and s.id = p.exchange_institution_id
  where p.id = new.user_id
    and p.exchange_start_date <= public.exchange_local_date(coalesce(new.created_at, now()), p.timezone)
    and p.exchange_end_date >= public.exchange_local_date(coalesce(new.created_at, now()), p.timezone)
  limit 1;
  new.study_institution_id := host_id;
  return new;
end
$$;
revoke all on function public.assign_exchange_institution_to_course() from public, anon, authenticated;
create trigger courses_exchange_institution before insert on public.courses
  for each row execute function public.assign_exchange_institution_to_course();

-- courses has a general UPDATE grant. A client must not be able to move a
-- personal course to an arbitrary campus by setting this new column directly.
create function public.validate_course_exchange_institution()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  expected text;
  study_at timestamptz;
  study_timezone text;
  p public.profiles;
begin
  if new.study_institution_id is not distinct from old.study_institution_id then return new; end if;
  select * into p from public.profiles where id = new.user_id;
  select s.started_at, nullif(s.timezone, '') into study_at, study_timezone
  from public.sessions s where s.course_id = new.id and s.duration_seconds > 0
  order by s.started_at desc, s.id desc limit 1;
  expected := case when public.exchange_local_date(coalesce(study_at, new.created_at),
    coalesce(study_timezone, p.timezone)) between p.exchange_start_date and p.exchange_end_date
    then p.exchange_institution_id else null end;
  if new.study_institution_id is distinct from expected then
    raise exception 'Course institution is determined by study dates';
  end if;
  return new;
end
$$;
revoke all on function public.validate_course_exchange_institution() from public, anon, authenticated;
create trigger courses_validate_exchange_institution
  before update of study_institution_id on public.courses
  for each row execute function public.validate_course_exchange_institution();

-- A confirmation cannot describe the same personal course at a different
-- school. Clear only invalid active associations when its school is edited;
-- remembered rejections remain private evidence for their own offering.
create function public.clear_cross_institution_course_links()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.study_institution_id is not distinct from old.study_institution_id then return new; end if;
  delete from public.course_links l
  using public.course_offerings o
  where l.course_id = new.id and l.user_id = new.user_id
    and l.offering_id = o.id and l.status in ('auto', 'confirmed')
    and o.institution_id is distinct from
      coalesce(new.study_institution_id, public.course_home_institution_of(new.user_id));
  return new;
end
$$;
revoke all on function public.clear_cross_institution_course_links() from public, anon, authenticated;
create trigger courses_clear_cross_institution_links
  after update of study_institution_id on public.courses
  for each row execute function public.clear_cross_institution_course_links();

-- One personal course has one current academic context in the canonical
-- matcher. The latest actual study session wins; before the first session,
-- its creation day does. Re-evaluation also handles backdated/deleted edits.
create function public.refresh_course_study_institution(p_course_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_course public.courses;
  v_profile public.profiles;
  v_last_study timestamptz;
  v_study_timezone text;
  v_date date;
  v_institution text;
begin
  select * into v_course from public.courses where id = p_course_id;
  if not found then return; end if;
  select * into v_profile from public.profiles where id = v_course.user_id;
  select s.started_at, nullif(s.timezone, '') into v_last_study, v_study_timezone
  from public.sessions s
  where s.course_id = p_course_id and s.duration_seconds > 0
  order by s.started_at desc, s.id desc limit 1;
  v_date := public.exchange_local_date(coalesce(v_last_study, v_course.created_at),
    coalesce(v_study_timezone, v_profile.timezone));
  v_institution := case when v_date between v_profile.exchange_start_date and v_profile.exchange_end_date
    then v_profile.exchange_institution_id else null end;
  update public.courses set study_institution_id = v_institution
  where id = p_course_id and study_institution_id is distinct from v_institution;
end
$$;
revoke all on function public.refresh_course_study_institution(uuid) from public, anon, authenticated;

create function public.refresh_course_institution_from_session()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    if old.course_id is not null then perform public.refresh_course_study_institution(old.course_id); end if;
    return old;
  end if;
  if tg_op = 'UPDATE' and old.course_id is distinct from new.course_id and old.course_id is not null then
    perform public.refresh_course_study_institution(old.course_id);
  end if;
  if new.course_id is not null then perform public.refresh_course_study_institution(new.course_id); end if;
  return new;
end
$$;
revoke all on function public.refresh_course_institution_from_session() from public, anon, authenticated;
create trigger sessions_exchange_course_institution
  after insert or update of course_id, started_at, duration_seconds, timezone or delete on public.sessions
  for each row execute function public.refresh_course_institution_from_session();

-- Atomic owner-only edit. Existing courses are reclassified from their real
-- session dates (or their creation date before the first study session).
create function public.save_my_exchange(
  p_university text, p_start date, p_end date
)
returns void language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  host_name text := nullif(btrim(regexp_replace(coalesce(p_university, ''), '\s+', ' ', 'g')), '');
  host_id text;
  home_name text;
  course_row record;
begin
  if uid is null then raise exception 'Authentication required'; end if;
  select p.university into home_name from public.profiles p where p.id = uid for update;
  if not found then raise exception 'Profile not found'; end if;

  if host_name is null then
    if p_start is not null or p_end is not null then
      raise exception 'Exchange institution and dates are required together';
    end if;
    update public.profiles set exchange_university = null, exchange_institution_id = null,
      exchange_start_date = null, exchange_end_date = null where id = uid;
  else
    if char_length(host_name) not between 2 and 180 or p_start is null or p_end is null or p_end < p_start then
      raise exception 'Invalid exchange institution or dates';
    end if;
    if public.study_name_key(host_name) = public.study_name_key(home_name) then
      raise exception 'Exchange institution must differ from home institution';
    end if;
    host_id := public.ensure_study_space('university', host_name);
    update public.profiles set exchange_university = host_name, exchange_institution_id = host_id,
      exchange_start_date = p_start, exchange_end_date = p_end where id = uid;
  end if;
  for course_row in select id from public.courses where user_id = uid and archived_at is null loop
    perform public.refresh_course_study_institution(course_row.id);
  end loop;
end
$$;
revoke all on function public.save_my_exchange(text,date,date) from public, anon;
grant execute on function public.save_my_exchange(text,date,date) to authenticated;

-- Keep the existing matching rules. The one additional boundary is that a
-- remembered confirmation from another university must not appear in the
-- current university view after the exchange starts or ends.
create or replace function public.resolve_my_course_links()
returns table (
  course_id uuid, offering_id uuid, offering_title text,
  status text, confidence text, rule text
)
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare
  uid uuid := auth.uid();
  inst text;
  candidates jsonb;
begin
  if uid is null then raise exception 'Authentication required'; end if;
  inst := public.course_institution_of(uid);
  if inst is null then
    delete from public.course_links l where l.user_id = uid and l.status = 'auto';
    return;
  end if;

  perform public.course_emerge_offerings(inst);
  select coalesce(jsonb_agg(to_jsonb(c)), '[]'::jsonb) into candidates
  from public.course_candidates(uid, inst) c;

  with cand as (
    select * from jsonb_to_recordset(candidates)
      as x(course_id uuid, offering_id uuid, confidence text, link_status text)
  ), single_high as (
    select cand.course_id, min(cand.offering_id::text)::uuid as offering_id
    from cand where cand.confidence = 'high' and cand.link_status is distinct from 'rejected'
    group by cand.course_id having count(*) = 1
  )
  delete from public.course_links l
  where l.user_id = uid and l.status = 'auto'
    and not exists (select 1 from single_high s
      where s.course_id = l.course_id and s.offering_id = l.offering_id);

  with cand as (
    select * from jsonb_to_recordset(candidates)
      as x(course_id uuid, offering_id uuid, course_key text, confidence text, rule text, link_status text)
  )
  update public.course_links l set rule = cand.rule, course_key = cand.course_key
  from cand
  where l.user_id = uid and l.status = 'auto'
    and l.course_id = cand.course_id and l.offering_id = cand.offering_id
    and (l.rule is distinct from cand.rule or l.course_key is distinct from cand.course_key);

  with cand as (
    select * from jsonb_to_recordset(candidates)
      as x(course_id uuid, offering_id uuid, course_key text, confidence text, rule text, link_status text)
  ), single_high as (
    select cand.course_id, min(cand.offering_id::text)::uuid as offering_id
    from cand where cand.confidence = 'high' and cand.link_status is distinct from 'rejected'
    group by cand.course_id having count(*) = 1
  )
  insert into public.course_links (course_id, offering_id, user_id, status, confidence, rule, course_key)
  select c.course_id, c.offering_id, uid, 'auto', c.confidence, c.rule, c.course_key
  from single_high s
  join cand c on c.course_id = s.course_id and c.offering_id = s.offering_id
  where c.link_status is null
    and not exists (select 1 from public.course_links a
      join public.course_offerings ao on ao.id = a.offering_id
      where a.course_id = c.course_id and a.status in ('auto', 'confirmed')
        and ao.institution_id = inst)
  on conflict do nothing;

  return query
  select l.course_id, l.offering_id, o.title, l.status, l.confidence, l.rule
  from public.course_links l
  join public.course_offerings o on o.id = l.offering_id and o.institution_id = inst
  join public.courses pc on pc.id = l.course_id
  where l.user_id = uid and l.status in ('auto', 'confirmed')
    and pc.archived_at is null
    and coalesce(pc.study_institution_id, public.course_home_institution_of(uid)) = inst
  union all
  select x.course_id, x.offering_id, x.offering_title, 'suggested'::text, x.confidence, x.rule
  from jsonb_to_recordset(candidates)
    as x(course_id uuid, offering_id uuid, offering_title text,
         confidence text, rule text, link_status text)
  where x.confidence in ('high', 'medium')
    and x.link_status is distinct from 'rejected'
    and not exists (select 1 from public.course_links a
      join public.course_offerings ao on ao.id = a.offering_id
      where a.course_id = x.course_id and a.status in ('auto', 'confirmed')
        and ao.institution_id = inst);
end
$$;
revoke all on function public.resolve_my_course_links() from public, anon;
grant execute on function public.resolve_my_course_links() to authenticated;
