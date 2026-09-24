-- v62 — Notifications : un seul chemin d'envoi, un registre, des préférences
-- qui disent vrai (audit des notifications du 2026-09-24, phases A à E).
--
-- Ce que cette migration ajoute, sans rien retirer de ce qui fonctionne :
--   1. Préférences : un interrupteur général (push_enabled) et la catégorie
--      « social » (push_social), à côté des rappels et des annonces.
--   2. Réglages des rappels automatiques (notification_settings) : le plafond
--      de relances par membre sur 7 jours.
--   3. Appareils abonnés (push_devices) : ce que chaque appareil déclare
--      lui-même à l'activation, au démarrage et à la déconnexion. C'est ce qui
--      permet d'estimer, avant un envoi, combien de membres sont joignables.
--   4. Registre des envois (notification_sends + notification_recipients) :
--      qui, quoi, pourquoi, statut, erreur, clé anti-doublon. Un rappel ne peut
--      plus partir deux fois vers la même personne pour le même jour.
--   5. Filtre d'audience côté base (notification_audience) : compte existant,
--      non suspendu, préférences, blocage, fréquence récente — un seul endroit.
--   6. Nettoyage OneSignal après suppression d'un compte (file
--      push_identity_cleanup, remplie par un déclencheur sur auth.users : tous
--      les chemins de suppression y passent, même le repli direct).
--   7. Annonces bilingues, datées et ciblées (app_announcements) ; les annonces
--      existantes gardent exactement leur visibilité (dates et cible nulles).
--   8. Demande d'ami écartée quand le destinataire a bloqué l'expéditeur.
--   9. Secret du webhook des demandes d'ami, aléatoire, rangé dans Vault et
--      vérifiable par le serveur seul. Le déclencheur est basculé dessus par
--      v62_1, APRÈS le déploiement de la route qui sait le vérifier.
--  10. is_current_user_admin() exclut un admin suspendu (comme assert_admin).
--
-- Idempotente : chaque objet est créé « if not exists » ou remplacé.
-- Aucune donnée existante n'est supprimée ni modifiée (les nouvelles colonnes
-- prennent des valeurs par défaut qui reproduisent le comportement actuel).

-- ── 1. Préférences ──────────────────────────────────────────────────────────
alter table public.user_privacy_settings
  add column if not exists push_enabled boolean not null default true,
  add column if not exists push_social boolean not null default true;

-- La fonction historique reste disponible (compatibilité) et tient compte de
-- l'interrupteur général : « non » à tout vaut « non » à chaque catégorie.
create or replace function public.push_opted_out_users(p_channel text)
returns table (user_id uuid)
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  select s.user_id
  from public.user_privacy_settings s
  where s.push_enabled = false
     or (p_channel = 'reminders'     and s.push_reminders     = false)
     or (p_channel = 'announcements' and s.push_announcements = false)
     or (p_channel = 'social'        and s.push_social        = false);
$$;
revoke all on function public.push_opted_out_users(text) from public, anon, authenticated;
grant execute on function public.push_opted_out_users(text) to service_role;

-- ── 2. Réglages des rappels ─────────────────────────────────────────────────
create table if not exists public.notification_settings (
  id boolean primary key default true check (id),
  reminders_weekly_cap integer not null default 3
    check (reminders_weekly_cap between 1 and 7),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);
insert into public.notification_settings (id) values (true) on conflict (id) do nothing;

alter table public.notification_settings enable row level security;
revoke all on public.notification_settings from public, anon, authenticated;
grant select, insert, update on public.notification_settings to service_role;

-- ── 3. Appareils abonnés ────────────────────────────────────────────────────
-- Aucune donnée OneSignal ici : device_key est un identifiant tiré au hasard
-- par l'appareil lui-même (localStorage), platform une famille grossière.
create table if not exists public.push_devices (
  user_id uuid not null references auth.users(id) on delete cascade,
  device_key uuid not null,
  platform text not null default 'other'
    check (platform in ('ios', 'android', 'macos', 'windows', 'linux', 'other')),
  standalone boolean not null default false,
  status text not null default 'active' check (status in ('active', 'detached')),
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  detached_at timestamptz,
  primary key (user_id, device_key)
);
create index if not exists push_devices_key_idx on public.push_devices (device_key);
create index if not exists push_devices_active_idx
  on public.push_devices (user_id) where status = 'active';

