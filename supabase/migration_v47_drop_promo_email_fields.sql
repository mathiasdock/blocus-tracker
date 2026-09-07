-- ================================================================
--  Blocus Tracker — v47 : suppression de la machinerie « promo emails »
--
--  ⚠️ DEJA APPLIQUEE EN PRODUCTION le 07/09/2026 (via MCP Supabase, projet
--     xtpsavwwhkeiwfkidwcu), apres accord explicite de Mathias.
--     Trace ecrite, pas travail restant.
--
--  CONSTAT AVANT SUPPRESSION (verifie en base, pas suppose) :
--    • profiles.promo_emails    : 246 lignes, 0 a TRUE
--    • profiles.promo_emails_at : 0 horodatage
--    • aucun fichier du depot ne reference ces champs
--    • dependances : 3 fonctions, 1 trigger, 1 index — toutes internes a
--      cette fonctionnalite, aucune vue
--    • asymetrie de droits notable : `authenticated` ne pouvait PAS lire
--      promo_emails mais pouvait l'ECRIRE
--
--  POURQUOI ON SUPPRIME PLUTOT QUE DE GARDER
--  Une preference personnelle stockee pour une fonctionnalite qui n'existe
--  pas est de la donnee collectee sans finalite — exactement ce que la
--  minimisation interdit.
--
--  Et get_promo_email_audience() renvoyait id + email + prenom pour TOUS les
--  comptes ayant une vraie adresse, sans meme filtrer sur le consentement :
--  une moissonneuse d'emails dormante. Elle n'etait executable que par
--  service_role, donc rien n'a fuite — mais elle n'avait aucune raison de
--  survivre a la fonctionnalite qu'elle servait.
--
--  SI UNE NEWSLETTER VOIT LE JOUR UN JOUR : le consentement a sa place dans
--  user_privacy_settings (v44), a cote des autres preferences, avec la meme
--  RLS et le meme horodatage pose par la base.
--
--  VERIFIE APRES APPLICATION : 0 colonne, 0 fonction, 0 index « promo »
--  restants ; 246 profils intacts.
-- ================================================================

BEGIN;

DROP TRIGGER IF EXISTS trg_stamp_promo_email_consent ON public.profiles;
DROP FUNCTION IF EXISTS public.stamp_promo_email_consent();
DROP FUNCTION IF EXISTS public.get_my_promo_emails();
DROP FUNCTION IF EXISTS public.get_promo_email_audience();
DROP INDEX IF EXISTS public.profiles_promo_emails_idx;

ALTER TABLE public.profiles DROP COLUMN IF EXISTS promo_emails;
ALTER TABLE public.profiles DROP COLUMN IF EXISTS promo_emails_at;

COMMIT;
