-- Badges et plafond quotidien sur les jours canoniques (v78), sur la vraie
-- base. Étudiants jetables, exception finale : RIEN n'est gardé.
-- Résultat attendu : « BADGES DAILY CAP TESTS PASSED ».
-- Dates relatives à aujourd'hui (Bruxelles) ; la bascule des règles est
-- déplacée le temps du test (la vraie, 2026-10-05, est vérifiée au début).

create function pg_temp.sess(u uuid, d date, at time, secs integer, tz text default 'Europe/Brussels')
returns uuid language plpgsql as $$
declare sid uuid := gen_random_uuid();
begin
  insert into public.sessions (id, user_id, duration_seconds, started_at, ended_at, timezone)
  values (sid, u, secs, (d + at) at time zone tz, (d + at) at time zone tz + make_interval(secs => secs), tz);
  return sid;
end $$;

create function pg_temp.has(u uuid, b text) returns boolean language sql as $$
  select exists (select 1 from public.user_badges where user_id = u and badge_id = b)
$$;

-- Tente une session ; renvoie la date refusée (detail) ou null si acceptée.
create function pg_temp.try_sess(u uuid, d date, at time, secs integer) returns text language plpgsql as $$
declare v_detail text; v_hint text;
begin
  perform pg_temp.sess(u, d, at, secs);
  return null;
exception when invalid_parameter_value then
  get stacked diagnostics v_detail = pg_exception_detail, v_hint = pg_exception_hint;
  if v_hint is distinct from 'daily_cap' then raise; end if;
  return v_detail;
end $$;

do $tests$
declare
  suffix constant text := substr(md5(clock_timestamp()::text), 1, 8);
  u uuid[] := array(select gen_random_uuid() from generate_series(1, 12));
  t constant date := (now() at time zone 'Europe/Brussels')::date;
  checks integer := 0;
  real_over integer;
  s1 uuid;
  refused text;
