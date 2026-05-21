-- ─────────────────────────────────────────────────────────────
-- Migration v12 — Group chrono + Group photo
-- ─────────────────────────────────────────────────────────────

-- 1. Photo de groupe
ALTER TABLE study_groups ADD COLUMN IF NOT EXISTS photo_url TEXT;

-- 2. Table group_chrono_sessions
CREATE TABLE IF NOT EXISTS group_chrono_sessions (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id              UUID NOT NULL REFERENCES study_groups(id) ON DELETE CASCADE,
  started_by            UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  note                  TEXT,
  status                TEXT NOT NULL DEFAULT 'pending',
    -- 'pending' | 'active' | 'paused' | 'finished' | 'cancelled'
  started_at            TIMESTAMPTZ,
  last_pause_at         TIMESTAMPTZ,
  total_paused_seconds  INTEGER NOT NULL DEFAULT 0,
  finished_at           TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. Table group_chrono_members
CREATE TABLE IF NOT EXISTS group_chrono_members (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id  UUID NOT NULL REFERENCES group_chrono_sessions(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  status      TEXT NOT NULL DEFAULT 'invited',
    -- 'invited' | 'accepted' | 'declined'
  joined_at   TIMESTAMPTZ,
  UNIQUE(session_id, user_id)
);

-- 4. RLS — group_chrono_sessions
ALTER TABLE group_chrono_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "group_members_select_chrono"
  ON group_chrono_sessions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM group_members gm
      WHERE gm.group_id = group_chrono_sessions.group_id
        AND gm.user_id = auth.uid()
    )
  );

CREATE POLICY "group_members_insert_chrono"
  ON group_chrono_sessions FOR INSERT
  WITH CHECK (
    auth.uid() = started_by AND
    EXISTS (
      SELECT 1 FROM group_members gm
      WHERE gm.group_id = group_chrono_sessions.group_id
        AND gm.user_id = auth.uid()
    )
  );

CREATE POLICY "group_members_update_chrono"
  ON group_chrono_sessions FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM group_members gm
      WHERE gm.group_id = group_chrono_sessions.group_id
        AND gm.user_id = auth.uid()
    )
  );

-- 5. RLS — group_chrono_members
ALTER TABLE group_chrono_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "group_members_select_chrono_participants"
  ON group_chrono_members FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM group_chrono_sessions gcs
      JOIN group_members gm ON gm.group_id = gcs.group_id
      WHERE gcs.id = group_chrono_members.session_id
        AND gm.user_id = auth.uid()
    )
  );

CREATE POLICY "users_insert_own_chrono_membership"
  ON group_chrono_members FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "users_update_own_chrono_membership"
  ON group_chrono_members FOR UPDATE
  USING (auth.uid() = user_id);

-- 6. RPC : finish_group_chrono
--    SECURITY DEFINER pour pouvoir insérer des sessions pour d'autres users
CREATE OR REPLACE FUNCTION finish_group_chrono(p_session_id UUID, p_group_name TEXT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session   group_chrono_sessions%ROWTYPE;
  v_duration  INTEGER;
  v_p         group_chrono_members%ROWTYPE;
BEGIN
  -- Récupère la session
  SELECT * INTO v_session FROM group_chrono_sessions WHERE id = p_session_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Session introuvable';
  END IF;

  IF v_session.status IN ('finished', 'cancelled') THEN
    RETURN; -- déjà terminé, idempotent
  END IF;

  -- Vérifie que l'appelant est un participant accepté
  IF NOT EXISTS (
    SELECT 1 FROM group_chrono_members
    WHERE session_id = p_session_id
      AND user_id    = auth.uid()
      AND status     = 'accepted'
  ) THEN
    RAISE EXCEPTION 'Non autorisé : pas un participant accepté';
  END IF;

  -- Calcule la durée
  IF v_session.started_at IS NULL THEN
    v_duration := 0;
  ELSIF v_session.status = 'paused' AND v_session.last_pause_at IS NOT NULL THEN
    v_duration := EXTRACT(EPOCH FROM (v_session.last_pause_at - v_session.started_at))::INTEGER
                  - v_session.total_paused_seconds;
  ELSE
    v_duration := EXTRACT(EPOCH FROM (now() - v_session.started_at))::INTEGER
                  - v_session.total_paused_seconds;
  END IF;

  v_duration := GREATEST(1, COALESCE(v_duration, 1));

  -- Marque la session comme terminée
  UPDATE group_chrono_sessions
  SET status = 'finished', finished_at = now()
  WHERE id = p_session_id;

  -- Insère une session dans les stats de chaque participant accepté
  FOR v_p IN
    SELECT * FROM group_chrono_members
    WHERE session_id = p_session_id AND status = 'accepted'
  LOOP
    INSERT INTO sessions (user_id, course_id, duration_seconds, note, started_at, ended_at)
    VALUES (
      v_p.user_id,
      NULL,
      v_duration,
      'Chrono de groupe — ' || p_group_name,
      COALESCE(v_session.started_at, now()),
      now()
    );
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION finish_group_chrono(UUID, TEXT) TO authenticated;
