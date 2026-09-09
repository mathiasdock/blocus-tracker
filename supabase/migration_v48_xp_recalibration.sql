-- ================================================================
-- migration_v48_xp_recalibration.sql
--
-- Recalibrage de l'économie d'XP. Quatre changements, aucun destructif,
-- aucun compte ne redescend de niveau (vérifié sur les 132 comptes actifs
-- avant application : 31 montent d'un niveau, 0 en perdent).
--
-- Constat de départ, mesuré en base :
--   • Un parrainage valait 300 XP, 600 les jours de mission — soit dix heures
--     d'étude pour une invitation. Deux comptes étaient niveau 4 et niveau 6
--     SANS avoir jamais étudié une minute.
--   • Une journée de missions parfaite valait 390 XP, soit 6 h 30 d'étude
--     EN PLUS des heures réellement faites. Les missions de durée recomptaient
--     des minutes déjà créditées à 1 XP/min.
--   • Les 22 badges valaient tous 50 XP : « Première session » (94 % des
--     comptes l'ont) payait autant que « 250 heures » (personne ne l'a).
--
-- ── Ce qui peut baisser et ce qui ne peut pas ───────────────
-- Asymétrie décisive : les missions (xp_ledger) et les parrainages
-- (profiles.bonus_xp) sont ENREGISTRÉS avec leur montant figé — les baisser
-- n'affecte que l'avenir. Les badges sont RECALCULÉS à chaque affichage —
-- baisser un badge reprendrait du XP déjà acquis. D'où le plancher à 50 XP
-- sur les badges : ils ne peuvent que monter.
--
-- Appliqué par Claude via le MCP Supabase (règle 5 de CLAUDE.md).
-- Idempotent : réexécutable sans effet de bord.
-- ================================================================

-- ----------------------------------------------------------------
-- 1. Courbe étendue à 30 niveaux
--
-- Les vingt premiers seuils sont IDENTIQUES : personne ne bouge. Dix paliers
-- s'ajoutent au-dessus, l'écart continuant de grandir de 100 XP par marche
-- comme sur toute la courbe existante — une seule règle, pas deux régimes.
-- Le sommet passe de 20 000 à 45 000 XP. Le meilleur compte est à 17 605 XP
-- après le rebarèmage des badges, donc le nouveau sommet reste lointain.
-- DOIT rester synchronisé avec LEVELS dans lib/xp.js.
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
    18050, 20000, 22050, 24200, 26450, 28800, 31250,
    33800, 36450, 39200, 42050, 45000
  ])[GREATEST(1, LEAST(30, p_level))];
$$;
REVOKE ALL ON FUNCTION public.gamification_level_threshold(integer) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.gamification_level_for_xp(p_xp bigint)
RETURNS integer
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_catalog
AS $$
  SELECT COALESCE(MAX(level), 1)
  FROM generate_series(1, 30) AS level
  WHERE public.gamification_level_threshold(level) <= GREATEST(p_xp, 0);
$$;
REVOKE ALL ON FUNCTION public.gamification_level_for_xp(bigint) FROM PUBLIC, anon, authenticated;

