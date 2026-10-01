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
  sync_error text check (sync_error is null or sync_error in ('calendar_fetch_failed','calendar_sync_failed','invalid_calendar_feed','unsafe_calendar_host','invalid_calendar_url','calendar_too_large','unsupported_calendar_encoding')),
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
  last_modified text
);

create table public.external_academic_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source_id uuid not null,
  external_uid text not null check (length(external_uid) between 1 and 1024),
  -- Empty for the series/master; explicit recurrence overrides remain distinct.
  recurrence_id text not null default '',
  raw_title text not null default '',
  description text,
  location text,
  starts_at timestamptz,
  ends_at timestamptz,
  due_at timestamptz,
  start_date date,
  end_date date,
  due_date date,
  all_day boolean not null default false,
  external_url text,
  external_course_key text,
  external_course_label text,
  provider_updated_at timestamptz,
  sequence integer not null default 0,
  raw_status text,
  status text not null check (status in ('active','cancelled','missing')),
  metadata jsonb not null default '{}',
  last_seen_at timestamptz not null default now(),
  removed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (source_id, user_id) references public.external_calendar_sources(id, user_id) on delete cascade,
  unique (source_id, external_uid, recurrence_id)
);
create index external_academic_events_user on public.external_academic_events(user_id);

-- Composite FKs enforce ownership even on service-role writes and later
-- ownership changes; RLS alone cannot enforce that the linked course is owned.
alter table public.courses add constraint courses_id_user_calendar_unique unique (id, user_id);
create table public.external_calendar_course_map (
  user_id uuid not null references auth.users(id) on delete cascade,
  source_id uuid not null,
  external_course_key text not null check (length(external_course_key) between 1 and 1024),
  external_course_label text check (length(external_course_label) <= 1024),
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
create policy calendar_event_read on public.external_academic_events for select to authenticated using ((select auth.uid()) = user_id);
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
    'feed_url', v_secret.feed_url, 'etag', v_secret.etag, 'last_modified', v_secret.last_modified);
end;
$$;

create function public.finish_external_calendar_sync(p_user_id uuid, p_source_id uuid, p_token uuid,
  p_events jsonb, p_etag text default null, p_last_modified text default null, p_error text default null)
returns integer language plpgsql security invoker set search_path = '' as $$
declare v_now timestamptz := now(); v_count integer;
begin
  perform 1 from public.external_calendar_sources
    where id = p_source_id and user_id = p_user_id and sync_token = p_token for update;
  if not found then raise exception 'calendar_sync_stale' using errcode = 'P0002'; end if;
  if p_error is not null then
    update public.external_calendar_sources set sync_status = 'error', sync_error = p_error, sync_token = null, updated_at = v_now where id = p_source_id;
    return 0;
  end if;
  if public.is_suspended(p_user_id) then raise exception 'calendar_account_suspended' using errcode = '42501'; end if;
  if p_events is not null then
    if jsonb_typeof(p_events) <> 'array' or jsonb_array_length(p_events) > 2000 then raise exception 'invalid_calendar_feed'; end if;
    insert into public.external_academic_events as existing (
      user_id, source_id, external_uid, recurrence_id, raw_title, description, location,
      starts_at, ends_at, due_at, start_date, end_date, due_date, all_day, external_url,
      external_course_key, external_course_label, provider_updated_at, sequence, raw_status, status, metadata, last_seen_at, removed_at)
    select p_user_id, p_source_id, e.external_uid, e.recurrence_id, e.raw_title, e.description, e.location,
      e.starts_at, e.ends_at, e.due_at, e.start_date, e.end_date, e.due_date, e.all_day, e.external_url,
      e.external_course_key, e.external_course_label, e.provider_updated_at, e.sequence, e.raw_status, e.status, e.metadata,
      v_now, case when e.status = 'cancelled' then v_now end
    from jsonb_populate_recordset(null::public.external_academic_events, p_events) e
    on conflict (source_id, external_uid, recurrence_id) do update set
      raw_title = excluded.raw_title, description = excluded.description, location = excluded.location,
      starts_at = excluded.starts_at, ends_at = excluded.ends_at, due_at = excluded.due_at,
      start_date = excluded.start_date, end_date = excluded.end_date, due_date = excluded.due_date,
      all_day = excluded.all_day, external_url = excluded.external_url,
      external_course_key = excluded.external_course_key, external_course_label = excluded.external_course_label,
      provider_updated_at = excluded.provider_updated_at, sequence = excluded.sequence, raw_status = excluded.raw_status,
      status = excluded.status, metadata = excluded.metadata, last_seen_at = v_now,
      removed_at = case when excluded.status = 'cancelled' then coalesce(existing.removed_at, v_now) end,
      updated_at = v_now;
    update public.external_academic_events e set status = 'missing', removed_at = coalesce(removed_at, v_now), updated_at = v_now
    where source_id = p_source_id and status <> 'missing' and not exists (
      select 1 from jsonb_array_elements(p_events) item
      where item->>'external_uid' = e.external_uid and item->>'recurrence_id' = e.recurrence_id);
    update public.external_calendar_secrets set etag = p_etag, last_modified = p_last_modified where source_id = p_source_id;
  else
    -- Conditional GET 304: the last successful snapshot is still current.
    update public.external_academic_events set last_seen_at = v_now where source_id = p_source_id and status <> 'missing';
  end if;
  delete from public.external_academic_events where source_id = p_source_id and status = 'missing' and removed_at < v_now - interval '90 days';
  update public.external_calendar_sources set last_synced_at = v_now, sync_status = 'success', sync_error = null,
    sync_token = null, updated_at = v_now where id = p_source_id;
  select count(*) into v_count from public.external_academic_events where source_id = p_source_id and status <> 'missing';
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
