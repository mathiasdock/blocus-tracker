-- Notifications (v62) : matrice de sécurité et de règles, sur la vraie base.
--
-- Crée des étudiants jetables (un membre, un auteur qu'il bloque, un suspendu,
-- un admin, un membre qui a tout coupé, un compte à supprimer), exerce les
-- préférences, le filtre d'audience, l'anti-doublon, le registre des
-- appareils, les annonces datées/ciblées, le blocage des demandes d'ami, le
-- secret du webhook et le nettoyage OneSignal — puis lève une exception pour
-- que RIEN ne soit gardé.
--
-- À lancer après v62 (et v62_1), ou dans le MÊME appel execute_sql juste
-- après leur SQL, comme essai à blanc (un appel = une transaction).
--
-- Résultat attendu : une erreur dont le message commence par
-- « NOTIFICATION TESTS PASSED ». Tout message « FAIL » nomme la règle cassée.

do $tests$
declare
  suffix constant text := substr(md5(clock_timestamp()::text), 1, 8);
  uni constant text := 'zz-notif-uni-' || suffix;
  -- u1 = M (membre)  u2 = B (bloqué par M)  u3 = S (suspendu)
  -- u4 = A (admin)   u5 = O (a tout coupé)  u6 = D (compte supprimé)
  u uuid[] := array(select gen_random_uuid() from generate_series(1, 6));
  ghost constant uuid := gen_random_uuid();
  k1 constant uuid := gen_random_uuid();
  checks integer := 0;
  n integer;
  r record;
  v_json jsonb;
  v_text text;
  v_bool boolean;
  v_send uuid;
  v_send2 uuid;
  v_send3 uuid;
  v_ids uuid[];
  v_ann_now uuid;
  v_ann_future uuid;
  v_ann_past uuid;
  v_ann_uni uuid;
  existing_visible integer;
