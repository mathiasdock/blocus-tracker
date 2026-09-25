-- v71 — Modèle canonique des jours d'étude (Phase 5A1).
--
-- RIEN NE LE LIT ENCORE : série officielle, meilleure série, XP, jokers,
-- missions, badges, notifications et classement gardent leurs calculs actuels.
-- Cette migration pose la définition et permet de la comparer à l'existant.
--
-- Deux notions désormais séparées :
--   · jour ÉTUDIÉ         : le temps de ce jour (session_days) atteint le seuil
--                           applicable à CETTE date ;
--   · jour qui PRÉSERVE   : étudié, ou neutre (joker, jour hors blocus). Un jour
--     la série             neutre ne casse pas la série, mais ne l'allonge pas et
--                           ne compte pas comme jour étudié.
--
-- États d'une date : 'studied' | 'neutral' | 'missed' | 'pending'.
--   'pending' = aujourd'hui (ou plus tard) pas encore étudié : la journée n'est
--   pas finie, elle ne casse rien — c'est ce que fait déjà la série actuelle
--   en repartant d'hier quand aujourd'hui est vide.
--
-- Source du temps : public.session_days uniquement. Le fuseau du profil ne
-- sert qu'à savoir quelle date est « aujourd'hui » quand aucun appareil n'est
-- là (p_today absent) ; il ne réattribue jamais une session passée.

-- ── 1. Règles centralisées ──────────────────────────────────────────────────
-- Une seule ligne. `min_seconds_from` est la date de bascule, une date
-- CALENDAIRE locale : un jour dont la local_date est >= cette date exige
-- `min_seconds`, les jours antérieurs gardent `legacy_min_seconds` (1 s, la
-- règle historique). NULL = bascule pas encore programmée : tout reste à 1 s.
create table if not exists public.study_day_rules (
  id boolean primary key default true check (id),
  legacy_min_seconds integer not null default 1 check (legacy_min_seconds between 1 and 86400),
  min_seconds integer not null default 300 check (min_seconds between 1 and 86400),
  min_seconds_from date,
  updated_at timestamptz not null default now()
);

insert into public.study_day_rules (id) values (true) on conflict (id) do nothing;

alter table public.study_day_rules enable row level security;
drop policy if exists study_day_rules_read on public.study_day_rules;
create policy study_day_rules_read on public.study_day_rules
  for select to authenticated using (true);
revoke all on public.study_day_rules from public, anon, authenticated;
grant select on public.study_day_rules to authenticated;

comment on table public.study_day_rules is
  'Règle du jour étudié (v71). min_seconds_from = date locale de bascule vers min_seconds ; avant : legacy_min_seconds. Modifiée par migration uniquement.';

-- ── 2. Seuil applicable à une date ──────────────────────────────────────────
create or replace function public.study_day_min_seconds(p_date date)
returns integer
language sql
stable
set search_path = public, pg_catalog
as $$
  select case
    when r.min_seconds_from is not null and p_date >= r.min_seconds_from then r.min_seconds
    else r.legacy_min_seconds
  end
  from public.study_day_rules r
  where r.id;
$$;

revoke all on function public.study_day_min_seconds(date) from public, anon;
grant execute on function public.study_day_min_seconds(date) to authenticated;

-- ── 3. État de chaque date d'une plage ──────────────────────────────────────
-- SECURITY DEFINER pour que les futures fonctions serveur (séries d'amis,
-- niveaux) puissent l'appeler pour un autre compte ; donc AUCUN rôle client ne
-- peut l'exécuter directement.
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

-- ── 4. Séries calculées sur ce modèle (ombre : rien ne les affiche) ─────────
-- Série actuelle : jours étudiés depuis le dernier jour 'missed' (les jours
-- neutres et 'pending' ne comptent pas et ne cassent pas), plafonnée à 366
-- comme l'actuelle. Meilleure série : plus longue suite de jours étudiés que
-- seul un jour 'missed' interrompt — hors blocus compris, comme la série.
create or replace function public.study_streaks(p_user_id uuid, p_today date default null)
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
    select s.*
    from bounds b
    cross join lateral public.study_day_states(p_user_id, b.first_day, greatest(b.first_day, b.today), b.today) s
    where b.first_day is not null
  ),
  judged as (
    select local_date, state,
      count(*) filter (where state = 'missed') over (order by local_date) as breaks
    from st
    where state in ('studied', 'missed')
  )
  select
    least(366, coalesce((
      select count(*) from st
      where st.state = 'studied'
        and st.local_date > coalesce((select max(local_date) from st where state = 'missed'), date '0001-01-01')
    ), 0))::integer,
    coalesce((select max(n) from (select count(*) filter (where state = 'studied') as n from judged group by breaks) r), 0)::integer,
    coalesce((select count(*) from st where state = 'studied'), 0)::integer;
$$;

revoke all on function public.study_streaks(uuid, date) from public, anon, authenticated;
