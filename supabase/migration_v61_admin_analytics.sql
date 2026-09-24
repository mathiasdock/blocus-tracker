-- v61 — Des chiffres justes : la couche de lecture de l'admin (refonte, phase 2).
--
-- Une seule couche de calcul, en base, pour la future admin. Quatre lectures :
--   admin_today()          → la page « Aujourd'hui »
--   admin_members(...)     → la liste des membres (recherche, segments, tri,
--                            pagination côté serveur)
--   admin_member_detail()  → la fiche d'un membre
--   admin_activation()     → l'entonnoir, les cohortes et l'usage des fonctions
-- Toutes reposent sur les MÊMES faits par compte (admin_member_facts) et les
-- MÊMES cohortes (admin_signup_cohorts) : un chiffre ne peut pas être calculé
-- de deux façons, et le navigateur ne recalcule plus rien.
--
-- DÉFINITIONS (validées par Mathias le 2026-09-23)
--   · Vraie session : 10 minutes ou plus (admin_real_session_seconds, v58).
--     Pour l'admin uniquement : sessions, XP, séries et stats des membres ne
--     changent pas.
--   · Activé : une vraie session commencée dans les 168 heures qui suivent
--     auth.users.created_at (horodatages exacts, pas de jours calendaires).
--   · Revenu en semaine 2 : une vraie session commencée entre 168 h (incluse)
--     et 336 h (exclue) après l'inscription.
--   · Actif 7 jours : une vraie session commencée dans les 168 dernières heures.
--   · Jours et semaines de l'admin : Europe/Brussels, semaine du lundi 00:00.
--
-- EXCLUSIONS, partout pareilles
--   · Les comptes admin ne comptent dans aucun chiffre, aucune cohorte, et
--     n'apparaissent pas dans la liste des membres.
--   · Les comptes suspendus ne comptent dans aucun chiffre ni aucune cohorte ;
--     la liste des membres les montre (segment « suspendus ») pour pouvoir les
--     réactiver. Un compte réactivé revient partout.
--   · Un compte supprimé compte dans sa cohorte d'inscription grâce au journal
--     anonyme (activation, retour en semaine 2), sauf s'il était admin ou
--     suspendu au moment de la suppression. Les 31 suppressions antérieures à
--     v58 n'ont pas de semaine d'inscription : elles sont comptées à part.
--
-- COHORTES HONNÊTES
--   · Un indicateur n'est donné pour une cohorte que lorsque TOUS ses comptes
--     ont eu leur fenêtre complète ; sinon il vaut null.
--   · Un taux n'est donné qu'à partir de 5 personnes ; en dessous, seuls
--     l'effectif et le nombre brut sont renvoyés.
--
-- Aucun email n'est jamais renvoyé : seulement « adresse provisoire »
-- (@blocus.local) et « email confirmé ».

-- ── 0. Index justifié par les requêtes ci-dessous ──────────────────────────
-- Fiche membre : sessions d'une personne (faits, 10 dernières sessions,
-- longues sessions). La table n'avait que sa clé primaire : chaque lecture
-- « sessions d'un membre », celles de l'app comprises, parcourait la table
-- entière. Les autres lectures agrègent TOUTES les sessions (un parcours
-- complet reste le bon plan) : aucun autre index n'est ajouté.
create index if not exists sessions_user_started_idx
  on public.sessions (user_id, started_at desc);

-- ── 1. Journal anonyme des suppressions : semaine 2 et exclusions ──────────
alter table public.deleted_accounts
  add column if not exists returned_week2 boolean,
  add column if not exists was_admin boolean not null default false,
  add column if not exists was_suspended boolean not null default false;

-- Nouvelles colonnes de retour : la fonction doit être recréée.
drop function if exists public.deletion_snapshot(uuid);
create function public.deletion_snapshot(p_user uuid)
returns table (
  age_months integer,
  signup_week date,
  was_activated boolean,
  returned_week2 boolean,
  was_admin boolean,
  was_suspended boolean
)
language sql
stable
security definer
set search_path = public, auth
as $$
  select
    greatest(0, (extract(epoch from (now() - u.created_at)) / 2629800)::int),
    (date_trunc('week', u.created_at at time zone 'Europe/Brussels'))::date,
    exists (
      select 1 from public.sessions s
      where s.user_id = u.id
        and s.duration_seconds >= public.admin_real_session_seconds()
        and s.started_at >= u.created_at
        and s.started_at < u.created_at + interval '168 hours'
    ),
    -- Un compte supprimé avant son 7e jour ne peut plus revenir : false.
    exists (
      select 1 from public.sessions s
      where s.user_id = u.id
        and s.duration_seconds >= public.admin_real_session_seconds()
        and s.started_at >= u.created_at + interval '168 hours'
        and s.started_at < u.created_at + interval '336 hours'
    ),
    coalesce(p.is_admin, false),
    coalesce(p.locked, false)
  from auth.users u
  left join public.profiles p on p.id = u.id
  where u.id = p_user;