begin
  -- ── Câblage : plus de moteur legacy, badges sur la série officielle ──────
  if exists (select 1 from pg_proc where proname in ('gamification_current_streak', 'gamification_best_streak'))
     or pg_get_functiondef('public.award_badges_for_user(uuid)'::regprocedure) !~ 'study_streaks'
     or pg_get_functiondef('public.award_badges_for_user(uuid)'::regprocedure) !~ 'from public.session_days sd'
     or pg_get_functiondef('public.validate_new_study_session()'::regprocedure) !~ 'daily_cap'
     or (select new_rules_from from public.study_day_rules) <> date '2026-10-05' then
    raise exception 'FAIL [wiring]';
  end if;
  checks := checks + 1;

  select count(*) into real_over from (
    select 1 from public.session_days group by user_id, local_date having sum(seconds) > 57600
  ) d;

  insert into auth.users (id, email, created_at, raw_user_meta_data)
  select u[i], 'badges-cap-' || suffix || '-' || i || '@example.invalid', now() - interval '120 days',
         jsonb_build_object('pseudo', 'bdc' || suffix || i, 'study_year', 'BAC 1')
  from generate_series(1, 12) i;
  update public.profiles set timezone = 'Europe/Brussels' where id = any(u);
  update public.study_day_rules set new_rules_from = t - 30;

  -- ── Badges de série ──────────────────────────────────────────────────────
  -- 3 jours de 10 min → streak_3.
  perform pg_temp.sess(u[1], t - 3, '10:00', 600);
  perform pg_temp.sess(u[1], t - 2, '10:00', 600);
  perform pg_temp.sess(u[1], t - 1, '10:00', 600);
  if not pg_temp.has(u[1], 'streak_3') then raise exception 'FAIL [streak_3]'; end if;
  -- Après la bascule : 4:59 casse, 5:00 valide.
  perform pg_temp.sess(u[2], t - 3, '10:00', 600);
  s1 := pg_temp.sess(u[2], t - 2, '10:00', 299);
  perform pg_temp.sess(u[2], t - 1, '10:00', 600);
  if pg_temp.has(u[2], 'streak_3') then raise exception 'FAIL [4:59 counted]'; end if;
  perform pg_temp.sess(u[2], t - 2, '15:00', 1);
  if not pg_temp.has(u[2], 'streak_3') then raise exception 'FAIL [5:00 not counted]'; end if;
  checks := checks + 3;

  -- Joker historique (avant la bascule) : +1 → 3 jours.
  perform pg_temp.sess(u[3], t - 3, '10:00', 600);
  perform pg_temp.sess(u[3], t - 1, '10:00', 600);
  insert into public.streak_freeze_days (user_id, used_on) values (u[3], t - 2);
  update public.study_day_rules set new_rules_from = t;
  perform public.award_badges_for_user(u[3]);
  update public.study_day_rules set new_rules_from = t - 30;
  if not pg_temp.has(u[3], 'streak_3') then raise exception 'FAIL [historical freeze +1]'; end if;
  -- Nouveau joker (après la bascule) : neutre, +0 → 2 jours.
  perform pg_temp.sess(u[4], t - 3, '10:00', 600);
  perform pg_temp.sess(u[4], t - 1, '10:00', 600);
  insert into public.streak_freeze_days (user_id, used_on) values (u[4], t - 2);
  perform public.award_badges_for_user(u[4]);
  if pg_temp.has(u[4], 'streak_3') then raise exception 'FAIL [new freeze counted +1]'; end if;
  -- Jour hors blocus : neutre, ne casse pas → 3 jours étudiés.
  insert into public.blocus_periods (user_id, start_date, end_date) values (u[5], t - 10, t - 3), (u[5], t - 1, t + 10);
  perform pg_temp.sess(u[5], t - 4, '10:00', 600);
  perform pg_temp.sess(u[5], t - 3, '10:00', 600);
  perform pg_temp.sess(u[5], t - 1, '10:00', 600);
  if not pg_temp.has(u[5], 'streak_3') then raise exception 'FAIL [off-blocus day broke the streak]'; end if;
  checks := checks + 3;

  -- ── Marathon (≥ 6 h sur une date) ─────────────────────────────────────────
  perform pg_temp.sess(u[6], t - 3, '08:00', 10800);
  if pg_temp.has(u[6], 'marathon_day') then raise exception 'FAIL [3 h is a marathon]'; end if;
  perform pg_temp.sess(u[6], t - 3, '14:00', 10800);
  if not pg_temp.has(u[6], 'marathon_day') then raise exception 'FAIL [3 h + 3 h]'; end if;
  -- 23:00 → 04:00 (1 h la veille, 4 h le jour J) + 2 h le jour J = 6 h le jour J.
  -- L'ancien calcul (jour de début) voyait 5 h la veille, 2 h le jour J.
  perform pg_temp.sess(u[7], t - 4, '23:00', 18000);
  if pg_temp.has(u[7], 'marathon_day') then raise exception 'FAIL [5 h split is a marathon]'; end if;
  perform pg_temp.sess(u[7], t - 3, '10:00', 7200);
  if not pg_temp.has(u[7], 'marathon_day') then raise exception 'FAIL [midnight marathon]'; end if;
  -- 5 h 59 : pas de marathon.
  perform pg_temp.sess(u[8], t - 3, '08:00', 21540);
  if pg_temp.has(u[8], 'marathon_day') then raise exception 'FAIL [5:59 is a marathon]'; end if;
  checks := checks + 3;

  -- Un badge gagné n'est jamais retiré.
  delete from public.sessions where user_id = u[6];
  perform public.award_badges_for_user(u[6]);
  if not pg_temp.has(u[6], 'marathon_day') then raise exception 'FAIL [badge taken back]'; end if;
  checks := checks + 1;

  -- ── Plafond de 16 h par date ─────────────────────────────────────────────
  -- Premier jour : 15 h 30 le jour D, puis 23:00 → 02:00 (1 h sur D) → refusée, D.
  perform pg_temp.sess(u[9], t - 4, '06:00', 28800);
  perform pg_temp.sess(u[9], t - 4, '14:30', 27000);
  refused := pg_temp.try_sess(u[9], t - 4, '23:00', 10800);
  if refused is distinct from (t - 4)::text then raise exception 'FAIL [first-day cap: %]', refused; end if;
  -- Second jour : 15 h 30 le jour D+1, puis D 22:30 → D+1 01:30 (1 h 30 sur
  -- D+1) → refusée, date D+1. L'ancien plafond (jour de début) l'acceptait.
  perform pg_temp.sess(u[10], t - 3, '02:00', 28800);
  perform pg_temp.sess(u[10], t - 3, '11:00', 27000);
  refused := pg_temp.try_sess(u[10], t - 4, '22:30', 10800);
  if refused is distinct from (t - 3)::text then raise exception 'FAIL [second-day cap: %]', refused; end if;
  -- 16 h pile : acceptée.
  perform pg_temp.sess(u[11], t - 4, '06:00', 28800);
  perform pg_temp.sess(u[11], t - 4, '14:30', 25200);
  refused := pg_temp.try_sess(u[11], t - 4, '22:00', 3600);
  if refused is not null then raise exception 'FAIL [exactly 16 h refused: %]', refused; end if;
  -- 12 h par session : toujours refusé au-delà.
  begin
    perform pg_temp.sess(u[11], t - 20, '06:00', 43201);
    raise exception 'FAIL [12 h cap]';
  exception when invalid_parameter_value then
    if sqlerrm !~ '12 hours' then raise; end if;
  end;
  checks := checks + 4;

  -- Ancienne journée > 16 h (comme en mai / juin) : ni effacée ni bloquante
  -- pour une correction à la baisse ; une nouvelle session ce jour-là, elle,
  -- reste refusée.
  alter table public.sessions disable trigger validate_new_study_session;
  s1 := pg_temp.sess(u[12], t - 50, '00:30', 32400);
  perform pg_temp.sess(u[12], t - 50, '10:00', 32400);
  alter table public.sessions enable trigger validate_new_study_session;
  update public.sessions set duration_seconds = 30000, started_at = ended_at - interval '30000 seconds' where id = s1;
  if (select sum(seconds) from public.session_days where user_id = u[12] and local_date = t - 50) <> 62400 then
    raise exception 'FAIL [old over-cap day edit]';
  end if;
  refused := pg_temp.try_sess(u[12], t - 50, '21:00', 600);
  if refused is distinct from (t - 50)::text then raise exception 'FAIL [over-cap day accepts more: %]', refused; end if;
  if (select count(*) from (select 1 from public.session_days where not (user_id = any(u)) group by user_id, local_date having sum(seconds) > 57600) d) <> real_over then
    raise exception 'FAIL [real over-cap days changed]';
  end if;
  checks := checks + 3;

  raise exception 'BADGES DAILY CAP TESTS PASSED: % checks (everything rolled back)', checks;
end;
$tests$;
