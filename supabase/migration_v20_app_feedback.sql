-- Migration v20 : user suggestions and bug reports
-- Creates a small RLS-protected feedback inbox.

CREATE TABLE IF NOT EXISTS public.app_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type text NOT NULL DEFAULT 'suggestion'
    CHECK (type IN ('suggestion', 'bug', 'other')),
  message text NOT NULL
    CHECK (char_length(btrim(message)) BETWEEN 1 AND 1000),
  status text NOT NULL DEFAULT 'new'
    CHECK (status IN ('new', 'read', 'done')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_app_feedback_user_id
  ON public.app_feedback(user_id);

CREATE INDEX IF NOT EXISTS idx_app_feedback_status_created_at
  ON public.app_feedback(status, created_at DESC);

CREATE OR REPLACE FUNCTION public.is_current_user_admin()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((
    SELECT is_admin
    FROM public.profiles
    WHERE id = auth.uid()
  ), false);
$$;

REVOKE ALL ON FUNCTION public.is_current_user_admin() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.is_current_user_admin() TO authenticated;

CREATE OR REPLACE FUNCTION public.app_feedback_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_app_feedback_updated_at ON public.app_feedback;
CREATE TRIGGER trg_app_feedback_updated_at
BEFORE UPDATE ON public.app_feedback
FOR EACH ROW
EXECUTE FUNCTION public.app_feedback_set_updated_at();

ALTER TABLE public.app_feedback ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "app_feedback_insert_own" ON public.app_feedback;
CREATE POLICY "app_feedback_insert_own" ON public.app_feedback
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND status = 'new'
  );

DROP POLICY IF EXISTS "app_feedback_select_own_or_admin" ON public.app_feedback;
CREATE POLICY "app_feedback_select_own_or_admin" ON public.app_feedback
  FOR SELECT
  TO authenticated
  USING (
    auth.uid() = user_id
    OR public.is_current_user_admin()
  );

DROP POLICY IF EXISTS "app_feedback_update_admin" ON public.app_feedback;
CREATE POLICY "app_feedback_update_admin" ON public.app_feedback
  FOR UPDATE
  TO authenticated
  USING (public.is_current_user_admin())
  WITH CHECK (public.is_current_user_admin());

DROP POLICY IF EXISTS "app_feedback_delete_admin" ON public.app_feedback;
CREATE POLICY "app_feedback_delete_admin" ON public.app_feedback
  FOR DELETE
  TO authenticated
  USING (public.is_current_user_admin());