alter table public.push_devices enable row level security;
drop policy if exists push_devices_select_own on public.push_devices;
create policy push_devices_select_own on public.push_devices
  for select to authenticated
  using (user_id = (select auth.uid()));
revoke all on public.push_devices from public, anon, authenticated;
grant select on public.push_devices to authenticated;
grant select, insert, update, delete on public.push_devices to service_role;

-- L'appareil déclare son état pour la personne connectée, et seulement elle.
-- « active » détache le même appareil de tout autre compte : un téléphone
-- partagé ne compte que pour le compte qui l'utilise maintenant.
create or replace function public.push_device_report(
  p_device_key uuid,
  p_status text,
  p_platform text default 'other',
  p_standalone boolean default false
)
returns void
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_uid uuid := auth.uid();
  v_platform text := case when p_platform in ('ios', 'android', 'macos', 'windows', 'linux')
    then p_platform else 'other' end;
begin
  if v_uid is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if p_device_key is null or p_status not in ('active', 'detached') then
    raise exception 'Invalid device report' using errcode = '22023';
  end if;

  if p_status = 'detached' then
    update public.push_devices
    set status = 'detached', detached_at = now()
    where user_id = v_uid and device_key = p_device_key and status = 'active';
    return;
  end if;

  -- Un compte suspendu ne déclare plus d'appareil actif.
  if exists (select 1 from public.profiles where id = v_uid and locked) then
    raise exception 'Account suspended' using errcode = '42501';
  end if;

  update public.push_devices
  set status = 'detached', detached_at = now()
  where device_key = p_device_key and user_id <> v_uid and status = 'active';

  -- Plafond de 20 appareils par compte : le plus ancien laisse sa place.
  if not exists (select 1 from public.push_devices where user_id = v_uid and device_key = p_device_key)
     and (select count(*) from public.push_devices where user_id = v_uid) >= 20 then
    delete from public.push_devices
    where (user_id, device_key) in (
      select user_id, device_key from public.push_devices
      where user_id = v_uid order by last_seen_at asc limit 1
    );
  end if;

  insert into public.push_devices (user_id, device_key, platform, standalone, status, last_seen_at)
  values (v_uid, p_device_key, v_platform, coalesce(p_standalone, false), 'active', now())
  on conflict (user_id, device_key) do update
    set platform = excluded.platform,
        standalone = excluded.standalone,
        status = 'active',
        detached_at = null,
        last_seen_at = now();
end;
$$;
revoke all on function public.push_device_report(uuid, text, text, boolean) from public, anon;
grant execute on function public.push_device_report(uuid, text, text, boolean) to authenticated, service_role;

-- ── 4. Registre des envois ──────────────────────────────────────────────────
-- Une ligne par envoi (un rappel du soir d'un type, une demande d'ami, un
-- envoi admin, une annonce poussée) ; une ligne par destinataire effectivement
-- confié à OneSignal. Les exclusions ne sont gardées qu'en compteurs.
create table if not exists public.notification_sends (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  source text not null check (source in ('automation', 'social', 'admin')),
  category text not null check (category in ('reminder', 'social', 'announcement', 'test')),
  kind text not null check (char_length(kind) between 1 and 40),
  trigger text not null check (char_length(trigger) between 1 and 80),
  author_id uuid references auth.users(id) on delete set null,
  actor_id uuid references auth.users(id) on delete set null,
  target_type text not null
    check (target_type in ('all', 'university', 'users', 'self', 'automation', 'event')),
  target_label text check (target_label is null or char_length(target_label) <= 160),
  title jsonb not null default '{}'::jsonb,
  body jsonb not null default '{}'::jsonb,
  url text check (url is null or char_length(url) <= 300),
  langs text[] not null default array['fr']::text[],
  announcement_id uuid references public.app_announcements(id) on delete set null,
  scheduled_for timestamptz,
  status text not null default 'pending'
    check (status in ('pending', 'sent', 'scheduled', 'partial', 'failed', 'skipped', 'cancelled')),
  targeted integer not null default 0 check (targeted >= 0),
  excluded jsonb not null default '{}'::jsonb,
  eligible integer not null default 0 check (eligible >= 0),
  sent integer not null default 0 check (sent >= 0),
  failed integer not null default 0 check (failed >= 0),
  onesignal_ids text[] not null default array[]::text[],
  error text check (error is null or char_length(error) <= 300),
  idempotency_key text,
  delivery jsonb,
  finished_at timestamptz
);
create unique index if not exists notification_sends_idem_idx
  on public.notification_sends (idempotency_key) where idempotency_key is not null;
