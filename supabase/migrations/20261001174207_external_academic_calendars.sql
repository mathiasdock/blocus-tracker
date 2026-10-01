-- Step 1 only: external data, no Planning/objective/exam writes.
begin;

create table public.external_calendar_sources (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null check (provider in ('canvas','moodle','brightspace','ical')),
  display_name text not null check (length(display_name) between 1 and 120),
  last_synced_at timestamptz,
  last_attempted_at timestamptz,
  sync_status text not null default 'idle' check (sync_status in ('idle','syncing','success','error')),
  sync_error text check (sync_error is null or sync_error in ('calendar_event_limit','calendar_fetch_failed','calendar_sync_failed','invalid_calendar_feed','unsafe_calendar_host','invalid_calendar_url','calendar_too_large','unsupported_calendar_encoding')),
  sync_token uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id)
);

-- Deliberately separate: SELECT * on a source can never reveal its URL.
-- No browser grants/policies, even for the owner. Service-role API only.
create table public.external_calendar_secrets (
  source_id uuid primary key references public.external_calendar_sources(id) on delete cascade,
  feed_url text not null check (length(feed_url) between 1 and 4096),
  etag text,
  last_modified text,
  snapshot_date date
);

-- Compact snapshot, not an archive. Ownership is inherited from the source.
create table public.external_academic_events (
  source_id uuid not null references public.external_calendar_sources(id) on delete cascade,
  external_uid text not null check (octet_length(external_uid) between 1 and 255),
  recurrence_id text not null default '' check (octet_length(recurrence_id) <= 80),
  raw_title text not null check (octet_length(raw_title) <= 160),
  description_excerpt text check (octet_length(description_excerpt) <= 120),
  external_url text check (octet_length(external_url) <= 384),
  starts_at timestamptz,
  due_at timestamptz,
  event_date date not null,
  floating_at timestamp without time zone,
  all_day boolean not null default false,
  external_course_key text check (octet_length(external_course_key) <= 96),
  external_course_label text check (octet_length(external_course_label) <= 80),
  course_hint text check (octet_length(course_hint) <= 96),
  is_recurring boolean not null default false,
  status text not null check (status = 'active'),
  updated_at timestamptz not null default now(),
  primary key (source_id, external_uid, recurrence_id)
);
-- The PK covers source lookup/upsert. This second index covers source/date
-- Planning ranges and retention. No duplicate UUID PK or per-event owner index.
create index external_academic_events_date on public.external_academic_events(source_id, event_date);

-- Composite FKs enforce ownership even on service-role writes and later
-- ownership changes; RLS alone cannot enforce that the linked course is owned.
alter table public.courses add constraint courses_id_user_calendar_unique unique (id, user_id);
create table public.external_calendar_course_map (
  user_id uuid not null references auth.users(id) on delete cascade,
  source_id uuid not null,
  external_course_key text not null check (octet_length(external_course_key) between 1 and 96),
  external_course_label text check (octet_length(external_course_label) <= 80),
  local_course_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (source_id, external_course_key),
  foreign key (source_id, user_id) references public.external_calendar_sources(id, user_id) on delete cascade,
  foreign key (local_course_id, user_id) references public.courses(id, user_id) on delete cascade
);
create index external_calendar_course_map_user on public.external_calendar_course_map(user_id);
create index external_calendar_course_map_course on public.external_calendar_course_map(local_course_id, user_id);
create index external_calendar_sources_user on public.external_calendar_sources(user_id);

alter table public.external_calendar_sources enable row level security;
alter table public.external_calendar_secrets enable row level security;
alter table public.external_academic_events enable row level security;
alter table public.external_calendar_course_map enable row level security;
revoke all on public.external_calendar_sources, public.external_calendar_secrets,
  public.external_academic_events, public.external_calendar_course_map from public, anon, authenticated;
grant all on public.external_calendar_sources, public.external_calendar_secrets,
  public.external_academic_events, public.external_calendar_course_map to service_role;
grant select, delete on public.external_calendar_sources to authenticated;
grant select on public.external_academic_events to authenticated;
grant select, insert, update, delete on public.external_calendar_course_map to authenticated;
create policy calendar_source_read on public.external_calendar_sources for select to authenticated using ((select auth.uid()) = user_id);
create policy calendar_source_delete on public.external_calendar_sources for delete to authenticated using ((select auth.uid()) = user_id);
create policy calendar_event_read on public.external_academic_events for select to authenticated
using (source_id in (select id from public.external_calendar_sources where user_id = (select auth.uid())));
create policy calendar_map_read on public.external_calendar_course_map for select to authenticated using ((select auth.uid()) = user_id);
create policy calendar_map_insert on public.external_calendar_course_map for insert to authenticated with check ((select auth.uid()) = user_id);
create policy calendar_map_update on public.external_calendar_course_map for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy calendar_map_delete on public.external_calendar_course_map for delete to authenticated using ((select auth.uid()) = user_id);

-- Keep the existing v57 suspended-account write boundary on new tables.
create trigger a00_block_suspended_actor before insert or update or delete on public.external_calendar_sources
  for each row execute function public.block_suspended_actor();
create trigger a00_block_suspended_actor before insert or update or delete on public.external_calendar_secrets
  for each row execute function public.block_suspended_actor();
