-- ================================================================
-- Blocus Tracker - v33 critical security boundaries
--
-- Backward-compatible authorization and integrity fixes. This migration
-- does not delete data and does not change Storage bucket visibility.
-- ================================================================

BEGIN;

-- ----------------------------------------------------------------
-- 1. Profiles: prevent self-admin signup and hide email from bulk reads
-- ----------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.sanitize_profile_insert()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_catalog
AS $$
BEGIN
  -- Keep service-role / SQL maintenance possible. Browser-created profiles
  -- are bound to the authenticated user and cannot choose server-owned data.
  IF auth.uid() IS NOT NULL THEN
    NEW.id := auth.uid();
    NEW.email := auth.jwt() ->> 'email';
    NEW.is_admin := FALSE;
    NEW.locked := FALSE;
    NEW.bonus_xp := 0;
    NEW.referred_by := NULL;
    NEW.referral_code := NULL;
    NEW.streak_freezes := 2;
    NEW.streak_freeze_month := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_00_profiles_sanitize_insert ON public.profiles;
CREATE TRIGGER trg_00_profiles_sanitize_insert
BEFORE INSERT ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.sanitize_profile_insert();

REVOKE ALL ON FUNCTION public.sanitize_profile_insert() FROM PUBLIC, anon, authenticated;

DROP POLICY IF EXISTS profiles_insert ON public.profiles;
CREATE POLICY profiles_insert ON public.profiles
FOR INSERT TO authenticated
WITH CHECK (
  (SELECT auth.uid()) = id
  AND email IS NOT DISTINCT FROM (SELECT auth.jwt() ->> 'email')
  AND is_admin = FALSE
  AND locked = FALSE
  AND COALESCE(bonus_xp, 0) = 0
  AND referred_by IS NULL
  AND streak_freezes = 2
  AND streak_freeze_month IS NULL
);

-- Table-level SELECT made the old column-level email REVOKE ineffective.
-- Anonymous signup keeps only the id/pseudo availability lookup.
REVOKE ALL PRIVILEGES ON TABLE public.profiles FROM anon, authenticated;
REVOKE SELECT (email) ON public.profiles FROM anon, authenticated;

GRANT SELECT (id, pseudo) ON public.profiles TO anon;
GRANT SELECT (
  id, pseudo, avatar_url, created_at, first_name, last_name, university,
  study_field, study_year, bio, planning_public, lang, locked,
  studying_since, is_admin, goal_weekly_minutes, goal_monthly_minutes,
  referral_code, referred_by, bonus_xp, timezone, streak_freezes,
  streak_freeze_month
) ON public.profiles TO authenticated;

-- Browser writes only need the fields used by signup, profile and admin UI.
GRANT INSERT (
  id, pseudo, avatar_url, first_name, last_name, university, study_field,
  study_year, bio, planning_public, lang, email, goal_weekly_minutes,
  goal_monthly_minutes, timezone
) ON public.profiles TO authenticated;
GRANT UPDATE (
  pseudo, first_name, last_name, university, study_field, study_year, bio,
  avatar_url, planning_public, lang, locked, studying_since, is_admin, email,
  goal_weekly_minutes, goal_monthly_minutes, timezone
) ON public.profiles TO authenticated;

DROP POLICY IF EXISTS profiles_read ON public.profiles;
CREATE POLICY profiles_read ON public.profiles
FOR SELECT TO authenticated
USING (TRUE);

DROP POLICY IF EXISTS profiles_public_pseudo_lookup ON public.profiles;
CREATE POLICY profiles_public_pseudo_lookup ON public.profiles
FOR SELECT TO anon
USING (TRUE);

CREATE OR REPLACE FUNCTION public.prevent_profile_privilege_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_internal boolean := COALESCE(current_setting('app.gamification_internal', true), '') = 'on';
  v_is_admin boolean := EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.is_admin = TRUE
  );
