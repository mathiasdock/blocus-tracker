-- Notifications V1 (v63) : déclencheurs sociaux et plafond des relances,
-- sur la vraie base. Crée des étudiants jetables, exerce les déclencheurs
-- comme l'app (rôle authenticated), lit ce que pg_net AURAIT envoyé, puis
-- lève une exception : RIEN n'est gardé, et pg_net n'envoie jamais une
-- requête d'une transaction annulée.
--
-- À lancer après v63, ou dans le MÊME appel execute_sql juste après son SQL.
-- Résultat attendu : « NOTIFICATION V1 TESTS PASSED ».

do $tests$
declare
  suffix constant text := substr(md5(clock_timestamp()::text), 1, 8);
  u uuid[] := array(select gen_random_uuid() from generate_series(1, 3));
  checks integer := 0;
  n integer;
  v_before bigint;
  v_friendship uuid;
  v_message uuid;
  v_body jsonb;
  v_text text;
begin
  insert into auth.users (id, email, created_at, raw_user_meta_data)
  select u[i], 'notif-v1-' || suffix || '-' || i || '@example.invalid', now() - interval '5 days',
    jsonb_build_object('pseudo', 'nv' || suffix || i, 'study_year', 'BAC 1')
  from generate_series(1, 3) as i;

  -- ── Demande envoyée puis acceptée ──────────────────────────────────────
  perform set_config('request.jwt.claims', json_build_object('sub', u[1], 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', u[1]::text, true);
  set local role authenticated;
  insert into public.friendships (requester, addressee, status) values (u[1], u[2], 'pending') returning id into v_friendship;
  reset role;

  select coalesce(max(id), 0) into v_before from net.http_request_queue;
  perform set_config('request.jwt.claims', json_build_object('sub', u[2], 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', u[2]::text, true);
  set local role authenticated;
  update public.friendships set status = 'accepted' where id = v_friendship;
  reset role;
  select count(*) into n from net.http_request_queue where id > v_before;
  if n <> 1 then raise exception 'FAIL [accepting a request queued % calls instead of 1]', n; end if;
  select convert_from(q.body, 'UTF8')::jsonb into v_body from net.http_request_queue q where q.id > v_before;
  if v_body->>'type' <> 'friend_accepted' or v_body->>'friendship_id' <> v_friendship::text
     or (select count(*) from jsonb_object_keys(v_body)) <> 2 then
    raise exception 'FAIL [the accepted call carries more than its type and id: %]', v_body;
  end if;
  checks := checks + 2;

  -- Même statut réécrit : rien.
  select coalesce(max(id), 0) into v_before from net.http_request_queue;
  set local role authenticated;
  update public.friendships set status = 'accepted' where id = v_friendship;
  reset role;
  select count(*) into n from net.http_request_queue where id > v_before;
  if n <> 0 then raise exception 'FAIL [an update without a status change queued a push]'; end if;
  checks := checks + 1;

  -- ── Message privé : l'identifiant seulement ─────────────────────────────
  select coalesce(max(id), 0) into v_before from net.http_request_queue;
  perform set_config('request.jwt.claims', json_build_object('sub', u[1], 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', u[1]::text, true);
  set local role authenticated;
  insert into public.private_messages (sender_id, receiver_id, content)
  values (u[1], u[2], 'secret-content-' || suffix) returning id into v_message;
  reset role;
  select count(*) into n from net.http_request_queue where id > v_before;
  if n <> 1 then raise exception 'FAIL [a private message queued % calls instead of 1]', n; end if;
  select convert_from(q.body, 'UTF8') into v_text from net.http_request_queue q where q.id > v_before;
  v_body := v_text::jsonb;
  if v_body->>'type' <> 'private_message' or v_body->>'message_id' <> v_message::text
     or (select count(*) from jsonb_object_keys(v_body)) <> 2 then
    raise exception 'FAIL [the message call carries more than its type and id]';
  end if;
  if position('secret-content' in v_text) > 0 then
    raise exception 'FAIL [the message content left the database]';
  end if;
  if not exists (select 1 from net.http_request_queue q where q.id > v_before
                 and q.url = 'https://www.blocus-tracker.com/api/push/notify'
                 and char_length(q.headers->>'x-webhook-secret') >= 64) then
    raise exception 'FAIL [the call does not carry the Vault secret to the notify route]';
  end if;
  checks := checks + 3;

  -- Un non-ami ne peut toujours pas écrire (règle existante inchangée).
  perform set_config('request.jwt.claims', json_build_object('sub', u[3], 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', u[3]::text, true);
  set local role authenticated;
  begin
    insert into public.private_messages (sender_id, receiver_id, content) values (u[3], u[1], 'hello');
    raise exception 'FAIL [a stranger sent a private message]';
  exception when insufficient_privilege then checks := checks + 1;
  end;
  reset role;

  -- ── Droits ──────────────────────────────────────────────────────────────
  if has_function_privilege('authenticated', 'public.push_webhook_call(jsonb)', 'EXECUTE')
     or has_function_privilege('anon', 'public.push_webhook_call(jsonb)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.notify_private_message_push()', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.notify_friend_accepted_push()', 'EXECUTE') then
    raise exception 'FAIL [a client role can call a push trigger function]';
  end if;
  checks := checks + 1;

  -- ── Plafond des relances ────────────────────────────────────────────────
  if (select reminders_weekly_cap from public.notification_settings where id) > 2 then
    raise exception 'FAIL [the nudge cap is above 2]';
  end if;
  begin
    update public.notification_settings set reminders_weekly_cap = 3 where id;
    raise exception 'FAIL [a cap of 3 nudges was accepted]';
  exception when check_violation then checks := checks + 1;
  end;
  checks := checks + 1;

  raise exception 'NOTIFICATION V1 TESTS PASSED: % checks (everything rolled back)', checks;
end;
$tests$;
