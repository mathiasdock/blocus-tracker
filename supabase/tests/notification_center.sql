-- Centre de notifications (v64), sur la vraie base. Crée des étudiants
-- jetables, joue chaque rôle comme l'app (authenticated, anon), puis lève une
-- exception : RIEN n'est gardé, et pg_net n'envoie jamais une requête d'une
-- transaction annulée (les déclencheurs push restent muets).
--
-- À lancer après v64, ou dans le MÊME appel execute_sql juste après son SQL.
-- Résultat attendu : « NOTIFICATION CENTER TESTS PASSED ».
-- Les annonces réelles déjà actives sont comptées à part (base) et jamais
-- modifiées.
--
-- Chaque ligne est écrite sous l'identité de son auteur (les déclencheurs
-- anti-spam l'exigent et imposent created_at = now()), puis datée par le
-- propriétaire, identité effacée.

do $tests$
declare
  suffix constant text := substr(md5(clock_timestamp()::text), 1, 8);
  u uuid[] := array(select gen_random_uuid() from generate_series(1, 6));
  -- u[1] moi · u[2] Léa · u[3] a accepté ma demande · u[4] suspendu
  -- u[5] bloqué par moi · u[6] admin sans lien avec moi
  checks integer := 0;
  n integer;
  base integer;
  j jsonb;
  j2 jsonb;
  keys text[];
  v_post uuid;
  v_post_other uuid;
  v_comment uuid;
  v_comment_blocked uuid;
  v_like uuid;
  v_like_suspended uuid;
  v_like_late uuid;
  v_req uuid;
  v_req_suspended uuid;
  v_req_blocked uuid;
  v_acc uuid;
  v_ann uuid;
  v_ann_uni uuid;
  v_group uuid;
  v_ok boolean;
