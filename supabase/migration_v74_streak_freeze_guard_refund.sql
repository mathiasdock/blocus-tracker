-- v74 — Jokers (gels de série) : attribution vérifiée, remboursement (Phase 5A3).
--
-- La sémantique d'un joker est déjà dans le moteur canonique (v72/v73) :
-- avant le 2026-10-05 il préserve la série et compte +1 ; à partir de cette
-- date il préserve la série, compte +0, et n'est jamais un jour étudié.
-- Cette migration ne touche PAS à cette sémantique ; elle sécurise :
--
--   1. l'ATTRIBUTION : redeem_streak_freezes refuse un jour qui n'est pas
--      'missed' selon study_day_states (déjà étudié, hors blocus…), en plus
--      des règles existantes (≤ 2 à la fois, 31 derniers jours, stock) ;
--   2. le REMBOURSEMENT : quand une session arrivée plus tard (hors ligne,
--      deuxième appareil, chrono resté ouvert, session modifiée) rend le jour
--      protégé réellement 'studied', le joker est retiré de streak_freeze_days,
--      archivé dans streak_freeze_refunds, et le stock rendu s'il a été pris
--      dans le mois de stock en cours.
--
-- Pourquoi une table d'archive plutôt qu'un statut sur streak_freeze_days :
-- streak_freeze_days reste la liste des jokers ACTIFS, que lisent aussi le
-- calcul legacy (missions, badges, défi du jour), le classement, l'export et
-- les clients. Aucun d'eux n'a donc à apprendre à ignorer un joker rendu, et
-- l'historique (utilisé le …, rendu le …) est conservé à part.
--
-- Rien n'est rendu rétroactivement : seuls les jours qui DEVIENNENT étudiés
-- après cette migration déclenchent un remboursement. Les jokers historiques
-- (dont celui du 10 août, posé sur un jour déjà étudié) restent tels quels.

-- ── 1. Mois de stock sur chaque joker ───────────────────────────────────────
-- Le stock se recharge à 2 chaque mois : rendre un joker pris le mois dernier
-- donnerait 3. On note donc le mois de stock où il a été pris. NULL pour les
-- lignes anciennes : on retombe sur created_at dans le fuseau du profil.
alter table public.streak_freeze_days add column if not exists stock_month text;

-- ── 2. Archive des jokers rendus ────────────────────────────────────────────
create table if not exists public.streak_freeze_refunds (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  used_on date not null,
  used_at timestamptz not null,
  stock_month text,
  refunded_at timestamptz not null default now(),
  stock_restored boolean not null,
  studied_seconds bigint not null
);

create index if not exists streak_freeze_refunds_user_idx on public.streak_freeze_refunds (user_id, used_on);

alter table public.streak_freeze_refunds enable row level security;
drop policy if exists sfr_select_own on public.streak_freeze_refunds;
create policy sfr_select_own on public.streak_freeze_refunds
  for select to authenticated using (user_id = (select auth.uid()));
revoke all on public.streak_freeze_refunds from public, anon, authenticated;
grant select on public.streak_freeze_refunds to authenticated;

comment on table public.streak_freeze_refunds is
  'Jokers rendus (v74) : le jour protégé est devenu réellement étudié après coup. Écrit uniquement par refund_streak_freeze_for_day.';

-- ── 3. Remboursement d'un jour ──────────────────────────────────────────────
-- Idempotent et sûr en concurrence :
--   · rien à faire si le jour n'atteint pas le seuil de SA date ;
--   · verrou sur la ligne du profil AVANT de regarder le joker — même ordre
--     que redeem_streak_freezes. Un joker posé en même temps qu'une session
--     arrive est donc soit refusé (redeem voit la session), soit rendu ici ;
--   · DELETE … RETURNING : un seul appelant peut retirer la ligne, les
--     suivants (même session renvoyée, deuxième appareil) ne trouvent rien.
create or replace function public.refund_streak_freeze_for_day(p_user_id uuid, p_day date)
returns boolean
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_secs bigint;
  v_min integer;
  v_freeze record;
  v_timezone text;
  v_now_month text;
  v_month text;
  v_stock integer;
  v_saved_month text;
  v_restored boolean := false;
  v_internal text;
