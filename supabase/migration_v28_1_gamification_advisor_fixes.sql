-- Follow-up for projects where v28 was already applied before the Supabase
-- advisor pass. Fresh installs also receive these settings from v28 itself.

BEGIN;

ALTER FUNCTION public.gamification_level_threshold(integer)
  SET search_path = public, pg_catalog;
ALTER FUNCTION public.gamification_level_for_xp(bigint)
  SET search_path = public, pg_catalog;
ALTER FUNCTION public.gamification_hash_index(text, integer)
  SET search_path = public, pg_catalog;
ALTER FUNCTION public.gamification_mission_xp(text)
  SET search_path = public, pg_catalog;

DROP POLICY IF EXISTS xp_ledger_read_own_or_admin ON public.xp_ledger;
CREATE POLICY xp_ledger_read_own_or_admin ON public.xp_ledger
FOR SELECT TO authenticated
USING (
  (SELECT auth.uid()) = user_id
  OR EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = (SELECT auth.uid()) AND p.is_admin = TRUE
  )
);

DROP POLICY IF EXISTS daily_missions_read_own_or_admin ON public.daily_mission_assignments;
CREATE POLICY daily_missions_read_own_or_admin ON public.daily_mission_assignments
FOR SELECT TO authenticated
USING (
  (SELECT auth.uid()) = user_id
  OR EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = (SELECT auth.uid()) AND p.is_admin = TRUE
  )
);

DROP POLICY IF EXISTS user_badges_read_own_or_admin ON public.user_badges;
CREATE POLICY user_badges_read_own_or_admin ON public.user_badges
FOR SELECT TO authenticated
USING (
  (SELECT auth.uid()) = user_id
  OR EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = (SELECT auth.uid()) AND p.is_admin = TRUE
  )
);

COMMIT;
