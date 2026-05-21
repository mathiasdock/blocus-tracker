-- ============================================================
--  Private messaging between friends
-- ============================================================

CREATE TABLE IF NOT EXISTS public.private_messages (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  receiver_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content         text,
  attachment_url  text,
  attachment_type text,
  attachment_name text,
  read            boolean NOT NULL DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS pm_convo_idx
  ON public.private_messages (sender_id, receiver_id, created_at);

ALTER TABLE public.private_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pm_select" ON public.private_messages;
DROP POLICY IF EXISTS "pm_insert" ON public.private_messages;
DROP POLICY IF EXISTS "pm_update" ON public.private_messages;
DROP POLICY IF EXISTS "pm_delete" ON public.private_messages;

CREATE POLICY "pm_select" ON public.private_messages
  FOR SELECT TO authenticated
  USING (auth.uid() = sender_id OR auth.uid() = receiver_id);

CREATE POLICY "pm_insert" ON public.private_messages
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = sender_id);

CREATE POLICY "pm_update" ON public.private_messages
  FOR UPDATE TO authenticated
  USING (auth.uid() = receiver_id);

CREATE POLICY "pm_delete" ON public.private_messages
  FOR DELETE TO authenticated
  USING (auth.uid() = sender_id);

-- Storage bucket for DM attachments
INSERT INTO storage.buckets (id, name, public)
VALUES ('dm', 'dm', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "dm_public_read"  ON storage.objects;
DROP POLICY IF EXISTS "dm_auth_write"   ON storage.objects;
DROP POLICY IF EXISTS "dm_auth_delete"  ON storage.objects;

CREATE POLICY "dm_public_read" ON storage.objects
  FOR SELECT USING (bucket_id = 'dm');

CREATE POLICY "dm_auth_write" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'dm' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "dm_auth_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'dm' AND (storage.foldername(name))[1] = auth.uid()::text);
