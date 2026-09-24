-- v62_1 — Le webhook des demandes d'ami bascule sur le secret de Vault.
--
-- À APPLIQUER APRÈS le déploiement de /api/push/notify qui vérifie ce secret
-- (push_webhook_secret_ok, v62). Avant, l'ancienne route refuserait l'appel.
--
-- Avant : un « Database Webhook » Supabase (supabase_functions.http_request)
-- dont l'en-tête contenait un secret faible, écrit en clair dans la
-- définition du déclencheur, et qui envoyait la ligne entière.
-- Après : une fonction lit le secret aléatoire de Vault au moment de l'appel
-- et n'envoie que l'identifiant de la demande ; la route relit la demande en
-- base avant toute notification (jamais le contenu reçu). L'ancien secret
-- n'existe plus nulle part dans la base.
--
-- Échec d'appel : jamais au prix de la demande d'ami elle-même (bloc
-- d'exception), et pg_net n'envoie qu'après la validation de la transaction.

create or replace function public.notify_friend_request_push()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_secret text;
begin
  if new.status is distinct from 'pending' then
    return new;
  end if;
  select ds.decrypted_secret into v_secret
  from vault.decrypted_secrets ds
  where ds.name = 'push_webhook_secret'
  limit 1;
  if v_secret is null then
    return new;
  end if;
  perform net.http_post(
    url := 'https://www.blocus-tracker.com/api/push/notify',
    body := jsonb_build_object('type', 'friend_request', 'friendship_id', new.id),
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-webhook-secret', v_secret),
    timeout_milliseconds := 5000
  );
  return new;
exception when others then
  return new;
end;
$$;
revoke all on function public.notify_friend_request_push() from public, anon, authenticated;

drop trigger if exists push_friend_request on public.friendships;
create trigger push_friend_request
  after insert on public.friendships
  for each row execute function public.notify_friend_request_push();
