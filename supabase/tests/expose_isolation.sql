-- Expose isolé (v80), sur la vraie base. Exception finale : RIEN n'est gardé.
-- Résultat attendu : « EXPOSE ISOLATION TESTS PASSED ».

do $tests$
declare
  checks integer := 0;
begin
  -- Plus aucun privilège d'API sur les tables d'Expose.
  if exists (
    select 1 from information_schema.role_table_grants
    where table_schema = 'public' and table_name like 'exposed%'
      and grantee in ('anon', 'authenticated', 'service_role', 'PUBLIC')
  ) then
    raise exception 'FAIL [table grants remain]';
  end if;
  -- Ni sur ses fonctions.
  if exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname like 'exposed%'
      and (has_function_privilege('service_role', p.oid, 'execute')
        or has_function_privilege('authenticated', p.oid, 'execute')
        or has_function_privilege('anon', p.oid, 'execute'))
  ) then
    raise exception 'FAIL [function execute remains]';
  end if;
  checks := checks + 2;

  -- La clé service d'Expose ne lit ni n'écrit plus rien.
  begin
    set local role service_role;
    perform count(*) from public.exposed_rooms;
    raise exception 'FAIL [service_role still reads exposed_rooms]';
  exception when insufficient_privilege then
    null;
  end;
  reset role;
  begin
    set local role service_role;
    update public.exposed_players set last_seen_at = now() where false;
    raise exception 'FAIL [service_role still writes exposed_players]';
  exception when insufficient_privilege then
    null;
  end;
  reset role;
  begin
    set local role anon;
    perform count(*) from public.exposed_rooms;
    raise exception 'FAIL [anon still reads exposed_rooms]';
  exception when insufficient_privilege then
    null;
  end;
  reset role;
  checks := checks + 3;

  -- Temps réel : Expose n'est plus diffusé ; Blocus l'est toujours.
  if exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'exposed_rooms') then
    raise exception 'FAIL [exposed_rooms still published]';
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'private_messages') then
    raise exception 'FAIL [private_messages no longer published]';
  end if;
  checks := checks + 2;

  -- Bucket fermé aux envois ; données et fichiers intacts.
  if (select allowed_mime_types from storage.buckets where id = 'exposed-photos') is distinct from array['application/x-expose-disabled'] then
    raise exception 'FAIL [exposed-photos still accepts uploads]';
  end if;
  if (select count(*) from public.exposed_photos) = 0
     or (select count(*) from storage.objects where bucket_id = 'exposed-photos') = 0 then
    raise exception 'FAIL [Expose data or files gone]';
  end if;
  checks := checks + 2;

  -- Blocus inchangé pour la clé service.
  set local role service_role;
  perform count(*) from public.profiles;
  perform count(*) from public.sessions;
  reset role;
  checks := checks + 1;

  raise exception 'EXPOSE ISOLATION TESTS PASSED: % checks (everything rolled back)', checks;
end
$tests$;
