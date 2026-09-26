// Phase 5C — badges de série / marathon sur les jours canoniques et plafond
// de 16 h par date (v78, testé en base par supabase/tests/badges_daily_cap.sql).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { dailyCapMessage, isDailyCapError } from "../lib/dailyCap.mjs";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const FR = { "dash.dailyCapReached": "Limite de 16 h d'étude atteinte le {date} : cette session n'a pas pu être enregistrée." };
const EN = { "dash.dailyCapReached": "16-hour study limit reached on {date}: this session could not be saved." };

test("refus du plafond : reconnu, et la date est dite en clair (FR + EN)", () => {
  const error = { code: "22023", hint: "daily_cap", details: "2026-10-14", message: "Daily study duration cannot exceed 16 hours on 2026-10-14" };
  assert.equal(isDailyCapError(error), true);
  assert.equal(isDailyCapError({ code: "22023", message: "Session duration must be between 1 second and 12 hours" }), false);
  assert.match(dailyCapMessage((k) => FR[k], "fr", error.details), /mercredi 14 octobre/);
  assert.match(dailyCapMessage((k) => EN[k], "en", error.details), /Wednesday 14 October/);
});

test("file hors ligne : un refus du plafond est définitif, les autres erreurs restent en file", () => {
  const src = read("../lib/timerDraft.js");
  assert.match(src, /else if \(error\.hint === "daily_cap"\) \{\s+removeFromQueue\(item\.id\);/);
  assert.match(read("../components/PendingSessionsBanner.jsx"), /dailyCapMessage\(t, lang, capped\.date\)/);
  assert.match(read("../pages/dashboard.js"), /if \(isDailyCapError\(error\)\) \{/);
  const i18n = read("../lib/i18n.js");
  assert.equal((i18n.match(/"dash\.dailyCapReached": "/g) || []).length, 2);
});

test("v78 : série officielle, portions par date, plus de moteur legacy", () => {
  const sql = read("../supabase/migration_v78_badges_and_daily_cap_canonical.sql").replace(/--[^\n]*/g, "");
  const badges = sql.slice(sql.indexOf("function public.award_badges_for_user"), sql.indexOf("function public.validate_new_study_session"));
  assert.match(badges, /select s\.current_streak into v_streak from public\.study_streaks\(p_user_id\) s;/);
  assert.match(badges, /from public\.session_days sd\s+where sd\.user_id = p_user_id\s+group by sd\.local_date/);
  assert.doesNotMatch(badges, /gamification_current_streak|started_at at time zone/);
  // Seuils inchangés.
  for (const t of ["v_streak >= 3", "v_streak >= 7", "v_streak >= 14", "v_streak >= 30", "v_max_daily_hours >= 6", "v_total_hours >= 250"]) {
    assert.ok(badges.includes(t), t);
  }
  const cap = sql.slice(sql.indexOf("function public.validate_new_study_session"));
  assert.match(cap, /compute_session_day_parts\(new\.started_at, new\.ended_at, new\.duration_seconds, new\.timezone\)/);
  assert.match(cap, /if v_other \+ v_part\.seconds > 57600 then/);
  assert.match(cap, /hint = 'daily_cap', detail = v_part\.local_date::text/);
  assert.match(cap, /new\.duration_seconds > 43200/);
  assert.match(cap, /v_other_count >= 200/);
  assert.match(sql, /drop function if exists public\.gamification_current_streak\(uuid\);/);
  assert.match(sql, /drop function if exists public\.gamification_best_streak\(uuid\);/);
});
