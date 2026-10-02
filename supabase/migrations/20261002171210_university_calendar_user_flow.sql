-- Step 4: validated first import, explicit course decisions and exam conversion.
begin;
alter table public.external_calendar_course_map alter column local_course_id drop not null;
alter table public.external_calendar_course_map add column ignored boolean not null default false,
  add constraint calendar_map_ignored_without_course check (not ignored or local_course_id is null);

alter table public.exams add constraint exams_id_user_calendar_unique unique (id, user_id);
create table public.external_calendar_exam_links (
  source_id uuid not null,
  external_uid text not null check (octet_length(external_uid) between 1 and 255),
  recurrence_id text not null default '' check (octet_length(recurrence_id) <= 80),
  user_id uuid not null references auth.users(id) on delete cascade,
  local_exam_id uuid not null,
  -- Only schedule/title fields, never feed payloads. Kept only for explicit conversions.
  source_snapshot jsonb not null check (octet_length(source_snapshot::text) <= 1024),
  primary key (source_id, external_uid, recurrence_id),
  foreign key (source_id, user_id) references public.external_calendar_sources(id, user_id) on delete cascade,
  foreign key (local_exam_id, user_id) references public.exams(id, user_id) on delete cascade
  -- No event FK: temporary source removal/reappearance must not duplicate a local exam.
);
create index external_calendar_exam_links_exam on public.external_calendar_exam_links(local_exam_id, user_id);
create index external_calendar_exam_links_user on public.external_calendar_exam_links(user_id);
alter table public.external_calendar_exam_links enable row level security;
revoke all on public.external_calendar_exam_links from public, anon, authenticated;
grant select on public.external_calendar_exam_links to authenticated;
grant all on public.external_calendar_exam_links to service_role;
create policy calendar_exam_link_read on public.external_calendar_exam_links for select to authenticated
  using (user_id = (select auth.uid()));
create trigger a00_block_suspended_actor before insert or update or delete on public.external_calendar_exam_links
  for each row execute function public.block_suspended_actor();

-- One transaction: failures leave neither a source nor its secret behind.
create function public.connect_imported_calendar(p_user_id uuid, p_provider text, p_display_name text,
  p_feed_url text, p_events jsonb, p_etag text default null, p_last_modified text default null)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare v_id uuid; v_token uuid := gen_random_uuid();
begin
  if public.is_suspended(p_user_id) then raise exception 'calendar_account_suspended' using errcode = '42501'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user_id::text, 731));
  select s.id into v_id from public.external_calendar_sources s join public.external_calendar_secrets k on k.source_id=s.id
    where s.user_id=p_user_id and k.feed_url=p_feed_url;
  if v_id is not null then return v_id; end if;
  v_id := public.connect_external_calendar(p_user_id, p_provider, p_display_name, p_feed_url);
  update public.external_calendar_sources set sync_token = v_token, last_attempted_at = now(), sync_status = 'syncing' where id = v_id;
  perform public.finish_external_calendar_sync(p_user_id, v_id, v_token, p_events, p_etag, p_last_modified);
  return v_id;
end;
$$;

create function public.confirm_calendar_exam(p_user_id uuid, p_source_id uuid, p_external_uid text,
  p_recurrence_id text, p_name text, p_course_id uuid, p_exam_date date, p_exam_time time default null,
  p_location text default null, p_acknowledge_only boolean default false)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare v_event public.external_academic_events; v_id uuid; v_snapshot jsonb;
begin
  if public.is_suspended(p_user_id) then raise exception 'calendar_account_suspended' using errcode = '42501'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user_id::text, 731));
  perform 1 from public.external_calendar_sources where id=p_source_id and user_id=p_user_id for update;
  if not found then raise exception 'calendar_not_found' using errcode = 'P0002'; end if;
  select * into v_event from public.external_academic_events
    where source_id=p_source_id and external_uid=p_external_uid and recurrence_id=p_recurrence_id for update;
  if not found then raise exception 'calendar_event_not_found' using errcode = 'P0002'; end if;
  v_snapshot := jsonb_build_object('raw_title',v_event.raw_title,'event_date',v_event.event_date,
    'starts_at',v_event.starts_at,'due_at',v_event.due_at,'floating_at',v_event.floating_at,'all_day',v_event.all_day);
  select local_exam_id into v_id from public.external_calendar_exam_links
    where source_id=p_source_id and external_uid=p_external_uid and recurrence_id=p_recurrence_id;
  if v_id is not null then
    if p_acknowledge_only then
      update public.external_calendar_exam_links set source_snapshot=v_snapshot
        where source_id=p_source_id and external_uid=p_external_uid and recurrence_id=p_recurrence_id;
    end if;
    return v_id; -- Retries never edit or duplicate the student's exam.
  end if;
  if p_acknowledge_only then raise exception 'calendar_exam_not_found' using errcode = 'P0002'; end if;
  if p_name is null or length(btrim(p_name)) not between 1 and 160 or p_exam_date is null
    or length(coalesce(p_location,'')) > 160 then raise exception 'invalid_calendar_exam'; end if;
  if p_course_id is not null and not exists (select 1 from public.courses where id=p_course_id and user_id=p_user_id) then
    raise exception 'calendar_course_not_owned' using errcode = '42501';
  end if;
  -- An exact existing exam can be linked explicitly without inserting another.
  select id into v_id from public.exams where user_id=p_user_id and course_id is not distinct from p_course_id
    and exam_date=p_exam_date and exam_time is not distinct from p_exam_time
    and lower(btrim(name))=lower(btrim(p_name)) order by created_at, id limit 1;
  if v_id is null then
    insert into public.exams(user_id,name,course_id,exam_date,exam_time,location)
      values(p_user_id,btrim(p_name),p_course_id,p_exam_date,p_exam_time,nullif(btrim(p_location),'')) returning id into v_id;
  end if;
  insert into public.external_calendar_exam_links(source_id,external_uid,recurrence_id,user_id,local_exam_id,source_snapshot)
    values(p_source_id,p_external_uid,p_recurrence_id,p_user_id,v_id,v_snapshot);
  update public.external_academic_events set user_override='exam'
    where source_id=p_source_id and external_uid=p_external_uid and recurrence_id=p_recurrence_id;
  return v_id;
end;
$$;
revoke all on function public.connect_imported_calendar(uuid,text,text,text,jsonb,text,text),
  public.confirm_calendar_exam(uuid,uuid,text,text,text,uuid,date,time,text,boolean) from public,anon,authenticated;
grant execute on function public.connect_imported_calendar(uuid,text,text,text,jsonb,text,text),
  public.confirm_calendar_exam(uuid,uuid,text,text,text,uuid,date,time,text,boolean) to service_role;
commit;
