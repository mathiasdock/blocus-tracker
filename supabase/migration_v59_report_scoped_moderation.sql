-- v59 — Modération limitée aux signalements (refonte de l'admin, phase 1).
--
-- 1. Salons de cours : l'admin ne lit plus les conversations. Pour un message
--    SIGNALÉ (signalement encore ouvert), il voit ce message, les 2 messages
--    qui le précèdent et les 2 qui le suivent dans le même salon — rien
--    d'autre. Chaque consultation est inscrite au journal admin.
-- 2. Fil d'activité : l'admin ne lit plus les publications « amis uniquement »
--    des autres, ni leurs réactions et commentaires en dehors de ce que voit un
--    membre. Retirer une publication ou un commentaire passe par une fonction
--    tracée au lieu d'une règle de suppression ouverte.
-- 3. Groupes d'étude : un admin de la plateforme n'a plus de droit de
--    suppression sur les messages d'un groupe (l'admin DU groupe le garde).
-- 4. Garder / retirer un message signalé est désormais journalisé.

-- ── 1. Salons de cours : plus de lecture générale par l'admin ────────────────
drop policy if exists community_messages_read on public.community_messages;
create policy community_messages_read on public.community_messages
  for select to authenticated
  using (
    (user_id = (select auth.uid()))
    or (
      (room_id in (
        select m.room_id from public.course_room_members m
        where m.user_id = (select auth.uid())
      ))
      and hidden_at is null
      and not (user_id in (
        select b.blocked_id from public.user_blocks b
        where b.blocker_id = (select auth.uid())
      ))
      and not (id in (
        select r.message_id from public.course_message_reports r
        where r.reporter_id = (select auth.uid())
      ))
      and not public.is_suspended(user_id)
    )
  );

drop policy if exists cmsg_delete on public.community_messages;
create policy cmsg_delete on public.community_messages
  for delete to authenticated
  using (auth.uid() = user_id);

-- Le contexte d'un signalement : jamais plus de 5 messages, jamais sans
-- signalement ouvert.
create or replace function public.admin_course_report_context(p_message_id uuid)
returns table (
  message_id uuid,
  message_position text,
  author_pseudo text,
  content text,
  attachment_name text,
  exam_date date,
  created_at timestamptz,
  hidden boolean
)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_actor uuid := public.assert_admin();
  v_room uuid;
  v_author uuid;
  v_at timestamptz;
begin
  if not exists (
    select 1 from public.course_message_reports r
    where r.message_id = p_message_id and r.resolved_at is null
  ) then
    raise exception 'No open report for this message' using errcode = '42501';
  end if;

  select c.room_id, c.user_id, c.created_at into v_room, v_author, v_at
  from public.community_messages c
  where c.id = p_message_id;
  if not found or v_room is null then
    raise exception 'Message not found' using errcode = '22023';
  end if;

  perform public.log_admin_action(
    v_actor, 'report_context_viewed', v_author, 'community_message', p_message_id::text,
    null, '{}'::jsonb
  );

  return query
  with ctx as (
    (select c.id, 'before'::text as pos, c.user_id, c.content, c.attachment_name,
            c.exam_date, c.created_at, c.hidden_at
     from public.community_messages c
     where c.room_id = v_room and (c.created_at, c.id) < (v_at, p_message_id)
     order by c.created_at desc, c.id desc
     limit 2)
    union all
    (select c.id, 'reported'::text, c.user_id, c.content, c.attachment_name,
            c.exam_date, c.created_at, c.hidden_at
     from public.community_messages c
     where c.id = p_message_id)
    union all
    (select c.id, 'after'::text, c.user_id, c.content, c.attachment_name,
            c.exam_date, c.created_at, c.hidden_at
     from public.community_messages c
     where c.room_id = v_room and (c.created_at, c.id) > (v_at, p_message_id)
     order by c.created_at asc, c.id asc
     limit 2)
  )
  select ctx.id, ctx.pos, p.pseudo, ctx.content, ctx.attachment_name,
         ctx.exam_date, ctx.created_at, ctx.hidden_at is not null
  from ctx
  left join public.profiles p on p.id = ctx.user_id
  order by ctx.created_at, ctx.id;
end;
$$;

revoke all on function public.admin_course_report_context(uuid) from public, anon;
grant execute on function public.admin_course_report_context(uuid) to authenticated;

-- Garder ou retirer un message signalé : même effet qu'avant, désormais tracé.
create or replace function public.admin_resolve_course_report(p_message_id uuid, p_remove boolean)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_actor uuid := public.assert_admin();
  v_author uuid;
  v_open integer;
begin
  select c.user_id into v_author
  from public.community_messages c
  where c.id = p_message_id and c.room_id is not null;

  select count(*) into v_open
  from public.course_message_reports r
  where r.message_id = p_message_id and r.resolved_at is null;

  if p_remove then
    delete from public.community_messages where id = p_message_id and room_id is not null;
  else
    update public.course_message_reports set resolved_at = now()
    where message_id = p_message_id and resolved_at is null;
    update public.community_messages set hidden_at = null
    where id = p_message_id and room_id is not null;
  end if;

  perform public.log_admin_action(
    v_actor,
    case when p_remove then 'report_message_removed' else 'report_dismissed' end,
    v_author, 'community_message', p_message_id::text, null,
    jsonb_build_object('open_reports', v_open)
  );
end;
$$;

-- ── 2. Fil d'activité ────────────────────────────────────────────────────────
drop policy if exists posts_read_admin on public.posts;
drop policy if exists comments_read_admin on public.comments;
drop policy if exists likes_read_admin on public.likes;

-- Chacun supprime ses propres publications (règle posts_write) ; l'ancienne
-- règle ouvrait en plus la suppression de TOUTES les publications aux admins.
drop policy if exists admin_delete_posts on public.posts;

drop policy if exists comments_delete on public.comments;
create policy comments_delete on public.comments
  for delete to authenticated
  using (auth.uid() = user_id);

create or replace function public.admin_remove_post(p_post_id uuid, p_reason text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := public.assert_admin();
  v_owner uuid;
begin
  select user_id into v_owner from public.posts where id = p_post_id;
  if not found then
    raise exception 'Unknown post' using errcode = '22023';
  end if;
  delete from public.posts where id = p_post_id;
  perform public.log_admin_action(
    v_actor, 'post_removed', v_owner, 'post', p_post_id::text, p_reason, '{}'::jsonb
  );
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.admin_remove_comment(p_comment_id uuid, p_reason text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := public.assert_admin();
  v_owner uuid;
begin
  select user_id into v_owner from public.comments where id = p_comment_id;
  if not found then
    raise exception 'Unknown comment' using errcode = '22023';
  end if;
  delete from public.comments where id = p_comment_id;
  perform public.log_admin_action(
    v_actor, 'comment_removed', v_owner, 'comment', p_comment_id::text, p_reason, '{}'::jsonb
  );
  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.admin_remove_post(uuid, text) from public, anon;
revoke all on function public.admin_remove_comment(uuid, text) from public, anon;
grant execute on function public.admin_remove_post(uuid, text) to authenticated;
grant execute on function public.admin_remove_comment(uuid, text) to authenticated;

-- ── 3. Groupes d'étude ───────────────────────────────────────────────────────
drop policy if exists gmsg_delete on public.group_messages;
create policy gmsg_delete on public.group_messages
  for delete to authenticated
  using ((auth.uid() = user_id) or is_group_admin(group_id));
