-- v76 — Missions sur les jours canoniques (Phase 5B).
--
-- Trois familles, trois sources :
--   A. durée d'un jour / d'une semaine / d'un cours → public.session_days
--      (le temps attribué à chaque date locale, découpé à minuit dans le fuseau
--      de LA session ; le fuseau actuel du profil ne déplace jamais rien) :
--      m_25m, m_1h, m_2h, m_3h, m_2courses, m_3courses, m_least_studied,
--      m_exam_next, m_exam_week, tous les défis c_*, w_hours, w_courses,
--      et les métriques de sélection (14 jours, hier, moyenne, dernier jour
--      étudié, cours négligé, médianes hebdomadaires).
--      La règle des 5 min du streak ne s'y applique PAS : 25 min = 25 min.
--   B. jours étudiés / série → moteur canonique : w_days compte les jours
--      'studied' (seuil de LA date : 1 s avant le 2026-10-05, 300 s ensuite ;
--      un joker ou un jour hors blocus ne sont pas étudiés) ; la sélection de
--      c_protect_streak lit la série officielle (study_streaks) ; l'ancienne
--      m_streak (plus attribuée depuis le 2026-09-09) = jour étudié.
--   C. une session précise → public.sessions, rattachée au jour local de son
--      DÉBUT dans son propre fuseau : m_s25, m_s50, m_s90, m_two_sessions,
--      m_two_focused, m_noon, m_note, et la plus longue session récente.
--   Objectifs (m_obj1, m_obj2, m_newobj) et parrainage : inchangés.
--
-- Missions déjà attribuées : identité, type, paramètres, cible et XP ne
-- changent pas. Une mission complétée le reste (completed_at n'est jamais
-- effacé) ; la récompense passe par xp_ledger ON CONFLICT DO NOTHING — jamais
-- deux fois.
--
-- Synchronisation tardive : une portion de session qui arrive pour une date
-- (session à cheval sur minuit, hors ligne, deuxième appareil) recalcule la
-- mission DÉJÀ attribuée à cette date et la semaine qui la contient — jamais
-- de création rétroactive. Seulement à partir de mission_late_completion_from()
-- (2026-09-26) : les 14 missions historiques (1er août → 3 septembre) que la
-- nouvelle logique jugerait réussies ne sont pas payées sans décision.

-- ── 0. Date à partir de laquelle une mission se complète après coup ─────────
create or replace function public.mission_late_completion_from()
returns date
language sql
immutable
as $$ select date '2026-09-26' $$;

revoke all on function public.mission_late_completion_from() from public, anon, authenticated;

-- ── 1. Mesures d'un jour ────────────────────────────────────────────────────
create or replace function public.mission_day_metrics(p_user_id uuid, p_date date)
returns table (
  day_seconds bigint,
  course_minutes jsonb,
  courses_15 integer,
  max_session integer,
  session_count integer,
  focused_count integer,
  before_noon boolean,
  has_note boolean
)
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  with parts as (
    select sd.course_id, sum(sd.seconds)::bigint as secs
    from public.session_days sd
    where sd.user_id = p_user_id and sd.local_date = p_date
    group by sd.course_id
  ),
  started as (
    -- Sessions qui COMMENCENT ce jour-là, dans leur propre fuseau (règle
    -- legacy de session_days pour les très anciennes sans fuseau).
    select s.duration_seconds, s.note,
           (s.started_at at time zone coalesce(s.timezone, 'Europe/Brussels')) as local_start
    from public.sessions s
    where s.user_id = p_user_id
      and s.started_at >= (p_date - 1)::timestamp at time zone 'UTC'
      and s.started_at < (p_date + 2)::timestamp at time zone 'UTC'
      and (s.started_at at time zone coalesce(s.timezone, 'Europe/Brussels'))::date = p_date
  )
  select
    coalesce((select sum(secs) from parts), 0)::bigint,
    coalesce((select jsonb_object_agg(course_id::text, (secs / 60)::integer) from parts where course_id is not null), '{}'::jsonb),
    (select count(*) from parts where course_id is not null and secs / 60 >= 15)::integer,
    coalesce((select max(duration_seconds) from started), 0)::integer,
    (select count(*) from started)::integer,
    (select count(*) from started where duration_seconds >= 1500)::integer,
    coalesce((select bool_or(extract(hour from local_start) < 12) from started), false),
    coalesce((select bool_or(nullif(btrim(note), '') is not null) from started), false);
