-- ================================================================
--  blocus-tracker — migration v6 : sécurité rôle admin
--
--  Remplace le pseudo hardcodé 'mathias.dock' par une colonne
--  is_admin sur profiles, dans les RPCs et dans toutes les
--  politiques RLS.
--
--  À exécuter dans l'éditeur SQL Supabase (une seule fois).
-- ================================================================


-- ---------------------------------------------------------------
-- 1. Colonne is_admin sur profiles
-- ---------------------------------------------------------------
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_admin BOOLEAN NOT NULL DEFAULT FALSE;

-- Accorde le rôle admin au compte existant
UPDATE public.profiles SET is_admin = TRUE WHERE pseudo = 'mathias.dock';


-- ---------------------------------------------------------------
-- 2. RPC admin_delete_user — ajoute le contrôle côté DB
--    + gère lui-même le log dans deleted_accounts (atomique)
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_delete_user(target UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Vérification admin côté base (pas seulement côté client)
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND is_admin = TRUE
  ) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  -- Un admin ne peut pas se supprimer lui-même via cet endpoint
  IF target = auth.uid() THEN
    RAISE EXCEPTION 'Use self_delete_user() to delete your own account';
  END IF;

  -- Log avant suppression (la cascade supprimera le profil)
  INSERT INTO public.deleted_accounts
    (user_id, pseudo, first_name, last_name, university, deleted_by)
  SELECT id, pseudo, first_name, last_name, university, auth.uid()
  FROM public.profiles WHERE id = target;

  -- Suppression auth.users → cascade sur toutes les tables liées
  DELETE FROM auth.users WHERE id = target;
END;
$$;

REVOKE ALL  ON FUNCTION public.admin_delete_user(UUID) FROM public;
GRANT EXECUTE ON FUNCTION public.admin_delete_user(UUID) TO authenticated;


-- ---------------------------------------------------------------
-- 3. Nouveau RPC self_delete_user — suppression volontaire
--    L'utilisateur supprime uniquement son propre compte.
--    Aucun privilège admin requis.
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.self_delete_user()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Log (deleted_by = soi-même)
  INSERT INTO public.deleted_accounts
    (user_id, pseudo, first_name, last_name, university, deleted_by)
  SELECT id, pseudo, first_name, last_name, university, id
  FROM public.profiles WHERE id = auth.uid();

  -- Suppression auth.users → cascade sur toutes les tables liées
  DELETE FROM auth.users WHERE id = auth.uid();
END;
$$;

REVOKE ALL  ON FUNCTION public.self_delete_user() FROM public;
GRANT EXECUTE ON FUNCTION public.self_delete_user() TO authenticated;


-- ---------------------------------------------------------------
-- 4. Politique RLS : mise à jour de profil par un admin
--    (remplace la version basée sur le pseudo)
-- ---------------------------------------------------------------
DROP POLICY IF EXISTS "admin_update_profiles" ON public.profiles;
CREATE POLICY "admin_update_profiles" ON public.profiles
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND is_admin = TRUE
    )
  )
  WITH CHECK (true);


-- ---------------------------------------------------------------
-- 5. Politique RLS : suppression de post par un admin
-- ---------------------------------------------------------------
DROP POLICY IF EXISTS "admin_delete_posts" ON public.posts;
CREATE POLICY "admin_delete_posts" ON public.posts
  FOR DELETE TO authenticated
  USING (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND is_admin = TRUE
    )
  );


-- ---------------------------------------------------------------
-- 6. Politique RLS : suppression de message communauté par admin
-- ---------------------------------------------------------------
DROP POLICY IF EXISTS "admin_delete_cmsg" ON public.community_messages;
CREATE POLICY "admin_delete_cmsg" ON public.community_messages
  FOR DELETE TO authenticated
  USING (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND is_admin = TRUE
    )
  );


-- ---------------------------------------------------------------
-- 7. Protection de la table deleted_accounts
--    (probablement sans RLS pour l'instant — on corrige ça)
-- ---------------------------------------------------------------
ALTER TABLE public.deleted_accounts ENABLE ROW LEVEL SECURITY;

-- Seuls les admins peuvent lire les logs de suppression
DROP POLICY IF EXISTS "deleted_accounts_admin_read" ON public.deleted_accounts;
CREATE POLICY "deleted_accounts_admin_read" ON public.deleted_accounts
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND is_admin = TRUE
    )
  );

-- Les RPCs SECURITY DEFINER contournent RLS pour les INSERT
-- → pas besoin d'une politique INSERT ici
