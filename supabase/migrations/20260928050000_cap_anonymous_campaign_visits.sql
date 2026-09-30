-- Bound anonymous campaign writes without collecting IPs or device identifiers.
-- The normal browser keeps one UUID per campaign/day; this is a DB-side safety
-- ceiling for callers that bypass the browser. Existing IDs stay idempotent.
create or replace function public.record_acquisition_visit(p_campaign text, p_visit_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_inserted integer;
  v_visits integer;
  v_now timestamptz := now();
  v_day date := (now() at time zone 'UTC')::date;
  v_daily_cap constant integer := 5000;
begin
  if p_visit_id is null or p_campaign is null or length(p_campaign) > 64
    or p_campaign !~ '^[a-z0-9]+(-[a-z0-9]+)*$'
    or not exists (select 1 from public.acquisition_campaigns c
                   where c.slug = p_campaign and c.active
                     and (c.starts_at is null or c.starts_at <= v_now)) then
    return false;
  end if;

  -- Serialize only this campaign/day. The aggregate is already needed for
  -- reporting, so no extra identifier or per-request tracking is introduced.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('acquisition:' || p_campaign || ':' || v_day::text, 0)
  );

  if exists (select 1 from public.acquisition_visits where id = p_visit_id) then
    return true;
  end if;

  select d.visits into v_visits
  from public.acquisition_daily_visits d
  where d.campaign_slug = p_campaign and d.day = v_day;
  if coalesce(v_visits, 0) >= v_daily_cap then
    return false;
  end if;

  insert into public.acquisition_visits(id, campaign_slug, visited_at)
  values (p_visit_id, p_campaign, v_now)
  on conflict (id) do nothing;
  get diagnostics v_inserted = row_count;
  if v_inserted = 1 then
    insert into public.acquisition_daily_visits(campaign_slug, day, visits)
    values (p_campaign, v_day, 1)
    on conflict (campaign_slug, day)
    do update set visits = public.acquisition_daily_visits.visits + 1;
  end if;

  return true;
end;
$$;
revoke all on function public.record_acquisition_visit(text, uuid) from public, anon, authenticated;
grant execute on function public.record_acquisition_visit(text, uuid) to anon, authenticated;
