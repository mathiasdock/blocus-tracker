-- Migration v38 : consentement aux emails promotionnels (opt-in strict).
--
-- Jusqu'ici Resend ne servait qu'au transactionnel (confirmation, reset), via
-- le SMTP configuré dans Supabase. Pour envoyer des emails promotionnels il
-- faut une base légale distincte : le RGPD ne considère PAS qu'un email donné
-- pour créer un compte vaut consentement marketing. D'où une colonne dédiée,
-- à FALSE par défaut — personne n'est inscrit tant qu'il n'a pas coché.
--
-- Deux points de sécurité, cohérents avec v33 :
--
--   1. `promo_emails` n'est PAS ajouté au GRANT SELECT de `authenticated`.
--      La policy `profiles_read` est `USING (TRUE)` : tout ce qui est accordé
--      à `authenticated` est lisible sur la ligne de N'IMPORTE QUI. Savoir qui
--      accepte le marketing est une donnée personnelle, elle ne regarde que
--      l'intéressé. Même traitement que `email` : lecture via une fonction
--      SECURITY DEFINER qui ne rend que la ligne de l'appelant.
--      L'UPDATE, lui, est accordé — la policy `profiles_update` le borne déjà
--      à `auth.uid() = id`, et Postgres sépare UPDATE et SELECT : le toggle
--      écrit sans avoir besoin de relire.
--
--   2. `promo_emails_at` (horodatage du consentement, la preuve à produire en
--      cas de contrôle) n'est accordé NI en INSERT NI en UPDATE au client.
--      Il est posé par un trigger, donc infalsifiable côté navigateur.
--
-- ⚠️ Tant que cette migration n'est pas exécutée, l'app dégrade proprement :
-- lib/promoEmails.js détecte l'absence de la colonne/RPC et masque le réglage
-- (aucune erreur visible, comportement d'avant conservé).

-- ── 1) Colonnes ─────────────────────────────────────────────────────────────
alter table public.profiles
  add column if not exists promo_emails boolean not null default false;
alter table public.profiles
  add column if not exists promo_emails_at timestamptz;

-- ── 2) Horodatage du consentement, posé côté serveur ────────────────────────
-- La date n'est mise à jour que quand la valeur CHANGE réellement : réécrire
-- `true` sur `true` ne doit pas repousser la preuve de consentement initial.
create or replace function public.stamp_promo_email_consent()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if new.promo_emails then new.promo_emails_at := now(); end if;
    return new;
  end if;

  if new.promo_emails is distinct from old.promo_emails then
    new.promo_emails_at := now();
  else
    -- Empêche un client d'écraser l'horodatage en le renvoyant dans l'UPDATE.
    new.promo_emails_at := old.promo_emails_at;
  end if;
  return new;
end;
$$;

revoke all on function public.stamp_promo_email_consent() from public, anon, authenticated;

drop trigger if exists trg_stamp_promo_email_consent on public.profiles;
create trigger trg_stamp_promo_email_consent
  before insert or update of promo_emails, promo_emails_at on public.profiles
  for each row execute function public.stamp_promo_email_consent();

-- ── 3) Privilèges colonne ───────────────────────────────────────────────────
-- Écriture seulement. Pas de SELECT : voir le point 1 de l'en-tête.
grant insert (promo_emails) on public.profiles to authenticated;
grant update (promo_emails) on public.profiles to authenticated;

-- ── 4) Lecture de SON propre consentement ───────────────────────────────────
-- Même patron que get_my_email() (v12/v24) : SECURITY DEFINER, borné à
-- auth.uid(), jamais exposé à anon.
create or replace function public.get_my_promo_emails()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(promo_emails, false) from public.profiles where id = auth.uid();
$$;

revoke all on function public.get_my_promo_emails() from public, anon;
grant execute on function public.get_my_promo_emails() to authenticated, service_role;

-- ── 5) Liste d'envoi, réservée au service_role ──────────────────────────────
-- Utilisée par /api/admin/sync-audience. Exclut :
--   • les comptes sans email ;
--   • les ~60 comptes legacy en <pseudo>@blocus.local, qui n'ont jamais été de
--     vraies adresses. Les laisser passer produirait des hard bounces, et un
--     taux de bounce élevé abîme la réputation du domaine — donc la délivrance
--     des emails de RÉINITIALISATION DE MOT DE PASSE, qui partent du même
--     domaine. C'est le vrai risque, pas le marketing lui-même.
--   • les comptes verrouillés.
create or replace function public.get_promo_email_audience()
returns table (id uuid, email text, first_name text, promo_emails boolean)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.email, p.first_name, p.promo_emails
  from public.profiles p
  where p.email is not null
    and p.email <> ''
    and p.email not like '%@blocus.local'
    and coalesce(p.locked, false) = false;
$$;

revoke all on function public.get_promo_email_audience() from public, anon, authenticated;
grant execute on function public.get_promo_email_audience() to service_role;

-- ── 6) Index pour la synchro ────────────────────────────────────────────────
create index if not exists profiles_promo_emails_idx
  on public.profiles (promo_emails)
  where promo_emails = true;
