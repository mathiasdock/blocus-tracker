-- Migration v30 : classement (get_leaderboard_v2) — série & régularité dans le
-- FUSEAU de chaque utilisateur, pas en UTC.
--
-- Contexte : la frontière du "jour" pour la série était en UTC dans TROIS
-- endroits. Deux étaient déjà corrects :
--   • gamification_current_streak (source canonique niveaux/XP) → déjà
--     timezone-aware depuis la v28 (via public.gamification_timezone).
--   • le client (lib/format.js computeStreak) → passé en date LOCALE
--     (localISO) en même temps que cette migration.
-- Il restait get_leaderboard_v2 (v27/v29) qui bucketisait les jours en UTC
-- (s.started_at::date + CURRENT_DATE) → la série et la régularité du CLASSEMENT
-- pouvaient différer d'un jour de la série personnelle pour qui étudie tard le
-- soir (en Belgique, minuit UTC = 01h/02h locale). Cette migration aligne le
-- classement sur le fuseau de chaque utilisateur.
--
-- Seule différence avec la v29 : le bucketing de date passe par
-- (started_at AT TIME ZONE tz)::date, tz = public.gamification_timezone(user),
-- et l'ancre "aujourd'hui/hier" de la série devient locale elle aussi. La
-- fenêtre de PÉRIODE (jour/semaine/mois, CTE bounds) reste en UTC : c'est un
-- filtre grossier (7/30 derniers jours), un décalage de quelques heures au bord
-- y est négligeable.
--
-- ⚠️ À exécuter manuellement dans le SQL Editor Supabase (comme toute migration
-- du projet). Sans elle : la série/régularité du classement reste en UTC, tout
-- le reste (série perso client + niveaux/XP) est déjà correct.

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
  -- Fuseau validé par utilisateur (restreint au pool → peu d'appels). La
  -- fonction valide le nom contre pg_timezone_names et retombe sur
  -- 'Europe/Paris' → jamais d'erreur "AT TIME ZONE" sur un fuseau invalide.
  utz AS (
    SELECT pl.id AS user_id, public.gamification_timezone(pl.id) AS tz
    FROM pool pl
  ),
  period_stats AS (
    SELECT s.user_id,
           SUM(s.duration_seconds)                                       AS period_total,
           COUNT(DISTINCT (s.started_at AT TIME ZONE z.tz)::date)        AS days_active
    FROM public.sessions s
    JOIN utz z ON z.user_id = s.user_id, bounds b
    WHERE s.started_at >= b.since
    GROUP BY s.user_id
  ),
  alltime AS (
    SELECT s.user_id, SUM(s.duration_seconds) AS alltime_total
    FROM public.sessions s
    GROUP BY s.user_id
  ),
  -- Série : gaps-and-islands sur les jours distincts d'étude ∪ jours gelés,
  -- bucketisés dans le fuseau de l'utilisateur ; on ne garde que la course qui
  -- se termine aujourd'hui ou hier (ancre locale).
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
