-- ════════════════════════════════════════════════════════════════════════════
-- v66 — Le chrono de groupe peut enregistrer une session avec de longues pauses
-- ════════════════════════════════════════════════════════════════════════════
--
-- Constat (2026-09-24, reproduit avec la vraie fonction, transaction annulée) :
-- finish_group_chrono insère started_at = vrai début, ended_at = now() et
-- duration_seconds = temps étudié, pauses retirées. validate_new_study_session
-- exigeait |ended_at − started_at − duration| ≤ 300 s : au-delà de 5 min de
-- pause, l'insertion échouait, et avec elle TOUT finish_group_chrono (aucun
-- membre crédité, chrono jamais marqué terminé).
--   60 min / 55 min étudiées → accepté · 60/45 → refusé · 120/90 → refusé.
-- Aucun étudiant touché à ce jour (un seul chrono terminé, de 7 s, en mai).
--
-- Correction ciblée :
--   • finish_group_chrono marque SES insertions par un réglage local à la
--     transaction, blocus.group_chrono_finish = 'on' (même mécanisme que
--     blocus.self_delete, v57 : l'app ne peut pas le poser, PostgREST
--     n'expose pas set_config), puis le retire ;
--   • sous ce marqueur, la validation accepte une durée PLUS COURTE que
--     l'intervalle (pauses), jamais plus longue (tolérance 5 min, comme avant) ;
--   • partout ailleurs (chrono solo, Pomodoro, file hors ligne, édition), la
--     règle ±5 min est inchangée.
-- Les autres garde-fous restent : 1 s ≤ durée ≤ 12 h, pas dans le futur, fin
-- après le début, 200 sessions et 16 h par jour.
--
-- session_day_parts (v65) répartit alors la durée étudiée au prorata de
-- l'intervalle : 23:00 → 01:00 avec 1 h 30 étudiée = 45 min + 45 min.
--
-- Limite de 12 h par portion (v65) : vérifiée cohérente. Une session valide
-- dure au plus 43 200 s (ici, à l'insertion comme à la modification ; le chrono
-- s'arrête aussi à 12 h), et une portion ne dépasse jamais la durée de sa
-- session. Le plafond de 16 h porte sur le TOTAL d'une journée, pas sur une
-- portion. Aucune modification. (17 sessions historiques dépassent 12 h,
-- antérieures à cette validation : à traiter lors du rattrapage.)
-- ════════════════════════════════════════════════════════════════════════════

create or replace function public.validate_new_study_session()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
DECLARE
  v_timezone text := COALESCE(public.gamification_timezone(NEW.user_id), 'Europe/Paris');
  v_local_day date;
  v_other_seconds bigint := 0;
  v_other_count integer := 0;
  v_interval_seconds numeric;
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

  v_interval_seconds := EXTRACT(EPOCH FROM (NEW.ended_at - NEW.started_at));
  IF coalesce(current_setting('blocus.group_chrono_finish', true), '') = 'on' THEN
    -- Chrono de groupe (v66) : les pauses sont retirées de la durée, jamais
    -- ajoutées. Plus court que l'intervalle : légitime. Plus long : refusé.
    IF NEW.duration_seconds > v_interval_seconds + 300 THEN
      RAISE EXCEPTION 'Session timestamps do not match its duration' USING ERRCODE = '22023';
    END IF;
  ELSIF abs(v_interval_seconds - NEW.duration_seconds) > 300 THEN
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

create or replace function public.finish_group_chrono(p_session_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
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

  -- v66 : marque ces insertions pour validate_new_study_session (pauses).
  PERFORM set_config('blocus.group_chrono_finish', 'on', true);

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

  PERFORM set_config('blocus.group_chrono_finish', '', true);
END;
$$;
