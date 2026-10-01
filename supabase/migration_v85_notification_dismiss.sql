-- v85 — Effacer une notification de la cloche.
--
-- Depuis v64, une notification lue restait dans la cloche jusqu'à sortir de
-- la fenêtre de 60 jours, et une annonce active ou une demande d'ami en
-- attente y restaient pour toujours : aucun moyen de les enlever (signalé par
-- Mathias le 2026-10-01). L'ancienne cloche masquait une annonce, mais sur
-- l'appareil seulement.
--
-- Effacer ne supprime rien à la source : la demande d'ami reste dans Social,
-- le message dans Messages, le commentaire sous la publication, l'annonce
-- chez les autres membres. Seule la ligne quitte la cloche, pour le COMPTE
-- (tous les appareils), et ne compte plus dans sa pastille :
--   notification_dismissals                 une ligne par notification effacée
--   notification_inbox_state.cleared_before « Tout effacer » : une date butoir
-- Même règle que le lu (v64) : une notification effacée revient si elle
-- change APRÈS l'effacement — un nouveau message de la même personne.
--
-- Les lectures restent SECURITY INVOKER (la RLS s'applique). Les écritures
-- passent par deux fonctions qui n'écrivent que pour auth.uid(), et
-- seulement une notification qui le concerne (mêmes contrôles que
-- notification_mark_read). Aucune écriture directe.

-- ── État ────────────────────────────────────────────────────────────────────
create table if not exists public.notification_dismissals (
  user_id uuid not null references auth.users(id) on delete cascade,
  item_key text not null,
  dismissed_at timestamptz not null default now(),
  primary key (user_id, item_key),
  constraint notification_dismissals_key_format check (item_key ~ '^(friend_request|friend_accepted|private_message|comment|reaction|announcement):[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')
);

alter table public.notification_dismissals enable row level security;

drop policy if exists notification_dismissals_select_own on public.notification_dismissals;
create policy notification_dismissals_select_own on public.notification_dismissals
  for select to authenticated using (user_id = (select auth.uid()));

-- Lecture de ses propres lignes seulement ; aucune écriture directe.
revoke all on public.notification_dismissals from public, anon, authenticated;
grant select on public.notification_dismissals to authenticated;

-- « Tout effacer » sans avoir jamais « tout marqué comme lu » : la butoir de
-- lecture peut manquer. Une butoir absente ne marque rien comme lu.
alter table public.notification_inbox_state alter column read_all_before drop not null;
alter table public.notification_inbox_state add column if not exists cleared_before timestamptz;

-- ── Les notifications du membre connecté (v64 + l'effacement) ───────────────
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
  state as (
    select s.read_all_before, s.cleared_before
    from public.notification_inbox_state s join me on s.user_id = me.uid
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
           or exists (select 1 from state s where r.occurred_at <= s.read_all_before)
           or exists (select 1 from public.notification_reads nr join me on nr.user_id = me.uid
                      where nr.item_key = r.item_key and nr.read_at >= r.occurred_at)
         ) as is_read
  from raw r
  where (r.actor_id is null
         or (not public.is_suspended(r.actor_id) and not public.activity_blocked_with(r.actor_id)))
    -- Effacée : d'un coup (« Tout effacer »), ou une par une tant qu'elle n'a
    -- pas changé depuis.
    and not exists (select 1 from state s where r.occurred_at <= s.cleared_before)
    and not exists (select 1 from public.notification_dismissals d join me on d.user_id = me.uid
                    where d.item_key = r.item_key and d.dismissed_at >= r.occurred_at)
$$;

-- ── Écritures : uniquement pour soi ─────────────────────────────────────────
-- Effacer une notification. La clé doit désigner une notification qui
-- concerne vraiment le membre ; sinon rien n'est écrit (renvoie false).
create or replace function public.notification_dismiss(p_key text)
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

  insert into public.notification_dismissals (user_id, item_key, dismissed_at)
  values (v_uid, p_key, now())
  on conflict (user_id, item_key) do update set dismissed_at = excluded.dismissed_at;

  -- Ce qui vit dans la fenêtre de 60 jours n'y revient plus après 120 :
  -- ces effacements-là ne servent plus. Une demande en attente et une
  -- annonce n'ont pas de fenêtre : leur effacement est gardé.
  delete from public.notification_dismissals
  where user_id = v_uid
    and dismissed_at < now() - interval '120 days'
    and item_key ~ '^(friend_accepted|private_message|comment|reaction):';
  return true;
end;
$$;

-- « Tout effacer » : une date butoir. Les effacements et lectures
-- individuels qu'elle couvre deviennent inutiles et sont supprimés.
create or replace function public.notification_dismiss_all()
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
  insert into public.notification_inbox_state (user_id, cleared_before, updated_at)
  values (v_uid, v_now, v_now)
  on conflict (user_id) do update
    set cleared_before = greatest(public.notification_inbox_state.cleared_before, excluded.cleared_before),
        updated_at = excluded.updated_at;
  delete from public.notification_dismissals where user_id = v_uid and dismissed_at <= v_now;
  delete from public.notification_reads where user_id = v_uid and read_at <= v_now;
  return v_now;
end;
$$;

revoke all on function public.notification_dismiss(text) from public, anon;
revoke all on function public.notification_dismiss_all() from public, anon;
grant execute on function public.notification_dismiss(text) to authenticated;
grant execute on function public.notification_dismiss_all() to authenticated;
