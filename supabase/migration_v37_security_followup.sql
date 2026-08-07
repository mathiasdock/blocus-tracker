-- ================================================================
-- Blocus Tracker - v37 security follow-up
--
-- Manual migration: run once in the Supabase SQL Editor, after v36.
-- It closes the authorization, privacy and anti-abuse findings from the
-- repository-wide security review performed on 2026-08-07.
-- ================================================================

BEGIN;

-- ----------------------------------------------------------------
-- 1. Anonymous signup: exact availability lookup, no bulk directory
-- ----------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.is_pseudo_available(p_pseudo text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_pseudo text := btrim(p_pseudo);
BEGIN
  IF v_pseudo IS NULL OR char_length(v_pseudo) < 3 OR char_length(v_pseudo) > 64 THEN
    RETURN FALSE;
  END IF;

  RETURN NOT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE lower(p.pseudo) = lower(v_pseudo)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.is_pseudo_available(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_pseudo_available(text) TO anon, service_role;

DROP POLICY IF EXISTS profiles_public_pseudo_lookup ON public.profiles;
REVOKE SELECT ON TABLE public.profiles FROM anon;
REVOKE SELECT (id, pseudo) ON public.profiles FROM anon;

-- ----------------------------------------------------------------
-- 2. Direct messages: receivers may only update the read flag
-- ----------------------------------------------------------------

DROP POLICY IF EXISTS pm_update ON public.private_messages;
CREATE POLICY pm_update ON public.private_messages
FOR UPDATE TO authenticated
USING ((SELECT auth.uid()) = receiver_id)
WITH CHECK ((SELECT auth.uid()) = receiver_id);

REVOKE UPDATE ON TABLE public.private_messages FROM authenticated;
GRANT UPDATE (read) ON public.private_messages TO authenticated;

-- ----------------------------------------------------------------
-- 3. Private community media and creator-only group photo updates
-- ----------------------------------------------------------------

UPDATE storage.buckets
SET public = FALSE
WHERE id = 'community';

DROP POLICY IF EXISTS community_public_read ON storage.objects;
DROP POLICY IF EXISTS public_read_media ON storage.objects;

DROP POLICY IF EXISTS sg_update ON public.study_groups;
CREATE POLICY sg_update ON public.study_groups
FOR UPDATE TO authenticated
USING ((SELECT auth.uid()) = created_by)
WITH CHECK ((SELECT auth.uid()) = created_by);

REVOKE UPDATE ON TABLE public.study_groups FROM authenticated;
GRANT UPDATE (photo_url) ON public.study_groups TO authenticated;

-- ----------------------------------------------------------------
-- 4. Group chrono: server-owned state and locked transitions
-- ----------------------------------------------------------------

-- Open timers may have been mutated under the old broad UPDATE policy. They
-- are short-lived state, so close them instead of trusting tainted principals.
UPDATE public.group_chrono_sessions
SET status = 'cancelled', finished_at = now()
WHERE status IN ('pending', 'active', 'paused');

CREATE OR REPLACE FUNCTION public.sanitize_group_chrono_insert()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_catalog
AS $$
BEGIN
  IF auth.uid() IS NOT NULL THEN
    NEW.started_by := auth.uid();
    NEW.status := 'active';
    NEW.started_at := now();
    NEW.last_pause_at := NULL;
    NEW.total_paused_seconds := 0;
    NEW.finished_at := NULL;
    NEW.created_at := now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_group_chrono_sanitize_insert ON public.group_chrono_sessions;
CREATE TRIGGER trg_group_chrono_sanitize_insert
BEFORE INSERT ON public.group_chrono_sessions
FOR EACH ROW EXECUTE FUNCTION public.sanitize_group_chrono_insert();

REVOKE ALL ON FUNCTION public.sanitize_group_chrono_insert() FROM PUBLIC, anon, authenticated;

ALTER TABLE public.group_chrono_sessions
  DROP CONSTRAINT IF EXISTS group_chrono_sessions_status_valid;
ALTER TABLE public.group_chrono_sessions
  ADD CONSTRAINT group_chrono_sessions_status_valid
  CHECK (status IN ('pending', 'active', 'paused', 'finished', 'cancelled')) NOT VALID;

ALTER TABLE public.group_chrono_sessions
  DROP CONSTRAINT IF EXISTS group_chrono_sessions_pause_seconds_valid;
ALTER TABLE public.group_chrono_sessions
  ADD CONSTRAINT group_chrono_sessions_pause_seconds_valid
  CHECK (total_paused_seconds >= 0) NOT VALID;

ALTER TABLE public.group_chrono_sessions
  DROP CONSTRAINT IF EXISTS group_chrono_sessions_note_length;
ALTER TABLE public.group_chrono_sessions
  ADD CONSTRAINT group_chrono_sessions_note_length
  CHECK (note IS NULL OR char_length(note) <= 500) NOT VALID;

DROP POLICY IF EXISTS group_members_update_chrono ON public.group_chrono_sessions;
REVOKE UPDATE ON TABLE public.group_chrono_sessions FROM authenticated;
REVOKE INSERT ON TABLE public.group_chrono_sessions FROM authenticated;
GRANT INSERT (group_id, started_by, note, status, started_at)
  ON public.group_chrono_sessions TO authenticated;

-- DROP removes the function and its grants when the legacy overload exists;
-- IF EXISTS also keeps this migration compatible with databases where an
-- earlier hardening pass already removed it.
DROP FUNCTION IF EXISTS public.finish_group_chrono(uuid, text);

CREATE OR REPLACE FUNCTION public.finish_group_chrono(p_session_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_session public.group_chrono_sessions%ROWTYPE;
  v_duration integer;
  v_group_name text;
  v_p public.group_chrono_members%ROWTYPE;
BEGIN
  SELECT * INTO v_session
  FROM public.group_chrono_sessions
  WHERE id = p_session_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Session not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_session.status IN ('finished', 'cancelled') THEN
    RETURN;
  END IF;
  IF v_session.status NOT IN ('active', 'paused') THEN
    RAISE EXCEPTION 'Only an active or paused timer can be finished'
      USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.group_members gm
    WHERE gm.group_id = v_session.group_id
      AND gm.user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Current group membership required' USING ERRCODE = '42501';
  END IF;
  IF NOT (
    v_session.started_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.group_members gm
      WHERE gm.group_id = v_session.group_id
        AND gm.user_id = auth.uid()
        AND gm.role = 'admin'
    )
  ) THEN
    RAISE EXCEPTION 'Only the starter or a group admin can finish the timer'
      USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.group_chrono_members gcm
    WHERE gcm.session_id = p_session_id
      AND gcm.user_id = auth.uid()
      AND gcm.status = 'accepted'
  ) THEN
    RAISE EXCEPTION 'Accepted participant required' USING ERRCODE = '42501';
  END IF;

  SELECT name INTO v_group_name
  FROM public.study_groups
  WHERE id = v_session.group_id;

  IF v_session.status = 'paused' AND v_session.last_pause_at IS NOT NULL THEN
    v_duration := EXTRACT(EPOCH FROM (v_session.last_pause_at - v_session.started_at))::integer
      - v_session.total_paused_seconds;
  ELSE
    v_duration := EXTRACT(EPOCH FROM (now() - v_session.started_at))::integer
      - v_session.total_paused_seconds;
  END IF;
  v_duration := GREATEST(1, COALESCE(v_duration, 1));

  UPDATE public.group_chrono_sessions
  SET status = 'finished', finished_at = now()
  WHERE id = p_session_id;

  FOR v_p IN
    SELECT gcm.*
    FROM public.group_chrono_members gcm
    JOIN public.group_members gm
      ON gm.group_id = v_session.group_id AND gm.user_id = gcm.user_id
    WHERE gcm.session_id = p_session_id AND gcm.status = 'accepted'
  LOOP
    INSERT INTO public.sessions (
      user_id, course_id, duration_seconds, note, started_at, ended_at
    ) VALUES (
      v_p.user_id,
      NULL,
      v_duration,
      'Chrono de groupe - ' || COALESCE(v_group_name, 'Groupe'),
      v_session.started_at,
      now()
    );
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.finish_group_chrono(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.finish_group_chrono(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.pause_group_chrono(p_session_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_session public.group_chrono_sessions%ROWTYPE;
BEGIN
  SELECT * INTO v_session
  FROM public.group_chrono_sessions
  WHERE id = p_session_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Session not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_session.status <> 'active' THEN
    RAISE EXCEPTION 'Only an active timer can be paused' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.group_chrono_members gcm
    JOIN public.group_members gm
      ON gm.group_id = v_session.group_id AND gm.user_id = gcm.user_id
    WHERE gcm.session_id = p_session_id
      AND gcm.user_id = auth.uid()
      AND gcm.status = 'accepted'
  ) THEN
    RAISE EXCEPTION 'Accepted group participant required' USING ERRCODE = '42501';
  END IF;

  UPDATE public.group_chrono_sessions
  SET status = 'paused', last_pause_at = now()
  WHERE id = p_session_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.resume_group_chrono(p_session_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_session public.group_chrono_sessions%ROWTYPE;
BEGIN
  SELECT * INTO v_session
  FROM public.group_chrono_sessions
  WHERE id = p_session_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Session not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_session.status <> 'paused' OR v_session.last_pause_at IS NULL THEN
    RAISE EXCEPTION 'Only a paused timer can be resumed' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.group_chrono_members gcm
    JOIN public.group_members gm
      ON gm.group_id = v_session.group_id AND gm.user_id = gcm.user_id
    WHERE gcm.session_id = p_session_id
      AND gcm.user_id = auth.uid()
      AND gcm.status = 'accepted'
  ) THEN
    RAISE EXCEPTION 'Accepted group participant required' USING ERRCODE = '42501';
  END IF;

  UPDATE public.group_chrono_sessions
  SET status = 'active',
      total_paused_seconds = total_paused_seconds
        + GREATEST(0, EXTRACT(EPOCH FROM (now() - v_session.last_pause_at))::integer),
      last_pause_at = NULL
  WHERE id = p_session_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.cancel_group_chrono(p_session_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_session public.group_chrono_sessions%ROWTYPE;
BEGIN
  SELECT * INTO v_session
  FROM public.group_chrono_sessions
  WHERE id = p_session_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Session not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_session.status IN ('finished', 'cancelled') THEN
    RETURN;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.group_members gm
    WHERE gm.group_id = v_session.group_id
      AND gm.user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Current group membership required' USING ERRCODE = '42501';
  END IF;
  IF NOT (
    v_session.started_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.group_members gm
      WHERE gm.group_id = v_session.group_id
        AND gm.user_id = auth.uid()
        AND gm.role = 'admin'
    )
  ) THEN
    RAISE EXCEPTION 'Only the starter or a group admin can cancel the timer'
      USING ERRCODE = '42501';
  END IF;

  UPDATE public.group_chrono_sessions
  SET status = 'cancelled', finished_at = now()
  WHERE id = p_session_id;
END;
$$;

REVOKE ALL ON FUNCTION public.pause_group_chrono(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.resume_group_chrono(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.cancel_group_chrono(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pause_group_chrono(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.resume_group_chrono(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.cancel_group_chrono(uuid) TO authenticated, service_role;

ALTER TABLE public.group_chrono_members
  DROP CONSTRAINT IF EXISTS group_chrono_members_status_valid;
ALTER TABLE public.group_chrono_members
  ADD CONSTRAINT group_chrono_members_status_valid
  CHECK (status IN ('invited', 'accepted', 'declined')) NOT VALID;

DROP POLICY IF EXISTS users_insert_own_chrono_membership ON public.group_chrono_members;
CREATE POLICY users_insert_own_chrono_membership ON public.group_chrono_members
FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.group_chrono_sessions gcs
    JOIN public.group_members target_member
      ON target_member.group_id = gcs.group_id
     AND target_member.user_id = group_chrono_members.user_id
    WHERE gcs.id = group_chrono_members.session_id
      AND gcs.status IN ('pending', 'active', 'paused')
      AND (
        (
          group_chrono_members.user_id = (SELECT auth.uid())
          AND group_chrono_members.status IN ('accepted', 'declined')
        )
        OR (
          group_chrono_members.status = 'invited'
          AND (
            gcs.started_by = (SELECT auth.uid())
            OR EXISTS (
              SELECT 1 FROM public.group_members caller_member
              WHERE caller_member.group_id = gcs.group_id
                AND caller_member.user_id = (SELECT auth.uid())
                AND caller_member.role = 'admin'
            )
          )
        )
      )
  )
);

DROP POLICY IF EXISTS users_update_own_chrono_membership ON public.group_chrono_members;
CREATE POLICY users_update_own_chrono_membership ON public.group_chrono_members
FOR UPDATE TO authenticated
USING ((SELECT auth.uid()) = user_id)
WITH CHECK (
  (SELECT auth.uid()) = user_id
  AND status IN ('accepted', 'declined')
  AND EXISTS (
    SELECT 1
    FROM public.group_chrono_sessions gcs
    JOIN public.group_members gm
      ON gm.group_id = gcs.group_id AND gm.user_id = group_chrono_members.user_id
    WHERE gcs.id = group_chrono_members.session_id
      AND gcs.status IN ('pending', 'active', 'paused')
  )
);

REVOKE INSERT, UPDATE ON TABLE public.group_chrono_members FROM authenticated;
GRANT INSERT (session_id, user_id, status, joined_at) ON public.group_chrono_members TO authenticated;
GRANT UPDATE (status, joined_at) ON public.group_chrono_members TO authenticated;

-- ----------------------------------------------------------------
-- 5. Atomic database rate limits
-- ----------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.enforce_insert_rate_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
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
  PERFORM pg_advisory_xact_lock(
    hashtextextended(TG_TABLE_SCHEMA || '.' || TG_TABLE_NAME || ':' || v_uid::text, 0)
  );

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

-- ----------------------------------------------------------------
-- 6. Bound trigger-heavy study-session row cardinality
-- ----------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.validate_new_study_session()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_timezone text := COALESCE(public.gamification_timezone(NEW.user_id), 'Europe/Paris');
  v_local_day date;
  v_other_seconds bigint := 0;
  v_other_count integer := 0;
BEGIN
  IF NEW.started_at IS NULL OR NEW.ended_at IS NULL THEN
    RAISE EXCEPTION 'Session timestamps are required' USING ERRCODE = '22023';
  END IF;

  v_local_day := (NEW.started_at AT TIME ZONE v_timezone)::date;

  IF NEW.duration_seconds <= 0 OR NEW.duration_seconds > 43200 THEN
    RAISE EXCEPTION 'Session duration must be between 1 second and 12 hours'
      USING ERRCODE = '22023';
  END IF;
  IF NEW.started_at > now() + interval '5 minutes' THEN
    RAISE EXCEPTION 'Session cannot start in the future' USING ERRCODE = '22023';
  END IF;
  IF NEW.ended_at > now() + interval '5 minutes' THEN
    RAISE EXCEPTION 'Session cannot end in the future' USING ERRCODE = '22023';
  END IF;
  IF NEW.ended_at < NEW.started_at THEN
    RAISE EXCEPTION 'Session end must be after its start' USING ERRCODE = '22023';
  END IF;
  IF abs(EXTRACT(EPOCH FROM (NEW.ended_at - NEW.started_at)) - NEW.duration_seconds) > 300 THEN
    RAISE EXCEPTION 'Session timestamps do not match its duration' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtext(NEW.user_id::text),
    (v_local_day - DATE '2000-01-01')::integer
  );

  SELECT COALESCE(SUM(duration_seconds), 0), COUNT(*)
  INTO v_other_seconds, v_other_count
  FROM public.sessions s
  WHERE s.user_id = NEW.user_id
    AND s.id IS DISTINCT FROM NEW.id
    AND (s.started_at AT TIME ZONE v_timezone)::date = v_local_day;

  IF v_other_count >= 200 THEN
    RAISE EXCEPTION 'Daily study session count cannot exceed 200'
      USING ERRCODE = '22023';
  END IF;
  IF v_other_seconds + NEW.duration_seconds > 57600 THEN
    RAISE EXCEPTION 'Daily study duration cannot exceed 16 hours'
      USING ERRCODE = '22023';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.validate_new_study_session() FROM PUBLIC, anon, authenticated;

COMMIT;

-- Verification after applying:
--   1. anon cannot SELECT profiles, but is_pseudo_available works.
--   2. DM receivers can set read=true and cannot change content/created_at.
--   3. community object public URLs fail; authorized signing still works.
--   4. group chrono state changes work only through the new RPCs.
--   5. concurrent social inserts cannot exceed the configured rate limit.
