-- ================================================================
-- Blocus Tracker - v28 gamification integrity
--
-- Server-authoritative XP levels, badge awards and daily missions.
-- Existing sessions and badges are preserved. Historical sessions that do
-- not satisfy the new validation rules remain untouched.
-- ================================================================

BEGIN;

-- ----------------------------------------------------------------
-- 1. User timezone and friendship acceptance timestamp
-- ----------------------------------------------------------------

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS timezone text NOT NULL DEFAULT 'Europe/Paris';

ALTER TABLE public.friendships
  ADD COLUMN IF NOT EXISTS accepted_at timestamptz;

UPDATE public.friendships
SET accepted_at = created_at
WHERE status = 'accepted' AND accepted_at IS NULL;

CREATE OR REPLACE FUNCTION public.set_friendship_accepted_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'accepted'
     AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'accepted') THEN
    NEW.accepted_at := COALESCE(NEW.accepted_at, now());
  ELSIF NEW.status <> 'accepted' THEN
    NEW.accepted_at := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_friendship_accepted_at ON public.friendships;
CREATE TRIGGER set_friendship_accepted_at
BEFORE INSERT OR UPDATE OF status ON public.friendships
FOR EACH ROW EXECUTE FUNCTION public.set_friendship_accepted_at();

REVOKE ALL ON FUNCTION public.set_friendship_accepted_at() FROM PUBLIC, anon, authenticated;

-- ----------------------------------------------------------------
-- 2. Protect server-owned profile fields
-- ----------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.prevent_profile_privilege_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_internal boolean := COALESCE(current_setting('app.gamification_internal', true), '') = 'on';
BEGIN
  NEW.id         := OLD.id;
  NEW.created_at := OLD.created_at;

  -- These fields are written only by trusted database functions. SQL editor
  -- and service-role maintenance have auth.uid() = NULL and remain possible.
  IF auth.uid() IS NOT NULL AND NOT v_internal THEN
    NEW.bonus_xp     := OLD.bonus_xp;
    NEW.referred_by  := OLD.referred_by;
    NEW.referral_code := OLD.referral_code;
  END IF;

  IF auth.uid() = OLD.id
     OR NOT EXISTS (
       SELECT 1 FROM public.profiles
       WHERE id = auth.uid() AND is_admin = TRUE
     ) THEN
    NEW.is_admin := OLD.is_admin;
    NEW.locked   := OLD.locked;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS prevent_profile_privilege_escalation ON public.profiles;
CREATE TRIGGER prevent_profile_privilege_escalation
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.prevent_profile_privilege_escalation();

REVOKE UPDATE ON public.profiles FROM authenticated;
GRANT UPDATE (
  pseudo, first_name, last_name, university, study_field, study_year, bio,
  avatar_url, planning_public, lang, locked, studying_since, is_admin, email,
  goal_weekly_minutes, goal_monthly_minutes, timezone
) ON public.profiles TO authenticated;

-- ----------------------------------------------------------------
-- 3. Server-owned XP ledger and daily mission assignments
-- ----------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.xp_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source text NOT NULL,
  source_key text NOT NULL,
  xp integer NOT NULL CHECK (xp > 0 AND xp <= 1000),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, source, source_key)
);

CREATE INDEX IF NOT EXISTS idx_xp_ledger_user_created
  ON public.xp_ledger(user_id, created_at DESC);

ALTER TABLE public.xp_ledger ENABLE ROW LEVEL SECURITY;
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

REVOKE ALL ON public.xp_ledger FROM anon, authenticated;
GRANT SELECT ON public.xp_ledger TO authenticated;
GRANT ALL ON public.xp_ledger TO service_role;

CREATE TABLE IF NOT EXISTS public.daily_mission_assignments (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  mission_date date NOT NULL,
  slot smallint NOT NULL CHECK (slot BETWEEN 1 AND 4),
  mission_id text NOT NULL,
  xp integer NOT NULL CHECK (xp > 0 AND xp <= 600),
  timezone_snapshot text NOT NULL,
  completed_at timestamptz,
  claimed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, mission_date, mission_id),
  UNIQUE (user_id, mission_date, slot)
);

CREATE INDEX IF NOT EXISTS idx_daily_missions_user_date
  ON public.daily_mission_assignments(user_id, mission_date DESC);

ALTER TABLE public.daily_mission_assignments ENABLE ROW LEVEL SECURITY;
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

