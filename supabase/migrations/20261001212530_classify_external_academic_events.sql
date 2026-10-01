-- Step 2: deterministic type/importance, no objectives/exams/UI writes.
-- Step 1 migration, retention, fetching and mapping stay unchanged.
begin;

-- Four bytes each, fixed taxonomy, no new indexes or metadata blobs.
create type public.academic_event_type as enum ('exam','quiz','assignment','project','presentation','other');
create type public.academic_event_confidence as enum ('high','medium','low');
create type public.academic_event_importance as enum ('critical','major','normal');

alter table public.external_academic_events
  add column automatic_type public.academic_event_type not null default 'other',
  add column automatic_confidence public.academic_event_confidence not null default 'low',
  add column automatic_importance public.academic_event_importance not null default 'normal',
  add column user_override public.academic_event_type,
  add column event_type public.academic_event_type generated always as (coalesce(user_override, automatic_type)) stored,
  add column confidence public.academic_event_confidence generated always as
    (case when user_override is not null then 'high'::public.academic_event_confidence else automatic_confidence end) stored,
  add column importance public.academic_event_importance generated always as (
    case
      when coalesce(user_override, automatic_type) = 'exam' and (user_override is not null or automatic_confidence = 'high') then 'critical'::public.academic_event_importance
      when coalesce(user_override, automatic_type) in ('project','presentation') then 'major'::public.academic_event_importance
      when coalesce(user_override, automatic_type) = 'assignment' and automatic_type = 'assignment' and automatic_importance = 'major' then 'major'::public.academic_event_importance
      else 'normal'::public.academic_event_importance
    end
  ) stored,
  add constraint academic_event_automatic_importance_consistent check (
    (automatic_type = 'exam' and automatic_confidence = 'high' and automatic_importance = 'critical')
    or (automatic_type = 'exam' and automatic_confidence <> 'high' and automatic_importance = 'normal')
    or (automatic_type in ('project','presentation') and automatic_importance = 'major')
    or (automatic_type = 'assignment' and automatic_importance in ('major','normal'))
    or (automatic_type in ('quiz','other') and automatic_importance = 'normal')
  );

-- A future correction UI may update *only* this column. All imported fields,
-- generated effective results and automatic classifications remain read-only.
grant update (user_override) on public.external_academic_events to authenticated;
create policy calendar_event_override on public.external_academic_events for update to authenticated
using (source_id in (select id from public.external_calendar_sources where user_id = (select auth.uid())))
with check (source_id in (select id from public.external_calendar_sources where user_id = (select auth.uid())));

create function public.touch_calendar_override() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if new.user_override is distinct from old.user_override then new.updated_at := now(); end if;
  return new;
end;
$$;
revoke all on function public.touch_calendar_override() from public, anon, authenticated;
create trigger calendar_override_updated before update of user_override on public.external_academic_events
for each row execute function public.touch_calendar_override();
-- The existing a00_block_suspended_actor trigger also covers corrections.

-- Existing rows start conservatively other/low until the next manual sync.
-- Discard validators so that even an unchanged upstream snapshot gets classified.
update public.external_calendar_secrets set etag = null, last_modified = null, snapshot_date = null;

-- This replaces only Step 1's final write boundary: adds the three automatic
-- fields to upsert/comparison. user_override is intentionally absent from BOTH
-- INSERT and UPDATE, even if a service payload tries to supply it.
create or replace function public.finish_external_calendar_sync(p_user_id uuid, p_source_id uuid, p_token uuid,
  p_events jsonb, p_etag text default null, p_last_modified text default null, p_error text default null)
returns integer language plpgsql security invoker set search_path = '' as $$
declare
  v_now timestamptz := now();
  v_today date := (now() at time zone 'UTC')::date;
  v_count integer;
