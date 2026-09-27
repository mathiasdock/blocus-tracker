-- v83 — Plafond global des fichiers de Blocus : 700 Mo.
--
-- v81 limite chaque membre (30 envois par heure, 100 Mo stockés) mais pas
-- l'ensemble : dix membres au maximum suffiraient à remplir le Storage
-- gratuit (1 Go). Le même garde-fou (media_upload_status, lu par la règle
-- restrictive media_upload_guard au moment d'un envoi, et seulement là)
-- refuse désormais tout nouvel envoi quand les fichiers de Blocus atteignent
-- 700 Mo. Il reste ainsi ~300 Mo de marge sous le quota pour le reste du
-- projet (Expose, dont les fichiers ne comptent pas ici : bucket séparé).
--
-- Ce qui continue : chrono, sessions, planning, stats, gamification,
-- messages texte, lecture des fichiers existants, suppressions (les règles
-- de suppression ne sont pas concernées ; les outils admin passent par le
-- serveur). L'interrupteur manuel reste prioritaire.
--
-- Coût : une somme sur les fichiers des 5 buckets de Blocus, calculée
-- uniquement pendant un envoi — jamais à l'affichage. Un envoi en cours n'est
-- pas encore compté : le plafond peut être dépassé d'au plus un fichier par
-- envoi simultané (8 Mo au maximum chacun).

create or replace function public.media_blocus_bytes()
returns bigint
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  select coalesce(sum(case when o.metadata->>'size' ~ '^[0-9]+$' then (o.metadata->>'size')::bigint else 0 end), 0)::bigint
  from storage.objects o
  where o.bucket_id in ('avatars', 'posts', 'dm', 'community', 'group');
$$;

revoke all on function public.media_blocus_bytes() from public, anon, authenticated;
grant execute on function public.media_blocus_bytes() to service_role;

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
  -- Plafond global : 700 Mo de fichiers Blocus.
  if public.media_blocus_bytes() >= 734003200 then
    return 'storage_full';
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

-- L'admin voit l'espace utilisé à côté de l'interrupteur (nouvelles colonnes :
-- la fonction est recréée, son type de retour change).
drop function if exists public.admin_media_uploads_state();

create function public.admin_media_uploads_state()
returns table (
  enabled boolean,
  reason text,
  updated_at timestamptz,
  updated_by_pseudo text,
  used_bytes bigint,
  cap_bytes bigint
)
language plpgsql
stable
security definer
set search_path = public, pg_catalog
as $$
begin
  perform public.assert_admin();
  return query
    select f.enabled, f.reason, f.updated_at, p.pseudo, public.media_blocus_bytes(), 734003200::bigint
    from public.app_runtime_flags f
    left join public.profiles p on p.id = f.updated_by
    where f.key = 'media_uploads';
end;
$$;

revoke all on function public.admin_media_uploads_state() from public, anon;
grant execute on function public.admin_media_uploads_state() to authenticated;
