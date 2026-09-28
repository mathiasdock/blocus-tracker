-- First-party, consent-gated campaign measurement. No IP, user agent or
-- fingerprint is stored. A visit ID is a random browser-generated UUID,
-- retained for at most 30 days; daily aggregate counts remain anonymous.

create table if not exists public.acquisition_campaigns (
  slug text primary key check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(slug) <= 64),
  name text not null,
  medium text,
  starts_at timestamptz,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.acquisition_visits (
  id uuid primary key,
  campaign_slug text not null references public.acquisition_campaigns(slug),
  visited_at timestamptz not null default now()
);
create index if not exists acquisition_visits_visited_at_idx on public.acquisition_visits (visited_at);

create table if not exists public.acquisition_daily_visits (
  campaign_slug text not null references public.acquisition_campaigns(slug),
  day date not null,
  visits integer not null default 0 check (visits >= 0),
  primary key (campaign_slug, day)
);

create table if not exists public.member_acquisition (
  user_id uuid primary key references auth.users(id) on delete cascade,
  campaign_slug text not null references public.acquisition_campaigns(slug),
  first_visit_at timestamptz not null,
  attributed_at timestamptz not null default now()
);
create index if not exists member_acquisition_campaign_idx on public.member_acquisition (campaign_slug);

alter table public.acquisition_campaigns enable row level security;
alter table public.acquisition_visits enable row level security;
alter table public.acquisition_daily_visits enable row level security;
alter table public.member_acquisition enable row level security;
revoke all on public.acquisition_campaigns, public.acquisition_visits,
  public.acquisition_daily_visits, public.member_acquisition from public, anon, authenticated;
grant select, delete on public.acquisition_visits to service_role;

