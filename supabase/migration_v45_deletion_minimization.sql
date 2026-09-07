-- ================================================================
--  Blocus Tracker — v45 : « supprimer mon compte » supprime vraiment
--
--  Migration manuelle : à exécuter une fois dans l'éditeur SQL Supabase,
--  après v44.
--
--  ⚠️ CETTE MIGRATION EFFACE DES DONNÉES — c'est son objet.
--     Lis la section 2 avant de l'exécuter.
--
--  CE QUI NE VA PAS AUJOURD'HUI
--  `self_delete_user()` recopie, AVANT de supprimer le compte, le pseudo, le
--  prénom, le NOM et l'établissement dans `deleted_accounts` — table conservée
--  sans limite de durée. Autrement dit : quelqu'un demande l'effacement de son
--  compte, et son identité est archivée à cette occasion. La politique de
--  confidentialité, elle, promet « lorsque tu supprimes ton compte, elles sont
--  effacées ». Le code contredisait le texte ; c'est le code qui a tort.
--
--  CE QU'ON GARDE, ET POURQUOI
--  Un journal de suppression reste utile (comprendre l'attrition, retracer une
--  suppression contestée, distinguer un départ volontaire d'une exclusion
--  administrative). Mais il n'a besoin d'AUCUNE donnée identifiante :
--    • la DATE de la suppression,
--    • QUI l'a demandée (la personne elle-même, ou un admin),
--    • l'ANCIENNETÉ du compte, en mois — assez pour l'analyse, insuffisant
--      pour reconnaître quelqu'un.
--  L'identifiant technique disparaît aussi : conservé, il resterait une donnée
--  personnelle pseudonymisée, réidentifiable en la recoupant.
--
-- ⚠️ DEJA APPLIQUEE EN PRODUCTION le 07/09/2026 (via MCP Supabase, projet
--    xtpsavwwhkeiwfkidwcu). Ce fichier est conserve comme trace ecrite, pas
--    comme travail restant. Il est re-executable sans effet de bord.
--    Applique en DEUX temps : v45a (structure + nouvelles fonctions,
--    non destructif), puis v45b (anonymisation des 27 lignes
--    historiques) apres accord explicite de Mathias.
--    Resultat verifie : 27 lignes conservees, 0 encore identifiante.
-- ================================================================

BEGIN;

