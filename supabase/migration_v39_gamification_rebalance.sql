-- ================================================================
-- migration_v39_gamification_rebalance.sql
--
-- Rééquilibrage de la gamification. Trois changements, aucun destructif.
--
-- 1. COURBE DE NIVEAUX. L'ancienne plafonnait à 100 000 XP, soit ~1 666 h
--    d'étude. Le meilleur compte était à 11 858 XP (niveau 9) : onze paliers
--    sur vingt n'avaient jamais été atteints. Le sommet passe à 20 000 XP.
--    Chaque nouveau seuil est INFÉRIEUR OU ÉGAL à l'ancien, donc personne ne
--    redescend de niveau — certains montent d'un coup, ce qui est voulu.
--
-- 2. XP DE SÉRIE NON RÉTRACTABLE. Le total était indexé sur la série EN COURS :
--    10 XP par jour disparaissaient au moment où elle cassait, et le niveau
--    pouvait redescendre. 102 des 107 utilisateurs ayant déjà étudié ont une
--    série cassée aujourd'hui — presque tous ont donc subi ce retrait. On passe
--    à la MEILLEURE série jamais atteinte, qui ne décroît pas.
--
-- 3. SEUIL DE community_pillar. 50 messages de communauté demandés, alors que
--    le record tous utilisateurs confondus est de 2 : hors d'échelle. Passe à
--    10. Les autres badges non débloqués sont bien calibrés (176 h sur 250,
--    64 objectifs sur 75, série de 22 sur 30) et ne sont PAS touchés.
--
-- À exécuter manuellement dans le SQL Editor Supabase.
-- Idempotent : réexécutable sans effet de bord.
-- ================================================================

-- ----------------------------------------------------------------
-- 1. Nouvelle courbe (doit rester synchronisée avec lib/xp.js)
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.gamification_level_threshold(p_level integer)
RETURNS integer
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_catalog
AS $$
  SELECT (ARRAY[
    0, 200, 450, 800, 1250, 1800, 2450, 3200, 4050, 5000,
    6050, 7200, 8450, 9800, 11250, 12800, 14450, 16200,
    18050, 20000
  ])[GREATEST(1, LEAST(20, p_level))];
$$;
REVOKE ALL ON FUNCTION public.gamification_level_threshold(integer) FROM PUBLIC, anon, authenticated;

