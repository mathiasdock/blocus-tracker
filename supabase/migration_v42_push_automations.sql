-- ================================================================
-- migration_v42_push_automations.sql
--
-- Réglages des notifications AUTOMATIQUES (demande d'ami, examen demain,
-- série en danger, relances). Leur texte et leur activation vivaient en dur
-- dans pages/api/push/notify.js et daily.js : impossible d'en couper une ou
-- d'en reformuler une sans redéployer.
--
-- Le catalogue (quand chaque notification part) reste dans le code, à
-- lib/pushAutomations.js — c'est de la logique, pas un réglage. Seuls
-- l'activation, les textes et le lien deviennent modifiables.
--
-- Table VIDE au départ, et c'est voulu : une clé absente signifie « valeurs du
-- code ». Rien ne change tant que l'admin ne touche à rien, et la migration
-- est sans effet observable jusqu'au premier réglage.
--
-- Écriture réservée au service role : ces textes partent sur les téléphones de
-- tous les membres, aucun client ne doit pouvoir les modifier. L'admin passe
-- par /api/admin/push-automations, qui vérifie profiles.is_admin.
--
-- À exécuter dans le SQL Editor Supabase. Idempotent.
-- ================================================================

create table if not exists public.push_automations (
  key         text primary key,
  enabled     boolean not null default true,
  title_fr    text,
  title_en    text,
  body_fr     text,
  body_en     text,
  url         text,
  updated_at  timestamptz not null default now(),
  updated_by  uuid references public.profiles(id) on delete set null,
  constraint push_automations_url_internal
    check (url is null or url like '/%')
);

alter table public.push_automations enable row level security;

-- Aucune politique de lecture ni d'écriture pour anon/authenticated : la table
-- n'est touchée que par la clé service role, depuis les routes serveur.
revoke all on public.push_automations from anon, authenticated;
grant all on public.push_automations to service_role;
