-- ============================================================
--  blocus-tracker — migration v3
--  Réactions emoji, planning public, langue, suppression de
--  compte (admin), realtime messages.
--  À exécuter d'un coup dans l'éditeur SQL Supabase.
-- ============================================================

-- ---------- 1. Réactions emoji sur les posts ----------
alter table public.likes
  add column if not exists emoji text not null default '♥';

-- ---------- 2. Planning visible par les amis ----------
alter table public.profiles
  add column if not exists planning_public boolean not null default false;

-- ---------- 3. Langue de l'interface ----------
alter table public.profiles
  add column if not exists lang text not null default 'fr';

-- ---------- 4. Suppression de compte (admin only) ----------
-- Supprime l'utilisateur de auth.users ; les cascades effacent
-- profil, cours, sessions, objectifs, amitiés, posts, messages…
create or replace function public.admin_delete_user(target uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.profiles
    where id = auth.uid() and pseudo = 'mathias.dock'
  ) then
    raise exception 'Non autorisé';
  end if;
  delete from auth.users where id = target;
end;
$$;

revoke all on function public.admin_delete_user(uuid) from public;
grant execute on function public.admin_delete_user(uuid) to authenticated;

-- ---------- 5. Realtime sur les messages privés ----------
-- Permet aux websockets Supabase de pousser les nouveaux DM
-- instantanément (plus besoin de polling toutes les 4 s).
do $$
begin
  begin
    alter publication supabase_realtime add table public.private_messages;
  exception
    when duplicate_object then null;
  end;
end $$;
