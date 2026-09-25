import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { STUDY_DAY_RULES, studyDayMinSeconds, studyDayStates, studyStreaks } from "../lib/studyDayStates.mjs";
import { computeSessionDayParts, sessionDays } from "../lib/sessionDayParts.mjs";
import { mergeStudyDays } from "../lib/studyDays.mjs";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const fixture = JSON.parse(read("./fixtures/study-day-states-cases.json"));
const v71 = read("../supabase/migration_v71_study_day_states.sql");
const sqlTest = read("../supabase/tests/study_day_states.sql");

function inZone(timeZone, fn) {
  const before = process.env.TZ;
  process.env.TZ = timeZone;
  try { return fn(); } finally {
    if (before === undefined) delete process.env.TZ; else process.env.TZ = before;
  }
}

const withEnd = (s) => ({ ...s, ended_at: new Date(new Date(s.started_at).getTime() + s.duration_seconds * 1000).toISOString() });

// Lignes session_days telles que la vue v70 les renverrait.
function rowsOf(sessions) {
  return sessions.flatMap((raw, i) => {
    const s = { id: `s${i}`, user_id: "u", course_id: null, ...withEnd(raw) };
    if (raw.legacy) return sessionDays({ ...s, timezone: null });
    return sessionDays(s, computeSessionDayParts(s));
  });
}

const rulesOf = (c) => ({ ...STUDY_DAY_RULES, minSecondsFrom: c.min_seconds_from });

function check(c, sessions, expect) {
  const rows = rowsOf(sessions);
  const args = { rows, freezes: c.freezes, blocusRanges: c.blocus, today: c.today, rules: rulesOf(c) };
  const states = studyDayStates({ ...args, from: c.from, to: c.to });
  const byDate = Object.fromEntries(states.map((d) => [d.local_date, d]));
  for (const [date, state] of Object.entries(expect.states)) assert.equal(byDate[date].state, state, `${c.name} — ${date}`);
  for (const [date, secs] of Object.entries(expect.seconds || {})) assert.equal(byDate[date].studied_seconds, secs, `${c.name} — secondes ${date}`);
  for (const [date, min] of Object.entries(expect.min_seconds || {})) assert.equal(byDate[date].min_seconds, min, `${c.name} — seuil ${date}`);
  for (const [date, flags] of Object.entries(expect.flags || {})) {
    for (const [k, v] of Object.entries(flags)) assert.equal(byDate[date][k], v, `${c.name} — ${k} ${date}`);
  }
  const streaks = studyStreaks(args);
  assert.equal(streaks.current, expect.current, `${c.name} — série actuelle`);
  if (expect.best !== undefined) assert.equal(streaks.best, expect.best, `${c.name} — meilleure série`);
  if (expect.studied_days !== undefined) assert.equal(streaks.studiedDays, expect.studied_days, `${c.name} — jours étudiés`);
}

test("modèle canonique : tous les cas du fixture, dans deux fuseaux d'appareil", () => {
  for (const zone of ["Europe/Brussels", "America/New_York"]) {
    inZone(zone, () => {
      for (const c of fixture.cases) {
        if (c.expect_before_late) check(c, c.sessions.filter((s) => !s.late), c.expect_before_late);
        check(c, c.sessions, c.expect);
      }
    });
  }
});

test("un jour neutre ne compte pas et ne casse pas ; « étudié » et « préserve » sont distincts", () => {
  const states = studyDayStates({ rows: [], freezes: ["2026-09-10"], blocusRanges: [["2026-09-11", "2026-09-30"]], from: "2026-09-09", to: "2026-09-11", today: "2026-09-20" });
  assert.deepEqual(states.map((d) => [d.state, d.is_studied, d.preserves_streak]), [
    ["neutral", false, true],   // hors blocus
    ["neutral", false, true],   // joker (et hors blocus)
    ["missed", false, false],
  ]);
  assert.deepEqual(studyStreaks({ rows: [], freezes: ["2026-09-10"], today: "2026-09-20" }), { current: 0, best: 0, studiedDays: 0 });
});

test("la bascule n'est jamais rétroactive et n'est pas encore programmée", () => {
  const rules = { ...STUDY_DAY_RULES, minSecondsFrom: "2026-10-01" };
  assert.equal(studyDayMinSeconds("2026-09-30", rules), 1);
  assert.equal(studyDayMinSeconds("2026-10-01", rules), 300);
  assert.equal(STUDY_DAY_RULES.minSecondsFrom, null);
  assert.equal(studyDayMinSeconds("2030-01-01"), 1, "tant que la date n'est pas posée, la règle historique s'applique");
  // Mêmes valeurs par défaut qu'en base.
  assert.match(v71, /legacy_min_seconds integer not null default 1 /);
  assert.match(v71, /min_seconds integer not null default 300 /);
  assert.match(v71, /min_seconds_from date,/);
  assert.doesNotMatch(v71, /insert into public\.study_day_rules \([^)]*min_seconds_from/, "aucune date de bascule posée par la migration");
});

test("session hors ligne : ses jours avant synchronisation = ses jours après", () => {
  const payload = { id: "q", user_id: "u", course_id: null, started_at: "2026-09-19T21:58:00Z", ended_at: "2026-09-19T22:08:00Z", duration_seconds: 600, timezone: "Europe/Brussels" };
  const rules = { ...STUDY_DAY_RULES, minSecondsFrom: "2026-09-10" };
  const args = (rows) => studyDayStates({ rows, from: "2026-09-19", to: "2026-09-20", today: "2026-09-21", rules }).map((d) => d.state);
  const pending = mergeStudyDays([], { unsynced: [payload] });
  const synced = sessionDays({ ...payload, timezone_source: "device" }, computeSessionDayParts(payload));
  assert.deepEqual(args(pending), args(synced));
  assert.deepEqual(args(synced), ["missed", "studied"], "23:58 → 00:08 : 2 min la veille (sous le seuil), 8 min le lendemain");
});

test("le test SQL embarque exactement ce fixture", () => {
  const embedded = sqlTest.split("-- FIXTURE BEGIN")[1]?.split("-- FIXTURE END")[0];
  assert.ok(embedded, "marqueurs FIXTURE absents");
  const json = embedded.slice(embedded.indexOf("$fixture$") + 9, embedded.lastIndexOf("$fixture$"));
  assert.deepEqual(JSON.parse(json), fixture);
});

test("v71 : fonctions serveur non exécutables par les clients, lecture seule des règles", () => {
  assert.match(v71, /revoke all on function public\.study_day_states\(uuid, date, date, date\) from public, anon, authenticated;/);
  assert.match(v71, /revoke all on function public\.study_streaks\(uuid, date\) from public, anon, authenticated;/);
  assert.match(v71, /grant select on public\.study_day_rules to authenticated;/);
  assert.doesNotMatch(v71, /grant (insert|update|delete|all) on public\.study_day_rules/i);
});
