-- v73 — La série officielle passe sur le modèle canonique (Phase 5A2).
--
-- Devient canonique (public.study_streaks, règles v72, jours hors blocus
-- neutres sur toute l'histoire) :
--   · niveaux / XP : série affichée et meilleure série × 10 (get_gamification_levels) ;
--   · la série de l'utilisateur pour ses propres écrans (get_my_streak) ;
--   · le rappel « série en danger » (study_streak_reminder_states).
--
-- Reste LEGACY, volontairement et temporairement, jusqu'aux phases 5B/5C :
--   public.gamification_current_streak — jour de début de session, fuseau du
--   profil, jokers +1 — utilisée UNIQUEMENT par :
--     award_badges_for_user (badges streak_*),
--     refresh_daily_missions_for_user (mission m_streak),
--     gamification_pick_challenge (défi « protège ta série »).
--   public.gamification_best_streak — plus aucun appelant ; gardée pour
--   comparaison et retour arrière, à supprimer en 5C.
-- Ces fonctions ne sont PAS modifiées ici : missions, badges et défi du jour
-- gardent exactement leur comportement.
-- Le classement (get_leaderboard_v2) a son propre calcul et reste hors périmètre.

-- ── 1. Même résultat, moins de requêtes par jour ────────────────────────────
-- Règles lues une fois, jokers et blocus en jointure : ~3 ms par compte au
-- lieu de ~10 (mesuré sur les 30 comptes les plus chargés, résultats
-- identiques ligne à ligne à v72).
create or replace function public.study_day_states(
  p_user_id uuid,
  p_from date,
  p_to date,
  p_today date default null
)
returns table (
  local_date date,
  studied_seconds bigint,
  min_seconds integer,
  is_studied boolean,
  has_freeze boolean,
  outside_blocus boolean,
  preserves_streak boolean,
  increments_streak boolean,
  state text
)
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  with rules as (
    select legacy_min_seconds, min_seconds, new_rules_from from public.study_day_rules where id
  ),
  params as (
    select coalesce(
      p_today,
      (now() at time zone coalesce(public.gamification_timezone(p_user_id), 'Europe/Paris'))::date
    ) as today
  ),
  blocus as (
    select b.start_date, b.end_date from public.blocus_periods b where b.user_id = p_user_id
  ),
  cal as (
    select g::date as d
    from generate_series(p_from, p_to, interval '1 day') g
    where p_from <= p_to and p_to - p_from <= 3660
  ),
  studied as (
    select sd.local_date as d, sum(sd.seconds)::bigint as secs
    from public.session_days sd
    where sd.user_id = p_user_id and sd.local_date between p_from and p_to
    group by sd.local_date
  ),
  frozen as (
    select distinct f.used_on as d
    from public.streak_freeze_days f
    where f.user_id = p_user_id and f.used_on between p_from and p_to
  ),
  facts as (
    select c.d,
      coalesce(s.secs, 0) as secs,
      case when r.new_rules_from is not null and c.d >= r.new_rules_from
        then r.min_seconds else r.legacy_min_seconds end as min_secs,
      (r.new_rules_from is null or c.d < r.new_rules_from) as freeze_counts,
      (fz.d is not null) as is_frozen,
      (exists (select 1 from blocus)
        and not exists (select 1 from blocus b where c.d between b.start_date and b.end_date)) as off_blocus,
      p.today
    from cal c
    cross join rules r
    cross join params p
    left join studied s on s.d = c.d
    left join frozen fz on fz.d = c.d
  )
  select f.d, f.secs, f.min_secs,
    f.secs >= f.min_secs,
    f.is_frozen,
    f.off_blocus,
    f.secs >= f.min_secs or f.is_frozen or f.off_blocus,
    f.secs >= f.min_secs or (f.is_frozen and f.freeze_counts),
    case
      when f.secs >= f.min_secs then 'studied'
      when f.is_frozen or f.off_blocus then 'neutral'
      when f.d >= f.today then 'pending'
      else 'missed'
    end
  from facts f
  order by f.d;
$$;

revoke all on function public.study_day_states(uuid, date, date, date) from public, anon, authenticated;

-- ── 2. Niveaux / XP : série et meilleure série canoniques ───────────────────
-- Seules les deux lignes qui lisaient la série changent ; le reste du calcul
-- (XP d'étude, objectifs, examens, badges, missions, parrainage, seuils de
-- niveau) est recopié à l'identique.
create or replace function public.get_gamification_levels(p_user_ids uuid[])
returns table (
  user_id uuid, total_xp bigint, level integer, title_key text, progress_xp bigint, range_xp integer,
  progress_pct integer, streak integer, badge_count integer, mission_xp bigint, study_xp bigint,
  objective_xp bigint, streak_xp bigint, exam_xp bigint, badge_xp bigint, referral_xp bigint
)
language plpgsql
stable
security definer
set search_path = public, pg_catalog
as $function$
DECLARE
  v_user_id uuid;
  v_study_xp bigint;
  v_objective_xp bigint;
  v_exam_xp bigint;
  v_badge_xp bigint;
  v_bonus_xp bigint;
  v_mission_xp bigint;
  v_streak integer;
  v_best_streak integer;
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
    SELECT COUNT(*)::integer, COALESCE(SUM(public.gamification_badge_xp(badge_id)), 0)::bigint
    INTO badge_count, v_badge_xp FROM public.user_badges WHERE user_badges.user_id = v_user_id;
    SELECT COALESCE(profiles.bonus_xp, 0)::bigint
    INTO v_bonus_xp FROM public.profiles WHERE profiles.id = v_user_id;
    SELECT COALESCE(SUM(xp), 0)::bigint
    INTO v_mission_xp FROM public.xp_ledger WHERE xp_ledger.user_id = v_user_id;

    -- Série officielle (v73) : modèle canonique, jamais le calcul legacy.
    SELECT s.current_streak, s.best_streak
    INTO v_streak, v_best_streak
    FROM public.study_streaks(v_user_id) s;
    v_streak := COALESCE(v_streak, 0);
    v_best_streak := COALESCE(v_best_streak, 0);

    v_total := COALESCE(v_study_xp, 0) + COALESCE(v_objective_xp, 0)
      + (v_best_streak * 10) + COALESCE(v_exam_xp, 0) + COALESCE(v_badge_xp, 0)
      + COALESCE(v_bonus_xp, 0) + COALESCE(v_mission_xp, 0);
    v_level := public.gamification_level_for_xp(v_total);
    v_current_threshold := public.gamification_level_threshold(v_level);
    v_next_threshold := CASE WHEN v_level < 30
      THEN public.gamification_level_threshold(v_level + 1)
      ELSE v_current_threshold + 1
    END;

    user_id := v_user_id;
    total_xp := v_total;
    level := v_level;
    title_key := 'xp.level' || v_level;
    progress_xp := v_total - v_current_threshold;
    range_xp := v_next_threshold - v_current_threshold;
    progress_pct := CASE WHEN v_level = 30 THEN 100 ELSE
      LEAST(100, ROUND((progress_xp::numeric / GREATEST(range_xp, 1)) * 100)::integer)
    END;
    streak := v_streak;
    mission_xp := COALESCE(v_mission_xp, 0);
    study_xp := COALESCE(v_study_xp, 0);
    objective_xp := COALESCE(v_objective_xp, 0);
    streak_xp := (v_best_streak * 10)::bigint;
    exam_xp := COALESCE(v_exam_xp, 0);
    badge_xp := COALESCE(v_badge_xp, 0);
    referral_xp := COALESCE(v_bonus_xp, 0);
    RETURN NEXT;
  END LOOP;
END;
$function$;

-- ── 3. Ma série, pour mes écrans ────────────────────────────────────────────
-- `p_today` = la date locale de l'appareil, pour que l'écran et le serveur
-- parlent du même « aujourd'hui ». Bornée à ±1 jour de la date serveur (fuseau
-- du profil) : elle ne peut que choisir le jour affiché, jamais réécrire
-- l'histoire. Renvoie aussi les règles, pour le calcul immédiat côté appareil.
create or replace function public.get_my_streak(p_today date default null)
returns table (
  current_streak integer,
  best_streak integer,
  studied_days integer,
  today date,
  legacy_min_seconds integer,
  min_seconds integer,
  new_rules_from date
)
language plpgsql
stable
security definer
set search_path = public, pg_catalog
as $$
declare
  v_user uuid := auth.uid();
  v_server_today date;
  v_today date;
