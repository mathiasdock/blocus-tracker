-- ================================================================
--  blocus-tracker — migration v24 : security hardening
--
--  Non destructive:
--    - tightens RPC EXECUTE grants;
--    - removes broad Storage listing policies;
--    - sets bucket MIME/size limits;
--    - adds NOT VALID text constraints for future writes;
--    - adds lightweight DB-side insert rate limits for social actions.
--
--  A executer dans Supabase SQL Editor apres revue.
-- ================================================================

-- ---------------------------------------------------------------
-- 1. RPC / SECURITY DEFINER exposure
-- ---------------------------------------------------------------

DO $$
BEGIN
  -- Admin-only RPCs: callable by signed-in users, guarded again inside the function.
  BEGIN
    REVOKE ALL ON FUNCTION public.admin_delete_user(uuid) FROM PUBLIC, anon;
    GRANT EXECUTE ON FUNCTION public.admin_delete_user(uuid) TO authenticated, service_role;
  EXCEPTION WHEN undefined_function THEN NULL; END;

  BEGIN
    REVOKE ALL ON FUNCTION public.admin_get_referral_counts() FROM PUBLIC, anon;
    GRANT EXECUTE ON FUNCTION public.admin_get_referral_counts() TO authenticated, service_role;
  EXCEPTION WHEN undefined_function THEN NULL; END;

  BEGIN
    REVOKE ALL ON FUNCTION public.admin_get_referrals(uuid) FROM PUBLIC, anon;
    GRANT EXECUTE ON FUNCTION public.admin_get_referrals(uuid) TO authenticated, service_role;
  EXCEPTION WHEN undefined_function THEN NULL; END;

  -- Login email lookup must not be exposed to ordinary clients.
  BEGIN
    REVOKE ALL ON FUNCTION public.get_login_email(text) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.get_login_email(text) TO service_role;
  EXCEPTION WHEN undefined_function THEN NULL; END;

  -- Authenticated app RPCs.
  BEGIN
    REVOKE ALL ON FUNCTION public.apply_referral(text) FROM PUBLIC, anon;
    GRANT EXECUTE ON FUNCTION public.apply_referral(text) TO authenticated, service_role;
  EXCEPTION WHEN undefined_function THEN NULL; END;

  BEGIN
    REVOKE ALL ON FUNCTION public.get_my_referral_stats() FROM PUBLIC, anon;
    GRANT EXECUTE ON FUNCTION public.get_my_referral_stats() TO authenticated, service_role;
  EXCEPTION WHEN undefined_function THEN NULL; END;

  BEGIN
    REVOKE ALL ON FUNCTION public.get_my_study_rank(text) FROM PUBLIC, anon;
    GRANT EXECUTE ON FUNCTION public.get_my_study_rank(text) TO authenticated, service_role;
  EXCEPTION WHEN undefined_function THEN NULL; END;

  BEGIN
    REVOKE ALL ON FUNCTION public.get_public_leaderboard(text) FROM PUBLIC, anon;
    GRANT EXECUTE ON FUNCTION public.get_public_leaderboard(text) TO authenticated, service_role;
  EXCEPTION WHEN undefined_function THEN NULL; END;

  BEGIN
    REVOKE ALL ON FUNCTION public.get_public_leaderboard(text, text) FROM PUBLIC, anon;
    GRANT EXECUTE ON FUNCTION public.get_public_leaderboard(text, text) TO authenticated, service_role;
  EXCEPTION WHEN undefined_function THEN NULL; END;

  BEGIN
    REVOKE ALL ON FUNCTION public.get_user_profile_stats(uuid) FROM PUBLIC, anon;
    GRANT EXECUTE ON FUNCTION public.get_user_profile_stats(uuid) TO authenticated, service_role;
  EXCEPTION WHEN undefined_function THEN NULL; END;

  BEGIN
    REVOKE ALL ON FUNCTION public.get_my_email() FROM PUBLIC, anon;
    GRANT EXECUTE ON FUNCTION public.get_my_email() TO authenticated, service_role;
  EXCEPTION WHEN undefined_function THEN NULL; END;

  -- RLS helper functions: authenticated only.
  BEGIN
    REVOKE ALL ON FUNCTION public.can_access_community(text) FROM PUBLIC, anon;
    GRANT EXECUTE ON FUNCTION public.can_access_community(text) TO authenticated, service_role;
  EXCEPTION WHEN undefined_function THEN NULL; END;

  BEGIN
    REVOKE ALL ON FUNCTION public.is_current_user_admin() FROM PUBLIC, anon;
    GRANT EXECUTE ON FUNCTION public.is_current_user_admin() TO authenticated, service_role;
  EXCEPTION WHEN undefined_function THEN NULL; END;

  BEGIN
    REVOKE ALL ON FUNCTION public.is_friend_or_self(uuid) FROM PUBLIC, anon;
    GRANT EXECUTE ON FUNCTION public.is_friend_or_self(uuid) TO authenticated, service_role;
  EXCEPTION WHEN undefined_function THEN NULL; END;

  BEGIN
    REVOKE ALL ON FUNCTION public.is_group_admin(uuid) FROM PUBLIC, anon;
    GRANT EXECUTE ON FUNCTION public.is_group_admin(uuid) TO authenticated, service_role;
  EXCEPTION WHEN undefined_function THEN NULL; END;

  BEGIN
    REVOKE ALL ON FUNCTION public.is_group_member(uuid) FROM PUBLIC, anon;
    GRANT EXECUTE ON FUNCTION public.is_group_member(uuid) TO authenticated, service_role;
  EXCEPTION WHEN undefined_function THEN NULL; END;

  BEGIN
    REVOKE ALL ON FUNCTION public.finish_group_chrono(uuid) FROM PUBLIC, anon;
    GRANT EXECUTE ON FUNCTION public.finish_group_chrono(uuid) TO authenticated, service_role;
  EXCEPTION WHEN undefined_function THEN NULL; END;

  BEGIN
    REVOKE ALL ON FUNCTION public.finish_group_chrono(uuid, text) FROM PUBLIC, anon;
    GRANT EXECUTE ON FUNCTION public.finish_group_chrono(uuid, text) TO authenticated, service_role;
  EXCEPTION WHEN undefined_function THEN NULL; END;

  -- Trigger/internal functions: not callable over REST.
  BEGIN REVOKE ALL ON FUNCTION public.prevent_profile_privilege_escalation() FROM PUBLIC, anon, authenticated; EXCEPTION WHEN undefined_function THEN NULL; END;
  BEGIN REVOKE ALL ON FUNCTION public.prevent_session_duration_increase() FROM PUBLIC, anon, authenticated; EXCEPTION WHEN undefined_function THEN NULL; END;
  BEGIN REVOKE ALL ON FUNCTION public.referrals_revoke_xp_on_delete() FROM PUBLIC, anon, authenticated; EXCEPTION WHEN undefined_function THEN NULL; END;
  BEGIN REVOKE ALL ON FUNCTION public.sync_auth_email_to_profile() FROM PUBLIC, anon, authenticated; EXCEPTION WHEN undefined_function THEN NULL; END;
  BEGIN REVOKE ALL ON FUNCTION public.profiles_set_referral_code() FROM PUBLIC, anon, authenticated; EXCEPTION WHEN undefined_function THEN NULL; END;
  BEGIN REVOKE ALL ON FUNCTION public.gen_referral_code() FROM PUBLIC, anon, authenticated; EXCEPTION WHEN undefined_function THEN NULL; END;
  BEGIN REVOKE ALL ON FUNCTION public.referral_mission_active(uuid, text) FROM PUBLIC, anon, authenticated; EXCEPTION WHEN undefined_function THEN NULL; END;
  BEGIN REVOKE ALL ON FUNCTION public.app_announcements_set_updated_at() FROM PUBLIC, anon, authenticated; EXCEPTION WHEN undefined_function THEN NULL; END;
  BEGIN REVOKE ALL ON FUNCTION public.app_feedback_set_updated_at() FROM PUBLIC, anon, authenticated; EXCEPTION WHEN undefined_function THEN NULL; END;
  BEGIN REVOKE ALL ON FUNCTION public.course_checklist_set_updated_at() FROM PUBLIC, anon, authenticated; EXCEPTION WHEN undefined_function THEN NULL; END;
