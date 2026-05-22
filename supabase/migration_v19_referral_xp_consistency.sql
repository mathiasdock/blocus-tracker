-- Fix referral XP consistency:
-- - +300 XP base per valid referral
-- - +600 XP mission bonus when the referral mission is active
-- - revoke referral XP when the referral row is deleted, including auth cascade deletes

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

  SELECT id INTO v_referrer_id
  FROM public.profiles
  WHERE upper(referral_code) = upper(trim(p_code));

  IF v_referrer_id IS NULL THEN
    RETURN json_build_object('ok', false, 'error', 'invalid_code');
  END IF;

  IF v_referrer_id = v_uid THEN
    RETURN json_build_object('ok', false, 'error', 'self_referral');
  END IF;

  SELECT referred_by INTO v_already FROM public.profiles WHERE id = v_uid;
  IF v_already IS NOT NULL THEN
    RETURN json_build_object('ok', false, 'error', 'already_referred');
  END IF;

  v_mission := public.referral_mission_active(v_referrer_id, v_today);
  IF v_mission THEN
    v_xp := v_xp + 600;
  END IF;

  UPDATE public.profiles
  SET referred_by = v_referrer_id
  WHERE id = v_uid;

  UPDATE public.profiles
  SET bonus_xp = COALESCE(bonus_xp, 0) + v_xp
  WHERE id = v_referrer_id;

  INSERT INTO public.referrals(referrer_id, referred_id, xp_awarded, mission_bonus)
  VALUES (v_referrer_id, v_uid, v_xp, v_mission);

  RETURN json_build_object('ok', true, 'xp', v_xp, 'mission_bonus', v_mission);
END;
$$;

REVOKE ALL ON FUNCTION public.apply_referral(text) FROM public;
GRANT EXECUTE ON FUNCTION public.apply_referral(text) TO authenticated;

-- Existing rows from older rules should match the new source of truth.
-- Preserve any non-referral bonus_xp by applying only the referral delta.
WITH referral_deltas AS (
  SELECT
    id,
    referrer_id,
    xp_awarded AS old_xp,
    CASE WHEN mission_bonus THEN 900 ELSE 300 END AS new_xp
  FROM public.referrals
  WHERE xp_awarded IS DISTINCT FROM CASE WHEN mission_bonus THEN 900 ELSE 300 END
),
referrer_deltas AS (
  SELECT referrer_id, SUM(new_xp - old_xp)::integer AS xp_delta
  FROM referral_deltas
  GROUP BY referrer_id
)
UPDATE public.profiles p
SET bonus_xp = GREATEST(COALESCE(p.bonus_xp, 0) + d.xp_delta, 0)
FROM referrer_deltas d
WHERE p.id = d.referrer_id;

UPDATE public.referrals
SET xp_awarded = CASE WHEN mission_bonus THEN 900 ELSE 300 END
WHERE xp_awarded IS DISTINCT FROM CASE WHEN mission_bonus THEN 900 ELSE 300 END;

-- Already-deleted referrals cannot be safely reconstructed here because their
-- referral rows were removed by cascade. Correct those manually only after
-- confirming whether production bonus_xp contains non-referral rewards.

CREATE OR REPLACE FUNCTION public.referrals_revoke_xp_on_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.profiles
  SET bonus_xp = GREATEST(COALESCE(bonus_xp, 0) - COALESCE(OLD.xp_awarded, 0), 0)
  WHERE id = OLD.referrer_id;

  RETURN OLD;
END;
$$;

REVOKE ALL ON FUNCTION public.referrals_revoke_xp_on_delete() FROM public;

DROP TRIGGER IF EXISTS trg_referrals_revoke_xp_on_delete ON public.referrals;
CREATE TRIGGER trg_referrals_revoke_xp_on_delete
AFTER DELETE ON public.referrals
FOR EACH ROW
EXECUTE FUNCTION public.referrals_revoke_xp_on_delete();
