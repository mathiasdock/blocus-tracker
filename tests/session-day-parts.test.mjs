import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  computeSessionDayParts,
  isValidSessionTimezone,
} from "../lib/sessionDayParts.mjs";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const fixture = JSON.parse(read("./fixtures/session-day-parts-cases.json"));
const migration = read("../supabase/migration_v65_session_day_parts.sql");
const sqlTest = read("../supabase/tests/session_day_parts.sql");

// Parité SQL / JavaScript : les valeurs attendues sont celles de
// public.compute_session_day_parts (référence de production). Le mode démo
// doit produire exactement les mêmes portions.
for (const c of fixture.parts) {
  test(`parité · ${c.name}`, () => {
    assert.deepEqual(computeSessionDayParts(c), c.expected);
    const total = c.expected.reduce((sum, part) => sum + part.seconds, 0);
    assert.equal(total, c.duration_seconds, "la somme des portions vaut la durée");
  });
}

test("parité · validation des fuseaux", () => {
  for (const { timezone, valid } of fixture.timezones) {
    assert.equal(isValidSessionTimezone(timezone), valid, timezone);
  }
});

test("le test SQL embarque exactement les mêmes cas limites", () => {
  const embedded = JSON.stringify({ parts: fixture.parts, timezones: fixture.timezones }).replaceAll("'", "''");
  assert.ok(sqlTest.includes(`'${embedded}'`), "supabase/tests/session_day_parts.sql doit être regénéré depuis la fixture");
});

// Ordre des déclencheurs : PostgreSQL exécute les déclencheurs d'un même moment
// par ordre alphabétique. La synchronisation des portions doit précéder la
// gamification (qui lira bientôt session_day_parts), et le fuseau doit être
// fixé après le blocage des comptes suspendus.
test("ordre des déclencheurs de public.sessions", () => {
  assert.match(migration, /create trigger a10_sync_session_day_parts\s+after insert or update/);
  assert.match(migration, /create trigger a01_set_session_timezone\s+before insert or update/);

  const after = ["a10_sync_session_day_parts", "refresh_gamification_sessions", "session_activity_after_insert"];
  assert.deepEqual([...after].sort(), after, "a10_sync_session_day_parts passe avant les autres AFTER");

  const before = ["a00_block_suspended_actor", "a01_set_session_timezone", "prevent_session_duration_increase", "validate_new_study_session"];
  assert.deepEqual([...before].sort(), before, "a01_set_session_timezone passe juste après a00");

  // Le garde-fou exécuté à l'application de la migration reste en place.
  assert.match(migration, /must run before refresh_gamification_sessions/);
});

test("aucune écriture client dans session_day_parts", () => {
  assert.match(migration, /revoke all on public\.session_day_parts from anon, authenticated;/);
  assert.match(migration, /grant select on public\.session_day_parts to authenticated;/);
  assert.doesNotMatch(migration, /policy [a-z_]+ on public\.session_day_parts\s+for (insert|update|delete|all)/);
  assert.match(migration, /references public\.sessions\(id\) on delete cascade/);
});