END $$;

-- Emails are private: clients can read their own email through get_my_email().
REVOKE SELECT (email) ON public.profiles FROM anon, authenticated;
GRANT SELECT (email) ON public.profiles TO service_role;

-- ---------------------------------------------------------------
-- 2. Storage buckets: type/size limits + no broad listing
-- ---------------------------------------------------------------

UPDATE storage.buckets
SET
  public = true,
  file_size_limit = 3145728,
  allowed_mime_types = ARRAY['image/jpeg','image/png','image/webp','image/avif']::text[]
WHERE id = 'avatars';

UPDATE storage.buckets
SET
  public = true,
  file_size_limit = 5242880,
  allowed_mime_types = ARRAY['image/jpeg','image/png','image/webp','image/avif']::text[]
WHERE id = 'posts';

UPDATE storage.buckets
SET
  public = true,
  file_size_limit = 8388608,
  allowed_mime_types = ARRAY[
    'image/jpeg','image/png','image/webp','image/avif',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ]::text[]
WHERE id = 'community';

UPDATE storage.buckets
SET
  public = false,
  file_size_limit = 8388608,
  allowed_mime_types = ARRAY[
    'image/jpeg','image/png','image/webp','image/avif',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ]::text[]
WHERE id = 'dm';

DROP POLICY IF EXISTS "community_public_read" ON storage.objects;
DROP POLICY IF EXISTS "public_read_media" ON storage.objects;
DROP POLICY IF EXISTS "dm_public_read" ON storage.objects;
DROP POLICY IF EXISTS "dm_read_authenticated" ON storage.objects;
DROP POLICY IF EXISTS "dm_read_own" ON storage.objects;