-- Deliberately callable by anonymous visitors: narrow validation, write only,
-- and no visit/member data in the result. Client-side consent is a prerequisite.
-- Preview crawlers do not execute this RPC; a determined caller can still
-- fabricate visits, so these numbers are directional, not fraud-proof.
create or replace function public.record_acquisition_visit(p_campaign text, p_visit_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_inserted integer;
  v_now timestamptz := now();
begin
  if p_visit_id is null or p_campaign is null or length(p_campaign) > 64
    or p_campaign !~ '^[a-z0-9]+(-[a-z0-9]+)*$'
    or not exists (select 1 from public.acquisition_campaigns c
                   where c.slug = p_campaign and c.active
                     and (c.starts_at is null or c.starts_at <= v_now)) then
    return false;
  end if;

  insert into public.acquisition_visits(id, campaign_slug, visited_at)
  values (p_visit_id, p_campaign, v_now)
  on conflict (id) do nothing;
  get diagnostics v_inserted = row_count;
  if v_inserted = 1 then
    insert into public.acquisition_daily_visits(campaign_slug, day, visits)
    values (p_campaign, (v_now at time zone 'UTC')::date, 1)
    on conflict (campaign_slug, day)
    do update set visits = public.acquisition_daily_visits.visits + 1;
  end if;

  return true;
end;
$$;
revoke all on function public.record_acquisition_visit(text, uuid) from public, anon, authenticated;
grant execute on function public.record_acquisition_visit(text, uuid) to anon, authenticated;

-- The immutable first touch is accepted only for an account CREATED after the
-- recorded visit (existing accounts scanning a poster cannot be reattributed).
-- An unguessable visit UUID is merely a claim ticket, never an auth credential.
create or replace function public.claim_acquisition_first_touch(p_visit_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_created timestamptz;
  v_visit record;
begin
  if v_user is null or p_visit_id is null then return false; end if;
  select u.created_at into v_created from auth.users u
  where u.id = v_user and u.deleted_at is null;
  if v_created is null then return false; end if;
  select v.campaign_slug, v.visited_at into v_visit
  from public.acquisition_visits v where v.id = p_visit_id;
  if not found then return false; end if;
  if v_visit.visited_at > v_created
    or v_visit.visited_at < now() - interval '30 days' then return false; end if;

  insert into public.member_acquisition(user_id, campaign_slug, first_visit_at)
  values (v_user, v_visit.campaign_slug, v_visit.visited_at)
  on conflict (user_id) do nothing;
  return true;
end;
$$;
revoke all on function public.claim_acquisition_first_touch(uuid) from public, anon, authenticated;
grant execute on function public.claim_acquisition_first_touch(uuid) to authenticated;

create or replace function public.revoke_acquisition_attribution()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then return; end if;
  delete from public.member_acquisition a where a.user_id = auth.uid();
end;
$$;
revoke all on function public.revoke_acquisition_attribution() from public, anon, authenticated;
grant execute on function public.revoke_acquisition_attribution() to authenticated;

-- Reuse the exact Admin member facts for real-session, 7-day activation and
-- week-2 return. No parallel duration thresholds or windows are defined here.
create or replace function public.admin_acquisition_campaigns()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := public.admin_analytics_now();
  v_min integer := public.admin_min_cohort_size();
  v_result jsonb;
begin
  perform public.assert_admin();
  with visit_totals as (
    select d.campaign_slug, sum(d.visits)::integer as visits
    from public.acquisition_daily_visits d group by d.campaign_slug
  ), facts as (
    select a.campaign_slug, f.*
    from public.member_acquisition a
    join public.admin_member_facts(v_now) f on f.user_id = a.user_id
    where not f.is_admin and not f.suspended
  ), signup_totals as (
    select f.campaign_slug,
      count(*)::integer as signups,
      count(*) filter (where f.has_profile)::integer as profiles,
      count(*) filter (where f.studies_completed)::integer as studies,
      count(*) filter (where f.courses_count > 0)::integer as with_course,
      count(*) filter (where f.real_sessions > 0)::integer as first_real_session,
      count(*) filter (where f.activation_window_ends_at <= v_now)::integer as activation_eligible,
      count(*) filter (where f.activation_window_ends_at <= v_now and f.activation_status = 'activated')::integer as activated,
      count(*) filter (where f.return_window_ends_at <= v_now)::integer as return_eligible,
      count(*) filter (where f.return_window_ends_at <= v_now and f.returned_week2)::integer as returned_week2
    from facts f group by f.campaign_slug
  )
  select jsonb_build_object(
    'generated_at', v_now,
    'min_rate_base', v_min,
    'campaigns', coalesce(jsonb_agg(jsonb_build_object(
      'slug', c.slug, 'name', c.name, 'medium', c.medium,
      'starts_at', c.starts_at, 'active', c.active,
      'visits', coalesce(v.visits, 0),
      'signups', coalesce(s.signups, 0),
      'profiles', coalesce(s.profiles, 0),
      'studies', coalesce(s.studies, 0),
      'with_course', coalesce(s.with_course, 0),
      'first_real_session', coalesce(s.first_real_session, 0),
      'activation_eligible', coalesce(s.activation_eligible, 0),
      'activated', coalesce(s.activated, 0),
      'return_eligible', coalesce(s.return_eligible, 0),
      'returned_week2', coalesce(s.returned_week2, 0),
      'visit_signup_rate', case when v.visits >= v_min
        then round(s.signups::numeric / v.visits, 4) end,
      'signup_activation_rate', case when s.activation_eligible >= v_min
        then round(s.activated::numeric / s.activation_eligible, 4) end,
      'week2_return_rate', case when s.return_eligible >= v_min
        then round(s.returned_week2::numeric / s.return_eligible, 4) end
    ) order by c.created_at, c.slug), '[]'::jsonb)
  ) into v_result
  from public.acquisition_campaigns c
  left join visit_totals v on v.campaign_slug = c.slug
  left join signup_totals s on s.campaign_slug = c.slug;
  return v_result;
end;
$$;
revoke all on function public.admin_acquisition_campaigns() from public, anon, authenticated;
grant execute on function public.admin_acquisition_campaigns() to authenticated;

create or replace function public.admin_member_acquisition(p_user uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare v_result jsonb;
begin
  perform public.assert_admin();
  select jsonb_build_object('slug', c.slug, 'name', c.name, 'medium', c.medium,
                            'first_visit_at', a.first_visit_at)
  into v_result
  from public.member_acquisition a
  join public.acquisition_campaigns c on c.slug = a.campaign_slug
  where a.user_id = p_user;
  return v_result;
end;
$$;
revoke all on function public.admin_member_acquisition(uuid) from public, anon, authenticated;
grant execute on function public.admin_member_acquisition(uuid) to authenticated;

-- Initial QR destinations; adding later campaigns requires only a row here.
insert into public.acquisition_campaigns(slug, name, medium, starts_at)
values
  ('ucf-poster', 'UCF · Campus poster', 'poster', now()),
  ('ucf-library', 'UCF · Library poster', 'poster', now()),
  ('ucf-business', 'UCF · Business building poster', 'poster', now())
on conflict (slug) do nothing;
