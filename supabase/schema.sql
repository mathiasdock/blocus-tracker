-- ============================================================
--  blocus-tracker — Supabase schema
--  Run this in the Supabase SQL editor (one shot).
-- ============================================================

-- ---------- PROFILES ----------
create table if not exists public.profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  pseudo      text unique not null,
  first_name  text,
  last_name   text,
  university  text,
  study_field text,
  study_year  text,
  bio         text,
  avatar_url  text,
  created_at  timestamptz not null default now()
);

-- ---------- COURSES ----------
create table if not exists public.courses (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  name       text not null,
  color      text not null default '#10b981',
  created_at timestamptz not null default now()
);

-- ---------- STUDY SESSIONS ----------
create table if not exists public.sessions (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users(id) on delete cascade,
  course_id        uuid references public.courses(id) on delete set null,
  duration_seconds integer not null default 0,
  note             text,
  started_at       timestamptz not null default now(),
  ended_at         timestamptz not null default now()
);

-- ---------- PLANNING / OBJECTIVES ----------
create table if not exists public.objectives (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  course_id      uuid references public.courses(id) on delete set null,
  title          text not null,
  target_minutes integer not null default 60,
  scheduled_date date not null default current_date,
  done           boolean not null default false,
  created_at     timestamptz not null default now()
);

-- ---------- FRIENDSHIPS ----------
create table if not exists public.friendships (
  id          uuid primary key default gen_random_uuid(),
  requester   uuid not null references auth.users(id) on delete cascade,
  addressee   uuid not null references auth.users(id) on delete cascade,
  status      text not null default 'pending', -- 'pending' | 'accepted'
  created_at  timestamptz not null default now(),
  unique (requester, addressee)
);

-- ---------- SOCIAL FEED ----------
create table if not exists public.posts (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  image_url  text not null,
  caption    text,
  created_at timestamptz not null default now()
);

