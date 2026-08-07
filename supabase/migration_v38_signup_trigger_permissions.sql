-- ================================================================
-- Blocus Tracker - v38 signup trigger permissions
--
-- Manual migration: run once in the Supabase SQL Editor, after v37.
-- Repairs signups broken by internal function EXECUTE hardening while
-- keeping the referral generator unavailable through the Data API.
-- ================================================================

BEGIN;

-- This trigger is invoked during an authenticated INSERT on profiles. As a
-- SECURITY INVOKER it inherited the caller's revoked EXECUTE privilege on
-- gen_referral_code(), so Auth succeeded but profile creation failed.
CREATE OR REPLACE FUNCTION public.profiles_set_referral_code()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
BEGIN
  IF NEW.referral_code IS NULL THEN
    NEW.referral_code := public.gen_referral_code();
  END IF;
  RETURN NEW;
END;
$$;

-- Trigger functions are executed by PostgreSQL, never directly by clients.
REVOKE ALL ON FUNCTION public.profiles_set_referral_code() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.profiles_set_referral_code() TO service_role;

-- A failed signup leaves the browser authenticated. Retrying must still be
-- able to perform the same exact (single-value) availability check.
GRANT EXECUTE ON FUNCTION public.is_pseudo_available(text) TO authenticated;

COMMIT;

-- Verification after applying:
--   1. profiles_set_referral_code() is SECURITY DEFINER and remains unavailable
--      to anon/authenticated through RPC.
--   2. is_pseudo_available(text) is executable by anon and authenticated.
--   3. a new Auth user can insert exactly one matching profiles row.