create index if not exists notification_sends_created_idx on public.notification_sends (created_at desc);
create index if not exists notification_sends_source_idx on public.notification_sends (source, created_at desc);
create index if not exists notification_sends_kind_idx on public.notification_sends (kind, created_at desc);
create index if not exists notification_sends_author_idx on public.notification_sends (author_id) where author_id is not null;
create index if not exists notification_sends_announcement_idx
  on public.notification_sends (announcement_id) where announcement_id is not null;

create table if not exists public.notification_recipients (
  id bigint generated always as identity primary key,
  send_id uuid not null references public.notification_sends(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  category text not null,
  kind text not null,
  lang text check (lang is null or lang in ('fr', 'en')),
  status text not null default 'queued'
    check (status in ('queued', 'sent', 'scheduled', 'failed', 'unreachable', 'cancelled')),
  error text check (error is null or char_length(error) <= 300),
  idempotency_key text,
  onesignal_id text,
  attempts integer not null default 1
);
create unique index if not exists notification_recipients_idem_idx
  on public.notification_recipients (idempotency_key) where idempotency_key is not null;
create index if not exists notification_recipients_user_idx
  on public.notification_recipients (user_id, created_at desc);
create index if not exists notification_recipients_send_idx on public.notification_recipients (send_id);

alter table public.notification_sends enable row level security;
alter table public.notification_recipients enable row level security;
revoke all on public.notification_sends from public, anon, authenticated;
revoke all on public.notification_recipients from public, anon, authenticated;
grant select, insert, update, delete on public.notification_sends to service_role;
grant select, insert, update, delete on public.notification_recipients to service_role;

-- Chacun peut relire ce qui lui a été envoyé (export RGPD), rien d'autre.
drop policy if exists notification_recipients_select_own on public.notification_recipients;
create policy notification_recipients_select_own on public.notification_recipients
  for select to authenticated
  using (user_id = (select auth.uid()));
grant select on public.notification_recipients to authenticated;

-- ── 5. Audience : le seul filtre ────────────────────────────────────────────
-- Une ligne par membre visé. reason NULL = éligible ; sinon, dans l'ordre :
--   missing      compte inexistant ou supprimé (aucune fiche)
--   suspended    compte suspendu
--   general_off  interrupteur général coupé
--   category_off catégorie refusée (rappels, social, annonces)
--   blocked      le membre a bloqué l'auteur de l'événement (p_actor)
-- La catégorie « test » (envoi de contrôle à soi-même) ignore les préférences,
-- jamais la suspension. La fréquence récente est renvoyée en chiffres : le
-- serveur l'applique selon le type de rappel (l'examen n'est pas plafonné).
create or replace function public.notification_audience(
  p_category text,
  p_scope text,
  p_university text default null,
  p_user_ids uuid[] default null,
  p_actor uuid default null
)
returns table (
  user_id uuid,
  reason text,
  lang text,
  timezone text,
  devices integer,
  recent_reminders integer,
  recent_social integer
)
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  with target as (
    select p.id from public.profiles p where p_scope = 'all'
    union
    select p.id from public.profiles p
    where p_scope = 'university' and p_university is not null and p.university = p_university
    union
    select t.id from unnest(coalesce(p_user_ids, array[]::uuid[])) as t(id)
    where p_scope in ('users', 'self') and t.id is not null
  )
  select
    t.id,
    case
      when p.id is null then 'missing'
      when p.locked then 'suspended'
      when p_category <> 'test' and coalesce(s.push_enabled, true) = false then 'general_off'
      when p_category = 'reminder' and coalesce(s.push_reminders, true) = false then 'category_off'
      when p_category = 'social' and coalesce(s.push_social, true) = false then 'category_off'
      when p_category = 'announcement' and coalesce(s.push_announcements, true) = false then 'category_off'
      when p_actor is not null and exists (
        select 1 from public.user_blocks b where b.blocker_id = t.id and b.blocked_id = p_actor
      ) then 'blocked'
      else null
    end,
    case when p.lang in ('fr', 'en') then p.lang else 'fr' end,
    coalesce(p.timezone, 'Europe/Brussels'),
    (select count(*)::integer from public.push_devices d
      where d.user_id = t.id and d.status = 'active' and d.last_seen_at > now() - interval '60 days'),
    case when p_category = 'reminder' then (
      select count(*)::integer from public.notification_recipients r
      where r.user_id = t.id and r.category = 'reminder' and r.kind <> 'exam_tomorrow'
        and r.status in ('queued', 'sent', 'scheduled') and r.created_at > now() - interval '7 days'
    ) else 0 end,
    case when p_category = 'social' then (
      select count(*)::integer from public.notification_recipients r
      where r.user_id = t.id and r.category = 'social'
        and r.status in ('queued', 'sent', 'scheduled') and r.created_at > now() - interval '24 hours'
    ) else 0 end
  from target t
  left join public.profiles p on p.id = t.id
  left join public.user_privacy_settings s on s.user_id = t.id;
$$;
revoke all on function public.notification_audience(text, text, text, uuid[], uuid) from public, anon, authenticated;
grant execute on function public.notification_audience(text, text, text, uuid[], uuid) to service_role;

-- Réserve les destinataires d'un envoi. Une clé déjà prise par un envoi réussi
-- (ou en cours) ne se reprend pas : c'est l'anti-doublon. Une clé dont l'envoi
-- a échoué, n'a trouvé aucun appareil ou a été annulé se reprend.
-- Renvoie les membres réellement réservés : eux seuls partent chez OneSignal.
create or replace function public.notification_claim(p_send_id uuid, p_rows jsonb)
returns table (user_id uuid)
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_category text;
  v_kind text;
begin
  select s.category, s.kind into v_category, v_kind
  from public.notification_sends s where s.id = p_send_id;
  if v_category is null then
    raise exception 'Unknown send' using errcode = '22023';
  end if;

  return query
  with input as (
    select distinct on ((x->>'user_id')::uuid)
      (x->>'user_id')::uuid as uid,
      nullif(x->>'key', '') as idem,
      case when x->>'lang' in ('fr', 'en') then x->>'lang' else null end as lang
    from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) as x
    where (x->>'user_id') is not null
  ),
  claimed as (
    insert into public.notification_recipients as r
      (send_id, user_id, category, kind, lang, idempotency_key, status)
    select p_send_id, i.uid, v_category, v_kind, i.lang, i.idem, 'queued'
    from input i
    where exists (select 1 from auth.users u where u.id = i.uid)
    on conflict (idempotency_key) where idempotency_key is not null
    do update set
      send_id = excluded.send_id,
      category = excluded.category,
      kind = excluded.kind,
      lang = excluded.lang,
      status = 'queued',
      error = null,
      onesignal_id = null,
      created_at = now(),
      attempts = r.attempts + 1
    where r.status in ('failed', 'unreachable', 'cancelled')
    returning r.user_id
  )
  select c.user_id from claimed c;
