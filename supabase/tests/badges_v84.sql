-- Progression des badges v84, sur la vraie base. Étudiants jetables,
-- exception finale : RIEN n'est gardé.
-- Résultat attendu : « BADGES V84 TESTS PASSED ».
-- Dates relatives à aujourd'hui (Bruxelles). La bascule des jours étudiés
-- (5 min) est avancée le temps du test pour que toutes les dates la suivent.

create function pg_temp.sess(u uuid, d date, at time, secs integer, tz text default 'Europe/Brussels', c uuid default null)
returns uuid language plpgsql as $$
declare sid uuid := gen_random_uuid();
begin
  insert into public.sessions (id, user_id, course_id, duration_seconds, started_at, ended_at, timezone)
  values (sid, u, c, secs, (d + at) at time zone tz, (d + at) at time zone tz + make_interval(secs => secs), tz);
  return sid;
end $$;

create function pg_temp.has(u uuid, b text) returns boolean language sql as $$
  select exists (select 1 from public.user_badges where user_id = u and badge_id = b)
$$;

create function pg_temp.course(u uuid, n text) returns uuid language sql as $$
  insert into public.courses (user_id, name) values (u, n) returning id
$$;

do $tests$
declare
  suffix constant text := substr(md5(clock_timestamp()::text), 1, 8);
  n constant integer := 40;
  u uuid[] := array(select gen_random_uuid() from generate_series(1, 40));
  t constant date := (now() at time zone 'Europe/Brussels')::date;
  m0 constant date := (date_trunc('month', t) - interval '3 months')::date;
  w0 constant date := date_trunc('week', t - 140)::date;
  checks integer := 0;
  c1 uuid; c2 uuid; c3 uuid; c4 uuid; c5 uuid;
  g uuid; gc uuid;
  i integer;
  before_count integer;
  xp_expected jsonb := '{"first_session":50,"first_friend":50,"first_exam":50,"first_post":50,"team_spirit":50,
    "hours_10":125,"marathon_day":125,"streak_3":125,"planner":125,"study_buddy":125,
    "hours_50":300,"streak_7":300,"strategist":300,"influencer":300,"steamroller":300,"regular":300,
    "in_the_zone":300,"exam_ready":300,"all_rounder":300,"early_bird":300,
    "hours_100":600,"streak_14":600,"social":600,"referrer":600,"metronome":600,"relentless":600,
    "hours_250":1200,"streak_30":1200,"blocus_architect":1200,"iron_month":1200}';
  k text;
