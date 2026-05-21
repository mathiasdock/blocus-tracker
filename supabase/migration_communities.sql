-- ============================================================
--  Migration : Communautés (chat universités)
--  À exécuter dans le SQL Editor Supabase (une fois).
-- ============================================================

create table if not exists public.community_messages (
  id              uuid primary key default gen_random_uuid(),
  community       text not null,                 -- ex: 'ULB', 'ICHEC'...
  user_id         uuid not null references auth.users(id) on delete cascade,
  content         text,
  attachment_url  text,
  attachment_type text,                          -- 'image' | 'file'
  attachment_name text,
  created_at      timestamptz not null default now()
);

create index if not exists community_messages_community_idx
  on public.community_messages (community, created_at);

alter table public.community_messages enable row level security;

drop policy if exists "cmsg_read"   on public.community_messages;
drop policy if exists "cmsg_insert" on public.community_messages;
drop policy if exists "cmsg_delete" on public.community_messages;

create policy "cmsg_read"
  on public.community_messages for select to authenticated using (true);
create policy "cmsg_insert"
  on public.community_messages for insert to authenticated
  with check (auth.uid() = user_id);
create policy "cmsg_delete"
  on public.community_messages for delete to authenticated
  using (auth.uid() = user_id);

-- ---------- Storage : pièces jointes du chat ----------
insert into storage.buckets (id, name, public)
values ('community', 'community', true)
on conflict (id) do nothing;

drop policy if exists "community_public_read" on storage.objects;
create policy "community_public_read"
  on storage.objects for select
  using (bucket_id = 'community');

drop policy if exists "community_auth_write" on storage.objects;
create policy "community_auth_write"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'community' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "community_auth_delete" on storage.objects;
create policy "community_auth_delete"
  on storage.objects for delete to authenticated
  using (bucket_id = 'community' and (storage.foldername(name))[1] = auth.uid()::text);