REVOKE ALL ON public.daily_mission_assignments FROM anon, authenticated;
GRANT SELECT ON public.daily_mission_assignments TO authenticated;
GRANT ALL ON public.daily_mission_assignments TO service_role;

-- user_badges is now server-owned. Users can read their own rows and admins
-- can inspect all rows, but no browser client can award or remove a badge.
DROP POLICY IF EXISTS user_badges_own ON public.user_badges;
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

REVOKE ALL ON public.user_badges FROM anon, authenticated;
GRANT SELECT ON public.user_badges TO authenticated;
GRANT ALL ON public.user_badges TO service_role;

-- ----------------------------------------------------------------
-- 4. Timezone and progression helpers (internal only)
-- ----------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.gamification_timezone(p_user_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT CASE
    WHEN EXISTS (
      SELECT 1 FROM pg_timezone_names z
      WHERE z.name = COALESCE(p.timezone, 'Europe/Paris')
    ) THEN COALESCE(p.timezone, 'Europe/Paris')
    ELSE 'Europe/Paris'
  END
  FROM public.profiles p
  WHERE p.id = p_user_id;
$$;

CREATE OR REPLACE FUNCTION public.gamification_current_streak(p_user_id uuid)
RETURNS integer
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_timezone text := COALESCE(public.gamification_timezone(p_user_id), 'Europe/Paris');
  v_today date := (now() AT TIME ZONE v_timezone)::date;
  v_cursor date;
  v_streak integer := 0;
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.sessions s
    WHERE s.user_id = p_user_id
      AND (s.started_at AT TIME ZONE v_timezone)::date = v_today
  ) THEN
    v_cursor := v_today;
  ELSE
    v_cursor := v_today - 1;
  END IF;

  WHILE v_streak < 366 LOOP
    EXIT WHEN NOT EXISTS (
      SELECT 1 FROM public.sessions s
      WHERE s.user_id = p_user_id
        AND (s.started_at AT TIME ZONE v_timezone)::date = v_cursor
    );
    v_streak := v_streak + 1;
    v_cursor := v_cursor - 1;
  END LOOP;

  RETURN v_streak;
END;
$$;

CREATE OR REPLACE FUNCTION public.gamification_level_threshold(p_level integer)
RETURNS integer
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_catalog
AS $$
  SELECT (ARRAY[
    0, 400, 1000, 1800, 2800, 4000, 5600, 7600, 10000, 13000,
    17000, 22000, 28000, 35000, 43000, 52000, 62000, 73000,
    86000, 100000
  ])[GREATEST(1, LEAST(20, p_level))];
$$;

CREATE OR REPLACE FUNCTION public.gamification_level_for_xp(p_xp bigint)
RETURNS integer
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_catalog
AS $$
  SELECT COALESCE(MAX(level), 1)
  FROM generate_series(1, 20) AS level
  WHERE public.gamification_level_threshold(level) <= GREATEST(p_xp, 0);
$$;

CREATE OR REPLACE FUNCTION public.gamification_hash_index(
  p_seed text,
  p_count integer
)
RETURNS integer
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_catalog
AS $$
  SELECT CASE WHEN p_count <= 1 THEN 1 ELSE
    (mod(abs(hashtextextended(COALESCE(p_seed, ''), 0)::numeric), p_count)::integer + 1)
  END;
$$;

CREATE OR REPLACE FUNCTION public.gamification_mission_xp(p_mission_id text)
RETURNS integer
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_catalog
AS $$
  SELECT CASE p_mission_id
    WHEN 'm_25m' THEN 20
    WHEN 'm_1h' THEN 40
    WHEN 'm_2h' THEN 80
    WHEN 'm_3h' THEN 130
    WHEN 'm_s25' THEN 30
    WHEN 'm_s50' THEN 55
    WHEN 'm_s90' THEN 100
    WHEN 'm_two_sessions' THEN 40
    WHEN 'm_2courses' THEN 40
    WHEN 'm_obj1' THEN 50
    WHEN 'm_obj2' THEN 100
    WHEN 'm_newobj' THEN 30
    WHEN 'm_streak' THEN 50
    WHEN 'm_noon' THEN 60
    WHEN 'm_note' THEN 30
    WHEN 'm_referral' THEN 600
    ELSE 0
  END;
$$;