begin
  if v_user is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  v_server_today := (now() at time zone coalesce(public.gamification_timezone(v_user), 'Europe/Paris'))::date;
  v_today := case
    when p_today between v_server_today - 1 and v_server_today + 1 then p_today
    else v_server_today
  end;
  return query
  select s.current_streak, s.best_streak, s.studied_days, v_today,
         r.legacy_min_seconds, r.min_seconds, r.new_rules_from
  from public.study_streaks(v_user, v_today) s
  cross join public.study_day_rules r
  where r.id;
end;
$$;

revoke all on function public.get_my_streak(date) from public, anon;
grant execute on function public.get_my_streak(date) to authenticated;

-- ── 4. Rappel « série en danger » (serveur uniquement) ──────────────────────
-- Pour chaque compte : sa date locale d'aujourd'hui (fuseau du profil, celui
-- que le rappel utilise déjà) ; si aujourd'hui est déjà un jour ÉTUDIÉ selon la
-- règle de cette date (5 min à partir du 2026-10-05) ; si aujourd'hui PRÉSERVE
-- déjà la série (étudié, joker, ou hors blocus : série en pause, rien à
-- risquer) ; et la série en cours, aujourd'hui non compté tant qu'il n'est pas
-- étudié. Le rappel ne part que si aujourd'hui ne préserve rien.
create or replace function public.study_streak_reminder_states(p_user_ids uuid[], p_now timestamptz default now())
returns table (user_id uuid, today date, studied_today boolean, today_preserves_streak boolean, current_streak integer)
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  with u as (
    select distinct x as uid,
      (p_now at time zone coalesce(public.gamification_timezone(x), 'Europe/Paris'))::date as today
    from unnest(coalesce(p_user_ids, '{}'::uuid[])) x
    where cardinality(coalesce(p_user_ids, '{}'::uuid[])) <= 5000
  ),
  t as (
    select u.uid, u.today, st.is_studied, st.preserves_streak
    from u
    cross join lateral public.study_day_states(u.uid, u.today, u.today, u.today) st
  )
  select t.uid, t.today, t.is_studied, t.preserves_streak,
    coalesce((select s.current_streak from public.study_streaks(t.uid, t.today) s), 0)
  from t;
$$;

revoke all on function public.study_streak_reminder_states(uuid[], timestamptz) from public, anon, authenticated;

-- ── 5. Étiquettes : ce qui est legacy et pour combien de temps ──────────────
comment on function public.gamification_current_streak(uuid) is
  'LEGACY (v73) — série historique (jour de début, fuseau du profil). Utilisée seulement par les badges, les missions du jour et le défi du jour jusqu''à leurs phases 5B/5C. La série officielle est public.study_streaks.';
comment on function public.gamification_best_streak(uuid) is
  'LEGACY (v73) — plus aucun appelant ; gardée pour comparaison et retour arrière, à supprimer en 5C. La meilleure série officielle est public.study_streaks.';
comment on function public.study_streaks(uuid, date) is
  'Série officielle (v73) : jours de session_days, règles versionnées de study_day_rules, jours hors blocus neutres.';
