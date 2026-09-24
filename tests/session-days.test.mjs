import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  LEGACY_DAY_TIMEZONE,
  computeSessionDayParts,
  sessionDays,
  sessionProvenance,
} from "../lib/sessionDayParts.mjs";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const legacyCases = JSON.parse(read("./fixtures/session-days-legacy-cases.json")).cases;
const v70 = read("../supabase/migration_v70_session_days_view.sql");
const offline = read("../lib/offlineSupabaseClient.js");
const strip = (sql) => sql.replace(/--[^\n]*/g, "");

test("règle legacy : même jour que PostgreSQL (Europe/Brussels), une ligne, durée entière", () => {
  assert.equal(LEGACY_DAY_TIMEZONE, "Europe/Brussels");
  for (const c of legacyCases) {
    const rows = sessionDays({ id: "s", user_id: "u", course_id: "c", timezone: null, started_at: c.started_at, ended_at: c.started_at, duration_seconds: 1234 });
    assert.deepEqual(rows, [{ session_id: "s", user_id: "u", course_id: "c", local_date: c.expected_local_date, seconds: 1234, provenance: "legacy" }], c.started_at);
  }
});

test("règle legacy : jamais de découpage à minuit, quel que soit le profil", () => {
  // 23:30 → 00:30 à Bruxelles : une seule ligne, au jour de début.
  const rows = sessionDays({ id: "s", user_id: "u", timezone: null, started_at: "2026-05-20T21:30:00Z", ended_at: "2026-05-20T22:30:00Z", duration_seconds: 3600 });
  assert.deepEqual(rows.map((r) => [r.local_date, r.seconds]), [["2026-05-20", 3600]]);
});

test("sessions avec fuseau : portions telles quelles, provenance selon la source", () => {
  const session = { id: "s", user_id: "u", course_id: null, timezone: "America/New_York", started_at: "2026-09-20T03:30:00Z", ended_at: "2026-09-20T04:30:00Z", duration_seconds: 3600 };
  const parts = computeSessionDayParts(session);
  for (const [source, provenance] of [["device", "captured"], ["profile", "captured"], ["inferred", "inferred"]]) {
    const rows = sessionDays({ ...session, timezone_source: source }, [...parts].reverse());
    assert.deepEqual(rows.map((r) => [r.local_date, r.seconds, r.provenance]), [["2026-09-19", 1800, provenance], ["2026-09-20", 1800, provenance]]);
  }
  assert.equal(sessionProvenance({ timezone: "Europe/Brussels", timezone_source: "weird" }), null);
  assert.equal(sessionProvenance({ timezone: null }), "legacy");
});

test("v70 : vue security_invoker, lecture seule, règle legacy figée", () => {
  const sql = strip(v70);
  assert.match(sql, /create or replace view public\.session_days\s+with \(security_invoker = true\)/);
  assert.match(sql, /\(s\.started_at at time zone 'Europe\/Brussels'\)::date as local_date/);
  assert.match(sql, /s\.duration_seconds as seconds/);
  assert.match(sql, /where s\.timezone is null/);
  assert.match(sql, /union all/);
  assert.match(sql, /revoke all on public\.session_days from public, anon, authenticated;/);
  assert.match(sql, /grant select on public\.session_days to authenticated;/);
  assert.doesNotMatch(sql, /grant (insert|update|delete|all)/i);
});

test("mode démo : session_days dérivée à la lecture, écritures refusées", () => {
  assert.match(offline, /this\.table === "session_day_parts" \|\| this\.table === "session_days"\) && this\.mode !== "select"/);
  assert.match(offline, /if \(this\.table === "session_days"\) db\.session_days = offlineSessionDays\(db\);/);
});
