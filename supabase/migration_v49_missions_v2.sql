-- ================================================================
-- migration_v49_missions_v2.sql
--
-- Refonte des missions : 3 missions quotidiennes + 1 Défi du jour
-- personnalisé, plus un système hebdomadaire à objectifs adaptatifs.
--
-- ── Pourquoi ────────────────────────────────────────────────
-- Mesuré sur la base avant d'écrire : la famille « Planning » était assignée
-- 356 fois pour 11 réussites (1 à 5 %), et la mission de parrainage 133 fois
-- pour 0 réussite. Deux créneaux sur quatre, tous les jours, pour tout le
-- monde, où il ne se passait rien. Le reste demandait toujours la même chose
-- sous quatre emballages : étudier plus.
--
-- Ce qui change vraiment : la quatrième mission n'est plus tirée au sort, elle
-- est CHOISIE d'après la situation réelle du compte — l'examen qui approche,
-- le cours abandonné depuis neuf jours, la série qu'on peut perdre ce soir,
-- la journée d'hier qu'on peut battre. Et les trois autres sont tirées en
-- ÉVITANT l'axe que le défi occupe déjà, pour qu'une seule session d'une heure
-- ne coche pas les quatre lignes.
--
-- ── Non destructif ──────────────────────────────────────────
-- Les missions retirées du tirage (m_s25, m_obj1, m_obj2, m_newobj, m_note,
-- m_referral) gardent leur valeur XP et leur branche d'évaluation : les lignes
-- déjà attribuées continuent de se valider normalement, et le XP déjà versé
-- dans xp_ledger n'est pas touché. Elles cessent simplement d'être proposées.
-- Les assignations d'aujourd'hui sont conservées telles quelles ; le nouveau
-- système prend effet au prochain jour local de chaque compte.
--
-- Appliqué par Claude via le MCP Supabase (règle 5 de CLAUDE.md).
-- Idempotent : réexécutable sans effet de bord.
-- ================================================================

-- ----------------------------------------------------------------
-- 1. Schéma
--
-- `params` gèle la personnalisation au moment de l'attribution. Sans ça, un
-- défi « bats tes 1 h 42 d'hier » recalculé à chaque affichage changerait de
-- cible en cours de journée, et le cours d'un défi « tu n'as pas ouvert
-- Marketing depuis 9 jours » changerait dès qu'on ouvre Marketing.
-- ----------------------------------------------------------------
ALTER TABLE public.daily_mission_assignments
  ADD COLUMN IF NOT EXISTS params jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.daily_mission_assignments
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'daily';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'daily_missions_kind_check'
  ) THEN
    ALTER TABLE public.daily_mission_assignments
      ADD CONSTRAINT daily_missions_kind_check CHECK (kind IN ('daily', 'challenge'));
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.weekly_mission_assignments (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  week_start date NOT NULL,
  slot smallint NOT NULL CHECK (slot BETWEEN 1 AND 3),
  mission_id text NOT NULL,
  target integer NOT NULL CHECK (target > 0),
  xp integer NOT NULL CHECK (xp > 0 AND xp <= 600),
  timezone_snapshot text NOT NULL,
  completed_at timestamptz,
  claimed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, week_start, mission_id),
  UNIQUE (user_id, week_start, slot)
);

CREATE INDEX IF NOT EXISTS idx_weekly_missions_user_week
  ON public.weekly_mission_assignments(user_id, week_start DESC);

ALTER TABLE public.weekly_mission_assignments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS weekly_missions_read_own_or_admin ON public.weekly_mission_assignments;
CREATE POLICY weekly_missions_read_own_or_admin ON public.weekly_mission_assignments
FOR SELECT TO authenticated
USING (
  (SELECT auth.uid()) = user_id
  OR EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = (SELECT auth.uid()) AND p.is_admin = TRUE
  )
);

REVOKE ALL ON public.weekly_mission_assignments FROM anon, authenticated;
GRANT SELECT ON public.weekly_mission_assignments TO authenticated;
GRANT ALL ON public.weekly_mission_assignments TO service_role;

-- ----------------------------------------------------------------
-- 2. Barème
--
-- Trois missions quotidiennes (15 à 45), un défi (50), trois hebdomadaires
-- (90 à 150). Une journée parfaite plafonne à 175 XP — soit un peu moins que
-- les ~180 XP d'étude qu'il faut produire pour la réussir. C'est la règle qui
-- empêche de farmer : une mission ne doit jamais payer plus que le travail
-- qu'elle récompense.
--
-- Les six identifiants retirés du tirage gardent leur valeur : des lignes
-- attribuées hier peuvent encore se valider aujourd'hui.
-- DOIT rester synchronisé avec MISSION_POOL (lib/xp.js).
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.gamification_mission_xp(p_mission_id text)
RETURNS integer
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_catalog
AS $$
  SELECT CASE p_mission_id
    -- Volume
    WHEN 'm_25m' THEN 15
    WHEN 'm_1h' THEN 25
    WHEN 'm_2h' THEN 35
    WHEN 'm_3h' THEN 45
    -- Forme du travail
    WHEN 'm_two_sessions' THEN 25
    WHEN 'm_s50' THEN 30
    WHEN 'm_two_focused' THEN 35
    WHEN 'm_s90' THEN 40
    -- Cours et rythme
    WHEN 'm_2courses' THEN 30
    WHEN 'm_noon' THEN 35
    WHEN 'm_exam_next' THEN 35
    WHEN 'm_3courses' THEN 40
    WHEN 'm_least_studied' THEN 40
    WHEN 'm_exam_week' THEN 40
    -- Défi du jour
    WHEN 'c_exam_soon' THEN 50
    WHEN 'c_neglected' THEN 50
    WHEN 'c_protect_streak' THEN 50
    WHEN 'c_beat_yesterday' THEN 50
    WHEN 'c_beat_average' THEN 50
    WHEN 'c_comeback' THEN 50
    WHEN 'c_first_session' THEN 50
    -- Hebdomadaires
    WHEN 'w_courses' THEN 90
    WHEN 'w_days' THEN 120
    WHEN 'w_hours' THEN 150
    -- Retirées du tirage, conservées pour l'historique en cours
    WHEN 'm_s25' THEN 20
    WHEN 'm_obj1' THEN 30
    WHEN 'm_obj2' THEN 40
    WHEN 'm_newobj' THEN 25
    WHEN 'm_note' THEN 25
    WHEN 'm_referral' THEN 300
    ELSE 0
  END;
