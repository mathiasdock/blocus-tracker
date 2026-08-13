-- ================================================================
-- Blocus Tracker - v43 : la fiche profil naît avec le compte
--
-- Migration manuelle : à exécuter une fois après v42.
--
-- PROBLÈME CORRIGÉ
-- L'inscription créait le compte Auth, puis la ligne `profiles` dans un
-- SECOND appel. Si ce second appel échouait (pseudo déjà pris, réseau coupé,
-- onglet fermé), le compte restait sans fiche : la personne pouvait se
-- connecter et lancer le chrono, mais restait invisible dans l'admin, le
-- classement et les communautés. Constat du 2026-08-13 : 272 comptes pour
-- seulement 239 fiches, soit 33 comptes fantômes dont 7 avec des sessions.
--
-- CORRECTIF
-- Un trigger AFTER INSERT sur auth.users crée la fiche DANS LA MÊME
-- TRANSACTION que le compte. Il devient donc impossible d'avoir l'un sans
-- l'autre : soit les deux existent, soit l'inscription est annulée.
--
-- COMPATIBILITÉ AVEC LES CLIENTS EN CACHE (important — l'app est une PWA)
-- Le trigger ne fait RIEN si le client n'a pas envoyé de pseudo dans les
-- métadonnées. Un navigateur encore sur l'ancien code crée lui-même la fiche
-- juste après ; une ligne insérée ici la ferait échouer sur la clé primaire.
-- Cette migration est donc sûre à exécuter avant OU après le déploiement,
-- dans n'importe quel ordre.
-- ================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.create_profile_for_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_meta   jsonb := coalesce(NEW.raw_user_meta_data, '{}'::jsonb);
  v_pseudo text  := nullif(btrim(v_meta ->> 'pseudo'), '');
BEGIN
  -- Pas de pseudo = client sur l'ancien code (ou compte créé depuis le
  -- dashboard Supabase) : on laisse le client créer la fiche comme avant.
  IF v_pseudo IS NULL THEN
    RETURN NEW;
  END IF;

  -- ON CONFLICT (id) : le client à jour fait ensuite un upsert sur la même
  -- ligne. Les deux chemins doivent pouvoir coexister sans erreur.
  --
  -- Un pseudo déjà pris fait lever le garde-fou v42
  -- (prevent_new_normalized_pseudo_collision) : toute la transaction est
  -- annulée, donc AUCUN compte fantôme n'est créé. Le client vérifie déjà la
  -- disponibilité avant d'arriver ici, ce cas ne reste possible qu'en cas de
  -- collision simultanée entre deux inscriptions.
  INSERT INTO public.profiles (
    id, pseudo, email, first_name, last_name,
    university, study_field, study_year, timezone
  )
  VALUES (
    NEW.id,
    v_pseudo,
    NEW.email,
    nullif(btrim(v_meta ->> 'first_name'), ''),
    nullif(btrim(v_meta ->> 'last_name'), ''),
    nullif(btrim(v_meta ->> 'university'), ''),
    nullif(btrim(v_meta ->> 'study_field'), ''),
    nullif(btrim(v_meta ->> 'study_year'), ''),
    coalesce(nullif(btrim(v_meta ->> 'timezone'), ''), 'Europe/Paris')
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.create_profile_for_new_user()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS create_profile_for_new_user ON auth.users;
CREATE TRIGGER create_profile_for_new_user
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.create_profile_for_new_user();

COMMIT;

-- ================================================================
-- VÉRIFICATION (à lancer après, doit renvoyer 1 ligne)
--
--   SELECT tgname FROM pg_trigger t
--   JOIN pg_class c ON c.oid = t.tgrelid
--   WHERE c.relname = 'users' AND tgname = 'create_profile_for_new_user';
--
-- NOTE — les 33 comptes fantômes existants ne sont PAS réparés ici : leurs
-- métadonnées ne contiennent que l'email, donc personne ne connaît le pseudo
-- ni l'école qu'ils avaient choisis. Ils doivent les ressaisir eux-mêmes via
-- l'écran de rattrapage (/onboarding?repair=1).
-- ================================================================