-- ----------------------------------------------------------------
-- 2. Meilleure série jamais atteinte — monotone par construction.
--    Les jours gelés (v29) comptent pour la continuité, exactement comme
--    dans computeBestStreak() côté client.
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.gamification_best_streak(p_user_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  WITH tz AS (
    SELECT COALESCE(public.gamification_timezone(p_user_id), 'Europe/Paris') AS name
  ),
  days AS (
    SELECT DISTINCT (s.started_at AT TIME ZONE tz.name)::date AS day
    FROM public.sessions s, tz
    WHERE s.user_id = p_user_id
    UNION
    SELECT f.used_on::date
    FROM public.streak_freeze_days f
    WHERE f.user_id = p_user_id
  ),
  grouped AS (
    SELECT day, day - (ROW_NUMBER() OVER (ORDER BY day))::integer AS grp
    FROM days
  )
  SELECT COALESCE(MAX(run), 0)::integer
  FROM (SELECT COUNT(*) AS run FROM grouped GROUP BY grp) r;
$$;
REVOKE ALL ON FUNCTION public.gamification_best_streak(uuid) FROM PUBLIC, anon, authenticated;

-- ----------------------------------------------------------------
-- 3. XP canonique — la série courante reste RENVOYÉE (célébrations de
--    paliers), mais n'entre plus dans le calcul du total.
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_gamification_levels(p_user_ids uuid[])
RETURNS TABLE(
  user_id uuid,
  total_xp bigint,
  level integer,
  title_key text,
  progress_xp bigint,
  range_xp integer,
  progress_pct integer,
  streak integer,
  badge_count integer,
  mission_xp bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_user_id uuid;
  v_study_xp bigint;
  v_objective_xp bigint;
  v_exam_xp bigint;
  v_badge_xp bigint;
  v_bonus_xp bigint;
  v_mission_xp bigint;
  v_streak integer;
  v_best_streak integer;
  v_level integer;
  v_total bigint;
  v_current_threshold integer;
  v_next_threshold integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  IF p_user_ids IS NULL OR cardinality(p_user_ids) = 0 THEN
    RETURN;
  END IF;
  IF cardinality(p_user_ids) > 100 THEN
    RAISE EXCEPTION 'A maximum of 100 users can be requested' USING ERRCODE = '22023';
  END IF;

  FOR v_user_id IN SELECT DISTINCT unnest(p_user_ids) LOOP
    CONTINUE WHEN NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = v_user_id);

    SELECT FLOOR(COALESCE(SUM(duration_seconds), 0) / 60.0)::bigint
    INTO v_study_xp FROM public.sessions WHERE sessions.user_id = v_user_id;
    SELECT (COUNT(*) FILTER (WHERE done) * 20)::bigint
    INTO v_objective_xp FROM public.objectives WHERE objectives.user_id = v_user_id;
    SELECT (COUNT(*) * 15)::bigint
    INTO v_exam_xp FROM public.exams WHERE exams.user_id = v_user_id;
    SELECT COUNT(*)::integer, (COUNT(*) * 50)::bigint
    INTO badge_count, v_badge_xp FROM public.user_badges WHERE user_badges.user_id = v_user_id;
    SELECT COALESCE(profiles.bonus_xp, 0)::bigint
    INTO v_bonus_xp FROM public.profiles WHERE profiles.id = v_user_id;
    SELECT COALESCE(SUM(xp), 0)::bigint
    INTO v_mission_xp FROM public.xp_ledger WHERE xp_ledger.user_id = v_user_id;

    v_streak := public.gamification_current_streak(v_user_id);
    v_best_streak := public.gamification_best_streak(v_user_id);
    v_total := COALESCE(v_study_xp, 0) + COALESCE(v_objective_xp, 0)
      + (v_best_streak * 10) + COALESCE(v_exam_xp, 0) + COALESCE(v_badge_xp, 0)
      + COALESCE(v_bonus_xp, 0) + COALESCE(v_mission_xp, 0);
    v_level := public.gamification_level_for_xp(v_total);
    v_current_threshold := public.gamification_level_threshold(v_level);
    v_next_threshold := CASE WHEN v_level < 20
      THEN public.gamification_level_threshold(v_level + 1)
      ELSE v_current_threshold + 1
    END;

    user_id := v_user_id;
    total_xp := v_total;
    level := v_level;
    title_key := 'xp.level' || v_level;
    progress_xp := v_total - v_current_threshold;
    range_xp := v_next_threshold - v_current_threshold;
    progress_pct := CASE WHEN v_level = 20 THEN 100 ELSE
      LEAST(100, ROUND((progress_xp::numeric / GREATEST(range_xp, 1)) * 100)::integer)
    END;
    streak := v_streak;
    mission_xp := COALESCE(v_mission_xp, 0);
    RETURN NEXT;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.get_gamification_levels(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_gamification_levels(uuid[]) TO authenticated;

-- ----------------------------------------------------------------
-- 4. Seuil community_pillar 50 → 10
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.award_badges_for_user(p_user_id uuid)
RETURNS text[]
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_timezone text := COALESCE(public.gamification_timezone(p_user_id), 'Europe/Paris');
  v_session_count integer := 0;
  v_total_hours numeric := 0;
  v_max_daily_hours numeric := 0;
  v_streak integer := 0;
  v_exam_count integer := 0;
  v_objective_count integer := 0;
  v_completed_count integer := 0;
  v_friend_count integer := 0;
  v_post_count integer := 0;
  v_reaction_count integer := 0;
  v_group_count integer := 0;
  v_community_count integer := 0;
  v_referral_count integer := 0;
  v_badges text[] := ARRAY[]::text[];
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_user_id) THEN
    RETURN v_badges;
  END IF;

  SELECT COUNT(*)::integer, COALESCE(SUM(duration_seconds), 0) / 3600.0
  INTO v_session_count, v_total_hours
  FROM public.sessions WHERE user_id = p_user_id;

  SELECT COALESCE(MAX(day_seconds), 0) / 3600.0
  INTO v_max_daily_hours
  FROM (
    SELECT SUM(duration_seconds) AS day_seconds
    FROM public.sessions
    WHERE user_id = p_user_id
    GROUP BY (started_at AT TIME ZONE v_timezone)::date
  ) daily;

  v_streak := public.gamification_current_streak(p_user_id);
  SELECT COUNT(*)::integer INTO v_exam_count FROM public.exams WHERE user_id = p_user_id;
  SELECT COUNT(*)::integer, COUNT(*) FILTER (WHERE done)::integer
  INTO v_objective_count, v_completed_count
  FROM public.objectives WHERE user_id = p_user_id;
  SELECT COUNT(*)::integer INTO v_post_count FROM public.posts WHERE user_id = p_user_id;
  SELECT (
    (SELECT COUNT(*) FROM public.likes WHERE user_id = p_user_id)
    + (SELECT COUNT(*) FROM public.comments WHERE user_id = p_user_id)
  )::integer INTO v_reaction_count;
  SELECT COUNT(*)::integer INTO v_group_count FROM public.group_members WHERE user_id = p_user_id;
  SELECT COUNT(*)::integer INTO v_community_count FROM public.community_messages WHERE user_id = p_user_id;
  SELECT COUNT(*)::integer INTO v_referral_count FROM public.referrals WHERE referrer_id = p_user_id;
  SELECT COUNT(*)::integer INTO v_friend_count
  FROM public.friendships
  WHERE status = 'accepted' AND (requester = p_user_id OR addressee = p_user_id);

  IF v_session_count >= 1 THEN v_badges := array_append(v_badges, 'first_session'); END IF;
  IF v_streak >= 3 THEN v_badges := array_append(v_badges, 'streak_3'); END IF;
  IF v_streak >= 7 THEN v_badges := array_append(v_badges, 'streak_7'); END IF;
  IF v_streak >= 14 THEN v_badges := array_append(v_badges, 'streak_14'); END IF;
  IF v_streak >= 30 THEN v_badges := array_append(v_badges, 'streak_30'); END IF;
  IF v_total_hours >= 10 THEN v_badges := array_append(v_badges, 'hours_10'); END IF;
  IF v_total_hours >= 50 THEN v_badges := array_append(v_badges, 'hours_50'); END IF;
  IF v_total_hours >= 100 THEN v_badges := array_append(v_badges, 'hours_100'); END IF;
  IF v_total_hours >= 250 THEN v_badges := array_append(v_badges, 'hours_250'); END IF;
  IF v_max_daily_hours >= 6 THEN v_badges := array_append(v_badges, 'marathon_day'); END IF;
  IF v_objective_count >= 10 THEN v_badges := array_append(v_badges, 'planner'); END IF;
  IF v_completed_count >= 25 THEN v_badges := array_append(v_badges, 'strategist'); END IF;
  IF v_completed_count >= 75 THEN v_badges := array_append(v_badges, 'blocus_architect'); END IF;
  IF v_exam_count >= 1 THEN v_badges := array_append(v_badges, 'first_exam'); END IF;
  IF v_post_count >= 1 THEN v_badges := array_append(v_badges, 'first_post'); END IF;
  IF v_post_count >= 10 THEN v_badges := array_append(v_badges, 'influencer'); END IF;
  IF v_friend_count >= 1 THEN v_badges := array_append(v_badges, 'first_friend'); END IF;
  IF v_friend_count >= 20 THEN v_badges := array_append(v_badges, 'social'); END IF;
  IF v_reaction_count >= 25 THEN v_badges := array_append(v_badges, 'motivator'); END IF;
  IF v_group_count >= 1 THEN v_badges := array_append(v_badges, 'team_spirit'); END IF;
  IF v_community_count >= 10 THEN v_badges := array_append(v_badges, 'community_pillar'); END IF;
  IF v_referral_count >= 5 THEN v_badges := array_append(v_badges, 'referrer'); END IF;

  INSERT INTO public.user_badges(user_id, badge_id)
  SELECT p_user_id, badge_id FROM unnest(v_badges) AS badge_id
  ON CONFLICT (user_id, badge_id) DO NOTHING;

  SELECT COALESCE(array_agg(ub.badge_id ORDER BY ub.earned_at), ARRAY[]::text[])
  INTO v_badges
  FROM public.user_badges ub
  WHERE ub.user_id = p_user_id;

  RETURN v_badges;
END;
$$;

REVOKE ALL ON FUNCTION public.award_badges_for_user(uuid) FROM PUBLIC, anon, authenticated;

-- ----------------------------------------------------------------
-- 5. Rattrapage : attribue les badges désormais atteignables et
--    recalcule les niveaux pour les comptes ayant déjà étudié.
-- ----------------------------------------------------------------
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT DISTINCT user_id FROM public.sessions LOOP
    PERFORM public.award_badges_for_user(r.user_id);
  END LOOP;
END $$;
