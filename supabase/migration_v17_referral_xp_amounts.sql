-- Migration v17 : parrainage — montants XP mis à jour
--
-- Prérequis : migration_v14_referrals.sql + migration_v16_referral_mission.sql
--
-- Change les récompenses :
--   - +300 XP de base par filleul valide (au lieu de 100)
--   - +600 XP au total quand la mission "Parrainer un ami" du parrain
--     est active ce jour-là (300 de base + 300 de bonus mission)
--
-- Seule apply_referral change ; referral_mission_active reste inchangée.

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
  v_xp int := 300;
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

  -- Bonus mission : +300 si la mission du jour du parrain est active (total 600)
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
