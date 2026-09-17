begin;
-- Course spaces (Communities phase 2): voluntary, member-only rooms on top of the
-- canonical courses of phase 1 (docs/canonical-courses.md). Documentation: docs/course-spaces.md.
--
-- personal course (courses) != canonical course (course_offerings) != membership (course_room_members)
--
-- * A room exists only once a student joins it (lazy, one per canonical course).
-- * Joining is always voluntary and limited to the student's own institution.
-- * Room messages reuse community_messages (room_id), so the existing badge rule,
--   data export, storage cleanup and attachment signing keep working unchanged.
-- * Legacy Communities data is NOT deleted. Its rows become private: a legacy message
--   is readable by its author and admins only, a legacy membership by its owner only,
--   and nobody can publish into the legacy spaces any more.

-- ---------------------------------------------------------------------------
-- Rooms and memberships
-- ---------------------------------------------------------------------------

create table public.course_rooms (
  id uuid primary key default gen_random_uuid(),
  offering_id uuid not null unique references public.course_offerings(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table public.course_room_members (
  room_id uuid not null references public.course_rooms(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (room_id, user_id)
);
create index course_room_members_user_idx on public.course_room_members (user_id);

comment on table public.course_rooms is 'Course space: created at the first join of a canonical course. No personal data.';
comment on table public.course_room_members is 'Voluntary membership of a course space. Readable by its owner only; join/leave through functions.';

alter table public.course_rooms enable row level security;
alter table public.course_room_members enable row level security;
revoke all on public.course_rooms from anon, authenticated;
revoke all on public.course_room_members from anon, authenticated;
grant select on public.course_room_members to authenticated;

create policy course_room_members_read_own on public.course_room_members
  for select to authenticated
  using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Minimum moderation: blocks and reports
-- ---------------------------------------------------------------------------

-- A block hides the blocked student's course-space messages from the blocker.
create table public.user_blocks (
  blocker_id uuid not null references auth.users(id) on delete cascade,
  blocked_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  constraint user_blocks_not_self check (blocker_id <> blocked_id)
);
create index user_blocks_blocked_idx on public.user_blocks (blocked_id);

alter table public.user_blocks enable row level security;
revoke all on public.user_blocks from anon, authenticated;
grant select, insert, delete on public.user_blocks to authenticated;

create policy user_blocks_read_own on public.user_blocks
  for select to authenticated using (blocker_id = (select auth.uid()));
create policy user_blocks_insert_own on public.user_blocks
  for insert to authenticated with check (blocker_id = (select auth.uid()));
create policy user_blocks_delete_own on public.user_blocks
  for delete to authenticated using (blocker_id = (select auth.uid()));

-- Three distinct reporters hide a message for everyone but its author and admins.
create table public.course_message_reports (
  message_id uuid not null references public.community_messages(id) on delete cascade,
  reporter_id uuid not null references auth.users(id) on delete cascade,
  reason text not null check (reason in ('spam', 'abuse', 'other')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  primary key (message_id, reporter_id)
);
create index course_message_reports_reporter_idx on public.course_message_reports (reporter_id, created_at desc);
create index course_message_reports_open_idx on public.course_message_reports (created_at desc) where resolved_at is null;

alter table public.course_message_reports enable row level security;
revoke all on public.course_message_reports from anon, authenticated;
grant select on public.course_message_reports to authenticated;

create policy course_message_reports_read_own on public.course_message_reports
  for select to authenticated using (reporter_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Messages: community_messages gains a course space target
-- ---------------------------------------------------------------------------

alter table public.community_messages add column room_id uuid references public.course_rooms(id) on delete cascade;
alter table public.community_messages add column hidden_at timestamptz;
alter table public.community_messages alter column community drop not null;
alter table public.community_messages
  add constraint community_messages_one_place check ((community is null) <> (room_id is null));
create index community_messages_room_idx on public.community_messages (room_id, created_at desc, id desc)
  where room_id is not null;

-- Course spaces are one chronological stream: no thread, no post type.
create or replace function public.validate_study_reply()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.room_id is not null then
    if new.parent_id is not null then
      raise exception 'Course spaces have no threads';
    end if;
    new.content_type := 'discussion';
    return new;
  end if;
  if new.content like '[Question] %' then new.content_type := 'question';
  elsif new.content like '[Ressource] %' then new.content_type := 'resource';
  elsif new.content like '[Examen] %' then new.content_type := 'exam';
  end if;
  if new.parent_id is not null and not exists (
    select 1 from public.community_messages
    where id = new.parent_id and community = new.community and parent_id is null
  ) then
    raise exception 'Replies must belong to a root post in the same space';
  end if;
  return new;
end
$$;

-- Read: your own messages; admins; or a course space you are a member of, minus
-- hidden messages, students you blocked and messages you reported.
-- Legacy messages (no room) are therefore readable by their author and admins only.
drop policy if exists cmsg_read on public.community_messages;
create policy community_messages_read on public.community_messages
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or (select public.is_current_user_admin())
    or (
      room_id in (select m.room_id from public.course_room_members m where m.user_id = (select auth.uid()))
      and hidden_at is null
      and user_id not in (select b.blocked_id from public.user_blocks b where b.blocker_id = (select auth.uid()))
      and id not in (select r.message_id from public.course_message_reports r where r.reporter_id = (select auth.uid()))
    )
  );

-- Write: no direct insert any more (legacy spaces are closed; course spaces go through
-- post_course_room_message). Author/admin delete (cmsg_delete) is unchanged.
drop policy if exists cmsg_insert on public.community_messages;

-- Legacy memberships were readable by every signed-in student.
drop policy if exists study_members_read on public.study_space_members;
create policy study_members_read_own on public.study_space_members
  for select to authenticated
  using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Client functions
-- ---------------------------------------------------------------------------

-- Rooms of the given canonical courses (at the caller's institution) and of every
-- room the caller joined. Member counts below 3 are withheld.
create or replace function public.course_space_summaries(p_offering_ids uuid[] default '{}')
returns table (
  offering_id uuid,
  offering_title text,
  room_id uuid,
  joined boolean,
  member_count integer,
  last_message_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  uid uuid := auth.uid();
  inst text;
begin
  if uid is null then
    raise exception 'Authentication required';
  end if;
  inst := public.course_institution_of(uid);

  return query
  with wanted as (
    select o.id
    from public.course_offerings o
    where inst is not null
      and o.institution_id = inst
      and o.id = any (coalesce(p_offering_ids, '{}'::uuid[]))
    union
    select r.offering_id
    from public.course_room_members m
    join public.course_rooms r on r.id = m.room_id
    where m.user_id = uid
  )
  select o.id,
    o.title,
    r.id,
    m.user_id is not null,
    case when counts.n >= 3 then counts.n::integer end,
    case when m.user_id is not null then activity.at end
  from wanted w
  join public.course_offerings o on o.id = w.id
  left join public.course_rooms r on r.offering_id = o.id
  left join public.course_room_members m on m.room_id = r.id and m.user_id = uid
  left join lateral (
    select count(*) as n from public.course_room_members x where x.room_id = r.id
  ) counts on true
  left join lateral (
    select max(c.created_at) as at from public.community_messages c
    where c.room_id = r.id and c.hidden_at is null
  ) activity on true;
end
$$;

-- Canonical course titles of the caller's institution only. Never personal course names.
create or replace function public.search_course_spaces(p_query text)
returns table (
  offering_id uuid,
  offering_title text,
  room_id uuid,
  joined boolean,
  member_count integer
)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  uid uuid := auth.uid();
  inst text;
  needle text := public.study_name_key(left(coalesce(p_query, ''), 120));
begin
  if uid is null then
    raise exception 'Authentication required';
  end if;
  if char_length(coalesce(needle, '')) < 2 then
    return;
  end if;
  inst := public.course_institution_of(uid);
  if inst is null then
    return;
  end if;

  return query
  select o.id,
    o.title,
    r.id,
    m.user_id is not null,
    case when counts.n >= 3 then counts.n::integer end
  from public.course_offerings o
  left join public.course_rooms r on r.offering_id = o.id
  left join public.course_room_members m on m.room_id = r.id and m.user_id = uid
  left join lateral (
    select count(*) as n from public.course_room_members x where x.room_id = r.id
  ) counts on true
  where o.institution_id = inst
    and public.study_name_key(o.title) like '%' || needle || '%'
  order by (m.user_id is not null) desc, coalesce(counts.n, 0) desc, o.title
  limit 20;
end
$$;

-- Voluntary join. Creates the room at the first join; safe under concurrent joins.
create or replace function public.join_course_room(p_offering_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  inst text;
  v_room uuid;
begin
  if uid is null then
    raise exception 'Authentication required';
  end if;
  inst := public.course_institution_of(uid);
  if inst is null or not exists (
    select 1 from public.course_offerings o where o.id = p_offering_id and o.institution_id = inst
  ) then
    raise exception 'Course space not available';
  end if;

  insert into public.course_rooms (offering_id) values (p_offering_id)
  on conflict (offering_id) do nothing;
  select r.id into v_room from public.course_rooms r where r.offering_id = p_offering_id;

  if not exists (select 1 from public.course_room_members m where m.room_id = v_room and m.user_id = uid) then
    if (select count(*) from public.course_room_members m where m.user_id = uid) >= 40 then
      raise exception 'Too many course spaces';
    end if;
    insert into public.course_room_members (room_id, user_id) values (v_room, uid)
    on conflict do nothing;
  end if;
  return v_room;
end
$$;

create or replace function public.leave_course_room(p_room_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;
  delete from public.course_room_members where room_id = p_room_id and user_id = auth.uid();
end
$$;

-- Members only. Text and/or one attachment stored under the author's folder for this
-- room and/or an explicitly shared exam date. Bursts, daily volume and repeats are refused.
create or replace function public.post_course_room_message(
  p_room_id uuid,
  p_content text,
  p_attachment_url text default null,
  p_attachment_type text default null,
  p_attachment_name text default null,
  p_exam_date date default null
)
returns public.community_messages
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  v_text text := nullif(btrim(coalesce(p_content, '')), '');
  result public.community_messages;
begin
  if uid is null then
    raise exception 'Authentication required';
  end if;
  if not exists (select 1 from public.course_room_members m where m.room_id = p_room_id and m.user_id = uid) then
    raise exception 'Join this course space to post';
  end if;
  if v_text is null and p_attachment_url is null and p_exam_date is null then
    raise exception 'Empty message';
  end if;
  if char_length(coalesce(v_text, '')) > 1000 then
    raise exception 'Message too long';
  end if;
  if p_attachment_url is not null and (
       p_attachment_url !~ ('^community:' || uid::text || '/' || p_room_id::text || '/[A-Za-z0-9._-]+$')
       or coalesce(p_attachment_type, '') not in ('image', 'file')
       or char_length(coalesce(p_attachment_name, '')) > 160
     ) then
    raise exception 'Invalid attachment';
  end if;
  if p_exam_date is not null and (p_exam_date < current_date - 1 or p_exam_date > current_date + 730) then
    raise exception 'Invalid exam date';
  end if;

  if (select count(*) from public.community_messages c
      where c.user_id = uid and c.room_id is not null and c.created_at > now() - interval '30 seconds') >= 6
     or (select count(*) from public.community_messages c
      where c.user_id = uid and c.room_id is not null and c.created_at > now() - interval '1 day') >= 200 then
    raise exception 'Rate limit exceeded';
  end if;
  if v_text is not null and exists (
    select 1 from public.community_messages c
    where c.user_id = uid and c.room_id = p_room_id and c.content = v_text
      and c.created_at > now() - interval '2 minutes'
  ) then
    raise exception 'Duplicate message';
  end if;

  insert into public.community_messages
    (community, room_id, user_id, content, content_type, attachment_url, attachment_type, attachment_name, exam_date)
  values
    (null, p_room_id, uid, v_text, 'discussion', p_attachment_url,
     case when p_attachment_url is null then null else p_attachment_type end,
     case when p_attachment_url is null then null else nullif(btrim(p_attachment_name), '') end,
     p_exam_date)
  returning * into result;
  return result;
end
$$;

create or replace function public.report_course_message(p_message_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  v_room uuid;
  v_author uuid;
begin
  if uid is null then
    raise exception 'Authentication required';
  end if;
  if coalesce(p_reason, '') not in ('spam', 'abuse', 'other') then
    raise exception 'Invalid reason';
  end if;
  select c.room_id, c.user_id into v_room, v_author
  from public.community_messages c where c.id = p_message_id;
  if v_room is null or not exists (
    select 1 from public.course_room_members m where m.room_id = v_room and m.user_id = uid
  ) then
    raise exception 'Message not available';
  end if;
  if v_author = uid then
    raise exception 'Cannot report your own message';
  end if;
  if (select count(*) from public.course_message_reports r
      where r.reporter_id = uid and r.created_at > now() - interval '1 day') >= 20 then
    raise exception 'Rate limit exceeded';
  end if;

  insert into public.course_message_reports (message_id, reporter_id, reason)
  values (p_message_id, uid, p_reason)
  on conflict (message_id, reporter_id) do nothing;

  if (select count(*) from public.course_message_reports r
      where r.message_id = p_message_id and r.resolved_at is null) >= 3 then
    update public.community_messages set hidden_at = coalesce(hidden_at, now()) where id = p_message_id;
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- Admin moderation
-- ---------------------------------------------------------------------------

create or replace function public.admin_course_reports()
returns table (
  message_id uuid,
  room_title text,
  institution_id text,
  author_id uuid,
  author_pseudo text,
  content text,
  attachment_name text,
  exam_date date,
  created_at timestamptz,
  hidden boolean,
  reports integer,
  reasons text[],
  last_reported_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
begin
  if not public.is_current_user_admin() then
    raise exception 'Admin only';
  end if;
  return query
  select c.id, o.title, o.institution_id, c.user_id, p.pseudo, c.content, c.attachment_name, c.exam_date,
    c.created_at, c.hidden_at is not null,
    count(*)::integer,
    array_agg(distinct r.reason),
    max(r.created_at)
  from public.course_message_reports r
  join public.community_messages c on c.id = r.message_id
  join public.course_rooms cr on cr.id = c.room_id
  join public.course_offerings o on o.id = cr.offering_id
  left join public.profiles p on p.id = c.user_id
  where r.resolved_at is null
  group by c.id, o.title, o.institution_id, c.user_id, p.pseudo, c.content, c.attachment_name, c.exam_date,
    c.created_at, c.hidden_at
  order by max(r.created_at) desc
  limit 100;
end
$$;

-- p_remove = true deletes the message (its reports go with it);
-- false dismisses the reports and shows the message again.
create or replace function public.admin_resolve_course_report(p_message_id uuid, p_remove boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_current_user_admin() then
    raise exception 'Admin only';
  end if;
  if p_remove then
    delete from public.community_messages where id = p_message_id and room_id is not null;
  else
    update public.course_message_reports set resolved_at = now()
    where message_id = p_message_id and resolved_at is null;
    update public.community_messages set hidden_at = null where id = p_message_id and room_id is not null;
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------

revoke all on function public.course_space_summaries(uuid[]) from public, anon;
revoke all on function public.search_course_spaces(text) from public, anon;
revoke all on function public.join_course_room(uuid) from public, anon;
revoke all on function public.leave_course_room(uuid) from public, anon;
revoke all on function public.post_course_room_message(uuid, text, text, text, text, date) from public, anon;
revoke all on function public.report_course_message(uuid, text) from public, anon;
revoke all on function public.admin_course_reports() from public, anon;
revoke all on function public.admin_resolve_course_report(uuid, boolean) from public, anon;
grant execute on function public.course_space_summaries(uuid[]) to authenticated;
grant execute on function public.search_course_spaces(text) to authenticated;
grant execute on function public.join_course_room(uuid) to authenticated;
grant execute on function public.leave_course_room(uuid) to authenticated;
grant execute on function public.post_course_room_message(uuid, text, text, text, text, date) to authenticated;
grant execute on function public.report_course_message(uuid, text) to authenticated;
grant execute on function public.admin_course_reports() to authenticated;
grant execute on function public.admin_resolve_course_report(uuid, boolean) to authenticated;

commit;
