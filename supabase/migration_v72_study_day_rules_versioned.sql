-- v72 — Règles du jour d'étude versionnées par une date de bascule (Phase 5A1 bis).
--
-- TOUJOURS RIEN NE LIT CE MODÈLE : série officielle, meilleure série, XP,
-- jokers, missions, badges, notifications et classement sont inchangés.
--
-- Une seule date, le 5 octobre 2026, versionne DEUX règles :
--
--                         avant le 2026-10-05          à partir du 2026-10-05
--   jour étudié           > 0 seconde (>= 1 s)         >= 300 secondes
--   jour avec joker       préserve la série ET +1      préserve la série, +0
--
-- Les séries obtenues sous l'ancienne règle ne sont donc jamais recalculées à
-- la baisse : un joker historique garde son +1, comme BLOCUS TRACKER l'a
-- toujours compté.
--
-- Trois notions explicites par date, au lieu de déduire la longueur de l'état :
--   is_studied        le seuil de CETTE date est atteint (un joker ne l'est jamais) ;
--   preserves_streak  la date ne casse pas la série (étudiée, joker, hors blocus) ;
--   increments_streak la date ajoute 1 à la longueur (étudiée, ou joker AVANT
--                     la bascule). Un jour hors blocus n'ajoute rien, avant
--                     comme après — c'est déjà la règle de la série actuelle.
-- L'état reste 'studied' | 'neutral' | 'missed' | 'pending'.

-- La colonne porte désormais les deux règles : on la nomme pour ce qu'elle est.
alter table public.study_day_rules rename column min_seconds_from to new_rules_from;

-- Date calendaire locale, choisie par le produit (future au moment de la
-- migration : aucun jour passé ne change de règle).
update public.study_day_rules
set new_rules_from = date '2026-10-05', updated_at = now()
where id;

comment on table public.study_day_rules is
  'Règles du jour d''étude (v71, versionnées en v72). Avant new_rules_from : jour étudié dès legacy_min_seconds, joker = +1. À partir de new_rules_from : min_seconds, joker = +0 (préserve seulement). Modifiée par migration uniquement.';

create or replace function public.study_day_min_seconds(p_date date)
returns integer
language sql
stable
set search_path = public, pg_catalog
as $$
  select case
    when r.new_rules_from is not null and p_date >= r.new_rules_from then r.min_seconds
    else r.legacy_min_seconds
  end
  from public.study_day_rules r
  where r.id;
$$;

-- Vrai si un joker posé ce jour-là ajoute encore 1 à la longueur (ancienne règle).
create or replace function public.study_day_freeze_increments(p_date date)
returns boolean
language sql
stable
set search_path = public, pg_catalog
as $$
  select r.new_rules_from is null or p_date < r.new_rules_from
  from public.study_day_rules r
  where r.id;
$$;

revoke all on function public.study_day_freeze_increments(date) from public, anon;
grant execute on function public.study_day_freeze_increments(date) to authenticated;

-- Le type de retour change (colonne increments_streak) : on recrée.
drop function if exists public.study_streaks(uuid, date);
drop function if exists public.study_day_states(uuid, date, date, date);

create function public.study_day_states(
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
  with params as (
    select coalesce(
      p_today,
      (now() at time zone coalesce(public.gamification_timezone(p_user_id), 'Europe/Paris'))::date
    ) as today,
    exists (select 1 from public.blocus_periods b where b.user_id = p_user_id) as has_blocus
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
  facts as (
    select c.d,
      coalesce(s.secs, 0) as secs,
      public.study_day_min_seconds(c.d) as min_secs,
      public.study_day_freeze_increments(c.d) as freeze_counts,
      exists (select 1 from public.streak_freeze_days f where f.user_id = p_user_id and f.used_on = c.d) as frozen,
      (p.has_blocus and not exists (
        select 1 from public.blocus_periods b
        where b.user_id = p_user_id and c.d between b.start_date and b.end_date
      )) as off_blocus,
      p.today
    from cal c
    cross join params p
    left join studied s on s.d = c.d
  )
  select f.d, f.secs, f.min_secs,
    f.secs >= f.min_secs,
    f.frozen,
    f.off_blocus,
    f.secs >= f.min_secs or f.frozen or f.off_blocus,
    f.secs >= f.min_secs or (f.frozen and f.freeze_counts),
    case
      when f.secs >= f.min_secs then 'studied'
      when f.frozen or f.off_blocus then 'neutral'
      when f.d >= f.today then 'pending'
      else 'missed'
    end
  from facts f
  order by f.d;
$$;

revoke all on function public.study_day_states(uuid, date, date, date) from public, anon, authenticated;

-- Longueur = somme de increments_streak ; seul un jour 'missed' coupe la suite.
-- studied_days ne compte que les jours réellement étudiés (jamais un joker).
create function public.study_streaks(p_user_id uuid, p_today date default null)
returns table (current_streak integer, best_streak integer, studied_days integer)
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  with params as (
    select coalesce(
      p_today,
      (now() at time zone coalesce(public.gamification_timezone(p_user_id), 'Europe/Paris'))::date
    ) as today
  ),
  bounds as (
    select least(
      (select min(sd.local_date) from public.session_days sd where sd.user_id = p_user_id),
      (select min(f.used_on) from public.streak_freeze_days f where f.user_id = p_user_id)
    ) as first_day, p.today
    from params p
  ),
  st as (
    select s.*,
      count(*) filter (where s.state = 'missed') over (order by s.local_date) as breaks
    from bounds b
    cross join lateral public.study_day_states(p_user_id, b.first_day, greatest(b.first_day, b.today), b.today) s
    where b.first_day is not null
  )
  select
    least(366, coalesce((
      select count(*) from st
      where st.increments_streak
        and st.breaks = (select max(breaks) from st)
    ), 0))::integer,
    coalesce((select max(n) from (select count(*) filter (where increments_streak) as n from st group by breaks) r), 0)::integer,
    coalesce((select count(*) from st where is_studied), 0)::integer;
$$;

revoke all on function public.study_streaks(uuid, date) from public, anon, authenticated;
