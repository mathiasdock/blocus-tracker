import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

const read = name => readFileSync(new URL(`../../../supabase/${name}`, import.meta.url), "utf8");
// Load the real shipped functions, not simplified implementations of XP,
// streaks or badge rules. The surrounding tables are disposable fixture schema.
function sqlFunction(file, name) {
  const source = read(file);
  const start = source.search(new RegExp(`create (?:or replace )?function public\\.${name}\\(`, "i"));
  assert.ok(start >= 0, name);
  const tail = source.slice(start);
  const delimiter = tail.match(/\bas\s+(\$[a-z_]*\$)/i)[1];
  const end = tail.indexOf(delimiter + ";", tail.indexOf(delimiter) + delimiter.length);
  return tail.slice(0, end + delimiter.length + 1);
}

export async function createStudyHistoryDatabase() {
  const db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated;
    create schema auth;
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    create table profiles(id uuid primary key, timezone text default 'Europe/Brussels', bonus_xp bigint default 0);
    create function gamification_timezone(uuid) returns text language sql stable as $$
      select timezone from profiles where id=$1 $$;
    create table courses(id uuid primary key, user_id uuid, name text, color text, archived_at timestamptz);
    create table sessions(id uuid primary key, user_id uuid, course_id uuid references courses on delete set null,
      duration_seconds integer, started_at timestamptz, ended_at timestamptz,
      timezone text, timezone_source text, day_parts_version integer);
    create table session_day_parts(session_id uuid references sessions on delete cascade, user_id uuid,
      local_date date, seconds integer, primary key(session_id, local_date));
    create table objectives(id uuid primary key, user_id uuid, course_id uuid references courses on delete set null,
      done boolean, target_minutes integer, scheduled_date date);
    create table exams(id uuid primary key, user_id uuid, course_id uuid references courses on delete set null, exam_date date);
    create table user_badges(user_id uuid, badge_id text, earned_at timestamptz default now(), primary key(user_id,badge_id));
    create table xp_ledger(user_id uuid, xp integer);
    create table user_activity_totals(user_id uuid, lifetime_posts bigint);
    create table friendships(requester uuid, addressee uuid, status text);
    create table group_members(group_id uuid, user_id uuid);
    create table group_chrono_sessions(id uuid, group_id uuid, status text, started_at timestamptz,
      finished_at timestamptz, last_pause_at timestamptz, total_paused_seconds integer);
    create table group_chrono_members(session_id uuid, user_id uuid, status text, joined_at timestamptz);
    create table referrals(referrer_id uuid, referred_id uuid);
    create table blocus_periods(user_id uuid, start_date date, end_date date);
    create table streak_freeze_days(user_id uuid, used_on date);
    create table study_day_rules(id boolean primary key, legacy_min_seconds integer, min_seconds integer, min_seconds_from date,
      updated_at timestamptz default now());
    insert into study_day_rules values(true,1,300,null,now());
  `);
  for (const name of ["compute_session_day_parts", "sync_session_day_parts"]) {
    await db.exec(sqlFunction("migration_v65_session_day_parts.sql", name));
  }
  await db.exec(`
    create trigger a10_sync_session_day_parts after insert or update of started_at, ended_at,
      duration_seconds, timezone, day_parts_version, user_id on sessions
      for each row execute function sync_session_day_parts();
  `);
  await db.exec(read("migration_v70_session_days_view.sql"));
  await db.exec(read("migration_v72_study_day_rules_versioned.sql"));
  await db.exec(sqlFunction("migration_v73_official_streak.sql", "study_day_states"));
  for (const name of ["gamification_level_threshold", "gamification_level_for_xp"]) {
    await db.exec(sqlFunction("migration_v48_xp_recalibration.sql", name));
  }
  for (const name of ["badge_ids_for_user", "award_badges_for_user", "gamification_badge_xp"]) {
    await db.exec(sqlFunction("migration_v84_badges_progression.sql", name));
  }
  await db.exec(sqlFunction("migration_v73_official_streak.sql", "get_gamification_levels"));
  return db;
}

// PostgREST-like SELECT adapter over the isolated PostgreSQL database. Enforces
// the actual 1,000-row response ceiling even when callers forget pagination.
export function historyClient(db, calls = []) {
  return {
    from(table) {
      assert.ok(["sessions", "session_days"].includes(table));
      let columns = "*", from = 0, size = 1000;
      const filters = [], params = [], order = [];
      const query = {
        select(value) { columns = value; return query; },
        eq(column, value) { params.push(value); filters.push(`${column} = $${params.length}`); return query; },
        in(column, values) { params.push(values); filters.push(`${column} = any($${params.length}::uuid[])`); return query; },
        gte(column, value) { params.push(value); filters.push(`${column} >= $${params.length}`); return query; },
        order(column, { ascending }) { order.push(`${column} ${ascending ? "asc" : "desc"}`); return query; },
        range(start, end) { from = start; size = Math.min(1000, end - start + 1); return query; },
        async then(resolve, reject) {
          calls.push({ table, from, size, order: [...order] });
          try {
            const result = await db.query(`select ${columns} from ${table}
              ${filters.length ? "where " + filters.join(" and ") : ""}
              ${order.length ? "order by " + order.join(", ") : ""}
              limit ${size} offset ${from}`, params);
            const rows = result.rows.map(row => Object.fromEntries(Object.entries(row).map(([key,value]) => [
              key, value instanceof Date ? (key === "local_date" ? value.toISOString().slice(0,10) : value.toISOString()) : value,
            ])));
            return resolve({ data: rows, error: null });
          } catch (error) { return resolve({ data: null, error }); }
        },
      };
      return query;
    },
  };
}
