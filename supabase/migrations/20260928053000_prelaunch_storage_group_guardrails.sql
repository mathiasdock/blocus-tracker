-- A suspended account may retain a valid Auth JWT until it expires. Public
-- table triggers already block its writes; apply the same rule to Storage
-- inserts/upserts without changing any bucket limits or read/delete behavior.
drop policy if exists media_upload_guard on storage.objects;
create policy media_upload_guard on storage.objects
  as restrictive
  for insert
  to authenticated
  with check (
    bucket_id <> all (array['avatars', 'posts', 'dm', 'community', 'group'])
    or (
      not public.is_suspended(auth.uid())
      and public.media_upload_status() = 'ok'
    )
  );

drop policy if exists media_upload_guard_update on storage.objects;
create policy media_upload_guard_update on storage.objects
  as restrictive
  for update
  to authenticated
  using (true)
  with check (
    bucket_id <> all (array['avatars', 'posts', 'dm', 'community', 'group'])
    or (
      not public.is_suspended(auth.uid())
      and public.media_uploads_enabled()
    )
  );

-- Group creation was the remaining unrestricted social insert that can
-- produce unbounded groups. Reuse the existing atomic per-user rate guard.
drop trigger if exists study_groups_rate_limit on public.study_groups;
create trigger study_groups_rate_limit
  before insert on public.study_groups
  for each row execute function public.enforce_insert_rate_limit('created_by', '10', '3600');
