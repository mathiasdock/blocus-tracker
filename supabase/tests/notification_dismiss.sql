-- Effacer une notification de la cloche (v85), sur la vraie base. Même
-- principe que notification_center.sql : des étudiants jetables, chaque rôle
-- joué comme l'app (authenticated, anon), puis une exception finale — RIEN
-- n'est gardé, et pg_net n'envoie rien depuis une transaction annulée.
--
-- À lancer après v85, ou dans le MÊME appel execute_sql juste après son SQL.
-- Résultat attendu : « NOTIFICATION DISMISS TESTS PASSED ».
-- Les annonces réelles déjà actives sont comptées à part (base) et jamais
-- modifiées.

do $tests$
declare
  suffix constant text := substr(md5(clock_timestamp()::text), 1, 8);
  u uuid[] := array(select gen_random_uuid() from generate_series(1, 5));
  -- u[1] moi · u[2] Léa · u[3] un autre membre · u[4] suspendu · u[5] admin
  checks integer := 0;
  n integer;
  base integer;
  base_unread integer;
  j jsonb;
  v_post uuid;
  v_comment uuid;
  v_req uuid;
  v_ann uuid;
  v_ann_off uuid;
  v_like_late uuid;
  v_cut timestamptz;
  v_ok boolean;
begin
  insert into auth.users (id, email, created_at, raw_user_meta_data)
  select u[i], 'notif-dismiss-' || suffix || '-' || i || '@example.invalid', now() - interval '20 days',
    jsonb_build_object('pseudo', 'nd' || suffix || i, 'study_year', 'BAC 1')
  from generate_series(1, 5) as i;
  update public.profiles set first_name = 'Léa' where id = u[2];

  perform set_config('request.jwt.claims', '', true);
  perform set_config('request.jwt.claim.sub', '', true);
  perform public.set_admin_role(u[5], true, 'notification dismiss test fixture');

  -- Base : annonces réelles que u[1] verra de toute façon.
  perform set_config('request.jwt.claims', json_build_object('sub', u[1], 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', u[1]::text, true);
  set local role authenticated;
  select count(*), count(*) filter (where not is_read) into base, base_unread
  from public.notification_items(now() - interval '60 days');
  insert into public.posts (user_id, caption, visibility) values (u[1], 'Ma session', 'public') returning id into v_post;
  reset role;

  -- ── Écrit par Léa ─────────────────────────────────────────────────────────
  perform set_config('request.jwt.claims', json_build_object('sub', u[2], 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', u[2]::text, true);
  insert into public.friendships (requester, addressee, status) values (u[2], u[1], 'pending') returning id into v_req;
  insert into public.comments (post_id, user_id, content) values (v_post, u[2], 'Bravo !') returning id into v_comment;
  insert into public.private_messages (sender_id, receiver_id, content) values (u[2], u[1], 'secret-one-' || suffix);

  -- ── Puis le propriétaire, sans identité : dates, annonces, suspension ─────
  perform set_config('request.jwt.claims', '', true);
  perform set_config('request.jwt.claim.sub', '', true);
  update public.friendships set created_at = now() - interval '8 minutes' where id = v_req;
  update public.comments set created_at = now() - interval '30 minutes' where id = v_comment;
  update public.private_messages set created_at = now() - interval '5 minutes' where content = 'secret-one-' || suffix;
  insert into public.app_announcements (title, message, type, is_active, created_at)
    values ('Annonce ' || suffix, 'Texte', 'info', true, now() - interval '3 hours') returning id into v_ann;
  insert into public.app_announcements (title, message, type, is_active, created_at)
    values ('Brouillon ' || suffix, 'x', 'info', false, now() - interval '1 hour') returning id into v_ann_off;
  perform public.admin_set_suspension(u[5], u[4], true, 'notification dismiss test fixture');

  -- ── u[1] : 4 notifications à lui, toutes non lues ─────────────────────────
  perform set_config('request.jwt.claims', json_build_object('sub', u[1], 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', u[1]::text, true);
  set local role authenticated;
  select count(*) into n from public.notification_items(now() - interval '60 days')
  where item_key in ('friend_request:' || v_req, 'comment:' || v_comment, 'private_message:' || u[2], 'announcement:' || v_ann)
    and not is_read;
  if n <> 4 then raise exception 'FAIL [fixture: u1 should have 4 unread notifications, has %]', n; end if;
  if (public.notification_summary()->>'bell_unread')::int <> base_unread + 4 then
    raise exception 'FAIL [fixture: bell counter %]', public.notification_summary()->>'bell_unread';
  end if;
  checks := checks + 2;

  -- ── Effacer un commentaire : il quitte la liste ET la pastille ────────────
  v_ok := public.notification_dismiss('comment:' || v_comment);
  if not v_ok then raise exception 'FAIL [dismiss refused a real notification]'; end if;
  select count(*) into n from public.notification_items(now() - interval '60 days') where item_key = 'comment:' || v_comment;
  if n <> 0 then raise exception 'FAIL [a dismissed comment is still in the bell]'; end if;
  j := public.notification_inbox(50);
  if (j->>'unread')::int <> base_unread + 3 or jsonb_array_length(j->'items') <> base + 3 then
    raise exception 'FAIL [inbox after dismiss: % unread, % items]', j->>'unread', jsonb_array_length(j->'items');
  end if;
  if (public.notification_summary()->>'bell_unread')::int <> base_unread + 3 then
    raise exception 'FAIL [the bell counter still counts a dismissed notification]';
  end if;
  -- Rien n'est supprimé à la source.
  reset role;
  if not exists (select 1 from public.comments where id = v_comment) then
    raise exception 'FAIL [dismissing deleted the comment itself]';
  end if;
  checks := checks + 4;

  -- Un deuxième appareil du même compte ne la voit plus non plus.
  perform set_config('request.jwt.claims', json_build_object('sub', u[1], 'role', 'authenticated', 'session_id', gen_random_uuid())::text, true);
  set local role authenticated;
  if exists (select 1 from jsonb_array_elements(public.notification_inbox(50)->'items') e where e->>'key' = 'comment:' || v_comment) then
    raise exception 'FAIL [the second device still shows the dismissed comment]';
  end if;
  checks := checks + 1;

  -- ── Demande d'ami effacée : hors de la cloche, toujours dans Social ───────
  if not public.notification_dismiss('friend_request:' || v_req) then
    raise exception 'FAIL [dismissing a pending request was refused]';
  end if;
  select count(*) into n from public.notification_items(now() - interval '60 days') where item_key = 'friend_request:' || v_req;
  if n <> 0 then raise exception 'FAIL [a dismissed request is still in the bell]'; end if;
  if (public.notification_summary()->>'friend_requests')::int <> 1 then
    raise exception 'FAIL [the Social badge lost the pending request]';
  end if;
  reset role;
  if (select status from public.friendships where id = v_req) <> 'pending' then
    raise exception 'FAIL [dismissing answered the friend request]';
  end if;
  checks := checks + 3;

  -- ── Annonce effacée : chez moi seulement ──────────────────────────────────
  perform set_config('request.jwt.claims', json_build_object('sub', u[1], 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', u[1]::text, true);
  set local role authenticated;
  if not public.notification_dismiss('announcement:' || v_ann) then
    raise exception 'FAIL [dismissing an active announcement was refused]';
  end if;
  if public.notification_dismiss('announcement:' || v_ann_off) then
    raise exception 'FAIL [an inactive announcement was dismissed]';
  end if;
  select count(*) into n from public.notification_items(now() - interval '60 days') where item_key = 'announcement:' || v_ann;
  if n <> 0 then raise exception 'FAIL [a dismissed announcement is still in my bell]'; end if;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', u[3], 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', u[3]::text, true);
  set local role authenticated;
  select count(*) into n from public.notification_items(now() - interval '60 days') where item_key = 'announcement:' || v_ann;
  if n <> 1 then raise exception 'FAIL [my dismissal hid the announcement for another member]'; end if;
  checks := checks + 3;

  -- ── Un autre membre ne touche à rien de u[1] ──────────────────────────────
  if public.notification_dismiss('private_message:' || u[2]) then
    raise exception 'FAIL [another member dismissed a conversation that is not his]';
  end if;
  select count(*) into n from public.notification_dismissals;
  if n <> 0 then raise exception 'FAIL [another member reads % dismissals of someone else]', n; end if;
  begin
    insert into public.notification_dismissals (user_id, item_key) values (u[1], 'private_message:' || u[2]);
    raise exception 'FAIL [a client wrote a dismissal directly]';
  exception when insufficient_privilege then checks := checks + 1;
  end;
  begin
    update public.notification_inbox_state set cleared_before = now();
    raise exception 'FAIL [a client changed a clear cutoff directly]';
  exception when insufficient_privilege then checks := checks + 1;
  end;
  begin
    perform public.notification_dismiss('comment:not-a-uuid');
    raise exception 'FAIL [an invalid key was accepted]';
  exception when invalid_parameter_value then checks := checks + 1;
  end;
  checks := checks + 2;
  reset role;

  -- ── Conversation effacée : un nouveau message de Léa la ramène ────────────
  perform set_config('request.jwt.claims', json_build_object('sub', u[1], 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', u[1]::text, true);
  set local role authenticated;
  if not public.notification_dismiss('private_message:' || u[2]) then
    raise exception 'FAIL [dismissing a conversation was refused]';
  end if;
  select count(*) into n from public.notification_items(now() - interval '60 days') where item_key = 'private_message:' || u[2];
  if n <> 0 then raise exception 'FAIL [a dismissed conversation is still in the bell]'; end if;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', u[2], 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', u[2]::text, true);
  insert into public.private_messages (sender_id, receiver_id, content) values (u[2], u[1], 'secret-two-' || suffix);
  perform set_config('request.jwt.claims', '', true);
  perform set_config('request.jwt.claim.sub', '', true);
  update public.private_messages set created_at = now() + interval '1 second' where content = 'secret-two-' || suffix;
  perform set_config('request.jwt.claims', json_build_object('sub', u[1], 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', u[1]::text, true);
  set local role authenticated;
  select count(*) into n from public.notification_items(now() - interval '60 days')
  where item_key = 'private_message:' || u[2] and not is_read and unread_messages = 2;
  if n <> 1 then raise exception 'FAIL [a new message did not bring the dismissed conversation back]'; end if;
  checks := checks + 2;

  -- Effacer la même clé deux fois ne crée qu'une ligne.
  perform public.notification_dismiss('comment:' || v_comment);
  select count(*) into n from public.notification_dismissals where item_key = 'comment:' || v_comment;
  if n <> 1 then raise exception 'FAIL [dismissing twice stored % rows]', n; end if;
  checks := checks + 1;

  -- ── Tout effacer ──────────────────────────────────────────────────────────
  if exists (select 1 from public.notification_inbox_state) then
    raise exception 'FAIL [fixture: u1 already has an inbox state]';
  end if;
  v_cut := public.notification_dismiss_all();
  if v_cut is null then raise exception 'FAIL [clear all returned no cutoff]'; end if;
  select count(*) into n from public.notification_items(now() - interval '60 days');
  -- Seul le message daté 1 s après la butoir reste.
  if n <> 1 then raise exception 'FAIL [clear all left % notifications instead of 1]', n; end if;
  if (public.notification_summary()->>'bell_unread')::int <> 1 then
    raise exception 'FAIL [clear all: bell counter %]', public.notification_summary()->>'bell_unread';
  end if;
  select count(*) into n from public.notification_dismissals;
  if n <> 0 then raise exception 'FAIL [dismissals covered by the cutoff were kept]'; end if;
  -- Un état créé par « Tout effacer » ne marque rien comme lu.
  if (select read_all_before from public.notification_inbox_state) is not null then
    raise exception 'FAIL [clear all invented a read cutoff]';
  end if;
  checks := checks + 4;

  -- Une notification après la butoir apparaît, non lue.
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', u[2], 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', u[2]::text, true);
  insert into public.likes (post_id, user_id, emoji) values (v_post, u[2], '👍') returning id into v_like_late;
  perform set_config('request.jwt.claims', '', true);
  perform set_config('request.jwt.claim.sub', '', true);
  update public.likes set created_at = now() + interval '2 seconds' where id = v_like_late;
  perform set_config('request.jwt.claims', json_build_object('sub', u[1], 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', u[1]::text, true);
  set local role authenticated;
  select count(*) into n from public.notification_items(now() - interval '60 days')
  where item_key = 'reaction:' || v_like_late and not is_read;
  if n <> 1 then raise exception 'FAIL [a notification after clear all is missing or read]'; end if;
  checks := checks + 1;

  -- « Tout marquer comme lu » après « Tout effacer » garde les deux butoirs.
  perform public.notification_mark_all_read();
  if (select read_all_before from public.notification_inbox_state) is null
     or (select cleared_before from public.notification_inbox_state) <> v_cut then
    raise exception 'FAIL [mark all read after clear all lost a cutoff]';
  end if;
  if (public.notification_summary()->>'bell_unread')::int <> 2 then
    -- les deux notifications datées après les butoirs restent non lues
    raise exception 'FAIL [mark all read after clear all: % unread]', public.notification_summary()->>'bell_unread';
  end if;
  -- Et « Tout effacer » de nouveau ne recule jamais la butoir.
  v_cut := public.notification_dismiss_all();
  if (select cleared_before from public.notification_inbox_state) <> v_cut then
    raise exception 'FAIL [clear all did not keep the latest cutoff]';
  end if;
  checks := checks + 3;
  reset role;

  -- ── Compte suspendu : rien à écrire ───────────────────────────────────────
  perform set_config('request.jwt.claims', json_build_object('sub', u[4], 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', u[4]::text, true);
  set local role authenticated;
  begin
    perform public.notification_dismiss('announcement:' || v_ann);
    raise exception 'FAIL [a suspended account dismissed a notification]';
  exception when insufficient_privilege then checks := checks + 1;
  end;
  begin
    perform public.notification_dismiss_all();
    raise exception 'FAIL [a suspended account cleared its bell]';
  exception when insufficient_privilege then checks := checks + 1;
  end;
  reset role;

  -- ── Visiteur non connecté : aucune fonction ───────────────────────────────
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  perform set_config('request.jwt.claim.sub', '', true);
  set local role anon;
  begin
    perform public.notification_dismiss('announcement:' || v_ann);
    raise exception 'FAIL [anon dismissed a notification]';
  exception when insufficient_privilege then checks := checks + 1;
  end;
  begin
    perform public.notification_dismiss_all();
    raise exception 'FAIL [anon cleared a bell]';
  exception when insufficient_privilege then checks := checks + 1;
  end;
  begin
    perform count(*) from public.notification_dismissals;
    raise exception 'FAIL [anon read the dismissals table]';
  exception when insufficient_privilege then checks := checks + 1;
  end;
  reset role;

  raise exception 'NOTIFICATION DISMISS TESTS PASSED: % checks (everything rolled back)', checks;
end;
$tests$;
