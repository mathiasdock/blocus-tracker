-- v52 — Diagnostic des échecs d'activation des notifications.
--
-- POURQUOI. L'activation échoue sur des iPhone qu'on n'a pas sous la main, et
-- trois causes restent indiscernables à distance : ancienne version de l'app
-- encore en cache, module OneSignal bloqué sur l'appareil (réseau, VPN,
-- protection anti-pistage d'iOS), ou module qui refuse de démarrer. Sur 19
-- comptes que l'app essaie de notifier, 13 n'ont jamais été inscrits chez
-- OneSignal. Chaque échec écrit désormais une ligne qui dit lequel.
--
-- MINIMISATION. Aucune adresse IP, aucun email, aucun user-agent brut : un motif,
-- la version de l'app, des indicateurs techniques et des durées. Écrit par la
-- personne elle-même, pour elle-même (RLS), lisible par un admin uniquement.
-- Conservation : 30 jours, purgés à chaque écriture (pas de pg_cron ici).
-- Plafond : 20 lignes par compte par heure, et 8 Ko par ligne.

create table if not exists public.push_diagnostics (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  reason text not null check (char_length(reason) between 1 and 40),
  detail jsonb not null default '{}'::jsonb check (pg_column_size(detail) <= 8192)
);

create index if not exists push_diagnostics_created_idx on public.push_diagnostics (created_at desc);
create index if not exists push_diagnostics_user_idx on public.push_diagnostics (user_id, created_at desc);

alter table public.push_diagnostics enable row level security;

drop policy if exists push_diagnostics_insert_own on public.push_diagnostics;
create policy push_diagnostics_insert_own on public.push_diagnostics
  for insert to authenticated
  with check (auth.uid() = user_id);

drop policy if exists push_diagnostics_select_admin on public.push_diagnostics;
create policy push_diagnostics_select_admin on public.push_diagnostics
  for select to authenticated
  using (public.is_current_user_admin());

drop policy if exists push_diagnostics_delete_admin on public.push_diagnostics;
create policy push_diagnostics_delete_admin on public.push_diagnostics
  for delete to authenticated
  using (public.is_current_user_admin());

-- Plafond par compte : un appareil qui échoue en boucle ne doit pas remplir la
-- table, et personne ne doit pouvoir s'en servir comme d'un stockage.
create or replace function public.push_diagnostics_guard()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if (select count(*) from public.push_diagnostics
      where user_id = new.user_id and created_at > now() - interval '1 hour') >= 20 then
    raise exception 'push_diagnostics: limite horaire atteinte' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

-- Purge des lignes de plus de 30 jours, une fois par instruction d'insertion.
create or replace function public.push_diagnostics_purge()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  delete from public.push_diagnostics where created_at < now() - interval '30 days';
  return null;
end;
$$;

drop trigger if exists push_diagnostics_guard on public.push_diagnostics;
create trigger push_diagnostics_guard
  before insert on public.push_diagnostics
  for each row execute function public.push_diagnostics_guard();

drop trigger if exists push_diagnostics_purge on public.push_diagnostics;
create trigger push_diagnostics_purge
  after insert on public.push_diagnostics
  for each statement execute function public.push_diagnostics_purge();

revoke all on function public.push_diagnostics_guard() from public, anon, authenticated;
revoke all on function public.push_diagnostics_purge() from public, anon, authenticated;
