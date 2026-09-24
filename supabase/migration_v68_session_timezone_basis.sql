-- ════════════════════════════════════════════════════════════════════════════
-- v68 — Sémantique du fuseau d'une session : source et preuve
-- ════════════════════════════════════════════════════════════════════════════
--
-- sessions.timezone_source (v65, inchangé) :
--   'device'   fuseau capturé par l'appareil au démarrage du chrono ;
--   'profile'  fuseau du profil, utilisé À L'ENREGISTREMENT quand l'appareil
--              n'en fournit pas (ancienne version de l'app, chrono de groupe) ;
--   'inferred' fuseau reconstruit APRÈS COUP pour une session historique.
--
-- sessions.timezone_basis (nouveau) : la preuve d'une session 'inferred', et
-- seulement d'elle (contrainte). Valeurs de la Phase 3A :
--   'bracketed'    un instantané de fuseau avant ET après la session, à moins
--                  de 7 jours, donnant exactement les mêmes portions ;
--   'near'         un instantané à moins de 7 jours d'un seul côté (ou des deux
--                  sans concordance de nom), tous ceux de ±7 jours donnant les
--                  mêmes portions ;
--   'single_class' aucun instantané à ±7 jours, mais le compte n'a jamais été
--                  observé que dans une seule classe de règles horaires.
-- Instantanés retenus : fuseau des missions quotidiennes/hebdomadaires (sauf
-- 'Europe/Paris', indiscernable de l'ancienne valeur par défaut du profil),
-- fuseau envoyé à l'inscription, fuseau des sessions 'device'. Pas de valeur
-- pour les sessions de confiance faible : elles ne sont pas migrées.
--
-- Ajout pur : aucune ligne existante ne change (toutes ont timezone_basis nul :
-- historiques sans fuseau, ou 'device' / 'profile').
-- ════════════════════════════════════════════════════════════════════════════

alter table public.sessions
  add column if not exists timezone_basis text;

alter table public.sessions
  drop constraint if exists sessions_timezone_basis_check,
  add constraint sessions_timezone_basis_check
    check (timezone_basis is null or timezone_basis in ('bracketed', 'near', 'single_class')),
  drop constraint if exists sessions_timezone_basis_pair_check,
  add constraint sessions_timezone_basis_pair_check
    check ((timezone_basis is not null) = (timezone_source is not distinct from 'inferred'));

comment on column public.sessions.timezone_source is
  'device : capturé par l''appareil · profile : fuseau du profil à l''enregistrement · inferred : reconstruit pour une session historique (v65/v68).';
comment on column public.sessions.timezone_basis is
  'Preuve d''un fuseau inferred : bracketed | near | single_class (v68). Nul pour device/profile et pour les sessions historiques non migrées.';

-- Le déclencheur a01 (v65) fixe fuseau, source et version. Il gère désormais
-- aussi la preuve : jamais fournie par l'app, figée après création.
create or replace function public.set_session_timezone()
returns trigger
language plpgsql
set search_path = public, pg_catalog
as $$
begin
  if tg_op = 'INSERT' then
    if public.is_valid_session_timezone(new.timezone) then
      new.timezone_source := 'device';
    else
      -- Deux instructions distinctes, pas un CASE : PostgreSQL vérifie le droit
      -- d'exécuter CHAQUE fonction d'une expression avant de l'évaluer.
      if current_user in ('anon', 'authenticated') then
        new.timezone := public.session_default_timezone(new.user_id);
      else
        new.timezone := coalesce(public.gamification_timezone(new.user_id), 'Europe/Paris');
      end if;
      new.timezone_source := 'profile';
    end if;
    new.timezone_basis := null;
    new.day_parts_version := 1;
    return new;
  end if;

  -- UPDATE depuis l'app : fuseau, source, preuve et version figés.
  if current_user in ('anon', 'authenticated') then
    new.timezone := old.timezone;
    new.timezone_source := old.timezone_source;
    new.timezone_basis := old.timezone_basis;
    new.day_parts_version := old.day_parts_version;
    return new;
  end if;

  -- UPDATE par la base (rattrapage) : fuseau valide ; la source 'inferred' et
  -- sa preuve sont exigées par les contraintes de v68.
  if new.timezone is distinct from old.timezone and new.timezone is not null then
    if not public.is_valid_session_timezone(new.timezone) then
      raise exception 'Invalid session timezone: %', new.timezone using errcode = '22023';
    end if;
    new.timezone_source := coalesce(new.timezone_source, 'inferred');
    new.day_parts_version := coalesce(new.day_parts_version, 1);
  end if;
  return new;
end;
$$;
