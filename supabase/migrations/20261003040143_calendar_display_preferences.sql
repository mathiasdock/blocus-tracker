begin;
-- Display preferences only. No changes to imports, retention, classification,
-- existing policies, or student-owned exams/objectives/courses.
create table public.external_calendar_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  exams boolean not null default true,
  major boolean not null default true,
  normal boolean not null default true
);
-- A hide decision belongs to the source + UID (all recurrence instances).
-- No event FK: removing/retaining feed rows must not erase the student's choice.
-- No copied titles/descriptions/dates or extra indexes. Disconnect cascades it.
create table public.external_calendar_hidden_items (
  source_id uuid not null references public.external_calendar_sources(id) on delete cascade,
  external_uid text not null check (octet_length(external_uid) between 1 and 255),
  primary key (source_id, external_uid)
);
alter table public.external_calendar_preferences enable row level security;
alter table public.external_calendar_hidden_items enable row level security;
revoke all on public.external_calendar_preferences, public.external_calendar_hidden_items from public, anon, authenticated;
grant select, insert, update on public.external_calendar_preferences to authenticated;
grant select, insert, delete on public.external_calendar_hidden_items to authenticated;
grant all on public.external_calendar_preferences, public.external_calendar_hidden_items to service_role;
create policy calendar_preferences_read on public.external_calendar_preferences for select to authenticated using (user_id=(select auth.uid()));
create policy calendar_preferences_insert on public.external_calendar_preferences for insert to authenticated with check (user_id=(select auth.uid()));
create policy calendar_preferences_update on public.external_calendar_preferences for update to authenticated using (user_id=(select auth.uid())) with check (user_id=(select auth.uid()));
create policy calendar_hidden_read on public.external_calendar_hidden_items for select to authenticated
  using (source_id in (select id from public.external_calendar_sources where user_id=(select auth.uid())));
create policy calendar_hidden_insert on public.external_calendar_hidden_items for insert to authenticated
  with check (source_id in (select id from public.external_calendar_sources where user_id=(select auth.uid())));
create policy calendar_hidden_delete on public.external_calendar_hidden_items for delete to authenticated
  using (source_id in (select id from public.external_calendar_sources where user_id=(select auth.uid())));
create trigger a00_block_suspended_actor before insert or update or delete on public.external_calendar_preferences
  for each row execute function public.block_suspended_actor();
create trigger a00_block_suspended_actor before insert or update or delete on public.external_calendar_hidden_items
  for each row execute function public.block_suspended_actor();
commit;
