-- v57 — Suspension réelle (refonte de l'admin, phase 1).
--
-- AVANT : « Suspendre » ne faisait qu'une chose — empêcher la personne de
-- modifier son propre profil. Elle pouvait tout le reste.
--
-- APRÈS, un compte suspendu (`profiles.locked = true`) :
--   1. ne peut plus RIEN écrire, par aucun chemin : un déclencheur placé sur
--      chaque table du schéma public refuse toute écriture dont l'auteur
--      (auth.uid()) est suspendu. Il couvre les écritures directes ET les
--      fonctions SECURITY DEFINER (qui contournent les règles d'accès mais pas
--      les déclencheurs). Seule exception : supprimer son propre compte (le
--      droit à l'effacement prime), signalée par `blocus.self_delete` ;
--   2. disparaît pour les autres : ses publications, commentaires, réactions,
--      messages de salon et de groupe ne sont plus lisibles par les autres ;
--      il sort des classements et des listes de recherche ;
--   3. ne peut plus être contacté : ni message privé, ni demande d'ami, ni
--      acceptation d'une demande qu'il aurait envoyée ;
--   4. ses données restent intactes : la réactivation rend tout.
-- La connexion elle-même est bloquée par la route serveur (bannissement
-- Supabase Auth), qui appelle aussi admin_set_suspension ci-dessous.

-- ── Qui est suspendu ─────────────────────────────────────────────────────────
-- Fonction SQL simple (ni SECURITY DEFINER ni volatile) : le planificateur peut
-- l'intégrer dans les règles d'accès au lieu de l'appeler ligne par ligne.
create or replace function public.is_suspended(p_user uuid)
returns boolean
language sql
stable
set search_path = public
as $$
  select exists (select 1 from public.profiles where id = p_user and locked);
$$;

-- ── 1. Aucune écriture par un compte suspendu ────────────────────────────────
create or replace function public.block_suspended_actor()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is not null
     and coalesce(current_setting('blocus.self_delete', true), '') <> 'on'
     and exists (select 1 from public.profiles where id = v_uid and locked) then
    raise exception 'Account suspended' using errcode = '42501', hint = 'suspended';
  end if;
  return coalesce(new, old);
end;
$$;

revoke all on function public.block_suspended_actor() from public, anon, authenticated;

-- Sur toutes les tables du schéma public, sauf les journaux tenus par la base
-- elle-même. Le nom commence par « a00 » : il passe avant les autres
-- déclencheurs BEFORE, qui ne travaillent donc jamais pour rien.
do $attach$
declare
  r record;
begin
  for r in
    select c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind = 'r'
      and c.relname not in ('admin_audit_log', 'system_job_runs', 'deleted_accounts')
  loop
    execute format('drop trigger if exists a00_block_suspended_actor on public.%I', r.relname);
    execute format(
      'create trigger a00_block_suspended_actor before insert or update or delete on public.%I '
      'for each row execute function public.block_suspended_actor()',
      r.relname
    );
  end loop;
end
$attach$;

-- ── 2. Invisible pour les autres ─────────────────────────────────────────────
drop policy if exists posts_read on public.posts;
create policy posts_read on public.posts
  for select to authenticated
  using (
    ((visibility is distinct from 'friends') or is_friend_or_self(user_id))
    and not activity_blocked_with(user_id)
    and not public.is_suspended(user_id)
  );

drop policy if exists comments_read on public.comments;
create policy comments_read on public.comments
  for select to authenticated
  using (
    exists (
      select 1 from public.posts p
      where p.id = comments.post_id
        and ((p.visibility is distinct from 'friends') or is_friend_or_self(p.user_id))
        and not activity_blocked_with(p.user_id)
    )
    and not activity_blocked_with(user_id)
    and not public.is_suspended(user_id)
  );

drop policy if exists likes_read on public.likes;
create policy likes_read on public.likes
  for select to authenticated
  using (
    exists (
      select 1 from public.posts p
      where p.id = likes.post_id
        and ((p.visibility is distinct from 'friends') or is_friend_or_self(p.user_id))
        and not activity_blocked_with(p.user_id)
    )
    and not activity_blocked_with(user_id)
    and not public.is_suspended(user_id)
  );

-- L'accès admin à tous les salons est retiré par v59 ; ici on ajoute seulement
-- la règle de suspension, sans rien changer d'autre.
drop policy if exists community_messages_read on public.community_messages;
create policy community_messages_read on public.community_messages
  for select to authenticated
  using (
    (user_id = (select auth.uid()))
    or (select public.is_current_user_admin())
    or (
      (room_id in (
        select m.room_id from public.course_room_members m
        where m.user_id = (select auth.uid())
      ))
      and hidden_at is null
      and not (user_id in (
        select b.blocked_id from public.user_blocks b
        where b.blocker_id = (select auth.uid())
      ))
      and not (id in (
        select r.message_id from public.course_message_reports r
        where r.reporter_id = (select auth.uid())
      ))
      and not public.is_suspended(user_id)
    )
  );

drop policy if exists gmsg_select on public.group_messages;
create policy gmsg_select on public.group_messages
  for select to authenticated
  using (
    is_group_member(group_id)
    and (user_id = (select auth.uid()) or not public.is_suspended(user_id))
  );

-- ── 3. Plus de nouveau contact avec un compte suspendu ───────────────────────
drop policy if exists pm_insert on public.private_messages;
create policy pm_insert on public.private_messages
  for insert to authenticated
  with check (
    (auth.uid() = sender_id)
    and exists (
      select 1 from public.friendships
      where friendships.status = 'accepted'
        and (
          (friendships.requester = auth.uid() and friendships.addressee = private_messages.receiver_id)
          or (friendships.addressee = auth.uid() and friendships.requester = private_messages.receiver_id)
        )
    )
    and not public.is_suspended(receiver_id)
  );

drop policy if exists friendships_insert on public.friendships;
create policy friendships_insert on public.friendships
  for insert to authenticated
  with check (
    (auth.uid() = requester)
    and (requester <> addressee)
    and (status = 'pending')
    and not public.is_suspended(addressee)
  );

drop policy if exists friendships_update on public.friendships;
create policy friendships_update on public.friendships
  for update to authenticated
  using (auth.uid() = addressee)
  with check (
    (auth.uid() = addressee)
    and (status = 'accepted')
    and not public.is_suspended(requester)
  );

-- ── Classements : les comptes suspendus n'y figurent plus ────────────────────
create or replace function public.get_public_leaderboard(p_period text default 'week')
returns table(user_id uuid, pseudo text, first_name text, last_name text, avatar_url text, total_seconds bigint)
language sql
stable
security definer
set search_path to 'public'
as $$
  select
    p.id as user_id,
    p.pseudo,
    p.first_name,
    p.last_name,
    p.avatar_url,
    coalesce(sum(s.duration_seconds), 0)::bigint as total_seconds
  from public.profiles p
  left join public.sessions s
    on  s.user_id = p.id
    and s.started_at >= case
          when p_period = 'day' then current_date::timestamptz
          else (current_date - interval '6 days')::timestamptz
        end
  where not p.locked
  group by p.id, p.pseudo, p.first_name, p.last_name, p.avatar_url
  having coalesce(sum(s.duration_seconds), 0) > 0
  order by total_seconds desc
  limit 50;
$$;

create or replace function public.get_public_leaderboard(p_period text default 'week', p_university text default null)
returns table(user_id uuid, pseudo text, first_name text, last_name text, avatar_url text, total_seconds bigint, alltime_seconds bigint)
language sql
stable
security definer
set search_path to 'public'
as $$
  with period_secs as (
    select s.user_id, sum(s.duration_seconds) as period_total
    from public.sessions s
    where s.started_at >= case
          when p_period = 'day' then current_date::timestamptz
          else (current_date - interval '6 days')::timestamptz
        end
    group by s.user_id
    having sum(s.duration_seconds) > 0
  ),
  alltime_secs as (
    select s.user_id, sum(s.duration_seconds) as alltime_total
    from public.sessions s
    group by s.user_id
  )
  select
    p.id as user_id,
    p.pseudo,
    p.first_name,
    p.last_name,
    p.avatar_url,
    ps.period_total::bigint as total_seconds,
    coalesce(at.alltime_total, 0)::bigint as alltime_seconds
  from public.profiles p
  inner join period_secs ps on ps.user_id = p.id
  left join alltime_secs at on at.user_id = p.id
  where (p_university is null or p.university = p_university)
    and not p.locked
  order by total_seconds desc
  limit 50;
$$;

-- get_leaderboard_v2 : corps repris de v53, avec le seul filtre « not p.locked ».
CREATE OR REPLACE FUNCTION public.get_leaderboard_v2(
  p_period text DEFAULT 'week', p_metric text DEFAULT 'time', p_scope text DEFAULT 'all',
  p_university text DEFAULT NULL, p_study_field text DEFAULT NULL, p_study_year text DEFAULT NULL)
RETURNS TABLE(user_id uuid, pseudo text, first_name text, last_name text, avatar_url text,
  total_seconds bigint, alltime_seconds bigint, streak_days integer, active_days integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  WITH bounds AS (
    SELECT CASE
        WHEN p_period = 'day'   THEN CURRENT_DATE::timestamptz
        WHEN p_period = 'month' THEN (CURRENT_DATE - INTERVAL '29 days')::timestamptz
        ELSE (CURRENT_DATE - INTERVAL '6 days')::timestamptz
      END AS since
  ),
  pool AS (
    SELECT p.id, p.pseudo, p.first_name, p.last_name, p.avatar_url, p.timezone
    FROM public.profiles p
    WHERE (p_university  IS NULL OR p.university  = p_university)
      AND (p_study_field IS NULL OR p.study_field = p_study_field)
      AND (p_study_year  IS NULL OR p.study_year  = p_study_year)
      -- v57 : un compte suspendu disparaît des classements.
      AND NOT p.locked
      AND (
        p_scope <> 'friends'
        OR p.id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM public.friendships f
          WHERE f.status = 'accepted'
            AND ((f.requester = auth.uid() AND f.addressee = p.id)
              OR (f.addressee = auth.uid() AND f.requester = p.id))
        )
      )
  ),
  -- Même règle que gamification_timezone() : fuseau du profil s'il existe,
  -- sinon Europe/Paris. Les noms valides sont matérialisés une seule fois.
  tznames AS MATERIALIZED (SELECT name FROM pg_catalog.pg_timezone_names),
  utz AS (
    SELECT pl.id AS user_id, COALESCE(tn.name, 'Europe/Paris') AS tz
    FROM pool pl
    LEFT JOIN tznames tn ON tn.name = COALESCE(pl.timezone, 'Europe/Paris')
  ),
  period_stats AS (
    SELECT s.user_id,
           SUM(s.duration_seconds)                                AS period_total,
           COUNT(DISTINCT (s.started_at AT TIME ZONE z.tz)::date) AS days_active
    FROM public.sessions s
    JOIN utz z ON z.user_id = s.user_id, bounds b
    WHERE s.started_at >= b.since
    GROUP BY s.user_id
  ),
  alltime AS (
    SELECT s.user_id, SUM(s.duration_seconds) AS alltime_total
    FROM public.sessions s
    JOIN pool pl ON pl.id = s.user_id
    GROUP BY s.user_id
  ),
  daily AS (
    SELECT DISTINCT u.user_id, u.d FROM (
      SELECT s.user_id, (s.started_at AT TIME ZONE z.tz)::date AS d
      FROM public.sessions s
      JOIN utz z ON z.user_id = s.user_id
      WHERE s.started_at >= (CURRENT_DATE - INTERVAL '400 days')
      UNION
      SELECT f.user_id, f.used_on AS d
      FROM public.streak_freeze_days f
      JOIN utz z2 ON z2.user_id = f.user_id
      WHERE f.used_on >= (CURRENT_DATE - 400)
    ) u
  ),
  runs AS (
    SELECT user_id, d,
           d - (ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY d))::int AS grp
    FROM daily
  ),
  streaks AS (
    SELECT r.user_id, COUNT(*)::int AS streak
    FROM runs r
    JOIN utz z ON z.user_id = r.user_id
    GROUP BY r.user_id, r.grp, z.tz
    HAVING MAX(r.d) >= ((now() AT TIME ZONE z.tz)::date) - 1
  )
  SELECT
    p.id AS user_id, p.pseudo, p.first_name, p.last_name, p.avatar_url,
    COALESCE(ps.period_total, 0)::bigint AS total_seconds,
    COALESCE(a.alltime_total, 0)::bigint AS alltime_seconds,
    COALESCE(st.streak, 0)               AS streak_days,
    COALESCE(ps.days_active, 0)::int     AS active_days
  FROM pool p
  LEFT JOIN period_stats ps ON ps.user_id = p.id
  LEFT JOIN alltime a       ON a.user_id  = p.id
  LEFT JOIN streaks st      ON st.user_id = p.id
  WHERE p_scope = 'friends'
     OR CASE WHEN p_metric = 'streak' THEN COALESCE(st.streak, 0)     > 0
             ELSE                          COALESCE(ps.period_total, 0) > 0 END
  ORDER BY
    CASE p_metric
      WHEN 'streak'     THEN COALESCE(st.streak, 0)::bigint
      WHEN 'regularity' THEN COALESCE(ps.days_active, 0)::bigint
      ELSE COALESCE(ps.period_total, 0)::bigint
    END DESC,
    COALESCE(ps.period_total, 0) DESC,
    p.pseudo ASC
  LIMIT 50;
$function$;

-- ── Suspendre / réactiver — réservé au serveur ───────────────────────────────
-- La route admin vérifie l'admin, appelle cette fonction, puis bannit ou
-- débannit le compte dans Supabase Auth (connexion bloquée).
create or replace function public.admin_set_suspension(
  p_actor uuid,
  p_target uuid,
  p_suspend boolean,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_is_admin boolean;
  v_locked boolean;
begin
  perform public.assert_admin_actor(p_actor);
  if p_target is null or p_suspend is null then
    raise exception 'Target and state are required' using errcode = '22023';
  end if;
  if char_length(btrim(coalesce(p_reason, ''))) < 3 then
    raise exception 'A reason is required' using errcode = '22023';
  end if;

  select is_admin, locked into v_is_admin, v_locked
  from public.profiles where id = p_target
  for update;
  if not found then
    raise exception 'Unknown profile' using errcode = '22023';
  end if;
  if p_target = p_actor then
    raise exception 'You cannot suspend yourself' using errcode = '42501';
  end if;
  if v_is_admin then
    raise exception 'Admins cannot be suspended' using errcode = '42501';
  end if;
  if v_locked = p_suspend then
    return jsonb_build_object('ok', true, 'changed', false, 'suspended', p_suspend);
  end if;

  perform set_config('blocus.privileged_change', 'on', true);
  update public.profiles
     set locked = p_suspend,
         studying_since = case when p_suspend then null else studying_since end
   where id = p_target;
  perform set_config('blocus.privileged_change', '', true);

  perform public.log_admin_action(
    p_actor,
    case when p_suspend then 'member_suspended' else 'member_unsuspended' end,
    p_target, 'user', p_target::text, p_reason, '{}'::jsonb
  );
  return jsonb_build_object('ok', true, 'changed', true, 'suspended', p_suspend);
end;
$$;

revoke all on function public.admin_set_suspension(uuid, uuid, boolean, text)
  from public, anon, authenticated;
grant execute on function public.admin_set_suspension(uuid, uuid, boolean, text) to service_role;
