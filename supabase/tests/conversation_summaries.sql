-- Liste des conversations en une requête (v82), sur la vraie base. Comptes
-- jetables, exception finale : RIEN n'est gardé.
-- Résultat attendu : « CONVERSATION SUMMARIES TESTS PASSED ».

create function pg_temp.act_as(u uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', u::text, true);
end $$;

-- Le limiteur d'envoi impose created_at = now() à l'insertion : la date voulue
-- est posée juste après, pour ordonner les messages dans une même transaction.
create function pg_temp.say(sender uuid, receiver uuid, body text, at timestamptz, is_read boolean default false)
returns void language plpgsql as $$
declare v_id uuid;
begin
  perform pg_temp.act_as(sender);
  insert into public.private_messages (sender_id, receiver_id, content, read)
  values (sender, receiver, body, is_read)
  returning id into v_id;
  update public.private_messages set created_at = at where id = v_id;
end $$;

create function pg_temp.conversations(viewer uuid) returns jsonb language plpgsql as $$
declare res jsonb;
begin
  perform pg_temp.act_as(viewer);
  set local role authenticated;
  select coalesce(jsonb_agg(to_jsonb(c) order by c.other_id), '[]'::jsonb) into res from public.get_my_conversations() c;
  reset role;
  return res;
end $$;

do $tests$
declare
  suffix constant text := substr(md5(clock_timestamp()::text), 1, 8);
  a uuid := gen_random_uuid();
  b uuid := gen_random_uuid();
  c uuid := gen_random_uuid();
  res jsonb;
  row_ab jsonb;
  checks integer := 0;
begin
  insert into auth.users (id, email, created_at, raw_user_meta_data)
  select x.id, 'conv-' || suffix || '-' || x.n || '@example.invalid', now(),
         jsonb_build_object('pseudo', 'cv' || suffix || x.n, 'study_year', 'BAC 1')
  from (values (a, 1), (b, 2), (c, 3)) x(id, n);

  perform pg_temp.say(a, b, 'salut', now() - interval '3 hours', true);
  perform pg_temp.say(a, b, 'tu viens ?', now() - interval '2 hours');
  perform pg_temp.say(b, a, repeat('x', 300), now() - interval '1 hour');
  perform pg_temp.say(b, a, 'ok', now() - interval '30 minutes');
  perform pg_temp.say(c, b, 'hello', now() - interval '10 minutes');

  -- a : une conversation (b), dernier message = « ok » de b, 2 non lus de b.
  res := pg_temp.conversations(a);
  if jsonb_array_length(res) <> 1 then raise exception 'FAIL [a sees % conversations]', res; end if;
  row_ab := res->0;
  if (row_ab->>'other_id')::uuid <> b or row_ab->>'last_content' <> 'ok'
     or (row_ab->>'last_sender_id')::uuid <> b or (row_ab->>'unread_count')::int <> 2 then
    raise exception 'FAIL [a/b summary %]', row_ab;
  end if;
  checks := checks + 2;

  -- b : deux conversations ; de a, 1 non lu (le premier était lu).
  res := pg_temp.conversations(b);
  if jsonb_array_length(res) <> 2 then raise exception 'FAIL [b sees %]', res; end if;
  if (select (x->>'unread_count')::int from jsonb_array_elements(res) x where (x->>'other_id')::uuid = a) <> 1
     or (select (x->>'unread_count')::int from jsonb_array_elements(res) x where (x->>'other_id')::uuid = c) <> 1 then
    raise exception 'FAIL [b unread %]', res;
  end if;
  checks := checks + 2;

  -- c ne voit que sa propre conversation : rien de a ↔ b.
  res := pg_temp.conversations(c);
  if jsonb_array_length(res) <> 1 or (res->0->>'other_id')::uuid <> b then
    raise exception 'FAIL [c sees someone else''s conversation %]', res;
  end if;
  checks := checks + 1;

  -- Aperçu tronqué à 160 caractères.
  perform pg_temp.say(b, a, repeat('y', 500), now());
  res := pg_temp.conversations(a);
  if char_length(res->0->>'last_content') <> 160 then raise exception 'FAIL [preview length]'; end if;
  checks := checks + 1;

  -- Sans connexion : rien. Inaccessible au rôle anonyme.
  perform set_config('request.jwt.claims', '', true);
  perform set_config('request.jwt.claim.sub', '', true);
  if exists (select 1 from public.get_my_conversations()) then raise exception 'FAIL [no uid returns rows]'; end if;
  if has_function_privilege('anon', 'public.get_my_conversations()', 'execute') then raise exception 'FAIL [anon can call]'; end if;
  checks := checks + 2;

  raise exception 'CONVERSATION SUMMARIES TESTS PASSED: % checks (everything rolled back)', checks;
end
$tests$;