create table if not exists public.likes (
  id         uuid primary key default gen_random_uuid(),
  post_id    uuid not null references public.posts(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (post_id, user_id)
);

create table if not exists public.comments (
  id         uuid primary key default gen_random_uuid(),
  post_id    uuid not null references public.posts(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  content    text not null,
  created_at timestamptz not null default now()
);

-- ============================================================
--  ROW LEVEL SECURITY
--  Authenticated users can READ everyone's study data (needed
--  for the Friends tab & feed). Writes are restricted to owner.
-- ============================================================

alter table public.profiles    enable row level security;
alter table public.courses     enable row level security;
alter table public.sessions    enable row level security;
alter table public.objectives  enable row level security;
alter table public.friendships enable row level security;
alter table public.posts       enable row level security;
alter table public.likes       enable row level security;
alter table public.comments    enable row level security;

-- PROFILES
drop policy if exists "profiles_read"   on public.profiles;
drop policy if exists "profiles_insert" on public.profiles;
drop policy if exists "profiles_update" on public.profiles;
create policy "profiles_read"   on public.profiles for select to authenticated using (true);
create policy "profiles_insert" on public.profiles for insert to authenticated with check (auth.uid() = id);
create policy "profiles_update" on public.profiles for update to authenticated using (auth.uid() = id);

-- COURSES
drop policy if exists "courses_read"  on public.courses;
drop policy if exists "courses_write" on public.courses;
create policy "courses_read"  on public.courses for select to authenticated using (true);
create policy "courses_write" on public.courses for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- SESSIONS
drop policy if exists "sessions_read"  on public.sessions;
drop policy if exists "sessions_write" on public.sessions;
create policy "sessions_read"  on public.sessions for select to authenticated using (true);
create policy "sessions_write" on public.sessions for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- OBJECTIVES
drop policy if exists "objectives_read"  on public.objectives;
drop policy if exists "objectives_write" on public.objectives;
create policy "objectives_read"  on public.objectives for select to authenticated using (true);
create policy "objectives_write" on public.objectives for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- FRIENDSHIPS
drop policy if exists "friendships_read"   on public.friendships;
drop policy if exists "friendships_insert" on public.friendships;
drop policy if exists "friendships_update" on public.friendships;
drop policy if exists "friendships_delete" on public.friendships;
create policy "friendships_read"   on public.friendships for select to authenticated using (auth.uid() = requester or auth.uid() = addressee);
create policy "friendships_insert" on public.friendships for insert to authenticated with check (auth.uid() = requester);
create policy "friendships_update" on public.friendships for update to authenticated using (auth.uid() = requester or auth.uid() = addressee);
create policy "friendships_delete" on public.friendships for delete to authenticated using (auth.uid() = requester or auth.uid() = addressee);

-- POSTS
drop policy if exists "posts_read"  on public.posts;
drop policy if exists "posts_write" on public.posts;
create policy "posts_read"  on public.posts for select to authenticated using (true);
create policy "posts_write" on public.posts for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- LIKES
drop policy if exists "likes_read"  on public.likes;
drop policy if exists "likes_write" on public.likes;
create policy "likes_read"  on public.likes for select to authenticated using (true);
create policy "likes_write" on public.likes for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- COMMENTS
drop policy if exists "comments_read"  on public.comments;
drop policy if exists "comments_write" on public.comments;
create policy "comments_read"  on public.comments for select to authenticated using (true);
create policy "comments_write" on public.comments for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ============================================================
--  STORAGE BUCKETS  (avatars + post images, public read)
-- ============================================================
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('posts', 'posts', true)
on conflict (id) do nothing;

-- Public read for both buckets
drop policy if exists "public_read_media" on storage.objects;
create policy "public_read_media"
  on storage.objects for select
  using (bucket_id in ('avatars', 'posts'));

-- Authenticated users can upload / update / delete their own files
-- (files are stored under a folder named after the user id)
drop policy if exists "auth_write_media" on storage.objects;
create policy "auth_write_media"
  on storage.objects for insert to authenticated
  with check (bucket_id in ('avatars', 'posts') and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "auth_update_media" on storage.objects;
create policy "auth_update_media"
  on storage.objects for update to authenticated
  using (bucket_id in ('avatars', 'posts') and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "auth_delete_media" on storage.objects;
create policy "auth_delete_media"
  on storage.objects for delete to authenticated
  using (bucket_id in ('avatars', 'posts') and (storage.foldername(name))[1] = auth.uid()::text);

-- ============================================================
--  COMMUNAUTÉS (chat universités) — voir aussi
--  migration_communities.sql si la base existe déjà.
-- ============================================================
create table if not exists public.community_messages (
  id              uuid primary key default gen_random_uuid(),
  community       text not null,
  user_id         uuid not null references auth.users(id) on delete cascade,
  content         text,
  attachment_url  text,
  attachment_type text,
  attachment_name text,
  created_at      timestamptz not null default now()
);

create index if not exists community_messages_community_idx
  on public.community_messages (community, created_at);

alter table public.community_messages enable row level security;

drop policy if exists "cmsg_read"   on public.community_messages;
drop policy if exists "cmsg_insert" on public.community_messages;
drop policy if exists "cmsg_delete" on public.community_messages;
create policy "cmsg_read"   on public.community_messages for select to authenticated using (true);
create policy "cmsg_insert" on public.community_messages for insert to authenticated with check (auth.uid() = user_id);
create policy "cmsg_delete" on public.community_messages for delete to authenticated using (auth.uid() = user_id);

insert into storage.buckets (id, name, public)
values ('community', 'community', true)
on conflict (id) do nothing;

drop policy if exists "community_public_read" on storage.objects;
create policy "community_public_read"
  on storage.objects for select using (bucket_id = 'community');

drop policy if exists "community_auth_write" on storage.objects;
create policy "community_auth_write"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'community' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "community_auth_delete" on storage.objects;
create policy "community_auth_delete"
  on storage.objects for delete to authenticated
  using (bucket_id = 'community' and (storage.foldername(name))[1] = auth.uid()::text);
