-- Migration v13 : add alltime_seconds to get_public_leaderboard
-- Fixes level pill always showing level 1 when "day" filter is active,
-- because total_seconds was the period total (tiny) not the all-time total.
-- Now returns both: total_seconds (for ranking) and alltime_seconds (for level).

CREATE OR REPLACE FUNCTION public.get_public_leaderboard(
  p_period     text DEFAULT 'week',
  p_university text DEFAULT NULL
)
RETURNS TABLE(
  user_id         uuid,
  pseudo          text,
  first_name      text,
  last_name       text,
  avatar_url      text,
  total_seconds   bigint,
  alltime_seconds bigint
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  WITH period_secs AS (
    SELECT
      s.user_id,
      SUM(s.duration_seconds) AS period_total
    FROM public.sessions s
    WHERE s.started_at >= CASE
          WHEN p_period = 'day'  THEN CURRENT_DATE::timestamptz
          ELSE (CURRENT_DATE - INTERVAL '6 days')::timestamptz
        END
    GROUP BY s.user_id
    HAVING SUM(s.duration_seconds) > 0
  ),
  alltime_secs AS (
    SELECT
      s.user_id,
      SUM(s.duration_seconds) AS alltime_total
    FROM public.sessions s
    GROUP BY s.user_id
  )
  SELECT
    p.id          AS user_id,
    p.pseudo,
    p.first_name,
    p.last_name,
    p.avatar_url,
    ps.period_total::bigint                        AS total_seconds,
    COALESCE(at.alltime_total, 0)::bigint          AS alltime_seconds
  FROM public.profiles p
  INNER JOIN period_secs ps ON ps.user_id = p.id
  LEFT  JOIN alltime_secs at ON at.user_id = p.id
  WHERE (p_university IS NULL OR p.university = p_university)
  ORDER BY total_seconds DESC
  LIMIT 50;
$$;

REVOKE ALL ON FUNCTION public.get_public_leaderboard(text, text) FROM public;
GRANT  EXECUTE ON FUNCTION public.get_public_leaderboard(text, text) TO authenticated;