end;
$$;
revoke all on function public.notification_claim(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.notification_claim(uuid, jsonb) to service_role;

-- Résultat de l'appel OneSignal pour une partie des destinataires.
create or replace function public.notification_mark(
  p_send_id uuid,
  p_user_ids uuid[],
  p_status text,
  p_onesignal_id text default null,
  p_error text default null
)
returns integer
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_count integer;
begin
  if p_status not in ('sent', 'scheduled', 'failed', 'unreachable', 'cancelled') then
    raise exception 'Invalid status' using errcode = '22023';
  end if;
  update public.notification_recipients
  set status = p_status,
      onesignal_id = coalesce(p_onesignal_id, onesignal_id),
      error = left(p_error, 300)
  where send_id = p_send_id
    and (p_user_ids is null or user_id = any(p_user_ids))
    and (status = 'queued' or (p_status = 'cancelled' and status = 'scheduled'));
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;
revoke all on function public.notification_mark(uuid, uuid[], text, text, text) from public, anon, authenticated;
grant execute on function public.notification_mark(uuid, uuid[], text, text, text) to service_role;

-- Chiffres par type de notification (onglet Automatiques).
create or replace function public.notification_kind_stats(p_since timestamptz)
returns table (kind text, sends integer, sent integer, failed integer, last_sent_at timestamptz)
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  select s.kind,
    count(*)::integer,
    coalesce(sum(s.sent), 0)::integer,
    coalesce(sum(s.failed), 0)::integer,
    max(s.created_at) filter (where s.sent > 0)
  from public.notification_sends s
  where s.created_at >= p_since and s.source in ('automation', 'social')
  group by s.kind;
$$;
revoke all on function public.notification_kind_stats(timestamptz) from public, anon, authenticated;
grant execute on function public.notification_kind_stats(timestamptz) to service_role;

-- ── Lectures admin (navigateur, jeton de l'admin, assert_admin) ─────────────
create or replace function public.admin_notification_sends(
  p_source text default null,
  p_from timestamptz default null,
  p_to timestamptz default null,
  p_author uuid default null,
  p_limit integer default 25,
  p_offset integer default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_catalog
as $$
declare
  v_limit integer := least(greatest(coalesce(p_limit, 25), 1), 100);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
  v_rows jsonb;
  v_total integer;
  v_authors jsonb;
begin
  perform public.assert_admin();

  select count(*) into v_total
  from public.notification_sends s
  where (p_source is null or s.source = p_source)
    and (p_from is null or s.created_at >= p_from)
    and (p_to is null or s.created_at < p_to)
    and (p_author is null or s.author_id = p_author);

  select coalesce(jsonb_agg(row_to_json(x)::jsonb order by x.created_at desc), '[]'::jsonb) into v_rows
  from (
    select s.id, s.created_at, s.source, s.category, s.kind, s.trigger,
      s.author_id, a.pseudo as author_pseudo,
      s.target_type, s.target_label, s.title, s.body, s.url, s.langs,
      s.announcement_id, s.scheduled_for, s.status,
      s.targeted, s.excluded, s.eligible, s.sent, s.failed,
      cardinality(s.onesignal_ids) as onesignal_batches,
      s.error, s.delivery, s.finished_at
    from public.notification_sends s
    left join public.profiles a on a.id = s.author_id
    where (p_source is null or s.source = p_source)
      and (p_from is null or s.created_at >= p_from)
      and (p_to is null or s.created_at < p_to)
      and (p_author is null or s.author_id = p_author)
    order by s.created_at desc
    limit v_limit offset v_offset
  ) x;

  select coalesce(jsonb_agg(jsonb_build_object('id', y.author_id, 'pseudo', y.pseudo) order by y.pseudo), '[]'::jsonb)
  into v_authors
  from (
    select distinct s.author_id, p.pseudo
    from public.notification_sends s
    join public.profiles p on p.id = s.author_id
    where s.author_id is not null
  ) y;

  return jsonb_build_object('rows', v_rows, 'total', v_total, 'authors', v_authors, 'generated_at', now());
end;
$$;
revoke all on function public.admin_notification_sends(text, timestamptz, timestamptz, uuid, integer, integer) from public, anon;
grant execute on function public.admin_notification_sends(text, timestamptz, timestamptz, uuid, integer, integer) to authenticated;

create or replace function public.admin_member_notifications(p_user uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_catalog
as $$
declare
  v_prefs jsonb;
  v_devices jsonb;
  v_diag jsonb;
  v_recent jsonb;
begin
  perform public.assert_admin();

  select jsonb_build_object(
      'push_enabled', coalesce(s.push_enabled, true),
      'push_reminders', coalesce(s.push_reminders, true),
      'push_social', coalesce(s.push_social, true),
      'push_announcements', coalesce(s.push_announcements, true),
      'updated_at', s.updated_at,
      'recorded', s.user_id is not null
    ) into v_prefs
  from (select p_user as uid) q
  left join public.user_privacy_settings s on s.user_id = q.uid;

  select coalesce(jsonb_agg(jsonb_build_object(
      'platform', d.platform, 'standalone', d.standalone, 'status', d.status,
      'created_at', d.created_at, 'last_seen_at', d.last_seen_at, 'detached_at', d.detached_at
    ) order by d.status, d.last_seen_at desc), '[]'::jsonb)
  into v_devices
  from public.push_devices d where d.user_id = p_user;

  select jsonb_build_object('at', g.created_at, 'reason', g.reason) into v_diag
  from public.push_diagnostics g where g.user_id = p_user
  order by g.created_at desc limit 1;

  select coalesce(jsonb_agg(jsonb_build_object(
      'at', r.created_at, 'category', r.category, 'kind', r.kind, 'status', r.status,
      'source', s.source, 'title', s.title
    ) order by r.created_at desc), '[]'::jsonb)
  into v_recent
  from (
    select * from public.notification_recipients
    where user_id = p_user order by created_at desc limit 6
  ) r
  join public.notification_sends s on s.id = r.send_id;

  return jsonb_build_object(
    'user_id', p_user,
    'exists', exists (select 1 from public.profiles where id = p_user),
    'suspended', coalesce((select locked from public.profiles where id = p_user), false),
    'prefs', v_prefs,
    'devices', v_devices,
    'last_diagnostic', v_diag,
    'recent', v_recent,
    'generated_at', now()
  );
end;
$$;
revoke all on function public.admin_member_notifications(uuid) from public, anon;
grant execute on function public.admin_member_notifications(uuid) to authenticated;

-- ── 6. Suppression d'un compte → nettoyage chez OneSignal ────────────────────
-- Tous les chemins de suppression finissent par « delete from auth.users » :
-- le déclencheur y inscrit l'identifiant, le serveur supprime ensuite
-- l'utilisateur OneSignal (et ses abonnements), puis efface la ligne.
create table if not exists public.push_identity_cleanup (
  external_id text primary key check (char_length(external_id) between 1 and 64),
  created_at timestamptz not null default now(),
  attempts integer not null default 0,
  last_attempt_at timestamptz,
  last_error text check (last_error is null or char_length(last_error) <= 200)
);
alter table public.push_identity_cleanup enable row level security;
revoke all on public.push_identity_cleanup from public, anon, authenticated;
grant select, insert, update, delete on public.push_identity_cleanup to service_role;

create or replace function public.enqueue_push_identity_cleanup()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
begin
  insert into public.push_identity_cleanup (external_id)
  values (old.id::text)
  on conflict (external_id) do nothing;
  return old;
exception when others then
  -- Jamais au prix de la suppression elle-même.
  return old;
end;
$$;
revoke all on function public.enqueue_push_identity_cleanup() from public, anon, authenticated;

drop trigger if exists enqueue_push_identity_cleanup on auth.users;
create trigger enqueue_push_identity_cleanup
  after delete on auth.users
  for each row execute function public.enqueue_push_identity_cleanup();

-- ── 7. Annonces bilingues, datées, ciblées ──────────────────────────────────
alter table public.app_announcements
  add column if not exists title_en text,
  add column if not exists message_en text,
  add column if not exists starts_at timestamptz,
  add column if not exists ends_at timestamptz,
  add column if not exists audience text not null default 'all',
  add column if not exists audience_university text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'app_announcements_title_en_len') then
    alter table public.app_announcements add constraint app_announcements_title_en_len
      check (title_en is null or char_length(btrim(title_en)) between 1 and 120);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'app_announcements_message_en_len') then
    alter table public.app_announcements add constraint app_announcements_message_en_len
      check (message_en is null or char_length(btrim(message_en)) between 1 and 500);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'app_announcements_window') then
    alter table public.app_announcements add constraint app_announcements_window
      check (ends_at is null or starts_at is null or ends_at > starts_at);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'app_announcements_audience') then
    alter table public.app_announcements add constraint app_announcements_audience
      check (
        (audience = 'all' and audience_university is null)
        or (audience = 'university' and char_length(btrim(coalesce(audience_university, ''))) between 1 and 160)
      );
  end if;
