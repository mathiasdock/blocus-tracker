-- Migration v11 : classement public + position percentile
-- À exécuter dans le SQL Editor Supabase.

-- ── 1. Classement public (top 50 par période) ─────────────────────────────
-- Contourne le RLS via SECURITY DEFINER pour agréger les données de toutes
-- les sessions sans exposer le détail des sessions individuelles.
CREATE OR REPLACE FUNCTION public.get_public_leaderboard(p_period text DEFAULT 'week')
RETURNS TABLE(
  user_id      uuid,
  pseudo       text,
  first_name   text,
  last_name    text,
  avatar_url   text,
  total_seconds bigint
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p.id           AS user_id,
    p.pseudo,
    p.first_name,
    p.last_name,
    p.avatar_url,
    COALESCE(SUM(s.duration_seconds), 0)::bigint AS total_seconds
  FROM public.profiles p
  LEFT JOIN public.sessions s
    ON  s.user_id = p.id
    AND s.started_at >= CASE
          WHEN p_period = 'day'  THEN CURRENT_DATE::timestamptz
          ELSE (CURRENT_DATE - INTERVAL '6 days')::timestamptz
        END
  GROUP BY p.id, p.pseudo, p.first_name, p.last_name, p.avatar_url
  HAVING COALESCE(SUM(s.duration_seconds), 0) > 0
  ORDER BY total_seconds DESC
  LIMIT 50;
$$;

REVOKE ALL ON FUNCTION public.get_public_leaderboard(text) FROM public;
GRANT  EXECUTE ON FUNCTION public.get_public_leaderboard(text) TO authenticated;

-- ── 2. Position de l'utilisateur connecté (percentile) ────────────────────
-- Retourne : my_secs (son temps), better_count (combien ont fait mieux),
--            total_active (tous ceux qui ont étudié sur la période).
CREATE OR REPLACE FUNCTION public.get_my_study_rank(p_period text DEFAULT 'day')
RETURNS TABLE(my_secs bigint, better_count bigint, total_active bigint)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  WITH period_totals AS (
    SELECT
      s.user_id,
      SUM(s.duration_seconds)::bigint AS secs
    FROM public.sessions s
    WHERE s.started_at >= CASE
      WHEN p_period = 'day'  THEN CURRENT_DATE::timestamptz
      ELSE (CURRENT_DATE - INTERVAL '6 days')::timestamptz
    END
    GROUP BY s.user_id
  ),
  my_val AS (
    SELECT COALESCE(
      (SELECT secs FROM period_totals WHERE user_id = auth.uid()),
      0
    )::bigint AS secs
  )
  SELECT
    (SELECT secs FROM my_val)::bigint                                       AS my_secs,
    COUNT(CASE WHEN t.secs > (SELECT secs FROM my_val) THEN 1 END)::bigint AS better_count,
    COUNT(*)::bigint                                                         AS total_active
  FROM period_totals t;
$$;

REVOKE ALL ON FUNCTION public.get_my_study_rank(text) FROM public;
GRANT  EXECUTE ON FUNCTION public.get_my_study_rank(text) TO authenticated;
