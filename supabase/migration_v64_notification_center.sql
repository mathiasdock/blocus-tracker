-- v64 — Centre de notifications : une seule liste, un seul compteur, et le
-- lu / non lu attaché au COMPTE (plus à l'appareil).
--
-- Rien n'est recopié. Chaque notification se lit là où elle vit déjà :
--   demande d'ami reçue    friendships (en attente, adressée à moi)
--   demande acceptée       friendships (acceptée, envoyée par moi)
--   message privé          private_messages (UNE entrée par expéditeur)
--   commentaire / réaction comments / likes sur mes publications
--   annonce                app_announcements (active, dans ses dates, ciblée)
-- Le seul état ajouté est ce que le membre a déjà lu :
--   notification_reads        une ligne par notification ouverte (clé + date)
--   notification_inbox_state  « Tout marquer comme lu » : une date butoir
-- Une notification est lue si elle date d'avant la butoir, ou si elle a été
-- ouverte APRÈS sa dernière mise à jour : un nouveau message de la même
-- personne la rallume. Un message déjà lu dans la conversation l'est aussi
-- dans la cloche (private_messages.read, déjà partagé par tous les appareils).
--
-- Les lectures passent par des fonctions SECURITY INVOKER : la RLS existante
-- s'applique telle quelle (blocages, suspensions, visibilité des posts,
-- annonces ciblées). Les écritures passent par deux fonctions qui n'écrivent
-- que pour auth.uid(), et seulement pour une notification qui le concerne.
-- Le contenu d'un message privé n'est jamais lu ici.

-- ── État de lecture ─────────────────────────────────────────────────────────
create table if not exists public.notification_reads (
  user_id uuid not null references auth.users(id) on delete cascade,
  item_key text not null,
  read_at timestamptz not null default now(),
  primary key (user_id, item_key),
  constraint notification_reads_key_format check (item_key ~ '^(friend_request|friend_accepted|private_message|comment|reaction|announcement):[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')
);

create table if not exists public.notification_inbox_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  read_all_before timestamptz not null,
  updated_at timestamptz not null default now()
);

alter table public.notification_reads enable row level security;
alter table public.notification_inbox_state enable row level security;

drop policy if exists notification_reads_select_own on public.notification_reads;
create policy notification_reads_select_own on public.notification_reads
  for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists notification_inbox_state_select_own on public.notification_inbox_state;
create policy notification_inbox_state_select_own on public.notification_inbox_state
  for select to authenticated using (user_id = (select auth.uid()));

-- Lecture de ses propres lignes seulement ; aucune écriture directe.
revoke all on public.notification_reads, public.notification_inbox_state from public, anon, authenticated;
grant select on public.notification_reads, public.notification_inbox_state to authenticated;

-- Lectures de la cloche : par destinataire (aucun index ne les couvrait).
create index if not exists private_messages_receiver_idx on public.private_messages (receiver_id, created_at desc);
create index if not exists comments_post_idx on public.comments (post_id, created_at desc);
create index if not exists friendships_addressee_status_idx on public.friendships (addressee, status);