BEGIN
  NEW.id := OLD.id;
  NEW.created_at := OLD.created_at;

  IF auth.uid() = OLD.id AND OLD.locked AND NOT v_internal THEN
    RAISE EXCEPTION 'Locked profiles cannot be modified'
      USING ERRCODE = '42501';
  END IF;

  IF auth.uid() IS NOT NULL AND NOT v_internal THEN
    NEW.bonus_xp := OLD.bonus_xp;
    NEW.referred_by := OLD.referred_by;
    NEW.referral_code := OLD.referral_code;
    NEW.streak_freezes := OLD.streak_freezes;
    NEW.streak_freeze_month := OLD.streak_freeze_month;
  END IF;

  IF auth.uid() = OLD.id OR NOT v_is_admin THEN
    NEW.is_admin := OLD.is_admin;
    NEW.locked := OLD.locked;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.prevent_profile_privilege_escalation() FROM PUBLIC, anon, authenticated;

-- ----------------------------------------------------------------
-- 2. Friendships and DM references: immutable security principals
-- ----------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.prevent_friendship_party_rewrite()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_catalog
AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND (
    NEW.requester IS DISTINCT FROM OLD.requester
    OR NEW.addressee IS DISTINCT FROM OLD.addressee
  ) THEN
    RAISE EXCEPTION 'Friendship participants cannot be changed'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_friendships_immutable_parties ON public.friendships;
CREATE TRIGGER trg_friendships_immutable_parties
BEFORE UPDATE ON public.friendships
FOR EACH ROW EXECUTE FUNCTION public.prevent_friendship_party_rewrite();

REVOKE ALL ON FUNCTION public.prevent_friendship_party_rewrite() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.validate_private_message_security_fields()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_catalog
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND (
    NEW.sender_id IS DISTINCT FROM OLD.sender_id
    OR NEW.receiver_id IS DISTINCT FROM OLD.receiver_id
  ) THEN
    RAISE EXCEPTION 'Message participants cannot be changed'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.attachment_url IS NOT NULL
     AND (TG_OP = 'INSERT' OR NEW.attachment_url IS DISTINCT FROM OLD.attachment_url)
     AND NEW.attachment_url NOT LIKE ('dm:' || NEW.sender_id::text || '/%') THEN
    RAISE EXCEPTION 'Invalid DM attachment reference'
      USING ERRCODE = '22023';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_private_messages_security_fields ON public.private_messages;
CREATE TRIGGER trg_private_messages_security_fields
BEFORE INSERT OR UPDATE ON public.private_messages
FOR EACH ROW EXECUTE FUNCTION public.validate_private_message_security_fields();

REVOKE ALL ON FUNCTION public.validate_private_message_security_fields() FROM PUBLIC, anon, authenticated;

-- ----------------------------------------------------------------
-- 3. Streak freezes: atomic server-authoritative redemption
-- ----------------------------------------------------------------

DROP POLICY IF EXISTS sfd_insert ON public.streak_freeze_days;
REVOKE INSERT, UPDATE, DELETE ON public.streak_freeze_days FROM anon, authenticated;

DROP POLICY IF EXISTS sfd_select ON public.streak_freeze_days;
CREATE POLICY sfd_select ON public.streak_freeze_days
FOR SELECT TO authenticated
USING (
  public.is_friend_or_self(user_id)
  OR EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = (SELECT auth.uid()) AND p.is_admin = TRUE
  )
);

