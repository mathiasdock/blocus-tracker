-- Migration v16 : parrainage — mission journalière + bonus XP serveur
-- Phase 4.
--
-- Prérequis : migration_v14_referrals.sql exécutée.
--
-- Ajoute :
--   - referral_mission_active(p_user_id, p_date)  → réplique EXACTE de isReferralDay() (lib/xp.js)
--   - apply_referral(p_code) MISE À JOUR          → +300 XP bonus si la mission du jour est active
--
-- ⚠️ La logique de referral_mission_active DOIT rester synchronisée avec
--    lib/xp.js : même hash FNV-1a 32 bits, même xorshift32, même seuil 3/7,
--    même préfixe de seed "ref:".

-- ============================================================
-- 1. referral_mission_active(p_user_id, p_date)
--    Reproduit : strToSeed("ref:"+date+userId) → seedRng → rng() < 3/7
-- ============================================================

CREATE OR REPLACE FUNCTION public.referral_mission_active(p_user_id uuid, p_date text)
RETURNS boolean
LANGUAGE plpgsql IMMUTABLE
SET search_path = public
AS $$
DECLARE
  s     text   := 'ref:' || COALESCE(p_date, '') || COALESCE(p_user_id::text, '');
  h     bigint := 2166136261;        -- 0x811c9dc5 (offset FNV-1a 32 bits)
  prime bigint := 16777619;          -- 0x01000193
  mask  bigint := 4294967295;        -- 0xFFFFFFFF
  i     int;
  c     int;
  x     bigint;
  val   double precision;
BEGIN
  -- FNV-1a 32 bits sur les codes de caractères (ASCII : chaîne 'ref:'+date+uuid)
  FOR i IN 1..length(s) LOOP
    c := ascii(substr(s, i, 1));
    h := (h # c) & mask;             -- XOR
    h := (h * prime) & mask;         -- multiplication mod 2^32
  END LOOP;

  -- seedRng : première itération du xorshift32
  x := h & mask;
  x := (x # ((x << 13) & mask)) & mask;
  x := (x # (x >> 17)) & mask;
  x := (x # ((x << 5) & mask)) & mask;

  val := x::double precision / 4294967295.0;
  RETURN val < (3.0 / 7.0);
END $$;

-- ============================================================
-- 2. apply_referral(p_code) — version Phase 4
--    +100 XP de base, +300 si la mission "Parrainer un ami" du parrain
--    est active aujourd'hui (date UTC, comme todayISO() côté client).
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
  v_today text := to_char((now() AT TIME ZONE 'UTC'), 'YYYY-MM-DD');
  v_xp int := 100;
  v_mission boolean := false;
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

  -- Bonus mission : +300 si la mission du jour du parrain est active
  v_mission := public.referral_mission_active(v_referrer_id, v_today);
  IF v_mission THEN
    v_xp := v_xp + 300;
  END IF;

  -- Lier filleul -> parrain
  UPDATE public.profiles SET referred_by = v_referrer_id WHERE id = v_uid;

  -- Créditer le parrain
  UPDATE public.profiles
     SET bonus_xp = COALESCE(bonus_xp, 0) + v_xp
   WHERE id = v_referrer_id;

  -- Trace pour audit + affichage admin/profil
  INSERT INTO public.referrals(referrer_id, referred_id, xp_awarded, mission_bonus)
  VALUES (v_referrer_id, v_uid, v_xp, v_mission);

  RETURN json_build_object('ok', true, 'xp', v_xp, 'mission_bonus', v_mission);
END $$;

REVOKE ALL ON FUNCTION public.apply_referral(text) FROM public;
GRANT  EXECUTE ON FUNCTION public.apply_referral(text) TO authenticated;