-- New DM reads are handled by /api/storage/sign after checking private_messages.
-- Direct Storage SELECT remains available only to the uploader's own folder.
DROP POLICY IF EXISTS "dm_read_own_uploads" ON storage.objects;
CREATE POLICY "dm_read_own_uploads" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'dm'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- ---------------------------------------------------------------
-- 3. Text, enum and attachment constraints for future writes
-- ---------------------------------------------------------------

ALTER TABLE public.posts DROP CONSTRAINT IF EXISTS posts_caption_length;
ALTER TABLE public.posts ADD CONSTRAINT posts_caption_length
  CHECK (caption IS NULL OR char_length(caption) <= 500) NOT VALID;

ALTER TABLE public.posts DROP CONSTRAINT IF EXISTS posts_visibility_valid;
ALTER TABLE public.posts ADD CONSTRAINT posts_visibility_valid
  CHECK (visibility IN ('public', 'friends')) NOT VALID;

ALTER TABLE public.comments DROP CONSTRAINT IF EXISTS comments_content_length;
ALTER TABLE public.comments ADD CONSTRAINT comments_content_length
  CHECK (char_length(content) BETWEEN 1 AND 500) NOT VALID;

ALTER TABLE public.private_messages DROP CONSTRAINT IF EXISTS private_messages_content_length;
ALTER TABLE public.private_messages ADD CONSTRAINT private_messages_content_length
  CHECK (content IS NULL OR char_length(content) <= 1000) NOT VALID;

ALTER TABLE public.group_messages DROP CONSTRAINT IF EXISTS group_messages_content_length;
ALTER TABLE public.group_messages ADD CONSTRAINT group_messages_content_length
  CHECK (content IS NULL OR char_length(content) <= 1000) NOT VALID;

ALTER TABLE public.community_messages DROP CONSTRAINT IF EXISTS community_messages_content_length;
ALTER TABLE public.community_messages ADD CONSTRAINT community_messages_content_length
  CHECK (content IS NULL OR char_length(content) <= 1100) NOT VALID;

ALTER TABLE public.private_messages DROP CONSTRAINT IF EXISTS private_messages_attachment_type_valid;
ALTER TABLE public.private_messages ADD CONSTRAINT private_messages_attachment_type_valid
  CHECK (attachment_type IS NULL OR attachment_type IN ('image', 'file')) NOT VALID;

ALTER TABLE public.group_messages DROP CONSTRAINT IF EXISTS group_messages_attachment_type_valid;
ALTER TABLE public.group_messages ADD CONSTRAINT group_messages_attachment_type_valid
  CHECK (attachment_type IS NULL OR attachment_type IN ('image', 'file')) NOT VALID;

ALTER TABLE public.community_messages DROP CONSTRAINT IF EXISTS community_messages_attachment_type_valid;
ALTER TABLE public.community_messages ADD CONSTRAINT community_messages_attachment_type_valid
  CHECK (attachment_type IS NULL OR attachment_type IN ('image', 'file')) NOT VALID;

