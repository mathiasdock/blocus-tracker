-- Default academic spaces (Communities phase 2, refinement of 2026-09-17)
--
-- A student now always belongs to two spaces built from their profile: their
-- INSTITUTION and their PROGRAM INSIDE THAT INSTITUTION. They exist so the page
-- is never empty before a course match appears, and they use the very same
-- rooms, membership and privacy rules as course spaces.
--
-- What this migration deliberately does NOT bring back: the global hub, the
-- cross-university field spaces, exam spaces, the university → field → program
-- → course hierarchy and its browsing UI. A program space is scoped to one
-- institution: "Business & Management · ICHEC" is not "Business & Management ·
-- Solvay", and no cross-institution program space is ever created.
--
-- Legacy `study_spaces` rows are read for two facts only (an institution's
-- name, a broad field's English name); nothing of the retired taxonomy is
-- restored, and no legacy row is written, moved or deleted.

begin;

-- ---------------------------------------------------------------------------
-- Rooms: a course, an institution, or a program inside an institution
-- ---------------------------------------------------------------------------
alter table public.course_rooms
  add column kind text not null default 'course',
  add column institution_id text references public.study_spaces(id) on delete cascade,
  add column program_key text,
  add column title text;

-- A UNIQUE constraint accepts many NULLs, so the course uniqueness stays as it
-- is while default rooms carry no offering.
alter table public.course_rooms alter column offering_id drop not null;

alter table public.course_rooms add constraint course_rooms_kind
  check (kind in ('course', 'university', 'program'));

alter table public.course_rooms add constraint course_rooms_shape check (
  case kind
    when 'course' then offering_id is not null and institution_id is null and program_key is null and title is null
    when 'university' then offering_id is null and institution_id is not null and program_key is null and title is not null
    else offering_id is null and institution_id is not null and program_key is not null and title is not null
  end
);

create unique index course_rooms_university_idx on public.course_rooms (institution_id) where kind = 'university';
create unique index course_rooms_program_idx on public.course_rooms (institution_id, program_key) where kind = 'program';

comment on column public.course_rooms.kind is 'course (a canonical course) | university | program — the last two are the default spaces built from the profile.';
comment on column public.course_rooms.program_key is 'study_name_key of the program label; unique per institution, never across institutions.';

-- ---------------------------------------------------------------------------
-- Leaving a default space is remembered
-- ---------------------------------------------------------------------------
-- Without this, the automatic sync would put the student back in the space
-- they just left, on the next page load.
create table public.course_room_optouts (
  user_id uuid not null references auth.users(id) on delete cascade,
  room_id uuid not null references public.course_rooms(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, room_id)
);
comment on table public.course_room_optouts is 'Default spaces a student left on purpose; the automatic sync skips them until the student joins again.';

alter table public.course_room_optouts enable row level security;
revoke all on public.course_room_optouts from anon, authenticated;
grant select on public.course_room_optouts to authenticated;
create policy course_room_optouts_read_own on public.course_room_optouts
  for select to authenticated using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- The program a profile declares, inside its institution
-- ---------------------------------------------------------------------------
-- The broad field (22 stable ids, English names already stored in study_spaces)
-- is preferred: it does not fragment on spelling. A profile that only carries a
-- free-text program falls back to that text. "Other studies" creates no space:
-- it would gather unrelated students behind one meaningless name.
create or replace function public.course_program_of(p_user uuid)
returns table (program_key text, program_title text)
language sql
stable
set search_path = public
as $$
  select public.study_name_key(label), label
  from (
    select coalesce(
      (select s.name
         from public.profiles p
         join public.study_spaces s on s.id = 'field-' || p.broad_field
        where p.id = p_user
          and coalesce(btrim(p.broad_field), '') not in ('', 'other')),
      (select nullif(btrim(p.study_field), '') from public.profiles p where p.id = p_user)
    ) as label
  ) source
  where char_length(coalesce(label, '')) >= 2
    and char_length(coalesce(public.study_name_key(label), '')) >= 2;
$$;

revoke all on function public.course_program_of(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- The two default spaces of the caller, created and joined on demand
-- ---------------------------------------------------------------------------
-- Idempotent: called every time the page opens. It creates the rooms lazily,
-- joins the student automatically unless they left on purpose, and drops the
-- automatic membership of a space that no longer matches their profile (a
-- change of institution or program moves them; their messages stay).
create or replace function public.ensure_my_default_rooms()
returns table (
  room_id uuid,
  kind text,
  title text,
  institution_id text,
  institution_name text,
  joined boolean,
  member_count integer,
  last_message_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  uid uuid := auth.uid();
  v_inst text;
  v_inst_name text;
  v_program_key text;
  v_program_title text;
  v_university uuid;
  v_program uuid;
begin
  if uid is null then
    raise exception 'Authentication required';
  end if;

  v_inst := public.course_institution_of(uid);
  if v_inst is not null then
    select s.name into v_inst_name from public.study_spaces s where s.id = v_inst;

    select r.id into v_university from public.course_rooms r
      where r.kind = 'university' and r.institution_id = v_inst;
    if v_university is null then
      begin
        insert into public.course_rooms (kind, institution_id, title)
        values ('university', v_inst, v_inst_name)
        returning id into v_university;
      exception when unique_violation then
        select r.id into v_university from public.course_rooms r
          where r.kind = 'university' and r.institution_id = v_inst;
      end;
    end if;

    select p.program_key, p.program_title into v_program_key, v_program_title
    from public.course_program_of(uid) p;

    if v_program_key is not null then
      select r.id into v_program from public.course_rooms r
        where r.kind = 'program' and r.institution_id = v_inst and r.program_key = v_program_key;
      if v_program is null then
        begin
          insert into public.course_rooms (kind, institution_id, program_key, title)
          values ('program', v_inst, v_program_key, v_program_title)
          returning id into v_program;
        exception when unique_violation then
          select r.id into v_program from public.course_rooms r
            where r.kind = 'program' and r.institution_id = v_inst and r.program_key = v_program_key;
        end;
      end if;
    end if;
  end if;

  -- A profile change moves the student: the default memberships that no longer
  -- match are dropped. Course spaces are never touched here.
  delete from public.course_room_members m
  using public.course_rooms r
  where m.room_id = r.id
    and m.user_id = uid
    and r.kind in ('university', 'program')
    and m.room_id is distinct from v_university
    and m.room_id is distinct from v_program;

  insert into public.course_room_members (room_id, user_id)
  select x.id, uid
  from (select v_university as id union all select v_program) x
  where x.id is not null
    and not exists (select 1 from public.course_room_optouts o where o.user_id = uid and o.room_id = x.id)
  on conflict do nothing;

  return query
  select r.id, r.kind, r.title, r.institution_id, s.name,
    m.user_id is not null,
    case when counts.n >= 3 then counts.n::integer end,
    case when m.user_id is not null then activity.at end
  from public.course_rooms r
  join public.study_spaces s on s.id = r.institution_id
  left join public.course_room_members m on m.room_id = r.id and m.user_id = uid
  left join lateral (
    select count(*) as n from public.course_room_members x where x.room_id = r.id
  ) counts on true
  left join lateral (
    select max(c.created_at) as at from public.community_messages c
    where c.room_id = r.id and c.hidden_at is null
  ) activity on true
  where r.id in (v_university, v_program)
  order by (r.kind = 'program'), r.title;
end
$$;

revoke all on function public.ensure_my_default_rooms() from public, anon;
grant execute on function public.ensure_my_default_rooms() to authenticated;

-- ---------------------------------------------------------------------------
-- Joining a default space again after leaving it
-- ---------------------------------------------------------------------------
-- Only the caller's OWN institution and program spaces: a student can never
-- join the university or the program space of another institution.
create or replace function public.join_default_room(p_room_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  v_inst text;
  v_program_key text;
  v_room public.course_rooms;
begin
  if uid is null then
    raise exception 'Authentication required';
  end if;
  select * into v_room from public.course_rooms r where r.id = p_room_id;
  if v_room.id is null or v_room.kind not in ('university', 'program') then
    raise exception 'Course space not available';
  end if;

  v_inst := public.course_institution_of(uid);
  if v_inst is null or v_room.institution_id is distinct from v_inst then
    raise exception 'Course space not available';
  end if;
  if v_room.kind = 'program' then
    select p.program_key into v_program_key from public.course_program_of(uid) p;
    if v_program_key is null or v_room.program_key is distinct from v_program_key then
      raise exception 'Course space not available';
    end if;
  end if;

  delete from public.course_room_optouts o where o.user_id = uid and o.room_id = p_room_id;
  insert into public.course_room_members (room_id, user_id) values (p_room_id, uid)
  on conflict do nothing;
end
$$;

revoke all on function public.join_default_room(uuid) from public, anon;
grant execute on function public.join_default_room(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Leaving: remember it when the space is a default one
-- ---------------------------------------------------------------------------
create or replace function public.leave_course_room(p_room_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'Authentication required';
  end if;
  delete from public.course_room_members where room_id = p_room_id and user_id = uid;
  if exists (select 1 from public.course_rooms r where r.id = p_room_id and r.kind in ('university', 'program')) then
    insert into public.course_room_optouts (user_id, room_id) values (uid, p_room_id)
    on conflict do nothing;
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- The 40-space cap counts course spaces only
-- ---------------------------------------------------------------------------
-- The two default spaces are not a choice; they must never keep a student from
-- joining a course space.
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
    if (select count(*) from public.course_room_members m
        join public.course_rooms r on r.id = m.room_id
        where m.user_id = uid and r.kind = 'course') >= 40 then
      raise exception 'Too many course spaces';
    end if;
    insert into public.course_room_members (room_id, user_id) values (v_room, uid)
    on conflict do nothing;
  end if;
  return v_room;
end
$$;

-- ---------------------------------------------------------------------------
-- Moderation: a report can now come from a default space too
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
  select c.id,
    coalesce(o.title, cr.title),
    coalesce(o.institution_id, cr.institution_id),
    c.user_id, p.pseudo, c.content, c.attachment_name, c.exam_date,
    c.created_at, c.hidden_at is not null,
    count(*)::integer,
    array_agg(distinct r.reason),
    max(r.created_at)
  from public.course_message_reports r
  join public.community_messages c on c.id = r.message_id
  join public.course_rooms cr on cr.id = c.room_id
  left join public.course_offerings o on o.id = cr.offering_id
  left join public.profiles p on p.id = c.user_id
  where r.resolved_at is null
  group by c.id, o.title, cr.title, o.institution_id, cr.institution_id, c.user_id, p.pseudo,
    c.content, c.attachment_name, c.exam_date, c.created_at, c.hidden_at
  order by max(r.created_at) desc
  limit 100;
end
$$;

commit;
