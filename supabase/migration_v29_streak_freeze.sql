-- Migration v29 : gel de série (streak freeze), façon Duolingo.
--
-- Mécanique : chaque utilisateur a un stock de gels (max 2, rechargé à 2 au
-- premier passage de chaque mois — recharge paresseuse côté client, pas de
-- cron). Quand il revient après avoir manqué N jour(s) depuis sa dernière
-- activité et que N <= stock, les jours manqués sont "gelés" : une ligne par
-- jour dans streak_freeze_days, stock décrémenté, et la série continue.
-- Un jour gelé compte pour la CONTINUITÉ de la série, pas comme jour actif
-- (les stats de régularité/jours actifs ne changent pas).
--
-- Trois surfaces de calcul de série mises à jour ici :
--   1. get_leaderboard_v2 (v27) — métrique "série" du classement ;
--   2. gamification_current_streak (v28) — source canonique niveaux/XP ;
--   3. le client (lib/format.js computeStreak) lit streak_freeze_days.
--
-- ⚠️ Tant que cette migration n'est pas exécutée, l'app dégrade proprement :
-- lib/streakFreezes.js détecte l'absence de la table/colonnes et désactive la
-- feature (aucune erreur visible, comportement d'avant conservé).

-- ── 1) Stock de gels sur le profil + mois de la dernière recharge ──────────
alter table public.profiles
  add column if not exists streak_freezes int not null default 2;
alter table public.profiles
  add column if not exists streak_freeze_month text;

-- ── 2) Journal des jours gelés ──────────────────────────────────────────────
-- Source de vérité pour tous les calculs. PK (user_id, used_on) → idempotent.
create table if not exists public.streak_freeze_days (
  user_id    uuid not null references public.profiles(id) on delete cascade,
  used_on    date not null,
  created_at timestamptz not null default now(),
  primary key (user_id, used_on)
);

alter table public.streak_freeze_days enable row level security;

-- Lecture ouverte aux connectés : les niveaux/XP des AUTRES utilisateurs sont
-- calculés côté client en repli (lib/userLevels.js lit déjà les sessions des
-- autres) — un jour gelé n'est qu'une date, rien de sensible.
drop policy if exists sfd_select on public.streak_freeze_days;
create policy sfd_select on public.streak_freeze_days
  for select to authenticated using (true);

-- Écriture : uniquement ses propres gels (même niveau de confiance que
-- l'insertion de ses propres sessions). Pas d'update/delete.
drop policy if exists sfd_insert on public.streak_freeze_days;
create policy sfd_insert on public.streak_freeze_days
  for insert to authenticated with check (auth.uid() = user_id);

-- ── 3) gamification_current_streak : un jour gelé compte comme actif ───────
-- (identique à la v28, avec "OR jour gelé" dans les deux tests d'existence)
CREATE OR REPLACE FUNCTION public.gamification_current_streak(p_user_id uuid)
RETURNS integer
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_timezone text := COALESCE(public.gamification_timezone(p_user_id), 'Europe/Paris');
  v_today date := (now() AT TIME ZONE v_timezone)::date;
  v_cursor date;
  v_streak integer := 0;
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.sessions s
    WHERE s.user_id = p_user_id
      AND (s.started_at AT TIME ZONE v_timezone)::date = v_today
  ) OR EXISTS (
    SELECT 1 FROM public.streak_freeze_days f
    WHERE f.user_id = p_user_id AND f.used_on = v_today
  ) THEN
    v_cursor := v_today;
  ELSE
    v_cursor := v_today - 1;
  END IF;

  WHILE v_streak < 366 LOOP
    EXIT WHEN NOT (
      EXISTS (
        SELECT 1 FROM public.sessions s
        WHERE s.user_id = p_user_id
          AND (s.started_at AT TIME ZONE v_timezone)::date = v_cursor
      )
      OR EXISTS (
        SELECT 1 FROM public.streak_freeze_days f
        WHERE f.user_id = p_user_id AND f.used_on = v_cursor
      )
    );
    v_streak := v_streak + 1;
    v_cursor := v_cursor - 1;
  END LOOP;

  RETURN v_streak;
END;
$$;

REVOKE ALL ON FUNCTION public.gamification_current_streak(uuid) FROM PUBLIC, anon, authenticated;

-- ── 4) get_leaderboard_v2 : métrique "série" avec jours gelés ───────────────
-- (identique à la v27, avec UNION des jours gelés dans la CTE daily)
CREATE OR REPLACE FUNCTION public.get_leaderboard_v2(
  p_period      text DEFAULT 'week',   -- 'day' | 'week' | 'month'
  p_metric      text DEFAULT 'time',   -- 'time' | 'streak' | 'regularity'
  p_scope       text DEFAULT 'all',    -- 'all' | 'friends'
  p_university  text DEFAULT NULL,
  p_study_field text DEFAULT NULL,
  p_study_year  text DEFAULT NULL
)
RETURNS TABLE(
  user_id         uuid,
  pseudo          text,
  first_name      text,
  last_name       text,
  avatar_url      text,
  total_seconds   bigint,
  alltime_seconds bigint,
  streak_days     integer,
  active_days     integer
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  WITH bounds AS (
    SELECT CASE
        WHEN p_period = 'day'   THEN CURRENT_DATE::timestamptz
        WHEN p_period = 'month' THEN (CURRENT_DATE - INTERVAL '29 days')::timestamptz
        ELSE (CURRENT_DATE - INTERVAL '6 days')::timestamptz
      END AS since
  ),
  pool AS (
    SELECT p.id, p.pseudo, p.first_name, p.last_name, p.avatar_url
    FROM public.profiles p
    WHERE (p_university  IS NULL OR p.university  = p_university)
      AND (p_study_field IS NULL OR p.study_field = p_study_field)
      AND (p_study_year  IS NULL OR p.study_year  = p_study_year)
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
  period_stats AS (
    SELECT s.user_id,
           SUM(s.duration_seconds)            AS period_total,
           COUNT(DISTINCT s.started_at::date) AS days_active
    FROM public.sessions s, bounds b
    WHERE s.started_at >= b.since
    GROUP BY s.user_id
  ),
  alltime AS (
    SELECT s.user_id, SUM(s.duration_seconds) AS alltime_total
    FROM public.sessions s
    GROUP BY s.user_id
  ),
  -- Série : gaps-and-islands sur les jours distincts d'étude ∪ jours gelés ;
  -- on ne garde que la course qui se termine aujourd'hui ou hier.
  daily AS (
    SELECT DISTINCT u.user_id, u.d FROM (
      SELECT s.user_id, s.started_at::date AS d
      FROM public.sessions s
      WHERE s.started_at >= (CURRENT_DATE - INTERVAL '400 days')
      UNION
      SELECT f.user_id, f.used_on AS d
      FROM public.streak_freeze_days f
      WHERE f.used_on >= (CURRENT_DATE - 400)
    ) u
  ),
  runs AS (
    SELECT user_id, d,
           d - (ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY d))::int AS grp
    FROM daily
  ),
  streaks AS (
    SELECT user_id, COUNT(*)::int AS streak
    FROM runs
    GROUP BY user_id, grp
    HAVING MAX(d) >= CURRENT_DATE - 1
  )
  SELECT
    p.id AS user_id,
    p.pseudo,
    p.first_name,
    p.last_name,
    p.avatar_url,
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
$$;

REVOKE ALL ON FUNCTION public.get_leaderboard_v2(text, text, text, text, text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.get_leaderboard_v2(text, text, text, text, text, text) TO authenticated;
