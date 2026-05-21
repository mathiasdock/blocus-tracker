-- ================================================================
--  blocus-tracker — migration v7 : sécurisation champs sensibles
--
--  Problème : la policy UPDATE sur profiles laissait un utilisateur
--  authentifié modifier sa propre ligne entièrement, y compris
--  les colonnes is_admin et locked → escalade de privilèges possible.
--
--  Solution retenue : trigger BEFORE UPDATE (le plus fiable —
--  fonctionne quelle que soit la source de la requête UPDATE, y
--  compris les RPCs et le SDK JS direct).
--
--  On resserre aussi la policy UPDATE pour limiter les champs
--  modifiables côté RLS en second rempart.
--
--  À exécuter dans l'éditeur SQL Supabase (une seule fois).
-- ================================================================


-- ---------------------------------------------------------------
-- 1. Trigger de protection contre l'escalade de privilèges
--
--  Quand un utilisateur normal met à jour son propre profil :
--    - is_admin  → forcé à l'ancienne valeur (ne peut jamais changer)
--    - locked    → forcé à l'ancienne valeur (ne peut jamais changer)
--    - id        → forcé à l'ancienne valeur (immuable)
--    - created_at → forcé à l'ancienne valeur (immuable)
--
--  Pour un admin (is_admin = true dans old) qui met à jour
--  le profil de quelqu'un d'autre, on laisse passer (cas traité
--  par la policy "admin_update_profiles").
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.prevent_profile_privilege_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Toujours forcer les champs immuables / sensibles
  NEW.id         := OLD.id;
  NEW.created_at := OLD.created_at;

  -- is_admin et locked ne peuvent être changés que par un admin
  -- qui modifie le profil d'un AUTRE utilisateur.
  -- Si l'acteur est l'utilisateur lui-même (ou n'est pas admin),
  -- on restaure les valeurs d'origine.
  IF auth.uid() = OLD.id
     OR NOT EXISTS (
       SELECT 1 FROM public.profiles
       WHERE id = auth.uid() AND is_admin = TRUE
     )
  THEN
    NEW.is_admin := OLD.is_admin;
    NEW.locked   := OLD.locked;
  END IF;

  RETURN NEW;
END;
$$;

-- Supprime l'éventuel trigger existant avant de le recréer
DROP TRIGGER IF EXISTS prevent_profile_privilege_escalation
  ON public.profiles;

CREATE TRIGGER prevent_profile_privilege_escalation
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_profile_privilege_escalation();


-- ---------------------------------------------------------------
-- 2. Resserrement de la policy UPDATE utilisateur (second rempart)
--
--  On remplace la policy générique "Users can update own profile"
--  par une version dont le WITH CHECK bloque explicitement
--  toute tentative de changer is_admin ou locked.
--
--  Note : même si quelqu'un contourne le trigger (cas improbable),
--  la policy rejettera la requête au niveau RLS.
-- ---------------------------------------------------------------
DROP POLICY IF EXISTS "Users can update own profile"    ON public.profiles;
DROP POLICY IF EXISTS "users_update_own_profile"        ON public.profiles;
DROP POLICY IF EXISTS "Enable update for users"         ON public.profiles;

CREATE POLICY "users_update_safe_fields"
  ON public.profiles
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (
    auth.uid() = id
    -- is_admin doit rester identique à la valeur en base
    AND is_admin = (
      SELECT p.is_admin FROM public.profiles p WHERE p.id = auth.uid()
    )
    -- locked doit rester identique à la valeur en base
    AND locked = (
      SELECT p.locked FROM public.profiles p WHERE p.id = auth.uid()
    )
  );


-- ---------------------------------------------------------------
-- 3. Correction de la policy UPDATE admin
--
--  La policy "admin_update_profiles" avait WITH CHECK (true),
--  ce qui était trop permissif. On la remplace pour qu'un admin
--  ne puisse pas se retirer ses propres droits par accident
--  (se mettre is_admin = false sur soi-même).
--  Un admin peut modifier le profil de n'importe qui SAUF
--  rétrograder son propre is_admin.
-- ---------------------------------------------------------------
DROP POLICY IF EXISTS "admin_update_profiles" ON public.profiles;

CREATE POLICY "admin_update_profiles"
  ON public.profiles
  FOR UPDATE
  TO authenticated
  USING (
    -- L'acteur est un admin
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND is_admin = TRUE
    )
  )
  WITH CHECK (
    -- Un admin ne peut pas supprimer son propre statut admin
    CASE
      WHEN id = auth.uid() THEN is_admin = TRUE
      ELSE true
    END
  );


-- ---------------------------------------------------------------
-- 4. Vérification : les RPCs SECURITY DEFINER (admin_delete_user,
--    self_delete_user) contournent RLS → pas de changement requis
--    pour eux. Le trigger s'applique cependant à leurs UPDATE
--    si jamais ils en émettent un.
-- ---------------------------------------------------------------

-- ---------------------------------------------------------------
-- Résumé des protections en place après cette migration :
--
--  Couche 1 — Trigger BEFORE UPDATE (prevent_profile_privilege_escalation)
--    • Toujours exécuté, quelle que soit la source.
--    • Force is_admin/locked à leur valeur d'origine si l'acteur
--      n'est pas un admin modifiant quelqu'un d'autre.
--
--  Couche 2 — Policy RLS "users_update_safe_fields"
--    • Bloque au niveau SQL si is_admin ou locked changent lors
--      d'une mise à jour par le propriétaire du profil.
--
--  Couche 3 — Policy RLS "admin_update_profiles"
--    • Un admin peut modifier n'importe quel profil, mais ne peut
--      pas retirer son propre is_admin = true.
--
--  Couche 4 — RPCs SECURITY DEFINER (v6)
--    • admin_delete_user vérifie is_admin côté base avant d'agir.
--    • self_delete_user ne touche pas is_admin.
-- ---------------------------------------------------------------
