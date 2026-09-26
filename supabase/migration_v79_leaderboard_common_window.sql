-- v79 — Classement : une fenêtre commune par classement (Aujourd'hui, Cette
-- semaine, Ce mois-ci).
--
-- Avant : « jour » = depuis minuit UTC (2 h du matin à Bruxelles l'été),
-- « semaine » / « mois » = 7 / 30 jours glissants en dates UTC, et chaque
-- session comptée ENTIÈRE au jour de son début ; série recalculée à part
-- (jour de début, sans seuil ni blocus).
--
-- Maintenant, tous les membres d'un classement sont comparés sur la même
-- fenêtre, dans le fuseau du CLASSEMENT (jamais celui de l'appareil ni du
-- membre qui regarde) :
--   · Aujourd'hui   : 00:00 → maintenant
--   · Cette semaine : lundi 00:00 → maintenant
--   · Ce mois-ci    : le 1er 00:00 → maintenant
-- Fuseau : université choisie → celui de l'université (catalogue
-- university_communities) ; sinon (global, amis, université hors catalogue ou
-- sans fuseau) → Europe/Brussels, la règle historique de l'app.
-- Le temps d'une session est découpé aux minuits du classement avec l'algorithme
-- de session_days (compute_session_day_parts, part proportionnelle) : une
-- session commencée avant minuit ne compte que pour sa partie d'après minuit.
-- Série affichée : la série officielle (study_streaks, Phase 5A).

-- ── 1. Fuseau des universités hors du fuseau de Bruxelles ───────────────────
-- Les écoles belges, françaises, néerlandaises, espagnoles et suisses du
-- catalogue ont exactement les minuits de Bruxelles toute l'année : NULL =
-- Europe/Brussels. Seules les universités de Floride en diffèrent.
alter table public.university_communities add column if not exists timezone text;
alter table public.university_communities drop constraint if exists university_communities_timezone_valid;
alter table public.university_communities add constraint university_communities_timezone_valid
  check (timezone is null or public.is_valid_session_timezone(timezone));

update public.university_communities set timezone = 'America/New_York'
where full_name in ('Florida A&M University', 'Florida Atlantic University', 'Florida Gulf Coast University',
  'Florida International University', 'Florida Polytechnic University', 'Florida State University',
  'New College of Florida', 'University of Central Florida', 'University of Florida',
  'University of North Florida', 'University of South Florida');
-- Pensacola est à l'heure du Centre.
update public.university_communities set timezone = 'America/Chicago'
where full_name = 'University of West Florida';

create or replace function public.leaderboard_timezone(p_university text)
returns text
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  select coalesce(
    (select uc.timezone from public.university_communities uc where p_university is not null and uc.full_name = p_university),
    'Europe/Brussels'
  );
$$;

revoke all on function public.leaderboard_timezone(text) from public, anon, authenticated;

-- ── 2. Fenêtre d'une période dans un fuseau ─────────────────────────────────
create or replace function public.leaderboard_window(p_period text, p_timezone text)
returns table (start_date date, starts_at timestamptz, period_days integer)
language sql
stable
set search_path = public, pg_catalog
as $$
  with l as (select (now() at time zone p_timezone)::date as today),
  s as (
    select case
      when p_period = 'week' then l.today - (extract(isodow from l.today)::integer - 1)
      when p_period = 'month' then date_trunc('month', l.today)::date
      else l.today
    end as d
    from l
  )
  select s.d,
         s.d::timestamp at time zone p_timezone,
         case
           when p_period = 'week' then 7
           when p_period = 'month' then ((date_trunc('month', s.d) + interval '1 month')::date - s.d)
           else 1
         end
  from s;
$$;

revoke all on function public.leaderboard_window(text, text) from public, anon, authenticated;

-- ── 3. Classement ───────────────────────────────────────────────────────────
-- Même paramètres qu'avant (les appelants ne changent pas) ; deux colonnes en
-- plus pour dire QUELLE fenêtre est comparée : period_start et period_days.
drop function if exists public.get_leaderboard_v2(text, text, text, text, text, text);