$$;

revoke all on function public.deletion_snapshot(uuid) from public, anon, authenticated, service_role;

-- Suppression par la personne elle-même : inchangée, sauf l'instantané.
create or replace function public.self_delete_user()
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_catalog'
as $$
declare
  v_uid uuid := auth.uid();
  v_snap record;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;
  select * into v_snap from public.deletion_snapshot(v_uid);
  insert into public.deleted_accounts
    (deleted_kind, account_age_months, signup_week, was_activated, returned_week2, was_admin, was_suspended)
  values
    ('self', v_snap.age_months, v_snap.signup_week, v_snap.was_activated,
     v_snap.returned_week2, v_snap.was_admin, v_snap.was_suspended);
  -- Le droit à l'effacement prime sur la suspension (voir block_suspended_actor).
  perform set_config('blocus.self_delete', 'on', true);
  delete from auth.users where id = v_uid;
end;
$$;

-- Suppression par un admin : inchangée, sauf l'instantané.
create or replace function public.admin_delete_account(
  p_actor uuid,
  p_target uuid,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_snap record;
  v_is_admin boolean;
begin
  perform public.assert_admin_actor(p_actor);
  if char_length(btrim(coalesce(p_reason, ''))) < 3 then
    raise exception 'A reason is required' using errcode = '22023';
  end if;
  if p_target is null or p_target = p_actor then
    raise exception 'You cannot delete your own account here' using errcode = '42501';
  end if;
  if not exists (select 1 from auth.users where id = p_target) then
    raise exception 'Unknown account' using errcode = '22023';
  end if;
  select coalesce(is_admin, false) into v_is_admin from public.profiles where id = p_target;
  if coalesce(v_is_admin, false) then
    raise exception 'Admins cannot be deleted here' using errcode = '42501';
  end if;

  select * into v_snap from public.deletion_snapshot(p_target);
  insert into public.deleted_accounts
    (deleted_kind, account_age_months, signup_week, was_activated, returned_week2, was_admin, was_suspended)
  values
    ('admin', v_snap.age_months, v_snap.signup_week, v_snap.was_activated,
     v_snap.returned_week2, v_snap.was_admin, v_snap.was_suspended);

  perform public.log_admin_action(
    p_actor, 'account_deleted', p_target, 'user', p_target::text, p_reason,
    jsonb_build_object('age_months', v_snap.age_months)
  );
  delete from auth.users where id = p_target;
  return jsonb_build_object('ok', true);
end;
$$;

-- ── 2. Outils internes : jamais exécutables par l'app ──────────────────────
-- Instant de calcul. Toujours now() en production ; les tests posent
-- blocus.analytics_now pour rejouer un jeu de données daté, isolé des vraies
-- données (PostgREST ne permet pas à un client de poser ce réglage).
create or replace function public.admin_analytics_now()
returns timestamptz
language sql
stable
set search_path = public
as $$
  select coalesce(nullif(current_setting('blocus.analytics_now', true), '')::timestamptz, now());
$$;

-- En dessous de 5 personnes, un pourcentage trompe : on donne l'effectif.
create or replace function public.admin_min_cohort_size()
returns integer
language sql
immutable
set search_path = public
as $$
  select 5;
$$;

-- Au-delà de 8 heures d'affilée, une session est probablement un chrono
-- oublié : elle compte (aucune règle ne l'exclut), mais elle est signalée.
create or replace function public.admin_long_session_seconds()
returns integer
language sql
immutable
set search_path = public
as $$
  select 28800;
$$;

-- Recherche insensible à la casse et aux accents (pas d'extension unaccent).
create or replace function public.admin_fold(p_text text)
returns text
language sql
immutable
parallel safe
set search_path = public
as $$
  select translate(
    replace(replace(replace(lower(coalesce(p_text, '')), 'œ', 'oe'), 'æ', 'ae'), 'ß', 'ss'),
    'àáâãäåāăąçćčďèéêëēėęěìíîïīįłñńňòóôõöøōőùúûüūůűýÿžźżšśşťř',
    'aaaaaaaaacccdeeeeeeeeiiiiiilnnnoooooooouuuuuuuyyzzzssstr'
  );
$$;

-- Lundi (heure de Bruxelles) de la semaine qui contient l'instant.
create or replace function public.admin_week_start(p_ts timestamptz)
returns date
language sql
stable
set search_path = public
as $$
  select date_trunc('week', p_ts at time zone 'Europe/Brussels')::date;
$$;

-- Les faits d'un compte, au moment p_now. Seule source de tous les chiffres.
-- p_only restreint le calcul à un compte (fiche membre).
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
      coalesce(sum(s.duration_seconds) filter (
        where s.duration_seconds >= public.admin_real_session_seconds()), 0) as real_total,
      coalesce(sum(s.duration_seconds) filter (
        where s.duration_seconds >= public.admin_real_session_seconds()
          and s.started_at >= p_now - interval '168 hours'), 0) as real_7d,
      coalesce(sum(s.duration_seconds) filter (
        where s.duration_seconds >= public.admin_real_session_seconds()
          and s.started_at >= p_now - interval '336 hours'
          and s.started_at < p_now - interval '168 hours'), 0) as real_prev_7d,
      coalesce(sum(s.duration_seconds) filter (
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

-- Cohortes par semaine d'inscription (lundi, Bruxelles), de la première
-- semaine connue à la semaine en cours, semaines vides comprises.
create or replace function public.admin_signup_cohorts(p_now timestamptz)
returns table (
  week_start date,
  week_ends_at timestamptz,
  accounts integer,
  deleted integer,
  cohort_size integer,
  activation_complete_at timestamptz,
  activation_complete boolean,
  activated integer,
  activation_rate numeric,
  return_complete_at timestamptz,
  return_complete boolean,
  returned integer,
  return_unknown integer,
  return_rate numeric
)
language sql
stable
set search_path = public
as $$
  with members as (
    select public.admin_week_start(f.signed_up_at) as wk,
           count(*)::int as n,
           count(*) filter (where f.activation_status = 'activated')::int as act,
           count(*) filter (where f.returned_week2)::int as ret
    from public.admin_member_facts(p_now) f
    where not f.is_admin and not f.suspended
    group by 1
  ),
  gone as (
    select d.signup_week as wk,
           count(*)::int as n,
           count(*) filter (where d.was_activated)::int as act,
           count(*) filter (where d.was_activated is null)::int as act_unknown,
           count(*) filter (where d.returned_week2)::int as ret,
           count(*) filter (where d.returned_week2 is null)::int as ret_unknown
    from public.deleted_accounts d
    where d.signup_week is not null
      and not d.was_admin
      and not d.was_suspended
      and coalesce(d.deleted_at, p_now) <= p_now
    group by 1
  ),
  weeks as (
    select w::date as wk
    from generate_series(
      (select least((select min(wk) from members), (select min(wk) from gone)))::timestamp,
      public.admin_week_start(p_now)::timestamp,
      interval '7 days'
    ) as w
  ),
  rows as (
    select
      w.wk,
      ((w.wk + 7)::timestamp at time zone 'Europe/Brussels') as ends_at,
      coalesce(m.n, 0) as n_members,
      coalesce(g.n, 0) as n_gone,
      coalesce(m.n, 0) + coalesce(g.n, 0) as size,
      coalesce(m.act, 0) + coalesce(g.act, 0) as act,
      coalesce(g.act_unknown, 0) as act_unknown,
      coalesce(m.ret, 0) + coalesce(g.ret, 0) as ret,
      coalesce(g.ret_unknown, 0) as ret_unknown
    from weeks w
    left join members m on m.wk = w.wk
    left join gone g on g.wk = w.wk
  )
  select
    r.wk,
    r.ends_at,
    r.n_members,
    r.n_gone,
    r.size,
    r.ends_at + interval '168 hours',
    p_now >= r.ends_at + interval '168 hours',
    case when p_now >= r.ends_at + interval '168 hours' and r.act_unknown = 0 then r.act end,
    case when p_now >= r.ends_at + interval '168 hours' and r.act_unknown = 0
              and r.size >= public.admin_min_cohort_size()
         then round(r.act::numeric / r.size, 4) end,
    r.ends_at + interval '336 hours',
    p_now >= r.ends_at + interval '336 hours',
    case when p_now >= r.ends_at + interval '336 hours' and r.ret_unknown = 0 then r.ret end,
    r.ret_unknown,
    case when p_now >= r.ends_at + interval '336 hours' and r.ret_unknown = 0
              and r.size >= public.admin_min_cohort_size()
         then round(r.ret::numeric / r.size, 4) end
  from rows r
  order by r.wk;
$$;

revoke all on function public.admin_analytics_now() from public, anon, authenticated, service_role;
revoke all on function public.admin_min_cohort_size() from public, anon, authenticated, service_role;
revoke all on function public.admin_long_session_seconds() from public, anon, authenticated, service_role;
revoke all on function public.admin_fold(text) from public, anon, authenticated, service_role;
revoke all on function public.admin_week_start(timestamptz) from public, anon, authenticated, service_role;
revoke all on function public.admin_member_facts(timestamptz, uuid) from public, anon, authenticated, service_role;
revoke all on function public.admin_signup_cohorts(timestamptz) from public, anon, authenticated, service_role;

-- ── 3. Aujourd'hui ─────────────────────────────────────────────────────────
-- Fenêtres glissantes exactes : [maintenant − 168 h, maintenant) et la
-- précédente [− 336 h, − 168 h). Dernière cohorte complète pour l'activation.
create or replace function public.admin_today()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_now timestamptz := public.admin_analytics_now();
  v_w7 timestamptz := v_now - interval '168 hours';
  v_w14 timestamptz := v_now - interval '336 hours';
  v_result jsonb;
begin
  perform public.assert_admin();

  with f as (
    select * from public.admin_member_facts(v_now) x
    where not x.is_admin and not x.suspended
  ),
  cohort as (
    select * from public.admin_signup_cohorts(v_now) c
    where c.activation_complete
    order by c.week_start desc
    limit 1
  ),
  jobs as (
    select j.job, r.started_at, r.finished_at, r.status
    from (values ('purge_posts'), ('push_daily')) as j(job)
    left join lateral (
      select x.started_at, x.finished_at, x.status
      from public.system_job_runs x
      where x.job = j.job and x.started_at <= v_now
      order by x.started_at desc
      limit 1
    ) r on true
  )
  select jsonb_build_object(
    'generated_at', v_now,
    'timezone', 'Europe/Brussels',
    'real_session_seconds', public.admin_real_session_seconds(),
    'window', jsonb_build_object('previous_start', v_w14, 'current_start', v_w7, 'end', v_now),
    'members', jsonb_build_object(
      'accounts', (select count(*) from f),
      'suspended', (select count(*) from public.profiles p
                    join auth.users u on u.id = p.id
                    where p.locked and not p.is_admin and u.created_at <= v_now)
    ),
    'active_members', jsonb_build_object(
      'current', (select count(*) from f where f.active_7d),
      'previous', (select count(*) from f where f.active_prev_7d)
    ),
    'new_accounts', jsonb_build_object(
      'current', (select count(*) from f where f.signed_up_at >= v_w7),
      'previous', (select count(*) from f where f.signed_up_at >= v_w14 and f.signed_up_at < v_w7)
    ),
    'study_seconds', jsonb_build_object(
      'current', (select coalesce(sum(f.real_seconds_7d), 0) from f),
      'previous', (select coalesce(sum(f.real_seconds_prev_7d), 0) from f),
      'long_sessions_current', (select coalesce(sum(f.long_sessions_7d), 0) from f),
      'long_session_seconds_current', (select coalesce(sum(f.long_seconds_7d), 0) from f)
    ),
    'latest_complete_cohort', (
      select jsonb_build_object(
        'week_start', c.week_start,
        'cohort_size', c.cohort_size,
        'activated', c.activated,
        'activation_rate', c.activation_rate,
        'small', c.cohort_size < public.admin_min_cohort_size()
      ) from cohort c
    ),
    'queue', jsonb_build_object(
      'open_reports', (select count(distinct r.message_id) from public.course_message_reports r
                       where r.resolved_at is null and r.created_at <= v_now),
      'new_feedback', (select count(*) from public.app_feedback fb
                       where fb.status = 'new' and fb.created_at <= v_now),
      'push_failures_7d', (select count(*) from public.push_diagnostics d
                           where d.created_at >= v_w7 and d.created_at < v_now),
      'push_failure_members_7d', (select count(distinct d.user_id) from public.push_diagnostics d
                                  where d.created_at >= v_w7 and d.created_at < v_now)
    ),
    'jobs', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'job', j.job,
        'last_started_at', j.started_at,
        'last_finished_at', j.finished_at,
        'last_status', j.status,
        -- Tâches quotidiennes : en retard au-delà de 26 h sans passage.
        'overdue', coalesce(j.started_at < v_now - interval '26 hours', false)
      ) order by j.job), '[]'::jsonb)
      from jobs j
    )
  ) into v_result;

  return v_result;
end;
$$;

-- ── 4. Liste des membres ───────────────────────────────────────────────────
-- Segments (filtres) : all, active, no_real_session, dormant,
-- incomplete_signup, placeholder_email, suspended. « all » comprend les
-- suspendus ; les autres segments, sauf « suspended », les excluent. Les
-- admins ne figurent jamais dans la liste.
-- Tri : signup_desc (défaut), signup_asc, last_session_desc, time_30d_desc,
-- time_total_desc, pseudo_asc. p_limit de 1 à 500, ou null pour tout (export).
create or replace function public.admin_members(
  p_search text default null,
  p_segment text default 'all',
  p_sort text default 'signup_desc',
  p_limit integer default 50,
  p_offset integer default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_now timestamptz := public.admin_analytics_now();
  v_needle text := nullif(public.admin_fold(regexp_replace(btrim(coalesce(p_search, '')), '^@+', '')), '');
  v_pattern text;
  v_result jsonb;
begin
  perform public.assert_admin();

  if p_segment is null or p_segment not in (
    'all', 'active', 'no_real_session', 'dormant', 'incomplete_signup', 'placeholder_email', 'suspended'
  ) then
    raise exception 'Unknown segment' using errcode = '22023';
  end if;
  if p_sort is null or p_sort not in (
    'signup_desc', 'signup_asc', 'last_session_desc', 'time_30d_desc', 'time_total_desc', 'pseudo_asc'
  ) then
    raise exception 'Unknown sort' using errcode = '22023';
  end if;
  if p_limit is not null and (p_limit < 1 or p_limit > 500) then
    raise exception 'Limit must be between 1 and 500' using errcode = '22023';
  end if;
  if p_offset is null or p_offset < 0 then
    raise exception 'Offset must be zero or more' using errcode = '22023';
  end if;
  if v_needle is not null then
    if char_length(v_needle) > 100 then
      raise exception 'Search is too long' using errcode = '22023';
    end if;
    v_pattern := '%' || replace(replace(replace(v_needle, '\', '\\'), '%', '\%'), '_', '\_') || '%';
  end if;

  with f as (
    select * from public.admin_member_facts(v_now) x
    where not x.is_admin
  ),
  searched as (
    select f.*
    from f
    where v_pattern is null
       or public.admin_fold(f.pseudo) like v_pattern
       or public.admin_fold(concat_ws(' ', f.first_name, f.last_name)) like v_pattern
       or public.admin_fold(concat_ws(' ', f.last_name, f.first_name)) like v_pattern
       or public.admin_fold(f.university) like v_pattern
       or f.user_id::text = v_needle
  ),
  flagged as (
    select s.*,
      (not s.suspended and s.active_7d) as seg_active,
      (not s.suspended and s.real_sessions = 0) as seg_no_real_session,
      (not s.suspended and s.dormant) as seg_dormant,
      (not s.suspended and (not s.has_profile or not s.studies_completed or s.courses_count = 0)) as seg_incomplete_signup,
      (not s.suspended and s.placeholder_email) as seg_placeholder_email
    from searched s
  ),
  picked as (
    select fl.*
    from flagged fl
    where case p_segment
      when 'all' then true
      when 'active' then fl.seg_active
      when 'no_real_session' then fl.seg_no_real_session
      when 'dormant' then fl.seg_dormant
      when 'incomplete_signup' then fl.seg_incomplete_signup
      when 'placeholder_email' then fl.seg_placeholder_email
      else fl.suspended
    end
  ),
  ordered as (
    select pk.*, row_number() over (
      order by
        case when p_sort = 'signup_desc' then pk.signed_up_at end desc,
        case when p_sort = 'signup_asc' then pk.signed_up_at end asc,
        case when p_sort = 'last_session_desc' then pk.last_real_session_at end desc nulls last,
        case when p_sort = 'time_30d_desc' then pk.real_seconds_30d end desc,
        case when p_sort = 'time_total_desc' then pk.real_seconds_total end desc,
        case when p_sort = 'pseudo_asc' then public.admin_fold(pk.pseudo) end asc nulls last,
        pk.signed_up_at desc,
        pk.user_id
    ) as rn
    from picked pk
  ),
  page as (
    select * from ordered o
    where o.rn > p_offset
      and (p_limit is null or o.rn <= p_offset + p_limit)
  )
  select jsonb_build_object(
    'generated_at', v_now,
    'segment', p_segment,
    'sort', p_sort,
    'search', v_needle,
    'limit', p_limit,
    'offset', p_offset,
    'total', (select count(*) from picked),
    'counts', (
      select jsonb_build_object(
        'all', count(*),
        'active', count(*) filter (where fl.seg_active),
        'no_real_session', count(*) filter (where fl.seg_no_real_session),
        'dormant', count(*) filter (where fl.seg_dormant),
        'incomplete_signup', count(*) filter (where fl.seg_incomplete_signup),
        'placeholder_email', count(*) filter (where fl.seg_placeholder_email),
        'suspended', count(*) filter (where fl.suspended)
      ) from flagged fl
    ),
    'rows', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'user_id', pg.user_id,
        'pseudo', pg.pseudo,
        'first_name', pg.first_name,
        'last_name', pg.last_name,
        'avatar_url', pg.avatar_url,
        'university', pg.university,
        'study_year', pg.study_year,
        'signed_up_at', pg.signed_up_at,
        'has_profile', pg.has_profile,
        'suspended', pg.suspended,
        'placeholder_email', pg.placeholder_email,
        'email_confirmed', pg.email_confirmed,
        'studies_completed', pg.studies_completed,
        'courses_count', pg.courses_count,
        'real_sessions', pg.real_sessions,
        'real_days', pg.real_days,
        'first_real_session_at', pg.first_real_session_at,
        'last_real_session_at', pg.last_real_session_at,
        'real_seconds_7d', pg.real_seconds_7d,
        'real_seconds_30d', pg.real_seconds_30d,
        'real_seconds_total', pg.real_seconds_total,
        'activation_status', pg.activation_status,
        'returned_week2', pg.returned_week2,
        'active_7d', pg.active_7d,
        'dormant', pg.dormant
      ) order by pg.rn), '[]'::jsonb)
      from page pg
    )
  ) into v_result;

  return v_result;
end;
$$;

-- ── 5. Fiche membre ────────────────────────────────────────────────────────
-- Pour aider un membre : inscription, activation, sessions, cours, liens
-- sociaux, niveau, 10 dernières sessions (sans nom de cours) et les actions
-- admin qui le concernent. Jamais d'email.
create or replace function public.admin_member_detail(p_user uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_now timestamptz := public.admin_analytics_now();
  v_f record;
  v_p record;
  v_level jsonb;
  v_result jsonb;
begin
  perform public.assert_admin();
  if p_user is null then
    raise exception 'Unknown account' using errcode = '22023';
  end if;

  select * into v_f from public.admin_member_facts(v_now, p_user) x where x.user_id = p_user;
  if not found then
    raise exception 'Unknown account' using errcode = '22023';
  end if;

  select p.bio, p.lang, p.timezone, p.referral_code, p.planning_public, p.study_field
  into v_p
  from public.profiles p where p.id = p_user;

  -- Le niveau vient du calcul de l'app ; s'il échoue, la fiche s'affiche quand même.
  begin
    select jsonb_build_object('level', g.level, 'total_xp', g.total_xp, 'streak', g.streak)
    into v_level
    from public.get_gamification_levels(array[p_user]) g
    limit 1;
  exception when others then
    v_level := null;
  end;

  select jsonb_build_object(
    'generated_at', v_now,
    'user_id', v_f.user_id,
    'account', jsonb_build_object(
      'signed_up_at', v_f.signed_up_at,
      'last_sign_in_at', v_f.last_sign_in_at,
      'email_confirmed', v_f.email_confirmed,
      'placeholder_email', v_f.placeholder_email,
      'has_profile', v_f.has_profile,
      'is_admin', v_f.is_admin,
      'suspended', v_f.suspended
    ),
    'profile', jsonb_build_object(
      'pseudo', v_f.pseudo,
      'first_name', v_f.first_name,
      'last_name', v_f.last_name,
      'avatar_url', v_f.avatar_url,
      'university', v_f.university,
      'broad_field', v_f.broad_field,
      'study_field', v_f.study_field,
      'study_year', v_f.study_year,
      'bio', v_p.bio,
      'lang', v_p.lang,
      'timezone', v_p.timezone,
      'referral_code', v_p.referral_code,
      'studies_completed', v_f.studies_completed
    ),
    'activation', jsonb_build_object(
      'status', v_f.activation_status,
      'window_ends_at', v_f.activation_window_ends_at,
      'first_real_session_at', v_f.first_real_session_at,
      'hours_to_first_real_session', case when v_f.first_real_session_at is not null
        then round(extract(epoch from (v_f.first_real_session_at - v_f.signed_up_at)) / 3600.0, 1) end,
      'returned_week2', v_f.returned_week2,
      'return_window_ends_at', v_f.return_window_ends_at
    ),
    'study', jsonb_build_object(
      'real_sessions', v_f.real_sessions,
      'short_sessions', v_f.short_sessions,
      'real_days', v_f.real_days,
      'last_real_session_at', v_f.last_real_session_at,
      'real_seconds_7d', v_f.real_seconds_7d,
      'real_seconds_30d', v_f.real_seconds_30d,
      'real_seconds_total', v_f.real_seconds_total,
      'long_sessions_total', (select count(*) from public.sessions s
        where s.user_id = p_user and s.started_at < v_now
          and s.duration_seconds > public.admin_long_session_seconds()),
      'active_7d', v_f.active_7d,
      'dormant', v_f.dormant
    ),
    'courses', jsonb_build_object(
      'total', v_f.courses_count,
      'active', v_f.active_courses_count,
      'upcoming_exams', (select count(*) from public.exams e
        where e.user_id = p_user and e.exam_date >= (v_now at time zone 'Europe/Brussels')::date),
      'objectives_30d', (select count(*) from public.objectives o
        where o.user_id = p_user and o.created_at >= v_now - interval '720 hours' and o.created_at < v_now)
    ),
    'social', jsonb_build_object(
      'friends', (select count(*) from public.friendships fr
        where fr.status = 'accepted' and (fr.requester = p_user or fr.addressee = p_user)
          and coalesce(fr.accepted_at, fr.created_at) <= v_now),
      'course_rooms', (select count(*) from public.course_room_members m where m.user_id = p_user),
      'course_room_posts_30d', (select count(*) from public.community_messages cm
        where cm.user_id = p_user and cm.room_id is not null
          and cm.created_at >= v_now - interval '720 hours' and cm.created_at < v_now),
      'groups', (select count(*) from public.group_members gm where gm.user_id = p_user),
      'referrals', (select count(*) from public.profiles r where r.referred_by = p_user)
    ),
    'level', v_level,
    'push', jsonb_build_object(
      'failures_30d', (select count(*) from public.push_diagnostics d
        where d.user_id = p_user and d.created_at >= v_now - interval '720 hours' and d.created_at < v_now),
      'last_failure', (select jsonb_build_object('at', d.created_at, 'reason', d.reason)
        from public.push_diagnostics d where d.user_id = p_user and d.created_at < v_now
        order by d.created_at desc limit 1)
    ),
    'recent_sessions', (select coalesce(jsonb_agg(jsonb_build_object(
        'started_at', x.started_at,
        'duration_seconds', x.duration_seconds,
        'real', x.duration_seconds >= public.admin_real_session_seconds()
      ) order by x.started_at desc), '[]'::jsonb)
      from (select s.started_at, s.duration_seconds from public.sessions s
            where s.user_id = p_user and s.started_at < v_now
            order by s.started_at desc limit 10) x),
    'admin_actions', (select coalesce(jsonb_agg(jsonb_build_object(
        'at', l.created_at,
        'action', l.action,
        'reason', l.reason,
        'actor_pseudo', ap.pseudo,
        'actor_kind', l.actor_kind
      ) order by l.created_at desc), '[]'::jsonb)
      from (select * from public.admin_audit_log a
            where a.target_user_id = p_user and a.created_at <= v_now
            order by a.created_at desc limit 20) l
      left join public.profiles ap on ap.id = l.actor_id)
  ) into v_result;

  return v_result;
end;
$$;

-- ── 6. Activation et cohortes ──────────────────────────────────────────────
-- L'entonnoir décrit les comptes existants (hors admins et suspendus), étape
-- par étape et SANS emboîtement : un ancien compte peut avoir étudié sans
-- avoir renseigné ses études. Les comptes supprimés ne comptent que dans les
-- cohortes. Usage des fonctions : parmi les membres actifs sur 30 jours.
create or replace function public.admin_activation()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_now timestamptz := public.admin_analytics_now();
  v_w30 timestamptz := v_now - interval '720 hours';
  v_min integer := public.admin_min_cohort_size();
  v_result jsonb;
begin
  perform public.assert_admin();

  with f as (
    select * from public.admin_member_facts(v_now) x
    where not x.is_admin and not x.suspended
  ),
  funnel as (
    select
      count(*) as accounts,
      count(*) filter (where f.has_profile) as profile_created,
      count(*) filter (where f.studies_completed) as studies_completed,
      count(*) filter (where f.courses_count > 0) as course_added,
      count(*) filter (where f.real_sessions > 0) as real_session,
      count(*) filter (where f.real_days >= 2) as real_days_2,
      count(*) filter (where f.real_days >= 5) as real_days_5,
      count(*) filter (where f.activation_window_ends_at <= v_now) as activation_eligible,
      count(*) filter (where f.activation_window_ends_at <= v_now and f.activation_status = 'activated') as activated,
      count(*) filter (where f.return_window_ends_at <= v_now) as return_eligible,
      count(*) filter (where f.return_window_ends_at <= v_now and f.returned_week2) as returned
    from f
  ),
  active30 as (
    select f.user_id from f where f.real_seconds_30d > 0
  ),
  usage as (
    select
      count(*) as active_30d,
      count(*) filter (where exists (
        select 1 from public.objectives o
        where o.user_id = a.user_id and o.created_at >= v_w30 and o.created_at < v_now)) as planning,
      count(*) filter (where exists (
        select 1 from public.friendships fr
        where fr.status = 'accepted'
          and (fr.requester = a.user_id or fr.addressee = a.user_id)
          and coalesce(fr.accepted_at, fr.created_at) <= v_now)) as friends,
      count(*) filter (where exists (
        select 1 from public.community_messages cm
        where cm.user_id = a.user_id and cm.room_id is not null
          and cm.created_at >= v_w30 and cm.created_at < v_now)) as course_rooms
    from active30 a
  ),
  deletions as (
    select
      count(*) as total,
      count(*) filter (where d.signup_week is not null and not d.was_admin and not d.was_suspended) as attributed,
      count(*) filter (where d.signup_week is null) as unattributed,
      count(*) filter (where d.was_admin or d.was_suspended) as excluded
    from public.deleted_accounts d
    where coalesce(d.deleted_at, v_now) <= v_now
  )
  select jsonb_build_object(
    'generated_at', v_now,
    'definitions', jsonb_build_object(
      'timezone', 'Europe/Brussels',
      'real_session_seconds', public.admin_real_session_seconds(),
      'activation_hours', 168,
      'return_window_hours', jsonb_build_array(168, 336),
      'active_window_hours', 168,
      'usage_window_hours', 720,
      'min_cohort_size', v_min,
      'long_session_seconds', public.admin_long_session_seconds()
    ),
    'funnel', (
      select jsonb_build_object(
        'accounts', fu.accounts,
        'profile_created', fu.profile_created,
        'studies_completed', fu.studies_completed,
        'course_added', fu.course_added,
        'real_session', fu.real_session,
        'real_days_2', fu.real_days_2,
        'real_days_5', fu.real_days_5,
        'activation', jsonb_build_object(
          'eligible', fu.activation_eligible,
          'activated', fu.activated,
          'rate', case when fu.activation_eligible >= v_min
            then round(fu.activated::numeric / fu.activation_eligible, 4) end
        ),
        'return_week2', jsonb_build_object(
          'eligible', fu.return_eligible,
          'returned', fu.returned,
          'rate', case when fu.return_eligible >= v_min
            then round(fu.returned::numeric / fu.return_eligible, 4) end
        )
      ) from funnel fu
    ),
    'cohorts', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'week_start', c.week_start,
        'accounts', c.accounts,
        'deleted', c.deleted,
        'cohort_size', c.cohort_size,
        'activation', jsonb_build_object(
          'complete', c.activation_complete,
          'complete_at', c.activation_complete_at,
          'activated', c.activated,
          'rate', c.activation_rate
        ),
        'return_week2', jsonb_build_object(
          'complete', c.return_complete,
          'complete_at', c.return_complete_at,
          'returned', c.returned,
          'unknown', c.return_unknown,
          'rate', c.return_rate
        )
      ) order by c.week_start), '[]'::jsonb)
      from public.admin_signup_cohorts(v_now) c
    ),
    'deletions', (
      select jsonb_build_object(
        'total', d.total,
        'in_cohorts', d.attributed,
        'without_signup_week', d.unattributed,
        'excluded', d.excluded
      ) from deletions d
    ),
    'feature_usage', (
      select jsonb_build_object(
        'active_30d', u.active_30d,
        'planning', u.planning,
        'friends', u.friends,
        'course_rooms', u.course_rooms,
        'planning_rate', case when u.active_30d >= v_min then round(u.planning::numeric / u.active_30d, 4) end,
        'friends_rate', case when u.active_30d >= v_min then round(u.friends::numeric / u.active_30d, 4) end,
        'course_rooms_rate', case when u.active_30d >= v_min then round(u.course_rooms::numeric / u.active_30d, 4) end
      ) from usage u
    )
  ) into v_result;

  return v_result;
end;
$$;

revoke all on function public.admin_today() from public, anon;
revoke all on function public.admin_members(text, text, text, integer, integer) from public, anon;
revoke all on function public.admin_member_detail(uuid) from public, anon;
revoke all on function public.admin_activation() from public, anon;
grant execute on function public.admin_today() to authenticated;
grant execute on function public.admin_members(text, text, text, integer, integer) to authenticated;
grant execute on function public.admin_member_detail(uuid) to authenticated;
grant execute on function public.admin_activation() to authenticated;

-- ── 7. Hygiène (appliquée le même jour sous le nom « v61_1 ») ──────────────
-- Le seuil de 10 minutes (v58) n'avait pas de search_path figé (alerte du
-- linter Supabase) et restait exécutable par l'app sans raison : il n'est
-- appelé que par les fonctions admin, qui tournent avec les droits du
-- propriétaire.
alter function public.admin_real_session_seconds() set search_path = public;
revoke all on function public.admin_real_session_seconds() from public, anon, authenticated;
