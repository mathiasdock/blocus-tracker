-- v55 — Journal des actions admin (refonte de l'admin, phase 1).
--
-- Chaque action admin laisse une ligne : qui, quoi, sur qui, pourquoi, quand.
--
-- Le journal est en AJOUT SEUL :
--   · aucun client ne peut y écrire (ni `anon`, ni `authenticated`, ni le
--     service role en direct) : les lignes viennent uniquement de
--     `log_admin_action`, appelée par les fonctions admin de la base et par les
--     routes serveur après vérification de l'admin ;
--   · personne ne peut modifier ou effacer une ligne (déclencheurs), pas même
--     le propriétaire des tables sans désactiver volontairement le garde-fou.
--
-- Vie privée : aucune copie de contenu (pseudo, bio, texte d'un message) n'est
-- conservée, seulement des identifiants et un motif rédigé par l'admin. Une
-- fois un compte supprimé, son identifiant ne renvoie plus à personne.
--
-- Fonctions ajoutées :
--   · assert_admin()          — refuse tout appel qui ne vient pas d'un admin
--                               non suspendu (fonctions appelées par l'app) ;
--   · assert_admin_actor(id)  — même contrôle pour un admin désigné par une
--                               route serveur (fonctions réservées au serveur) ;
--   · log_admin_action(...)   — écrit une ligne du journal.

create table if not exists public.admin_audit_log (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  actor_id uuid,
  actor_kind text not null default 'admin'
    check (actor_kind in ('admin', 'database', 'system')),
  action text not null check (char_length(action) between 3 and 64),
  target_user_id uuid,
  target_type text,
  target_id text,
  reason text check (reason is null or char_length(reason) <= 500),
  details jsonb not null default '{}'::jsonb
);

create index if not exists admin_audit_log_created_idx
  on public.admin_audit_log (created_at desc);
create index if not exists admin_audit_log_target_idx
  on public.admin_audit_log (target_user_id, created_at desc)
  where target_user_id is not null;

alter table public.admin_audit_log enable row level security;

drop policy if exists admin_audit_log_select_admin on public.admin_audit_log;
create policy admin_audit_log_select_admin on public.admin_audit_log
  for select to authenticated
  using ((select public.is_current_user_admin()));

revoke all on public.admin_audit_log from public, anon, authenticated, service_role;
grant select on public.admin_audit_log to authenticated, service_role;

create or replace function public.admin_audit_log_append_only()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception 'admin_audit_log is append-only' using errcode = '42501';
end;
$$;

drop trigger if exists admin_audit_log_no_change on public.admin_audit_log;
create trigger admin_audit_log_no_change
  before update or delete on public.admin_audit_log
  for each row execute function public.admin_audit_log_append_only();

drop trigger if exists admin_audit_log_no_truncate on public.admin_audit_log;
create trigger admin_audit_log_no_truncate
  before truncate on public.admin_audit_log
  for each statement execute function public.admin_audit_log_append_only();

-- ── Contrôles d'accès partagés ───────────────────────────────────────────────

create or replace function public.assert_admin()
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null or not exists (
    select 1 from public.profiles
    where id = v_uid and is_admin and not locked
  ) then
    raise exception 'Admin only' using errcode = '42501';
  end if;
  return v_uid;
end;
$$;

create or replace function public.assert_admin_actor(p_actor uuid)
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if p_actor is null or not exists (
    select 1 from public.profiles
    where id = p_actor and is_admin and not locked
  ) then
    raise exception 'Admin only' using errcode = '42501';
  end if;
end;
$$;

-- Internes : appelées par les autres fonctions de la base, jamais exposées.
revoke all on function public.assert_admin() from public, anon, authenticated, service_role;
revoke all on function public.assert_admin_actor(uuid) from public, anon, authenticated, service_role;

create or replace function public.log_admin_action(
  p_actor uuid,
  p_action text,
  p_target_user uuid default null,
  p_target_type text default null,
  p_target_id text default null,
  p_reason text default null,
  p_details jsonb default '{}'::jsonb,
  p_actor_kind text default 'admin'
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_kind text := coalesce(p_actor_kind, 'admin');
  v_id bigint;
begin
  -- Une ligne « admin » doit venir d'un admin réel : le service role ne peut
  -- pas écrire au nom de n'importe qui.
  if v_kind = 'admin' then
    perform public.assert_admin_actor(p_actor);
  end if;

  insert into public.admin_audit_log (
    actor_id, actor_kind, action, target_user_id, target_type, target_id, reason, details
  )
  values (
    p_actor, v_kind, p_action, p_target_user, p_target_type, p_target_id,
    nullif(btrim(coalesce(p_reason, '')), ''),
    coalesce(p_details, '{}'::jsonb)
  )
  returning id into v_id;
  return v_id;
end;
$$;

revoke all on function public.log_admin_action(uuid, text, uuid, text, text, text, jsonb, text)
  from public, anon, authenticated;
grant execute on function public.log_admin_action(uuid, text, uuid, text, text, text, jsonb, text)
  to service_role;

-- ── Tables que l'admin modifie encore directement depuis l'app ───────────────
-- Annonces et suggestions passent par leurs propres règles d'accès (réservées
-- aux admins) ; un déclencheur les inscrit au journal, quel que soit l'écran.

create or replace function public.audit_announcement_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_action text;
  v_id uuid;
begin
  -- Seules les écritures d'un admin (ou une maintenance SQL, sans session)
  -- sont journalisées. Une écriture en cascade déclenchée par un membre — la
  -- suppression de son compte, par exemple — ne doit ni être prise pour une
  -- action admin, ni échouer à cause du journal.
  if v_actor is not null and not public.is_current_user_admin() then
    return coalesce(new, old);
  end if;

  if tg_op = 'INSERT' then
    v_action := 'announcement_created';
    v_id := new.id;
  elsif tg_op = 'DELETE' then
    v_action := 'announcement_deleted';
    v_id := old.id;
  elsif new.is_active is distinct from old.is_active then
    v_action := case when new.is_active then 'announcement_activated' else 'announcement_deactivated' end;
    v_id := new.id;
  else
    v_action := 'announcement_updated';
    v_id := new.id;
  end if;

  perform public.log_admin_action(
    v_actor, v_action, null, 'announcement', v_id::text, null, '{}'::jsonb,
    case when v_actor is null then 'database' else 'admin' end
  );
  return coalesce(new, old);
end;
$$;

drop trigger if exists audit_announcement_change on public.app_announcements;
create trigger audit_announcement_change
  after insert or update or delete on public.app_announcements
  for each row execute function public.audit_announcement_change();

create or replace function public.audit_feedback_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
begin
  -- Même règle que pour les annonces. En plus, une suppression sans session
  -- (cascade d'une suppression de compte par le serveur) n'est pas une action
  -- de modération : seule la suppression faite par un admin est notée.
  if v_actor is not null and not public.is_current_user_admin() then
    return coalesce(new, old);
  end if;

  if tg_op = 'DELETE' then
    if v_actor is null then
      return old;
    end if;
    perform public.log_admin_action(
      v_actor, 'feedback_deleted', old.user_id, 'feedback', old.id::text, null, '{}'::jsonb,
      case when v_actor is null then 'database' else 'admin' end
    );
    return old;
  end if;

  if new.status is distinct from old.status then
    perform public.log_admin_action(
      v_actor, 'feedback_status_changed', new.user_id, 'feedback', new.id::text, null,
      jsonb_build_object('from', old.status, 'to', new.status),
      case when v_actor is null then 'database' else 'admin' end
    );
  end if;
  return new;
end;
$$;

drop trigger if exists audit_feedback_change on public.app_feedback;
create trigger audit_feedback_change
  after update or delete on public.app_feedback
  for each row execute function public.audit_feedback_change();

revoke all on function public.audit_announcement_change() from public, anon, authenticated;
revoke all on function public.audit_feedback_change() from public, anon, authenticated;