-- ── Les notifications du membre connecté ────────────────────────────────────
-- Fenêtre : p_since pour les événements passés ; une demande en attente et
-- une annonce active restent visibles tant qu'elles sont vraies.
create or replace function public.notification_items(p_since timestamptz)
returns table (
  item_key text,
  kind text,
  occurred_at timestamptz,
  actor_id uuid,
  target_id uuid,
  unread_messages integer,
  excerpt text,
  emoji text,
  announcement jsonb,
  is_read boolean
)
language sql
stable
security invoker
set search_path = public, pg_catalog
as $$
  with me as (
    select auth.uid() as uid
    where auth.uid() is not null and not public.is_suspended(auth.uid())
  ),
  cutoff as (
    select s.read_all_before from public.notification_inbox_state s join me on s.user_id = me.uid
  ),
  raw as (
    select 'friend_request:' || f.id as item_key, 'friend_request'::text as kind, f.created_at as occurred_at,
           f.requester as actor_id, f.id as target_id, 0 as unread_messages,
           null::text as excerpt, null::text as emoji, null::jsonb as announcement
    from public.friendships f join me on f.addressee = me.uid
    where f.status = 'pending'
    union all
    select 'friend_accepted:' || f.id, 'friend_accepted', coalesce(f.accepted_at, f.created_at),
           f.addressee, f.addressee, 0, null, null, null
    from public.friendships f join me on f.requester = me.uid
    where f.status = 'accepted' and coalesce(f.accepted_at, f.created_at) >= p_since
    union all
    -- Une entrée par expéditeur, à la date de son dernier message. Jamais le texte.
    select 'private_message:' || pm.sender_id, 'private_message', max(pm.created_at),
           pm.sender_id, pm.sender_id, (count(*) filter (where not pm.read))::integer, null, null, null
    from public.private_messages pm join me on pm.receiver_id = me.uid
    where pm.sender_id <> me.uid and pm.created_at >= p_since
    group by pm.sender_id
    union all
    select 'comment:' || c.id, 'comment', c.created_at, c.user_id, c.post_id, 0,
           left(regexp_replace(c.content, '\s+', ' ', 'g'), 160), null, null
    from public.comments c
    join public.posts p on p.id = c.post_id
    join me on p.user_id = me.uid
    where c.user_id <> me.uid and c.created_at >= p_since
    union all
    select 'reaction:' || l.id, 'reaction', l.created_at, l.user_id, l.post_id, 0, null, l.emoji, null
    from public.likes l
    join public.posts p on p.id = l.post_id
    join me on p.user_id = me.uid
    where l.user_id <> me.uid and l.created_at >= p_since
    union all
    -- Filtre explicite : la RLS laisse un admin lire aussi les brouillons,
    -- et la cloche d'un admin ne doit montrer que ce que voient les membres.
    select 'announcement:' || a.id, 'announcement', greatest(a.created_at, coalesce(a.starts_at, a.created_at)),
           null, a.id, 0, null, null,
           jsonb_build_object('title', a.title, 'message', a.message, 'title_en', a.title_en,
                              'message_en', a.message_en, 'type', a.type, 'href', a.href)
    from public.app_announcements a cross join me
    where a.is_active
      and (a.starts_at is null or a.starts_at <= now())
      and (a.ends_at is null or a.ends_at > now())
      and (a.audience = 'all'
           or (a.audience = 'university'
               and a.audience_university = (select pr.university from public.profiles pr where pr.id = me.uid)))
  )
  select r.item_key, r.kind, r.occurred_at, r.actor_id, r.target_id, r.unread_messages,
         r.excerpt, r.emoji, r.announcement,
         (
           (r.kind = 'private_message' and r.unread_messages = 0)
           or exists (select 1 from cutoff c where r.occurred_at <= c.read_all_before)
           or exists (select 1 from public.notification_reads nr join me on nr.user_id = me.uid
                      where nr.item_key = r.item_key and nr.read_at >= r.occurred_at)
         ) as is_read
  from raw r
  where r.actor_id is null
     or (not public.is_suspended(r.actor_id) and not public.activity_blocked_with(r.actor_id))
$$;

-- ── Liste paginée (la cloche ouverte) ───────────────────────────────────────
-- Du plus récent au plus ancien ; « voir plus » repart de la dernière ligne
-- (date + clé). Le compteur non lu porte sur toute la fenêtre, pas la page.
create or replace function public.notification_inbox(
  p_limit integer default 20,
  p_before_at timestamptz default null,
  p_before_key text default null
)
returns jsonb
language sql
stable
security invoker
set search_path = public, pg_catalog
as $$
  with lim as (
    select least(greatest(coalesce(p_limit, 20), 1), 50) as n
  ),
  items as (
    select * from public.notification_items(now() - interval '60 days')
  ),
  page as (
    select i.*, row_number() over (order by i.occurred_at desc, i.item_key desc) as rn
    from items i
    where p_before_at is null
       or i.occurred_at < p_before_at
       or (i.occurred_at = p_before_at and i.item_key < coalesce(p_before_key, ''))
    order by i.occurred_at desc, i.item_key desc
    limit (select n + 1 from lim)
  )
  select jsonb_build_object(
    'unread', (select count(*) from items where not items.is_read),
    'has_more', (select count(*) from page) > (select n from lim),
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
          'key', p.item_key,
          'kind', p.kind,
          'at', p.occurred_at,
          'read', p.is_read,
          'target', p.target_id,
          'count', p.unread_messages,
          'excerpt', p.excerpt,
          'emoji', p.emoji,
          'announcement', p.announcement,
          'actor', (
            select jsonb_build_object('id', pr.id, 'pseudo', pr.pseudo, 'first_name', pr.first_name,
                                      'last_name', pr.last_name, 'avatar_url', pr.avatar_url)
            from public.profiles pr where pr.id = p.actor_id
          )
        ) order by p.occurred_at desc, p.item_key desc)
      from page p
      where p.rn <= (select n from lim)
    ), '[]'::jsonb)
  );
