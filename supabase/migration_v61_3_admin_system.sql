-- v61_3 — Lectures de la page Système de l'admin (refonte, phase 3).
--
-- Deux lectures, réservées aux admins (assert_admin), sans aucune écriture :
--   admin_system()          → tâches automatiques, échecs d'activation des
--                             notifications, fonctions lentes, anomalies de
--                             données (sessions > 8 h, chevauchements…)
--   admin_audit_page(...)   → le journal admin, paginé côté serveur, avec le
--                             pseudo de l'acteur et de la cible (jamais d'email)
--
-- Fonctions lentes : pg_stat_statements, cumulé depuis sa dernière remise à
-- zéro (date renvoyée). Les appels en ERREUR (délai dépassé compris)
-- n'apparaissent pas dans ces statistiques : seuls les appels terminés y
-- sont. Un maximum proche de 8 s signale une fonction au bord du délai.
-- Anomalies : mêmes exclusions que les chiffres (admins exclus).

create or replace function public.admin_system()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
declare
  v_now timestamptz := public.admin_analytics_now();
  v_result jsonb;
  v_functions jsonb;
  v_since timestamptz;
begin
  perform public.assert_admin();

  begin
    select stats_reset into v_since from extensions.pg_stat_statements_info;
    select coalesce(jsonb_agg(x order by (x->>'mean_ms')::numeric desc nulls last), '[]'::jsonb) into v_functions
    from (
      select jsonb_build_object(
        'name', s.fn,
        'calls', s.calls,
        'mean_ms', s.mean_ms,
        'max_ms', s.max_ms,
        'flag', case when s.max_ms >= 7000 then 'near_timeout'
                     when s.mean_ms >= 500 then 'slow' end
      ) as x
      from (
        select substring(q.query from '"public"\."([a-z0-9_]+)"\(') as fn,
               sum(q.calls)::bigint as calls,
               round((sum(q.total_exec_time) / nullif(sum(q.calls), 0))::numeric, 1) as mean_ms,
               round(max(q.max_exec_time)::numeric, 1) as max_ms
        from extensions.pg_stat_statements q
        where q.query ~ '"public"\."[a-z0-9_]+"\('
        group by 1
      ) s
      where exists (
        select 1 from pg_proc p
        where p.pronamespace = 'public'::regnamespace and p.proname = s.fn and p.prokind = 'f'
      )
      order by s.mean_ms desc nulls last
      limit 15
    ) t;
  exception when others then
    v_functions := null;
  end;

  with members as (
    select u.id, u.created_at, u.email
    from auth.users u
    left join public.profiles p on p.id = u.id
    where not coalesce(p.is_admin, false)
  ),
  real_s as (
    select s.* from public.sessions s
    join members m on m.id = s.user_id
    where s.duration_seconds >= public.admin_real_session_seconds() and s.started_at < v_now
  ),
  overlap_pairs as (
    select a.user_id
    from real_s a
    join real_s b on b.user_id = a.user_id and b.id > a.id
      and a.started_at < b.ended_at and b.started_at < a.ended_at
  )
  select jsonb_build_object(
    'generated_at', v_now,
    'jobs', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'job', j.job,
        'overdue', coalesce((select max(r.started_at) from public.system_job_runs r
                             where r.job = j.job and r.started_at <= v_now) < v_now - interval '26 hours', false),
        'runs', (
          select coalesce(jsonb_agg(jsonb_build_object(
            'started_at', r.started_at,
            'finished_at', r.finished_at,
            'status', r.status,
            'details', r.details
          ) order by r.started_at desc), '[]'::jsonb)
          from (select * from public.system_job_runs r
                where r.job = j.job and r.started_at <= v_now
                order by r.started_at desc limit 7) r
        )
      ) order by j.job), '[]'::jsonb)
      from (values ('purge_posts'), ('push_daily')) as j(job)
    ),
    'push_failures', jsonb_build_object(
      'failures_7d', (select count(*) from public.push_diagnostics d
                      where d.created_at >= v_now - interval '168 hours' and d.created_at < v_now),
      'members_7d', (select count(distinct d.user_id) from public.push_diagnostics d
                     where d.created_at >= v_now - interval '168 hours' and d.created_at < v_now),
      'failures_30d', (select count(*) from public.push_diagnostics d
                       where d.created_at >= v_now - interval '720 hours' and d.created_at < v_now),
      'last_at', (select max(d.created_at) from public.push_diagnostics d where d.created_at < v_now),
      'by_reason', (select coalesce(jsonb_agg(jsonb_build_object('reason', x.reason, 'count', x.n) order by x.n desc), '[]'::jsonb)
                    from (select d.reason, count(*) as n from public.push_diagnostics d
                          where d.created_at >= v_now - interval '720 hours' and d.created_at < v_now
                          group by d.reason) x)
    ),
    'functions', jsonb_build_object('since', v_since, 'rows', v_functions),
    'anomalies', jsonb_build_object(
      'long_sessions', (select count(*) from real_s where duration_seconds > public.admin_long_session_seconds()),
      'long_sessions_members', (select count(distinct user_id) from real_s where duration_seconds > public.admin_long_session_seconds()),
      'long_sessions_7d', (select count(*) from real_s where duration_seconds > public.admin_long_session_seconds()
                             and started_at >= v_now - interval '168 hours'),
      'long_sessions_excess_seconds', (select coalesce(sum(duration_seconds - public.admin_long_session_seconds()), 0)
                                         from real_s where duration_seconds > public.admin_long_session_seconds()),
      'over_12h_sessions', (select count(*) from real_s where duration_seconds > 43200),
      'short_sessions', (select count(*) from public.sessions s join members m on m.id = s.user_id
                         where s.duration_seconds < public.admin_real_session_seconds() and s.started_at < v_now),
      'short_sessions_seconds', (select coalesce(sum(s.duration_seconds), 0) from public.sessions s join members m on m.id = s.user_id
                                 where s.duration_seconds < public.admin_real_session_seconds() and s.started_at < v_now),
      'overlapping_pairs', (select count(*) from overlap_pairs),
      'overlapping_members', (select count(distinct user_id) from overlap_pairs),
      'sessions_before_signup', (select count(*) from real_s r join members m on m.id = r.user_id
                                 where r.started_at < m.created_at),
      'accounts_without_profile', (select count(*) from members m
                                   where not exists (select 1 from public.profiles p where p.id = m.id)),
      'accounts_without_profile_with_data', (select count(*) from members m
                                   where not exists (select 1 from public.profiles p where p.id = m.id)
                                     and (exists (select 1 from public.sessions s where s.user_id = m.id)
                                       or exists (select 1 from public.courses c where c.user_id = m.id))),
      'placeholder_emails', (select count(*) from members m where lower(m.email) like '%@blocus.local'),
      'deletions_without_week', (select count(*) from public.deleted_accounts d
                                 where d.signup_week is null and coalesce(d.deleted_at, v_now) <= v_now)
    )
  ) into v_result;

  return v_result;
