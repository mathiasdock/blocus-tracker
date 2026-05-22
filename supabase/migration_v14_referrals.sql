-- Migration v14 : système de parrainage (referral)
-- Phase 1 : schéma + RPC apply_referral + RPC get_my_referral_stats
--
-- Ajoute :
--   - profiles.referral_code (text unique, auto-généré via trigger)
--   - profiles.referred_by   (uuid, qui m'a parrainé)
--   - profiles.bonus_xp      (int, XP attribué hors calcul dérivé)
--   - table referrals        (audit + comptage par filleul)
--   - RPC apply_referral(p_code)         → appelée par le filleul juste après signup
--   - RPC get_my_referral_stats()        → affichage carte profil
--
-- Phase 4 ajoutera la logique de bonus mission (mission_bonus boolean).
-- L'admin_get_referrals viendra en Phase 3.

-- ============================================================
-- 1. Colonnes profiles
-- ============================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS referral_code text UNIQUE,
  ADD COLUMN IF NOT EXISTS referred_by   uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS bonus_xp      integer NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_profiles_referred_by ON public.profiles(referred_by);

-- ============================================================
-- 2. Générateur de code (8 chars hex uppercase, unique)
-- ============================================================

CREATE OR REPLACE FUNCTION public.gen_referral_code()
RETURNS text
LANGUAGE plpgsql VOLATILE
SET search_path = public
AS $$
DECLARE
  v_code text;
  v_attempts int := 0;
BEGIN
  LOOP
    v_code := upper(substring(md5(random()::text || clock_timestamp()::text), 1, 8));
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.profiles WHERE referral_code = v_code);
    v_attempts := v_attempts + 1;
    IF v_attempts > 10 THEN
      RAISE EXCEPTION 'Could not generate unique referral code after 10 attempts';
    END IF;
  END LOOP;
  RETURN v_code;
END $$;

-- ============================================================
-- 3. Trigger : auto-assigne un code à l'INSERT si NULL
-- ============================================================

CREATE OR REPLACE FUNCTION public.profiles_set_referral_code()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.referral_code IS NULL THEN
    NEW.referral_code := public.gen_referral_code();
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_profiles_set_referral_code ON public.profiles;
CREATE TRIGGER trg_profiles_set_referral_code
  BEFORE INSERT ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.profiles_set_referral_code();

-- ============================================================
-- 4. Backfill des utilisateurs existants
-- ============================================================

UPDATE public.profiles
   SET referral_code = public.gen_referral_code()
 WHERE referral_code IS NULL;

-- ============================================================
-- 5. Table referrals (audit + idempotence + comptage)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.referrals (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id   uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  referred_id   uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  xp_awarded    integer NOT NULL DEFAULT 0,
  mission_bonus boolean NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_referrals_referrer ON public.referrals(referrer_id);

-- RLS : aucun accès direct. Tout passe par les RPC SECURITY DEFINER.
ALTER TABLE public.referrals ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 6. RPC apply_referral(p_code)
--    Appelée par le filleul juste après signup avec son JWT.
--    Vérifie : code valide, pas auto-parrainage, pas déjà parrainé.
--    Award +100 XP au parrain (bonus_xp).
-- ============================================================

DROP FUNCTION IF EXISTS public.apply_referral(text);

CREATE OR REPLACE FUNCTION public.apply_referral(p_code text)
RETURNS json
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_referrer_id uuid;
  v_already uuid;
  v_xp int := 100;
BEGIN
  IF v_uid IS NULL THEN
    RETURN json_build_object('ok', false, 'error', 'not_authenticated');
  END IF;

  IF p_code IS NULL OR length(trim(p_code)) = 0 THEN
    RETURN json_build_object('ok', false, 'error', 'no_code');
  END IF;

  -- Trouver le parrain (comparaison insensible à la casse)
  SELECT id INTO v_referrer_id
    FROM public.profiles
   WHERE upper(referral_code) = upper(trim(p_code));

  IF v_referrer_id IS NULL THEN
    RETURN json_build_object('ok', false, 'error', 'invalid_code');
  END IF;

  -- Anti auto-parrainage
  IF v_referrer_id = v_uid THEN
    RETURN json_build_object('ok', false, 'error', 'self_referral');
  END IF;

  -- Anti double-count : un filleul ne peut être parrainé qu'une seule fois
  SELECT referred_by INTO v_already FROM public.profiles WHERE id = v_uid;
  IF v_already IS NOT NULL THEN
    RETURN json_build_object('ok', false, 'error', 'already_referred');
  END IF;

  -- Lier filleul -> parrain
  UPDATE public.profiles SET referred_by = v_referrer_id WHERE id = v_uid;

  -- Créditer le parrain (bonus_xp = XP hors calcul dérivé)
  UPDATE public.profiles
     SET bonus_xp = COALESCE(bonus_xp, 0) + v_xp
   WHERE id = v_referrer_id;

  -- Trace pour audit + affichage admin/profil
  INSERT INTO public.referrals(referrer_id, referred_id, xp_awarded, mission_bonus)
  VALUES (v_referrer_id, v_uid, v_xp, false);

  RETURN json_build_object('ok', true, 'xp', v_xp);
END $$;

REVOKE ALL ON FUNCTION public.apply_referral(text) FROM public;
GRANT  EXECUTE ON FUNCTION public.apply_referral(text) TO authenticated;

-- ============================================================
-- 7. RPC get_my_referral_stats()
--    Pour la carte "Invite tes amis" dans le profil.
-- ============================================================

DROP FUNCTION IF EXISTS public.get_my_referral_stats();

CREATE OR REPLACE FUNCTION public.get_my_referral_stats()
RETURNS json
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_code text;
  v_count int;
  v_list json;
BEGIN
  IF v_uid IS NULL THEN
    RETURN json_build_object('ok', false, 'error', 'not_authenticated');
  END IF;

  SELECT referral_code INTO v_code FROM public.profiles WHERE id = v_uid;

  SELECT count(*) INTO v_count FROM public.referrals WHERE referrer_id = v_uid;

  SELECT COALESCE(
    json_agg(
      json_build_object(
        'pseudo',     p.pseudo,
        'avatar_url', p.avatar_url,
        'created_at', r.created_at,
        'xp_awarded', r.xp_awarded
      )
      ORDER BY r.created_at DESC
    ),
    '[]'::json
  )
  INTO v_list
  FROM public.referrals r
  JOIN public.profiles  p ON p.id = r.referred_id
  WHERE r.referrer_id = v_uid;

  RETURN json_build_object(
    'ok',    true,
    'code',  v_code,
    'count', v_count,
    'list',  v_list
  );
END $$;

REVOKE ALL ON FUNCTION public.get_my_referral_stats() FROM public;
GRANT  EXECUTE ON FUNCTION public.get_my_referral_stats() TO authenticated;