$$;

-- ── Tous les compteurs de navigation en UNE lecture ─────────────────────────
-- Remplace les 7 à 13 requêtes que l'app refaisait toutes les 2 minutes.
-- Les « vu pour la dernière fois » des espaces de cours et des groupes restent
-- sur l'appareil (comportement inchangé) et sont passés en paramètre ; un
-- espace ou un groupe sans date renvoie 0 et l'app l'initialise à maintenant.
create or replace function public.notification_try_timestamptz(p_value text)
returns timestamptz
language plpgsql
stable
set search_path = public, pg_catalog
as $$
begin
  if p_value is null or length(p_value) > 40 then
    return null;
  end if;
  return p_value::timestamptz;
exception when others then
  return null;
end;
$$;

create or replace function public.notification_summary(
  p_feed_since timestamptz default null,
  p_rooms_seen jsonb default '{}'::jsonb,
  p_groups_seen jsonb default '{}'::jsonb
)
returns jsonb
language sql
stable
security invoker
set search_path = public, pg_catalog
as $$
  with me as (
    select auth.uid() as uid
    where auth.uid() is not null and not public.is_suspended(auth.uid())
  ),
  rooms as (
    select m.room_id,
           public.notification_try_timestamptz(
             case when jsonb_typeof(p_rooms_seen) = 'object' then p_rooms_seen ->> m.room_id::text end
           ) as seen
    from public.course_room_members m join me on m.user_id = me.uid
    order by m.joined_at desc
    limit 200
  ),
  grps as (
    select distinct gm.group_id,
           public.notification_try_timestamptz(
             case when jsonb_typeof(p_groups_seen) = 'object' then p_groups_seen ->> gm.group_id::text end
           ) as seen
    from public.group_members gm join me on gm.user_id = me.uid
  )
  select case when not exists (select 1 from me) then null else jsonb_build_object(
    'bell_unread', (select count(*) from public.notification_items(now() - interval '60 days') i where not i.is_read),
    'messages_unread', (select count(*) from public.private_messages pm join me on pm.receiver_id = me.uid where not pm.read),
    'friend_requests', (select count(*) from public.friendships f join me on f.addressee = me.uid where f.status = 'pending'),
    'feed_new', case when p_feed_since is null then null else (
      select count(*) from (
        select 1 from public.posts po join me on po.user_id <> me.uid
        where po.created_at > p_feed_since limit 1000
      ) x
    ) end,
    'rooms', coalesce((
      select jsonb_agg(jsonb_build_object('id', r.room_id, 'unread', case when r.seen is null then 0 else (
        select count(*) from (
          select 1 from public.community_messages cm, me
          where cm.room_id = r.room_id and cm.user_id <> me.uid and cm.created_at > r.seen
          limit 999
        ) x
      ) end, 'seen', r.seen is not null))
      from rooms r
    ), '[]'::jsonb),
    'groups', coalesce((
      select jsonb_agg(jsonb_build_object('id', g.group_id, 'unread', case when g.seen is null then 0 else (
        select count(*) from (
          select 1 from public.group_messages gmsg, me
          where gmsg.group_id = g.group_id and gmsg.user_id <> me.uid and gmsg.created_at > g.seen
          limit 999
        ) x
      ) end, 'seen', g.seen is not null))
      from grps g
    ), '[]'::jsonb)
  ) end;
