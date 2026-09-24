-- ════════════════════════════════════════════════════════════════════════════
-- v65 — Portions quotidiennes des sessions (nouvelles sessions uniquement)
-- ════════════════════════════════════════════════════════════════════════════
--
-- Décision produit (2026-09-24) : une session qui traverse minuit est RÉPARTIE
-- entre les jours locaux concernés, dans le fuseau où elle a été faite.
-- 23:30 → 00:30 à Bruxelles = 30 min le jour 1, 30 min le jour 2.
--
--   sessions.timezone           fuseau IANA de l'appareil au DÉMARRAGE du chrono
--                               (envoyé par l'app, file hors ligne comprise) ;
--                               à défaut, le fuseau du profil.
--   sessions.timezone_source    'device' | 'profile' | 'inferred' (rattrapage
--                               de l'historique, phase ultérieure).
--   sessions.day_parts_version  version de la règle de répartition ci-dessous.
--   session_day_parts           une ligne par (session, jour local), tenue par
--                               la base SEULE : aucune écriture client.
--
-- Les sessions existantes ne sont PAS touchées : leurs trois colonnes restent
-- nulles et elles n'ont aucune portion. Le rattrapage viendra dans une phase à
-- part, sur décision.
--
-- Règle de répartition (version 1) — miroir exact de lib/sessionDayParts.mjs :
--   1. découper [started_at, ended_at] aux minuits LOCAUX du fuseau de la
--      session (les fuseaux IANA gèrent les jours de 23 h / 25 h et les minuits
--      qui n'existent pas) ;
--   2. chaque jour reçoit duration_seconds × (part de l'intervalle ce jour-là),
--      arrondi à la seconde inférieure ; le dernier jour reçoit le reste, pour
--      que la somme fasse exactement duration_seconds ;
--   3. les portions nulles sont omises ; un intervalle nul donne tout au jour
--      local de started_at.
-- Le chrono solo enregistre started_at = ended_at − durée (pauses tassées) :
-- une pause qui chevauche minuit est donc approximée. Accepté pour cette phase.
--
-- ORDRE DES DÉCLENCHEURS SUR public.sessions (PostgreSQL les exécute par
-- moment — BEFORE puis AFTER — et, à moment égal, par ordre ALPHABÉTIQUE) :
--   BEFORE  a00_block_suspended_actor          (v57) refuse un compte suspendu
--   BEFORE  a01_set_session_timezone           (v65) fixe fuseau / source / version
--   BEFORE  prevent_session_duration_increase
--   BEFORE  validate_new_study_session
--   AFTER   a10_sync_session_day_parts         (v65) écrit les portions
--   AFTER   refresh_gamification_sessions      badges + missions
--   AFTER   session_activity_after_insert      publication automatique
-- a10_sync_session_day_parts DOIT passer avant refresh_gamification_sessions :
-- dès que séries, badges et missions liront session_day_parts, les passer après
-- leur ferait lire des portions périmées. Vérifié à la fin de ce fichier, par
-- supabase/tests/session_day_parts.sql et par tests/session-day-parts.test.mjs.
-- Ne pas renommer ces déclencheurs sans relire cet ordre.
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1. Colonnes de sessions (nulles pour tout l'historique) ──────────────────
alter table public.sessions
  add column if not exists timezone text,
  add column if not exists timezone_source text,
  add column if not exists day_parts_version smallint;

alter table public.sessions
  drop constraint if exists sessions_timezone_source_check,
  add constraint sessions_timezone_source_check
    check (timezone_source is null or timezone_source in ('device', 'profile', 'inferred')),
  drop constraint if exists sessions_timezone_pair_check,
  add constraint sessions_timezone_pair_check
    check ((timezone is null) = (timezone_source is null)),
  drop constraint if exists sessions_day_parts_version_check,
  add constraint sessions_day_parts_version_check
    check (day_parts_version is null or (day_parts_version >= 1 and timezone is not null));

-- ── 2. Table dérivée ─────────────────────────────────────────────────────────
create table if not exists public.session_day_parts (
  session_id uuid not null references public.sessions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  local_date date not null,
  seconds integer not null check (seconds > 0 and seconds <= 43200),
  primary key (session_id, local_date)
);

create index if not exists session_day_parts_user_date_idx
  on public.session_day_parts (user_id, local_date);

comment on table public.session_day_parts is
  'Portions quotidiennes des sessions (v65). Tenue par a10_sync_session_day_parts : aucune écriture client.';

-- Lecture : exactement les règles de public.sessions. Écriture : personne,
-- hors la fonction du déclencheur (SECURITY DEFINER). Les privilèges par défaut
-- du schéma donnent tout à anon/authenticated : on les retire explicitement.
alter table public.session_day_parts enable row level security;
revoke all on public.session_day_parts from anon, authenticated;
grant select on public.session_day_parts to authenticated;

drop policy if exists session_day_parts_read on public.session_day_parts;
create policy session_day_parts_read on public.session_day_parts
  for select to authenticated
  using (public.is_friend_or_self(user_id));

drop policy if exists session_day_parts_read_admin on public.session_day_parts;
create policy session_day_parts_read_admin on public.session_day_parts
  for select to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin = true));

-- Convention v57 : toute table publique porte le blocage des comptes suspendus.
drop trigger if exists a00_block_suspended_actor on public.session_day_parts;
create trigger a00_block_suspended_actor
  before insert or update or delete on public.session_day_parts
  for each row execute function public.block_suspended_actor();

-- ── 3. Fuseau valide ─────────────────────────────────────────────────────────
-- Un nom IANA de région (« Europe/Brussels », « America/New_York ») ou « UTC ».
-- Les abréviations (« EST ») et les chaînes POSIX (« EST5EDT », « +02 ») sont
-- refusées : elles ne portent pas les règles d'heure d'été du lieu.
create or replace function public.is_valid_session_timezone(p_timezone text)
returns boolean
language plpgsql
stable
set search_path = pg_catalog
as $$
begin
  if p_timezone is null
     or length(p_timezone) > 64
     or not (p_timezone = 'UTC' or p_timezone ~ '^[A-Za-z]+(/[A-Za-z0-9_+-]+)+$') then
    return false;
  end if;
  perform now() at time zone p_timezone;
  return true;
exception when others then
  return false;
end;
$$;

-- ── 4. Règle de répartition (version 1) ──────────────────────────────────────
create or replace function public.compute_session_day_parts(
  p_started_at timestamptz,
  p_ended_at timestamptz,
  p_duration_seconds integer,
  p_timezone text
)
returns table (local_date date, seconds integer)
language plpgsql
stable
set search_path = pg_catalog
as $$
declare
  v_day date;
  v_last_day date;
  v_part_start timestamptz;
  v_part_end timestamptz;
  v_days date[] := array[]::date[];
  v_walls numeric[] := array[]::numeric[];
  v_total numeric := 0;
  v_wall numeric;
  v_given integer := 0;
  v_share integer;
  i integer;
begin
  if p_started_at is null or p_ended_at is null or p_timezone is null
     or coalesce(p_duration_seconds, 0) <= 0 then
    return;
  end if;

  v_day := (p_started_at at time zone p_timezone)::date;
  v_last_day := (greatest(p_started_at, p_ended_at) at time zone p_timezone)::date;

  while v_day <= v_last_day loop
    v_part_start := greatest(p_started_at, v_day::timestamp at time zone p_timezone);
    v_part_end := least(p_ended_at, (v_day + 1)::timestamp at time zone p_timezone);
    v_wall := extract(epoch from (v_part_end - v_part_start));
    if v_wall > 0 then
      v_days := v_days || v_day;
      v_walls := v_walls || v_wall;
      v_total := v_total + v_wall;
    end if;
    v_day := v_day + 1;
  end loop;

  -- Intervalle nul (ou inversé) : tout au jour local du début.
  if coalesce(array_length(v_days, 1), 0) = 0 then
    local_date := (p_started_at at time zone p_timezone)::date;
    seconds := p_duration_seconds;
    return next;
    return;
  end if;

  for i in 1 .. array_length(v_days, 1) loop
    if i < array_length(v_days, 1) then
      v_share := floor(p_duration_seconds::numeric * v_walls[i] / v_total)::integer;
    else
      v_share := p_duration_seconds - v_given;
    end if;
    v_given := v_given + v_share;
    if v_share > 0 then
      local_date := v_days[i];
      seconds := v_share;
      return next;
    end if;
  end loop;
end;
$$;

-- ── 5. BEFORE : fuseau, source et version ────────────────────────────────────
-- Fuseau du profil pour une session envoyée sans fuseau (ancienne version de
-- l'app, ancienne file hors ligne). gamification_timezone n'est pas exécutable
-- par l'app : ce relais l'est, mais ne répond qu'au sujet de l'appelant (le
-- déclencheur l'appelle avec new.user_id, que la RLS de sessions force à
-- auth.uid()). Les traitements de la base appellent gamification_timezone
-- directement.
create or replace function public.session_default_timezone(p_user_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = public, pg_catalog
as $$
begin
  if auth.uid() is null or p_user_id is distinct from auth.uid() then
    return 'Europe/Paris';
  end if;
  return coalesce(public.gamification_timezone(p_user_id), 'Europe/Paris');
end;
$$;

revoke all on function public.session_default_timezone(uuid) from public, anon;
grant execute on function public.session_default_timezone(uuid) to authenticated;

-- SECURITY INVOKER à dessein : current_user distingue l'app (authenticated) des
-- traitements de la base (postgres / service_role), seuls autorisés à poser un
-- fuseau sur une session existante (rattrapage de l'historique).
create or replace function public.set_session_timezone()
returns trigger
language plpgsql
set search_path = public, pg_catalog
as $$
begin
  if tg_op = 'INSERT' then
    if public.is_valid_session_timezone(new.timezone) then
      new.timezone_source := 'device';
    else
      -- Deux instructions distinctes, pas un CASE : PostgreSQL vérifie le droit
      -- d'exécuter CHAQUE fonction d'une expression avant de l'évaluer.
      if current_user in ('anon', 'authenticated') then
        new.timezone := public.session_default_timezone(new.user_id);
      else
        new.timezone := coalesce(public.gamification_timezone(new.user_id), 'Europe/Paris');
      end if;
      new.timezone_source := 'profile';
    end if;
    new.day_parts_version := 1;
    return new;
  end if;

  -- UPDATE depuis l'app : le fuseau d'une session est figé à sa création. Une
  -- correction de durée ne doit jamais la replacer dans le fuseau du moment.
  if current_user in ('anon', 'authenticated') then
    new.timezone := old.timezone;
    new.timezone_source := old.timezone_source;
    new.day_parts_version := old.day_parts_version;
    return new;
  end if;

  -- UPDATE par la base (rattrapage) : fuseau valide et source explicite.
  if new.timezone is distinct from old.timezone and new.timezone is not null then
    if not public.is_valid_session_timezone(new.timezone) then
      raise exception 'Invalid session timezone: %', new.timezone using errcode = '22023';
    end if;
    new.timezone_source := coalesce(new.timezone_source, 'inferred');
    new.day_parts_version := coalesce(new.day_parts_version, 1);
  end if;
  return new;
end;
$$;

drop trigger if exists a01_set_session_timezone on public.sessions;
create trigger a01_set_session_timezone
  before insert or update on public.sessions
  for each row execute function public.set_session_timezone();

-- ── 6. AFTER : portions ──────────────────────────────────────────────────────
create or replace function public.sync_session_day_parts()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
begin
  if tg_op = 'UPDATE' then
    delete from public.session_day_parts where session_id = old.id;
  end if;

  -- Sessions historiques sans fuseau : aucune portion tant qu'elles ne sont pas
  -- rattrapées.
  if new.timezone is null or new.day_parts_version is null then
    return null;
  end if;

  insert into public.session_day_parts (session_id, user_id, local_date, seconds)
  select new.id, new.user_id, p.local_date, p.seconds
  from public.compute_session_day_parts(
    new.started_at, new.ended_at, new.duration_seconds, new.timezone
  ) p;

  return null;
end;
$$;

revoke all on function public.sync_session_day_parts() from public, anon, authenticated;

drop trigger if exists a10_sync_session_day_parts on public.sessions;
create trigger a10_sync_session_day_parts
  after insert or update of started_at, ended_at, duration_seconds, timezone, day_parts_version, user_id
  on public.sessions
  for each row execute function public.sync_session_day_parts();

-- ── 7. Garde-fou : l'ordre des déclencheurs ──────────────────────────────────
do $order$
declare
  v_after text[];
begin
  select array_agg(t.tgname::text order by t.tgname::text)
  into v_after
  from pg_trigger t
  where t.tgrelid = 'public.sessions'::regclass
    and not t.tgisinternal
    and (t.tgtype & 2) = 0;  -- AFTER

  if array_position(v_after, 'a10_sync_session_day_parts') is null
     or array_position(v_after, 'refresh_gamification_sessions') is null
     or array_position(v_after, 'a10_sync_session_day_parts')
        > array_position(v_after, 'refresh_gamification_sessions') then
    raise exception 'v65: a10_sync_session_day_parts must run before refresh_gamification_sessions (AFTER order: %)', v_after;
  end if;
end
$order$;