begin
  -- Serialize the aggregate 300-event user budget across up to three sources.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user_id::text, 731));
  perform 1 from public.external_calendar_sources
    where id = p_source_id and user_id = p_user_id and sync_token = p_token for update;
  if not found then raise exception 'calendar_sync_stale' using errcode = 'P0002'; end if;
  if p_error is not null then
    update public.external_calendar_sources set sync_status = 'error', sync_error = p_error, sync_token = null, updated_at = v_now where id = p_source_id;
    return 0;
  end if;
  if public.is_suspended(p_user_id) then raise exception 'calendar_account_suspended' using errcode = '42501'; end if;
  -- Prune all this user's sources on successful sync, including a 304.
  delete from public.external_academic_events e using public.external_calendar_sources s
    where e.source_id = s.id and s.user_id = p_user_id
      and (e.event_date < v_today - 45 or e.event_date > v_today + 365);
  if p_events is not null then
    if jsonb_typeof(p_events) <> 'array' or jsonb_array_length(p_events) > 300 then
      raise exception 'calendar_event_limit' using errcode = 'P0001';
    end if;
    -- Service-only boundary still validates fields for *all* supplied records.
    if exists (select 1 from jsonb_populate_recordset(null::public.external_academic_events, p_events) e
      where e.status is distinct from 'active' or e.event_date is null) then raise exception 'invalid_calendar_feed'; end if;
    -- Disappearance/cancellation removes a row immediately. No tombstones.
    delete from public.external_academic_events e where source_id = p_source_id and not exists (
      select 1 from jsonb_array_elements(p_events) item
      where item->>'external_uid' = e.external_uid and item->>'recurrence_id' = e.recurrence_id);
    insert into public.external_academic_events as existing (
      source_id, external_uid, recurrence_id, raw_title, description_excerpt, external_url,
      starts_at, due_at, event_date, floating_at, all_day, external_course_key, external_course_label,
      course_hint, is_recurring, status, automatic_type, automatic_confidence, automatic_importance)
    select p_source_id, e.external_uid, e.recurrence_id, e.raw_title, e.description_excerpt, e.external_url,
      e.starts_at, e.due_at, e.event_date, e.floating_at, e.all_day, e.external_course_key, e.external_course_label,
      e.course_hint, e.is_recurring, e.status, coalesce(e.automatic_type, 'other'),
      coalesce(e.automatic_confidence, 'low'), coalesce(e.automatic_importance, 'normal')
    from jsonb_populate_recordset(null::public.external_academic_events, p_events) e
    where e.event_date between v_today - 45 and v_today + 365
    on conflict (source_id, external_uid, recurrence_id) do update set
      raw_title = excluded.raw_title, description_excerpt = excluded.description_excerpt, external_url = excluded.external_url,
      starts_at = excluded.starts_at, due_at = excluded.due_at, event_date = excluded.event_date,
      floating_at = excluded.floating_at, all_day = excluded.all_day,
      external_course_key = excluded.external_course_key, external_course_label = excluded.external_course_label,
      course_hint = excluded.course_hint, is_recurring = excluded.is_recurring, status = excluded.status,
      automatic_type = excluded.automatic_type, automatic_confidence = excluded.automatic_confidence,
      automatic_importance = excluded.automatic_importance, updated_at = v_now
    -- Keep identical snapshots physically unchanged: no per-row last_seen
    -- writes or unnecessary index churn. Source.last_synced_at is observation.
    where (existing.raw_title, existing.description_excerpt, existing.external_url, existing.starts_at,
      existing.due_at, existing.event_date, existing.floating_at, existing.all_day,
      existing.external_course_key, existing.external_course_label, existing.course_hint, existing.is_recurring, existing.status,
      existing.automatic_type, existing.automatic_confidence, existing.automatic_importance)
    is distinct from (excluded.raw_title, excluded.description_excerpt, excluded.external_url, excluded.starts_at,
      excluded.due_at, excluded.event_date, excluded.floating_at, excluded.all_day,
      excluded.external_course_key, excluded.external_course_label, excluded.course_hint, excluded.is_recurring, excluded.status,
      excluded.automatic_type, excluded.automatic_confidence, excluded.automatic_importance);
    if (select count(*) from public.external_academic_events e join public.external_calendar_sources s on s.id = e.source_id
      where s.user_id = p_user_id) > 300 then raise exception 'calendar_event_limit' using errcode = 'P0001'; end if;
    update public.external_calendar_secrets set etag = p_etag, last_modified = p_last_modified, snapshot_date = v_today where source_id = p_source_id;
  end if;
  update public.external_calendar_sources set last_synced_at = v_now, sync_status = 'success', sync_error = null,
    sync_token = null, updated_at = v_now where id = p_source_id;
  select count(*) into v_count from public.external_academic_events where source_id = p_source_id;
  return v_count;
end;
$$;

revoke all on function public.finish_external_calendar_sync(uuid,uuid,uuid,jsonb,text,text,text) from public, anon, authenticated;
grant execute on function public.finish_external_calendar_sync(uuid,uuid,uuid,jsonb,text,text,text) to service_role;
commit;
