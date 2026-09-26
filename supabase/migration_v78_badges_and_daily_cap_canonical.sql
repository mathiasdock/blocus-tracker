-- v78 — Badges et plafond quotidien sur les jours canoniques (Phase 5C,
-- fin du chantier jours / fuseaux).
--
-- 1. Badges de série (streak_3/7/14/30) : série OFFICIELLE (study_streaks,
--    moteur canonique v72/v73) au lieu de gamification_current_streak.
--    Avant le 2026-10-05 : règles historiques (1 s, joker +1) ; ensuite 5 min
--    et joker neutre ; hors blocus neutre. Seuils inchangés.
-- 2. marathon_day (≥ 6 h dans une journée) : le plus gros total de
--    session_days sur une date (23:30 → 00:30 = 30 min pour chaque date).
--    Heures totales, première session et autres badges : sources inchangées.
--    Un badge gagné n'est jamais retiré (insertion seule, ON CONFLICT).
-- 3. Plafond de 16 h par jour : porté par le total session_days de CHAQUE date
--    touchée par la session. Refusée si sa portion du premier OU du second
--    jour fait dépasser 16 h ; le message et `detail` donnent la date.
--    12 h par session, 200 sessions par jour, horodatages : inchangés.
--    Une modification qui n'augmente pas la portion d'une date reste permise
--    (les journées > 16 h de mai / juin 2026 ne bloquent pas une correction).
-- 4. Plus aucun appelant : gamification_current_streak et
--    gamification_best_streak (moteur de série legacy) sont supprimés.

-- ── 1 + 2. Badges ───────────────────────────────────────────────────────────
create or replace function public.award_badges_for_user(p_user_id uuid)
returns text[]
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
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
  v_badges text[] := array[]::text[];
begin
  if not exists (select 1 from public.profiles where id = p_user_id) then
    return v_badges;
  end if;

  select count(*)::integer, coalesce(sum(duration_seconds), 0) / 3600.0
  into v_session_count, v_total_hours
  from public.sessions where user_id = p_user_id;

  -- Journée la plus chargée : portions par date locale (session_days).
  select coalesce(max(day_seconds), 0) / 3600.0
  into v_max_daily_hours
  from (
    select sum(sd.seconds) as day_seconds
    from public.session_days sd
    where sd.user_id = p_user_id
    group by sd.local_date
  ) daily;

  -- Série officielle (Phase 5A).
  select s.current_streak into v_streak from public.study_streaks(p_user_id) s;
  v_streak := coalesce(v_streak, 0);

  select count(*)::integer into v_exam_count from public.exams where user_id = p_user_id;
  select count(*)::integer, count(*) filter (where done)::integer
  into v_objective_count, v_completed_count
  from public.objectives where user_id = p_user_id;

  select coalesce((select lifetime_posts from public.user_activity_totals where user_id = p_user_id), 0)
  into v_post_count;
  select coalesce((select lifetime_reactions from public.user_activity_totals where user_id = p_user_id), 0)
  into v_reaction_count;

  select count(*)::integer into v_group_count from public.group_members where user_id = p_user_id;
  select count(*)::integer into v_community_count from public.community_messages where user_id = p_user_id;
  select count(*)::integer into v_referral_count from public.referrals where referrer_id = p_user_id;
  select count(*)::integer into v_friend_count
  from public.friendships
  where status = 'accepted' and (requester = p_user_id or addressee = p_user_id);

  if v_session_count >= 1 then v_badges := array_append(v_badges, 'first_session'); end if;
  if v_streak >= 3 then v_badges := array_append(v_badges, 'streak_3'); end if;
  if v_streak >= 7 then v_badges := array_append(v_badges, 'streak_7'); end if;
  if v_streak >= 14 then v_badges := array_append(v_badges, 'streak_14'); end if;
  if v_streak >= 30 then v_badges := array_append(v_badges, 'streak_30'); end if;
  if v_total_hours >= 10 then v_badges := array_append(v_badges, 'hours_10'); end if;
  if v_total_hours >= 50 then v_badges := array_append(v_badges, 'hours_50'); end if;
  if v_total_hours >= 100 then v_badges := array_append(v_badges, 'hours_100'); end if;
  if v_total_hours >= 250 then v_badges := array_append(v_badges, 'hours_250'); end if;
  if v_max_daily_hours >= 6 then v_badges := array_append(v_badges, 'marathon_day'); end if;
  if v_objective_count >= 10 then v_badges := array_append(v_badges, 'planner'); end if;
  if v_completed_count >= 25 then v_badges := array_append(v_badges, 'strategist'); end if;
  if v_completed_count >= 75 then v_badges := array_append(v_badges, 'blocus_architect'); end if;
  if v_exam_count >= 1 then v_badges := array_append(v_badges, 'first_exam'); end if;
  if v_post_count >= 1 then v_badges := array_append(v_badges, 'first_post'); end if;
  if v_post_count >= 10 then v_badges := array_append(v_badges, 'influencer'); end if;
  if v_friend_count >= 1 then v_badges := array_append(v_badges, 'first_friend'); end if;
  if v_friend_count >= 20 then v_badges := array_append(v_badges, 'social'); end if;
  if v_reaction_count >= 25 then v_badges := array_append(v_badges, 'motivator'); end if;
  if v_group_count >= 1 then v_badges := array_append(v_badges, 'team_spirit'); end if;
  if v_community_count >= 10 then v_badges := array_append(v_badges, 'community_pillar'); end if;
  if v_referral_count >= 5 then v_badges := array_append(v_badges, 'referrer'); end if;

  insert into public.user_badges(user_id, badge_id)
  select p_user_id, badge_id from unnest(v_badges) as badge_id
  on conflict (user_id, badge_id) do nothing;

  select coalesce(array_agg(ub.badge_id order by ub.earned_at), array[]::text[])
  into v_badges
  from public.user_badges ub
  where ub.user_id = p_user_id;

  return v_badges;