end;
$$;

-- Journal admin : une page à la fois (le plus récent d'abord), filtrable par
-- action. Pseudos de l'acteur et de la cible, jamais d'email.
create or replace function public.admin_audit_page(
  p_limit integer default 50,
  p_offset integer default 0,
  p_action text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_result jsonb;
begin
  perform public.assert_admin();
  if p_limit is null or p_limit < 1 or p_limit > 200 then
    raise exception 'Limit must be between 1 and 200' using errcode = '22023';
  end if;
  if p_offset is null or p_offset < 0 then
    raise exception 'Offset must be zero or more' using errcode = '22023';
  end if;

  select jsonb_build_object(
    'total', (select count(*) from public.admin_audit_log l where p_action is null or l.action = p_action),
    'actions', (select coalesce(jsonb_agg(a order by a), '[]'::jsonb)
                from (select distinct l.action as a from public.admin_audit_log l) x),
    'rows', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', l.id,
        'at', l.created_at,
        'action', l.action,
        'actor_kind', l.actor_kind,
        'actor_pseudo', ap.pseudo,
        'target_user_id', l.target_user_id,
        'target_pseudo', tp.pseudo,
        'target_type', l.target_type,
        'target_id', l.target_id,
        'reason', l.reason,
        'details', l.details
      ) order by l.created_at desc, l.id desc), '[]'::jsonb)
      from (
        select * from public.admin_audit_log l
        where p_action is null or l.action = p_action
        order by l.created_at desc, l.id desc
        limit p_limit offset p_offset
      ) l
      left join public.profiles ap on ap.id = l.actor_id
      left join public.profiles tp on tp.id = l.target_user_id
    )
  ) into v_result;
  return v_result;
end;
$$;

revoke all on function public.admin_system() from public, anon;
revoke all on function public.admin_audit_page(integer, integer, text) from public, anon;
grant execute on function public.admin_system() to authenticated;
grant execute on function public.admin_audit_page(integer, integer, text) to authenticated;
