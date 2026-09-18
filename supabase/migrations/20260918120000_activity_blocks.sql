-- Activity: blocking applies here too, and one dead table leaves.
--
-- `user_blocks` was built for the course spaces (2026-09-17) and stayed there:
-- a student blocked in a course room could still appear in Activity, and could
-- still react to and comment on the blocker's posts. Two surfaces, two rules.
-- This migration makes the block mean the same thing everywhere.
--
-- The block stays invisible to the blocked student: nothing here tells them
-- anything, their rows simply stop being returned. `user_blocks` keeps its
-- read-own-rows policy, so the helper below is security definer — the "someone
-- blocked me" direction must be enforced without being readable.
begin;

create or replace function public.activity_blocked_with(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_blocks b
    where (b.blocker_id = (select auth.uid()) and b.blocked_id = p_user)
       or (b.blocker_id = p_user and b.blocked_id = (select auth.uid()))
  );
$$;

revoke all on function public.activity_blocked_with(uuid) from public, anon;
grant execute on function public.activity_blocked_with(uuid) to authenticated;

-- Posts: the existing audience rule is kept exactly as it is (friends-only
-- posts stay friends-only) and a block is added on top of it. Nothing is
-- widened here.
drop policy if exists "posts_read" on public.posts;
create policy "posts_read" on public.posts for select to authenticated
using (
  (visibility is distinct from 'friends' or public.is_friend_or_self(user_id))
  and not public.activity_blocked_with(user_id)
);

drop policy if exists "likes_read" on public.likes;
create policy "likes_read" on public.likes for select to authenticated
using (
  exists (
    select 1 from public.posts p
    where p.id = likes.post_id
      and (p.visibility is distinct from 'friends' or public.is_friend_or_self(p.user_id))
      and not public.activity_blocked_with(p.user_id)
  )
  and not public.activity_blocked_with(user_id)
);

drop policy if exists "comments_read" on public.comments;
create policy "comments_read" on public.comments for select to authenticated
using (
  exists (
    select 1 from public.posts p
    where p.id = comments.post_id
      and (p.visibility is distinct from 'friends' or public.is_friend_or_self(p.user_id))
      and not public.activity_blocked_with(p.user_id)
  )
  and not public.activity_blocked_with(user_id)
);

-- Writing: a blocked student cannot encourage or comment the blocker's post,
-- in either direction. Until now any signed-in account could write on any post
-- it could read, and a block did not stop that.
drop policy if exists "likes_insert" on public.likes;
create policy "likes_insert" on public.likes for insert to authenticated
with check (
  auth.uid() = user_id
  and exists (
    select 1 from public.posts p
    where p.id = likes.post_id
      and (p.visibility is distinct from 'friends' or public.is_friend_or_self(p.user_id))
      and not public.activity_blocked_with(p.user_id)
  )
);

drop policy if exists "comments_insert" on public.comments;
create policy "comments_insert" on public.comments for insert to authenticated
with check (
  auth.uid() = user_id
  and exists (
    select 1 from public.posts p
    where p.id = comments.post_id
      and (p.visibility is distinct from 'friends' or public.is_friend_or_self(p.user_id))
      and not public.activity_blocked_with(p.user_id)
  )
);

-- `post_views` was created for a "seen by" counter that was never built: no
-- row was ever written, no code reads or writes it, no function, trigger or
-- foreign key points at it. Verified empty (0 rows) before dropping.
drop table if exists public.post_views;

commit;
