-- Migration v22 : per-course revision checklists
-- Each user owns a private checklist of revision tasks for each of their courses.
-- Manual execution only (Supabase SQL Editor). Do NOT run automatically.

CREATE TABLE IF NOT EXISTS public.course_checklist_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  course_id uuid NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  title text NOT NULL
    CHECK (char_length(btrim(title)) BETWEEN 1 AND 200),
  is_done boolean NOT NULL DEFAULT false,
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_course_checklist_user_course
  ON public.course_checklist_items(user_id, course_id, position);

-- Keep updated_at fresh on every update.
CREATE OR REPLACE FUNCTION public.course_checklist_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_course_checklist_updated_at ON public.course_checklist_items;
CREATE TRIGGER trg_course_checklist_updated_at
BEFORE UPDATE ON public.course_checklist_items
FOR EACH ROW
EXECUTE FUNCTION public.course_checklist_set_updated_at();

ALTER TABLE public.course_checklist_items ENABLE ROW LEVEL SECURITY;

-- Owner-only access: a user can only see and manage their own tasks.
DROP POLICY IF EXISTS "course_checklist_select_own" ON public.course_checklist_items;
CREATE POLICY "course_checklist_select_own" ON public.course_checklist_items
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- INSERT: must own the row AND the referenced course.
DROP POLICY IF EXISTS "course_checklist_insert_own" ON public.course_checklist_items;
CREATE POLICY "course_checklist_insert_own" ON public.course_checklist_items
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.courses c
      WHERE c.id = course_id AND c.user_id = auth.uid()
    )
  );

-- UPDATE: same ownership guarantee on the resulting row (prevents moving an
-- item onto a course the user does not own).
DROP POLICY IF EXISTS "course_checklist_update_own" ON public.course_checklist_items;
CREATE POLICY "course_checklist_update_own" ON public.course_checklist_items
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.courses c
      WHERE c.id = course_id AND c.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "course_checklist_delete_own" ON public.course_checklist_items;
CREATE POLICY "course_checklist_delete_own" ON public.course_checklist_items
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id);