create trigger a00_block_suspended_actor before insert or update or delete on public.external_academic_events
  for each row execute function public.block_suspended_actor();
create trigger a00_block_suspended_actor before insert or update or delete on public.external_calendar_course_map
  for each row execute function public.block_suspended_actor();

create function public.touch_calendar_map() returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  new.created_at := old.created_at;
  new.updated_at := now();
  return new;
end;
$$;
create trigger calendar_map_updated before update on public.external_calendar_course_map
  for each row execute function public.touch_calendar_map();
revoke all on function public.touch_calendar_map() from public, anon, authenticated;

-- Server-only SECURITY INVOKER functions. No browser can supply p_user_id.
create function public.connect_external_calendar(p_user_id uuid, p_provider text, p_display_name text, p_feed_url text)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare v_id uuid;
begin
  if public.is_suspended(p_user_id) then raise exception 'calendar_account_suspended' using errcode = '42501'; end if;
  -- Serialize connections per user without requiring access to auth internals.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user_id::text, 731));
  if (select count(*) from public.external_calendar_sources where user_id = p_user_id) >= 3 then
    raise exception 'calendar_source_limit' using errcode = 'P0001';
  end if;
  insert into public.external_calendar_sources(user_id, provider, display_name)
    values (p_user_id, p_provider, p_display_name) returning id into v_id;
  insert into public.external_calendar_secrets(source_id, feed_url) values (v_id, p_feed_url);
  return v_id;
end;
$$;

create function public.begin_external_calendar_sync(p_user_id uuid, p_source_id uuid)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare v_source public.external_calendar_sources; v_secret public.external_calendar_secrets; v_token uuid := gen_random_uuid();
begin
  if public.is_suspended(p_user_id) then raise exception 'calendar_account_suspended' using errcode = '42501'; end if;
  select * into v_source from public.external_calendar_sources where id = p_source_id and user_id = p_user_id for update;
  if not found then raise exception 'calendar_not_found' using errcode = 'P0002'; end if;
  -- Persistent throttle/lease works across Vercel instances, failures included.
  if v_source.last_attempted_at > now() - interval '5 minutes' then
    raise exception 'calendar_sync_cooldown' using errcode = 'P0001';
  end if;
  update public.external_calendar_sources set sync_token = v_token, sync_status = 'syncing', sync_error = null,
    last_attempted_at = now(), updated_at = now() where id = p_source_id;
  select * into strict v_secret from public.external_calendar_secrets where source_id = p_source_id;
  return jsonb_build_object('token', v_token, 'provider', v_source.provider,
    'feed_url', v_secret.feed_url,
    -- Re-fetch once per UTC day so newly in-window events can enter even when
    -- the provider's ETag has not changed. Conditional GET remains same-day.
    'etag', case when v_secret.snapshot_date = (now() at time zone 'UTC')::date then v_secret.etag end,
    'last_modified', case when v_secret.snapshot_date = (now() at time zone 'UTC')::date then v_secret.last_modified end);
end;
$$;

create function public.finish_external_calendar_sync(p_user_id uuid, p_source_id uuid, p_token uuid,
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
      course_hint, is_recurring, status)
    select p_source_id, e.external_uid, e.recurrence_id, e.raw_title, e.description_excerpt, e.external_url,
      e.starts_at, e.due_at, e.event_date, e.floating_at, e.all_day, e.external_course_key, e.external_course_label,
      e.course_hint, e.is_recurring, e.status
    from jsonb_populate_recordset(null::public.external_academic_events, p_events) e
    where e.event_date between v_today - 45 and v_today + 365
    on conflict (source_id, external_uid, recurrence_id) do update set
      raw_title = excluded.raw_title, description_excerpt = excluded.description_excerpt, external_url = excluded.external_url,
      starts_at = excluded.starts_at, due_at = excluded.due_at, event_date = excluded.event_date,
      floating_at = excluded.floating_at, all_day = excluded.all_day,
      external_course_key = excluded.external_course_key, external_course_label = excluded.external_course_label,
      course_hint = excluded.course_hint, is_recurring = excluded.is_recurring, status = excluded.status, updated_at = v_now
    -- Keep identical snapshots physically unchanged: no per-row last_seen
    -- writes or unnecessary index churn. Source.last_synced_at is observation.
    where (existing.raw_title, existing.description_excerpt, existing.external_url, existing.starts_at,
      existing.due_at, existing.event_date, existing.floating_at, existing.all_day,
      existing.external_course_key, existing.external_course_label, existing.course_hint, existing.is_recurring, existing.status)
    is distinct from (excluded.raw_title, excluded.description_excerpt, excluded.external_url, excluded.starts_at,
      excluded.due_at, excluded.event_date, excluded.floating_at, excluded.all_day,
      excluded.external_course_key, excluded.external_course_label, excluded.course_hint, excluded.is_recurring, excluded.status);
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

revoke all on function public.connect_external_calendar(uuid,text,text,text),
  public.begin_external_calendar_sync(uuid,uuid),
  public.finish_external_calendar_sync(uuid,uuid,uuid,jsonb,text,text,text) from public, anon, authenticated;
grant execute on function public.connect_external_calendar(uuid,text,text,text),
  public.begin_external_calendar_sync(uuid,uuid),
  public.finish_external_calendar_sync(uuid,uuid,uuid,jsonb,text,text,text) to service_role;
commit;
