-- Migration v12 : filtre université dans get_public_leaderboard
-- À exécuter dans le SQL Editor Supabase.

-- Remplace la fonction existante en ajoutant un paramètre optionnel p_university.
-- NULL = classement global (comportement identique à avant).
-- Valeur = filtré sur les profils de cette université uniquement.

CREATE OR REPLACE FUNCTION public.get_public_leaderboard(
  p_period     text DEFAULT 'week',
  p_university text DEFAULT NULL
)
RETURNS TABLE(
  user_id       uuid,
  pseudo        text,
  first_name    text,
  last_name     text,
  avatar_url    text,
  total_seconds bigint
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p.id          AS user_id,
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
  WHERE (p_university IS NULL OR p.university = p_university)
  GROUP BY p.id, p.pseudo, p.first_name, p.last_name, p.avatar_url
  HAVING COALESCE(SUM(s.duration_seconds), 0) > 0
  ORDER BY total_seconds DESC
  LIMIT 50;
$$;

REVOKE ALL ON FUNCTION public.get_public_leaderboard(text, text) FROM public;
GRANT  EXECUTE ON FUNCTION public.get_public_leaderboard(text, text) TO authenticated;
