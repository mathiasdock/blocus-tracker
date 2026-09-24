-- v63 — Notifications V1 : demande acceptée et message privé en push,
-- plafond des relances ramené à 2 par 7 jours.
--
-- À APPLIQUER APRÈS le déploiement de /api/push/notify qui comprend les
-- types « friend_accepted » et « private_message » (l'ancienne route les
-- ignorait sans erreur : l'ordre inverse ne casse rien, il ne notifie juste
-- pas).
--
-- Même mécanique que v62_1 : la base appelle la route avec le secret de
-- Vault et un identifiant — jamais le contenu d'un message. La route relit
-- l'événement, applique préférences, suspension, blocage, pause de
-- conversation et anti-doublon. Un échec d'appel ne coûte jamais l'écriture
-- elle-même (bloc d'exception) ; pg_net n'envoie qu'après la validation de
-- la transaction.

-- Appel commun, réservé aux déclencheurs (aucun rôle de l'app).
create or replace function public.push_webhook_call(p_body jsonb)
returns void
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_secret text;
begin
  select ds.decrypted_secret into v_secret
  from vault.decrypted_secrets ds
  where ds.name = 'push_webhook_secret'
  limit 1;
  if v_secret is null then
    return;
  end if;
  perform net.http_post(
    url := 'https://www.blocus-tracker.com/api/push/notify',
    body := p_body,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-webhook-secret', v_secret),
    timeout_milliseconds := 5000
  );
exception when others then
  return;
end;
$$;
revoke all on function public.push_webhook_call(jsonb) from public, anon, authenticated;

-- Demande acceptée : uniquement le passage réel d'en attente à acceptée.
-- Une relecture ou une mise à jour sans changement de statut ne déclenche rien.
create or replace function public.notify_friend_accepted_push()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
begin
  if old.status = 'pending' and new.status = 'accepted' then
    perform public.push_webhook_call(jsonb_build_object('type', 'friend_accepted', 'friendship_id', new.id));
  end if;
  return new;
exception when others then
  return new;
end;
$$;
revoke all on function public.notify_friend_accepted_push() from public, anon, authenticated;

drop trigger if exists push_friend_accepted on public.friendships;
create trigger push_friend_accepted
  after update of status on public.friendships
  for each row
  when (old.status is distinct from new.status)
  execute function public.notify_friend_accepted_push();

-- Message privé : l'identifiant seulement, jamais le texte ni la pièce jointe.
create or replace function public.notify_private_message_push()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
begin
  if new.sender_id is distinct from new.receiver_id then
    perform public.push_webhook_call(jsonb_build_object('type', 'private_message', 'message_id', new.id));
  end if;
  return new;
exception when others then
  return new;
end;
$$;
revoke all on function public.notify_private_message_push() from public, anon, authenticated;

drop trigger if exists push_private_message on public.private_messages;
create trigger push_private_message
  after insert on public.private_messages
  for each row
  execute function public.notify_private_message_push();

-- Relances : au plus 2 par 7 jours glissants (réglable à 1, jamais plus).
update public.notification_settings set reminders_weekly_cap = least(reminders_weekly_cap, 2);
alter table public.notification_settings
  drop constraint if exists notification_settings_reminders_weekly_cap_check;
alter table public.notification_settings
  add constraint notification_settings_reminders_weekly_cap_check check (reminders_weekly_cap between 1 and 2);
alter table public.notification_settings alter column reminders_weekly_cap set default 2;
