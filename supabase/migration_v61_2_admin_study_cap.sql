-- v61_2 — Admin, fin de phase 2 : plafond de 8 h par session dans les SOMMES
-- de temps d'étude de l'admin (total, 7 j, 7 j précédents, 30 j).
-- Rien d'autre ne change : activation, actifs, jours distincts, retour S2
-- comptent toujours chaque vraie session ; les sessions > 8 h restent
-- détectées à part (long_sessions_7d, long_seconds_7d en durée brute) ;
-- aucune session stockée, stat perso, XP ou série n'est modifiée.
-- Les chevauchements ne sont pas corrigés (anomalie signalée).
create or replace function public.admin_member_facts(p_now timestamptz, p_only uuid default null)
returns table (
  user_id uuid,
  signed_up_at timestamptz,
  last_sign_in_at timestamptz,
  email_confirmed boolean,
  placeholder_email boolean,
  has_profile boolean,
  is_admin boolean,
  suspended boolean,
  pseudo text,
  first_name text,
  last_name text,
  avatar_url text,
  university text,
  broad_field text,
  study_field text,
  study_year text,
  studies_completed boolean,
  courses_count integer,
  active_courses_count integer,
  real_sessions integer,
  short_sessions integer,
  real_days integer,
  first_real_session_at timestamptz,
  last_real_session_at timestamptz,
  real_seconds_total bigint,
  real_seconds_7d bigint,
  real_seconds_prev_7d bigint,
  real_seconds_30d bigint,
  long_sessions_7d integer,
  long_seconds_7d bigint,
  activation_status text,
  activation_window_ends_at timestamptz,
  returned_week2 boolean,
  return_window_ends_at timestamptz,
  active_7d boolean,
  active_prev_7d boolean,
  dormant boolean
)
language sql
stable
set search_path = public
as $$
  with acc as (
    select u.id, u.created_at, u.last_sign_in_at, u.email, u.email_confirmed_at
    from auth.users u
    where u.created_at <= p_now
      and u.deleted_at is null
      and (p_only is null or u.id = p_only)
  ),
  ses as (
    select
      s.user_id,
      count(*) filter (where s.duration_seconds >= public.admin_real_session_seconds()) as real_sessions,
      count(*) filter (where s.duration_seconds < public.admin_real_session_seconds()) as short_sessions,
      count(distinct (s.started_at at time zone 'Europe/Brussels')::date)
        filter (where s.duration_seconds >= public.admin_real_session_seconds()) as real_days,
      min(s.started_at) filter (where s.duration_seconds >= public.admin_real_session_seconds()) as first_real,
      max(s.started_at) filter (where s.duration_seconds >= public.admin_real_session_seconds()) as last_real,
      coalesce(sum(least(s.duration_seconds, public.admin_long_session_seconds())) filter (
        where s.duration_seconds >= public.admin_real_session_seconds()), 0) as real_total,
      coalesce(sum(least(s.duration_seconds, public.admin_long_session_seconds())) filter (
        where s.duration_seconds >= public.admin_real_session_seconds()
          and s.started_at >= p_now - interval '168 hours'), 0) as real_7d,
      coalesce(sum(least(s.duration_seconds, public.admin_long_session_seconds())) filter (
        where s.duration_seconds >= public.admin_real_session_seconds()
          and s.started_at >= p_now - interval '336 hours'
          and s.started_at < p_now - interval '168 hours'), 0) as real_prev_7d,
      coalesce(sum(least(s.duration_seconds, public.admin_long_session_seconds())) filter (
        where s.duration_seconds >= public.admin_real_session_seconds()
          and s.started_at >= p_now - interval '720 hours'), 0) as real_30d,
      count(*) filter (
        where s.duration_seconds > public.admin_long_session_seconds()
          and s.started_at >= p_now - interval '168 hours') as long_7d,
      coalesce(sum(s.duration_seconds) filter (
        where s.duration_seconds > public.admin_long_session_seconds()
          and s.started_at >= p_now - interval '168 hours'), 0) as long_seconds_7d,
      bool_or(s.duration_seconds >= public.admin_real_session_seconds()
        and s.started_at >= a.created_at
        and s.started_at < a.created_at + interval '168 hours') as in_activation_window,
      bool_or(s.duration_seconds >= public.admin_real_session_seconds()
        and s.started_at >= a.created_at + interval '168 hours') as after_activation_window,
      bool_or(s.duration_seconds >= public.admin_real_session_seconds()
        and s.started_at >= a.created_at + interval '168 hours'
        and s.started_at < a.created_at + interval '336 hours') as in_return_window
    from public.sessions s
    join acc a on a.id = s.user_id
    where s.started_at < p_now
    group by s.user_id
  ),
  crs as (
    select c.user_id,
           count(*) as n,
           count(*) filter (where c.archived_at is null or c.archived_at > p_now) as n_active
    from public.courses c
    join acc a on a.id = c.user_id
    where c.created_at <= p_now
    group by c.user_id
  )
  select
    a.id,
    a.created_at,
    a.last_sign_in_at,
    a.email_confirmed_at is not null,
    coalesce(lower(a.email) like '%@blocus.local', false),
    p.id is not null,
    coalesce(p.is_admin, false),
    coalesce(p.locked, false),
    p.pseudo,
    p.first_name,
    p.last_name,
    p.avatar_url,
    p.university,
    p.broad_field,
    p.study_field,
    p.study_year,
    p.id is not null
      and btrim(coalesce(p.university, '')) <> ''
      and btrim(coalesce(p.broad_field, '')) <> ''
      and btrim(coalesce(p.study_year, '')) <> '',
    coalesce(c.n, 0)::int,
    coalesce(c.n_active, 0)::int,
    coalesce(s.real_sessions, 0)::int,
    coalesce(s.short_sessions, 0)::int,
    coalesce(s.real_days, 0)::int,
    s.first_real,
    s.last_real,
    coalesce(s.real_total, 0)::bigint,
    coalesce(s.real_7d, 0)::bigint,
    coalesce(s.real_prev_7d, 0)::bigint,
    coalesce(s.real_30d, 0)::bigint,
    coalesce(s.long_7d, 0)::int,
    coalesce(s.long_seconds_7d, 0)::bigint,
    case
      when coalesce(s.in_activation_window, false) then 'activated'
      when p_now < a.created_at + interval '168 hours' then 'pending'
      when coalesce(s.after_activation_window, false) then 'late'
      else 'not_activated'
    end,
    a.created_at + interval '168 hours',
    case
      when coalesce(s.in_return_window, false) then true
      when p_now < a.created_at + interval '336 hours' then null
      else false
    end,
    a.created_at + interval '336 hours',
    coalesce(s.real_7d, 0) > 0,
    coalesce(s.real_prev_7d, 0) > 0,
    coalesce(s.real_sessions, 0) > 0 and s.last_real < p_now - interval '720 hours'
  from acc a
  left join public.profiles p on p.id = a.id
  left join ses s on s.user_id = a.id
  left join crs c on c.user_id = a.id;
$$;
revoke all on function public.admin_member_facts(timestamptz, uuid) from public, anon, authenticated, service_role;