REVOKE ALL ON FUNCTION public.gamification_timezone(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.gamification_current_streak(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.gamification_level_threshold(integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.gamification_level_for_xp(bigint) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.gamification_hash_index(text, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.gamification_mission_xp(text) FROM PUBLIC, anon, authenticated;

-- ----------------------------------------------------------------
-- 5. Server-side badge awarder and backfill
-- ----------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.award_badges_for_user(p_user_id uuid)
RETURNS text[]
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_timezone text := COALESCE(public.gamification_timezone(p_user_id), 'Europe/Paris');
  v_session_count integer := 0;
  v_total_hours numeric := 0;
  v_max_daily_hours numeric := 0;
  v_streak integer := 0;
  v_exam_count integer := 0;
  v_objective_count integer := 0;
  v_completed_count integer := 0;
  v_friend_count integer := 0;
  v_post_count integer := 0;
  v_reaction_count integer := 0;
  v_group_count integer := 0;
  v_community_count integer := 0;
  v_referral_count integer := 0;
  v_badges text[] := ARRAY[]::text[];
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_user_id) THEN
    RETURN v_badges;
  END IF;

  SELECT COUNT(*)::integer, COALESCE(SUM(duration_seconds), 0) / 3600.0
  INTO v_session_count, v_total_hours
  FROM public.sessions WHERE user_id = p_user_id;

  SELECT COALESCE(MAX(day_seconds), 0) / 3600.0
  INTO v_max_daily_hours
  FROM (
    SELECT SUM(duration_seconds) AS day_seconds
    FROM public.sessions
    WHERE user_id = p_user_id
    GROUP BY (started_at AT TIME ZONE v_timezone)::date
  ) daily;

  v_streak := public.gamification_current_streak(p_user_id);
  SELECT COUNT(*)::integer INTO v_exam_count FROM public.exams WHERE user_id = p_user_id;
  SELECT COUNT(*)::integer, COUNT(*) FILTER (WHERE done)::integer
  INTO v_objective_count, v_completed_count
  FROM public.objectives WHERE user_id = p_user_id;
  SELECT COUNT(*)::integer INTO v_post_count FROM public.posts WHERE user_id = p_user_id;
  SELECT (
    (SELECT COUNT(*) FROM public.likes WHERE user_id = p_user_id)
    + (SELECT COUNT(*) FROM public.comments WHERE user_id = p_user_id)
  )::integer INTO v_reaction_count;
  SELECT COUNT(*)::integer INTO v_group_count FROM public.group_members WHERE user_id = p_user_id;
  SELECT COUNT(*)::integer INTO v_community_count FROM public.community_messages WHERE user_id = p_user_id;
  SELECT COUNT(*)::integer INTO v_referral_count FROM public.referrals WHERE referrer_id = p_user_id;
  SELECT COUNT(*)::integer INTO v_friend_count
  FROM public.friendships
  WHERE status = 'accepted' AND (requester = p_user_id OR addressee = p_user_id);

  IF v_session_count >= 1 THEN v_badges := array_append(v_badges, 'first_session'); END IF;
  IF v_streak >= 3 THEN v_badges := array_append(v_badges, 'streak_3'); END IF;
  IF v_streak >= 7 THEN v_badges := array_append(v_badges, 'streak_7'); END IF;
  IF v_streak >= 14 THEN v_badges := array_append(v_badges, 'streak_14'); END IF;
  IF v_streak >= 30 THEN v_badges := array_append(v_badges, 'streak_30'); END IF;
  IF v_total_hours >= 10 THEN v_badges := array_append(v_badges, 'hours_10'); END IF;
  IF v_total_hours >= 50 THEN v_badges := array_append(v_badges, 'hours_50'); END IF;
  IF v_total_hours >= 100 THEN v_badges := array_append(v_badges, 'hours_100'); END IF;
  IF v_total_hours >= 250 THEN v_badges := array_append(v_badges, 'hours_250'); END IF;
  IF v_max_daily_hours >= 6 THEN v_badges := array_append(v_badges, 'marathon_day'); END IF;
  IF v_objective_count >= 10 THEN v_badges := array_append(v_badges, 'planner'); END IF;
  IF v_completed_count >= 25 THEN v_badges := array_append(v_badges, 'strategist'); END IF;
  IF v_completed_count >= 75 THEN v_badges := array_append(v_badges, 'blocus_architect'); END IF;
  IF v_exam_count >= 1 THEN v_badges := array_append(v_badges, 'first_exam'); END IF;
  IF v_post_count >= 1 THEN v_badges := array_append(v_badges, 'first_post'); END IF;
  IF v_post_count >= 10 THEN v_badges := array_append(v_badges, 'influencer'); END IF;
  IF v_friend_count >= 1 THEN v_badges := array_append(v_badges, 'first_friend'); END IF;
  IF v_friend_count >= 20 THEN v_badges := array_append(v_badges, 'social'); END IF;
  IF v_reaction_count >= 25 THEN v_badges := array_append(v_badges, 'motivator'); END IF;
  IF v_group_count >= 1 THEN v_badges := array_append(v_badges, 'team_spirit'); END IF;
  IF v_community_count >= 50 THEN v_badges := array_append(v_badges, 'community_pillar'); END IF;
  IF v_referral_count >= 5 THEN v_badges := array_append(v_badges, 'referrer'); END IF;

  INSERT INTO public.user_badges(user_id, badge_id)
  SELECT p_user_id, badge_id FROM unnest(v_badges) AS badge_id
  ON CONFLICT (user_id, badge_id) DO NOTHING;

  SELECT COALESCE(array_agg(ub.badge_id ORDER BY ub.earned_at), ARRAY[]::text[])
  INTO v_badges
  FROM public.user_badges ub
  WHERE ub.user_id = p_user_id;

  RETURN v_badges;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_my_badges()
RETURNS text[]
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  RETURN public.award_badges_for_user(auth.uid());
END;
$$;

REVOKE ALL ON FUNCTION public.award_badges_for_user(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sync_my_badges() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sync_my_badges() TO authenticated;

-- ----------------------------------------------------------------
-- 6. Balanced daily missions with automatic, idempotent rewards
-- ----------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.ensure_daily_missions_for_user(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_timezone text := COALESCE(public.gamification_timezone(p_user_id), 'Europe/Paris');
  v_date date := (now() AT TIME ZONE v_timezone)::date;
  v_recent_seconds bigint := 0;
  v_recent_max integer := 0;
  v_duration_pool text[];
  v_focus_pool text[];
  v_duration text;
  v_focus text;
  v_planning text;
  v_consistency text;
  v_ids text[];
  v_id text;
  v_slot integer := 0;
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.daily_mission_assignments
    WHERE user_id = p_user_id AND mission_date = v_date
  ) THEN
    RETURN;
  END IF;

  SELECT COALESCE(SUM(duration_seconds), 0), COALESCE(MAX(duration_seconds), 0)
  INTO v_recent_seconds, v_recent_max
  FROM public.sessions
  WHERE user_id = p_user_id AND started_at >= now() - interval '14 days';

  v_duration_pool := CASE
    WHEN v_recent_seconds < 7 * 3600 THEN ARRAY['m_25m', 'm_1h']
    WHEN v_recent_seconds < 14 * 3600 THEN ARRAY['m_1h', 'm_2h']
    ELSE ARRAY['m_2h', 'm_3h']
  END;

  v_focus_pool := CASE
    WHEN v_recent_max < 3000 THEN ARRAY['m_s25', 'm_two_sessions']
    WHEN v_recent_max < 5400 THEN ARRAY['m_s50', 'm_2courses']
    ELSE ARRAY['m_s90', 'm_2courses']
  END;

  v_duration := v_duration_pool[public.gamification_hash_index(p_user_id::text || v_date || ':duration', array_length(v_duration_pool, 1))];
  v_focus := v_focus_pool[public.gamification_hash_index(p_user_id::text || v_date || ':focus', array_length(v_focus_pool, 1))];
  v_planning := (ARRAY['m_obj1', 'm_obj2', 'm_newobj'])[
    public.gamification_hash_index(p_user_id::text || v_date || ':planning', 3)
  ];
  v_consistency := CASE
    WHEN public.referral_mission_active(p_user_id, v_date::text) THEN 'm_referral'
    ELSE (ARRAY['m_streak', 'm_noon', 'm_note'])[
      public.gamification_hash_index(p_user_id::text || v_date || ':consistency', 3)
    ]
  END;

  v_ids := ARRAY[v_duration, v_focus, v_planning, v_consistency];
  FOREACH v_id IN ARRAY v_ids LOOP
    v_slot := v_slot + 1;
    INSERT INTO public.daily_mission_assignments(
      user_id, mission_date, slot, mission_id, xp, timezone_snapshot
    ) VALUES (
      p_user_id, v_date, v_slot, v_id,
      public.gamification_mission_xp(v_id), v_timezone
    )
    ON CONFLICT DO NOTHING;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.refresh_daily_missions_for_user(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_timezone text := COALESCE(public.gamification_timezone(p_user_id), 'Europe/Paris');
  v_date date := (now() AT TIME ZONE v_timezone)::date;
  v_start timestamptz := v_date::timestamp AT TIME ZONE v_timezone;
  v_end timestamptz := (v_date + 1)::timestamp AT TIME ZONE v_timezone;
  v_today_seconds bigint := 0;
  v_max_session integer := 0;
  v_session_count integer := 0;
  v_course_count integer := 0;
  v_done_objectives integer := 0;
  v_tomorrow_objectives integer := 0;
  v_streak integer := 0;
  v_before_noon boolean := false;
  v_has_note boolean := false;
  v_referred_today boolean := false;
  v_done boolean;
  m record;
BEGIN
  PERFORM public.ensure_daily_missions_for_user(p_user_id);

  SELECT COALESCE(SUM(duration_seconds), 0), COALESCE(MAX(duration_seconds), 0),
         COUNT(*)::integer, COUNT(DISTINCT course_id) FILTER (WHERE course_id IS NOT NULL)::integer,
         COALESCE(BOOL_OR(EXTRACT(HOUR FROM started_at AT TIME ZONE v_timezone) < 12), false),
         COALESCE(BOOL_OR(NULLIF(BTRIM(note), '') IS NOT NULL), false)
  INTO v_today_seconds, v_max_session, v_session_count, v_course_count,
       v_before_noon, v_has_note
  FROM public.sessions
  WHERE user_id = p_user_id AND started_at >= v_start AND started_at < v_end;

  SELECT COUNT(*) FILTER (WHERE done AND scheduled_date = v_date)::integer,
         COUNT(*) FILTER (WHERE scheduled_date = v_date + 1)::integer
  INTO v_done_objectives, v_tomorrow_objectives
  FROM public.objectives WHERE user_id = p_user_id;

  v_streak := public.gamification_current_streak(p_user_id);
  SELECT EXISTS (
    SELECT 1 FROM public.referrals r
    WHERE r.referrer_id = p_user_id
      AND r.mission_bonus = TRUE
      AND r.created_at >= v_start AND r.created_at < v_end
  ) INTO v_referred_today;

  FOR m IN
    SELECT * FROM public.daily_mission_assignments
    WHERE user_id = p_user_id AND mission_date = v_date
    ORDER BY slot
  LOOP
    v_done := CASE m.mission_id
      WHEN 'm_25m' THEN v_today_seconds >= 1500
      WHEN 'm_1h' THEN v_today_seconds >= 3600
      WHEN 'm_2h' THEN v_today_seconds >= 7200
      WHEN 'm_3h' THEN v_today_seconds >= 10800
      WHEN 'm_s25' THEN v_max_session >= 1500
      WHEN 'm_s50' THEN v_max_session >= 3000
      WHEN 'm_s90' THEN v_max_session >= 5400
      WHEN 'm_two_sessions' THEN v_session_count >= 2
      WHEN 'm_2courses' THEN v_course_count >= 2
      WHEN 'm_obj1' THEN v_done_objectives >= 1
      WHEN 'm_obj2' THEN v_done_objectives >= 2
      WHEN 'm_newobj' THEN v_tomorrow_objectives >= 1
      WHEN 'm_streak' THEN v_today_seconds > 0 AND v_streak >= 1
      WHEN 'm_noon' THEN v_before_noon
      WHEN 'm_note' THEN v_has_note
      WHEN 'm_referral' THEN v_referred_today
      ELSE false
    END;

    IF v_done THEN
      UPDATE public.daily_mission_assignments
      SET completed_at = COALESCE(completed_at, now()),
          claimed_at = COALESCE(claimed_at, now())
      WHERE user_id = p_user_id
        AND mission_date = v_date
        AND mission_id = m.mission_id;

      -- Referral XP is already credited atomically by apply_referral().
      IF m.mission_id <> 'm_referral' THEN
        INSERT INTO public.xp_ledger(user_id, source, source_key, xp)
        VALUES (p_user_id, 'daily_mission', v_date::text || ':' || m.mission_id, m.xp)
        ON CONFLICT (user_id, source, source_key) DO NOTHING;
      END IF;
    END IF;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_my_daily_missions()
RETURNS TABLE(mission_id text, label_key text, xp integer, done boolean)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_timezone text;
  v_date date;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  PERFORM public.refresh_daily_missions_for_user(v_user_id);
  v_timezone := COALESCE(public.gamification_timezone(v_user_id), 'Europe/Paris');
  v_date := (now() AT TIME ZONE v_timezone)::date;

  RETURN QUERY
  SELECT m.mission_id, 'xp.' || m.mission_id, m.xp, m.completed_at IS NOT NULL
  FROM public.daily_mission_assignments m
  WHERE m.user_id = v_user_id AND m.mission_date = v_date
  ORDER BY m.slot;
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_daily_missions_for_user(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.refresh_daily_missions_for_user(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_my_daily_missions() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_daily_missions() TO authenticated;

-- ----------------------------------------------------------------
-- 7. Canonical public level endpoint (no private activity returned)
-- ----------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_gamification_levels(p_user_ids uuid[])
RETURNS TABLE(
  user_id uuid,
  total_xp bigint,
  level integer,
  title_key text,
  progress_xp bigint,
  range_xp integer,
  progress_pct integer,
  streak integer,
  badge_count integer,
  mission_xp bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_user_id uuid;
  v_study_xp bigint;
  v_objective_xp bigint;
  v_exam_xp bigint;
  v_badge_xp bigint;
  v_bonus_xp bigint;
  v_mission_xp bigint;
  v_streak integer;
  v_level integer;
  v_total bigint;
  v_current_threshold integer;
  v_next_threshold integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  IF p_user_ids IS NULL OR cardinality(p_user_ids) = 0 THEN
    RETURN;
  END IF;
  IF cardinality(p_user_ids) > 100 THEN
    RAISE EXCEPTION 'A maximum of 100 users can be requested' USING ERRCODE = '22023';
  END IF;

  FOR v_user_id IN SELECT DISTINCT unnest(p_user_ids) LOOP
    CONTINUE WHEN NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = v_user_id);

    SELECT FLOOR(COALESCE(SUM(duration_seconds), 0) / 60.0)::bigint
    INTO v_study_xp FROM public.sessions WHERE sessions.user_id = v_user_id;
    SELECT (COUNT(*) FILTER (WHERE done) * 20)::bigint
    INTO v_objective_xp FROM public.objectives WHERE objectives.user_id = v_user_id;
    SELECT (COUNT(*) * 15)::bigint
    INTO v_exam_xp FROM public.exams WHERE exams.user_id = v_user_id;
    SELECT COUNT(*)::integer, (COUNT(*) * 50)::bigint
    INTO badge_count, v_badge_xp FROM public.user_badges WHERE user_badges.user_id = v_user_id;
    SELECT COALESCE(profiles.bonus_xp, 0)::bigint
    INTO v_bonus_xp FROM public.profiles WHERE profiles.id = v_user_id;
    SELECT COALESCE(SUM(xp), 0)::bigint
    INTO v_mission_xp FROM public.xp_ledger WHERE xp_ledger.user_id = v_user_id;

    v_streak := public.gamification_current_streak(v_user_id);
    v_total := COALESCE(v_study_xp, 0) + COALESCE(v_objective_xp, 0)
      + (v_streak * 10) + COALESCE(v_exam_xp, 0) + COALESCE(v_badge_xp, 0)
      + COALESCE(v_bonus_xp, 0) + COALESCE(v_mission_xp, 0);
    v_level := public.gamification_level_for_xp(v_total);
    v_current_threshold := public.gamification_level_threshold(v_level);
    v_next_threshold := CASE WHEN v_level < 20
      THEN public.gamification_level_threshold(v_level + 1)
      ELSE v_current_threshold + 1
    END;

    user_id := v_user_id;
    total_xp := v_total;
    level := v_level;
    title_key := 'xp.level' || v_level;
    progress_xp := v_total - v_current_threshold;
    range_xp := v_next_threshold - v_current_threshold;
    progress_pct := CASE WHEN v_level = 20 THEN 100 ELSE
      LEAST(100, ROUND((progress_xp::numeric / GREATEST(range_xp, 1)) * 100)::integer)
    END;
    streak := v_streak;
    mission_xp := COALESCE(v_mission_xp, 0);
    RETURN NEXT;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.get_gamification_levels(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_gamification_levels(uuid[]) TO authenticated;

-- ----------------------------------------------------------------
-- 8. New-session validation. Existing rows are deliberately untouched.
-- ----------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.validate_new_study_session()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_timezone text := COALESCE(public.gamification_timezone(NEW.user_id), 'Europe/Paris');
  v_local_day date := (NEW.started_at AT TIME ZONE v_timezone)::date;
  v_other_seconds bigint := 0;
BEGIN
  IF NEW.duration_seconds <= 0 OR NEW.duration_seconds > 43200 THEN
    RAISE EXCEPTION 'Session duration must be between 1 second and 12 hours'
      USING ERRCODE = '22023';
  END IF;
  IF NEW.started_at > now() + interval '5 minutes' THEN
    RAISE EXCEPTION 'Session cannot start in the future' USING ERRCODE = '22023';
  END IF;
  IF NEW.ended_at < NEW.started_at THEN
    RAISE EXCEPTION 'Session end must be after its start' USING ERRCODE = '22023';
  END IF;
  IF abs(EXTRACT(EPOCH FROM (NEW.ended_at - NEW.started_at)) - NEW.duration_seconds) > 300 THEN
    RAISE EXCEPTION 'Session timestamps do not match its duration' USING ERRCODE = '22023';
  END IF;

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

DROP TRIGGER IF EXISTS validate_new_study_session ON public.sessions;
CREATE TRIGGER validate_new_study_session
BEFORE INSERT OR UPDATE OF duration_seconds, started_at, ended_at ON public.sessions
FOR EACH ROW EXECUTE FUNCTION public.validate_new_study_session();

REVOKE ALL ON FUNCTION public.validate_new_study_session() FROM PUBLIC, anon, authenticated;

-- ----------------------------------------------------------------
-- 9. Automatic badge and mission refresh after relevant events
-- ----------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.refresh_gamification_after_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_user_id uuid;
BEGIN
  IF TG_TABLE_NAME = 'friendships' THEN
    IF NEW.status = 'accepted' THEN
      PERFORM public.award_badges_for_user(NEW.requester);
      PERFORM public.award_badges_for_user(NEW.addressee);
      PERFORM public.refresh_daily_missions_for_user(NEW.requester);
      PERFORM public.refresh_daily_missions_for_user(NEW.addressee);
    END IF;
    RETURN NEW;
  ELSIF TG_TABLE_NAME = 'referrals' THEN
    v_user_id := NEW.referrer_id;
  ELSE
    v_user_id := NEW.user_id;
  END IF;

  IF v_user_id IS NOT NULL THEN
    PERFORM public.award_badges_for_user(v_user_id);
    PERFORM public.refresh_daily_missions_for_user(v_user_id);
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.refresh_gamification_after_event() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS refresh_gamification_sessions ON public.sessions;
CREATE TRIGGER refresh_gamification_sessions
AFTER INSERT OR UPDATE OF duration_seconds, started_at, ended_at ON public.sessions
FOR EACH ROW EXECUTE FUNCTION public.refresh_gamification_after_event();

DROP TRIGGER IF EXISTS refresh_gamification_objectives ON public.objectives;
CREATE TRIGGER refresh_gamification_objectives
AFTER INSERT OR UPDATE OF done, scheduled_date ON public.objectives
FOR EACH ROW EXECUTE FUNCTION public.refresh_gamification_after_event();

DROP TRIGGER IF EXISTS refresh_gamification_exams ON public.exams;
CREATE TRIGGER refresh_gamification_exams
AFTER INSERT ON public.exams
FOR EACH ROW EXECUTE FUNCTION public.refresh_gamification_after_event();

DROP TRIGGER IF EXISTS refresh_gamification_posts ON public.posts;
CREATE TRIGGER refresh_gamification_posts
AFTER INSERT ON public.posts
FOR EACH ROW EXECUTE FUNCTION public.refresh_gamification_after_event();

DROP TRIGGER IF EXISTS refresh_gamification_likes ON public.likes;
CREATE TRIGGER refresh_gamification_likes
AFTER INSERT ON public.likes
FOR EACH ROW EXECUTE FUNCTION public.refresh_gamification_after_event();

DROP TRIGGER IF EXISTS refresh_gamification_comments ON public.comments;
CREATE TRIGGER refresh_gamification_comments
AFTER INSERT ON public.comments
FOR EACH ROW EXECUTE FUNCTION public.refresh_gamification_after_event();

DROP TRIGGER IF EXISTS refresh_gamification_group_members ON public.group_members;
CREATE TRIGGER refresh_gamification_group_members
AFTER INSERT ON public.group_members
FOR EACH ROW EXECUTE FUNCTION public.refresh_gamification_after_event();

DROP TRIGGER IF EXISTS refresh_gamification_community_messages ON public.community_messages;
CREATE TRIGGER refresh_gamification_community_messages
AFTER INSERT ON public.community_messages
FOR EACH ROW EXECUTE FUNCTION public.refresh_gamification_after_event();

DROP TRIGGER IF EXISTS refresh_gamification_friendships ON public.friendships;
CREATE TRIGGER refresh_gamification_friendships
AFTER INSERT OR UPDATE OF status ON public.friendships
FOR EACH ROW EXECUTE FUNCTION public.refresh_gamification_after_event();

DROP TRIGGER IF EXISTS refresh_gamification_referrals ON public.referrals;
CREATE TRIGGER refresh_gamification_referrals
AFTER INSERT ON public.referrals
FOR EACH ROW EXECUTE FUNCTION public.refresh_gamification_after_event();

-- ----------------------------------------------------------------
-- 10. Referral reward: 300 base, 600 total on an assigned referral day
-- ----------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.apply_referral(p_code text)
RETURNS json
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_referrer_id uuid;
  v_already uuid;
  v_timezone text;
  v_today text;
  v_xp integer := 300;
  v_mission boolean := false;
BEGIN
  IF v_uid IS NULL THEN
    RETURN json_build_object('ok', false, 'error', 'not_authenticated');
  END IF;
  IF p_code IS NULL OR length(trim(p_code)) = 0 THEN
    RETURN json_build_object('ok', false, 'error', 'no_code');
  END IF;

  SELECT id INTO v_referrer_id
  FROM public.profiles
  WHERE upper(referral_code) = upper(trim(p_code));

  IF v_referrer_id IS NULL THEN
    RETURN json_build_object('ok', false, 'error', 'invalid_code');
  END IF;
  IF v_referrer_id = v_uid THEN
    RETURN json_build_object('ok', false, 'error', 'self_referral');
  END IF;

  SELECT referred_by INTO v_already
  FROM public.profiles WHERE id = v_uid FOR UPDATE;
  IF v_already IS NOT NULL THEN
    RETURN json_build_object('ok', false, 'error', 'already_referred');
  END IF;

  v_timezone := COALESCE(public.gamification_timezone(v_referrer_id), 'Europe/Paris');
  v_today := to_char(now() AT TIME ZONE v_timezone, 'YYYY-MM-DD');
  v_mission := public.referral_mission_active(v_referrer_id, v_today);
  IF v_mission THEN v_xp := v_xp + 300; END IF;

  PERFORM set_config('app.gamification_internal', 'on', true);
  UPDATE public.profiles SET referred_by = v_referrer_id WHERE id = v_uid;
  UPDATE public.profiles SET bonus_xp = COALESCE(bonus_xp, 0) + v_xp
  WHERE id = v_referrer_id;

  INSERT INTO public.referrals(referrer_id, referred_id, xp_awarded, mission_bonus)
  VALUES (v_referrer_id, v_uid, v_xp, v_mission);

  RETURN json_build_object('ok', true, 'xp', v_xp, 'mission_bonus', v_mission);
END;
$$;

REVOKE ALL ON FUNCTION public.apply_referral(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.apply_referral(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.referrals_revoke_xp_on_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
BEGIN
  PERFORM set_config('app.gamification_internal', 'on', true);
  UPDATE public.profiles
  SET bonus_xp = GREATEST(COALESCE(bonus_xp, 0) - COALESCE(OLD.xp_awarded, 0), 0)
  WHERE id = OLD.referrer_id;
  RETURN OLD;
END;
$$;

REVOKE ALL ON FUNCTION public.referrals_revoke_xp_on_delete() FROM PUBLIC, anon, authenticated;

-- Correct only traceable 900-XP mission referrals. Any unrelated/legacy
-- bonus_xp remains untouched.
WITH corrected AS (
  UPDATE public.referrals
  SET xp_awarded = 600
  WHERE mission_bonus = TRUE AND xp_awarded = 900
  RETURNING referrer_id
), deltas AS (
  SELECT referrer_id, COUNT(*)::integer * 300 AS xp_delta
  FROM corrected GROUP BY referrer_id
)
UPDATE public.profiles p
SET bonus_xp = GREATEST(COALESCE(p.bonus_xp, 0) - d.xp_delta, 0)
FROM deltas d
WHERE p.id = d.referrer_id;

-- Backfill all currently earned badges without deleting any existing row.
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT id FROM public.profiles LOOP
    PERFORM public.award_badges_for_user(r.id);
  END LOOP;
END;
$$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.xp_ledger;
EXCEPTION WHEN duplicate_object THEN NULL;
END;
$$;

COMMIT;