begin
  select coalesce(sum(sd.seconds), 0)::bigint into v_secs
  from public.session_days sd
  where sd.user_id = p_user_id and sd.local_date = p_day;
  v_min := public.study_day_min_seconds(p_day);
  if v_secs < v_min then
    return false;
  end if;

  -- Pas de raccourci « aucun joker ce jour-là » AVANT le verrou : un joker en
  -- cours d'attribution (pas encore visible) serait manqué, et redeem, qui ne
  -- voit pas encore cette session, l'accepterait. Avec le verrou, l'un des deux
  -- attend l'autre et voit son résultat.
  select coalesce(p.streak_freezes, 0), p.streak_freeze_month
  into v_stock, v_saved_month
  from public.profiles p where p.id = p_user_id
  for update;
  if not found then
    return false;
  end if;

  delete from public.streak_freeze_days f
  where f.user_id = p_user_id and f.used_on = p_day
  returning f.created_at, f.stock_month into v_freeze;
  if not found then
    return false;  -- déjà rendu par un appel concurrent
  end if;

  v_timezone := coalesce(public.gamification_timezone(p_user_id), 'Europe/Paris');
  v_now_month := to_char((now() at time zone v_timezone)::date, 'YYYY-MM');
  v_month := coalesce(v_freeze.stock_month, to_char((v_freeze.created_at at time zone v_timezone)::date, 'YYYY-MM'));

  -- Rendu seulement dans le mois de stock en cours : un joker pris un mois
  -- précédent a déjà été « rechargé » par la remise à 2 mensuelle.
  if v_month = v_now_month and v_saved_month is not distinct from v_now_month then
    v_internal := current_setting('app.gamification_internal', true);
    perform set_config('app.gamification_internal', 'on', true);
    update public.profiles set streak_freezes = least(2, v_stock + 1) where id = p_user_id;
    perform set_config('app.gamification_internal', coalesce(v_internal, ''), true);
    v_restored := true;
  end if;

  insert into public.streak_freeze_refunds (user_id, used_on, used_at, stock_month, stock_restored, studied_seconds)
  values (p_user_id, p_day, v_freeze.created_at, v_month, v_restored, v_secs);

  return true;
end;
$$;

revoke all on function public.refund_streak_freeze_for_day(uuid, date) from public, anon, authenticated;

-- ── 4. Déclencheur : chaque part de jour écrite ─────────────────────────────
-- session_day_parts est réécrite à chaque insertion ET modification d'une
-- session (a10_sync_session_day_parts) : c'est l'endroit exact où « le temps
-- d'une date » change. Une suppression ne rend rien et ne reprend rien.
create or replace function public.refund_streak_freeze_after_day_part()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
begin
  perform public.refund_streak_freeze_for_day(new.user_id, new.local_date);
  return null;
end;
$$;

revoke all on function public.refund_streak_freeze_after_day_part() from public, anon, authenticated;

drop trigger if exists b10_refund_streak_freeze on public.session_day_parts;
create trigger b10_refund_streak_freeze
  after insert on public.session_day_parts
  for each row execute function public.refund_streak_freeze_after_day_part();

-- ── 5. Attribution vérifiée par le serveur ──────────────────────────────────
-- Nouveau paramètre p_today : la date de l'appareil, bornée à ±1 jour de la
-- date du serveur (comme get_my_streak), pour qu'un étudiant en voyage puisse
-- protéger SON hier. Les appels existants (p_days seul) restent valides.
drop function if exists public.redeem_streak_freezes(date[]);

