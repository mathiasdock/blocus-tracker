-- ================================================================
-- Blocus Tracker - v36 revoke anonymous privileged RPCs
-- ================================================================

BEGIN;

DO $$
BEGIN
  IF to_regprocedure('public.get_leaderboard_v2(text,text,text,text,text,text)') IS NOT NULL THEN
    REVOKE ALL ON FUNCTION public.get_leaderboard_v2(text,text,text,text,text,text) FROM PUBLIC, anon;
    GRANT EXECUTE ON FUNCTION public.get_leaderboard_v2(text,text,text,text,text,text) TO authenticated, service_role;
  END IF;

  IF to_regprocedure('public.get_study_comparison()') IS NOT NULL THEN
    REVOKE ALL ON FUNCTION public.get_study_comparison() FROM PUBLIC, anon;
    GRANT EXECUTE ON FUNCTION public.get_study_comparison() TO authenticated, service_role;
  END IF;

  IF to_regprocedure('public.self_delete_user()') IS NOT NULL THEN
    REVOKE ALL ON FUNCTION public.self_delete_user() FROM PUBLIC, anon;
    GRANT EXECUTE ON FUNCTION public.self_delete_user() TO authenticated, service_role;
  END IF;
END;
$$;

COMMIT;