end;
$$;

-- ── 3. Plafond de 16 h par date ─────────────────────────────────────────────
create or replace function public.validate_new_study_session()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_timezone text := coalesce(public.gamification_timezone(new.user_id), 'Europe/Paris');
  v_local_day date;
  v_other_count integer := 0;
  v_interval_seconds numeric;
  v_dates date[];
  v_day date;
  v_part record;
  v_other bigint;
  v_old bigint;
begin
  if new.started_at is null or new.ended_at is null then
    raise exception 'Session timestamps are required' using errcode = '22023';
  end if;

  v_local_day := (new.started_at at time zone v_timezone)::date;

  if new.duration_seconds <= 0 or new.duration_seconds > 43200 then
    raise exception 'Session duration must be between 1 second and 12 hours'
      using errcode = '22023';
  end if;
  if new.started_at > now() + interval '5 minutes' then
    raise exception 'Session cannot start in the future' using errcode = '22023';
  end if;
  if new.ended_at > now() + interval '5 minutes' then
    raise exception 'Session cannot end in the future' using errcode = '22023';
  end if;
  if new.ended_at < new.started_at then
    raise exception 'Session end must be after its start' using errcode = '22023';
  end if;

  v_interval_seconds := extract(epoch from (new.ended_at - new.started_at));
  if coalesce(current_setting('blocus.group_chrono_finish', true), '') = 'on' then
    -- Chrono de groupe (v66) : les pauses sont retirées de la durée, jamais
    -- ajoutées. Plus court que l'intervalle : légitime. Plus long : refusé.
    if new.duration_seconds > v_interval_seconds + 300 then
      raise exception 'Session timestamps do not match its duration' using errcode = '22023';
    end if;
  elsif abs(v_interval_seconds - new.duration_seconds) > 300 then
    raise exception 'Session timestamps do not match its duration' using errcode = '22023';
  end if;

  -- Verrous par (compte, date), toujours dans l'ordre croissant : deux
  -- sessions qui touchent les mêmes jours s'attendent au lieu de se croiser.
  select array_agg(distinct d order by d) into v_dates
  from (
    select q.local_date as d from (
      -- Portions par date, exactement comme les écrira a10_sync_session_day_parts
      -- (session_days) : fuseau de la session, ou règle legacy sans fuseau.
      select p.local_date, p.seconds
      from public.compute_session_day_parts(new.started_at, new.ended_at, new.duration_seconds, new.timezone) p
      where new.timezone is not null and new.day_parts_version is not null
      union all
      select (new.started_at at time zone 'Europe/Brussels')::date, new.duration_seconds
      where new.timezone is null or new.day_parts_version is null
    ) q
    union select v_local_day
  ) x;
  foreach v_day in array v_dates loop
    perform pg_advisory_xact_lock(hashtext(new.user_id::text), (v_day - date '2000-01-01')::integer);
  end loop;

  select count(*)
  into v_other_count
  from public.sessions s
  where s.user_id = new.user_id
    and s.id is distinct from new.id
    and (s.started_at at time zone v_timezone)::date = v_local_day;

  if v_other_count >= 200 then
    raise exception 'Daily study session count cannot exceed 200'
      using errcode = '22023';
  end if;

  for v_part in select q.local_date, q.seconds from (
      -- Portions par date, exactement comme les écrira a10_sync_session_day_parts
      -- (session_days) : fuseau de la session, ou règle legacy sans fuseau.
      select p.local_date, p.seconds
      from public.compute_session_day_parts(new.started_at, new.ended_at, new.duration_seconds, new.timezone) p
      where new.timezone is not null and new.day_parts_version is not null
      union all
      select (new.started_at at time zone 'Europe/Brussels')::date, new.duration_seconds
      where new.timezone is null or new.day_parts_version is null
    ) q order by q.local_date loop
    select coalesce(sum(sd.seconds), 0)
    into v_other
    from public.session_days sd
    where sd.user_id = new.user_id
      and sd.local_date = v_part.local_date
      and sd.session_id is distinct from new.id;

    if v_other + v_part.seconds > 57600 then
      -- Une modification qui n'alourdit pas cette date reste permise.
      if tg_op = 'UPDATE' then
        select coalesce(sum(sd.seconds), 0) into v_old
        from public.session_days sd
        where sd.session_id = old.id and sd.local_date = v_part.local_date;
        if v_part.seconds <= v_old then
          continue;
        end if;
      end if;
      raise exception 'Daily study duration cannot exceed 16 hours on %', v_part.local_date
        using errcode = '22023', hint = 'daily_cap', detail = v_part.local_date::text;
    end if;
  end loop;

  return new;
end;
$$;

-- ── 4. Moteur de série legacy : plus aucun appelant ─────────────────────────
drop function if exists public.gamification_current_streak(uuid);
drop function if exists public.gamification_best_streak(uuid);
