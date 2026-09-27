-- v81 — Garde-fous médias : ce qu'un seul compte (ou un client modifié) peut
-- envoyer dans Storage, et un interrupteur d'urgence pour tous les envois.
--
-- Avant : la compression et les limites n'existaient que dans le navigateur.
-- Un client modifié pouvait envoyer en boucle des fichiers de 8 Mo dans son
-- propre dossier (dm, group, community) : 1 Go de Storage rempli en ~125
-- envois, sans aucune limite de rythme — les limites des tables (messages,
-- publications) ne s'appliquent pas aux fichiers, envoyés directement.
--
-- 1. Taille et types par bucket, appliqués par Storage lui-même :
--      avatars 3 Mo → 1 Mo   (l'app envoie ≤ 400 Ko, en pratique ~20–60 Ko)
--      posts   5 Mo → 2 Mo   (l'app envoie ≤ 1 Mo après compression)
--      dm, group, community : 8 Mo inchangés — ils portent aussi les PDF et
--      documents de cours ; leurs images sont compressées par l'app.
-- 2. Rythme et volume par compte, sur les 5 buckets de Blocus :
--      30 envois par heure, 100 Mo stockés au total.
-- 3. Interrupteur : public.app_runtime_flags('media_uploads'). Coupé, plus
--    aucun nouvel envoi de photo ni de fichier n'est accepté par Storage.
--    Chrono, planning, stats, sessions, gamification et messages texte ne
--    sont pas concernés. Réservé aux admins (admin_set_media_uploads), inscrit
--    au journal d'audit.
--
-- Mise en œuvre : des règles RESTRICTIVES sur storage.objects. Une règle
-- restrictive s'ajoute (ET) à toutes les règles existantes : elle ne peut
-- que refuser davantage, jamais autoriser ce qui ne l'était pas. Aucune règle
-- existante n'est modifiée.

-- ── 1. Limites des buckets ───────────────────────────────────────────────────
update storage.buckets
set file_size_limit = 1048576,
    allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/avif']
where id = 'avatars';

update storage.buckets
set file_size_limit = 2097152,
    allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/avif']
where id = 'posts';

-- ── 2. Interrupteur ──────────────────────────────────────────────────────────
create table if not exists public.app_runtime_flags (
  key text primary key check (key ~ '^[a-z_]{3,40}$'),
  enabled boolean not null,
  reason text check (reason is null or char_length(reason) <= 300),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);

alter table public.app_runtime_flags enable row level security;
-- Aucune règle : seules les fonctions ci-dessous le lisent ou l'écrivent.
revoke all on public.app_runtime_flags from public, anon, authenticated;
grant select on public.app_runtime_flags to service_role;

insert into public.app_runtime_flags (key, enabled)
values ('media_uploads', true)
on conflict (key) do nothing;

create or replace function public.media_uploads_enabled()
returns boolean
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  select coalesce((select f.enabled from public.app_runtime_flags f where f.key = 'media_uploads'), true);
$$;

revoke all on function public.media_uploads_enabled() from public, anon;
grant execute on function public.media_uploads_enabled() to authenticated, service_role;

-- ── 3. Rythme et volume par compte ───────────────────────────────────────────
-- Chaque fichier de Blocus vit dans le dossier de son auteur (« <uuid>/… »,
-- imposé par les règles d'envoi existantes) : on compte ses fichiers par un
-- parcours d'index (bucket_id, name COLLATE "C"). '0' suit '/' dans l'ordre
-- binaire, donc [« uuid/ », « uuid0 ») couvre exactement son dossier.
-- Réponse : 'ok', 'disabled', 'rate_limited', 'quota_full' ou 'signed_out' —
-- l'app s'en sert pour expliquer un refus, la règle d'accès pour décider.
create or replace function public.media_upload_status()
returns text
language plpgsql
stable
security definer
set search_path = public, pg_catalog
as $$
declare
  v_uid uuid := auth.uid();
  v_lo text;
  v_hi text;
  v_recent integer;
  v_bytes bigint;
begin
  if v_uid is null then
    return 'signed_out';
  end if;
  if not public.media_uploads_enabled() then
    return 'disabled';
  end if;
  v_lo := v_uid::text || '/';
  v_hi := v_uid::text || '0';
  select count(*) filter (where o.created_at > now() - interval '1 hour'),
         coalesce(sum(case when o.metadata->>'size' ~ '^[0-9]+$' then (o.metadata->>'size')::bigint else 0 end), 0)
  into v_recent, v_bytes
  from storage.objects o
  where o.bucket_id in ('avatars', 'posts', 'dm', 'community', 'group')
    and o.name collate "C" >= v_lo
    and o.name collate "C" < v_hi;
  if v_recent >= 30 then
    return 'rate_limited';
  end if;
  if v_bytes >= 104857600 then
    return 'quota_full';
  end if;
  return 'ok';
end;
$$;

revoke all on function public.media_upload_status() from public, anon;
grant execute on function public.media_upload_status() to authenticated, service_role;

-- ── 4. Règles restrictives sur storage.objects ───────────────────────────────
drop policy if exists media_upload_guard on storage.objects;
create policy media_upload_guard on storage.objects
  as restrictive
  for insert
  to authenticated
  with check (
    bucket_id <> all (array['avatars', 'posts', 'dm', 'community', 'group'])
    or public.media_upload_status() = 'ok'
  );

-- Un envoi « upsert » d'un chemin existant est une mise à jour : l'interrupteur
-- s'y applique aussi (le rythme et le volume, eux, ne bougent pas).
drop policy if exists media_upload_guard_update on storage.objects;
create policy media_upload_guard_update on storage.objects
  as restrictive
  for update
  to authenticated
  using (true)
  with check (
    bucket_id <> all (array['avatars', 'posts', 'dm', 'community', 'group'])
    or public.media_uploads_enabled()
  );

-- ── 5. Admin : lire et basculer l'interrupteur ───────────────────────────────
create or replace function public.admin_media_uploads_state()
returns table (enabled boolean, reason text, updated_at timestamptz, updated_by_pseudo text)
language plpgsql
stable
security definer
set search_path = public, pg_catalog
as $$
begin
  perform public.assert_admin();
  return query
    select f.enabled, f.reason, f.updated_at, p.pseudo
    from public.app_runtime_flags f
    left join public.profiles p on p.id = f.updated_by
    where f.key = 'media_uploads';
end;
$$;

revoke all on function public.admin_media_uploads_state() from public, anon;
grant execute on function public.admin_media_uploads_state() to authenticated;

create or replace function public.admin_set_media_uploads(p_enabled boolean, p_reason text default null)
returns boolean
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_admin uuid := public.assert_admin();
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  if p_enabled is null then
    raise exception 'p_enabled is required' using errcode = '22023';
  end if;
  if v_reason is not null and char_length(v_reason) > 300 then
    raise exception 'Reason too long' using errcode = '22023';
  end if;
  insert into public.app_runtime_flags (key, enabled, reason, updated_at, updated_by)
  values ('media_uploads', p_enabled, v_reason, now(), v_admin)
  on conflict (key) do update
    set enabled = excluded.enabled,
        reason = excluded.reason,
        updated_at = excluded.updated_at,
        updated_by = excluded.updated_by;
  perform public.log_admin_action(
    v_admin,
    case when p_enabled then 'media_uploads_enabled' else 'media_uploads_disabled' end,
    null, 'system', 'media_uploads', v_reason, '{}'::jsonb, 'admin'
  );
  return p_enabled;
end;
$$;

revoke all on function public.admin_set_media_uploads(boolean, text) from public, anon;
grant execute on function public.admin_set_media_uploads(boolean, text) to authenticated;

-- ── 6. Photos de publications : balayage de nuit ─────────────────────────────
-- Une publication vit 24 h ; la tâche de nuit la supprime avec son fichier.
-- Un fichier dont la ligne a disparu autrement (suppression par l'auteur ou
-- par un admin) restait orphelin. Au-delà de 72 h, aucun fichier du bucket
-- posts ne peut appartenir à une publication encore affichable : la tâche de
-- nuit les retire. Réservé au serveur.
create or replace function public.post_files_older_than(p_before timestamptz, p_limit integer default 500)
returns table (name text)
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  select o.name
  from storage.objects o
  where o.bucket_id = 'posts'
    and o.created_at < p_before
  order by o.created_at
  limit greatest(1, least(coalesce(p_limit, 500), 1000));
$$;

revoke all on function public.post_files_older_than(timestamptz, integer) from public, anon, authenticated;
grant execute on function public.post_files_older_than(timestamptz, integer) to service_role;
