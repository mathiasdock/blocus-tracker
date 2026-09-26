-- v75 — Joker rendu puis jour redevenu non étudié : réactivation (Phase 5A3-bis).
--
-- Décision produit (option B) : si un joker a été rendu parce que son jour
-- protégé est devenu étudié (v74), puis qu'une suppression, une réduction ou
-- un déplacement de session fait repasser ce jour sous le seuil de SA date, on
-- ANNULE le remboursement : le joker original est réactivé. Ce n'est pas une
-- nouvelle pose :
--   · la limite des 31 jours ne s'applique pas ;
--   · la sémantique suit la date protégée (avant le 2026-10-05 : +1 ; après :
--     +0), jamais la date de réactivation — le moteur canonique lit used_on ;
--   · le joker garde sa date d'utilisation d'origine (created_at).
--
-- Stock : on ne reprend que ce qui a été réellement donné.
--   · streak_freeze_refunds.stock_restored = le remboursement a VRAIMENT
--     crédité +1 (stock < 2, joker pris dans le mois de stock en cours).
--     v74 le mettait à vrai même quand le stock plafonnait déjà à 2 ; aucune
--     ligne n'existe encore, le sens est corrigé ici.
--   · réactivation d'un remboursement sans crédit → rien ne change au stock ;
--   · avec crédit → on reprend 1 sur le stock disponible (recharge mensuelle
--     comprise) ; s'il n'y en a plus (crédit dépensé ailleurs), le joker n'est
--     PAS réactivé, le jour redevient manqué et le remboursement est clos
--     (forfeited_at). Jamais de stock négatif, jamais de protection gratuite.
--
-- Historique : une ligne par remboursement ; reactivated_at / forfeited_at la
-- ferment. Un cycle use → refund → reactivation → refund… ajoute des lignes,
-- n'en efface aucune.
--
-- Déclenchement : à la VALIDATION de la transaction (constraint trigger
-- différé), sur l'état final du jour. Une modification de session réécrit ses
-- portions (suppression puis réinsertion) : un contrôle immédiat verrait le jour
-- vide entre les deux et réactiverait puis rembourserait pour rien.

-- ── 1. Historique : fermeture d'un remboursement ────────────────────────────
alter table public.streak_freeze_refunds
  add column if not exists reactivated_at timestamptz,
  add column if not exists reactivation_debited boolean,
  add column if not exists forfeited_at timestamptz;

alter table public.streak_freeze_refunds drop constraint if exists streak_freeze_refunds_closed_once;
alter table public.streak_freeze_refunds add constraint streak_freeze_refunds_closed_once
  check (reactivated_at is null or forfeited_at is null);

create index if not exists streak_freeze_refunds_open_idx
  on public.streak_freeze_refunds (user_id, used_on)
  where reactivated_at is null and forfeited_at is null;

comment on column public.streak_freeze_refunds.stock_restored is
  'Vrai seulement si le remboursement a réellement crédité +1 au stock (v75).';
comment on column public.streak_freeze_refunds.reactivation_debited is
  'Réactivation : 1 joker repris sur le stock (le remboursement l''avait crédité).';
comment on column public.streak_freeze_refunds.forfeited_at is
  'Jour redevenu non étudié mais crédit déjà dépensé et plus aucun joker : pas de réactivation.';

-- ── 2. Réconciliation d'un jour : rembourser OU réactiver ───────────────────
-- Idempotente : relit l'état final du jour ; un second appel ne trouve plus
-- rien à faire. Verrou sur le profil AVANT toute lecture, même ordre que
-- redeem_streak_freezes.
create or replace function public.reconcile_streak_freeze_day(p_user_id uuid, p_day date)
returns text
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_secs bigint;
  v_min integer;
  v_studied boolean;
  v_freeze record;
  v_refund record;
  v_timezone text;
  v_now_month text;
  v_month text;
  v_stock integer;
  v_saved_month text;
  v_credited boolean := false;
  v_debited boolean := false;
  v_internal text;