-- ---------------------------------------------------------------
-- 4. Lightweight DB-side insert rate limits for social actions
-- ---------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_posts_user_created_at ON public.posts(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_comments_user_created_at ON public.comments(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_likes_user_created_at ON public.likes(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_private_messages_sender_created_at ON public.private_messages(sender_id, created_at);
CREATE INDEX IF NOT EXISTS idx_group_messages_user_created_at ON public.group_messages(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_community_messages_user_created_at ON public.community_messages(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_friendships_requester_created_at ON public.friendships(requester, created_at);

CREATE OR REPLACE FUNCTION public.enforce_insert_rate_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_column text := TG_ARGV[0];
  v_max integer := TG_ARGV[1]::integer;
  v_window_seconds integer := TG_ARGV[2]::integer;
  v_uid uuid := auth.uid();
  v_actor uuid;
  v_count integer;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  v_actor := (to_jsonb(NEW)->>v_actor_column)::uuid;
  IF v_actor IS DISTINCT FROM v_uid THEN
    RAISE EXCEPTION 'Forbidden actor' USING ERRCODE = '42501';
  END IF;

  NEW.created_at := now();

  EXECUTE format(
    'SELECT count(*) FROM %I.%I WHERE %I = $1 AND created_at >= now() - ($2 * interval ''1 second'')',
    TG_TABLE_SCHEMA,
    TG_TABLE_NAME,
    v_actor_column
  )
  INTO v_count
  USING v_uid, v_window_seconds;

  IF v_count >= v_max THEN
    RAISE EXCEPTION 'Rate limit exceeded' USING ERRCODE = '42900';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_insert_rate_limit() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_posts_insert_rate_limit ON public.posts;
CREATE TRIGGER trg_posts_insert_rate_limit
  BEFORE INSERT ON public.posts
  FOR EACH ROW EXECUTE FUNCTION public.enforce_insert_rate_limit('user_id', '6', '3600');

DROP TRIGGER IF EXISTS trg_comments_insert_rate_limit ON public.comments;
CREATE TRIGGER trg_comments_insert_rate_limit
  BEFORE INSERT ON public.comments
  FOR EACH ROW EXECUTE FUNCTION public.enforce_insert_rate_limit('user_id', '30', '60');

DROP TRIGGER IF EXISTS trg_likes_insert_rate_limit ON public.likes;
CREATE TRIGGER trg_likes_insert_rate_limit
  BEFORE INSERT ON public.likes
  FOR EACH ROW EXECUTE FUNCTION public.enforce_insert_rate_limit('user_id', '120', '60');

DROP TRIGGER IF EXISTS trg_private_messages_insert_rate_limit ON public.private_messages;
CREATE TRIGGER trg_private_messages_insert_rate_limit
  BEFORE INSERT ON public.private_messages
  FOR EACH ROW EXECUTE FUNCTION public.enforce_insert_rate_limit('sender_id', '60', '60');

DROP TRIGGER IF EXISTS trg_group_messages_insert_rate_limit ON public.group_messages;
CREATE TRIGGER trg_group_messages_insert_rate_limit
  BEFORE INSERT ON public.group_messages
  FOR EACH ROW EXECUTE FUNCTION public.enforce_insert_rate_limit('user_id', '60', '60');

DROP TRIGGER IF EXISTS trg_community_messages_insert_rate_limit ON public.community_messages;
CREATE TRIGGER trg_community_messages_insert_rate_limit
  BEFORE INSERT ON public.community_messages
  FOR EACH ROW EXECUTE FUNCTION public.enforce_insert_rate_limit('user_id', '40', '60');

DROP TRIGGER IF EXISTS trg_friendships_insert_rate_limit ON public.friendships;
CREATE TRIGGER trg_friendships_insert_rate_limit
  BEFORE INSERT ON public.friendships
  FOR EACH ROW EXECUTE FUNCTION public.enforce_insert_rate_limit('requester', '20', '3600');

-- ---------------------------------------------------------------
-- 5. Cleanup duplicate legacy policies
-- ---------------------------------------------------------------

DROP POLICY IF EXISTS "admin_delete_cmsg" ON public.community_messages;
DROP POLICY IF EXISTS "gm_delete" ON public.group_messages;

-- ================================================================
-- Verification after applying:
--   1. Run Supabase Security Advisor again.
--   2. Upload avatar/post/community file with allowed image/PDF.
--   3. Verify SVG/HTML/JS upload is rejected.
--   4. Verify a DM attachment is readable by sender/receiver via signed URL.
--   5. Verify an unrelated authenticated user cannot sign the same DM path.
-- ================================================================