end;
$$;

-- Même règle qu'avant pour une annonce sans dates ni cible (les 4 annonces
-- existantes) ; en plus : pas avant sa date de début, plus après sa date de
-- fin, et seulement pour l'établissement visé. Les admins voient tout.
drop policy if exists "app_announcements_select_active_or_admin" on public.app_announcements;
create policy "app_announcements_select_active_or_admin" on public.app_announcements
  for select to authenticated
  using (
    (
      is_active = true
      and (starts_at is null or starts_at <= now())
      and (ends_at is null or ends_at > now())
      and (
        audience = 'all'
        or (audience = 'university' and audience_university = (
          select p.university from public.profiles p where p.id = (select auth.uid())
        ))
      )
    )
    or public.is_current_user_admin()
  );

-- ── 8. Pas de demande d'ami de la part d'un étudiant bloqué ─────────────────
-- Une règle d'accès ne suffit pas : l'expéditeur ne peut pas lire les blocages
-- des autres, la règle ne verrait donc jamais le sien. Le déclencheur, lui,
-- les lit, et écarte la demande SANS erreur : comme dans les salles de cours,
-- l'étudiant bloqué n'apprend jamais qu'il l'est (la demande reste sans suite,
-- aucune ligne, donc ni notification ni XP).
create or replace function public.drop_blocked_friend_request()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
begin
  if exists (
    select 1 from public.user_blocks b
    where b.blocker_id = new.addressee and b.blocked_id = new.requester
  ) then
    return null;
  end if;
  return new;
