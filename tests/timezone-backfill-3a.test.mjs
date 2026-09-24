import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const v68 = read("../supabase/migration_v68_session_timezone_basis.sql");
const v69 = read("../supabase/migration_v69_backfill_timezone_3a.sql");
const strip = (sql) => sql.replace(/--[^\n]*/g, "");

test("v68 : preuves limitées au périmètre de la Phase 3A", () => {
  assert.match(v68, /timezone_basis in \('bracketed', 'near', 'single_class'\)/);
  assert.doesNotMatch(strip(v68), /institution_assumed/);
  // La preuve n'existe que pour une session 'inferred'.
  assert.match(v68, /\(timezone_basis is not null\) = \(timezone_source is not distinct from 'inferred'\)/);
  // L'app ne peut ni fournir ni changer la preuve.
  assert.match(v68, /new\.timezone_basis := null;/);
  assert.match(v68, /new\.timezone_basis := old\.timezone_basis;/);
});

test("v69 : n'écrit que les champs de fuseau", () => {
  const code = strip(v69);
  const updates = [...code.matchAll(/update\s+public\.(\w+)\s+\w*\s*set([\s\S]*?)(?:from|where)/gi)];
  assert.equal(updates.length, 1, "une seule instruction UPDATE");
  assert.equal(updates[0][1], "sessions");
  const assigned = [...updates[0][2].matchAll(/(\w+)\s*=/g)].map((m) => m[1]).sort();
  assert.deepEqual(assigned, ["day_parts_version", "timezone", "timezone_basis", "timezone_source"]);
  assert.doesNotMatch(code, /\b(insert\s+into|delete\s+from)\s+public\./i);
  assert.doesNotMatch(code, /institution_assumed/);
});

test("v69 : s'annule si le plan ne correspond plus au dry-run", () => {
  assert.match(v69, /c_expected constant jsonb := '\{"bracketed": 469, "near": 60, "single_class": 905\}'/);
  assert.match(v69, /c_expected_total constant integer := 1434/);
  assert.match(v69, /v69 aborted: plan counts/);
  assert.match(v69, /v69 aborted: generated parts do not sum to the duration/);
  assert.match(v69, /v69 aborted: a session outside the plan changed/);
  assert.match(v69, /v69 aborted: the backfill wrote gamification or activity rows/);
  // Les missions « Europe/Paris » ne sont pas une preuve (ancienne valeur par défaut).
  assert.equal((v69.match(/timezone_snapshot <> 'Europe\/Paris'/g) || []).length, 2);
});
