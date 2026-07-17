-- ================================================================
-- Blocus Tracker - v35 activate private social media
--
-- Apply only after the compatible frontend is deployed on Vercel. Existing
-- files are preserved; only their download path changes to signed URLs.
-- ================================================================

BEGIN;

UPDATE storage.buckets
SET public = FALSE,
    file_size_limit = 5242880,
    allowed_mime_types = ARRAY[
      'image/jpeg', 'image/png', 'image/webp', 'image/avif'
    ]::text[]
WHERE id = 'posts';

CREATE OR REPLACE FUNCTION public.validate_group_message_attachment()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_catalog
AS $$
BEGIN
  IF NEW.attachment_url IS NOT NULL
     AND (TG_OP = 'INSERT' OR NEW.attachment_url IS DISTINCT FROM OLD.attachment_url)
     AND NEW.attachment_url NOT LIKE (
       'group:' || NEW.user_id::text || '/' || NEW.group_id::text || '/%'
     ) THEN
    RAISE EXCEPTION 'Invalid private group attachment reference'
      USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_group_messages_attachment_ref ON public.group_messages;
CREATE TRIGGER trg_group_messages_attachment_ref
BEFORE INSERT OR UPDATE OF attachment_url ON public.group_messages
FOR EACH ROW EXECUTE FUNCTION public.validate_group_message_attachment();

REVOKE ALL ON FUNCTION public.validate_group_message_attachment() FROM PUBLIC, anon, authenticated;

COMMIT;