end;
$$;
revoke all on function public.drop_blocked_friend_request() from public, anon, authenticated;

drop trigger if exists a05_drop_blocked_friend_request on public.friendships;
create trigger a05_drop_blocked_friend_request
  before insert on public.friendships
  for each row execute function public.drop_blocked_friend_request();

-- ── 9. Secret du webhook des demandes d'ami ─────────────────────────────────
-- Tiré au hasard DANS la base (256 bits) : personne n'a à le lire ni à le
-- recopier. Le déclencheur le lit dans Vault au moment d'appeler la route
-- (v62_1) ; la route le vérifie par cette fonction, réservée au serveur.
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'push_webhook_secret') then
    perform vault.create_secret(
      encode(extensions.gen_random_bytes(32), 'hex'),
      'push_webhook_secret',
      'Secret du webhook des demandes d''ami (v62)'
    );
  end if;
end;
$$;

create or replace function public.push_webhook_secret_ok(p_secret text)
returns boolean
language plpgsql
stable
security definer
set search_path = public, pg_catalog
as $$
declare
  v_secret text;
begin
  if p_secret is null or char_length(p_secret) < 32 then
    return false;
  end if;
  select ds.decrypted_secret into v_secret
  from vault.decrypted_secrets ds
  where ds.name = 'push_webhook_secret'
  limit 1;
  return v_secret is not null and v_secret = p_secret;