$$;

revoke all on function public.mission_day_metrics(uuid, date) from public, anon, authenticated;

-- ── 2. Progression d'une semaine (lundi → dimanche) ─────────────────────────
create or replace function public.weekly_mission_progress(p_user_id uuid, p_week date)
returns table (minutes integer, studied_days integer, courses integer)
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  with days as (
    select sd.local_date, sum(sd.seconds)::bigint as secs
    from public.session_days sd
    where sd.user_id = p_user_id and sd.local_date between p_week and p_week + 6
    group by sd.local_date
  ),
  by_course as (
    select sd.course_id, sum(sd.seconds)::bigint as secs
    from public.session_days sd
    where sd.user_id = p_user_id and sd.course_id is not null
      and sd.local_date between p_week and p_week + 6
    group by sd.course_id
  )
  select
    -- Minutes TRONQUÉES, comme avant (somme entière / 60), jamais arrondies.
    coalesce((select (sum(secs)::bigint / 60)::integer from days), 0),
    (select count(*) from days where secs >= public.study_day_min_seconds(local_date))::integer,
    (select count(*) from by_course where secs >= 900)::integer;
$$;

revoke all on function public.weekly_mission_progress(uuid, date) from public, anon, authenticated;

-- ── 3. Évaluer les missions quotidiennes d'UNE date (jamais créer) ──────────
create or replace function public.refresh_daily_missions_for_date(p_user_id uuid, p_date date)
returns void
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_timezone text := coalesce(public.gamification_timezone(p_user_id), 'Europe/Paris');
  v_start timestamptz := p_date::timestamp at time zone v_timezone;
  v_end timestamptz := (p_date + 1)::timestamp at time zone v_timezone;
  x record;
  v_today_min integer;
  v_exam_week_min integer := 0;
  v_done_objectives integer := 0;
  v_tomorrow_objectives integer := 0;
  v_studied boolean := false;
  v_referred boolean := false;
  v_target integer;
  v_course text;
  v_done boolean;
  m record;