create or replace function public.redeem_streak_freezes(p_days date[], p_today date default null)
returns table (remaining_stock integer, used_now integer, freeze_month text)
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_user uuid := auth.uid();
  v_timezone text;
  v_server_today date;
  v_today date;
  v_month text;
  v_days date[] := array[]::date[];
  v_new_days date[] := array[]::date[];
  v_stock integer;
  v_saved_month text;
  v_new_count integer := 0;
  v_bad record;
begin
  if v_user is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  v_timezone := coalesce(public.gamification_timezone(v_user), 'Europe/Paris');
  v_server_today := (now() at time zone v_timezone)::date;
  v_today := case
    when p_today between v_server_today - 1 and v_server_today + 1 then p_today
    else v_server_today
  end;
  -- Le mois de stock reste celui du serveur : on ne recharge pas en avance.
  v_month := to_char(v_server_today, 'YYYY-MM');

  select coalesce(array_agg(day_value order by day_value), array[]::date[])
  into v_days
  from (
    select distinct d as day_value
    from unnest(coalesce(p_days, array[]::date[])) as d
    where d is not null
  ) normalized;

  if cardinality(v_days) > 2 then
    raise exception 'At most two streak freezes can be redeemed'
      using errcode = '22023';
  end if;

  if exists (
    select 1 from unnest(v_days) d
    where d >= v_today or d < v_today - 31
  ) then
    raise exception 'Freeze days must be recent past dates'
      using errcode = '22023';
  end if;

  -- Verrou AVANT de lire les jours : une session qui arrive en même temps
  -- (refund_streak_freeze_for_day) prend le même verrou ; on la voit donc.
  select coalesce(p.streak_freezes, 0), p.streak_freeze_month
  into v_stock, v_saved_month
  from public.profiles p
  where p.id = v_user
  for update;

  if not found then
    raise exception 'Profile not found' using errcode = 'P0002';
  end if;

  if v_saved_month is distinct from v_month then
    v_stock := 2;
  end if;

  -- Un jour déjà protégé est ignoré (appel répété : idempotent).
  select coalesce(array_agg(d order by d), array[]::date[])
  into v_new_days
  from unnest(v_days) d
  where not exists (
    select 1 from public.streak_freeze_days f
    where f.user_id = v_user and f.used_on = d
  );

  -- Chaque nouveau jour doit être réellement 'missed' selon le moteur
  -- canonique : ni étudié (seuil de sa date), ni hors blocus.
  select s.local_date, s.state, s.is_studied, s.outside_blocus
  into v_bad
  from unnest(v_new_days) d
  cross join lateral public.study_day_states(v_user, d, d, v_today) s
  where s.state <> 'missed'
  order by s.local_date
  limit 1;

  if found then
    if v_bad.is_studied then
      raise exception 'Freeze day already studied: %', v_bad.local_date
        using errcode = '22023', hint = 'studied';
    elsif v_bad.outside_blocus then
      raise exception 'Freeze day outside blocus: %', v_bad.local_date
        using errcode = '22023', hint = 'outside_blocus';
    else
      raise exception 'Freeze day not eligible: %', v_bad.local_date
        using errcode = '22023', hint = 'not_missed';
    end if;
  end if;

  v_new_count := cardinality(v_new_days);
  if v_new_count > v_stock then
    raise exception 'Not enough streak freezes available'
      using errcode = '22023';
  end if;

  insert into public.streak_freeze_days (user_id, used_on, stock_month)
  select v_user, d, v_month from unnest(v_new_days) d
  on conflict (user_id, used_on) do nothing;

  perform set_config('app.gamification_internal', 'on', true);
  update public.profiles
  set streak_freezes = v_stock - v_new_count,
      streak_freeze_month = v_month
  where id = v_user;

  return query select v_stock - v_new_count, v_new_count, v_month;
end;
$$;

revoke all on function public.redeem_streak_freezes(date[], date) from public, anon;
grant execute on function public.redeem_streak_freezes(date[], date) to authenticated;