$$;
REVOKE ALL ON FUNCTION public.gamification_mission_xp(text) FROM PUBLIC, anon, authenticated;

-- Axe de comportement. Sert à empêcher qu'une journée demande quatre fois la
-- même chose : le défi réserve son axe, les trois autres piochent ailleurs.
CREATE OR REPLACE FUNCTION public.gamification_mission_axis(p_mission_id text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_catalog
AS $$
  SELECT CASE
    WHEN p_mission_id IN ('m_25m','m_1h','m_2h','m_3h') THEN 'volume'
    WHEN p_mission_id IN ('m_s50','m_s90','m_two_sessions','m_two_focused') THEN 'focus'
    WHEN p_mission_id IN ('m_2courses','m_3courses','m_least_studied','m_exam_next','m_exam_week','m_noon') THEN 'courses'
    WHEN p_mission_id IN ('c_beat_yesterday','c_beat_average','c_protect_streak','c_comeback','c_first_session') THEN 'volume'
    WHEN p_mission_id IN ('c_exam_soon','c_neglected') THEN 'courses'
    ELSE 'other'
  END;
$$;
REVOKE ALL ON FUNCTION public.gamification_mission_axis(text) FROM PUBLIC, anon, authenticated;

-- Lundi de la semaine d'une date.
CREATE OR REPLACE FUNCTION public.gamification_week_start(p_date date)
RETURNS date
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_catalog
AS $$
  SELECT p_date - (EXTRACT(ISODOW FROM p_date)::integer - 1);
$$;
REVOKE ALL ON FUNCTION public.gamification_week_start(date) FROM PUBLIC, anon, authenticated;

-- ----------------------------------------------------------------
-- 3. Le Défi du jour — choisi, pas tiré au sort
--
-- Chaque candidat reçoit un score d'à-propos, et le plus élevé gagne. Ce n'est
-- pas un hasard déguisé : un examen dans deux jours bat tout le reste, une
-- série de dix jours bat un cours négligé depuis huit, et « bats ta journée
-- d'hier » n'apparaît que quand il ne se passe rien de plus urgent.
--
-- Petite pénalité si le même défi est tombé la veille — sauf examen imminent,
-- où insister EST le bon comportement. C'est ce qui évite « bats ta moyenne »
-- quatorze jours de suite sans jamais parler de l'examen de la semaine
-- prochaine.
--
-- Les garde-fous comptent autant que les scores : on ne propose pas de battre
-- une journée de sept heures, ni une moyenne calculée sur deux jours actifs.
-- Un défi impossible ne motive pas, il apprend à ignorer la carte.
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.gamification_pick_challenge(
  p_user_id uuid, p_date date, p_timezone text
)
RETURNS TABLE(mission_id text, xp integer, params jsonb)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_streak integer := 0;
  v_yesterday_min integer := 0;
  v_avg_min integer := 0;
  v_active7 integer := 0;
  v_total_sessions integer := 0;
  v_days_since_last integer := NULL;
  v_exam_course uuid; v_exam_name text; v_exam_days integer;
  v_negl_course uuid; v_negl_name text; v_negl_days integer;
  v_yesterday_prev text;
  v_best_id text := NULL;
  v_best_score numeric := -1;
  v_best_params jsonb := '{}'::jsonb;
  v_score numeric;
  v_target integer;
BEGIN
  v_streak := public.gamification_current_streak(p_user_id);

  SELECT COUNT(*)::integer INTO v_total_sessions
  FROM public.sessions WHERE user_id = p_user_id;

  SELECT COALESCE(SUM(duration_seconds), 0) / 60
  INTO v_yesterday_min
  FROM public.sessions
  WHERE user_id = p_user_id
    AND (started_at AT TIME ZONE p_timezone)::date = p_date - 1;

  -- Moyenne par jour ACTIF sur les sept derniers jours : « ta journée type »,
  -- pas « ton total divisé par sept ». Diviser par sept récompenserait le fait
  -- d'avoir peu étudié la semaine passée.
  SELECT COUNT(*)::integer, COALESCE(AVG(day_min), 0)::integer
  INTO v_active7, v_avg_min
  FROM (
    SELECT SUM(duration_seconds) / 60 AS day_min
    FROM public.sessions
    WHERE user_id = p_user_id
      AND (started_at AT TIME ZONE p_timezone)::date BETWEEN p_date - 7 AND p_date - 1
    GROUP BY (started_at AT TIME ZONE p_timezone)::date
  ) d;

  SELECT (p_date - MAX((started_at AT TIME ZONE p_timezone)::date))::integer
  INTO v_days_since_last
  FROM public.sessions WHERE user_id = p_user_id;

  -- Prochain examen à venir, s'il porte sur un cours identifié.
  SELECT e.course_id, c.name, (e.exam_date - p_date)::integer
  INTO v_exam_course, v_exam_name, v_exam_days
  FROM public.exams e
  JOIN public.courses c ON c.id = e.course_id
  WHERE e.user_id = p_user_id AND e.exam_date >= p_date
  ORDER BY e.exam_date ASC
  LIMIT 1;

  -- Cours le plus délaissé. Déjà étudié au moins une fois (sinon « tu n'as pas
  -- étudié X depuis 9 jours » serait faux), écart borné à 21 jours, et
  -- seulement pour quelqu'un qui étudie EN CE MOMENT.
  --
  -- Vérifié sur les dix comptes les plus actifs : sans ces bornes, tous les
  -- dix recevaient « cours négligé » avec des écarts de 92 à 108 jours. Ces
  -- comptes ne négligent aucun cours — ils sont absents depuis la fin de
  -- l'année scolaire. Au-delà de trois semaines ce n'est plus un déséquilibre
  -- entre cours, c'est une absence, et c'est c_comeback qui répond à ça.
  IF v_active7 > 0 THEN
    SELECT s.course_id, c.name,
           (p_date - MAX((s.started_at AT TIME ZONE p_timezone)::date))::integer
    INTO v_negl_course, v_negl_name, v_negl_days
    FROM public.sessions s
    JOIN public.courses c ON c.id = s.course_id
    WHERE s.user_id = p_user_id AND s.course_id IS NOT NULL
    GROUP BY s.course_id, c.name
    HAVING (p_date - MAX((s.started_at AT TIME ZONE p_timezone)::date))::integer BETWEEN 7 AND 21
    ORDER BY MAX((s.started_at AT TIME ZONE p_timezone)::date) ASC
    LIMIT 1;
  END IF;

  SELECT d.mission_id INTO v_yesterday_prev
  FROM public.daily_mission_assignments d
  WHERE d.user_id = p_user_id AND d.mission_date = p_date - 1 AND d.kind = 'challenge';

  -- ── Candidats ────────────────────────────────────────────
  -- Examen qui approche
  IF v_exam_course IS NOT NULL AND v_exam_days BETWEEN 0 AND 7 THEN
    v_score := 100 - v_exam_days * 8;
    IF v_yesterday_prev = 'c_exam_soon' AND v_exam_days > 3 THEN v_score := v_score - 12; END IF;
    v_target := CASE WHEN v_avg_min >= 90 THEN 60 ELSE 45 END;
    IF v_score > v_best_score THEN
      v_best_score := v_score; v_best_id := 'c_exam_soon';
      v_best_params := jsonb_build_object(
        'course_id', v_exam_course, 'course', v_exam_name,
        'days', v_exam_days, 'target', v_target);
    END IF;
  END IF;

  -- Série à protéger : il faut avoir quelque chose à perdre.
  IF v_streak >= 2 THEN
    v_score := LEAST(88, 45 + v_streak * 4);
    IF v_yesterday_prev = 'c_protect_streak' THEN v_score := v_score - 12; END IF;
    IF v_score > v_best_score THEN
      v_best_score := v_score; v_best_id := 'c_protect_streak';
      v_best_params := jsonb_build_object('streak', v_streak, 'target', 20);
    END IF;
  END IF;

  -- Cours délaissé
  IF v_negl_course IS NOT NULL THEN
    v_score := LEAST(68, 40 + v_negl_days * 2);
    IF v_yesterday_prev = 'c_neglected' THEN v_score := v_score - 12; END IF;
    IF v_score > v_best_score THEN
      v_best_score := v_score; v_best_id := 'c_neglected';
      v_best_params := jsonb_build_object(
        'course_id', v_negl_course, 'course', v_negl_name,
        'days', v_negl_days, 'target', 25);
    END IF;
  END IF;

  -- Retour après une coupure
  -- Grandit avec la durée de l'absence : après trois semaines, c'est le seul
  -- message qui vaille encore quelque chose.
  IF v_total_sessions > 0 AND COALESCE(v_days_since_last, 0) >= 3 THEN
    v_score := LEAST(75, 55 + LEAST(v_days_since_last, 20));
    IF v_yesterday_prev = 'c_comeback' THEN v_score := v_score - 12; END IF;
    IF v_score > v_best_score THEN
      v_best_score := v_score; v_best_id := 'c_comeback';
      v_best_params := jsonb_build_object('days', v_days_since_last, 'target', 25);
    END IF;
  END IF;

  -- Battre hier — jamais au-dessus de 4 h, sinon le défi est une punition.
  IF v_yesterday_min BETWEEN 20 AND 240 THEN
    v_score := 50;
    IF v_yesterday_prev = 'c_beat_yesterday' THEN v_score := v_score - 12; END IF;
    IF v_score > v_best_score THEN
      v_best_score := v_score; v_best_id := 'c_beat_yesterday';
      v_best_params := jsonb_build_object('minutes', v_yesterday_min, 'target', v_yesterday_min + 1);
    END IF;
  END IF;

  -- Battre sa moyenne — il faut au moins trois jours actifs pour qu'elle
  -- veuille dire quelque chose.
  IF v_active7 >= 3 AND v_avg_min BETWEEN 20 AND 240 THEN
    v_score := 48;
    IF v_yesterday_prev = 'c_beat_average' THEN v_score := v_score - 12; END IF;
    IF v_score > v_best_score THEN
      v_best_score := v_score; v_best_id := 'c_beat_average';
      v_best_params := jsonb_build_object('minutes', v_avg_min, 'target', v_avg_min + 1);
    END IF;
  END IF;

  -- Tout premier bloc
  IF v_total_sessions = 0 THEN
    v_score := 30;
    IF v_score > v_best_score THEN
      v_best_score := v_score; v_best_id := 'c_first_session';
      v_best_params := jsonb_build_object('target', 25);
    END IF;
  END IF;

  IF v_best_id IS NULL THEN RETURN; END IF;

  mission_id := v_best_id;
  xp := public.gamification_mission_xp(v_best_id);
  params := v_best_params;
  RETURN NEXT;
END;
$$;
REVOKE ALL ON FUNCTION public.gamification_pick_challenge(uuid, date, text) FROM PUBLIC, anon, authenticated;

-- ----------------------------------------------------------------
-- 4. Attribution du jour : le défi d'abord, les trois autres autour
--
-- Le défi est choisi en premier parce que c'est lui qui porte la journée. Les
-- trois missions classiques piochent ensuite en ÉVITANT son axe. Sans cette
-- règle on obtenait des journées comme « 1 heure d'étude / une session de
-- 50 min / protège ta série / travaille ton prochain examen » : une seule
-- session d'une heure sur le bon cours cochait les quatre lignes, et la carte
-- ne demandait en réalité qu'une seule chose.
--
-- Trois familles pour trois créneaux — volume, forme du travail, cours et
-- rythme. Quand le défi occupe l'axe « volume », le créneau volume laisse sa
-- place à un second tirage « cours et rythme » : la journée garde quatre
-- comportements distincts au lieu de trois.
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ensure_daily_missions_for_user(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_timezone text := COALESCE(public.gamification_timezone(p_user_id), 'Europe/Paris');
  v_date date := (now() AT TIME ZONE v_timezone)::date;
  v_recent_seconds bigint := 0;
  v_recent_max integer := 0;
  v_course_count integer := 0;
  v_courses_7d integer := 0;
  v_exam_course uuid; v_exam_name text; v_exam_days integer;
  v_least_course uuid; v_least_name text;
  v_challenge record;
  v_challenge_axis text := 'none';
  v_volume_pool text[];
  v_focus_pool text[];
  v_context_pool text[];
  v_slot1 text; v_slot2 text; v_slot3 text;
  v_ids text[];
  v_id text;
  v_slot integer := 0;
  v_params jsonb;
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

  SELECT COUNT(*)::integer INTO v_course_count
  FROM public.courses WHERE user_id = p_user_id;

  SELECT COUNT(DISTINCT course_id)::integer INTO v_courses_7d
  FROM public.sessions
  WHERE user_id = p_user_id AND course_id IS NOT NULL
    AND (started_at AT TIME ZONE v_timezone)::date BETWEEN v_date - 7 AND v_date - 1;

  SELECT e.course_id, c.name, (e.exam_date - v_date)::integer
  INTO v_exam_course, v_exam_name, v_exam_days
  FROM public.exams e JOIN public.courses c ON c.id = e.course_id
  WHERE e.user_id = p_user_id AND e.exam_date >= v_date
  ORDER BY e.exam_date ASC LIMIT 1;

  -- Cours le moins travaillé des sept derniers jours, parmi ceux qu'on a
  -- réellement ouverts : proposer un cours jamais commencé serait un autre
  -- message (« démarre-le »), pas « rééquilibre ».
  SELECT s.course_id, c.name INTO v_least_course, v_least_name
  FROM public.sessions s JOIN public.courses c ON c.id = s.course_id
  WHERE s.user_id = p_user_id AND s.course_id IS NOT NULL
    AND (s.started_at AT TIME ZONE v_timezone)::date BETWEEN v_date - 7 AND v_date - 1
  GROUP BY s.course_id, c.name
  ORDER BY SUM(s.duration_seconds) ASC LIMIT 1;

  SELECT * INTO v_challenge
  FROM public.gamification_pick_challenge(p_user_id, v_date, v_timezone);

  IF v_challenge.mission_id IS NOT NULL THEN
    v_challenge_axis := public.gamification_mission_axis(v_challenge.mission_id);
  END IF;

  v_volume_pool := CASE
    WHEN v_recent_seconds < 7 * 3600 THEN ARRAY['m_25m', 'm_1h']
    WHEN v_recent_seconds < 14 * 3600 THEN ARRAY['m_1h', 'm_2h']
    ELSE ARRAY['m_2h', 'm_3h']
  END;

  v_focus_pool := CASE
    WHEN v_recent_max < 3000 THEN ARRAY['m_two_sessions', 'm_two_focused']
    WHEN v_recent_max < 5400 THEN ARRAY['m_s50', 'm_two_focused']
    ELSE ARRAY['m_s90', 'm_s50']
  END;

  -- Famille « cours et rythme », filtrée par ce que le compte possède
  -- vraiment. Proposer « étudie 3 cours différents » à quelqu'un qui en a deux
  -- est la façon la plus sûre de lui apprendre à ignorer la carte.
  -- Le ::text n'est pas décoratif : face à un text[] à gauche, Postgres lit un
  -- littéral non typé comme un TABLEAU et l'attribution plante avec
  -- « malformed array literal ». Attrapé en exécutant l'attribution sur un
  -- vrai compte — sans ce test, plus aucune mission n'aurait été distribuée.
  v_context_pool := ARRAY['m_noon']::text[];
  IF v_course_count >= 2 THEN v_context_pool := v_context_pool || 'm_2courses'::text; END IF;
  IF v_course_count >= 3 THEN v_context_pool := v_context_pool || 'm_3courses'::text; END IF;
  IF v_least_course IS NOT NULL AND v_courses_7d >= 2
     AND v_challenge.mission_id IS DISTINCT FROM 'c_neglected' THEN
    v_context_pool := v_context_pool || 'm_least_studied'::text;
  END IF;
  IF v_exam_course IS NOT NULL AND v_challenge.mission_id IS DISTINCT FROM 'c_exam_soon' THEN
    v_context_pool := v_context_pool || 'm_exam_next'::text;
    IF v_exam_days BETWEEN 0 AND 7 THEN
      v_context_pool := v_context_pool || 'm_exam_week'::text;
    END IF;
  END IF;

  v_slot2 := v_focus_pool[public.gamification_hash_index(p_user_id::text || v_date || ':focus', array_length(v_focus_pool, 1))];
  v_slot3 := v_context_pool[public.gamification_hash_index(p_user_id::text || v_date || ':context', array_length(v_context_pool, 1))];

  IF v_challenge_axis = 'volume' AND array_length(v_context_pool, 1) >= 2 THEN
    -- Le défi tient déjà l'axe volume : on remplace ce créneau par un second
    -- tirage contextuel, forcément différent du premier.
    SELECT x INTO v_slot1 FROM unnest(v_context_pool) x WHERE x <> v_slot3
    ORDER BY public.gamification_hash_index(p_user_id::text || v_date || ':context2' || x, 997)
    LIMIT 1;
  END IF;
  IF v_slot1 IS NULL THEN
    v_slot1 := v_volume_pool[public.gamification_hash_index(p_user_id::text || v_date || ':volume', array_length(v_volume_pool, 1))];
  END IF;

  v_ids := ARRAY[v_slot1, v_slot2, v_slot3];
  FOREACH v_id IN ARRAY v_ids LOOP
    v_slot := v_slot + 1;
    v_params := CASE
      WHEN v_id = 'm_exam_next' THEN jsonb_build_object(
        'course_id', v_exam_course, 'course', v_exam_name, 'days', v_exam_days, 'target', 15)
      WHEN v_id = 'm_least_studied' THEN jsonb_build_object(
        'course_id', v_least_course, 'course', v_least_name, 'target', 20)
      ELSE '{}'::jsonb
    END;
    INSERT INTO public.daily_mission_assignments(
      user_id, mission_date, slot, mission_id, xp, timezone_snapshot, kind, params
    ) VALUES (
      p_user_id, v_date, v_slot, v_id,
      public.gamification_mission_xp(v_id), v_timezone, 'daily', v_params
    )
    ON CONFLICT DO NOTHING;
  END LOOP;

  IF v_challenge.mission_id IS NOT NULL THEN
    INSERT INTO public.daily_mission_assignments(
      user_id, mission_date, slot, mission_id, xp, timezone_snapshot, kind, params
    ) VALUES (
      p_user_id, v_date, 4, v_challenge.mission_id,
      v_challenge.xp, v_timezone, 'challenge', v_challenge.params
    )
    ON CONFLICT DO NOTHING;
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.ensure_daily_missions_for_user(uuid) FROM PUBLIC, anon, authenticated;

-- ----------------------------------------------------------------
-- 5. Évaluation
--
-- Une seule lecture des sessions du jour, puis un test par mission. Les
-- missions « plusieurs cours » exigent désormais un MINIMUM PAR COURS : avant,
-- deux minutes sur un second cours suffisaient à valider « étudie 2 cours
-- différents », ce qui récompensait le fait de cliquer, pas d'étudier.
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.refresh_daily_missions_for_user(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_timezone text := COALESCE(public.gamification_timezone(p_user_id), 'Europe/Paris');
  v_date date := (now() AT TIME ZONE v_timezone)::date;
  v_start timestamptz := v_date::timestamp AT TIME ZONE v_timezone;
  v_end timestamptz := (v_date + 1)::timestamp AT TIME ZONE v_timezone;
  v_today_seconds bigint := 0;
  v_today_min integer := 0;
  v_max_session integer := 0;
  v_session_count integer := 0;
  v_focused_count integer := 0;
  v_before_noon boolean := false;
  v_has_note boolean := false;
  v_courses_15 integer := 0;
  v_course_min jsonb := '{}'::jsonb;
  v_exam_week_min integer := 0;
  v_done_objectives integer := 0;
  v_tomorrow_objectives integer := 0;
  v_streak integer := 0;
  v_referred_today boolean := false;
  v_target integer;
  v_course text;
  v_done boolean;
  m record;
BEGIN
  PERFORM public.ensure_daily_missions_for_user(p_user_id);

  SELECT COALESCE(SUM(duration_seconds), 0), COALESCE(MAX(duration_seconds), 0),
         COUNT(*)::integer,
         COUNT(*) FILTER (WHERE duration_seconds >= 1500)::integer,
         COALESCE(BOOL_OR(EXTRACT(HOUR FROM started_at AT TIME ZONE v_timezone) < 12), false),
         COALESCE(BOOL_OR(NULLIF(BTRIM(note), '') IS NOT NULL), false)
  INTO v_today_seconds, v_max_session, v_session_count, v_focused_count,
       v_before_noon, v_has_note
  FROM public.sessions
  WHERE user_id = p_user_id AND started_at >= v_start AND started_at < v_end;

  v_today_min := (v_today_seconds / 60)::integer;

  SELECT COALESCE(jsonb_object_agg(course_id::text, mins), '{}'::jsonb),
         COUNT(*) FILTER (WHERE mins >= 15)::integer
  INTO v_course_min, v_courses_15
  FROM (
    SELECT course_id, (SUM(duration_seconds) / 60)::integer AS mins
    FROM public.sessions
    WHERE user_id = p_user_id AND started_at >= v_start AND started_at < v_end
      AND course_id IS NOT NULL
    GROUP BY course_id
  ) q;

  -- Minutes du jour sur un cours dont l'examen tombe dans les sept jours.
  SELECT COALESCE(MAX((v_course_min ->> e.course_id::text)::integer), 0)
  INTO v_exam_week_min
  FROM public.exams e
  WHERE e.user_id = p_user_id AND e.course_id IS NOT NULL
    AND e.exam_date BETWEEN v_date AND v_date + 7;

  SELECT COUNT(*) FILTER (WHERE done AND scheduled_date = v_date)::integer,
         COUNT(*) FILTER (WHERE scheduled_date = v_date + 1)::integer
  INTO v_done_objectives, v_tomorrow_objectives
  FROM public.objectives WHERE user_id = p_user_id;

  v_streak := public.gamification_current_streak(p_user_id);
  SELECT EXISTS (
    SELECT 1 FROM public.referrals r
    WHERE r.referrer_id = p_user_id AND r.mission_bonus = TRUE
      AND r.created_at >= v_start AND r.created_at < v_end
  ) INTO v_referred_today;

  FOR m IN
    SELECT * FROM public.daily_mission_assignments
    WHERE user_id = p_user_id AND mission_date = v_date
    ORDER BY slot
  LOOP
    v_target := COALESCE((m.params ->> 'target')::integer, 0);
    v_course := m.params ->> 'course_id';

    v_done := CASE m.mission_id
      -- Volume
      WHEN 'm_25m' THEN v_today_seconds >= 1500
      WHEN 'm_1h' THEN v_today_seconds >= 3600
      WHEN 'm_2h' THEN v_today_seconds >= 7200
      WHEN 'm_3h' THEN v_today_seconds >= 10800
      -- Forme du travail
      WHEN 'm_s50' THEN v_max_session >= 3000
      WHEN 'm_s90' THEN v_max_session >= 5400
      WHEN 'm_two_sessions' THEN v_session_count >= 2
      WHEN 'm_two_focused' THEN v_focused_count >= 2
      -- Cours et rythme
      WHEN 'm_2courses' THEN v_courses_15 >= 2
      WHEN 'm_3courses' THEN v_courses_15 >= 3
      WHEN 'm_noon' THEN v_before_noon
      WHEN 'm_least_studied' THEN
        v_course IS NOT NULL AND COALESCE((v_course_min ->> v_course)::integer, 0) >= GREATEST(v_target, 1)
      WHEN 'm_exam_next' THEN
        v_course IS NOT NULL AND COALESCE((v_course_min ->> v_course)::integer, 0) >= GREATEST(v_target, 1)
      WHEN 'm_exam_week' THEN v_exam_week_min >= 15
      -- Défis du jour
      WHEN 'c_exam_soon' THEN
        v_course IS NOT NULL AND COALESCE((v_course_min ->> v_course)::integer, 0) >= GREATEST(v_target, 1)
      WHEN 'c_neglected' THEN
        v_course IS NOT NULL AND COALESCE((v_course_min ->> v_course)::integer, 0) >= GREATEST(v_target, 1)
      WHEN 'c_protect_streak' THEN v_today_min >= GREATEST(v_target, 1)
      WHEN 'c_beat_yesterday' THEN v_today_min >= GREATEST(v_target, 1)
      WHEN 'c_beat_average' THEN v_today_min >= GREATEST(v_target, 1)
      WHEN 'c_comeback' THEN v_today_min >= GREATEST(v_target, 1)
      WHEN 'c_first_session' THEN v_today_min >= GREATEST(v_target, 1)
      -- Retirées du tirage : conservées pour les lignes déjà attribuées
      WHEN 'm_s25' THEN v_max_session >= 1500
      WHEN 'm_obj1' THEN v_done_objectives >= 1
      WHEN 'm_obj2' THEN v_done_objectives >= 2
      WHEN 'm_newobj' THEN v_tomorrow_objectives >= 1
      WHEN 'm_note' THEN v_has_note
      WHEN 'm_streak' THEN v_today_seconds > 0 AND v_streak >= 1
      WHEN 'm_referral' THEN v_referred_today
      ELSE false
    END;

    IF v_done THEN
      UPDATE public.daily_mission_assignments
      SET completed_at = COALESCE(completed_at, now()),
          claimed_at = COALESCE(claimed_at, now())
      WHERE user_id = p_user_id AND mission_date = v_date AND mission_id = m.mission_id;

      IF m.mission_id <> 'm_referral' THEN
        INSERT INTO public.xp_ledger(user_id, source, source_key, xp)
        VALUES (p_user_id, 'daily_mission', v_date::text || ':' || m.mission_id, m.xp)
        ON CONFLICT (user_id, source, source_key) DO NOTHING;
      END IF;
    END IF;
  END LOOP;
END;
$$;
REVOKE ALL ON FUNCTION public.refresh_daily_missions_for_user(uuid) FROM PUBLIC, anon, authenticated;

-- Le client a besoin de `kind` (pour distinguer le défi) et de `params` (pour
-- écrire « Hier : 1 h 42 » ou le nom du cours). L'ancienne signature ne les
-- renvoyait pas — d'où le DROP, un type de retour ne se remplace pas.
DROP FUNCTION IF EXISTS public.get_my_daily_missions();
CREATE FUNCTION public.get_my_daily_missions()
RETURNS TABLE(mission_id text, label_key text, xp integer, done boolean, kind text, params jsonb)
LANGUAGE plpgsql
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
  SELECT m.mission_id, 'xp.' || m.mission_id, m.xp,
         m.completed_at IS NOT NULL, m.kind, m.params
  FROM public.daily_mission_assignments m
  WHERE m.user_id = v_user_id AND m.mission_date = v_date
  ORDER BY m.slot;
END;
$$;
REVOKE ALL ON FUNCTION public.get_my_daily_missions() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_daily_missions() TO authenticated;

-- ----------------------------------------------------------------
-- 6. Missions hebdomadaires — objectifs calés sur l'habitude
--
-- Un objectif fixe ne peut pas convenir à la fois à quelqu'un qui étudie
-- 3 h par semaine et à quelqu'un qui en fait 20 : au premier c'est
-- décourageant, au second c'est déjà fait le mardi. La cible est donc dérivée
-- de la MÉDIANE des quatre semaines précédentes, majorée d'environ 15 % —
-- assez pour que ce soit une vraie semaine, pas assez pour que ce soit hors
-- d'atteinte. La médiane plutôt que la moyenne : une semaine de blocus
-- exceptionnelle ne doit pas fixer la barre des six suivantes.
--
-- Sans historique, on part sur des valeurs d'entrée modestes (3 h, 3 jours) :
-- un compte neuf doit pouvoir réussir sa première semaine.
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ensure_weekly_missions_for_user(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_timezone text := COALESCE(public.gamification_timezone(p_user_id), 'Europe/Paris');
  v_date date := (now() AT TIME ZONE v_timezone)::date;
  v_week date := public.gamification_week_start(v_date);
  v_med_min numeric; v_med_days numeric; v_med_courses numeric;
  v_course_count integer := 0;
  v_target_min integer; v_target_days integer; v_target_courses integer;
  v_slot integer := 0;
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.weekly_mission_assignments
    WHERE user_id = p_user_id AND week_start = v_week
  ) THEN
    RETURN;
  END IF;

  SELECT COUNT(*)::integer INTO v_course_count
  FROM public.courses WHERE user_id = p_user_id;

  SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY w.mins),
         percentile_cont(0.5) WITHIN GROUP (ORDER BY w.days),
         percentile_cont(0.5) WITHIN GROUP (ORDER BY w.courses)
  INTO v_med_min, v_med_days, v_med_courses
  FROM (
    SELECT public.gamification_week_start((s.started_at AT TIME ZONE v_timezone)::date) AS wk,
           (SUM(s.duration_seconds) / 60)::integer AS mins,
           COUNT(DISTINCT (s.started_at AT TIME ZONE v_timezone)::date)::integer AS days,
           COUNT(DISTINCT s.course_id) FILTER (WHERE s.course_id IS NOT NULL)::integer AS courses
    FROM public.sessions s
    WHERE s.user_id = p_user_id
      AND (s.started_at AT TIME ZONE v_timezone)::date >= v_week - 28
      AND (s.started_at AT TIME ZONE v_timezone)::date < v_week
    GROUP BY 1
  ) w;

  v_target_min := LEAST(1200, GREATEST(120,
    (ROUND(COALESCE(v_med_min, 157) * 1.15 / 30.0) * 30)::integer));
  v_target_days := LEAST(6, GREATEST(2, COALESCE(ROUND(v_med_days), 2)::integer + 1));
  v_target_courses := LEAST(LEAST(4, v_course_count), GREATEST(2,
    COALESCE(ROUND(v_med_courses), 1)::integer + 1));

  v_slot := v_slot + 1;
  INSERT INTO public.weekly_mission_assignments(
    user_id, week_start, slot, mission_id, target, xp, timezone_snapshot)
  VALUES (p_user_id, v_week, v_slot, 'w_hours', v_target_min,
          public.gamification_mission_xp('w_hours'), v_timezone)
  ON CONFLICT DO NOTHING;

  v_slot := v_slot + 1;
  INSERT INTO public.weekly_mission_assignments(
    user_id, week_start, slot, mission_id, target, xp, timezone_snapshot)
  VALUES (p_user_id, v_week, v_slot, 'w_days', v_target_days,
          public.gamification_mission_xp('w_days'), v_timezone)
  ON CONFLICT DO NOTHING;

  -- Sautée quand le compte n'a pas au moins deux cours : une mission qu'on ne
  -- peut pas réussir vaut moins que pas de mission du tout.
  IF v_course_count >= 2 THEN
    v_slot := v_slot + 1;
    INSERT INTO public.weekly_mission_assignments(
      user_id, week_start, slot, mission_id, target, xp, timezone_snapshot)
    VALUES (p_user_id, v_week, v_slot, 'w_courses', v_target_courses,
            public.gamification_mission_xp('w_courses'), v_timezone)
    ON CONFLICT DO NOTHING;
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.ensure_weekly_missions_for_user(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.refresh_weekly_missions_for_user(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_timezone text := COALESCE(public.gamification_timezone(p_user_id), 'Europe/Paris');
  v_date date := (now() AT TIME ZONE v_timezone)::date;
  v_week date := public.gamification_week_start(v_date);
  v_mins integer := 0; v_days integer := 0; v_courses integer := 0;
  v_current integer;
  m record;
BEGIN
  PERFORM public.ensure_weekly_missions_for_user(p_user_id);

  SELECT COALESCE((SUM(duration_seconds) / 60)::integer, 0),
         COUNT(DISTINCT (started_at AT TIME ZONE v_timezone)::date)::integer
  INTO v_mins, v_days
  FROM public.sessions
  WHERE user_id = p_user_id
    AND (started_at AT TIME ZONE v_timezone)::date BETWEEN v_week AND v_week + 6;

  SELECT COUNT(*)::integer INTO v_courses
  FROM (
    SELECT course_id
    FROM public.sessions
    WHERE user_id = p_user_id AND course_id IS NOT NULL
      AND (started_at AT TIME ZONE v_timezone)::date BETWEEN v_week AND v_week + 6
    GROUP BY course_id
    HAVING SUM(duration_seconds) >= 900
  ) q;

  FOR m IN
    SELECT * FROM public.weekly_mission_assignments
    WHERE user_id = p_user_id AND week_start = v_week
  LOOP
    v_current := CASE m.mission_id
      WHEN 'w_hours' THEN v_mins
      WHEN 'w_days' THEN v_days
      WHEN 'w_courses' THEN v_courses
      ELSE 0
    END;

    IF v_current >= m.target THEN
      UPDATE public.weekly_mission_assignments
      SET completed_at = COALESCE(completed_at, now()),
          claimed_at = COALESCE(claimed_at, now())
      WHERE user_id = p_user_id AND week_start = v_week AND mission_id = m.mission_id;

      INSERT INTO public.xp_ledger(user_id, source, source_key, xp)
      VALUES (p_user_id, 'weekly_mission', v_week::text || ':' || m.mission_id, m.xp)
      ON CONFLICT (user_id, source, source_key) DO NOTHING;
    END IF;
  END LOOP;
END;
$$;
REVOKE ALL ON FUNCTION public.refresh_weekly_missions_for_user(uuid) FROM PUBLIC, anon, authenticated;

-- `progress` est renvoyé pour la barre de progression : sans lui, la carte ne
-- pourrait afficher que « fait / pas fait », et une mission de sept jours qui
-- ne montre rien pendant six jours n'est pas une raison de revenir.
CREATE OR REPLACE FUNCTION public.get_my_weekly_missions()
RETURNS TABLE(mission_id text, label_key text, target integer, progress integer,
              xp integer, done boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_timezone text;
  v_week date;
  v_mins integer := 0; v_days integer := 0; v_courses integer := 0;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  PERFORM public.refresh_weekly_missions_for_user(v_user_id);
  v_timezone := COALESCE(public.gamification_timezone(v_user_id), 'Europe/Paris');
  v_week := public.gamification_week_start((now() AT TIME ZONE v_timezone)::date);

  SELECT COALESCE((SUM(duration_seconds) / 60)::integer, 0),
         COUNT(DISTINCT (started_at AT TIME ZONE v_timezone)::date)::integer
  INTO v_mins, v_days
  FROM public.sessions
  WHERE user_id = v_user_id
    AND (started_at AT TIME ZONE v_timezone)::date BETWEEN v_week AND v_week + 6;

  SELECT COUNT(*)::integer INTO v_courses
  FROM (
    SELECT course_id FROM public.sessions
    WHERE user_id = v_user_id AND course_id IS NOT NULL
      AND (started_at AT TIME ZONE v_timezone)::date BETWEEN v_week AND v_week + 6
    GROUP BY course_id HAVING SUM(duration_seconds) >= 900
  ) q;

  RETURN QUERY
  SELECT w.mission_id, 'xp.' || w.mission_id, w.target,
         CASE w.mission_id
           WHEN 'w_hours' THEN v_mins
           WHEN 'w_days' THEN v_days
           WHEN 'w_courses' THEN v_courses
           ELSE 0
         END,
         w.xp, w.completed_at IS NOT NULL
  FROM public.weekly_mission_assignments w
  WHERE w.user_id = v_user_id AND w.week_start = v_week
  ORDER BY w.slot;
END;
$$;
REVOKE ALL ON FUNCTION public.get_my_weekly_missions() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_weekly_missions() TO authenticated;
