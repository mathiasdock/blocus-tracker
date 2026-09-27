-- v84 — Progression des badges (règles durcies, 10 nouveaux, 2 retirés).
-- DÉJÀ APPLIQUÉE en production le 2026-09-27 (MCP apply_migration) :
-- « Badge rules v84 in force since 2026-09-27T21:09:47.207512Z ».
--
-- Principe absolu : un badge gagné n'est JAMAIS retiré. L'attribution reste
-- une insertion seule (ON CONFLICT DO NOTHING) ; les anciens détenteurs d'un
-- badge durci le gardent, seuls les futurs déblocages suivent la règle v84.
-- L'instant de bascule est écrit en commentaire de badge_ids_for_user : la
-- fiche d'un badge obtenu AVANT affiche la règle de l'époque.
--
-- Sources canoniques uniquement :
--   • séries et jours étudiés : study_streaks / study_day_states (v72-v73) ;
--   • durées par jour et par cours : session_days (portions par date locale) ;
--   • une date au-delà de 16 h (anciens chronos oubliés, avant le plafond
--     v78) est écartée de TOUS les critères de durée ;
--   • une session compte pour « Dans la zone » / « Lève-tôt » entre 25 min et
--     12 h (plafond par session de validate_new_study_session), heure locale
--     de début dans le fuseau de la session (comme mission_day_metrics).
--
-- Règles modifiées :
--   streak_3/7/14/30  meilleure série officielle (plus la série en cours) ;
--                     streak_3 : 3 → 5 jours
--   marathon_day      6 h → 8 h sur une date (dates > 16 h écartées)
--   planner / strategist / blocus_architect
--                     10 / 25 / 75 objectifs ACCOMPLIS ET VÉRIFIÉS : coché,
--                     durée cible > 0, et le cours étudié au moins cette durée
--                     ce jour-là. Plusieurs objectifs du même cours le même
--                     jour se partagent le temps étudié (le plus court d'abord) :
--                     1 h étudiée ne valide pas dix objectifs d'1 h.
--   referrer          5 filleuls ayant étudié au moins 1 h au total
-- Retirés : motivator, community_pillar (aucun détenteur).
-- Nouveaux : steamroller, iron_month, metronome, regular, relentless,
--            in_the_zone, exam_ready, all_rounder, study_buddy, early_bird.

-- ── 1. Calcul pur : quels badges les données prouvent ─────────────────────
create or replace function public.badge_ids_for_user(p_user_id uuid)
returns text[]
language plpgsql
stable
security definer
set search_path = public, pg_catalog
as $$
declare
  v_session_count integer := 0;
  v_total_hours numeric := 0;
  v_best_streak integer := 0;
  v_studied_days integer := 0;
  v_first_day date;
  v_last_day date;
  v_marathon boolean := false;
  v_big_days integer := 0;
  v_iron_month boolean := false;
  v_metronome boolean := false;
  v_zone_sessions integer := 0;
  v_early_days integer := 0;
  v_exam_ready boolean := false;
  v_all_round_courses integer := 0;
  v_verified_objectives integer := 0;
  v_exam_count integer := 0;
  v_friend_count integer := 0;
  v_post_count integer := 0;
  v_group_count integer := 0;
  v_active_referrals integer := 0;
  v_study_buddy boolean := false;
  v_badges text[] := array[]::text[];
begin
  if not exists (select 1 from public.profiles where id = p_user_id) then
    return v_badges;
  end if;

  select count(*)::integer, coalesce(sum(duration_seconds), 0) / 3600.0
  into v_session_count, v_total_hours
  from public.sessions where user_id = p_user_id;

  -- Séries et jours étudiés : moteur officiel. La MEILLEURE série : une série
  -- cassée ne reprend rien de ce qu'elle a mérité.
  select s.best_streak, s.studied_days
  into v_best_streak, v_studied_days
  from public.study_streaks(p_user_id) s;
  v_best_streak := coalesce(v_best_streak, 0);
  v_studied_days := coalesce(v_studied_days, 0);

  -- Journées officielles. > 57 600 s (16 h) : date écartée.
  select min(d.local_date), max(d.local_date),
    coalesce(bool_or(d.secs between 28800 and 57600), false),
    (count(*) filter (where d.secs between 21600 and 57600))::integer
  into v_first_day, v_last_day, v_marathon, v_big_days
  from (
    select sd.local_date, sum(sd.seconds) as secs
    from public.session_days sd
    where sd.user_id = p_user_id
    group by sd.local_date
  ) d;

  -- Mois de fer / Métronome : jours ÉTUDIÉS au sens officiel (seuil de la
  -- date, v72), regroupés par mois civil et par semaine lundi → dimanche.
  if v_first_day is not null then
    with studied as (
      select st.local_date
      from public.study_day_states(p_user_id, v_first_day, v_last_day) st
      where st.is_studied
    ),
    months as (
      select count(*) as n from studied group by date_trunc('month', local_date)
    ),
    weeks as (
      select date_trunc('week', local_date)::date as w
      from studied group by 1 having count(*) >= 5
    )
    select coalesce((select max(n) from months), 0) >= 20,
      exists (
        select 1 from weeks a
        join weeks b on b.w = a.w + 7
        join weeks c on c.w = a.w + 14
      )
    into v_iron_month, v_metronome;
  end if;

  select
    (count(*) filter (where duration_seconds between 1500 and 43200))::integer,
    (count(distinct (started_at at time zone coalesce(timezone, 'Europe/Brussels'))::date) filter (
      where duration_seconds between 1500 and 43200
        and (started_at at time zone coalesce(timezone, 'Europe/Brussels'))::time >= time '05:00'
        and (started_at at time zone coalesce(timezone, 'Europe/Brussels'))::time < time '08:00'
    ))::integer
  into v_zone_sessions, v_early_days
  from public.sessions
  where user_id = p_user_id;

  -- Cours × jour, dates > 16 h écartées : examens, cours variés, objectifs.
  with days as (
    select sd.local_date, sum(sd.seconds) as secs
    from public.session_days sd
    where sd.user_id = p_user_id
    group by sd.local_date
  ),
  course_days as (
    select sd.course_id, sd.local_date, sum(sd.seconds) as secs
    from public.session_days sd
    join days d on d.local_date = sd.local_date and d.secs <= 57600
    where sd.user_id = p_user_id and sd.course_id is not null
    group by sd.course_id, sd.local_date
  ),
  -- Les 14 dates qui PRÉCÈDENT l'examen (J-14 … J-1, bornes incluses).
  exam_prep as (
    select e.id, sum(cd.secs) as secs
    from public.exams e
    join course_days cd
      on cd.course_id = e.course_id
     and cd.local_date between e.exam_date - 14 and e.exam_date - 1
    where e.user_id = p_user_id and e.course_id is not null
    group by e.id
  ),
  course_totals as (
    select cd.course_id, sum(cd.secs) as secs from course_days cd group by cd.course_id
  ),
  planned as (
    select cd.secs as studied,
      sum(o.target_minutes * 60) over (
        partition by o.course_id, o.scheduled_date
        order by o.target_minutes, o.id
        rows between unbounded preceding and current row
      ) as covered
    from public.objectives o
    join course_days cd on cd.course_id = o.course_id and cd.local_date = o.scheduled_date
    where o.user_id = p_user_id and o.done and o.target_minutes > 0
  )
  select
    exists (select 1 from exam_prep where secs >= 36000),
    (select count(*) from course_totals where secs >= 18000)::integer,
    (select count(*) from planned where covered <= studied)::integer
  into v_exam_ready, v_all_round_courses, v_verified_objectives;

  select count(*)::integer into v_exam_count from public.exams where user_id = p_user_id;
  select coalesce((select lifetime_posts from public.user_activity_totals where user_id = p_user_id), 0)
  into v_post_count;
  select count(*)::integer into v_group_count from public.group_members where user_id = p_user_id;
  select count(*)::integer into v_friend_count
  from public.friendships
  where status = 'accepted' and (requester = p_user_id or addressee = p_user_id);

  -- Filleuls qui ont réellement étudié : au moins 1 h au total.
  select count(distinct r.referred_id)::integer into v_active_referrals
  from public.referrals r
  where r.referrer_id = p_user_id
    and (select coalesce(sum(s.duration_seconds), 0) from public.sessions s where s.user_id = r.referred_id) >= 3600;

  -- Binôme : un chrono de groupe TERMINÉ, ≥ 25 min passées ensemble (depuis
  -- la dernière arrivée, pauses déduites) avec au moins un autre participant.
  -- Le membre a été crédité de la session par finish_group_chrono ; l'autre
  -- aussi, ou il est encore membre du groupe (pendant finish_group_chrono,
  -- les crédits sont insérés l'un après l'autre).
  select exists (
    select 1
    from public.group_chrono_sessions g
    join public.group_chrono_members me
      on me.session_id = g.id and me.user_id = p_user_id
     and me.status = 'accepted' and me.joined_at is not null
    join public.group_chrono_members other
      on other.session_id = g.id and other.user_id <> p_user_id
     and other.status = 'accepted' and other.joined_at is not null
    where g.status = 'finished'
      and g.started_at is not null and g.finished_at is not null
      and extract(epoch from (coalesce(g.last_pause_at, g.finished_at)
            - greatest(g.started_at, me.joined_at, other.joined_at)))
          - g.total_paused_seconds >= 1500
      and exists (
        select 1 from public.sessions s
        where s.user_id = p_user_id and s.started_at = g.started_at and s.ended_at = g.finished_at
      )
      and (
        exists (
          select 1 from public.sessions s
          where s.user_id = other.user_id and s.started_at = g.started_at and s.ended_at = g.finished_at
        )
        or exists (
          select 1 from public.group_members gm
          where gm.group_id = g.group_id and gm.user_id = other.user_id
        )
      )
  ) into v_study_buddy;

  -- Temps d'étude
  if v_session_count >= 1 then v_badges := array_append(v_badges, 'first_session'); end if;
  if v_total_hours >= 10 then v_badges := array_append(v_badges, 'hours_10'); end if;
  if v_total_hours >= 50 then v_badges := array_append(v_badges, 'hours_50'); end if;
  if v_total_hours >= 100 then v_badges := array_append(v_badges, 'hours_100'); end if;
  if v_total_hours >= 250 then v_badges := array_append(v_badges, 'hours_250'); end if;
  if v_marathon then v_badges := array_append(v_badges, 'marathon_day'); end if;
  if v_big_days >= 5 then v_badges := array_append(v_badges, 'steamroller'); end if;
  if v_zone_sessions >= 50 then v_badges := array_append(v_badges, 'in_the_zone'); end if;
  if v_early_days >= 5 then v_badges := array_append(v_badges, 'early_bird'); end if;
  -- Régularité
  if v_best_streak >= 5 then v_badges := array_append(v_badges, 'streak_3'); end if;
  if v_best_streak >= 7 then v_badges := array_append(v_badges, 'streak_7'); end if;
  if v_best_streak >= 14 then v_badges := array_append(v_badges, 'streak_14'); end if;
  if v_best_streak >= 30 then v_badges := array_append(v_badges, 'streak_30'); end if;
  if v_studied_days >= 15 then v_badges := array_append(v_badges, 'regular'); end if;
  if v_studied_days >= 50 then v_badges := array_append(v_badges, 'relentless'); end if;
  if v_metronome then v_badges := array_append(v_badges, 'metronome'); end if;
  if v_iron_month then v_badges := array_append(v_badges, 'iron_month'); end if;
  -- Objectifs et examens
  if v_exam_count >= 1 then v_badges := array_append(v_badges, 'first_exam'); end if;
  if v_verified_objectives >= 10 then v_badges := array_append(v_badges, 'planner'); end if;
  if v_verified_objectives >= 25 then v_badges := array_append(v_badges, 'strategist'); end if;
  if v_verified_objectives >= 75 then v_badges := array_append(v_badges, 'blocus_architect'); end if;
  if v_exam_ready then v_badges := array_append(v_badges, 'exam_ready'); end if;
  if v_all_round_courses >= 5 then v_badges := array_append(v_badges, 'all_rounder'); end if;
  -- Entre amis / communauté
  if v_friend_count >= 1 then v_badges := array_append(v_badges, 'first_friend'); end if;
  if v_friend_count >= 20 then v_badges := array_append(v_badges, 'social'); end if;
  if v_post_count >= 1 then v_badges := array_append(v_badges, 'first_post'); end if;
  if v_post_count >= 10 then v_badges := array_append(v_badges, 'influencer'); end if;
  if v_group_count >= 1 then v_badges := array_append(v_badges, 'team_spirit'); end if;
  if v_study_buddy then v_badges := array_append(v_badges, 'study_buddy'); end if;
  if v_active_referrals >= 5 then v_badges := array_append(v_badges, 'referrer'); end if;

  return v_badges;
end;
$$;

revoke all on function public.badge_ids_for_user(uuid) from public, anon, authenticated;
grant execute on function public.badge_ids_for_user(uuid) to service_role;

-- ── 2. Attribution : insertion seule, jamais de retrait ───────────────────
create or replace function public.award_badges_for_user(p_user_id uuid)
returns text[]
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_badges text[] := array[]::text[];
begin
  if not exists (select 1 from public.profiles where id = p_user_id) then
    return v_badges;
  end if;

  insert into public.user_badges (user_id, badge_id)
  select p_user_id, badge_id
  from unnest(public.badge_ids_for_user(p_user_id)) as badge_id
  on conflict (user_id, badge_id) do nothing;

  select coalesce(array_agg(ub.badge_id order by ub.earned_at), array[]::text[])
  into v_badges
  from public.user_badges ub
  where ub.user_id = p_user_id;
  return v_badges;
end;
$$;

-- ── 3. XP par palier (inchangé pour les badges existants) ─────────────────
-- Découverte 50 · Commun 125 · Rare 300 · Épique 600 · Légendaire 1 200.
-- Même table que lib/badgeArt.js (BADGE_RARITY) + lib/badges.js.
create or replace function public.gamification_badge_xp(p_badge_id text)
returns integer
language sql
immutable
set search_path = public, pg_catalog
as $$
  select case p_badge_id
    when 'first_session'    then 50
    when 'first_friend'     then 50
    when 'first_exam'       then 50
    when 'first_post'       then 50
    when 'team_spirit'      then 50
    when 'hours_10'         then 125
    when 'marathon_day'     then 125
    when 'streak_3'         then 125
    when 'planner'          then 125
    when 'study_buddy'      then 125
    when 'hours_50'         then 300
    when 'streak_7'         then 300
    when 'strategist'       then 300
    when 'influencer'       then 300
    when 'steamroller'      then 300
    when 'regular'          then 300
    when 'in_the_zone'      then 300
    when 'exam_ready'       then 300
    when 'all_rounder'      then 300
    when 'early_bird'       then 300
    when 'hours_100'        then 600
    when 'streak_14'        then 600
    when 'social'           then 600
    when 'referrer'         then 600
    when 'metronome'        then 600
    when 'relentless'       then 600
    when 'hours_250'        then 1200
    when 'streak_30'        then 1200
    when 'blocus_architect' then 1200
    when 'iron_month'       then 1200
    else 50
  end;
$$;

-- ── 4. Parrain réévalué quand son filleul étudie ──────────────────────────
create or replace function public.refresh_gamification_after_event()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_user_id uuid;
  v_referrer uuid;
begin
  if TG_TABLE_NAME = 'friendships' then
    if NEW.status = 'accepted' then
      perform public.award_badges_for_user(NEW.requester);
      perform public.award_badges_for_user(NEW.addressee);
      perform public.refresh_daily_missions_for_user(NEW.requester);
      perform public.refresh_daily_missions_for_user(NEW.addressee);
    end if;
    return NEW;
  elsif TG_TABLE_NAME = 'referrals' then
    v_user_id := NEW.referrer_id;
  else
    v_user_id := NEW.user_id;
  end if;

  if v_user_id is not null then
    perform public.award_badges_for_user(v_user_id);
    perform public.refresh_daily_missions_for_user(v_user_id);
  end if;

  -- v84 : un filleul ne compte pour « Ambassadeur » qu'après 1 h d'étude ;
  -- c'est SA session qui peut débloquer le badge de son parrain.
  if TG_TABLE_NAME = 'sessions' and v_user_id is not null then
    select r.referrer_id into v_referrer
    from public.referrals r
    where r.referred_id = v_user_id
      and not exists (
        select 1 from public.user_badges ub
        where ub.user_id = r.referrer_id and ub.badge_id = 'referrer'
      )
    limit 1;
    if v_referrer is not null then
      perform public.award_badges_for_user(v_referrer);
    end if;
  end if;
  return NEW;
end;
$$;

-- ── 5. Instant de bascule, lu par la fiche des badges ─────────────────────
do $$
begin
  execute format(
    'comment on function public.badge_ids_for_user(uuid) is %L',
    'Badge rules v84 in force since '
      || to_char(now() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')
  );
end;
$$;