-- ----------------------------------------------------------------
-- 0. SCHEMA REEL DE `deleted_accounts` — verifie en base le 07/09/2026
--
--    ATTENTION : la table ne correspond PAS a ce que laissait croire
--    migration_v6_security.sql. Elle a ete creee hors depot et a derive.
--      Colonnes reelles : id, original_id, pseudo, first_name, last_name,
--                         university, study_field, study_year, deleted_at
--      PAS de colonne `user_id`, PAS de colonne `deleted_by`.
--    Les fonctions en production stockent donc AUSSI la filiere et l'annee
--    d'etudes — soit encore plus de donnees identifiantes que prevu.
--
--    Consequence : on ne peut pas savoir, pour les lignes deja ecrites, si la
--    suppression etait volontaire ou administrative (rien ne l'enregistrait).
--    `deleted_kind` reste donc NULL pour l'historique, et n'est rempli que
--    pour les suppressions a venir. Inventer la valeur serait pire que
--    l'ignorer.
-- ----------------------------------------------------------------

ALTER TABLE public.deleted_accounts
  ADD COLUMN IF NOT EXISTS deleted_kind       text,
  ADD COLUMN IF NOT EXISTS account_age_months integer;

COMMENT ON TABLE public.deleted_accounts IS
  'Journal anonyme des suppressions de comptes : date, origine (self/admin) et anciennete en mois. Ne doit contenir AUCUNE donnee identifiante — voir migration v45.';

-- Toutes les colonnes identifiantes sont deja NULLABLE (verifie), mais on le
-- garantit explicitement : la migration doit rester rejouable telle quelle.
ALTER TABLE public.deleted_accounts ALTER COLUMN original_id  DROP NOT NULL;
ALTER TABLE public.deleted_accounts ALTER COLUMN pseudo       DROP NOT NULL;
ALTER TABLE public.deleted_accounts ALTER COLUMN first_name   DROP NOT NULL;
ALTER TABLE public.deleted_accounts ALTER COLUMN last_name    DROP NOT NULL;
ALTER TABLE public.deleted_accounts ALTER COLUMN university   DROP NOT NULL;
ALTER TABLE public.deleted_accounts ALTER COLUMN study_field  DROP NOT NULL;
ALTER TABLE public.deleted_accounts ALTER COLUMN study_year   DROP NOT NULL;

-- ----------------------------------------------------------------
-- 1. Anonymisation de l'historique deja ecrit
--
--    27 lignes au 07/09/2026, TOUTES porteuses d'une identite : pseudo,
--    prenom, nom, etablissement, filiere, annee. Ce sont des personnes qui
--    ont demande la suppression de leur compte ; conserver leur nom va
--    exactement contre ce qu'elles ont demande.
--
--    On garde la ligne (le decompte des departs reste utile) et on vide ce
--    qui identifie. Aucune clause EXCEPTION ici : si une colonne manquait,
--    la migration DOIT echouer bruyamment plutot que de ne rien faire en
--    silence en laissant croire que le menage a eu lieu.
-- ----------------------------------------------------------------
UPDATE public.deleted_accounts
SET
  original_id  = NULL,
  pseudo       = NULL,
  first_name   = NULL,
  last_name    = NULL,
  university   = NULL,
  study_field  = NULL,
  study_year   = NULL
WHERE original_id IS NOT NULL
   OR pseudo      IS NOT NULL
   OR first_name  IS NOT NULL
   OR last_name   IS NOT NULL
   OR university  IS NOT NULL
   OR study_field IS NOT NULL
   OR study_year  IS NOT NULL;

-- Les colonnes identifiantes restent en place mais vides : les supprimer
-- casserait toute requete admin encore ecrite dessus. Elles ne seront plus
-- jamais alimentees (voir sections 2 et 3).

-- ----------------------------------------------------------------
-- 2. Suppression volontaire — plus aucune identite recopiee
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.self_delete_user()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_age integer;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT GREATEST(0, (EXTRACT(EPOCH FROM (now() - created_at)) / 2629800)::int)
  INTO v_age
  FROM public.profiles WHERE id = v_uid;

  INSERT INTO public.deleted_accounts (deleted_kind, account_age_months)
  VALUES ('self', v_age);

  -- La cascade sur auth.users emporte profil, sessions, objectifs, messages,
  -- amities, XP, parrainages, preferences vie privee, badges… Les FICHIERS,
  -- eux, ne sont PAS dans cette cascade : storage.objects n'a aucune cle
  -- etrangere vers auth.users (verifie en base). Ils sont effaces juste
  -- avant, par pages/api/account/delete.js.
  DELETE FROM auth.users WHERE id = v_uid;
END;
$$;

REVOKE ALL  ON FUNCTION public.self_delete_user() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.self_delete_user() TO authenticated, service_role;

-- ----------------------------------------------------------------
-- 3. Suppression par un admin — meme regle
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_delete_user(target UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_age integer;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = TRUE
  ) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  IF target = auth.uid() THEN
    RAISE EXCEPTION 'Use self_delete_user() to delete your own account';
  END IF;

  SELECT GREATEST(0, (EXTRACT(EPOCH FROM (now() - created_at)) / 2629800)::int)
  INTO v_age
  FROM public.profiles WHERE id = target;

  INSERT INTO public.deleted_accounts (deleted_kind, account_age_months)
  VALUES ('admin', v_age);

  DELETE FROM auth.users WHERE id = target;
END;
$$;

REVOKE ALL  ON FUNCTION public.admin_delete_user(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_delete_user(UUID) TO authenticated, service_role;

-- ----------------------------------------------------------------
-- ⚠️ SECTION 4 : SUPERSÉDÉE PAR migration_v46_post_lifetime_totals.sql
--    expire_old_posts() se contentait de vider image_url et caption en
--    gardant la ligne — laquelle contient encore user_id et created_at,
--    donc une donnée personnelle. v46 la remplace par
--    delete_expired_posts(), qui supprime la ligne, et déplace le
--    comptage des badges dans user_activity_totals. Cette section est
--    conservée pour l'histoire ; ne la ré-exécute PAS seule.
-- ----------------------------------------------------------------
-- 4. Rétention des photos du feed — la règle des 24 h, appliquée
--
--    LE PROBLÈME
--    Le texte annonce des photos « visibles 24 h ». En base, la ligne `posts`
--    restait indéfiniment, image comprise : c'est l'affichage qui la masquait.
--    Une donnée présentée comme éphémère et conservée à vie n'est pas
--    éphémère — et l'ancien outil admin parlait de 48 h, ce qui faisait une
--    troisième durée en circulation.
--
--    POURQUOI ON N'EFFACE PAS LA LIGNE
--    `posts` sert de COMPTEUR : l'XP et les badges (`first_post`,
--    `influencer` à 10 publications) sont recalculés à partir du nombre de
--    lignes (lib/userLevels.js, lib/badges.js). Supprimer les lignes ferait
--    silencieusement baisser le niveau de tout le monde et rendrait
--    `influencer` inatteignable — on ne peut pas avoir 10 publications
--    vivantes en même temps quand elles durent 24 h.
--
--    CE QU'ON FAIT DONC
--    On efface le CONTENU (la photo et sa légende) et on garde la ligne nue
--    comme compteur. C'est exactement la minimisation : plus de donnée
--    personnelle passé 24 h, aucune régression produit.
--    Le FICHIER image, lui, est supprimé par pages/api/cron/purge-posts.js,
--    appelé chaque heure par le cron Vercel — le SQL n'a pas accès au
--    stockage. Cette fonction reste le filet côté base.
-- ----------------------------------------------------------------

-- `image_url` était NOT NULL : il faut pouvoir le vider.
ALTER TABLE public.posts ALTER COLUMN image_url DROP NOT NULL;

CREATE OR REPLACE FUNCTION public.expire_old_posts()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_expired integer;
BEGIN
  WITH gone AS (
    UPDATE public.posts
    SET image_url = NULL, caption = NULL
    WHERE created_at < now() - interval '24 hours'
      AND (image_url IS NOT NULL OR caption IS NOT NULL)
    RETURNING 1
  )
  SELECT count(*) INTO v_expired FROM gone;
  RETURN v_expired;
END;
$$;

REVOKE ALL  ON FUNCTION public.expire_old_posts() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.expire_old_posts() TO service_role;

COMMIT;
