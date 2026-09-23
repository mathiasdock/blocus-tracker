-- v56 — Droits admin verrouillés et modération ciblée (refonte admin, phase 1).
--
-- AVANT
--   · La règle `admin_update_profiles` laissait un admin modifier n'importe quel
--     champ de n'importe quel profil, y compris `is_admin` : nommer ou retirer
--     un admin se faisait depuis la console du navigateur, sans trace.
--   · Le déclencheur `prevent_profile_privilege_escalation` ignorait en silence
--     les changements de `is_admin`/`locked` venant du serveur, mais les
--     acceptait venant d'un admin connecté.
--
-- APRÈS
--   · `is_admin` et `locked` ne sont plus modifiables par aucun client
--     (privilège de colonne retiré) ;
--   · plus de modification libre d'un profil par un admin : trois actions de
--     modération ciblées, tracées, passant par le serveur ;
--   · en base, ces deux colonnes ne changent QUE dans une fonction protégée qui
--     lève le drapeau de transaction `blocus.privileged_change` : sinon le
--     déclencheur refuse, même pour une requête SQL écrite à la main ;
--   · donner ou retirer le rôle admin : `set_admin_role`, exécutable
--     uniquement par le propriétaire de la base (éditeur SQL Supabase), jamais
--     par `anon`, `authenticated` ni le service role utilisé par l'app.

-- 1. Aucun client ne modifie plus le rôle admin ni la suspension.
revoke update (is_admin, locked) on public.profiles from anon, authenticated;

-- 2. Plus de modification libre d'un profil par un admin.
drop policy if exists admin_update_profiles on public.profiles;

-- 3. Le garde-fou en base. Le reste de son comportement est inchangé.
create or replace function public.prevent_profile_privilege_escalation()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_catalog'
as $$
declare
  v_internal boolean := coalesce(current_setting('app.gamification_internal', true), '') = 'on';
  v_privileged boolean := coalesce(current_setting('blocus.privileged_change', true), '') = 'on';
begin
  new.id := old.id;
  new.created_at := old.created_at;

  if auth.uid() = old.id and old.locked and not v_internal and not v_privileged then
    raise exception 'Locked profiles cannot be modified'
      using errcode = '42501';
  end if;

  if auth.uid() is not null and not v_internal then
    new.bonus_xp := old.bonus_xp;
    new.referred_by := old.referred_by;
    new.referral_code := old.referral_code;
    new.streak_freezes := old.streak_freezes;
    new.streak_freeze_month := old.streak_freeze_month;
  end if;

  -- Rôle admin et suspension : seules set_admin_role et admin_set_suspension
  -- lèvent le drapeau. Un refus explicite vaut mieux qu'un changement ignoré
  -- en silence : une tentative se voit.
  if (new.is_admin is distinct from old.is_admin or new.locked is distinct from old.locked)
     and not v_privileged then
    raise exception 'Admin role and suspension change only through the protected functions'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

-- 4. Donner ou retirer le rôle admin — administration manuelle uniquement.
--
--    Usage, dans l'éditeur SQL Supabase :
--      select public.set_admin_role('<uuid du profil>', true,  'motif');
--      select public.set_admin_role('<uuid du profil>', false, 'motif');
create or replace function public.set_admin_role(p_target uuid, p_grant boolean, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current boolean;
  v_locked boolean;
begin
  if p_target is null or p_grant is null then
    raise exception 'Target and grant are required' using errcode = '22023';
  end if;
  if char_length(btrim(coalesce(p_reason, ''))) < 3 then
    raise exception 'A reason is required' using errcode = '22023';
  end if;

  select is_admin, locked into v_current, v_locked
  from public.profiles where id = p_target
  for update;
  if not found then
    raise exception 'Unknown profile' using errcode = '22023';
  end if;
  if v_current = p_grant then
    return jsonb_build_object('ok', true, 'changed', false, 'is_admin', v_current);
  end if;
  if p_grant and v_locked then
    raise exception 'A suspended account cannot become admin' using errcode = '42501';
  end if;
  if not p_grant and not exists (
    select 1 from public.profiles where is_admin and id <> p_target
  ) then
    raise exception 'Cannot remove the last admin' using errcode = '42501';
  end if;

  perform set_config('blocus.privileged_change', 'on', true);
  update public.profiles set is_admin = p_grant where id = p_target;
  perform set_config('blocus.privileged_change', '', true);

  perform public.log_admin_action(
    null,
    case when p_grant then 'admin_role_granted' else 'admin_role_revoked' end,
    p_target, 'user', p_target::text, p_reason,
    jsonb_build_object('performed_by', session_user),
    'database'
  );
  return jsonb_build_object('ok', true, 'changed', true, 'is_admin', p_grant);
end;
$$;

-- Pas seulement caché de l'interface : AUCUN rôle de l'app ne peut l'exécuter.
revoke all on function public.set_admin_role(uuid, boolean, text)
  from public, anon, authenticated, service_role;

-- 5. Modération ciblée d'un profil, réservée au serveur (route admin qui a
--    vérifié l'admin et, pour l'avatar, effacé les fichiers avant l'appel).
create or replace function public.admin_moderate_profile(
  p_actor uuid,
  p_target uuid,
  p_action text,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_is_admin boolean;
  v_pseudo text;
  v_tries integer := 0;
begin
  perform public.assert_admin_actor(p_actor);
  if p_action is null or p_action not in ('reset_username', 'clear_bio', 'remove_avatar') then
    raise exception 'Unknown moderation action' using errcode = '22023';
  end if;
  if char_length(btrim(coalesce(p_reason, ''))) < 3 then
    raise exception 'A reason is required' using errcode = '22023';
  end if;

  select is_admin into v_is_admin from public.profiles where id = p_target for update;
  if not found then
    raise exception 'Unknown profile' using errcode = '22023';
  end if;
  if p_target = p_actor or v_is_admin then
    raise exception 'Admins cannot be moderated here' using errcode = '42501';
  end if;

  if p_action = 'reset_username' then
    -- Pseudo neutre, unique, accepté par les règles existantes (3 à 30
    -- caractères, unicité insensible à la casse).
    loop
      v_pseudo := 'user_' || substr(md5(gen_random_uuid()::text), 1, 8);
      exit when not exists (
        select 1 from public.profiles where lower(btrim(pseudo)) = v_pseudo
      );
      v_tries := v_tries + 1;
      if v_tries > 20 then
        raise exception 'Could not generate a username';
      end if;
    end loop;
    update public.profiles set pseudo = v_pseudo where id = p_target;
  elsif p_action = 'clear_bio' then
    update public.profiles set bio = null where id = p_target;
  else
    update public.profiles set avatar_url = null where id = p_target;
  end if;

  perform public.log_admin_action(
    p_actor, 'profile_' || p_action, p_target, 'user', p_target::text, p_reason, '{}'::jsonb
  );
  return jsonb_build_object('ok', true, 'action', p_action, 'pseudo', v_pseudo);
end;
$$;

revoke all on function public.admin_moderate_profile(uuid, uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.admin_moderate_profile(uuid, uuid, text, text) to service_role;