-- ----------------------------------------------------------------
-- 2. XP par badge, selon l'effort qu'il demande
--
-- Le palier suit l'EFFORT, pas le taux d'obtention observé. Les deux se
-- ressemblent souvent mais pas toujours : « rejoindre un groupe » ne concerne
-- que 6 % des comptes alors que ça prend trente secondes, et « 6 h en une
-- journée » en concerne la moitié alors que c'est une vraie journée de blocus.
-- Payer la rareté aurait décoré le clic et banalisé l'effort.
--
-- Chaque famille double à chaque marche :
--   heures    10 h → 125,  50 h → 300,  100 h → 600,  250 h → 1200
--   séries     3 j → 125,   7 j → 300,   14 j → 600,   30 j → 1200
--   objectifs 10 créés → 125, 25 finis → 300, 75 finis → 1200
--
-- Le repli est à 50 (l'ancienne valeur unique) : un identifiant inconnu ne
-- doit jamais valoir 0, sinon un badge ajouté au client mais pas ici ferait
-- silencieusement baisser un total.
-- DOIT rester synchronisé avec BADGE_TIER_XP (lib/badges.js) et
-- BADGE_RARITY (lib/badgeArt.js).
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.gamification_badge_xp(p_badge_id text)
RETURNS integer
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_catalog
AS $$
  SELECT CASE p_badge_id
    -- Découverte : un premier geste (50 XP, valeur historique inchangée)
    WHEN 'first_session'    THEN 50
    WHEN 'first_friend'     THEN 50
    WHEN 'first_exam'       THEN 50
    WHEN 'first_post'       THEN 50
    WHEN 'team_spirit'      THEN 50
    -- Commun : un premier vrai jalon
    WHEN 'hours_10'         THEN 125
    WHEN 'marathon_day'     THEN 125
    WHEN 'streak_3'         THEN 125
    WHEN 'planner'          THEN 125
    WHEN 'motivator'        THEN 125
    -- Rare : un engagement tenu dans la durée
    WHEN 'hours_50'         THEN 300
    WHEN 'streak_7'         THEN 300
    WHEN 'strategist'       THEN 300
    WHEN 'influencer'       THEN 300
    WHEN 'community_pillar' THEN 300
    -- Épique : rare et mérité
    WHEN 'hours_100'        THEN 600
    WHEN 'streak_14'        THEN 600
    WHEN 'social'           THEN 600
    WHEN 'referrer'         THEN 600
    -- Légendaire : le sommet, personne ne les a encore
    WHEN 'hours_250'        THEN 1200
    WHEN 'streak_30'        THEN 1200
    WHEN 'blocus_architect' THEN 1200
    ELSE 50
  END;
$$;
REVOKE ALL ON FUNCTION public.gamification_badge_xp(text) FROM PUBLIC, anon, authenticated;

-- ----------------------------------------------------------------
-- 3. Missions : plafonner la journée
--
-- Aucune mission ne dépasse 50 XP, une journée parfaite plafonne à 160 (au
-- lieu de 390). Les missions de DURÉE restent les moins payées : elles
-- recomptent des minutes déjà créditées à 1 XP/min, les payer autant que le
-- reste revenait à verser deux fois le même salaire.
--
-- Parrainage à 300 XP, tous les jours. C'est de loin la plus grosse
-- récompense de l'app — cinq heures de blocus — et c'est un choix assumé :
-- faire venir quelqu'un est ce qui compte le plus pour le produit aujourd'hui.
-- L'ancien système donnait 300 les jours ordinaires et 600 les jours de
-- mission, alors que la carte annonçait 600 dans les deux cas. Un seul
-- montant, celui qui est affiché.
--
-- Baisser ces valeurs ne reprend rien : daily_mission_assignments et
-- xp_ledger figent le montant au moment de l'attribution.
-- DOIT rester synchronisé avec MISSION_POOL (lib/xp.js).
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.gamification_mission_xp(p_mission_id text)
RETURNS integer
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_catalog
AS $$
  SELECT CASE p_mission_id
    WHEN 'm_25m' THEN 15
    WHEN 'm_1h' THEN 25
    WHEN 'm_2h' THEN 35
    WHEN 'm_3h' THEN 45
    WHEN 'm_s25' THEN 20
    WHEN 'm_s50' THEN 30
    WHEN 'm_s90' THEN 40
    WHEN 'm_two_sessions' THEN 25
    WHEN 'm_2courses' THEN 25
    WHEN 'm_obj1' THEN 30
    WHEN 'm_obj2' THEN 40
    WHEN 'm_newobj' THEN 25
    WHEN 'm_streak' THEN 30
    WHEN 'm_noon' THEN 35
    WHEN 'm_note' THEN 25
    WHEN 'm_referral' THEN 300
    ELSE 0
  END;
$$;
REVOKE ALL ON FUNCTION public.gamification_mission_xp(text) FROM PUBLIC, anon, authenticated;

-- ----------------------------------------------------------------
-- 4. Parrainage : un seul montant
--
-- Le bonus « +300 si la mission du jour est active » disparaît. Les
-- parrainages déjà crédités dans profiles.bonus_xp ne sont PAS retouchés :
-- reprendre du XP acquis est la seule chose que ce système n'a jamais faite,
-- et treize comptes ne valent pas de casser cette garantie.
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.apply_referral(p_code text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_referrer_id uuid;
  v_already uuid;
  v_timezone text;
  v_today text;
  v_xp integer := public.gamification_mission_xp('m_referral');
  v_mission boolean := false;
BEGIN
  IF v_uid IS NULL THEN
    RETURN json_build_object('ok', false, 'error', 'not_authenticated');
  END IF;
  IF p_code IS NULL OR length(trim(p_code)) = 0 THEN
    RETURN json_build_object('ok', false, 'error', 'no_code');
  END IF;

  SELECT id INTO v_referrer_id
  FROM public.profiles
  WHERE upper(referral_code) = upper(trim(p_code));

  IF v_referrer_id IS NULL THEN
    RETURN json_build_object('ok', false, 'error', 'invalid_code');
  END IF;
  IF v_referrer_id = v_uid THEN
    RETURN json_build_object('ok', false, 'error', 'self_referral');
  END IF;

  SELECT referred_by INTO v_already
  FROM public.profiles WHERE id = v_uid FOR UPDATE;
  IF v_already IS NOT NULL THEN
    RETURN json_build_object('ok', false, 'error', 'already_referred');
  END IF;

  -- Toujours renvoyé (la carte de mission s'en sert pour se marquer faite),
  -- mais il ne change plus le montant.
  v_timezone := COALESCE(public.gamification_timezone(v_referrer_id), 'Europe/Paris');
  v_today := to_char(now() AT TIME ZONE v_timezone, 'YYYY-MM-DD');
  v_mission := public.referral_mission_active(v_referrer_id, v_today);

  PERFORM set_config('app.gamification_internal', 'on', true);
  UPDATE public.profiles SET referred_by = v_referrer_id WHERE id = v_uid;
  UPDATE public.profiles SET bonus_xp = COALESCE(bonus_xp, 0) + v_xp
  WHERE id = v_referrer_id;

  INSERT INTO public.referrals(referrer_id, referred_id, xp_awarded, mission_bonus)
  VALUES (v_referrer_id, v_uid, v_xp, v_mission);

  RETURN json_build_object('ok', true, 'xp', v_xp, 'mission_bonus', v_mission);
END;
$$;

-- ----------------------------------------------------------------
-- 5. XP canonique : somme des badges au lieu du forfait, et 30 niveaux
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
    SELECT COUNT(*)::integer, COALESCE(SUM(public.gamification_badge_xp(badge_id)), 0)::bigint
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
    v_next_threshold := CASE WHEN v_level < 30
      THEN public.gamification_level_threshold(v_level + 1)
      ELSE v_current_threshold + 1
    END;

    user_id := v_user_id;
    total_xp := v_total;
    level := v_level;
    title_key := 'xp.level' || v_level;
    progress_xp := v_total - v_current_threshold;
    range_xp := v_next_threshold - v_current_threshold;
    progress_pct := CASE WHEN v_level = 30 THEN 100 ELSE
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