create function public.get_leaderboard_v2(
  p_period      text default 'week',
  p_metric      text default 'time',
  p_scope       text default 'all',
  p_university  text default null,
  p_study_field text default null,
  p_study_year  text default null
)
returns table (
  user_id uuid,
  pseudo text,
  first_name text,
  last_name text,
  avatar_url text,
  total_seconds bigint,
  alltime_seconds bigint,
  streak_days integer,
  active_days integer,
  period_start timestamptz,
  period_days integer
)
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  with win as (
    select w.*, public.leaderboard_timezone(p_university) as tz
    from public.leaderboard_window(p_period, public.leaderboard_timezone(p_university)) w
  ),
  pool as (
    select p.id, p.pseudo, p.first_name, p.last_name, p.avatar_url
    from public.profiles p
    where (p_university is null or p.university = p_university)
      and (p_study_field is null or p.study_field = p_study_field)
      and (p_study_year is null or p.study_year = p_study_year)
      and not p.locked
      and (
        p_scope <> 'friends'
        or p.id = auth.uid()
        or exists (
          select 1 from public.friendships f
          where f.status = 'accepted'
            and ((f.requester = auth.uid() and f.addressee = p.id)
              or (f.addressee = auth.uid() and f.requester = p.id))
        )
      )
  ),
  -- Portions des sessions qui chevauchent la fenêtre, découpées aux minuits
  -- du fuseau du classement ; seules les dates de la fenêtre comptent.
  parts as (
    select s.user_id, dp.local_date, dp.seconds
    from win
    join public.sessions s
      on s.ended_at > win.starts_at
     and s.started_at >= win.starts_at - interval '2 days'
    join pool pl on pl.id = s.user_id
    cross join lateral public.compute_session_day_parts(s.started_at, s.ended_at, s.duration_seconds, win.tz) dp
    where dp.local_date >= win.start_date
  ),
  per_day as (
    select user_id, local_date, sum(seconds)::bigint as secs
    from parts group by user_id, local_date
  ),
  period_stats as (
    select user_id,
           sum(secs)::bigint as period_total,
           -- Régularité : jours du classement avec une journée d'étude valide
           -- (seuil de la date, comme le jour étudié canonique).
           count(*) filter (where secs >= public.study_day_min_seconds(local_date))::integer as days_active
    from per_day group by user_id
  ),
  alltime as (
    select s.user_id, sum(s.duration_seconds)::bigint as alltime_total
    from public.sessions s join pool pl on pl.id = s.user_id
    group by s.user_id
  ),
  -- Série officielle : calculée UNE fois par membre, et seulement quand on
  -- classe par série (CASE : la sous-requête n'est pas exécutée sinon ;
  -- MATERIALIZED : pas de recalcul à chaque jointure). Une jointure latérale
  -- sur study_streaks la réévaluait pour chaque paire de membres.
  scored as materialized (
    select p.id, p.pseudo, p.first_name, p.last_name, p.avatar_url,
           coalesce(ps.period_total, 0)::bigint as total_seconds,
           coalesce(ps.days_active, 0)::integer as active_days,
           case when p_metric = 'streak'
                then (select st.current_streak from public.study_streaks(p.id) st) end as streak_ranked
    from pool p
    left join period_stats ps on ps.user_id = p.id
  ),
  ranked as materialized (
    select sc.*
    from scored sc
    where p_scope = 'friends'
       or case when p_metric = 'streak' then coalesce(sc.streak_ranked, 0) > 0
               else sc.total_seconds > 0 end
    order by
      case p_metric
        when 'streak' then coalesce(sc.streak_ranked, 0)::bigint
        when 'regularity' then sc.active_days::bigint
        else sc.total_seconds
      end desc,
      sc.total_seconds desc,
      sc.pseudo asc,
      sc.id asc
    limit 50
  )
  select r.id, r.pseudo, r.first_name, r.last_name, r.avatar_url,
         r.total_seconds,
         coalesce(a.alltime_total, 0)::bigint,
         coalesce(r.streak_ranked, (select st.current_streak from public.study_streaks(r.id) st), 0)::integer,
         r.active_days,
         win.starts_at,
         win.period_days
  from ranked r
  cross join win
  left join alltime a on a.user_id = r.id
  order by
    case p_metric
      when 'streak' then coalesce(r.streak_ranked, 0)::bigint
      when 'regularity' then r.active_days::bigint
      else r.total_seconds
    end desc,
    r.total_seconds desc,
    r.pseudo asc,
    r.id asc;
$$;

revoke all on function public.get_leaderboard_v2(text, text, text, text, text, text) from public, anon;
grant execute on function public.get_leaderboard_v2(text, text, text, text, text, text) to authenticated, service_role;

-- ── 4. Mon rang (page Stats) : classement global, même fenêtre ──────────────
create or replace function public.get_my_study_rank(p_period text default 'day')
returns table (my_secs bigint, better_count bigint, total_active bigint)
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  with win as (
    select w.*, 'Europe/Brussels'::text as tz from public.leaderboard_window(p_period, 'Europe/Brussels') w
  ),
  period_totals as (
    select s.user_id, sum(dp.seconds)::bigint as secs
    from win
    join public.sessions s
      on s.ended_at > win.starts_at
     and s.started_at >= win.starts_at - interval '2 days'
    cross join lateral public.compute_session_day_parts(s.started_at, s.ended_at, s.duration_seconds, win.tz) dp
    where dp.local_date >= win.start_date
    group by s.user_id
    having sum(dp.seconds) > 0
  ),
  my_val as (
    select coalesce((select secs from period_totals where user_id = auth.uid()), 0)::bigint as secs
  )
  select (select secs from my_val),
         count(case when t.secs > (select secs from my_val) then 1 end)::bigint,
         count(*)::bigint
  from period_totals t;
$$;
