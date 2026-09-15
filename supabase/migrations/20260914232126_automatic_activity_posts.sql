begin;
alter table public.posts add column if not exists activity jsonb;
alter table public.posts add column if not exists auto_event_key text;
create unique index if not exists posts_auto_event_unique on public.posts(user_id, auto_event_key) where auto_event_key is not null;
create table if not exists public.auto_share_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  preferences jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  constraint auto_share_preferences_object check (jsonb_typeof(preferences) = 'object')
);
alter table public.auto_share_settings enable row level security;
grant select, insert, update on public.auto_share_settings to authenticated;
revoke all on public.auto_share_settings from anon;
create policy auto_share_settings_own on public.auto_share_settings for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
commit;
