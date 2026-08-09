-- ================================================================
-- migration_v40_blocus_periods.sql
--
-- Le blocus devient une SAISON bornée, au lieu d'une progression sans fin.
--
-- Pourquoi : les données de production disent que l'app est saisonnière —
-- 97 des 107 étudiants actifs en mai, 9 sessions en juillet, 153 examens en
-- juin et 40 en août. Une série perpétuelle punit donc exactement le
-- comportement correct : travailler dur pendant le blocus, puis s'arrêter.
--
-- Une période de blocus = une campagne : début, fin (typiquement le dernier
-- examen), objectif d'heures. La série se met en PAUSE en dehors : un jour
-- situé hors de toute période ne casse plus la série, mais ne la prolonge pas
-- non plus. Strictement opt-in — un utilisateur sans période déclarée garde
-- exactement le comportement d'avant.
--
-- À exécuter manuellement dans le SQL Editor Supabase. Idempotent.
-- ================================================================

-- ── 1) Table des périodes ───────────────────────────────────────────────────
create table if not exists public.blocus_periods (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  start_date  date not null,
  end_date    date not null,
  goal_hours  integer,
  archived_at timestamptz,
  created_at  timestamptz not null default now(),
  constraint blocus_periods_range check (end_date >= start_date),
  constraint blocus_periods_goal check (goal_hours is null or (goal_hours > 0 and goal_hours <= 2000))
);

create index if not exists idx_blocus_periods_user
  on public.blocus_periods(user_id, start_date desc);

alter table public.blocus_periods enable row level security;

-- Privé : contrairement aux jours gelés, une période de blocus révèle le
-- calendrier d'examens de quelqu'un. Aucune lecture par des tiers.
drop policy if exists blocus_periods_select on public.blocus_periods;
create policy blocus_periods_select on public.blocus_periods
  for select using (auth.uid() = user_id);

drop policy if exists blocus_periods_insert on public.blocus_periods;
create policy blocus_periods_insert on public.blocus_periods
  for insert with check (auth.uid() = user_id);

drop policy if exists blocus_periods_update on public.blocus_periods;
create policy blocus_periods_update on public.blocus_periods
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists blocus_periods_delete on public.blocus_periods;
create policy blocus_periods_delete on public.blocus_periods
  for delete using (auth.uid() = user_id);

revoke all on public.blocus_periods from anon;
grant select, insert, update, delete on public.blocus_periods to authenticated;

-- ── 2) Série en pause hors blocus ───────────────────────────────────────────
-- Remontée : un jour SANS session est neutre s'il tombe hors de toute période
-- déclarée — on continue de remonter le temps sans casser la série. La règle ne
-- s'applique QUE si l'utilisateur a au moins une période : sinon la boucle
-- deviendrait infinie de fait (tout jour serait neutre) et la série ne
-- casserait jamais pour personne.
--
-- Depuis v39 cette fonction ne nourrit plus le XP (qui utilise la MEILLEURE
-- série) : elle sert aux badges de série et à l'affichage.
create or replace function public.gamification_current_streak(p_user_id uuid)
returns integer
language plpgsql
stable
security definer
set search_path = public, pg_catalog
as $$
declare
  v_timezone text := coalesce(public.gamification_timezone(p_user_id), 'Europe/Paris');
  v_today date := (now() at time zone v_timezone)::date;
  v_cursor date;
  v_streak integer := 0;
  v_scanned integer := 0;
  v_has_blocus boolean;
begin
  select exists (select 1 from public.blocus_periods bp where bp.user_id = p_user_id)
  into v_has_blocus;

  -- Ancrage : le jour gelé compte comme actif ici aussi (règle posée en v29).
  if exists (
    select 1 from public.sessions s
    where s.user_id = p_user_id
      and (s.started_at at time zone v_timezone)::date = v_today
  ) or exists (
    select 1 from public.streak_freeze_days f
    where f.user_id = p_user_id and f.used_on = v_today
  ) then
    v_cursor := v_today;
  else
    v_cursor := v_today - 1;
  end if;

  -- v_scanned borne la remontée : sans lui, une longue traversée de jours
  -- neutres pourrait parcourir des années.
  while v_streak < 366 and v_scanned < 1096 loop
    v_scanned := v_scanned + 1;

    if exists (
      select 1 from public.sessions s
      where s.user_id = p_user_id
        and (s.started_at at time zone v_timezone)::date = v_cursor
    ) or exists (
      select 1 from public.streak_freeze_days f
      where f.user_id = p_user_id and f.used_on = v_cursor
    ) then
      v_streak := v_streak + 1;
      v_cursor := v_cursor - 1;
      continue;
    end if;

    if v_has_blocus and not exists (
      select 1 from public.blocus_periods bp
      where bp.user_id = p_user_id
        and v_cursor between bp.start_date and bp.end_date
    ) then
      v_cursor := v_cursor - 1;  -- jour neutre : hors blocus
      continue;
    end if;

    exit;
  end loop;

  return v_streak;
end;
$$;

revoke all on function public.gamification_current_streak(uuid) from public, anon, authenticated;
