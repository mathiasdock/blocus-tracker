-- Garde-fous médias (v81), sur la vraie base. Comptes et fichiers jetables,
-- exception finale : RIEN n'est gardé (ni lignes, ni fichiers : les lignes de
-- storage.objects insérées ici n'ont jamais de contenu dans le stockage).
-- Résultat attendu : « MEDIA GUARDRAILS TESTS PASSED ».

create function pg_temp.act_as(u uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', u::text, true);
end $$;

-- Envoi tel que Storage le fait : une ligne dans storage.objects, sous le rôle
-- du membre (les règles d'accès décident). Renvoie true si accepté.
create function pg_temp.try_upload(u uuid, bucket text, fname text, bytes bigint) returns boolean language plpgsql as $$
begin
  perform pg_temp.act_as(u);
  set local role authenticated;
  insert into storage.objects (bucket_id, name, owner, owner_id, metadata)
  values (bucket, u::text || '/' || fname, u, u::text, jsonb_build_object('size', bytes, 'mimetype', 'image/jpeg'));
  reset role;
  return true;
exception when insufficient_privilege then
  reset role;
  return false;
end $$;

create function pg_temp.status_of(u uuid) returns text language plpgsql as $$
declare v text;
begin
  perform pg_temp.act_as(u);
  set local role authenticated;
  v := public.media_upload_status();
  reset role;
  return v;
end $$;

do $tests$
declare
  suffix constant text := substr(md5(clock_timestamp()::text), 1, 8);
  u uuid := gen_random_uuid();
  other uuid := gen_random_uuid();
  boss uuid := gen_random_uuid();
  checks integer := 0;
  st text;
  i integer;
  real_blocked integer;
begin
  -- ── Limites des buckets ─────────────────────────────────────────────────
  if (select file_size_limit from storage.buckets where id = 'avatars') <> 1048576
     or (select file_size_limit from storage.buckets where id = 'posts') <> 2097152
     or (select file_size_limit from storage.buckets where id = 'dm') <> 8388608
     or (select file_size_limit from storage.buckets where id = 'community') <> 8388608
     or (select file_size_limit from storage.buckets where id = 'group') <> 8388608
     or not (select 'application/pdf' = any (b.allowed_mime_types) from storage.buckets b where b.id = 'dm') then
    raise exception 'FAIL [bucket limits]';
  end if;
  checks := checks + 1;

  insert into auth.users (id, email, created_at, raw_user_meta_data)
  select x.id, 'media-' || suffix || '-' || x.n || '@example.invalid', now(),
         jsonb_build_object('pseudo', 'md' || suffix || x.n, 'study_year', 'BAC 1')
  from (values (u, 1), (other, 2), (boss, 3)) x(id, n);
  -- Le rôle admin ne change que par les fonctions protégées : on emprunte leur
  -- autorisation interne, le temps de cette transaction annulée.
  perform set_config('blocus.privileged_change', 'on', true);
  update public.profiles set is_admin = true where id = boss;
  perform set_config('blocus.privileged_change', '', true);

  -- ── Envoi normal ────────────────────────────────────────────────────────
  if pg_temp.status_of(u) <> 'ok' then raise exception 'FAIL [fresh status]'; end if;
  if not pg_temp.try_upload(u, 'dm', 'first.jpg', 200000) then raise exception 'FAIL [normal upload refused]'; end if;
  -- Les règles existantes tiennent toujours : pas dans le dossier d'un autre.
  perform pg_temp.act_as(u);
  begin
    set local role authenticated;
    insert into storage.objects (bucket_id, name, owner, owner_id, metadata)
    values ('dm', other::text || '/intrus.jpg', u, u::text, '{"size": 10}'::jsonb);
    raise exception 'FAIL [upload into someone else''s folder]';
  exception when insufficient_privilege then
    null;
  end;
  reset role;
  checks := checks + 3;

  -- ── Rythme : 30 envois par heure ────────────────────────────────────────
  insert into storage.objects (bucket_id, name, owner, owner_id, metadata, created_at)
  select 'group', u::text || '/burst-' || g || '.jpg', u, u::text, '{"size": 1000}'::jsonb, now() - interval '5 minutes'
  from generate_series(1, 29) g;
  if pg_temp.status_of(u) <> 'rate_limited' then raise exception 'FAIL [30/h not limited: %]', pg_temp.status_of(u); end if;
  if pg_temp.try_upload(u, 'dm', 'thirty-first.jpg', 1000) then raise exception 'FAIL [31st upload accepted]'; end if;
  -- Un autre membre n'est pas concerné.
  if not pg_temp.try_upload(other, 'dm', 'fine.jpg', 1000) then raise exception 'FAIL [other member blocked]'; end if;
  -- Une heure plus tard, c'est reparti.
  update storage.objects set created_at = now() - interval '2 hours'
  where bucket_id = 'group' and name like u::text || '/burst-%';
  if pg_temp.status_of(u) <> 'ok' then raise exception 'FAIL [rate window never reopens]'; end if;
  checks := checks + 4;

  -- ── Volume : 100 Mo stockés ─────────────────────────────────────────────
  insert into storage.objects (bucket_id, name, owner, owner_id, metadata, created_at)
  values ('community', u::text || '/room/huge.pdf', u, u::text, '{"size": 104857600}'::jsonb, now() - interval '3 hours');
  if pg_temp.status_of(u) <> 'quota_full' then raise exception 'FAIL [100 MB quota]'; end if;
  if pg_temp.try_upload(u, 'posts', 'more.jpg', 1000) then raise exception 'FAIL [upload over quota accepted]'; end if;
  -- (Storage interdit la suppression directe en SQL : on rétrécit le fichier.)
  update storage.objects set metadata = '{"size": 1000}'::jsonb
  where bucket_id = 'community' and name = u::text || '/room/huge.pdf';
  if pg_temp.status_of(u) <> 'ok' then raise exception 'FAIL [quota after delete]'; end if;
  checks := checks + 3;

  -- ── Interrupteur ────────────────────────────────────────────────────────
  perform pg_temp.act_as(u);
  begin
    set local role authenticated;
    perform public.admin_set_media_uploads(false, 'test');
    raise exception 'FAIL [non-admin switched uploads off]';
  exception when insufficient_privilege then
    null;
  end;
  reset role;
  perform pg_temp.act_as(boss);
  set local role authenticated;
  perform public.admin_set_media_uploads(false, 'Quota egress : test');
  reset role;
  if pg_temp.status_of(u) <> 'disabled' then raise exception 'FAIL [switch off not applied]'; end if;
  if pg_temp.try_upload(u, 'avatars', 'avatars/new.jpg', 1000) then raise exception 'FAIL [avatar upload while off]'; end if;
  if pg_temp.try_upload(other, 'dm', 'doc.pdf', 1000) then raise exception 'FAIL [file upload while off]'; end if;
  perform pg_temp.act_as(boss);
  set local role authenticated;
  select enabled::text into st from public.admin_media_uploads_state();
  reset role;
  if st <> 'false' then raise exception 'FAIL [admin state]'; end if;
  if not exists (select 1 from public.admin_audit_log where actor_id = boss and action = 'media_uploads_disabled' and reason = 'Quota egress : test') then
    raise exception 'FAIL [audit log]';
  end if;
  -- Le cœur de l'app n'est pas concerné : une session s'enregistre toujours.
  perform pg_temp.act_as(u);
  insert into public.sessions (user_id, duration_seconds, started_at, ended_at, timezone)
  values (u, 600, now() - interval '20 minutes', now() - interval '10 minutes', 'Europe/Brussels');
  perform pg_temp.act_as(boss);
  set local role authenticated;
  perform public.admin_set_media_uploads(true, null);
  reset role;
  if pg_temp.status_of(u) <> 'ok' or not pg_temp.try_upload(u, 'dm', 'back.jpg', 1000) then
    raise exception 'FAIL [switch back on]';
  end if;
  checks := checks + 6;

  -- ── Surface d'API ───────────────────────────────────────────────────────
  if has_table_privilege('authenticated', 'public.app_runtime_flags', 'select')
     or has_table_privilege('anon', 'public.app_runtime_flags', 'select')
     or has_function_privilege('anon', 'public.media_upload_status()', 'execute')
     or has_function_privilege('authenticated', 'public.post_files_older_than(timestamptz, integer)', 'execute')
     or not has_function_privilege('service_role', 'public.post_files_older_than(timestamptz, integer)', 'execute') then
    raise exception 'FAIL [API surface]';
  end if;
  checks := checks + 1;

  -- Aucun membre réel n'est bloqué aujourd'hui (rythme ou volume).
  select count(*) into real_blocked from (
    select split_part(o.name, '/', 1) as owner_folder,
           count(*) filter (where o.created_at > now() - interval '1 hour') as recent,
           sum(coalesce((o.metadata->>'size')::bigint, 0)) as bytes
    from storage.objects o
    where o.bucket_id in ('avatars', 'posts', 'dm', 'community', 'group')
      and not (split_part(o.name, '/', 1) in (u::text, other::text, boss::text))
    group by 1
  ) x where x.recent >= 30 or x.bytes >= 104857600;
  if real_blocked <> 0 then raise exception 'FAIL [% real members would be blocked]', real_blocked; end if;
  checks := checks + 1;

  raise exception 'MEDIA GUARDRAILS TESTS PASSED: % checks (everything rolled back)', checks;
end
$tests$;
