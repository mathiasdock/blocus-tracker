-- Migration v21 : in-app admin announcements
-- Lets admins publish lightweight announcements shown in every user's
-- notification panel. Dismissal is handled client-side (localStorage) in V1.
--
-- Manual execution only (Supabase SQL Editor). Do NOT run automatically.

CREATE TABLE IF NOT EXISTS public.app_announcements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL
    CHECK (char_length(btrim(title)) BETWEEN 1 AND 120),
  message text NOT NULL
    CHECK (char_length(btrim(message)) BETWEEN 1 AND 500),
  type text NOT NULL DEFAULT 'info'
    CHECK (type IN ('new', 'info', 'important')),
  href text
    CHECK (href IS NULL OR char_length(href) <= 300),
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_app_announcements_active_created_at
  ON public.app_announcements(is_active, created_at DESC);

-- Admin helper (idempotent — also defined in migration_v20_app_feedback.sql).
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

-- Keep updated_at fresh on every update.
CREATE OR REPLACE FUNCTION public.app_announcements_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_app_announcements_updated_at ON public.app_announcements;
CREATE TRIGGER trg_app_announcements_updated_at
BEFORE UPDATE ON public.app_announcements
FOR EACH ROW
EXECUTE FUNCTION public.app_announcements_set_updated_at();

ALTER TABLE public.app_announcements ENABLE ROW LEVEL SECURITY;

-- Authenticated users can read ACTIVE announcements; admins can read all.
DROP POLICY IF EXISTS "app_announcements_select_active_or_admin" ON public.app_announcements;
CREATE POLICY "app_announcements_select_active_or_admin" ON public.app_announcements
  FOR SELECT
  TO authenticated
  USING (
    is_active = true
    OR public.is_current_user_admin()
  );

-- Only admins can create.
DROP POLICY IF EXISTS "app_announcements_insert_admin" ON public.app_announcements;
CREATE POLICY "app_announcements_insert_admin" ON public.app_announcements
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_current_user_admin());

-- Only admins can update.
DROP POLICY IF EXISTS "app_announcements_update_admin" ON public.app_announcements;
CREATE POLICY "app_announcements_update_admin" ON public.app_announcements
  FOR UPDATE
  TO authenticated
  USING (public.is_current_user_admin())
  WITH CHECK (public.is_current_user_admin());

-- Only admins can delete.
DROP POLICY IF EXISTS "app_announcements_delete_admin" ON public.app_announcements;
CREATE POLICY "app_announcements_delete_admin" ON public.app_announcements
  FOR DELETE
  TO authenticated
  USING (public.is_current_user_admin());
