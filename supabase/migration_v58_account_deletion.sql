-- v58 — Suppression de compte complète et cohortes stables (refonte admin, phase 1).
--
-- 1. La suppression par un admin passe désormais par une route serveur qui
--    efface D'ABORD les fichiers de la personne (avatar, photos, pièces
--    jointes), puis appelle `admin_delete_account` ci-dessous — réservée au
--    serveur. L'ancienne fonction `admin_delete_user`, appelée directement
--    depuis le navigateur, laissait les fichiers en ligne : elle n'est plus
--    exécutable par l'app (elle sera supprimée en phase 4).
--
-- 2. Le journal anonyme des suppressions garde, en plus de l'ancienneté :
--      · la semaine d'inscription (lundi, heure de Bruxelles) ;
--      · « activé : oui/non » — au moins une vraie session d'étude
--        (10 minutes ou plus) dans les 168 heures suivant l'inscription.
--    Sans cela, une cohorte d'inscrits rétrécirait à chaque suppression et
--    ses taux changeraient après coup. Aucun nom, pseudo ou identifiant n'y
--    est conservé.
--
-- 3. Un compte suspendu garde le droit de supprimer son propre compte.
--
-- La définition d'une « vraie session » (10 minutes) ne sert qu'aux
-- statistiques de l'admin : elle ne change ni les sessions, ni l'XP, ni les
-- séries, ni les statistiques personnelles des membres.

create or replace function public.admin_real_session_seconds()
returns integer
language sql
immutable
as $$
  select 600;
$$;

alter table public.deleted_accounts
  add column if not exists signup_week date,
  add column if not exists was_activated boolean;

-- Instantané anonyme d'un compte au moment de sa suppression.
create or replace function public.deletion_snapshot(p_user uuid)
returns table (age_months integer, signup_week date, was_activated boolean)
language sql
stable
security definer
set search_path = public, auth
as $$
  select
    greatest(0, (extract(epoch from (now() - u.created_at)) / 2629800)::int),
    (date_trunc('week', u.created_at at time zone 'Europe/Brussels'))::date,
    exists (
      select 1 from public.sessions s
      where s.user_id = u.id
        and s.duration_seconds >= public.admin_real_session_seconds()
        and s.started_at >= u.created_at
        and s.started_at < u.created_at + interval '168 hours'
    )
  from auth.users u
  where u.id = p_user;
$$;

revoke all on function public.deletion_snapshot(uuid) from public, anon, authenticated, service_role;

-- Suppression par la personne elle-même (appelée par /api/account/delete après
-- l'effacement de ses fichiers, avec SON jeton).
create or replace function public.self_delete_user()
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_catalog'
as $$
declare
  v_uid uuid := auth.uid();
  v_snap record;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  select * into v_snap from public.deletion_snapshot(v_uid);

  insert into public.deleted_accounts (deleted_kind, account_age_months, signup_week, was_activated)
  values ('self', v_snap.age_months, v_snap.signup_week, v_snap.was_activated);

  -- Le droit à l'effacement prime sur la suspension (voir block_suspended_actor).
  perform set_config('blocus.self_delete', 'on', true);
  delete from auth.users where id = v_uid;
end;
$$;

-- Suppression par un admin — réservée au serveur, qui a vérifié l'admin et
-- effacé les fichiers juste avant.
create or replace function public.admin_delete_account(
  p_actor uuid,
  p_target uuid,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_snap record;
  v_is_admin boolean;
begin
  perform public.assert_admin_actor(p_actor);
  if char_length(btrim(coalesce(p_reason, ''))) < 3 then
    raise exception 'A reason is required' using errcode = '22023';
  end if;
  if p_target is null or p_target = p_actor then
    raise exception 'You cannot delete your own account here' using errcode = '42501';
  end if;
  if not exists (select 1 from auth.users where id = p_target) then
    raise exception 'Unknown account' using errcode = '22023';
  end if;

  select coalesce(is_admin, false) into v_is_admin from public.profiles where id = p_target;
  if coalesce(v_is_admin, false) then
    raise exception 'Admins cannot be deleted here' using errcode = '42501';
  end if;

  select * into v_snap from public.deletion_snapshot(p_target);

  insert into public.deleted_accounts (deleted_kind, account_age_months, signup_week, was_activated)
  values ('admin', v_snap.age_months, v_snap.signup_week, v_snap.was_activated);

  perform public.log_admin_action(
    p_actor, 'account_deleted', p_target, 'user', p_target::text, p_reason,
    jsonb_build_object('age_months', v_snap.age_months)
  );

  delete from auth.users where id = p_target;
  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.admin_delete_account(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.admin_delete_account(uuid, uuid, text) to service_role;

-- L'ancien chemin, qui laissait les fichiers : plus exécutable par l'app.
revoke all on function public.admin_delete_user(uuid) from public, anon, authenticated;