begin
  -- ── Câblage ──────────────────────────────────────────────────────────────
  if pg_get_functiondef('public.award_badges_for_user(uuid)'::regprocedure) !~ 'badge_ids_for_user'
     or pg_get_functiondef('public.badge_ids_for_user(uuid)'::regprocedure) !~ 's.best_streak'
     or pg_get_functiondef('public.badge_ids_for_user(uuid)'::regprocedure) ~ 'current_streak|motivator|community_pillar|lifetime_reactions|community_messages'
     or obj_description('public.badge_ids_for_user(uuid)'::regprocedure, 'pg_proc') !~ '^Badge rules v84 in force since \d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{6}Z$'
     or has_function_privilege('authenticated', 'public.badge_ids_for_user(uuid)', 'execute')
     or has_function_privilege('anon', 'public.badge_ids_for_user(uuid)', 'execute') then
    raise exception 'FAIL [wiring]';
  end if;
  for k in select jsonb_object_keys(xp_expected) loop
    if public.gamification_badge_xp(k) <> (xp_expected ->> k)::integer then raise exception 'FAIL [xp %]', k; end if;
  end loop;
  checks := checks + 2;

  insert into auth.users (id, email, created_at, raw_user_meta_data)
  select u[x], 'badges-v84-' || suffix || '-' || x || '@example.invalid', now() - interval '400 days',
         jsonb_build_object('pseudo', 'bv' || suffix || x, 'study_year', 'BAC 1')
  from generate_series(1, n) x;
  update public.profiles set timezone = 'Europe/Brussels' where id = any(u);
  update public.study_day_rules set new_rules_from = t - 300;

  -- ── Séries : MEILLEURE série officielle ──────────────────────────────────
  -- 5 jours il y a trois semaines, puis plus rien : série en cours 0, badge.
  for i in 0..4 loop perform pg_temp.sess(u[1], t - 25 + i, '10:00', 600); end loop;
  if not pg_temp.has(u[1], 'streak_3') then raise exception 'FAIL [best streak 5]'; end if;
  if (select current_streak from public.study_streaks(u[1])) <> 0 then raise exception 'FAIL [setup: streak still running]'; end if;
  -- 4 jours : plus assez (seuil 3 → 5).
  for i in 0..3 loop perform pg_temp.sess(u[2], t - 25 + i, '10:00', 600); end loop;
  if pg_temp.has(u[2], 'streak_3') then raise exception 'FAIL [4 days is streak_3]'; end if;
  -- 4:59 le troisième jour casse la série (seuil du jour étudié).
  for i in 0..5 loop perform pg_temp.sess(u[3], t - 25 + i, '10:00', case when i = 2 then 299 else 600 end); end loop;
  if pg_temp.has(u[3], 'streak_3') then raise exception 'FAIL [4:59 day counted]'; end if;
  -- 7 jours puis cassure → streak_7 malgré une série en cours de 1.
  for i in 0..6 loop perform pg_temp.sess(u[4], t - 30 + i, '10:00', 600); end loop;
  perform pg_temp.sess(u[4], t - 1, '10:00', 600);
  if not (pg_temp.has(u[4], 'streak_7') and pg_temp.has(u[4], 'streak_3')) or pg_temp.has(u[4], 'streak_14') then
    raise exception 'FAIL [best streak 7]';
  end if;
  checks := checks + 4;

  -- Ancien détenteur (règle 3 jours) : gardé à chaque réévaluation.
  for i in 0..2 loop perform pg_temp.sess(u[5], t - 25 + i, '10:00', 600); end loop;
  insert into public.user_badges (user_id, badge_id, earned_at) values
    (u[5], 'streak_3', now() - interval '60 days'), (u[5], 'planner', now() - interval '60 days'),
    (u[5], 'marathon_day', now() - interval '60 days'), (u[5], 'referrer', now() - interval '60 days');
  perform public.award_badges_for_user(u[5]);
  perform pg_temp.sess(u[5], t - 5, '10:00', 600);
  if (select count(*) from public.user_badges where user_id = u[5] and badge_id in ('streak_3', 'planner', 'marathon_day', 'referrer')) <> 4 then
    raise exception 'FAIL [legacy holder lost a badge]';
  end if;
  checks := checks + 1;

  -- ── Marathon 8 h, passage de minuit, journée > 16 h ──────────────────────
  perform pg_temp.sess(u[6], t - 10, '08:00', 28740);
  if pg_temp.has(u[6], 'marathon_day') then raise exception 'FAIL [7:59 is a marathon]'; end if;
  perform pg_temp.sess(u[6], t - 10, '20:00', 60);
  if not pg_temp.has(u[6], 'marathon_day') then raise exception 'FAIL [8 h not a marathon]'; end if;
  -- 22:00 → 04:00 : 2 h la veille, 4 h le jour J ; + 4 h le jour J = 8 h.
  perform pg_temp.sess(u[7], t - 11, '22:00', 21600);
  if pg_temp.has(u[7], 'marathon_day') then raise exception 'FAIL [6 h split is a marathon]'; end if;
  perform pg_temp.sess(u[7], t - 10, '10:00', 14400);
  if not pg_temp.has(u[7], 'marathon_day') then raise exception 'FAIL [midnight marathon]'; end if;
  -- Ancienne journée de 17 h (avant le plafond) : ni marathon ni grosse journée.
  alter table public.sessions disable trigger validate_new_study_session;
  -- 5 h puis 12 h : la date passe de 5 h à 17 h d'un coup (jamais 8-16 h).
  perform pg_temp.sess(u[8], t - 200, '00:00', 18000);
  perform pg_temp.sess(u[8], t - 200, '05:30', 43200);
  alter table public.sessions enable trigger validate_new_study_session;
  perform public.award_badges_for_user(u[8]);
  if pg_temp.has(u[8], 'marathon_day') then raise exception 'FAIL [17 h day counted]'; end if;
  checks := checks + 3;

  -- ── Rouleau compresseur : 5 dates ≥ 6 h ──────────────────────────────────
  for i in 0..3 loop perform pg_temp.sess(u[9], t - 40 + i * 2, '08:00', 21600); end loop;
  -- + la journée de 17 h, écartée.
  alter table public.sessions disable trigger validate_new_study_session;
  perform pg_temp.sess(u[9], t - 200, '00:00', 18000);
  perform pg_temp.sess(u[9], t - 200, '05:30', 43200);
  alter table public.sessions enable trigger validate_new_study_session;
  perform public.award_badges_for_user(u[9]);
  if pg_temp.has(u[9], 'steamroller') then raise exception 'FAIL [4 big days + 17 h day]'; end if;
  perform pg_temp.sess(u[9], t - 30, '08:00', 21599);
  if pg_temp.has(u[9], 'steamroller') then raise exception 'FAIL [5:59:59 is a big day]'; end if;
  perform pg_temp.sess(u[9], t - 30, '20:00', 1);
  if not pg_temp.has(u[9], 'steamroller') then raise exception 'FAIL [steamroller]'; end if;
  checks := checks + 3;

  -- ── Mois de fer (20 jours dans un mois civil) / Habitué·e ────────────────
  for i in 0..18 loop perform pg_temp.sess(u[10], m0 + i, '10:00', 600); end loop;
  perform pg_temp.sess(u[10], m0 - 1, '10:00', 600);  -- le mois d'avant : ne compte pas
  if pg_temp.has(u[10], 'iron_month') then raise exception 'FAIL [19 days + 1 is iron_month]'; end if;
  if not pg_temp.has(u[10], 'regular') then raise exception 'FAIL [20 studied days not regular]'; end if;
  perform pg_temp.sess(u[10], m0 + 25, '10:00', 600);
  if not pg_temp.has(u[10], 'iron_month') then raise exception 'FAIL [iron_month]'; end if;
  -- 14 jours : pas encore habitué·e ; un jour à 4:59 ne compte pas.
  for i in 0..13 loop perform pg_temp.sess(u[11], t - 60 + i * 2, '10:00', 600); end loop;
  perform pg_temp.sess(u[11], t - 20, '10:00', 299);
  if pg_temp.has(u[11], 'regular') then raise exception 'FAIL [14 days + 4:59 is regular]'; end if;
  perform pg_temp.sess(u[11], t - 20, '12:00', 1);
  if not pg_temp.has(u[11], 'regular') then raise exception 'FAIL [15 days not regular]'; end if;
  checks := checks + 5;

  -- ── Increvable (50 jours étudiés) ─────────────────────────────────────────
  for i in 0..48 loop perform pg_temp.sess(u[12], t - 250 + i * 3, '10:00', 600); end loop;
  if pg_temp.has(u[12], 'relentless') then raise exception 'FAIL [49 days relentless]'; end if;
  perform pg_temp.sess(u[12], t - 2, '10:00', 600);
  if not pg_temp.has(u[12], 'relentless') then raise exception 'FAIL [relentless]'; end if;
  checks := checks + 2;

  -- ── Métronome : 3 semaines CONSÉCUTIVES à ≥ 5 jours ───────────────────────
  for i in 0..4 loop
    perform pg_temp.sess(u[13], w0 + i, '10:00', 600);
    perform pg_temp.sess(u[13], w0 + 7 + i, '10:00', 600);
    perform pg_temp.sess(u[13], w0 + 21 + i, '10:00', 600);  -- semaine 4 : trou en semaine 3
  end loop;
  for i in 0..3 loop perform pg_temp.sess(u[13], w0 + 14 + i, '10:00', 600); end loop;  -- semaine 3 : 4 jours
  if pg_temp.has(u[13], 'metronome') then raise exception 'FAIL [weeks 1,2,4 is metronome]'; end if;
  perform pg_temp.sess(u[13], w0 + 20, '10:00', 600);  -- dimanche de la semaine 3 → 5 jours
  if not pg_temp.has(u[13], 'metronome') then raise exception 'FAIL [metronome]'; end if;
  checks := checks + 2;

  -- ── Dans la zone : 50 sessions de 25 min à 12 h ──────────────────────────
  for i in 0..48 loop perform pg_temp.sess(u[14], t - 60 + i / 5, (time '08:00' + make_interval(hours => (i % 5) * 2)), 1500); end loop;
  perform pg_temp.sess(u[14], t - 40, '08:00', 1499);
  if pg_temp.has(u[14], 'in_the_zone') then raise exception 'FAIL [49 + 24:59 is in_the_zone]'; end if;
  perform pg_temp.sess(u[14], t - 40, '10:00', 1500);
  if not pg_temp.has(u[14], 'in_the_zone') then raise exception 'FAIL [in_the_zone]'; end if;
  checks := checks + 2;

  -- ── Lève-tôt : 5 jours distincts, début 05:00 ≤ h < 08:00, heure locale ──
  perform pg_temp.sess(u[15], t - 30, '05:00', 1500);
  perform pg_temp.sess(u[15], t - 30, '06:00', 1500);           -- même jour : compte une fois
  perform pg_temp.sess(u[15], t - 29, '07:59', 1500);
  perform pg_temp.sess(u[15], t - 28, '04:59', 1500);           -- trop tôt
  perform pg_temp.sess(u[15], t - 27, '08:00', 1500);           -- trop tard
  perform pg_temp.sess(u[15], t - 26, '06:00', 1499);           -- trop court
  -- Heure locale de la SESSION : 06:30 à Tokyo (23:30 la veille à Bruxelles)
  -- et 06:30 à New York (12:30 à Bruxelles) comptent.
  perform pg_temp.sess(u[15], t - 25, '06:30', 1500, 'Asia/Tokyo');
  perform pg_temp.sess(u[15], t - 24, '06:30', 1500, 'America/New_York');
  if pg_temp.has(u[15], 'early_bird') then raise exception 'FAIL [4 early days is early_bird]'; end if;
  perform pg_temp.sess(u[15], t - 23, '12:30', 1500, 'Europe/London');    -- 13:30 Bruxelles, 12:30 local : non
  if pg_temp.has(u[15], 'early_bird') then raise exception 'FAIL [12:30 London is early]'; end if;
  perform pg_temp.sess(u[15], t - 22, '06:00', 1500, 'Europe/London');    -- 07:00 à Bruxelles, 06:00 local
  if not pg_temp.has(u[15], 'early_bird') then raise exception 'FAIL [early_bird with session time zones]'; end if;
  checks := checks + 3;

  -- ── Prêt·e le jour J : 10 h sur le cours, J-14 … J-1 ─────────────────────
  c1 := pg_temp.course(u[16], 'Droit'); c2 := pg_temp.course(u[16], 'Maths');
  insert into public.exams (user_id, name, course_id, exam_date) values (u[16], 'Droit', c1, t - 5);
  perform pg_temp.sess(u[16], t - 19, '10:00', 7200, 'Europe/Brussels', c1);  -- J-14 : compte
  perform pg_temp.sess(u[16], t - 12, '10:00', 7200, 'Europe/Brussels', c1);
  perform pg_temp.sess(u[16], t - 8, '10:00', 7200, 'Europe/Brussels', c1);
  perform pg_temp.sess(u[16], t - 6, '10:00', 10800, 'Europe/Brussels', c1);  -- J-1 : compte
  perform pg_temp.sess(u[16], t - 20, '10:00', 7200, 'Europe/Brussels', c1);  -- J-15 : ne compte pas
  perform pg_temp.sess(u[16], t - 5, '07:00', 7200, 'Europe/Brussels', c1);   -- jour J : ne compte pas
  perform pg_temp.sess(u[16], t - 7, '10:00', 7200, 'Europe/Brussels', c2);   -- autre cours
  if pg_temp.has(u[16], 'exam_ready') then raise exception 'FAIL [9 h on the course is exam_ready]'; end if;
  -- 23:00 à J-2 → 02:00 à J-1 : 3 h dans la fenêtre, au passage de minuit.
  perform pg_temp.sess(u[16], t - 7, '23:00', 10800, 'Europe/Brussels', c1);
  if not pg_temp.has(u[16], 'exam_ready') then raise exception 'FAIL [exam_ready]'; end if;
  -- 23:30 à J-1 → 01:30 le jour J : seule la demi-heure de J-1 compte.
  c3 := pg_temp.course(u[17], 'Chimie');
  insert into public.exams (user_id, name, course_id, exam_date) values (u[17], 'Chimie', c3, t - 5);
  perform pg_temp.sess(u[17], t - 10, '08:00', 34200, 'Europe/Brussels', c3);   -- 9 h 30
  perform pg_temp.sess(u[17], t - 6, '23:30', 7200, 'Europe/Brussels', c3);     -- 30 min à J-1, 1 h 30 le jour J
  if not pg_temp.has(u[17], 'exam_ready') then raise exception 'FAIL [cross-midnight into J-1]'; end if;
  c4 := pg_temp.course(u[18], 'Chimie');
  insert into public.exams (user_id, name, course_id, exam_date) values (u[18], 'Chimie', c4, t - 5);
  perform pg_temp.sess(u[18], t - 10, '08:00', 34200, 'Europe/Brussels', c4);
  perform pg_temp.sess(u[18], t - 6, '23:31', 7200, 'Europe/Brussels', c4);     -- 29 min à J-1
  if pg_temp.has(u[18], 'exam_ready') then raise exception 'FAIL [29 min before midnight is enough]'; end if;
  checks := checks + 4;

  -- ── Tout-terrain : 5 cours à ≥ 5 h ───────────────────────────────────────
  for i in 1..4 loop
    c5 := pg_temp.course(u[19], 'C' || i);
    perform pg_temp.sess(u[19], t - 30 - i, '08:00', 18000, 'Europe/Brussels', c5);
  end loop;
  c5 := pg_temp.course(u[19], 'C5');
  perform pg_temp.sess(u[19], t - 20, '08:00', 17999, 'Europe/Brussels', c5);
  if pg_temp.has(u[19], 'all_rounder') then raise exception 'FAIL [4 courses + 4:59:59]'; end if;
  perform pg_temp.sess(u[19], t - 19, '08:00', 1, 'Europe/Brussels', c5);
  if not pg_temp.has(u[19], 'all_rounder') then raise exception 'FAIL [all_rounder]'; end if;
  checks := checks + 2;

  -- ── Objectifs vérifiés : Planner / Strategist ────────────────────────────
  c1 := pg_temp.course(u[20], 'Histoire');
  for i in 1..9 loop
    perform pg_temp.sess(u[20], t - 40 + i, '10:00', 1800, 'Europe/Brussels', c1);
    insert into public.objectives (user_id, course_id, title, target_minutes, scheduled_date, done)
    values (u[20], c1, 'Lire', 30, t - 40 + i, true);
  end loop;
  -- Pas vérifiables : sans durée cible, pas cochée, autre cours, pas assez étudié.
  insert into public.objectives (user_id, course_id, title, target_minutes, scheduled_date, done) values
    (u[20], c1, 'Sans cible', 0, t - 39, true),
    (u[20], c1, 'Pas cochée', 30, t - 38, false),
    (u[20], null, 'Sans cours', 30, t - 37, true),
    (u[20], c1, 'Trop long', 45, t - 36, true);
  if pg_temp.has(u[20], 'planner') then raise exception 'FAIL [unverifiable objectives counted]'; end if;
  -- Dix objectifs de 30 min le MÊME jour pour 30 min étudiées : un seul vaut.
  perform pg_temp.sess(u[21], t - 12, '10:00', 1800, 'Europe/Brussels', pg_temp.course(u[21], 'Éco'));
  insert into public.objectives (user_id, course_id, title, target_minutes, scheduled_date, done)
  select u[21], (select id from public.courses where user_id = u[21]), 'Spam ' || x, 30, t - 12, true from generate_series(1, 10) x;
  perform public.award_badges_for_user(u[21]);
  if pg_temp.has(u[21], 'planner') then raise exception 'FAIL [one study hour validates ten objectives]'; end if;
  -- Le 10e objectif vérifié : Planner. Il se coche AVANT l'étude (déclencheur séance).
  insert into public.objectives (user_id, course_id, title, target_minutes, scheduled_date, done)
  values (u[20], c1, 'Réviser', 60, t - 20, true);
  perform pg_temp.sess(u[20], t - 20, '14:00', 3600, 'Europe/Brussels', c1);
  if not pg_temp.has(u[20], 'planner') or pg_temp.has(u[20], 'strategist') then raise exception 'FAIL [planner at 10 verified]'; end if;
  checks := checks + 3;

  -- ── Ambassadeur : 5 filleuls ayant étudié ≥ 1 h ──────────────────────────
  for i in 23..27 loop
    insert into public.referrals (referrer_id, referred_id) values (u[22], u[i]);
    perform pg_temp.sess(u[i], t - 3, '10:00', case when i = 27 then 3599 else 3600 end);
  end loop;
  if pg_temp.has(u[22], 'referrer') then raise exception 'FAIL [4 active referrals + 59:59]'; end if;
  -- La session du 5e filleul débloque le badge du parrain (déclencheur).
  perform pg_temp.sess(u[27], t - 2, '10:00', 1);
  if not pg_temp.has(u[22], 'referrer') then raise exception 'FAIL [referrer via referee session]'; end if;
  checks := checks + 2;

  -- ── Binôme : chrono de groupe terminé, ≥ 25 min ensemble ─────────────────
  insert into public.study_groups (name, created_by) values ('v84 ' || suffix, u[28]) returning id into g;
  insert into public.group_members (group_id, user_id, role) values (g, u[28], 'admin'), (g, u[29], 'member'), (g, u[30], 'member');
  -- u28 + u29 ensemble depuis le début ; u30 arrive 10 min avant la fin.
  insert into public.group_chrono_sessions (group_id, started_by, status, started_at)
  values (g, u[28], 'active', now() - interval '40 minutes') returning id into gc;
  insert into public.group_chrono_members (session_id, user_id, status, joined_at) values
    (gc, u[28], 'accepted', now() - interval '40 minutes'),
    (gc, u[29], 'accepted', now() - interval '39 minutes'),
    (gc, u[30], 'accepted', now() - interval '10 minutes');
  perform set_config('request.jwt.claim.sub', u[28]::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', u[28], 'role', 'authenticated')::text, true);
  perform public.finish_group_chrono(gc);
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', '', true);
  if not (pg_temp.has(u[28], 'study_buddy') and pg_temp.has(u[29], 'study_buddy')) then
    raise exception 'FAIL [study_buddy for both participants]';
  end if;
  if pg_temp.has(u[30], 'study_buddy') then raise exception 'FAIL [10 min together is study_buddy]'; end if;
  -- Seul dans son chrono (l'autre n'a jamais rejoint) : non.
  insert into public.study_groups (name, created_by) values ('v84 solo ' || suffix, u[31]) returning id into g;
  insert into public.group_members (group_id, user_id, role) values (g, u[31], 'admin'), (g, u[32], 'member');
  insert into public.group_chrono_sessions (group_id, started_by, status, started_at)
  values (g, u[31], 'active', now() - interval '60 minutes') returning id into gc;
  insert into public.group_chrono_members (session_id, user_id, status, joined_at) values
    (gc, u[31], 'accepted', now() - interval '60 minutes'),
    (gc, u[32], 'invited', null);
  perform set_config('request.jwt.claim.sub', u[31]::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', u[31], 'role', 'authenticated')::text, true);
  perform public.finish_group_chrono(gc);
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', '', true);
  if pg_temp.has(u[31], 'study_buddy') then raise exception 'FAIL [solo chrono is study_buddy]'; end if;
  -- Entrer dans un groupe ne suffit pas.
  if pg_temp.has(u[32], 'study_buddy') then raise exception 'FAIL [joining a group is study_buddy]'; end if;
  checks := checks + 3;

  -- ── Retirés : plus jamais attribués ──────────────────────────────────────
  insert into public.user_activity_totals (user_id, lifetime_posts, lifetime_reactions) values (u[33], 0, 40)
  on conflict (user_id) do update set lifetime_reactions = 40;
  perform pg_temp.sess(u[33], t - 3, '10:00', 600);
  if pg_temp.has(u[33], 'motivator') or pg_temp.has(u[33], 'community_pillar') then raise exception 'FAIL [retired badge awarded]'; end if;
  checks := checks + 1;

  -- ── Idempotence : rien de plus au second passage, rien de retiré ─────────
  select count(*) into before_count from public.user_badges where user_id = any(u);
  for i in 1..n loop perform public.award_badges_for_user(u[i]); end loop;
  if (select count(*) from public.user_badges where user_id = any(u)) <> before_count then raise exception 'FAIL [second pass changed rows]'; end if;
  if exists (select 1 from public.user_badges where user_id = any(u) group by user_id, badge_id having count(*) > 1) then
    raise exception 'FAIL [duplicate badge]';
  end if;
  checks := checks + 2;

  raise exception 'BADGES V84 TESTS PASSED: % checks (everything rolled back)', checks;
end;
$tests$;
