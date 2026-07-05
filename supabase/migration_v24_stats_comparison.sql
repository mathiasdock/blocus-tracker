-- migration_v24_stats_comparison.sql
-- ---------------------------------------------------------------
-- RPC agrégée pour la section "Comparaison" de la page Stats.
-- Renvoie UNIQUEMENT des moyennes (jamais de données individuelles) :
--   • les métriques de l'utilisateur courant (30 derniers jours)
--   • la moyenne par utilisateur de SON université
--   • la moyenne par utilisateur de toute l'app
-- Confidentialité : une cohorte n'est renvoyée que si elle compte ≥ 3
-- utilisateurs actifs (sinon null) → impossible de dé-anonymiser.
--
-- ⚠️ À exécuter manuellement dans le SQL Editor Supabase (comme les autres
-- migrations du projet). Aucune table/policy modifiée : simple fonction.
-- ---------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_study_comparison()
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  me       uuid := auth.uid();
  my_uni   text;
  result   json;
BEGIN
  IF me IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT university INTO my_uni FROM public.profiles WHERE id = me;

  WITH per_user AS (
    SELECT
      s.user_id,
      SUM(s.duration_seconds) / 60.0 / 30.0            AS avg_daily_min,
      COUNT(*)                                          AS sessions,
      COUNT(DISTINCT (s.started_at AT TIME ZONE 'UTC')::date) AS active_days
    FROM public.sessions s
    WHERE s.started_at >= (now() - interval '30 days')
    GROUP BY s.user_id
  ),
  joined AS (
    SELECT pu.*, p.university
    FROM per_user pu
    JOIN public.profiles p ON p.id = pu.user_id
  ),
  me_row AS (
    SELECT * FROM per_user WHERE user_id = me
  ),
  uni_agg AS (
    SELECT AVG(avg_daily_min) AS a, AVG(sessions) AS s, AVG(active_days) AS d, COUNT(*) AS n
    FROM joined
    WHERE my_uni IS NOT NULL AND university = my_uni
  ),
  app_agg AS (
    SELECT AVG(avg_daily_min) AS a, AVG(sessions) AS s, AVG(active_days) AS d, COUNT(*) AS n
    FROM per_user
  )
  SELECT json_build_object(
    'university', my_uni,
    'me', (
      SELECT json_build_object(
        'avg_daily_min', COALESCE(ROUND(avg_daily_min)::int, 0),
        'sessions',      COALESCE(sessions, 0),
        'active_days',   COALESCE(active_days, 0)
      ) FROM me_row
    ),
    'uni', (
      SELECT CASE WHEN n >= 3 THEN json_build_object(
        'avg_daily_min', ROUND(a)::int,
        'sessions',      ROUND(s, 1),
        'active_days',   ROUND(d, 1),
        'n',             n
      ) ELSE NULL END FROM uni_agg
    ),
    'app', (
      SELECT CASE WHEN n >= 3 THEN json_build_object(
        'avg_daily_min', ROUND(a)::int,
        'sessions',      ROUND(s, 1),
        'active_days',   ROUND(d, 1),
        'n',             n
      ) ELSE NULL END FROM app_agg
    )
  ) INTO result;

  RETURN result;
END;
$$;

REVOKE ALL   ON FUNCTION public.get_study_comparison() FROM public;
GRANT EXECUTE ON FUNCTION public.get_study_comparison() TO authenticated;
