-- ================================================================
-- Blocus Tracker - v34 prepare private group media
--
-- Safe to apply before the frontend deployment: it only prepares the new
-- private bucket. The old frontend continues using community unchanged.
-- ================================================================

BEGIN;

INSERT INTO storage.buckets (
  id, name, public, file_size_limit, allowed_mime_types
) VALUES (
  'group',
  'group',
  FALSE,
  8388608,
  ARRAY[
    'image/jpeg', 'image/png', 'image/webp', 'image/avif',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ]::text[]
)
ON CONFLICT (id) DO UPDATE
SET public = EXCLUDED.public,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS group_auth_write ON storage.objects;
CREATE POLICY group_auth_write ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'group'
  AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
);

DROP POLICY IF EXISTS group_update_own ON storage.objects;
CREATE POLICY group_update_own ON storage.objects
FOR UPDATE TO authenticated
USING (
  bucket_id = 'group'
  AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
)
WITH CHECK (
  bucket_id = 'group'
  AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
);

DROP POLICY IF EXISTS group_delete_own ON storage.objects;
CREATE POLICY group_delete_own ON storage.objects
FOR DELETE TO authenticated
USING (
  bucket_id = 'group'
  AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
);

-- Reads will be served by /api/storage/sign after checking group membership.
DROP POLICY IF EXISTS group_read_own_uploads ON storage.objects;
CREATE POLICY group_read_own_uploads ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'group'
  AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
);

COMMIT;
