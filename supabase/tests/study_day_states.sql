-- Modèle canonique des jours d'étude (v71, règles versionnées en v72), sur la vraie base. Crée des
-- étudiants jetables, rejoue les cas de tests/fixtures/study-day-states-cases.json
-- (recopié ci-dessous entre les marqueurs FIXTURE ; tests/study-day-states.test.mjs
-- vérifie que c'est exactement le même), puis lève une exception : RIEN n'est gardé.
--
-- À lancer après v72, ou dans le MÊME appel execute_sql juste après son SQL.
-- Chaque cas pose SA date de bascule (dans le passé : la base refuse les
-- sessions futures) ; la vraie date, 2026-10-05, est vérifiée à part.
-- Résultat attendu : « STUDY DAY STATES TESTS PASSED ».

do $tests$
declare
-- FIXTURE BEGIN
  fixture constant jsonb := $fixture${
  "_comment": "Cas du modèle canonique des jours (v71, règles versionnées en v72). Utilisés tels quels par tests/study-day-states.test.mjs (JavaScript) et supabase/tests/study_day_states.sql (PostgreSQL, JSON recopié entre les marqueurs FIXTURE). Heures en UTC ; Bruxelles = UTC+2, New York = UTC-4 en septembre 2026. ended_at = started_at + duration_seconds. legacy = la session perd son fuseau après insertion (règle historique Bruxelles, jour de début, durée entière). late = insérée après une première vérification (session hors ligne synchronisée ensuite). new_rules_from = date de bascule propre au cas (en production : 2026-10-05) ; on la place dans le passé pour pouvoir insérer des sessions des deux côtés, la base refusant les sessions futures.",
  "cases": [
    {
      "name": "seuils : 1 s, 4 min 59, 5 min, plusieurs sessions, avant et après la bascule",
      "new_rules_from": "2026-09-10",
      "today": "2026-09-20",
      "from": "2026-09-04",
      "to": "2026-09-20",
      "sessions": [
        {
          "started_at": "2026-09-05T10:00:00Z",
          "duration_seconds": 1,
          "timezone": "Europe/Brussels"
        },
        {
          "started_at": "2026-09-15T10:00:00Z",
          "duration_seconds": 1,
          "timezone": "Europe/Brussels"
        },
        {
          "started_at": "2026-09-16T10:00:00Z",
          "duration_seconds": 299,
          "timezone": "Europe/Brussels"
        },
        {
          "started_at": "2026-09-17T10:00:00Z",
          "duration_seconds": 300,
          "timezone": "Europe/Brussels"
        },
        {
          "started_at": "2026-09-18T08:00:00Z",
          "duration_seconds": 120,
          "timezone": "Europe/Brussels"
        },
        {
          "started_at": "2026-09-18T15:00:00Z",
          "duration_seconds": 180,
          "timezone": "Europe/Brussels"
        },
        {
          "started_at": "2026-09-19T10:00:00Z",
          "duration_seconds": 600,
          "timezone": "Europe/Brussels"
        }
      ],
      "freezes": [],
      "blocus": [],
      "expect": {
        "states": {
          "2026-09-04": "missed",
          "2026-09-05": "studied",
          "2026-09-06": "missed",
          "2026-09-09": "missed",
          "2026-09-10": "missed",
          "2026-09-15": "missed",
          "2026-09-16": "missed",
          "2026-09-17": "studied",
          "2026-09-18": "studied",
          "2026-09-19": "studied",
          "2026-09-20": "pending"
        },
        "seconds": {
          "2026-09-05": 1,
          "2026-09-15": 1,
          "2026-09-16": 299,
          "2026-09-17": 300,
          "2026-09-18": 300
        },
        "min_seconds": {
          "2026-09-09": 1,
          "2026-09-10": 300
        },
        "current": 3,
        "best": 3,
        "studied_days": 4
      }
    },
    {
      "name": "minuit : 23:30→00:30, 23:55→00:05, 23:59→00:01 avant et après la bascule",
      "new_rules_from": "2026-09-10",
      "today": "2026-09-20",
      "from": "2026-09-03",
      "to": "2026-09-20",
      "sessions": [
        {
          "started_at": "2026-09-03T21:59:00Z",
          "duration_seconds": 120,
          "timezone": "Europe/Brussels"
        },
        {
          "started_at": "2026-09-15T21:55:00Z",
          "duration_seconds": 600,
          "timezone": "Europe/Brussels"
        },
        {
          "started_at": "2026-09-17T21:30:00Z",
          "duration_seconds": 3600,
          "timezone": "Europe/Brussels"
        },
        {
          "started_at": "2026-09-18T21:59:00Z",
          "duration_seconds": 120,
          "timezone": "Europe/Brussels"
        }
      ],
      "freezes": [],
      "blocus": [],
      "expect": {
        "states": {
          "2026-09-03": "studied",
          "2026-09-04": "studied",
          "2026-09-05": "missed",
          "2026-09-14": "missed",
          "2026-09-15": "studied",
          "2026-09-16": "studied",
          "2026-09-17": "studied",
          "2026-09-18": "studied",
          "2026-09-19": "missed",
          "2026-09-20": "pending"
        },
        "seconds": {
          "2026-09-03": 60,
          "2026-09-04": 60,
          "2026-09-15": 300,
          "2026-09-16": 300,
          "2026-09-17": 1800,
          "2026-09-18": 1860,
          "2026-09-19": 60
        },
        "current": 0,
        "best": 4,
        "studied_days": 6
      }
    },
    {
      "name": "jokers et hors blocus : neutres, ne comptent pas, ne cassent pas",
      "new_rules_from": "2026-09-10",
      "today": "2026-09-20",
      "from": "2026-09-06",
      "to": "2026-09-20",
      "sessions": [
        {
          "started_at": "2026-09-08T10:00:00Z",
          "duration_seconds": 600,
          "timezone": "Europe/Brussels"
        },
        {
          "started_at": "2026-09-13T10:00:00Z",
          "duration_seconds": 600,
          "timezone": "Europe/Brussels"
        },
        {
          "started_at": "2026-09-14T10:00:00Z",
          "duration_seconds": 600,
          "timezone": "Europe/Brussels"
        },
        {
          "started_at": "2026-09-16T10:00:00Z",
          "duration_seconds": 600,
          "timezone": "Europe/Brussels"
        },
        {
          "started_at": "2026-09-18T10:00:00Z",
          "duration_seconds": 600,
          "timezone": "Europe/Brussels"
        },
        {
          "started_at": "2026-09-19T10:00:00Z",
          "duration_seconds": 600,
          "timezone": "Europe/Brussels"
        }
      ],
      "freezes": [
        "2026-09-14",
        "2026-09-15",
        "2026-09-17"
      ],
      "blocus": [
        [
          "2026-09-12",
          "2026-09-30"
        ]
      ],
      "expect": {
        "states": {
          "2026-09-06": "neutral",
          "2026-09-07": "neutral",
          "2026-09-08": "studied",
          "2026-09-09": "neutral",
          "2026-09-11": "neutral",
          "2026-09-12": "missed",
          "2026-09-13": "studied",
          "2026-09-14": "studied",
          "2026-09-15": "neutral",
          "2026-09-16": "studied",
          "2026-09-17": "neutral",
          "2026-09-18": "studied",
          "2026-09-19": "studied",
          "2026-09-20": "pending"
        },
        "flags": {
          "2026-09-14": {
            "has_freeze": true,
            "outside_blocus": false,
            "preserves_streak": true,
            "increments_streak": true
          },
          "2026-09-15": {
            "has_freeze": true,
            "outside_blocus": false,
            "preserves_streak": true,
            "increments_streak": false
          },
          "2026-09-08": {
            "has_freeze": false,
            "outside_blocus": true,
            "preserves_streak": true,
            "increments_streak": true
          },
          "2026-09-12": {
            "has_freeze": false,
            "outside_blocus": false,
            "preserves_streak": false,
            "increments_streak": false
          }
        },
        "current": 5,
        "best": 5,
        "studied_days": 6
      }
    },
    {
      "name": "jokers historiques (+1) puis joker après la bascule (+0), série à cheval sur la bascule",
      "new_rules_from": "2026-09-10",
      "today": "2026-09-13",
      "from": "2026-09-04",
      "to": "2026-09-13",
      "sessions": [
        {
          "started_at": "2026-09-04T10:00:00Z",
          "duration_seconds": 600,
          "timezone": "Europe/Brussels"
        },
        {
          "started_at": "2026-09-07T10:00:00Z",
          "duration_seconds": 1,
          "timezone": "Europe/Brussels"
        },
        {
          "started_at": "2026-09-08T10:00:00Z",
          "duration_seconds": 600,
          "timezone": "Europe/Brussels"
        },
        {
          "started_at": "2026-09-09T10:00:00Z",
          "duration_seconds": 600,
          "timezone": "Europe/Brussels"
        },
        {
          "started_at": "2026-09-10T10:00:00Z",
          "duration_seconds": 300,
          "timezone": "Europe/Brussels"
        },
        {
          "started_at": "2026-09-12T10:00:00Z",
          "duration_seconds": 600,
          "timezone": "Europe/Brussels"
        }
      ],
      "freezes": [
        "2026-09-05",
        "2026-09-06",
        "2026-09-11"
      ],
      "blocus": [],
      "expect": {
        "states": {
          "2026-09-04": "studied",
          "2026-09-05": "neutral",
          "2026-09-06": "neutral",
          "2026-09-07": "studied",
          "2026-09-08": "studied",
          "2026-09-09": "studied",
          "2026-09-10": "studied",
          "2026-09-11": "neutral",
          "2026-09-12": "studied",
          "2026-09-13": "pending"
        },
        "flags": {
          "2026-09-05": {
            "is_studied": false,
            "has_freeze": true,
            "outside_blocus": false,
            "preserves_streak": true,
            "increments_streak": true
          },
          "2026-09-06": {
            "is_studied": false,
            "has_freeze": true,
            "outside_blocus": false,
            "preserves_streak": true,
            "increments_streak": true
          },
          "2026-09-11": {
            "is_studied": false,
            "has_freeze": true,
            "outside_blocus": false,
            "preserves_streak": true,
            "increments_streak": false
          },
          "2026-09-13": {
            "is_studied": false,
            "has_freeze": false,
            "outside_blocus": false,
            "preserves_streak": false,
            "increments_streak": false
          }
        },
        "min_seconds": {
          "2026-09-09": 1,
          "2026-09-10": 300
        },
        "current": 8,
        "best": 8,
        "studied_days": 6
      }
    },
    {
      "name": "voyage Bruxelles → New York, une session legacy, puis profil changé : aucun jour ne bouge",
      "new_rules_from": null,
      "today": "2026-09-20",
      "from": "2026-09-15",
      "to": "2026-09-20",
      "sessions": [
        {
          "started_at": "2026-09-16T21:30:00Z",
          "duration_seconds": 3600,
          "timezone": "Europe/Brussels",
          "legacy": true
        },
        {
          "started_at": "2026-09-17T18:00:00Z",
          "duration_seconds": 600,
          "timezone": "Europe/Brussels"
        },
        {
          "started_at": "2026-09-19T03:30:00Z",
          "duration_seconds": 1800,
          "timezone": "America/New_York"
        },
        {
          "started_at": "2026-09-20T02:00:00Z",
          "duration_seconds": 600,
          "timezone": "America/New_York"
        }
      ],
      "freezes": [],
      "blocus": [],
      "profile_timezone_after": "Asia/Tokyo",
      "expect": {
        "states": {
          "2026-09-15": "missed",
          "2026-09-16": "studied",
          "2026-09-17": "studied",
          "2026-09-18": "studied",
          "2026-09-19": "studied",
          "2026-09-20": "pending"
        },
        "seconds": {
          "2026-09-16": 3600,
          "2026-09-18": 1800,
          "2026-09-19": 600
        },
        "current": 4,
        "best": 4,
        "studied_days": 4
      }
    },
    {
      "name": "session hors ligne synchronisée plus tard : le jour manqué devient étudié",
      "new_rules_from": "2026-09-10",
      "today": "2026-09-20",
      "from": "2026-09-17",
      "to": "2026-09-20",
      "sessions": [
        {
          "started_at": "2026-09-17T10:00:00Z",
          "duration_seconds": 600,
          "timezone": "Europe/Brussels"
        },
        {
          "started_at": "2026-09-18T10:00:00Z",
          "duration_seconds": 600,
          "timezone": "Europe/Brussels"
        },
        {
          "started_at": "2026-09-19T20:00:00Z",
          "duration_seconds": 600,
          "timezone": "Europe/Brussels",
          "late": true
        }
      ],
      "freezes": [],
      "blocus": [],
      "expect_before_late": {
        "states": {
          "2026-09-19": "missed"
        },
        "current": 0
      },
      "expect": {
        "states": {
          "2026-09-17": "studied",
          "2026-09-18": "studied",
          "2026-09-19": "studied",
          "2026-09-20": "pending"
        },
        "current": 3,
        "best": 3,
        "studied_days": 3
      }
    }
  ]
}$fixture$;
-- FIXTURE END
  suffix constant text := substr(md5(clock_timestamp()::text), 1, 8);
  c jsonb;
  s jsonb;
  k text;
  v jsonb;
  uid uuid;
  sid uuid;
  i integer := 0;
  checks integer := 0;
  got record;
  streaks record;
  expect jsonb;
  phase text;
begin
  -- ── Structure et droits ────────────────────────────────────────────────────
  if (select count(*) from public.study_day_rules) <> 1
     or (select legacy_min_seconds from public.study_day_rules) <> 1
     or (select min_seconds from public.study_day_rules) <> 300
     or (select new_rules_from from public.study_day_rules) is distinct from date '2026-10-05'
     or public.study_day_freeze_increments(date '2026-10-04') is distinct from true
     or public.study_day_freeze_increments(date '2026-10-05') is distinct from false
     or public.study_day_min_seconds(date '2026-10-04') <> 1
     or public.study_day_min_seconds(date '2026-10-05') <> 300 then
    raise exception 'FAIL [study_day_rules row]';
  end if;
  if has_function_privilege('authenticated', 'public.study_day_states(uuid, date, date, date)', 'execute')
     or has_function_privilege('anon', 'public.study_day_states(uuid, date, date, date)', 'execute')
     or has_function_privilege('authenticated', 'public.study_streaks(uuid, date)', 'execute')
     or has_table_privilege('authenticated', 'public.study_day_rules', 'update')
     or has_table_privilege('anon', 'public.study_day_rules', 'select')
     or not has_table_privilege('authenticated', 'public.study_day_rules', 'select') then
    raise exception 'FAIL [privileges]';
  end if;
  checks := checks + 2;

  -- ── Cas du fixture ─────────────────────────────────────────────────────────
  for c in select * from jsonb_array_elements(fixture->'cases') loop
    i := i + 1;
    uid := gen_random_uuid();
    insert into auth.users (id, email, created_at, raw_user_meta_data)
    values (uid, 'study-days-' || suffix || '-' || i || '@example.invalid', now() - interval '60 days',
            jsonb_build_object('pseudo', 'sdy' || suffix || i, 'study_year', 'BAC 1'));
    update public.profiles set timezone = 'Europe/Brussels' where id = uid;
    update public.study_day_rules set new_rules_from = (c->>'new_rules_from')::date;

    for s in select * from jsonb_array_elements(c->'sessions') loop
      continue when coalesce((s->>'late')::boolean, false);
      sid := gen_random_uuid();
      insert into public.sessions (id, user_id, duration_seconds, started_at, ended_at, timezone)
      values (sid, uid, (s->>'duration_seconds')::integer, (s->>'started_at')::timestamptz,
              (s->>'started_at')::timestamptz + make_interval(secs => (s->>'duration_seconds')::integer), s->>'timezone');
      if coalesce((s->>'legacy')::boolean, false) then
        update public.sessions set timezone = null, timezone_source = null, timezone_basis = null, day_parts_version = null where id = sid;
      end if;
    end loop;
    insert into public.streak_freeze_days (user_id, used_on)
    select uid, d::date from jsonb_array_elements_text(c->'freezes') d;
    insert into public.blocus_periods (user_id, start_date, end_date)
    select uid, (b->>0)::date, (b->>1)::date from jsonb_array_elements(c->'blocus') b;

    foreach phase in array array['before_late', 'final'] loop
      if phase = 'before_late' then
        continue when c->'expect_before_late' is null;
        expect := c->'expect_before_late';
      else
        -- La session « hors ligne » arrive enfin.
        for s in select * from jsonb_array_elements(c->'sessions') where coalesce((value->>'late')::boolean, false) loop
          insert into public.sessions (user_id, duration_seconds, started_at, ended_at, timezone)
          values (uid, (s->>'duration_seconds')::integer, (s->>'started_at')::timestamptz,
                  (s->>'started_at')::timestamptz + make_interval(secs => (s->>'duration_seconds')::integer), s->>'timezone');
        end loop;
        -- Voyage : le profil change de fuseau APRÈS coup ; aucun jour ne doit bouger.
        if c->>'profile_timezone_after' is not null then
          update public.profiles set timezone = c->>'profile_timezone_after' where id = uid;
        end if;
        expect := c->'expect';
      end if;

      for k, v in select * from jsonb_each(expect->'states') loop
        select * into got from public.study_day_states(uid, (c->>'from')::date, (c->>'to')::date, (c->>'today')::date) x where x.local_date = k::date;
        if got.state is distinct from v #>> '{}' then
          raise exception 'FAIL [%/% state %: got %, want %]', c->>'name', phase, k, got.state, v #>> '{}';
        end if;
        checks := checks + 1;
      end loop;
      for k, v in select * from jsonb_each(coalesce(expect->'seconds', '{}')) loop
        select * into got from public.study_day_states(uid, k::date, k::date, (c->>'today')::date);
        if got.studied_seconds <> (v #>> '{}')::bigint then
          raise exception 'FAIL [% seconds %: got %, want %]', c->>'name', k, got.studied_seconds, v;
        end if;
        checks := checks + 1;
      end loop;
      for k, v in select * from jsonb_each(coalesce(expect->'min_seconds', '{}')) loop
        select * into got from public.study_day_states(uid, k::date, k::date, (c->>'today')::date);
        if got.min_seconds <> (v #>> '{}')::integer then
          raise exception 'FAIL [% min_seconds %: got %, want %]', c->>'name', k, got.min_seconds, v;
        end if;
        checks := checks + 1;
      end loop;
      for k, v in select * from jsonb_each(coalesce(expect->'flags', '{}')) loop
        select * into got from public.study_day_states(uid, k::date, k::date, (c->>'today')::date);
        if (v ? 'is_studied' and got.is_studied <> (v->>'is_studied')::boolean)
           or got.has_freeze <> (v->>'has_freeze')::boolean or got.outside_blocus <> (v->>'outside_blocus')::boolean
           or got.preserves_streak <> (v->>'preserves_streak')::boolean
           or (v ? 'increments_streak' and got.increments_streak <> (v->>'increments_streak')::boolean) then
          raise exception 'FAIL [% flags %: got studied=% freeze=% off=% preserves=% increments=%]', c->>'name', k,
            got.is_studied, got.has_freeze, got.outside_blocus, got.preserves_streak, got.increments_streak;
        end if;
        checks := checks + 1;
      end loop;

      select * into streaks from public.study_streaks(uid, (c->>'today')::date);
      if streaks.current_streak <> (expect->>'current')::integer
         or (expect ? 'best' and streaks.best_streak <> (expect->>'best')::integer)
         or (expect ? 'studied_days' and streaks.studied_days <> (expect->>'studied_days')::integer) then
        raise exception 'FAIL [%/% streaks: got %/%/%]', c->>'name', phase, streaks.current_streak, streaks.best_streak, streaks.studied_days;
      end if;
      checks := checks + 1;
    end loop;
  end loop;

  -- ── Sans aucune donnée : zéros, pas d'erreur ───────────────────────────────
  select * into streaks from public.study_streaks(gen_random_uuid(), date '2026-09-20');
  if streaks.current_streak <> 0 or streaks.best_streak <> 0 or streaks.studied_days <> 0 then
    raise exception 'FAIL [empty user]';
  end if;
  checks := checks + 1;

  raise exception 'STUDY DAY STATES TESTS PASSED: % checks (everything rolled back)', checks;
end;
$tests$;