$$;

-- ── Écritures : uniquement pour soi ─────────────────────────────────────────
-- Ouvrir une notification. La clé doit désigner une notification qui
-- concerne vraiment le membre ; sinon rien n'est écrit (renvoie false).
create or replace function public.notification_mark_read(p_key text)
returns boolean
language plpgsql
volatile
security definer
set search_path = public, pg_catalog
as $$
declare
  v_uid uuid := auth.uid();
  v_kind text;
  v_id uuid;
  v_ok boolean;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  if public.is_suspended(v_uid) then
    raise exception 'account_suspended' using errcode = '42501';
  end if;
  if p_key is null or p_key !~ '^(friend_request|friend_accepted|private_message|comment|reaction|announcement):[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    raise exception 'invalid_notification_key' using errcode = '22023';
  end if;
  v_kind := split_part(p_key, ':', 1);
  v_id := split_part(p_key, ':', 2)::uuid;

  v_ok := case v_kind
    when 'friend_request' then exists (select 1 from public.friendships where id = v_id and addressee = v_uid)
    when 'friend_accepted' then exists (select 1 from public.friendships where id = v_id and requester = v_uid)
    when 'private_message' then exists (select 1 from public.private_messages where sender_id = v_id and receiver_id = v_uid)
    when 'comment' then exists (select 1 from public.comments c join public.posts p on p.id = c.post_id
                                where c.id = v_id and p.user_id = v_uid)
    when 'reaction' then exists (select 1 from public.likes l join public.posts p on p.id = l.post_id
                                 where l.id = v_id and p.user_id = v_uid)
    when 'announcement' then exists (select 1 from public.app_announcements where id = v_id and is_active)
    else false
  end;
  if not v_ok then
    return false;
  end if;

  insert into public.notification_reads (user_id, item_key, read_at)
  values (v_uid, p_key, now())
  on conflict (user_id, item_key) do update set read_at = excluded.read_at;

  -- Les lectures plus vieilles que la fenêtre ne servent plus à rien.
  delete from public.notification_reads
  where user_id = v_uid and read_at < now() - interval '120 days';
  return true;
end;
$$;

-- « Tout marquer comme lu » : une date butoir ; les lectures individuelles
-- qu'elle couvre deviennent inutiles et sont effacées.
create or replace function public.notification_mark_all_read()
returns timestamptz
language plpgsql
volatile
security definer
set search_path = public, pg_catalog
as $$
declare
  v_uid uuid := auth.uid();
  v_now timestamptz := now();
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  if public.is_suspended(v_uid) then
    raise exception 'account_suspended' using errcode = '42501';
  end if;
  insert into public.notification_inbox_state (user_id, read_all_before, updated_at)
  values (v_uid, v_now, v_now)
  on conflict (user_id) do update
    set read_all_before = greatest(public.notification_inbox_state.read_all_before, excluded.read_all_before),
        updated_at = excluded.updated_at;
  delete from public.notification_reads where user_id = v_uid and read_at <= v_now;
  return v_now;
end;
$$;

revoke all on function public.notification_items(timestamptz) from public, anon;
revoke all on function public.notification_inbox(integer, timestamptz, text) from public, anon;
revoke all on function public.notification_summary(timestamptz, jsonb, jsonb) from public, anon;
revoke all on function public.notification_try_timestamptz(text) from public, anon;
revoke all on function public.notification_mark_read(text) from public, anon;
revoke all on function public.notification_mark_all_read() from public, anon;
grant execute on function public.notification_items(timestamptz) to authenticated;
grant execute on function public.notification_inbox(integer, timestamptz, text) to authenticated;
grant execute on function public.notification_summary(timestamptz, jsonb, jsonb) to authenticated;
grant execute on function public.notification_try_timestamptz(text) to authenticated;
grant execute on function public.notification_mark_read(text) to authenticated;
grant execute on function public.notification_mark_all_read() to authenticated;
