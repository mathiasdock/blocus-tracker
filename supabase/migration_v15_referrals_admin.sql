-- Migration v15 : parrainage — RPC réservées à l'admin
-- Phase 3 : back-office.
--
-- Prérequis : migration_v14_referrals.sql doit être exécutée avant.
--
-- Ajoute :
--   - RPC admin_get_referral_counts()        → map { referrer_id: count } pour la colonne "Parrainages"
--   - RPC admin_get_referrals(p_user_id)      → liste détaillée des filleuls d'un membre
--
-- Les deux vérifient que l'appelant est admin (profiles.is_admin = true).

-- ============================================================
-- 1. RPC admin_get_referral_counts()
-- ============================================================

DROP FUNCTION IF EXISTS public.admin_get_referral_counts();

CREATE OR REPLACE FUNCTION public.admin_get_referral_counts()
RETURNS json
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_is_admin boolean;
  v_counts json;
BEGIN
  SELECT is_admin INTO v_is_admin FROM public.profiles WHERE id = v_uid;
  IF NOT COALESCE(v_is_admin, false) THEN
    RETURN json_build_object('ok', false, 'error', 'forbidden');
  END IF;

  SELECT COALESCE(json_object_agg(referrer_id, cnt), '{}'::json)
    INTO v_counts
  FROM (
    SELECT referrer_id, count(*) AS cnt
      FROM public.referrals
     GROUP BY referrer_id
  ) sub;

  RETURN json_build_object('ok', true, 'counts', v_counts);
END $$;

REVOKE ALL ON FUNCTION public.admin_get_referral_counts() FROM public;
GRANT  EXECUTE ON FUNCTION public.admin_get_referral_counts() TO authenticated;

-- ============================================================
-- 2. RPC admin_get_referrals(p_user_id)
--    Liste détaillée des filleuls d'un membre donné.
-- ============================================================

DROP FUNCTION IF EXISTS public.admin_get_referrals(uuid);

CREATE OR REPLACE FUNCTION public.admin_get_referrals(p_user_id uuid)
RETURNS json
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_is_admin boolean;
  v_list json;
BEGIN
  SELECT is_admin INTO v_is_admin FROM public.profiles WHERE id = v_uid;
  IF NOT COALESCE(v_is_admin, false) THEN
    RETURN json_build_object('ok', false, 'error', 'forbidden');
  END IF;

  SELECT COALESCE(
    json_agg(
      json_build_object(
        'pseudo',        p.pseudo,
        'avatar_url',    p.avatar_url,
        'created_at',    r.created_at,
        'xp_awarded',    r.xp_awarded,
        'mission_bonus', r.mission_bonus
      )
      ORDER BY r.created_at DESC
    ),
    '[]'::json
  )
  INTO v_list
  FROM public.referrals r
  JOIN public.profiles  p ON p.id = r.referred_id
  WHERE r.referrer_id = p_user_id;

  RETURN json_build_object('ok', true, 'list', v_list);
END $$;

REVOKE ALL ON FUNCTION public.admin_get_referrals(uuid) FROM public;
GRANT  EXECUTE ON FUNCTION public.admin_get_referrals(uuid) TO authenticated;
