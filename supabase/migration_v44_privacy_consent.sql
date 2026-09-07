-- ================================================================
--  Blocus Tracker — v44 : préférences vie privée & preuve d'acceptation
--
--  Migration manuelle : à exécuter une fois dans l'éditeur SQL Supabase,
--  après v43. Non destructive, ré-exécutable sans effet de bord.
--
--  POURQUOI
--  Trois obligations n'avaient aucun support en base :
--    1. Prouver QUAND et QUELLE VERSION des CGU une personne a acceptée
--       (RGPD art. 5.2 : être capable de démontrer, pas seulement d'affirmer).
--    2. Garder son choix cookies/traceurs autrement que dans le navigateur,
--       pour qu'il la suive d'un appareil à l'autre.
--    3. Lui laisser refuser une CATÉGORIE de notifications sans devoir tout
--       couper — et que ce refus soit respecté CÔTÉ SERVEUR, pas seulement
--       masqué dans l'interface.
--
--  POURQUOI UNE TABLE À PART, ET PAS DES COLONNES SUR `profiles`
--  La politique `profiles_read` est `USING (TRUE)` : toute colonne lisible
--  sur `profiles` est lisible par TOUS les comptes connectés. Des préférences
--  vie privée n'ont rien à y faire. Ici, la RLS ne laisse chacun voir que sa
--  propre ligne.
--
--  COMPATIBILITÉ AVEC L'EXISTANT
--  Aucun compte n'est bloqué. Les lignes créées par le backfill portent les
--  valeurs par défaut (rappels et annonces activés = comportement actuel
--  inchangé) et aucune acceptation de CGU : les comptes antérieurs verront
--  un rappel NON BLOQUANT les invitant à valider la nouvelle version.
--  Le code applicatif fonctionne aussi AVANT cette migration : il détecte la
--  table absente et retombe sur le stockage local.
--
-- ⚠️ DEJA APPLIQUEE EN PRODUCTION le 07/09/2026 (via MCP Supabase, projet
--    xtpsavwwhkeiwfkidwcu). Ce fichier est conserve comme trace ecrite, pas
--    comme travail restant. Il est re-executable sans effet de bord.
--    Applique en un bloc, plus un correctif v44b : REVOKE EXECUTE sur
--    stamp_privacy_settings() (fonction de trigger inutilement exposee
--    en RPC, signale par le linter Supabase).
-- ================================================================

BEGIN;

-- ----------------------------------------------------------------
-- 1. La table
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.user_privacy_settings (
  user_id                 uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Preuve d'acceptation. `terms_*` = accord contractuel (obligatoire pour
  -- utiliser le service). `privacy_*` = simple accusé de lecture : une
  -- politique de confidentialité s'informe, elle ne se « consent » pas.
  terms_version           text,
  terms_accepted_at       timestamptz,
  privacy_version         text,
  privacy_acknowledged_at timestamptz,

  -- Préférences de notifications, lues par le serveur avant chaque envoi.
  -- Par défaut à TRUE : ces personnes ont déjà accordé la permission push,
  -- les remettre à zéro casserait une fonctionnalité qu'elles ont demandée.
  push_reminders          boolean NOT NULL DEFAULT true,
  push_announcements      boolean NOT NULL DEFAULT true,

  -- Copie du choix cookies/traceurs (miroir de localStorage bt_consent_v1).
  -- On garde l'ÉTAT COURANT, pas l'historique : conserver toutes les versions
  -- successives d'un choix serait collecter plus que nécessaire.
  consent_version         text,
  consent_categories      jsonb,
  consent_updated_at      timestamptz,

  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.user_privacy_settings IS
  'Préférences vie privée et preuve d''acceptation des documents légaux. Une ligne par compte, lisible et modifiable par son seul propriétaire.';

-- ----------------------------------------------------------------
-- 2. Horodatages posés par la base, pas par le navigateur
--    Une date d'acceptation envoyée par le client ne prouverait rien.
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.stamp_privacy_settings()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
BEGIN
  NEW.updated_at := now();

  IF TG_OP = 'INSERT' THEN
    IF NEW.terms_version IS NOT NULL THEN NEW.terms_accepted_at := now(); END IF;
    IF NEW.privacy_version IS NOT NULL THEN NEW.privacy_acknowledged_at := now(); END IF;
    RETURN NEW;
  END IF;

  IF NEW.terms_version IS DISTINCT FROM OLD.terms_version THEN
    NEW.terms_accepted_at := CASE WHEN NEW.terms_version IS NULL THEN NULL ELSE now() END;
  ELSE
    NEW.terms_accepted_at := OLD.terms_accepted_at;
  END IF;

  IF NEW.privacy_version IS DISTINCT FROM OLD.privacy_version THEN
    NEW.privacy_acknowledged_at := CASE WHEN NEW.privacy_version IS NULL THEN NULL ELSE now() END;
  ELSE
    NEW.privacy_acknowledged_at := OLD.privacy_acknowledged_at;
  END IF;

  -- La date du choix de traceurs vient bien du navigateur (le choix peut être
  -- fait hors connexion, avant même d'avoir un compte), mais on refuse une
  -- date future : elle ne serait pas exploitable comme preuve.
  IF NEW.consent_updated_at IS NOT NULL AND NEW.consent_updated_at > now() THEN
    NEW.consent_updated_at := now();
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_stamp_privacy_settings ON public.user_privacy_settings;
CREATE TRIGGER trg_stamp_privacy_settings
  BEFORE INSERT OR UPDATE ON public.user_privacy_settings
  FOR EACH ROW EXECUTE FUNCTION public.stamp_privacy_settings();

-- ----------------------------------------------------------------
-- 3. RLS : chacun ne voit et n'écrit que sa propre ligne
-- ----------------------------------------------------------------
ALTER TABLE public.user_privacy_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ups_select_own ON public.user_privacy_settings;
CREATE POLICY ups_select_own ON public.user_privacy_settings
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS ups_insert_own ON public.user_privacy_settings;
CREATE POLICY ups_insert_own ON public.user_privacy_settings
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS ups_update_own ON public.user_privacy_settings;
CREATE POLICY ups_update_own ON public.user_privacy_settings
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Aucune suppression côté client : la ligne disparaît avec le compte
-- (ON DELETE CASCADE). Rien à révoquer manuellement, rien à oublier.

REVOKE ALL PRIVILEGES ON TABLE public.user_privacy_settings FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.user_privacy_settings TO authenticated;
GRANT ALL ON public.user_privacy_settings TO service_role;

-- ----------------------------------------------------------------
-- 4. Backfill — une ligne par compte existant, aux valeurs par défaut
-- ----------------------------------------------------------------
INSERT INTO public.user_privacy_settings (user_id)
SELECT p.id FROM public.profiles p
ON CONFLICT (user_id) DO NOTHING;

-- ----------------------------------------------------------------
-- 5. Lecture serveur des refus de notifications
--    Utilisée par pages/api/push/daily.js et /api/push/announce.js, qui
--    tournent en service_role. Une fonction plutôt qu'une requête ad hoc :
--    l'absence de ligne doit valoir « pas de refus », jamais « exclu ».
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.push_opted_out_users(p_channel text)
RETURNS TABLE (user_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT s.user_id
  FROM public.user_privacy_settings s
  WHERE (p_channel = 'reminders'     AND s.push_reminders     = false)
     OR (p_channel = 'announcements' AND s.push_announcements = false);
$$;

REVOKE ALL ON FUNCTION public.push_opted_out_users(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.push_opted_out_users(text) TO service_role;

COMMIT;
