-- Migration v27 : classement v2 — métriques et filtres côté serveur.
--
-- Le classement de la page Stats ne montrait que les heures d'étude.
-- Cette RPC ajoute :
--   · 3 métriques  : time (secondes sur la période) | streak (série de jours
--                    consécutifs, même définition que computeStreak() dans
--                    lib/format.js : série se terminant aujourd'hui ou hier)
--                    | regularity (jours actifs sur la période)
--   · 3 périodes   : day | week (7 j) | month (30 j)
--   · 2 portées    : all (top 50 des actifs) | friends (mes amis acceptés
--                    + moi, toujours inclus même à zéro — friendships lues
--                    côté serveur via auth.uid())
--   · 3 filtres    : université, filière (study_field), année (study_year)
--                    — égalité exacte avec les valeurs du profil.
--
-- L'ancienne get_public_leaderboard (v11→v13) est CONSERVÉE : l'UI retombe
-- dessus tant que cette migration n'a pas été exécutée (même pattern que
-- get_study_comparison / v24).

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
  -- Série : gaps-and-islands sur les jours distincts d'étude ; on ne garde
  -- que la course qui se termine aujourd'hui ou hier (au plus une par user).
  daily AS (
    SELECT DISTINCT s.user_id, s.started_at::date AS d
    FROM public.sessions s
    WHERE s.started_at >= (CURRENT_DATE - INTERVAL '400 days')
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