end;
$$;
revoke all on function public.push_webhook_secret_ok(text) from public, anon, authenticated;
grant execute on function public.push_webhook_secret_ok(text) to service_role;

-- ── 10. Un admin suspendu n'est plus admin, nulle part ──────────────────────
create or replace function public.is_current_user_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select is_admin and not locked
    from public.profiles
    where id = auth.uid()
  ), false);
$$;
revoke all on function public.is_current_user_admin() from public, anon;
grant execute on function public.is_current_user_admin() to authenticated, service_role;

-- ── 11. Verrou des comptes suspendus sur les nouvelles tables ───────────────
-- Règle de la phase 1 (v57) : toute table publique refuse l'écriture d'un
-- compte suspendu. Le serveur (service role) et la suppression de son propre
-- compte (blocus.self_delete) restent autorisés par la fonction elle-même.
do $$
declare
  t text;
begin
  foreach t in array array['notification_settings', 'push_devices', 'notification_sends',
                           'notification_recipients', 'push_identity_cleanup']
  loop
    execute format('drop trigger if exists a00_block_suspended_actor on public.%I', t);
    execute format(
      'create trigger a00_block_suspended_actor before insert or update or delete on public.%I '
      'for each row execute function public.block_suspended_actor()', t);
  end loop;
end;
$$;