CREATE OR REPLACE FUNCTION public.redeem_streak_freezes(p_days date[])
RETURNS TABLE (remaining_stock integer, used_now integer, freeze_month text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_timezone text;
  v_today date;
  v_month text;
  v_days date[] := ARRAY[]::date[];
  v_new_days date[] := ARRAY[]::date[];
  v_stock integer;
  v_saved_month text;
  v_new_count integer := 0;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  v_timezone := COALESCE(public.gamification_timezone(v_user), 'Europe/Paris');
  v_today := (now() AT TIME ZONE v_timezone)::date;
  v_month := to_char(v_today, 'YYYY-MM');

  SELECT COALESCE(array_agg(day_value ORDER BY day_value), ARRAY[]::date[])
  INTO v_days
  FROM (
    SELECT DISTINCT d AS day_value
    FROM unnest(COALESCE(p_days, ARRAY[]::date[])) AS d
    WHERE d IS NOT NULL
  ) normalized;

  IF cardinality(v_days) > 2 THEN
    RAISE EXCEPTION 'At most two streak freezes can be redeemed'
      USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1 FROM unnest(v_days) d
    WHERE d >= v_today OR d < v_today - 31
  ) THEN
    RAISE EXCEPTION 'Freeze days must be recent past dates'
      USING ERRCODE = '22023';
  END IF;

  SELECT COALESCE(p.streak_freezes, 0), p.streak_freeze_month
  INTO v_stock, v_saved_month
  FROM public.profiles p
  WHERE p.id = v_user
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profile not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_saved_month IS DISTINCT FROM v_month THEN
    v_stock := 2;
  END IF;

  SELECT COALESCE(array_agg(d ORDER BY d), ARRAY[]::date[])
  INTO v_new_days
  FROM unnest(v_days) d
  WHERE NOT EXISTS (
    SELECT 1 FROM public.streak_freeze_days f
    WHERE f.user_id = v_user AND f.used_on = d
  );

  v_new_count := cardinality(v_new_days);
  IF v_new_count > v_stock THEN
    RAISE EXCEPTION 'Not enough streak freezes available'
      USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.streak_freeze_days (user_id, used_on)
  SELECT v_user, d FROM unnest(v_new_days) d
  ON CONFLICT (user_id, used_on) DO NOTHING;

  PERFORM set_config('app.gamification_internal', 'on', true);
  UPDATE public.profiles
  SET streak_freezes = v_stock - v_new_count,
      streak_freeze_month = v_month
  WHERE id = v_user;

  RETURN QUERY SELECT v_stock - v_new_count, v_new_count, v_month;
END;
$$;

REVOKE ALL ON FUNCTION public.redeem_streak_freezes(date[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.redeem_streak_freezes(date[]) TO authenticated, service_role;

-- ----------------------------------------------------------------
-- 4. Sessions: no future completion and serialized daily cap
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

  -- Serialize writes for one user/local-day so concurrent inserts cannot both
  -- observe the same pre-insert daily total.
  PERFORM pg_advisory_xact_lock(
    hashtext(NEW.user_id::text),
    (v_local_day - DATE '2000-01-01')::integer
  );

  SELECT COALESCE(SUM(duration_seconds), 0)
  INTO v_other_seconds
  FROM public.sessions s
  WHERE s.user_id = NEW.user_id
    AND s.id IS DISTINCT FROM NEW.id
    AND (s.started_at AT TIME ZONE v_timezone)::date = v_local_day;

  IF v_other_seconds + NEW.duration_seconds > 57600 THEN
    RAISE EXCEPTION 'Daily study duration cannot exceed 16 hours'
      USING ERRCODE = '22023';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.validate_new_study_session() FROM PUBLIC, anon, authenticated;

-- ----------------------------------------------------------------
-- 5. Group chrono: lock before checking/finishing to prevent duplicates
-- ----------------------------------------------------------------

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
    RAISE EXCEPTION 'Session not found';
  END IF;

  IF v_session.status IN ('finished', 'cancelled') THEN
    RETURN;
  END IF;

  IF NOT (
    v_session.started_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.group_members
      WHERE group_id = v_session.group_id
        AND user_id = auth.uid()
        AND role = 'admin'
    )
  ) THEN
    RAISE EXCEPTION 'Only the creator or a group admin can finish the timer'
      USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.group_chrono_members
    WHERE session_id = p_session_id
      AND user_id = auth.uid()
      AND status = 'accepted'
  ) THEN
    RAISE EXCEPTION 'Accepted participant required' USING ERRCODE = '42501';
  END IF;

  SELECT name INTO v_group_name
  FROM public.study_groups
  WHERE id = v_session.group_id;

  IF v_session.started_at IS NULL THEN
    v_duration := 0;
  ELSIF v_session.status = 'paused' AND v_session.last_pause_at IS NOT NULL THEN
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
    SELECT * FROM public.group_chrono_members
    WHERE session_id = p_session_id AND status = 'accepted'
  LOOP
    INSERT INTO public.sessions (
      user_id, course_id, duration_seconds, note, started_at, ended_at
    ) VALUES (
      v_p.user_id,
      NULL,
      v_duration,
      'Chrono de groupe - ' || COALESCE(v_group_name, 'Groupe'),
      COALESCE(v_session.started_at, now()),
      now()
    );
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.finish_group_chrono(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.finish_group_chrono(uuid) TO authenticated, service_role;

COMMIT;
