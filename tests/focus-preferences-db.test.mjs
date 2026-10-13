import test, { before, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

const A = "00000000-0000-0000-0000-000000000001";
const B = "00000000-0000-0000-0000-000000000002";
const read = name => readFileSync(new URL(`../supabase/${name}`, import.meta.url), "utf8");
const migration = read("migration_v86_focus_environments.sql");
let db;
let originalLevelDefinition;

before(async () => {
  db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth;
    create table auth.users (id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema auth to authenticated, anon;
    create table public.profiles (id uuid primary key references auth.users(id) on delete cascade, locked boolean not null default false, bonus_xp bigint not null default 0);
    create table public.sessions (user_id uuid references auth.users(id) on delete cascade, duration_seconds integer not null);
    create table public.objectives (user_id uuid references auth.users(id) on delete cascade, done boolean not null);
    create table public.exams (user_id uuid references auth.users(id) on delete cascade);
    create table public.user_badges (user_id uuid references auth.users(id) on delete cascade, badge_id text);
    create table public.xp_ledger (user_id uuid references auth.users(id) on delete cascade, xp integer);
    create function public.study_streaks(uuid) returns table(current_streak integer,best_streak integer) language sql stable as $$ select 0,0 $$;
    alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  `);
  // Execute the shipped canonical XP/level function, rather than a caller-
  // supplied level. Streaks are zero and badges absent in these fixtures.
  const levels = read("migration_v48_xp_recalibration.sql");
  await db.exec(levels.slice(levels.indexOf("CREATE OR REPLACE FUNCTION public.gamification_level_threshold"), levels.indexOf("-- ----------------------------------------------------------------\n-- 3. Missions")));
  const streak = read("migration_v73_official_streak.sql");
  const start = streak.indexOf("create or replace function public.get_gamification_levels");
  const end = streak.indexOf("$function$;", start) + "$function$;".length;
  await db.exec(streak.slice(start, end));
  await db.exec("revoke all on function public.get_gamification_levels(uuid[]) from public,anon; grant execute on function public.get_gamification_levels(uuid[]) to authenticated;");
  const suspension = read("migration_v57_real_suspension.sql");
  await db.exec(suspension.slice(0, suspension.indexOf("-- Sur toutes les tables")));
  originalLevelDefinition = (await db.query("select pg_get_functiondef('public.get_gamification_levels(uuid[])'::regprocedure) definition")).rows[0].definition;
  await db.exec(migration);
});
after(async () => db?.close());
beforeEach(async () => {
  await db.exec("reset role; truncate auth.users cascade;");
  await db.query("select set_config('request.jwt.claim.sub','',false)");
  await db.query("insert into auth.users values($1),($2)", [A, B]);
  await db.query("insert into public.profiles(id) values($1),($2)", [A, B]);
});

async function asUser(userId, sql, params = []) {
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [userId || ""]);
  await db.exec("set role authenticated");
  try { return await db.query(sql, params); }
  finally { await db.exec("reset role"); }
}
const get = async (userId = A) => (await asUser(userId, "select * from public.get_my_focus_environment()")).rows[0];
const equip = async (id, userId = A, expectedUserId = userId) => (await asUser(userId, "select * from public.equip_focus_environment($1,$2)", [id, expectedUserId])).rows[0];
const study = minutes => db.query("insert into public.sessions values($1,$2)", [A, minutes * 60]);
const tuple = async () => (await db.query("select ctid::text tuple from focus_environment_preferences where user_id=$1", [A])).rows[0].tuple;

test("Forest defaults and repeated reads/equips do not rewrite unchanged rows", async () => {
  assert.deepEqual(await get(), { equipped_id: "forest", highest_level: 1 });
  const first = await tuple();
  await get(); await equip("forest");
  assert.equal(await tuple(), first);
  assert.equal((await db.query("select count(*)::int n from focus_environment_preferences")).rows[0].n, 1);
});

test("existing level 5 becomes eligible on read without auto-equipping", async () => {
  await study(1250);
  assert.deepEqual(await get(), { equipped_id: "forest", highest_level: 5 });
  assert.deepEqual(await equip("gradient-wave"), { equipped_id: "gradient-wave", highest_level: 5 });
});

test("level boundary and future IDs reject equip atomically", async () => {
  await study(1249);
  await assert.rejects(equip("gradient-wave"), error => error.code === "42501" && error.hint === "focus_locked");
  assert.equal((await db.query("select count(*)::int n from focus_environment_preferences")).rows[0].n, 0);
  for (const id of ["reserved-12", "reserved-20", "unknown", null, "gradient-wave "]) {
    await assert.rejects(equip(id), error => error.code === "22023" && error.hint === "focus_invalid");
  }
  await study(1);
  assert.equal((await equip("gradient-wave")).highest_level, 5);
});

test("permanent unlock and choice survive XP reduction and another device", async () => {
  await study(3200); await equip("gradient-wave");
  await db.query("delete from public.sessions where user_id=$1", [A]);
  assert.deepEqual(await get(), { equipped_id: "gradient-wave", highest_level: 8 });
  await equip("forest");
  assert.deepEqual(await equip("gradient-wave"), { equipped_id: "gradient-wave", highest_level: 8 });
  const current = (await asUser(A, "select level from get_gamification_levels(array[$1::uuid])", [A])).rows[0].level;
  assert.equal(current, 1, "the canonical level itself remains reduced");
});

test("unlocks grow monotonically while Forest remains the explicit choice", async () => {
  await get(); await study(1250); await get(); await study(5950);
  assert.deepEqual(await get(), { equipped_id: "forest", highest_level: 12 });
  await db.query("delete from public.sessions where user_id=$1", [A]);
  assert.deepEqual(await equip("forest"), { equipped_id: "forest", highest_level: 12 });
  await assert.rejects(equip("reserved-12"), error => error.hint === "focus_invalid");
});

test("Zenitho requires canonical Level 12 and keeps its unlock/choice across sessions and XP reductions", async () => {
  await study(7199);
  await assert.rejects(equip("zenitho"), error => error.code === "42501" && error.hint === "focus_locked");
  await study(1);
  assert.deepEqual(await get(), { equipped_id: "forest", highest_level: 12 });
  assert.deepEqual(await equip("zenitho"), { equipped_id: "zenitho", highest_level: 12 });
  await db.query("delete from public.sessions where user_id=$1", [A]);
  assert.deepEqual(await get(), { equipped_id: "zenitho", highest_level: 12 });
  await equip("forest");
  assert.deepEqual(await equip("zenitho"), { equipped_id: "zenitho", highest_level: 12 });
  await assert.rejects(equip("zenitho", B), error => error.hint === "focus_locked");
  await assert.rejects(equip("reserved-20"), error => error.hint === "focus_invalid");
});

test("pending migration upgrades original two-environment constraints without resetting saved choices", async () => {
  await study(7200); await equip("gradient-wave");
  await db.exec(`alter table focus_environment_preferences
    drop constraint focus_environment_preferences_equipped_id_check,
    drop constraint focus_equipped_is_unlocked;
    alter table focus_environment_preferences
    add constraint focus_environment_preferences_equipped_id_check check (equipped_id in ('forest','gradient-wave')),
    add constraint focus_equipped_is_unlocked check (equipped_id <> 'gradient-wave' or highest_level >= 5);`);
  await db.exec(migration);
  assert.deepEqual(await get(), { equipped_id: "gradient-wave", highest_level: 12 });
  assert.deepEqual(await equip("zenitho"), { equipped_id: "zenitho", highest_level: 12 });
  await db.exec(migration);
  assert.deepEqual(await get(), { equipped_id: "zenitho", highest_level: 12 });
  assert.equal((await db.query("select pg_get_functiondef('public.get_gamification_levels(uuid[])'::regprocedure) definition")).rows[0].definition, originalLevelDefinition);
});

test("Glass Fold unlocks at canonical Level 20, never auto-equips and remains available after XP reduction", async () => {
  await study(19999);
  await assert.rejects(equip("glass-fold"), error => error.hint === "focus_locked");
  assert.equal((await db.query("select count(*)::int n from focus_environment_preferences")).rows[0].n, 0);
  await study(1);
  assert.deepEqual(await get(), { equipped_id: "forest", highest_level: 20 });
  assert.deepEqual(await equip("glass-fold"), { equipped_id: "glass-fold", highest_level: 20 });
  await db.query("delete from public.sessions where user_id=$1", [A]);
  assert.deepEqual(await get(), { equipped_id: "glass-fold", highest_level: 20 });
  await equip("forest");
  assert.deepEqual(await equip("glass-fold"), { equipped_id: "glass-fold", highest_level: 20 });
  await assert.rejects(equip("glass-fold", B), error => error.hint === "focus_locked");
});

test("pending migration upgrades Zenitho-era constraints without changing its choice or XP rules", async () => {
  await study(7200); await equip("zenitho");
  await db.exec(`alter table focus_environment_preferences
    drop constraint focus_environment_preferences_equipped_id_check,
    drop constraint focus_equipped_is_unlocked;
    alter table focus_environment_preferences
    add constraint focus_environment_preferences_equipped_id_check check (equipped_id in ('forest','gradient-wave','zenitho')),
    add constraint focus_equipped_is_unlocked check ((equipped_id <> 'gradient-wave' or highest_level >= 5) and (equipped_id <> 'zenitho' or highest_level >= 12));`);
  await db.exec(migration);
  assert.deepEqual(await get(), { equipped_id: "zenitho", highest_level: 12 });
  await study(12800);
  assert.deepEqual(await get(), { equipped_id: "zenitho", highest_level: 20 });
  await equip("glass-fold"); await db.exec(migration);
  assert.deepEqual(await get(), { equipped_id: "glass-fold", highest_level: 20 });
  assert.equal((await db.query("select pg_get_functiondef('public.get_gamification_levels(uuid[])'::regprocedure) definition")).rows[0].definition, originalLevelDefinition);
});

test("RLS isolates users and neither can directly forge choices or levels", async () => {
  await study(1250); await equip("gradient-wave"); await get(B);
  assert.deepEqual((await asUser(B, "select equipped_id,highest_level from focus_environment_preferences")).rows, [{ equipped_id: "forest", highest_level: 1 }]);
  await assert.rejects(asUser(B, "insert into focus_environment_preferences values($1,'gradient-wave',30)", [B]), error => error.code === "42501");
  await assert.rejects(asUser(A, "update focus_environment_preferences set highest_level=30"), error => error.code === "42501");
  await assert.rejects(asUser(A, "delete from focus_environment_preferences"), error => error.code === "42501");
  await assert.rejects(equip("gradient-wave", B), error => error.hint === "focus_locked");
  assert.equal((await get()).equipped_id, "gradient-wave");
});

test("equip rejects a changed or missing expected account before any write", async () => {
  await study(1250);
  await db.query("insert into public.sessions values($1,$2)", [B, 1250 * 60]);
  await get(); await get(B);
  const snapshot = (await db.query("select user_id,equipped_id,highest_level,ctid::text from focus_environment_preferences order by user_id")).rows;
  for (const expected of [A, null]) {
    await assert.rejects(equip("gradient-wave", B, expected), error => error.code === "42501" && error.hint === "focus_auth_required");
    assert.deepEqual((await db.query("select user_id,equipped_id,highest_level,ctid::text from focus_environment_preferences order by user_id")).rows, snapshot);
  }
  assert.deepEqual(await equip("gradient-wave", B), { equipped_id: "gradient-wave", highest_level: 5 });
});

test("anonymous, unbound and suspended callers cannot use either RPC", async () => {
  await db.exec("set role anon");
  for (const sql of ["select * from get_my_focus_environment()", `select * from equip_focus_environment('forest','${A}')`, "select * from focus_environment_preferences"]) {
    await assert.rejects(db.query(sql), error => error.code === "42501");
  }
  await db.exec("reset role");
  await assert.rejects(get(null), error => error.hint === "focus_auth_required");
  await db.query("update profiles set locked=true where id=$1", [A]);
  await assert.rejects(get(), error => error.hint === "suspended");
  await assert.rejects(equip("forest"), error => error.hint === "suspended");
  assert.equal((await db.query("select count(*)::int n from focus_environment_preferences")).rows[0].n, 0);
});

test("migration is re-runnable, keeps state, and never replaces canonical XP", async () => {
  await study(1250); await equip("gradient-wave");
  await db.exec(`create function public.equip_focus_environment(p_environment_id text)
    returns table(equipped_id text,highest_level integer) language sql as $$ select p_environment_id,30 $$;
    grant execute on function public.equip_focus_environment(text) to authenticated;`);
  await db.exec(migration);
  assert.deepEqual(await get(), { equipped_id: "gradient-wave", highest_level: 5 });
  assert.equal((await db.query("select pg_get_functiondef('public.get_gamification_levels(uuid[])'::regprocedure) definition")).rows[0].definition, originalLevelDefinition);
  for (const name of ["get_my_focus_environment", "equip_focus_environment"]) {
    const fn = (await db.query("select oid,prosecdef,proconfig from pg_proc where proname=$1", [name])).rows[0];
    assert.equal(fn.prosecdef, true); assert.ok(fn.proconfig.includes("search_path=public, pg_catalog"));
    assert.equal((await db.query("select has_function_privilege('anon',$1::oid,'EXECUTE') allowed", [fn.oid])).rows[0].allowed, false);
    assert.equal((await db.query("select has_function_privilege('authenticated',$1::oid,'EXECUTE') allowed", [fn.oid])).rows[0].allowed, true);
  }
  assert.equal((await db.query("select relrowsecurity from pg_class where relname='focus_environment_preferences'")).rows[0].relrowsecurity, true);
  assert.equal((await db.query("select to_regprocedure('public.equip_focus_environment(text)') legacy")).rows[0].legacy, null);
});

test("deleting an Auth account cascades only its Focus preference", async () => {
  await get(); await get(B);
  await db.query("delete from auth.users where id=$1", [A]);
  assert.deepEqual((await db.query("select user_id from focus_environment_preferences")).rows, [{ user_id: B }]);
});