begin
  -- Verrou d'abord, TOUJOURS : deux transactions qui touchent le même jour
  -- (deux appareils, session renvoyée, joker posé au même instant) passent
  -- l'une après l'autre, et la seconde lit le total laissé par la première.
  select coalesce(p.streak_freezes, 0), p.streak_freeze_month
  into v_stock, v_saved_month
  from public.profiles p where p.id = p_user_id
  for update;
  if not found then
    return 'none';
  end if;

  select coalesce(sum(sd.seconds), 0)::bigint into v_secs
  from public.session_days sd
  where sd.user_id = p_user_id and sd.local_date = p_day;
  v_min := public.study_day_min_seconds(p_day);
  v_studied := v_secs >= v_min;

  v_timezone := coalesce(public.gamification_timezone(p_user_id), 'Europe/Paris');
  v_now_month := to_char((now() at time zone v_timezone)::date, 'YYYY-MM');

  if v_studied then
    -- ── Remboursement (v74) ──
    delete from public.streak_freeze_days f
    where f.user_id = p_user_id and f.used_on = p_day
    returning f.created_at, f.stock_month into v_freeze;
    if not found then
      return 'none';
    end if;
    v_month := coalesce(v_freeze.stock_month, to_char((v_freeze.created_at at time zone v_timezone)::date, 'YYYY-MM'));
    -- Crédit RÉEL : pris ce mois-ci, stock du mois en cours, pas déjà plein.
    v_credited := v_month = v_now_month and v_saved_month is not distinct from v_now_month and v_stock < 2;
    if v_credited then
      v_internal := current_setting('app.gamification_internal', true);
      perform set_config('app.gamification_internal', 'on', true);
      update public.profiles set streak_freezes = v_stock + 1 where id = p_user_id;
      perform set_config('app.gamification_internal', coalesce(v_internal, ''), true);
    end if;
    insert into public.streak_freeze_refunds (user_id, used_on, used_at, stock_month, stock_restored, studied_seconds)
    values (p_user_id, p_day, v_freeze.created_at, v_month, v_credited, v_secs);
    return 'refunded';
  end if;

  -- ── Réactivation : annule le dernier remboursement ouvert ──
  select * into v_refund
  from public.streak_freeze_refunds r
  where r.user_id = p_user_id and r.used_on = p_day
    and r.reactivated_at is null and r.forfeited_at is null
  order by r.refunded_at desc, r.id desc
  limit 1
  for update;
  if not found then
    return 'none';
  end if;

  -- Un joker actif existe déjà (posé à la main entre-temps) : le jour est
  -- protégé, on ne double rien.
  if exists (select 1 from public.streak_freeze_days f where f.user_id = p_user_id and f.used_on = p_day) then
    return 'none';
  end if;

  if v_refund.stock_restored then
    -- Le remboursement avait donné +1 : on le reprend sur le stock disponible
    -- (recharge mensuelle paresseuse comprise). Plus rien → pas de réactivation.
    if v_saved_month is distinct from v_now_month then
      v_stock := 2;
    end if;
    if v_stock < 1 then
      update public.streak_freeze_refunds set forfeited_at = now() where id = v_refund.id;
      return 'forfeited';
    end if;
    v_internal := current_setting('app.gamification_internal', true);
    perform set_config('app.gamification_internal', 'on', true);
    update public.profiles
    set streak_freezes = v_stock - 1, streak_freeze_month = v_now_month
    where id = p_user_id;
    perform set_config('app.gamification_internal', coalesce(v_internal, ''), true);
    v_debited := true;
  end if;

  -- Le joker d'origine, avec sa date d'utilisation et son mois de stock.
  insert into public.streak_freeze_days (user_id, used_on, created_at, stock_month)
  values (p_user_id, p_day, v_refund.used_at, v_refund.stock_month);

  update public.streak_freeze_refunds
  set reactivated_at = now(), reactivation_debited = v_debited
  where id = v_refund.id;
  return 'reactivated';
end;
$$;

revoke all on function public.reconcile_streak_freeze_day(uuid, date) from public, anon, authenticated;

-- ── 3. Déclencheur différé sur les portions de jour ─────────────────────────
-- Insertion (nouvelle session, session modifiée) comme suppression (session
-- supprimée, déplacée, raccourcie, portions réécrites) : chaque jour touché est
-- réconcilié une fois la transaction terminée, sur son total final.
create or replace function public.reconcile_streak_freeze_after_day_part()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
begin
  if tg_op = 'DELETE' then
    perform public.reconcile_streak_freeze_day(old.user_id, old.local_date);
  else
    perform public.reconcile_streak_freeze_day(new.user_id, new.local_date);
  end if;
  return null;
end;
$$;

revoke all on function public.reconcile_streak_freeze_after_day_part() from public, anon, authenticated;

drop trigger if exists b10_refund_streak_freeze on public.session_day_parts;
drop trigger if exists b10_reconcile_streak_freeze on public.session_day_parts;
create constraint trigger b10_reconcile_streak_freeze
  after insert or delete on public.session_day_parts
  deferrable initially deferred
  for each row execute function public.reconcile_streak_freeze_after_day_part();

drop function if exists public.refund_streak_freeze_after_day_part();
drop function if exists public.refund_streak_freeze_for_day(uuid, date);

comment on table public.streak_freeze_refunds is
  'Jokers rendus (v74) puis éventuellement réactivés ou perdus (v75). Écrit uniquement par reconcile_streak_freeze_day.';
