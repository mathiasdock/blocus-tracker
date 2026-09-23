-- v53 — get_leaderboard_v2 : 15 s → quelques ms.
--
-- La fonction appelait gamification_timezone() pour CHAQUE profil du pool, et
-- chaque appel relisait pg_timezone_names (lecture de la base des fuseaux sur
-- disque). Avec ~250 profils elle dépassait le statement_timeout (8 s) du rôle
-- authenticated : PostgREST renvoyait 500, le client basculait sur l'ancienne
-- RPC — sans « 30 derniers jours » et avec un niveau calculé sur le temps de
-- la période au lieu du temps total.
--
-- Même résultat, même signature : la liste des fuseaux valides est lue UNE
-- fois ; le total historique et la série ne sont calculés que pour le pool.
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
