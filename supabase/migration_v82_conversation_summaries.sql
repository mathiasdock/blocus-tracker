-- v82 — Page Social : la liste des conversations en UNE requête.
--
-- Avant : pour afficher la liste, l'app lisait les messages non lus, les 100
-- derniers messages, puis UNE requête par ami absent de ces 100 derniers —
-- 27 requêtes pour 31 amis, relancées à chaque message reçu et toutes les
-- 60 s quand une conversation est ouverte (audit du 2026-09-26).
--
-- Maintenant : une ligne par interlocuteur — aperçu du dernier message (160
-- caractères, la liste n'en affiche qu'une ligne), son type, sa date, son
-- auteur, et le nombre de messages non lus de sa part.
--
-- Sécurité : SECURITY INVOKER. La fonction s'exécute avec les droits du
-- membre, donc la règle pm_select (expéditeur ou destinataire = soi)
-- s'applique telle quelle : impossible d'y lire la conversation de quelqu'un
-- d'autre, et rien n'est à dupliquer ici.

create or replace function public.get_my_conversations()
returns table (
  other_id uuid,
  last_content text,
  last_attachment_type text,
  last_created_at timestamptz,
  last_sender_id uuid,
  unread_count integer
)
language sql
stable
security invoker
set search_path = public, pg_catalog
as $$
  with me as (
    select auth.uid() as uid
  ),
  mine as (
    select case when m.sender_id = me.uid then m.receiver_id else m.sender_id end as other_id,
           m.id, m.content, m.attachment_type, m.created_at, m.sender_id, m.receiver_id, m.read
    from public.private_messages m
    cross join me
    where me.uid is not null
      and (m.sender_id = me.uid or m.receiver_id = me.uid)
  ),
  last_message as (
    select distinct on (x.other_id)
           x.other_id, x.content, x.attachment_type, x.created_at, x.sender_id
    from mine x
    order by x.other_id, x.created_at desc, x.id desc
  ),
  unread as (
    select x.other_id, count(*)::integer as n
    from mine x
    cross join me
    where x.receiver_id = me.uid and not x.read
    group by x.other_id
  )
  select l.other_id, left(l.content, 160), l.attachment_type, l.created_at, l.sender_id, coalesce(u.n, 0)
  from last_message l
  left join unread u on u.other_id = l.other_id;
$$;

revoke all on function public.get_my_conversations() from public, anon;
grant execute on function public.get_my_conversations() to authenticated;
