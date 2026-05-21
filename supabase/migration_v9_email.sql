-- ================================================================
--  blocus-tracker — migration v9 : authentification par email
--
--  1. Colonne email sur profiles (optionnelle, unique)
--  2. Index unique partiel (null exclus)
--  3. Fonction get_login_email() appelable par anon
--     → retourne le vrai email si défini, sinon pseudo@blocus.local
--     → utilisée par le client au moment du signIn
--
--  À exécuter dans l'éditeur SQL Supabase (une seule fois).
-- ================================================================

-- ---------------------------------------------------------------
-- 1. Colonne email
-- ---------------------------------------------------------------
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS email text;

-- ---------------------------------------------------------------
-- 2. Index unique (les NULL sont exclus — plusieurs users peuvent
--    ne pas avoir d'email sans conflits)
-- ---------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS profiles_email_unique
  ON public.profiles (lower(email))
  WHERE email IS NOT NULL;

-- ---------------------------------------------------------------
-- 3. Fonction get_login_email
--    Appelable sans être connecté (rôle anon) car utilisée
--    pendant la phase de connexion, avant toute session.
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_login_email(p_pseudo text)
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT email FROM public.profiles
     WHERE pseudo = p_pseudo AND email IS NOT NULL),
    p_pseudo || '@blocus.local'
  );
$$;

REVOKE ALL   ON FUNCTION public.get_login_email(text) FROM public;
GRANT EXECUTE ON FUNCTION public.get_login_email(text) TO anon, authenticated;
