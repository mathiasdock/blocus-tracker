-- ================================================================
--  Blocus Tracker — v46 : compteurs agrégés, et suppression RÉELLE
--                          des publications expirées
--
--  Migration manuelle : à exécuter une fois, après v45.
--
--  LE PROBLÈME QUE v45 N'AVAIT RÉSOLU QU'À MOITIÉ
--  v45 vidait `image_url` et `caption` à 24 h mais GARDAIT la ligne, pour
--  que l'XP et les badges continuent de compter les publications. Sauf que
--  la ligne restante contient encore `user_id` (clé étrangère vers
--  auth.users), `created_at` et `visibility` : « ce compte identifiable a
--  publié à cette heure précise ». C'est une donnée personnelle, pas une
--  statistique anonyme, et la politique de confidentialité n'avait pas le
--  droit de la présenter autrement.
--
--  CE QUE FAIT CETTE MIGRATION
--  On sépare enfin les deux besoins :
--    • le CONTENU (photo, légende, ligne, réactions) → supprimé à 24 h ;
--    • le CHIFFRE dont dépendent les badges → conservé dans un compteur
--      agrégé, sans date, sans contenu, sans lien vers une publication.
--
--  POURQUOI DEUX COMPTEURS ET PAS UN
--  Supprimer une publication emporte en cascade ses `likes` et `comments`.
--  Or le badge `motivator` (25 réactions) se calcule sur ces tables. Sans
--  compteur de réactions, il deviendrait quasi inatteignable — on ne peut
--  pas accumuler 25 réactions sur des publications qui vivent un jour.
--
--  L'XP NE PEUT PAS BAISSER — vérifié, pas supposé :
--    1. `get_gamification_levels` (source d'autorité) ne compte PAS les
--       publications : XP = minutes + objectifs + série + examens
--       + badges×50 + bonus + missions. Les badges viennent de
--       `user_badges`, table persistante.
--    2. `award_badges_for_user` fait INSERT … ON CONFLICT DO NOTHING et ne
--       SUPPRIME jamais : un badge obtenu l'est définitivement.
--    3. Le calcul de repli côté client (lib/userLevels.js) fait l'UNION des
--       badges persistés et des badges recalculés — il ne peut donc pas
--       retirer un badge déjà acquis.
--  Le seul effet réel serait la perte de PROGRESSION vers un badge non
--  encore obtenu : c'est exactement ce que les compteurs empêchent.
--
--  Aucun déclencheur AFTER DELETE n'existe sur posts/likes/comments
--  (vérifié en base) : supprimer une ligne ne réveille aucune logique de
--  gamification.
--
-- ⚠️ DEJA APPLIQUEE EN PRODUCTION le 07/09/2026 (via MCP Supabase, projet
--    xtpsavwwhkeiwfkidwcu). Trace ecrite, pas travail restant.
--    Reprise verifiee : 246 lignes, 26 publications = 26 au compteur,
--    75 reactions = 75 au compteur, 0 ecart.
-- ================================================================

BEGIN;

-- ----------------------------------------------------------------
-- 1. Le compteur agrégé
--
--    Une ligne par compte, deux entiers, aucune date d'événement, aucun
--    lien vers une publication précise. C'est le strict minimum pour que
--    les badges continuent de fonctionner.
--
--    « Lifetime » au sens propre : on n'décrémente JAMAIS. Une publication
--    supprimée par son auteur ou expirée reste comptée. C'est volontaire —
--    un compteur qui baisse permettrait aussi de reperdre un badge, et
--    rendrait le total dépendant de la rétention, ce qu'on veut justement
--    éviter.
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.user_activity_totals (
  user_id            uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  lifetime_posts     integer NOT NULL DEFAULT 0 CHECK (lifetime_posts >= 0),
  lifetime_reactions integer NOT NULL DEFAULT 0 CHECK (lifetime_reactions >= 0),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.user_activity_totals IS
  'Compteurs agrégés (publications, réactions) servant uniquement aux badges. Aucune date d''événement, aucun contenu, aucun lien vers une publication. Disparaît avec le compte.';

-- ----------------------------------------------------------------
-- 2. RLS : chacun ne lit que SON compteur
--
--    Le nombre total de publications d'une personne n'est aujourd'hui
--    déductible par personne d'autre (le fil ne montre que 24 h). Publier
--    ce compteur à tous les comptes connectés créerait une divulgation
--    NOUVELLE. On ne le fait pas : lib/userLevels.js ne le lit que pour
--    soi-même, et s'appuie sur `user_badges` pour les autres.
--
--    Écriture : personne. Seuls les déclencheurs (SECURITY DEFINER) et
--    service_role alimentent la table. Un compteur que le client pourrait
--    incrémenter serait un badge gratuit.
-- ----------------------------------------------------------------
ALTER TABLE public.user_activity_totals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS uat_select_own ON public.user_activity_totals;
CREATE POLICY uat_select_own ON public.user_activity_totals
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

REVOKE ALL PRIVILEGES ON TABLE public.user_activity_totals FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.user_activity_totals TO authenticated;
GRANT ALL ON public.user_activity_totals TO service_role;

-- ----------------------------------------------------------------
-- 3. Incrémentation à la création — jamais à la suppression
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.bump_activity_total()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
BEGIN
  IF TG_ARGV[0] = 'posts' THEN
    INSERT INTO public.user_activity_totals (user_id, lifetime_posts)
    VALUES (NEW.user_id, 1)
    ON CONFLICT (user_id) DO UPDATE
      SET lifetime_posts = public.user_activity_totals.lifetime_posts + 1,
          updated_at = now();
  ELSE
    INSERT INTO public.user_activity_totals (user_id, lifetime_reactions)
    VALUES (NEW.user_id, 1)
    ON CONFLICT (user_id) DO UPDATE
      SET lifetime_reactions = public.user_activity_totals.lifetime_reactions + 1,
          updated_at = now();
  END IF;
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.bump_activity_total() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_bump_posts_total ON public.posts;
CREATE TRIGGER trg_bump_posts_total
  AFTER INSERT ON public.posts
  FOR EACH ROW EXECUTE FUNCTION public.bump_activity_total('posts');

DROP TRIGGER IF EXISTS trg_bump_likes_total ON public.likes;
CREATE TRIGGER trg_bump_likes_total
  AFTER INSERT ON public.likes
  FOR EACH ROW EXECUTE FUNCTION public.bump_activity_total('reactions');

DROP TRIGGER IF EXISTS trg_bump_comments_total ON public.comments;
CREATE TRIGGER trg_bump_comments_total
  AFTER INSERT ON public.comments
  FOR EACH ROW EXECUTE FUNCTION public.bump_activity_total('reactions');

-- ----------------------------------------------------------------
-- 4. Reprise de l'existant
--
--    Rien n'a encore été supprimé : le comptage actuel EST le total à vie.
--    GREATEST(...) rend la reprise rejouable — un second passage ne peut
--    que maintenir ou relever le compteur, jamais l'abaisser.
-- ----------------------------------------------------------------
INSERT INTO public.user_activity_totals (user_id, lifetime_posts, lifetime_reactions)
SELECT
  p.id,
  (SELECT COUNT(*) FROM public.posts    WHERE user_id = p.id),
  (SELECT COUNT(*) FROM public.likes    WHERE user_id = p.id)
  + (SELECT COUNT(*) FROM public.comments WHERE user_id = p.id)
FROM public.profiles p
ON CONFLICT (user_id) DO UPDATE SET
  lifetime_posts     = GREATEST(public.user_activity_totals.lifetime_posts,     EXCLUDED.lifetime_posts),
  lifetime_reactions = GREATEST(public.user_activity_totals.lifetime_reactions, EXCLUDED.lifetime_reactions),
  updated_at         = now();

-- ----------------------------------------------------------------
-- 5. Les badges lisent le compteur, plus les lignes vivantes
--
--    Seules DEUX lignes changent par rapport à la version en production :
--    la source de v_post_count et celle de v_reaction_count. Tout le reste
--    est identique, volontairement — ce n'est pas le moment de retoucher
--    l'équilibrage des badges.
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.award_badges_for_user(p_user_id uuid)
RETURNS text[]
LANGUAGE plpgsql
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

  -- ← CHANGÉ : compteur à vie, et non les publications encore en ligne.
  SELECT COALESCE((SELECT lifetime_posts FROM public.user_activity_totals WHERE user_id = p_user_id), 0)
  INTO v_post_count;
  -- ← CHANGÉ : idem pour les réactions, qui disparaissent avec la publication.
  SELECT COALESCE((SELECT lifetime_reactions FROM public.user_activity_totals WHERE user_id = p_user_id), 0)
  INTO v_reaction_count;

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
-- 6. L'expiration supprime maintenant la LIGNE
--
--    Remplace expire_old_posts() de v45, qui se contentait de vider les
--    colonnes. La cascade emporte likes et commentaires de la publication ;
--    les compteurs de la section 1 les ont déjà mis à l'abri.
--
--    Le FICHIER image est supprimé AVANT, par pages/api/cron/purge-posts.js
--    (SQL n'a pas accès au stockage). Cette fonction reste le filet côté
--    base si le cron venait à ne pas passer.
-- ----------------------------------------------------------------
DROP FUNCTION IF EXISTS public.expire_old_posts();

CREATE OR REPLACE FUNCTION public.delete_expired_posts()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_deleted integer;
BEGIN
  WITH gone AS (
    DELETE FROM public.posts
    WHERE created_at < now() - interval '24 hours'
    RETURNING 1
  )
  SELECT count(*) INTO v_deleted FROM gone;
  RETURN v_deleted;
END;
$$;

REVOKE ALL  ON FUNCTION public.delete_expired_posts() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_expired_posts() TO service_role;

COMMIT;