begin
  -- Rien d'attribué ce jour-là, ou déjà tout réussi : rien à faire.
  if not exists (
    select 1 from public.daily_mission_assignments
    where user_id = p_user_id and mission_date = p_date and completed_at is null
  ) then
    return;
  end if;

  select * into x from public.mission_day_metrics(p_user_id, p_date);
  v_today_min := (x.day_seconds / 60)::integer;

  select coalesce(max((x.course_minutes ->> e.course_id::text)::integer), 0)
  into v_exam_week_min
  from public.exams e
  where e.user_id = p_user_id and e.course_id is not null
    and e.exam_date between p_date and p_date + 7;

  select count(*) filter (where done and scheduled_date = p_date)::integer,
         count(*) filter (where scheduled_date = p_date + 1)::integer
  into v_done_objectives, v_tomorrow_objectives
  from public.objectives where user_id = p_user_id;

  select s.is_studied into v_studied
  from public.study_day_states(p_user_id, p_date, p_date, p_date) s;

  select exists (
    select 1 from public.referrals r
    where r.referrer_id = p_user_id and r.mission_bonus = true
      and r.created_at >= v_start and r.created_at < v_end
  ) into v_referred;

  for m in
    select * from public.daily_mission_assignments
    where user_id = p_user_id and mission_date = p_date and completed_at is null
    order by slot
  loop
    v_target := coalesce((m.params ->> 'target')::integer, 0);
    v_course := m.params ->> 'course_id';

    v_done := case m.mission_id
      when 'm_25m' then x.day_seconds >= 1500
      when 'm_1h' then x.day_seconds >= 3600
      when 'm_2h' then x.day_seconds >= 7200
      when 'm_3h' then x.day_seconds >= 10800
      when 'm_s25' then x.max_session >= 1500
      when 'm_s50' then x.max_session >= 3000
      when 'm_s90' then x.max_session >= 5400
      when 'm_two_sessions' then x.session_count >= 2
      when 'm_two_focused' then x.focused_count >= 2
      when 'm_2courses' then x.courses_15 >= 2
      when 'm_3courses' then x.courses_15 >= 3
      when 'm_noon' then x.before_noon
      when 'm_note' then x.has_note
      when 'm_least_studied' then
        v_course is not null and coalesce((x.course_minutes ->> v_course)::integer, 0) >= greatest(v_target, 1)
      when 'm_exam_next' then
        v_course is not null and coalesce((x.course_minutes ->> v_course)::integer, 0) >= greatest(v_target, 1)
      when 'm_exam_week' then v_exam_week_min >= 15
      when 'c_exam_soon' then
        v_course is not null and coalesce((x.course_minutes ->> v_course)::integer, 0) >= greatest(v_target, 1)
      when 'c_neglected' then
        v_course is not null and coalesce((x.course_minutes ->> v_course)::integer, 0) >= greatest(v_target, 1)
      when 'c_protect_streak' then v_today_min >= greatest(v_target, 1)
      when 'c_beat_yesterday' then v_today_min >= greatest(v_target, 1)
      when 'c_beat_average' then v_today_min >= greatest(v_target, 1)
      when 'c_comeback' then v_today_min >= greatest(v_target, 1)
      when 'c_first_session' then v_today_min >= greatest(v_target, 1)
      when 'm_obj1' then v_done_objectives >= 1
      when 'm_obj2' then v_done_objectives >= 2
      when 'm_newobj' then v_tomorrow_objectives >= 1
      when 'm_streak' then coalesce(v_studied, false)
      when 'm_referral' then v_referred
      else false
    end;

    if v_done then
      update public.daily_mission_assignments
      set completed_at = coalesce(completed_at, now()),
          claimed_at = coalesce(claimed_at, now())
      where user_id = p_user_id and mission_date = p_date and mission_id = m.mission_id;

      if m.mission_id <> 'm_referral' then
        insert into public.xp_ledger(user_id, source, source_key, xp)
        values (p_user_id, 'daily_mission', p_date::text || ':' || m.mission_id, m.xp)
        on conflict (user_id, source, source_key) do nothing;
      end if;
    end if;
  end loop;
end;
$$;

revoke all on function public.refresh_daily_missions_for_date(uuid, date) from public, anon, authenticated;

