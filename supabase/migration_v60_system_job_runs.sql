-- v60 — Passages des tâches automatiques (refonte de l'admin, phase 1).
--
-- Les deux tâches planifiées (rappel quotidien de 18 h, purge des
-- publications) inscrivent chaque passage : début, fin, résultat, compteurs.
-- La page Système de l'admin pourra dire si elles ont tourné, et sinon depuis
-- quand. Seul le serveur écrit (service role) ; seuls les admins lisent.
-- Conservation : 90 jours, purgés par la tâche de purge elle-même.

create table if not exists public.system_job_runs (
  id bigint generated always as identity primary key,
  job text not null check (char_length(job) between 3 and 64),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null default 'running'
    check (status in ('running', 'ok', 'error', 'skipped')),
  details jsonb not null default '{}'::jsonb
);

create index if not exists system_job_runs_job_idx
  on public.system_job_runs (job, started_at desc);

alter table public.system_job_runs enable row level security;

drop policy if exists system_job_runs_select_admin on public.system_job_runs;
create policy system_job_runs_select_admin on public.system_job_runs
  for select to authenticated
  using ((select public.is_current_user_admin()));

revoke all on public.system_job_runs from public, anon, authenticated;
grant select on public.system_job_runs to authenticated;
grant select, insert, update, delete on public.system_job_runs to service_role;