begin
  insert into auth.users (id, email, created_at, raw_user_meta_data)
  select u[i], 'notif-center-' || suffix || '-' || i || '@example.invalid', now() - interval '20 days',
    jsonb_build_object('pseudo', 'nc' || suffix || i, 'study_year', 'BAC 1')
  from generate_series(1, 6) as i;
  update public.profiles set first_name = 'Léa' where id = u[2];
  update public.profiles set university = 'Test U ' || suffix where id = u[1];

  perform set_config('request.jwt.claims', '', true);
  perform set_config('request.jwt.claim.sub', '', true);
  perform public.set_admin_role(u[6], true, 'notification center test fixture');

  -- Base : annonces réelles que u[1] verra de toute façon.
  perform set_config('request.jwt.claims', json_build_object('sub', u[1], 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', u[1]::text, true);
  set local role authenticated;
  select count(*) into base from public.notification_items(now() - interval '60 days');
  reset role;

  -- ── Écrit par chaque auteur ───────────────────────────────────────────────
  insert into public.posts (user_id, caption, visibility) values (u[1], 'Ma session', 'public') returning id into v_post;
  insert into public.friendships (requester, addressee, status, accepted_at)
    values (u[1], u[3], 'accepted', now() - interval '20 minutes') returning id into v_acc;
  insert into public.comments (post_id, user_id, content) values (v_post, u[1], 'moi-même');
  insert into public.private_messages (sender_id, receiver_id, content) values (u[1], u[2], 'secret-mine-' || suffix);

  perform set_config('request.jwt.claims', json_build_object('sub', u[2], 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', u[2]::text, true);
  insert into public.posts (user_id, caption, visibility) values (u[2], 'Session de Léa', 'public') returning id into v_post_other;
  insert into public.friendships (requester, addressee, status) values (u[2], u[1], 'pending') returning id into v_req;
  insert into public.comments (post_id, user_id, content) values (v_post, u[2], 'Bravo   pour ta
session !') returning id into v_comment;
  insert into public.private_messages (sender_id, receiver_id, content) values
    (u[2], u[1], 'secret-one-' || suffix), (u[2], u[1], 'secret-two-' || suffix);

  perform set_config('request.jwt.claims', json_build_object('sub', u[3], 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', u[3]::text, true);
  insert into public.comments (post_id, user_id, content) values (v_post_other, u[3], 'pas pour moi');
  insert into public.likes (post_id, user_id, emoji) values (v_post, u[3], '👍') returning id into v_like;
  insert into public.private_messages (sender_id, receiver_id, content) values (u[3], u[1], 'secret-three-' || suffix);

  perform set_config('request.jwt.claims', json_build_object('sub', u[4], 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', u[4]::text, true);
  insert into public.friendships (requester, addressee, status) values (u[4], u[1], 'pending') returning id into v_req_suspended;
  insert into public.likes (post_id, user_id, emoji) values (v_post, u[4], '👍') returning id into v_like_suspended;

  perform set_config('request.jwt.claims', json_build_object('sub', u[5], 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', u[5]::text, true);
  insert into public.friendships (requester, addressee, status) values (u[5], u[1], 'pending') returning id into v_req_blocked;
  insert into public.comments (post_id, user_id, content) values (v_post, u[5], 'bloqué') returning id into v_comment_blocked;
  insert into public.private_messages (sender_id, receiver_id, content) values (u[5], u[1], 'secret-blocked-' || suffix);

  -- ── Puis le propriétaire, sans identité : blocage, suspension, dates ──────
  perform set_config('request.jwt.claims', '', true);
  perform set_config('request.jwt.claim.sub', '', true);
  insert into public.user_blocks (blocker_id, blocked_id) values (u[1], u[5]);
  perform public.admin_set_suspension(u[6], u[4], true, 'notification center test fixture');

  update public.posts set created_at = now() - interval '2 hours' where id in (v_post, v_post_other);
  update public.friendships set created_at = now() - interval '8 minutes' where id = v_req;
  update public.friendships set created_at = now() - interval '9 minutes' where id in (v_req_suspended, v_req_blocked);
  update public.friendships set created_at = now() - interval '3 days' where id = v_acc;
  update public.private_messages set created_at = now() - interval '5 minutes' where content = 'secret-one-' || suffix;
  update public.private_messages set created_at = now() - interval '2 minutes' where content = 'secret-two-' || suffix;
  update public.private_messages set created_at = now() - interval '1 day', read = true where content = 'secret-three-' || suffix;
  update public.private_messages set created_at = now() - interval '1 minute' where content in ('secret-mine-' || suffix, 'secret-blocked-' || suffix);
  update public.comments set created_at = now() - interval '30 minutes' where id in (v_comment, v_comment_blocked);
  update public.comments set created_at = now() - interval '29 minutes' where post_id in (v_post, v_post_other) and id not in (v_comment, v_comment_blocked);
  update public.likes set created_at = now() - interval '40 minutes' where id in (v_like, v_like_suspended);

  insert into public.app_announcements (title, message, title_en, message_en, type, href, is_active, created_at)
    values ('Nouveau planning ' || suffix, 'Texte', 'New planning', 'Text', 'new', '/planning', true, now() - interval '3 hours')
    returning id into v_ann;
  insert into public.app_announcements (title, message, type, is_active, created_at, audience, audience_university)
    values ('Pour mon école ' || suffix, 'Texte', 'info', true, now() - interval '4 hours', 'university', 'Test U ' || suffix)
    returning id into v_ann_uni;
  insert into public.app_announcements (title, message, type, is_active, created_at) values
    ('Brouillon ' || suffix, 'x', 'info', false, now() - interval '1 hour');
  insert into public.app_announcements (title, message, type, is_active, created_at, starts_at) values
    ('Futur ' || suffix, 'x', 'info', true, now() - interval '1 hour', now() + interval '1 day');
  insert into public.app_announcements (title, message, type, is_active, created_at, ends_at) values
    ('Expirée ' || suffix, 'x', 'info', true, now() - interval '9 days', now() - interval '1 day');
  insert into public.app_announcements (title, message, type, is_active, created_at, audience, audience_university) values
    ('Autre école ' || suffix, 'x', 'info', true, now() - interval '1 hour', 'university', 'Autre U ' || suffix);

  -- ── u[1] : exactement ses notifications, rien d'autre ─────────────────────
  perform set_config('request.jwt.claims', json_build_object('sub', u[1], 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', u[1]::text, true);
  set local role authenticated;
  select array_agg(item_key order by item_key) into keys
  from public.notification_items(now() - interval '60 days')
  where kind <> 'announcement' or target_id in (v_ann, v_ann_uni);
  if keys is distinct from (select array_agg(k order by k) from unnest(array[
      'friend_request:' || v_req, 'friend_accepted:' || v_acc,
      'private_message:' || u[2], 'private_message:' || u[3],
      'comment:' || v_comment, 'reaction:' || v_like,
      'announcement:' || v_ann, 'announcement:' || v_ann_uni]) k) then
    raise exception 'FAIL [u1 sees the wrong notifications: %]', keys;
  end if;
  checks := checks + 1;

  -- Suspendu, bloqué, soi-même, post d'un autre, brouillon, futur, expiré,
  -- autre école : aucune trace.
  select count(*) into n from public.notification_items(now() - interval '60 days')
  where item_key in ('friend_request:' || v_req_suspended, 'friend_request:' || v_req_blocked,
                     'comment:' || v_comment_blocked, 'reaction:' || v_like_suspended,
                     'private_message:' || u[5], 'private_message:' || u[1])
     or (kind = 'announcement' and announcement->>'title' like '%' || suffix and target_id not in (v_ann, v_ann_uni));
  if n <> 0 then raise exception 'FAIL [% hidden notifications leaked into the bell]', n; end if;
  checks := checks + 1;

  -- Non lu au départ, sauf la conversation déjà lue dans Messages.
  select * into j from public.notification_inbox(50);
  if (j->>'unread')::int <> base + 7 then
    raise exception 'FAIL [unread should be % + 7, got %]', base, j->>'unread';
  end if;
  if exists (select 1 from jsonb_array_elements(j->'items') e
             where e->>'key' = 'private_message:' || u[3] and (e->>'read')::boolean is not true) then
    raise exception 'FAIL [a conversation already read in Messages is unread in the bell]';
  end if;
  checks := checks + 2;

  -- Message privé : regroupé par expéditeur, compté, jamais le texte.
  select e into j2 from jsonb_array_elements(j->'items') e where e->>'key' = 'private_message:' || u[2];
  if (j2->>'count')::int <> 2 or j2->>'target' <> u[2]::text or (j2->'actor'->>'first_name') <> 'Léa' then
    raise exception 'FAIL [message row is wrong: %]', j2;
  end if;
  if position('secret-' in j::text) > 0 then
    raise exception 'FAIL [a private message text left the database]';
  end if;
  if (j->'items') @? '$[*].actor.email' then
    raise exception 'FAIL [an e-mail address is exposed]';
  end if;
  checks := checks + 3;

  -- Commentaire : extrait sur une ligne ; annonce : les deux langues et le lien.
  select e into j2 from jsonb_array_elements(j->'items') e where e->>'key' = 'comment:' || v_comment;
  if j2->>'excerpt' <> 'Bravo pour ta session !' or j2->>'target' <> v_post::text then
    raise exception 'FAIL [comment row is wrong: %]', j2;
  end if;
  select e into j2 from jsonb_array_elements(j->'items') e where e->>'key' = 'announcement:' || v_ann;
  if j2->'announcement'->>'title_en' <> 'New planning' or j2->'announcement'->>'href' <> '/planning' or j2->'actor' <> 'null'::jsonb then
    raise exception 'FAIL [announcement row is wrong: %]', j2;
  end if;
  checks := checks + 2;

  -- Pagination : 2 par 2, sans trou ni doublon.
  select * into j from public.notification_inbox(2);
  if jsonb_array_length(j->'items') <> 2 or (j->>'has_more')::boolean is not true then
    raise exception 'FAIL [first page: %]', j;
  end if;
  select * into j2 from public.notification_inbox(2, (j->'items'->1->>'at')::timestamptz, j->'items'->1->>'key');
  if jsonb_array_length(j2->'items') <> 2
     or exists (select 1 from jsonb_array_elements(j2->'items') a, jsonb_array_elements(j->'items') b where a->>'key' = b->>'key') then
    raise exception 'FAIL [second page is wrong or overlaps: %]', j2;
  end if;
  if (j2->'items'->0->>'at')::timestamptz > (j->'items'->1->>'at')::timestamptz then
    raise exception 'FAIL [second page is not older than the first]';
  end if;
  checks := checks + 2;

  -- ── Marquer comme lu ──────────────────────────────────────────────────────
  v_ok := public.notification_mark_read('comment:' || v_comment);
  if not v_ok then raise exception 'FAIL [mark read refused a real notification]'; end if;
  select * into j from public.notification_inbox(50);
  if (j->>'unread')::int <> base + 6 then raise exception 'FAIL [mark read did not lower the count]'; end if;
  checks := checks + 2;

  -- Un deuxième appareil du même compte (autre session, même identité) voit
  -- le même état : il est en base, pas sur l'appareil.
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', u[1], 'role', 'authenticated', 'session_id', gen_random_uuid())::text, true);
  set local role authenticated;
  select * into j2 from public.notification_inbox(50);
  if (j2->>'unread')::int <> base + 6
     or not exists (select 1 from jsonb_array_elements(j2->'items') e
                    where e->>'key' = 'comment:' || v_comment and (e->>'read')::boolean) then
    raise exception 'FAIL [the second device does not see the read state]';
  end if;
  select (public.notification_summary()->>'bell_unread')::int into n;
  if n <> base + 6 then raise exception 'FAIL [the bell counter (%) differs from the list]', n; end if;
  checks := checks + 2;

  -- Lire la conversation dans Messages l'éteint aussi dans la cloche.
  update public.private_messages set read = true where sender_id = u[2] and receiver_id = u[1];
  select count(*) into n from public.notification_items(now() - interval '60 days')
  where item_key = 'private_message:' || u[2] and not is_read;
  if n <> 0 then raise exception 'FAIL [reading the conversation left the bell item unread]'; end if;
  checks := checks + 1;

  -- Un nouveau message de Léa, plus tard, rallume l'entrée.
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', u[2], 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', u[2]::text, true);
  insert into public.private_messages (sender_id, receiver_id, content) values (u[2], u[1], 'secret-new-' || suffix);
  perform set_config('request.jwt.claims', '', true);
  perform set_config('request.jwt.claim.sub', '', true);
  update public.private_messages set created_at = now() + interval '1 second' where content = 'secret-new-' || suffix;
  perform set_config('request.jwt.claims', json_build_object('sub', u[1], 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', u[1]::text, true);
  set local role authenticated;
  select count(*) into n from public.notification_items(now() - interval '60 days')
  where item_key = 'private_message:' || u[2] and not is_read and unread_messages = 1;
  if n <> 1 then raise exception 'FAIL [a new message did not relight the conversation]'; end if;
  checks := checks + 1;

  -- ── Tout marquer comme lu ─────────────────────────────────────────────────
  perform public.notification_mark_all_read();
  select (public.notification_summary()->>'bell_unread')::int into n;
  if n <> 1 then
    -- seul le message daté 1 s après la butoir reste non lu
    raise exception 'FAIL [mark all read left % unread instead of 1]', n;
  end if;
  select count(*) into n from public.notification_reads;
  if n <> 0 then raise exception 'FAIL [receipts covered by the cutoff were kept]'; end if;
  checks := checks + 2;

  -- Une nouvelle notification après la butoir est non lue.
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
  select (public.notification_summary()->>'bell_unread')::int into n;
  if n <> 2 then raise exception 'FAIL [a notification after mark-all is not unread (% unread)]', n; end if;
  checks := checks + 1;
  -- Une lecture individuelle de u[1], pour l'étanchéité plus bas.
  if not public.notification_mark_read('private_message:' || u[2]) then
    raise exception 'FAIL [marking a conversation read was refused]';
  end if;

  -- ── Destination disparue : la notification disparaît avec elle ────────────
  reset role;
  delete from public.comments where id = v_comment;
  set local role authenticated;
  select count(*) into n from public.notification_items(now() - interval '60 days') where item_key = 'comment:' || v_comment;
  if n <> 0 then raise exception 'FAIL [a deleted comment still notifies]'; end if;
  reset role;
  delete from public.posts where id = v_post;
  set local role authenticated;
  select count(*) into n from public.notification_items(now() - interval '60 days') where kind in ('comment', 'reaction');
  if n <> 0 then raise exception 'FAIL [reactions on a deleted post still notify]'; end if;
  checks := checks + 2;

  -- Demande acceptée : elle quitte « demandes » et devient « acceptée » chez Léa.
  update public.friendships set status = 'accepted' where id = v_req;
  select count(*) into n from public.notification_items(now() - interval '60 days') where item_key = 'friend_request:' || v_req;
  if n <> 0 then raise exception 'FAIL [an accepted request is still pending in the bell]'; end if;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', u[2], 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', u[2]::text, true);
  set local role authenticated;
  select count(*) into n from public.notification_items(now() - interval '60 days') where item_key = 'friend_accepted:' || v_req and not is_read;
  if n <> 1 then raise exception 'FAIL [Léa is not told that her request was accepted]'; end if;
  checks := checks + 2;

  -- ── Un autre membre (ici admin) ne voit ni ne touche rien de u[1] ─────────
  reset role;
  select count(*) into n from public.notification_reads where user_id = u[1];
  if n <> 1 then raise exception 'FAIL [u1 should hold one receipt here, has %]', n; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', u[6], 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', u[6]::text, true);
  set local role authenticated;
  select count(*) into n from public.notification_items(now() - interval '60 days') where kind <> 'announcement';
  if n <> 0 then raise exception 'FAIL [another member has % personal notifications]', n; end if;
  v_ok := public.notification_mark_read('friend_accepted:' || v_acc);
  if v_ok then raise exception 'FAIL [another member marked someone else''s notification]'; end if;
  select count(*) into n from public.notification_reads;
  if n <> 0 then raise exception 'FAIL [another member wrote or reads receipts]'; end if;
  begin
    insert into public.notification_reads (user_id, item_key) values (u[1], 'comment:' || v_comment);
    raise exception 'FAIL [a client wrote a receipt directly]';
  exception when insufficient_privilege then checks := checks + 1;
  end;
  begin
    update public.notification_inbox_state set read_all_before = now();
    raise exception 'FAIL [a client changed a cutoff directly]';
  exception when insufficient_privilege then checks := checks + 1;
  end;
  checks := checks + 3;

  -- État vide : un membre sans lien n'a que les annonces de tout le monde
  -- (les réelles + celle de ce test). Admin : jamais les brouillons.
  n := jsonb_array_length(public.notification_inbox(50) -> 'items');
  if n <> base + 1 then raise exception 'FAIL [empty member: % items instead of the % shared announcements]', n, base + 1; end if;
  checks := checks + 1;

  -- Clé invalide : refusée.
  begin
    perform public.notification_mark_read('comment:not-a-uuid');
    raise exception 'FAIL [an invalid key was accepted]';
  exception when invalid_parameter_value then checks := checks + 1;
  end;

  -- ── Compte suspendu : rien à lire, rien à écrire ──────────────────────────
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', u[4], 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', u[4]::text, true);
  set local role authenticated;
  select count(*) into n from public.notification_items(now() - interval '60 days');
  if n <> 0 or public.notification_summary() is not null then
    raise exception 'FAIL [a suspended account reads notifications]';
  end if;
  begin
    perform public.notification_mark_all_read();
    raise exception 'FAIL [a suspended account marked all read]';
  exception when insufficient_privilege then checks := checks + 1;
  end;
  checks := checks + 1;

  -- ── Visiteur non connecté : aucune fonction ───────────────────────────────
  reset role;
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  perform set_config('request.jwt.claim.sub', '', true);
  set local role anon;
  begin
    perform public.notification_inbox(20);
    raise exception 'FAIL [anon listed notifications]';
  exception when insufficient_privilege then checks := checks + 1;
  end;
  begin
    perform public.notification_mark_all_read();
    raise exception 'FAIL [anon marked all read]';
  exception when insufficient_privilege then checks := checks + 1;
  end;
  reset role;

  -- ── Compteurs de navigation en une lecture ────────────────────────────────
  perform set_config('request.jwt.claims', '', true);
  perform set_config('request.jwt.claim.sub', '', true);
  insert into public.study_groups (name, created_by) values ('Groupe ' || suffix, u[1]) returning id into v_group;
  insert into public.group_members (group_id, user_id, role) values (v_group, u[1], 'admin'), (v_group, u[2], 'member');
  perform set_config('request.jwt.claims', json_build_object('sub', u[2], 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', u[2]::text, true);
  insert into public.group_messages (group_id, user_id, content) values (v_group, u[2], 'g1-' || suffix), (v_group, u[2], 'g2-' || suffix);
  perform set_config('request.jwt.claims', json_build_object('sub', u[1], 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', u[1]::text, true);
  insert into public.group_messages (group_id, user_id, content) values (v_group, u[1], 'g3-' || suffix);
  perform set_config('request.jwt.claims', '', true);
  perform set_config('request.jwt.claim.sub', '', true);
  update public.group_messages set created_at = now() - interval '10 minutes' where content = 'g1-' || suffix;
  update public.group_messages set created_at = now() - interval '1 minute' where content in ('g2-' || suffix, 'g3-' || suffix);

  perform set_config('request.jwt.claims', json_build_object('sub', u[1], 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', u[1]::text, true);
  set local role authenticated;
  j := public.notification_summary(null, '{}'::jsonb, jsonb_build_object(v_group::text, (now() - interval '5 minutes')::text));
  select e into j2 from jsonb_array_elements(j->'groups') e where e->>'id' = v_group::text;
  if (j2->>'unread')::int <> 1 or (j2->>'seen')::boolean is not true then
    raise exception 'FAIL [group counter: %]', j2;
  end if;
  j := public.notification_summary(null, '{}'::jsonb, jsonb_build_object(v_group::text, 'pas une date'));
  select e into j2 from jsonb_array_elements(j->'groups') e where e->>'id' = v_group::text;
  if (j2->>'unread')::int <> 0 or (j2->>'seen')::boolean then
    raise exception 'FAIL [a garbage date is not treated as never seen: %]', j2;
  end if;
  if (j->>'messages_unread')::int <> 2 or (j->>'friend_requests')::int <> 2 or j->'feed_new' <> 'null'::jsonb then
    -- Comptes bruts, comme l'app les faisait déjà : 2 messages (le nouveau de
    -- Léa + celui du membre bloqué), 2 demandes (suspendu + bloqué).
    raise exception 'FAIL [navigation counters: %]', j;
  end if;
  checks := checks + 3;
  reset role;

  raise exception 'NOTIFICATION CENTER TESTS PASSED: % checks (everything rolled back)', checks;
end;
$tests$;