begin
  -- ── Fixtures ────────────────────────────────────────────────────────────
  insert into auth.users (id, email, created_at, raw_user_meta_data)
  select u[i], 'notif-' || suffix || '-' || i || '@example.invalid', now() - interval '5 days',
    jsonb_build_object('pseudo', 'nt' || suffix || i, 'study_year', 'BAC 1')
  from generate_series(1, 6) as i;

  v_json := public.set_admin_role(u[4], true, 'notification test fixture');
  update public.profiles set university = uni where id in (u[1], u[2]);

  insert into public.user_privacy_settings (user_id, push_enabled)
  values (u[5], false)
  on conflict (user_id) do update set push_enabled = false;

  v_json := public.admin_set_suspension(u[4], u[3], true, 'notification test suspension');

  -- ── 1. Préférences ──────────────────────────────────────────────────────
  if not exists (select 1 from public.user_privacy_settings where user_id = u[1] and push_enabled and push_social)
     and exists (select 1 from public.user_privacy_settings where user_id = u[1]) then
    raise exception 'FAIL [new preference columns are not on by default]';
  end if;
  checks := checks + 1;

  select count(*) into n from public.push_opted_out_users('social') where user_id = u[5];
  if n <> 1 then raise exception 'FAIL [the general switch does not opt out of social]'; end if;
  select count(*) into n from public.push_opted_out_users('reminders') where user_id = u[5];
  if n <> 1 then raise exception 'FAIL [the general switch does not opt out of reminders]'; end if;
  select count(*) into n from public.push_opted_out_users('announcements') where user_id = u[1];
  if n <> 0 then raise exception 'FAIL [a member with default preferences is opted out]'; end if;
  checks := checks + 3;

  -- ── 2. Audience : raisons d'exclusion ──────────────────────────────────
  for r in
    select * from public.notification_audience('announcement', 'users', null, array[u[1], u[2], u[3], u[5], ghost], null)
  loop
    if r.user_id = u[1] and r.reason is not null then raise exception 'FAIL [an eligible member was excluded: %]', r.reason; end if;
    if r.user_id = u[3] and r.reason is distinct from 'suspended' then raise exception 'FAIL [a suspended member was not excluded]'; end if;
    if r.user_id = u[5] and r.reason is distinct from 'general_off' then raise exception 'FAIL [the general switch was ignored]'; end if;
    if r.user_id = ghost and r.reason is distinct from 'missing' then raise exception 'FAIL [an unknown account was not excluded]'; end if;
    checks := checks + 1;
  end loop;

  insert into public.user_privacy_settings (user_id, push_reminders)
  values (u[1], false)
  on conflict (user_id) do update set push_reminders = false;
  select reason into v_text from public.notification_audience('reminder', 'users', null, array[u[1]], null);
  if v_text is distinct from 'category_off' then raise exception 'FAIL [the reminders preference was ignored]'; end if;
  select reason into v_text from public.notification_audience('announcement', 'users', null, array[u[1]], null);
  if v_text is not null then raise exception 'FAIL [a reminders refusal blocked an announcement]'; end if;
  update public.user_privacy_settings set push_reminders = true where user_id = u[1];
  checks := checks + 2;

  -- Un envoi de contrôle ignore les préférences, jamais la suspension.
  select reason into v_text from public.notification_audience('test', 'self', null, array[u[5]], null);
  if v_text is not null then raise exception 'FAIL [a self test was blocked by preferences]'; end if;
  select reason into v_text from public.notification_audience('test', 'self', null, array[u[3]], null);
  if v_text is distinct from 'suspended' then raise exception 'FAIL [a self test reached a suspended account]'; end if;
  checks := checks + 2;

  select count(*) into n from public.notification_audience('announcement', 'university', uni, null, null);
  if n <> 2 then raise exception 'FAIL [the university scope returned % members instead of 2]', n; end if;
  select count(*) into n from public.notification_audience('announcement', 'all', null, null, null) where user_id = any(u[1:5]);
  if n <> 5 then raise exception 'FAIL [the all scope missed members]'; end if;
  checks := checks + 2;

  if has_function_privilege('authenticated', 'public.notification_audience(text,text,text,uuid[],uuid)', 'EXECUTE')
     or has_function_privilege('anon', 'public.notification_audience(text,text,text,uuid[],uuid)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.notification_claim(uuid,jsonb)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.notification_mark(uuid,uuid[],text,text,text)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.push_webhook_secret_ok(text)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.push_opted_out_users(text)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.notification_kind_stats(timestamptz)', 'EXECUTE') then
    raise exception 'FAIL [a server-only notification function is callable by a client role]';
  end if;
  if not has_function_privilege('service_role', 'public.notification_audience(text,text,text,uuid[],uuid)', 'EXECUTE')
     or not has_function_privilege('service_role', 'public.notification_claim(uuid,jsonb)', 'EXECUTE')
     or not has_function_privilege('service_role', 'public.push_webhook_secret_ok(text)', 'EXECUTE') then
    raise exception 'FAIL [the server cannot call the notification functions]';
  end if;
  checks := checks + 2;

  -- ── 3. Blocage : pas de demande d'ami, pas de notification ─────────────
  perform set_config('request.jwt.claims', json_build_object('sub', u[1], 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', u[1]::text, true);
  set local role authenticated;
  insert into public.user_blocks (blocker_id, blocked_id) values (u[1], u[2]);
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub', u[2], 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', u[2]::text, true);
  set local role authenticated;
  -- Écartée sans erreur : l'étudiant bloqué ne l'apprend pas.
  insert into public.friendships (requester, addressee, status) values (u[2], u[1], 'pending');
  insert into public.friendships (requester, addressee, status) values (u[2], u[5], 'pending');
  reset role;
  if exists (select 1 from public.friendships where requester = u[2] and addressee = u[1]) then
    raise exception 'FAIL [a blocked student sent a friend request]';
  end if;
  if not exists (select 1 from public.friendships where requester = u[2] and addressee = u[5]) then
    raise exception 'FAIL [an ordinary friend request was dropped]';
  end if;
  checks := checks + 2;

  select reason into v_text from public.notification_audience('social', 'users', null, array[u[1]], u[2]);
  if v_text is distinct from 'blocked' then raise exception 'FAIL [a notification from a blocked author was allowed]'; end if;
  select reason into v_text from public.notification_audience('social', 'users', null, array[u[1]], u[4]);
  if v_text is not null then raise exception 'FAIL [a block leaked to another author]'; end if;
  checks := checks + 2;

  -- ── 4. Appareils ────────────────────────────────────────────────────────
  perform set_config('request.jwt.claims', json_build_object('sub', u[1], 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', u[1]::text, true);
  set local role authenticated;
  perform public.push_device_report(k1, 'active', 'ios', true);
  select count(*) into n from public.push_devices where device_key = k1;
  if n <> 1 then raise exception 'FAIL [a member cannot read their own device]'; end if;
  begin
    perform public.push_device_report(k1, 'enabled', 'ios', true);
    raise exception 'FAIL [an unknown device status was accepted]';
  exception when invalid_parameter_value then checks := checks + 1;
  end;
  reset role;
  select devices into n from public.notification_audience('announcement', 'users', null, array[u[1]], null);
  if n <> 1 then raise exception 'FAIL [a reported device is not counted as reachable]'; end if;
  checks := checks + 2;

  -- Même appareil, autre compte : il ne compte plus que pour ce dernier.
  perform set_config('request.jwt.claims', json_build_object('sub', u[2], 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', u[2]::text, true);
  set local role authenticated;
  perform public.push_device_report(k1, 'active', 'ios', true);
  select count(*) into n from public.push_devices;
  if n <> 1 then raise exception 'FAIL [a member can read another member''s devices]'; end if;
  reset role;
  if (select status from public.push_devices where user_id = u[1] and device_key = k1) <> 'detached' then
    raise exception 'FAIL [a device that switched account still counts for the previous one]';
  end if;
  checks := checks + 2;

  -- Déconnexion : l'appareil se détache.
  perform set_config('request.jwt.claims', json_build_object('sub', u[2], 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', u[2]::text, true);
  set local role authenticated;
  perform public.push_device_report(k1, 'detached', 'ios', true);
  reset role;
  select devices into n from public.notification_audience('announcement', 'users', null, array[u[2]], null);
  if n <> 0 then raise exception 'FAIL [a detached device still counts]'; end if;
  checks := checks + 1;

  perform set_config('request.jwt.claims', json_build_object('sub', u[3], 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', u[3]::text, true);
  set local role authenticated;
  begin
    perform public.push_device_report(gen_random_uuid(), 'active', 'android', false);
    raise exception 'FAIL [a suspended account registered a device]';
  exception when insufficient_privilege then checks := checks + 1;
  end;
  reset role;

  perform set_config('request.jwt.claims', '', true);
  perform set_config('request.jwt.claim.sub', '', true);
  set local role anon;
  begin
    perform public.push_device_report(gen_random_uuid(), 'active', 'android', false);
    raise exception 'FAIL [an anonymous visitor registered a device]';
  exception when insufficient_privilege then checks := checks + 1;
  end;
  reset role;

  -- ── 5. Registre et anti-doublon ─────────────────────────────────────────
  insert into public.notification_sends (source, category, kind, trigger, target_type, title, body)
  values ('automation', 'reminder', 'streak_at_risk', 'cron:push_daily', 'automation', '{"fr":"t"}', '{"fr":"b"}')
  returning id into v_send;
  select array_agg(c.user_id) into v_ids from public.notification_claim(v_send, jsonb_build_array(
    jsonb_build_object('user_id', u[1], 'key', 'reminder:2026-01-01:' || u[1], 'lang', 'fr'),
    jsonb_build_object('user_id', u[2], 'key', 'reminder:2026-01-01:' || u[2], 'lang', 'en'),
    jsonb_build_object('user_id', ghost, 'key', 'reminder:2026-01-01:' || ghost)
  )) c;
  if coalesce(cardinality(v_ids), 0) <> 2 then raise exception 'FAIL [the first claim reserved % recipients instead of 2]', coalesce(cardinality(v_ids), 0); end if;
  checks := checks + 1;

  insert into public.notification_sends (source, category, kind, trigger, target_type, title, body)
  values ('automation', 'reminder', 'nudge_study', 'cron:push_daily', 'automation', '{"fr":"t"}', '{"fr":"b"}')
  returning id into v_send2;
  select count(*) into n from public.notification_claim(v_send2, jsonb_build_array(
    jsonb_build_object('user_id', u[1], 'key', 'reminder:2026-01-01:' || u[1]),
    jsonb_build_object('user_id', u[2], 'key', 'reminder:2026-01-01:' || u[2])
  ));
  if n <> 0 then raise exception 'FAIL [the same reminder was reserved twice for the same day]'; end if;
  checks := checks + 1;

  perform public.notification_mark(v_send, array[u[1]], 'failed', null, 'onesignal_unavailable');
  perform public.notification_mark(v_send, array[u[2]], 'sent', 'os-1', null);
  insert into public.notification_sends (source, category, kind, trigger, target_type, title, body)
  values ('automation', 'reminder', 'streak_at_risk', 'cron:push_daily', 'automation', '{"fr":"t"}', '{"fr":"b"}')
  returning id into v_send3;
  select array_agg(c.user_id) into v_ids from public.notification_claim(v_send3, jsonb_build_array(
    jsonb_build_object('user_id', u[1], 'key', 'reminder:2026-01-01:' || u[1]),
    jsonb_build_object('user_id', u[2], 'key', 'reminder:2026-01-01:' || u[2])
  )) c;
  if v_ids is distinct from array[u[1]] then
    raise exception 'FAIL [a failed reminder could not be retried, or a sent one was re-sent]';
  end if;
  perform public.notification_mark(v_send3, array[u[1]], 'sent', 'os-2', null);
  checks := checks + 1;

  select recent_reminders into n from public.notification_audience('reminder', 'users', null, array[u[1]], null);
  if n <> 1 then raise exception 'FAIL [a sent reminder is not counted for the weekly cap (%)]', n; end if;
  insert into public.notification_sends (source, category, kind, trigger, target_type, title, body)
  values ('automation', 'reminder', 'exam_tomorrow', 'cron:push_daily', 'automation', '{"fr":"t"}', '{"fr":"b"}')
  returning id into v_send2;
  perform public.notification_claim(v_send2, jsonb_build_array(jsonb_build_object('user_id', u[1], 'key', 'exam-test-' || suffix)));
  perform public.notification_mark(v_send2, array[u[1]], 'sent', 'os-3', null);
  select recent_reminders into n from public.notification_audience('reminder', 'users', null, array[u[1]], null);
  if n <> 1 then raise exception 'FAIL [an exam reminder counted toward the weekly cap]'; end if;
  checks := checks + 2;

  select count(*) into n from public.notification_kind_stats(now() - interval '1 hour') where kind = 'streak_at_risk';
  if n <> 1 then raise exception 'FAIL [kind statistics are missing]'; end if;
  checks := checks + 1;

  -- Un membre relit ses propres envois, jamais ceux des autres ni le registre.
  perform set_config('request.jwt.claims', json_build_object('sub', u[2], 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', u[2]::text, true);
  set local role authenticated;
  select count(*) into n from public.notification_recipients;
  if n <> 1 then raise exception 'FAIL [a member sees % notification rows instead of their own]', n; end if;
  begin
    select count(*) into n from public.notification_sends;
    raise exception 'FAIL [a member can read the send registry]';
  exception when insufficient_privilege then checks := checks + 1;
  end;
  begin
    select count(*) into n from public.notification_settings;
    raise exception 'FAIL [a member can read notification settings]';
  exception when insufficient_privilege then checks := checks + 1;
  end;
  begin
    select count(*) into n from public.push_identity_cleanup;
    raise exception 'FAIL [a member can read the OneSignal cleanup queue]';
  exception when insufficient_privilege then checks := checks + 1;
  end;
  begin
    v_json := public.admin_notification_sends(null, null, null, null, 10, 0);
    raise exception 'FAIL [a member read the admin notification history]';
  exception when insufficient_privilege then checks := checks + 1;
  end;
  begin
    v_json := public.admin_member_notifications(u[1]);
    raise exception 'FAIL [a member read another member''s notification state]';
  exception when insufficient_privilege then checks := checks + 1;
  end;
  reset role;
  checks := checks + 1;

  -- L'admin, lui, lit l'historique et l'état d'un membre.
  perform set_config('request.jwt.claims', json_build_object('sub', u[4], 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', u[4]::text, true);
  set local role authenticated;
  v_json := public.admin_notification_sends('automation', now() - interval '1 hour', null, null, 10, 0);
  if (v_json->>'total')::integer < 4 then raise exception 'FAIL [the admin history misses sends]'; end if;
  v_json := public.admin_member_notifications(u[5]);
  if (v_json->'prefs'->>'push_enabled')::boolean is not false then
    raise exception 'FAIL [the member notification state does not show the general switch]';
  end if;
  v_json := public.admin_member_notifications(u[1]);
  if jsonb_array_length(v_json->'recent') < 2 or jsonb_array_length(v_json->'devices') <> 1 then
    raise exception 'FAIL [the member notification state misses sends or devices]';
  end if;
  if not public.is_current_user_admin() then raise exception 'FAIL [the admin is not recognised]'; end if;
  reset role;
  checks := checks + 4;

  if position('not locked' in pg_get_functiondef('public.is_current_user_admin()'::regprocedure)) = 0 then
    raise exception 'FAIL [a suspended admin would still pass is_current_user_admin]';
  end if;
  checks := checks + 1;

  -- ── 6. Annonces datées et ciblées ───────────────────────────────────────
  perform set_config('request.jwt.claims', json_build_object('sub', u[1], 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', u[1]::text, true);
  set local role authenticated;
  select count(*) into existing_visible from public.app_announcements;
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub', u[4], 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', u[4]::text, true);
  set local role authenticated;
  insert into public.app_announcements (title, message, title_en, message_en, created_by)
  values ('Maintenant ' || suffix, 'Message', 'Now', 'Message EN', u[4]) returning id into v_ann_now;
  insert into public.app_announcements (title, message, starts_at, created_by)
  values ('Plus tard ' || suffix, 'Message', now() + interval '2 days', u[4]) returning id into v_ann_future;
  insert into public.app_announcements (title, message, ends_at, created_by)
  values ('Expirée ' || suffix, 'Message', now() - interval '1 minute', u[4]) returning id into v_ann_past;
  insert into public.app_announcements (title, message, audience, audience_university, created_by)
  values ('École ' || suffix, 'Message', 'university', uni, u[4]) returning id into v_ann_uni;
  begin
    insert into public.app_announcements (title, message, audience, created_by)
    values ('Sans école', 'Message', 'university', u[4]);
    raise exception 'FAIL [a university announcement without a university was accepted]';
  exception when check_violation then checks := checks + 1;
  end;
  select count(*) into n from public.app_announcements where id in (v_ann_now, v_ann_future, v_ann_past, v_ann_uni);
  if n <> 4 then raise exception 'FAIL [the admin does not see every announcement]'; end if;
  reset role;
  checks := checks + 1;

  perform set_config('request.jwt.claims', json_build_object('sub', u[1], 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', u[1]::text, true);
  set local role authenticated;
  select array_agg(id) into v_ids from public.app_announcements where id in (v_ann_now, v_ann_future, v_ann_past, v_ann_uni);
  if not (v_ids @> array[v_ann_now, v_ann_uni]) or v_ids && array[v_ann_future, v_ann_past] then
    raise exception 'FAIL [announcement dates or school targeting are not applied]';
  end if;
  select count(*) into n from public.app_announcements where id not in (v_ann_now, v_ann_uni);
  if n <> existing_visible then raise exception 'FAIL [the visibility of existing announcements changed]'; end if;
  reset role;
  checks := checks + 2;

  perform set_config('request.jwt.claims', json_build_object('sub', u[5], 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', u[5]::text, true);
  set local role authenticated;
  select count(*) into n from public.app_announcements where id = v_ann_uni;
  if n <> 0 then raise exception 'FAIL [a school announcement reached another school]'; end if;
  reset role;
  checks := checks + 1;

  -- ── 7. Secret du webhook ────────────────────────────────────────────────
  if public.push_webhook_secret_ok('wrong-secret-wrong-secret-wrong-secret-00') then
    raise exception 'FAIL [a wrong webhook secret was accepted]';
  end if;
  if public.push_webhook_secret_ok('short') or public.push_webhook_secret_ok(null) then
    raise exception 'FAIL [a short or empty webhook secret was accepted]';
  end if;
  select public.push_webhook_secret_ok(ds.decrypted_secret) into v_bool
  from vault.decrypted_secrets ds where ds.name = 'push_webhook_secret';
  if v_bool is not true then raise exception 'FAIL [the real webhook secret is refused]'; end if;
  select char_length(ds.decrypted_secret) into n from vault.decrypted_secrets ds where ds.name = 'push_webhook_secret';
  if n < 64 then raise exception 'FAIL [the webhook secret is weaker than 256 bits]'; end if;
  checks := checks + 4;

  -- ── 8. Compte supprimé → nettoyage OneSignal en file, traces effacées ──
  perform set_config('request.jwt.claims', json_build_object('sub', u[6], 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', u[6]::text, true);
  set local role authenticated;
  perform public.push_device_report(gen_random_uuid(), 'active', 'android', false);
  reset role;
  perform set_config('request.jwt.claims', '', true);
  perform set_config('request.jwt.claim.sub', '', true);
  select array_agg(c.user_id) into v_ids from public.notification_claim(v_send, jsonb_build_array(
    jsonb_build_object('user_id', u[6], 'key', 'deleted-test-' || suffix)
  )) c;
  delete from auth.users where id = u[6];
  if not exists (select 1 from public.push_identity_cleanup where external_id = u[6]::text) then
    raise exception 'FAIL [a deleted account was not queued for OneSignal cleanup]';
  end if;
  if exists (select 1 from public.push_devices where user_id = u[6])
     or exists (select 1 from public.notification_recipients where user_id = u[6]) then
    raise exception 'FAIL [a deleted account left devices or notification rows behind]';
  end if;
  select reason into v_text from public.notification_audience('announcement', 'users', null, array[u[6]], null);
  if v_text is distinct from 'missing' then raise exception 'FAIL [a deleted account is still targetable]'; end if;
  checks := checks + 3;

  raise exception 'NOTIFICATION TESTS PASSED: % checks (everything rolled back)', checks;
end;
$tests$;
