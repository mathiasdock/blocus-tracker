-- v86 — Focus environments: private choice and permanent, server-owned unlocks.
-- Additive and re-runnable. Does not modify XP, badges, or their calculations.
begin;

create table if not exists public.focus_environment_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  equipped_id text not null default 'forest'
    check (equipped_id in ('forest', 'gradient-wave', 'zenitho', 'glass-fold')),
  highest_level integer not null default 1 check (highest_level between 1 and 30),
  constraint focus_equipped_is_unlocked
    check ((equipped_id <> 'gradient-wave' or highest_level >= 5)
       and (equipped_id <> 'zenitho' or highest_level >= 12)
       and (equipped_id <> 'glass-fold' or highest_level >= 20))
);

-- v86 is still pending in production. Also allow a local database which has
-- already applied its two/three-environment version to upgrade without losing rows.
alter table public.focus_environment_preferences
  drop constraint if exists focus_environment_preferences_equipped_id_check,
  drop constraint if exists focus_equipped_is_unlocked;
alter table public.focus_environment_preferences
  add constraint focus_environment_preferences_equipped_id_check
    check (equipped_id in ('forest', 'gradient-wave', 'zenitho', 'glass-fold')),
  add constraint focus_equipped_is_unlocked
    check ((equipped_id <> 'gradient-wave' or highest_level >= 5)
       and (equipped_id <> 'zenitho' or highest_level >= 12)
       and (equipped_id <> 'glass-fold' or highest_level >= 20));

alter table public.focus_environment_preferences enable row level security;
revoke all on public.focus_environment_preferences from public, anon, authenticated;
grant select on public.focus_environment_preferences to authenticated;
grant all on public.focus_environment_preferences to service_role;
drop policy if exists focus_environment_read_own on public.focus_environment_preferences;
create policy focus_environment_read_own on public.focus_environment_preferences
  for select to authenticated using (user_id = (select auth.uid()));

drop trigger if exists a00_block_suspended_actor on public.focus_environment_preferences;
create trigger a00_block_suspended_actor
  before insert or update or delete on public.focus_environment_preferences
  for each row execute function public.block_suspended_actor();

-- Reads accept no UUID, level, or unlock. SECURITY DEFINER is
-- needed only to write the two server-owned fields of this private table.
create or replace function public.get_my_focus_environment()
returns table (equipped_id text, highest_level integer)
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_user uuid := auth.uid();
  v_locked boolean;
  v_level integer;
begin
  if v_user is null then
    raise exception 'Authentication required' using errcode = '42501', hint = 'focus_auth_required';
  end if;
  select p.locked into v_locked from public.profiles p where p.id = v_user;
  if not found then
    raise exception 'Profile required' using errcode = '42501', hint = 'focus_auth_required';
  end if;
  if v_locked then
    raise exception 'Account suspended' using errcode = '42501', hint = 'suspended';
  end if;

  select g.level into v_level
  from public.get_gamification_levels(array[v_user]) g where g.user_id = v_user;
  if v_level is null or v_level not between 1 and 30 then
    raise exception 'Level unavailable' using errcode = 'P0001', hint = 'focus_unavailable';
  end if;

  insert into public.focus_environment_preferences as prefs (user_id, highest_level)
  values (v_user, v_level)
  on conflict (user_id) do update
    set highest_level = greatest(prefs.highest_level, excluded.highest_level)
    where prefs.highest_level < excluded.highest_level;

  return query select prefs.equipped_id, prefs.highest_level
    from public.focus_environment_preferences prefs where prefs.user_id = v_user;
end;
$$;

-- Remove the earlier local signature so no unbound mutation overload remains.
drop function if exists public.equip_focus_environment(text);
create or replace function public.equip_focus_environment(p_environment_id text, p_expected_user_id uuid)
returns table (equipped_id text, highest_level integer)
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_user uuid := auth.uid();
  v_locked boolean;
  v_level integer;
  v_highest integer;
begin
  if v_user is null then
    raise exception 'Authentication required' using errcode = '42501', hint = 'focus_auth_required';
  end if;
  -- Bind the action to the account which opened the control, before any write.
  -- This UUID never grants access or eligibility; auth.uid() stays the owner.
  if p_expected_user_id is distinct from v_user then
    raise exception 'Account changed' using errcode = '42501', hint = 'focus_auth_required';
  end if;
  select p.locked into v_locked from public.profiles p where p.id = v_user;
  if not found then
    raise exception 'Profile required' using errcode = '42501', hint = 'focus_auth_required';
  end if;
  if v_locked then
    raise exception 'Account suspended' using errcode = '42501', hint = 'suspended';
  end if;
  -- Reserved levels and future renderer IDs are never equippable in V1.
  if p_environment_id is null or p_environment_id not in ('forest', 'gradient-wave', 'zenitho', 'glass-fold') then
    raise exception 'Unknown environment' using errcode = '22023', hint = 'focus_invalid';
  end if;

  select g.level into v_level
  from public.get_gamification_levels(array[v_user]) g where g.user_id = v_user;
  if v_level is null or v_level not between 1 and 30 then
    raise exception 'Level unavailable' using errcode = 'P0001', hint = 'focus_unavailable';
  end if;
  select greatest(v_level, coalesce(prefs.highest_level, 1)) into v_highest
    from (select 1) seed left join public.focus_environment_preferences prefs on prefs.user_id = v_user;
  if (p_environment_id = 'gradient-wave' and v_highest < 5)
     or (p_environment_id = 'zenitho' and v_highest < 12)
     or (p_environment_id = 'glass-fold' and v_highest < 20) then
    raise exception 'Environment locked' using errcode = '42501', hint = 'focus_locked';
  end if;

  -- The conflict branch preserves a level recorded by a concurrent request.
  -- Choosing an already equipped environment does not rewrite an unchanged row.
  insert into public.focus_environment_preferences as prefs (user_id, equipped_id, highest_level)
  values (v_user, p_environment_id, v_highest)
  on conflict (user_id) do update
    set equipped_id = excluded.equipped_id,
        highest_level = greatest(prefs.highest_level, excluded.highest_level)
    where prefs.equipped_id is distinct from excluded.equipped_id
       or prefs.highest_level < excluded.highest_level;

  return query select prefs.equipped_id, prefs.highest_level
    from public.focus_environment_preferences prefs where prefs.user_id = v_user;
end;
$$;

revoke all on function public.get_my_focus_environment() from public, anon, authenticated;
revoke all on function public.equip_focus_environment(text, uuid) from public, anon, authenticated;
grant execute on function public.get_my_focus_environment() to authenticated;
grant execute on function public.equip_focus_environment(text, uuid) to authenticated;
commit;