-- Aujourd'hui : attribuer si besoin (fuseau du profil = quel jour on est),
-- puis évaluer. Même signature qu'avant : badges, amitiés, parrainages et le
-- déclencheur des sessions continuent de l'appeler.
create or replace function public.refresh_daily_missions_for_user(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
begin
  perform public.ensure_daily_missions_for_user(p_user_id);
  perform public.refresh_daily_missions_for_date(
    p_user_id,
    (now() at time zone coalesce(public.gamification_timezone(p_user_id), 'Europe/Paris'))::date
  );
end;
$$;

-- ── 4. Évaluer les missions d'UNE semaine (jamais créer) ────────────────────
create or replace function public.refresh_weekly_missions_for_week(p_user_id uuid, p_week date)
returns void
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  p record;
  v_current integer;
  m record;
begin
  if not exists (
    select 1 from public.weekly_mission_assignments
    where user_id = p_user_id and week_start = p_week and completed_at is null
  ) then
    return;
  end if;

  select * into p from public.weekly_mission_progress(p_user_id, p_week);

  for m in
    select * from public.weekly_mission_assignments
    where user_id = p_user_id and week_start = p_week and completed_at is null
  loop
    v_current := case m.mission_id
      when 'w_hours' then p.minutes
      when 'w_days' then p.studied_days
      when 'w_courses' then p.courses
      else 0
    end;

    if v_current >= m.target then
      update public.weekly_mission_assignments
      set completed_at = coalesce(completed_at, now()),
          claimed_at = coalesce(claimed_at, now())
      where user_id = p_user_id and week_start = p_week and mission_id = m.mission_id;

      insert into public.xp_ledger(user_id, source, source_key, xp)
      values (p_user_id, 'weekly_mission', p_week::text || ':' || m.mission_id, m.xp)
      on conflict (user_id, source, source_key) do nothing;
    end if;
  end loop;
end;
$$;

revoke all on function public.refresh_weekly_missions_for_week(uuid, date) from public, anon, authenticated;

create or replace function public.refresh_weekly_missions_for_user(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
begin
  perform public.ensure_weekly_missions_for_user(p_user_id);
  perform public.refresh_weekly_missions_for_week(
    p_user_id,
    public.gamification_week_start((now() at time zone coalesce(public.gamification_timezone(p_user_id), 'Europe/Paris'))::date)
  );
end;
$$;

create or replace function public.get_my_weekly_missions()
returns table (mission_id text, label_key text, target integer, progress integer, xp integer, done boolean)
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_user_id uuid := auth.uid();
  v_week date;
  p record;
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  perform public.refresh_weekly_missions_for_user(v_user_id);
  v_week := public.gamification_week_start((now() at time zone coalesce(public.gamification_timezone(v_user_id), 'Europe/Paris'))::date);
  select * into p from public.weekly_mission_progress(v_user_id, v_week);

  return query
  select w.mission_id, 'xp.' || w.mission_id, w.target,
         case w.mission_id
           when 'w_hours' then p.minutes
           when 'w_days' then p.studied_days
           when 'w_courses' then p.courses
           else 0
         end,
         w.xp, w.completed_at is not null
  from public.weekly_mission_assignments w
  where w.user_id = v_user_id and w.week_start = v_week
  order by w.slot;
end;
$$;

-- ── 5. Attribution : mêmes règles, mesures canoniques ───────────────────────
create or replace function public.ensure_weekly_missions_for_user(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_timezone text := coalesce(public.gamification_timezone(p_user_id), 'Europe/Paris');
  v_date date := (now() at time zone v_timezone)::date;
  v_week date := public.gamification_week_start(v_date);
  v_med_min numeric; v_med_days numeric; v_med_courses numeric;
  v_week_so_far integer := 0;
  v_course_count integer := 0;
  v_target_min integer; v_target_days integer; v_target_courses integer;
  v_slot integer := 0;
begin
  if exists (
    select 1 from public.weekly_mission_assignments
    where user_id = p_user_id and week_start = v_week
  ) then
    return;
  end if;

  select count(*)::integer into v_course_count
  from public.courses where user_id = p_user_id and archived_at is null;

  -- Médianes des quatre semaines précédentes : minutes, jours ÉTUDIÉS (même
  -- définition que la progression de w_days), cours travaillés.
  with parts as (
    select public.gamification_week_start(sd.local_date) as wk, sd.local_date, sd.course_id,
           sum(sd.seconds)::bigint as secs
    from public.session_days sd
    where sd.user_id = p_user_id and sd.local_date >= v_week - 28 and sd.local_date < v_week
    group by 1, 2, 3
  ),
  days as (
    select wk, local_date, sum(secs)::bigint as secs from parts group by 1, 2
  ),
  weeks as (
    select wk, (sum(secs)::bigint / 60)::integer as mins,
           count(*) filter (where secs >= public.study_day_min_seconds(local_date))::integer as days
    from days group by wk
  ),
  week_courses as (
    select wk, count(distinct course_id)::integer as courses
    from parts where course_id is not null group by wk
  )
  select percentile_cont(0.5) within group (order by w.mins),
         percentile_cont(0.5) within group (order by w.days),
         percentile_cont(0.5) within group (order by coalesce(c.courses, 0))
  into v_med_min, v_med_days, v_med_courses
  from weeks w left join week_courses c using (wk);

  -- La semaine en cours compte aussi (attribution au premier chargement).
  select coalesce((sum(sd.seconds) / 60)::integer, 0) into v_week_so_far
  from public.session_days sd
  where sd.user_id = p_user_id and sd.local_date between v_week and v_date;

  v_target_min := least(1200, greatest(
    240,
    (round(coalesce(v_med_min, 209) * 1.15 / 30.0) * 30)::integer,
    (round((v_week_so_far * 1.15) / 30.0) * 30)::integer
  ));
  v_target_days := least(6, greatest(2, coalesce(round(v_med_days), 2)::integer + 1));
  v_target_courses := least(least(4, v_course_count), greatest(2,
    coalesce(round(v_med_courses), 1)::integer + 1));

  v_slot := v_slot + 1;
  insert into public.weekly_mission_assignments(
    user_id, week_start, slot, mission_id, target, xp, timezone_snapshot)
  values (p_user_id, v_week, v_slot, 'w_hours', v_target_min,
          public.gamification_mission_xp('w_hours'), v_timezone)
  on conflict do nothing;

  v_slot := v_slot + 1;
  insert into public.weekly_mission_assignments(
    user_id, week_start, slot, mission_id, target, xp, timezone_snapshot)
  values (p_user_id, v_week, v_slot, 'w_days', v_target_days,
          public.gamification_mission_xp('w_days'), v_timezone)
  on conflict do nothing;

  if v_course_count >= 2 then
    v_slot := v_slot + 1;
    insert into public.weekly_mission_assignments(
      user_id, week_start, slot, mission_id, target, xp, timezone_snapshot)
    values (p_user_id, v_week, v_slot, 'w_courses', v_target_courses,
            public.gamification_mission_xp('w_courses'), v_timezone)
    on conflict do nothing;
  end if;
end;
$$;

create or replace function public.ensure_daily_missions_for_user(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_timezone text := coalesce(public.gamification_timezone(p_user_id), 'Europe/Paris');
  v_date date := (now() at time zone v_timezone)::date;
  v_rows integer := 0;
  v_has_challenge boolean := false;
  v_has_done boolean := false;
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
begin
  select count(*)::integer,
         bool_or(kind = 'challenge'),
         bool_or(completed_at is not null)
  into v_rows, v_has_challenge, v_has_done
  from public.daily_mission_assignments
  where user_id = p_user_id and mission_date = v_date;

  if v_rows > 0 then
    -- Journée de l'ancien système, encore vierge : on la refait.
    if coalesce(v_has_challenge, false) = false and coalesce(v_has_done, false) = false then
      delete from public.daily_mission_assignments
      where user_id = p_user_id and mission_date = v_date;
    else
      return;
    end if;
  end if;

  -- Volume récent : temps des 14 derniers jours + aujourd'hui (session_days).
  select coalesce(sum(sd.seconds), 0) into v_recent_seconds
  from public.session_days sd
  where sd.user_id = p_user_id and sd.local_date between v_date - 14 and v_date;

  -- Plus longue session récente : une propriété de session (famille C).
  select coalesce(max(duration_seconds), 0) into v_recent_max
  from public.sessions
  where user_id = p_user_id and started_at >= now() - interval '14 days';

  select count(*)::integer into v_course_count
  from public.courses where user_id = p_user_id and archived_at is null;

  select count(distinct sd.course_id)::integer into v_courses_7d
  from public.session_days sd
  where sd.user_id = p_user_id and sd.course_id is not null
    and sd.local_date between v_date - 7 and v_date - 1;

  select e.course_id, c.name, (e.exam_date - v_date)::integer
  into v_exam_course, v_exam_name, v_exam_days
  from public.exams e join public.courses c on c.id = e.course_id and c.archived_at is null
  where e.user_id = p_user_id and e.exam_date >= v_date
  order by e.exam_date asc limit 1;

  select sd.course_id, c.name into v_least_course, v_least_name
  from public.session_days sd join public.courses c on c.id = sd.course_id and c.archived_at is null
  where sd.user_id = p_user_id and sd.course_id is not null
    and sd.local_date between v_date - 7 and v_date - 1
  group by sd.course_id, c.name
  order by sum(sd.seconds) asc limit 1;

  select * into v_challenge
  from public.gamification_pick_challenge(p_user_id, v_date, v_timezone);

  if v_challenge.mission_id is not null then
    v_challenge_axis := public.gamification_mission_axis(v_challenge.mission_id);
  end if;

  v_volume_pool := case
    when v_recent_seconds < 7 * 3600 then array['m_25m', 'm_1h']
    when v_recent_seconds < 14 * 3600 then array['m_1h', 'm_2h']
    else array['m_2h', 'm_3h']
  end;

  v_focus_pool := case
    when v_recent_max < 3000 then array['m_two_sessions', 'm_two_focused']
    when v_recent_max < 5400 then array['m_s50', 'm_two_focused']
    else array['m_s90', 'm_s50']
  end;

  v_context_pool := array['m_noon']::text[];
  if v_course_count >= 2 then v_context_pool := v_context_pool || 'm_2courses'::text; end if;
  if v_course_count >= 3 then v_context_pool := v_context_pool || 'm_3courses'::text; end if;
  if v_least_course is not null and v_courses_7d >= 2
     and v_challenge.mission_id is distinct from 'c_neglected' then
    v_context_pool := v_context_pool || 'm_least_studied'::text;
  end if;
  if v_exam_course is not null and v_challenge.mission_id is distinct from 'c_exam_soon' then
    v_context_pool := v_context_pool || 'm_exam_next'::text;
    if v_exam_days between 0 and 7 then
      v_context_pool := v_context_pool || 'm_exam_week'::text;
    end if;
  end if;

  v_slot2 := v_focus_pool[public.gamification_hash_index(p_user_id::text || v_date || ':focus', array_length(v_focus_pool, 1))];
  v_slot3 := v_context_pool[public.gamification_hash_index(p_user_id::text || v_date || ':context', array_length(v_context_pool, 1))];

  if v_challenge_axis = 'volume' and array_length(v_context_pool, 1) >= 2 then
    select x into v_slot1 from unnest(v_context_pool) x where x <> v_slot3
    order by public.gamification_hash_index(p_user_id::text || v_date || ':context2' || x, 997)
    limit 1;
  end if;
  if v_slot1 is null then
    v_slot1 := v_volume_pool[public.gamification_hash_index(p_user_id::text || v_date || ':volume', array_length(v_volume_pool, 1))];
  end if;

  v_ids := array[v_slot1, v_slot2, v_slot3];
  foreach v_id in array v_ids loop
    v_slot := v_slot + 1;
    v_params := case
      when v_id = 'm_exam_next' then jsonb_build_object(
        'course_id', v_exam_course, 'course', v_exam_name, 'days', v_exam_days, 'target', 15)
      when v_id = 'm_least_studied' then jsonb_build_object(
        'course_id', v_least_course, 'course', v_least_name, 'target', 20)
      else '{}'::jsonb
    end;
    insert into public.daily_mission_assignments(
      user_id, mission_date, slot, mission_id, xp, timezone_snapshot, kind, params
    ) values (
      p_user_id, v_date, v_slot, v_id,
      public.gamification_mission_xp(v_id), v_timezone, 'daily', v_params
    )
    on conflict do nothing;
  end loop;

  if v_challenge.mission_id is not null then
    insert into public.daily_mission_assignments(
      user_id, mission_date, slot, mission_id, xp, timezone_snapshot, kind, params
    ) values (
      p_user_id, v_date, 4, v_challenge.mission_id,
      v_challenge.xp, v_timezone, 'challenge', v_challenge.params
    )
    on conflict do nothing;
  end if;
end;
$$;

-- p_timezone reste dans la signature (appelants existants) ; il ne sert plus
-- qu'à rien : les dates viennent de session_days.
create or replace function public.gamification_pick_challenge(p_user_id uuid, p_date date, p_timezone text)
returns table (mission_id text, xp integer, params jsonb)
language plpgsql
stable
security definer
set search_path = public, pg_catalog
as $$
declare
  v_streak integer := 0;
  v_yesterday_min integer := 0;
  v_avg_min integer := 0;
  v_active7 integer := 0;
  v_total_sessions integer := 0;
  v_days_since_last integer := null;
  v_exam_course uuid; v_exam_name text; v_exam_days integer;
  v_negl_course uuid; v_negl_name text; v_negl_days integer;
  v_yesterday_prev text;
  v_best_id text := null;
  v_best_score numeric := -1;
  v_best_params jsonb := '{}'::jsonb;
  v_score numeric;
  v_target integer;
begin
  -- Série OFFICIELLE (5A) au jour p_date — plus gamification_current_streak.
  select s.current_streak into v_streak from public.study_streaks(p_user_id, p_date) s;
  v_streak := coalesce(v_streak, 0);

  select count(*)::integer into v_total_sessions
  from public.sessions where user_id = p_user_id;

  select coalesce(sum(sd.seconds), 0) / 60
  into v_yesterday_min
  from public.session_days sd
  where sd.user_id = p_user_id and sd.local_date = p_date - 1;

  select count(*)::integer, coalesce(avg(day_min), 0)::integer
  into v_active7, v_avg_min
  from (
    select sum(sd.seconds) / 60 as day_min
    from public.session_days sd
    where sd.user_id = p_user_id and sd.local_date between p_date - 7 and p_date - 1
    group by sd.local_date
  ) d;

  select (p_date - max(sd.local_date))::integer
  into v_days_since_last
  from public.session_days sd
  where sd.user_id = p_user_id and sd.local_date <= p_date;

  select e.course_id, c.name, (e.exam_date - p_date)::integer
  into v_exam_course, v_exam_name, v_exam_days
  from public.exams e
  join public.courses c on c.id = e.course_id and c.archived_at is null
  where e.user_id = p_user_id and e.exam_date >= p_date
  order by e.exam_date asc
  limit 1;

  -- Fenêtre de négligence : 7 à 21 jours, et seulement pour quelqu'un qui
  -- étudie en ce moment (v_active7 > 0).
  if v_active7 > 0 then
    select sd.course_id, c.name, (p_date - max(sd.local_date))::integer
    into v_negl_course, v_negl_name, v_negl_days
    from public.session_days sd
    join public.courses c on c.id = sd.course_id and c.archived_at is null
    where sd.user_id = p_user_id and sd.course_id is not null and sd.local_date <= p_date
    group by sd.course_id, c.name
    having (p_date - max(sd.local_date))::integer between 7 and 21
    order by max(sd.local_date) asc
    limit 1;
  end if;

  select d.mission_id into v_yesterday_prev
  from public.daily_mission_assignments d
  where d.user_id = p_user_id and d.mission_date = p_date - 1 and d.kind = 'challenge';

  if v_exam_course is not null and v_exam_days between 0 and 7 then
    v_score := 100 - v_exam_days * 8;
    if v_yesterday_prev = 'c_exam_soon' and v_exam_days > 3 then v_score := v_score - 12; end if;
    v_target := case when v_avg_min >= 90 then 60 else 45 end;
    if v_score > v_best_score then
      v_best_score := v_score; v_best_id := 'c_exam_soon';
      v_best_params := jsonb_build_object(
        'course_id', v_exam_course, 'course', v_exam_name,
        'days', v_exam_days, 'target', v_target);
    end if;
  end if;

  if v_streak >= 2 then
    v_score := least(88, 45 + v_streak * 4);
    if v_yesterday_prev = 'c_protect_streak' then v_score := v_score - 12; end if;
    if v_score > v_best_score then
      v_best_score := v_score; v_best_id := 'c_protect_streak';
      v_best_params := jsonb_build_object('streak', v_streak, 'target', 20);
    end if;
  end if;

  if v_negl_course is not null then
    v_score := least(68, 40 + v_negl_days * 2);
    if v_yesterday_prev = 'c_neglected' then v_score := v_score - 12; end if;
    if v_score > v_best_score then
      v_best_score := v_score; v_best_id := 'c_neglected';
      v_best_params := jsonb_build_object(
        'course_id', v_negl_course, 'course', v_negl_name,
        'days', v_negl_days, 'target', 25);
    end if;
  end if;

  if v_total_sessions > 0 and coalesce(v_days_since_last, 0) >= 3 then
    v_score := least(75, 55 + least(v_days_since_last, 20));
    if v_yesterday_prev = 'c_comeback' then v_score := v_score - 12; end if;
    if v_score > v_best_score then
      v_best_score := v_score; v_best_id := 'c_comeback';
      v_best_params := jsonb_build_object('days', v_days_since_last, 'target', 25);
    end if;
  end if;

  if v_yesterday_min between 20 and 240 then
    v_score := 50;
    if v_yesterday_prev = 'c_beat_yesterday' then v_score := v_score - 12; end if;
    if v_score > v_best_score then
      v_best_score := v_score; v_best_id := 'c_beat_yesterday';
      v_best_params := jsonb_build_object('minutes', v_yesterday_min, 'target', v_yesterday_min + 1);
    end if;
  end if;

  if v_active7 >= 3 and v_avg_min between 20 and 240 then
    v_score := 48;
    if v_yesterday_prev = 'c_beat_average' then v_score := v_score - 12; end if;
    if v_score > v_best_score then
      v_best_score := v_score; v_best_id := 'c_beat_average';
      v_best_params := jsonb_build_object('minutes', v_avg_min, 'target', v_avg_min + 1);
    end if;
  end if;

  if v_total_sessions = 0 then
    v_score := 30;
    if v_score > v_best_score then
      v_best_score := v_score; v_best_id := 'c_first_session';
      v_best_params := jsonb_build_object('target', 25);
    end if;
  end if;

  if v_best_id is null then return; end if;

  mission_id := v_best_id;
  xp := public.gamification_mission_xp(v_best_id);
  params := v_best_params;
  return next;
end;
$$;

-- ── 6. Synchronisation tardive : recalcul de la date touchée ────────────────
-- À la validation (déclencheur différé, comme les jokers v75) : la date et la
-- semaine de chaque nouvelle portion sont réévaluées une fois, sur leur état
-- final. Insertion seulement : supprimer ou raccourcir une session ne retire
-- jamais une mission réussie.
create or replace function public.refresh_missions_after_day_part()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
begin
  if new.local_date >= public.mission_late_completion_from() then
    perform public.refresh_daily_missions_for_date(new.user_id, new.local_date);
    perform public.refresh_weekly_missions_for_week(new.user_id, public.gamification_week_start(new.local_date));
  end if;
  return null;
end;
$$;

revoke all on function public.refresh_missions_after_day_part() from public, anon, authenticated;

drop trigger if exists b20_refresh_missions_for_day on public.session_day_parts;
create constraint trigger b20_refresh_missions_for_day
  after insert on public.session_day_parts
  deferrable initially deferred
  for each row execute function public.refresh_missions_after_day_part();

comment on function public.gamification_current_streak(uuid) is
  'LEGACY (5B) — série historique (jour de début, joker +1, aucun seuil). Seul appelant restant : award_badges_for_user (badges de série, phase 5C). Missions et défi du jour lisent study_streaks depuis v76.';
