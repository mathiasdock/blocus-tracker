-- Plafond global de 700 Mo des fichiers Blocus (v83), sur la vraie base.
-- Comptes et lignes jetables (aucun contenu dans le stockage), exception
-- finale : RIEN n'est gardé. Résultat attendu : « MEDIA GLOBAL CAP TESTS PASSED ».

create function pg_temp.act_as(u uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', u::text, true);
end $$;

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
  a uuid := gen_random_uuid();
  b uuid := gen_random_uuid();
  boss uuid := gen_random_uuid();
  real_bytes bigint;
  with_expose bigint;
  checks integer := 0;
  st record;
begin
  -- Seuls les 5 buckets de Blocus comptent : Expose est à part.
  real_bytes := public.media_blocus_bytes();
  select coalesce(sum((metadata->>'size')::bigint), 0) into with_expose
  from storage.objects where bucket_id in ('avatars', 'posts', 'dm', 'community', 'group', 'exposed-photos');
  if real_bytes >= with_expose or real_bytes >= 734003200 then
    raise exception 'FAIL [scope % vs %]', real_bytes, with_expose;
  end if;
  checks := checks + 1;

  insert into auth.users (id, email, created_at, raw_user_meta_data)
  select x.id, 'cap-' || suffix || '-' || x.n || '@example.invalid', now(),
         jsonb_build_object('pseudo', 'cap' || suffix || x.n, 'study_year', 'BAC 1')
  from (values (a, 1), (b, 2), (boss, 3)) x(id, n);
  perform set_config('blocus.privileged_change', 'on', true);
  update public.profiles set is_admin = true where id = boss;
  perform set_config('blocus.privileged_change', '', true);

  if pg_temp.status_of(b) <> 'ok' then raise exception 'FAIL [status below cap]'; end if;
  checks := checks + 1;

  -- Remplissage jusqu'au plafond (une seule ligne, posée par le serveur) :
  -- plus personne ne peut envoyer, même un membre sous son propre quota.
  insert into storage.objects (bucket_id, name, owner, owner_id, metadata, created_at)
  values ('group', a::text || '/filler.bin', a, a::text,
          jsonb_build_object('size', 734003200 - real_bytes), now() - interval '2 hours');
  if public.media_blocus_bytes() <> 734003200 then raise exception 'FAIL [sum]'; end if;
  if pg_temp.status_of(b) <> 'storage_full' then raise exception 'FAIL [cap not enforced: %]', pg_temp.status_of(b); end if;
  if pg_temp.try_upload(b, 'dm', 'photo.jpg', 1000) then raise exception 'FAIL [upload over global cap]'; end if;
  if pg_temp.try_upload(b, 'avatars', 'avatars/new.jpg', 1000) then raise exception 'FAIL [avatar over global cap]'; end if;
  checks := checks + 3;

  -- Le cœur de l'app continue : une session s'enregistre.
  perform pg_temp.act_as(b);
  insert into public.sessions (user_id, duration_seconds, started_at, ended_at, timezone)
  values (b, 600, now() - interval '20 minutes', now() - interval '10 minutes', 'Europe/Brussels');
  checks := checks + 1;

  -- Aucune règle restrictive sur la suppression : on peut toujours libérer.
  if exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects'
             and permissive = 'RESTRICTIVE' and cmd in ('DELETE', 'ALL')) then
    raise exception 'FAIL [a restrictive policy blocks deletions]';
  end if;
  checks := checks + 1;

  -- L'admin voit l'espace utilisé et le plafond ; l'interrupteur reste prioritaire.
  perform pg_temp.act_as(boss);
  set local role authenticated;
  select * into st from public.admin_media_uploads_state();
  perform public.admin_set_media_uploads(false, 'test');
  reset role;
  if st.used_bytes <> 734003200 or st.cap_bytes <> 734003200 then raise exception 'FAIL [admin usage %]', to_jsonb(st); end if;
  if pg_temp.status_of(b) <> 'disabled' then raise exception 'FAIL [switch not first]'; end if;
  perform pg_temp.act_as(boss);
  set local role authenticated;
  perform public.admin_set_media_uploads(true, null);
  reset role;
  checks := checks + 2;

  -- De la place libérée (fichier réduit : Storage interdit la suppression SQL) :
  -- les envois reprennent.
  update storage.objects set metadata = '{"size": 1000}'::jsonb
  where bucket_id = 'group' and name = a::text || '/filler.bin';
  if pg_temp.status_of(b) <> 'ok' or not pg_temp.try_upload(b, 'dm', 'photo.jpg', 1000) then
    raise exception 'FAIL [uploads do not resume]';
  end if;
  checks := checks + 1;

  -- Surface d'API : la somme n'est pas exposée aux membres.
  if has_function_privilege('authenticated', 'public.media_blocus_bytes()', 'execute')
     or has_function_privilege('anon', 'public.media_blocus_bytes()', 'execute') then
    raise exception 'FAIL [API surface]';
  end if;
  checks := checks + 1;

  raise exception 'MEDIA GLOBAL CAP TESTS PASSED: % checks (everything rolled back)', checks;
end
$tests$;
