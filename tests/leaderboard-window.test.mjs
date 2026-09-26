// Classement sur une fenêtre commune (v79) — testé en base par
// supabase/tests/leaderboard_window.sql. Ici : le câblage de l'app et la forme
// de la migration.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

test("app : un seul chemin serveur, aucun calcul de période sur l'appareil", () => {
  const src = read("../components/Leaderboard.js");
  assert.match(src, /supabase\.rpc\("get_leaderboard_v2", \{/);
  assert.doesNotMatch(src, /get_public_leaderboard|v2Available|lastNDates|localISO\(/, "plus de repli calculé à l'heure de l'appareil");
  assert.doesNotMatch(src, /from\("sessions"\)/);
  // Libellés calendaires, pas glissants.
  assert.match(src, /t\("stats\.lbThisWeek"\)/);
  assert.match(src, /t\("stats\.lbThisMonth"\)/);
  assert.doesNotMatch(src, /lbLast7|lbLast30/);
  assert.match(src, /const periodDays = rows\[0\]\?\.period_days/);
});

test("libellés FR + EN : Aujourd'hui / Cette semaine / Ce mois-ci", () => {
  const i18n = read("../lib/i18n.js");
  for (const [key, fr, en] of [["stats.lbToday", "Aujourd'hui", "Today"], ["stats.lbThisWeek", "Cette semaine", "This week"], ["stats.lbThisMonth", "Ce mois-ci", "This month"]]) {
    assert.ok(i18n.includes(`"${key}": "${fr}"`), `${key} FR`);
    assert.ok(i18n.includes(`"${key}": "${en}"`), `${key} EN`);
  }
  assert.doesNotMatch(i18n, /"stats\.lbLast(7|30)"/);
  assert.doesNotMatch(i18n, /derniers jours",\n\s+"stats\.lbThis/);
});

test("v79 : fenêtre commune du classement, découpage session_days, série officielle", () => {
  const sql = read("../supabase/migration_v79_leaderboard_common_window.sql").replace(/--[^\n]*/g, "");
  // Fenêtres calendaires dans un fuseau donné.
  assert.match(sql, /when p_period = 'week' then l\.today - \(extract\(isodow from l\.today\)::integer - 1\)/);
  assert.match(sql, /when p_period = 'month' then date_trunc\('month', l\.today\)::date/);
  // Fuseau du classement : université, sinon Bruxelles — jamais l'appareil ni le profil.
  assert.match(sql, /'Europe\/Brussels'\s*\);/);
  const board = sql.slice(sql.indexOf("create function public.get_leaderboard_v2"), sql.indexOf("function public.get_my_study_rank"));
  assert.doesNotMatch(board, /p\.timezone|gamification_timezone|CURRENT_DATE|current_date/);
  // Découpage aux minuits du classement, même algorithme que session_days.
  assert.match(board, /compute_session_day_parts\(s\.started_at, s\.ended_at, s\.duration_seconds, win\.tz\)/);
  assert.match(board, /where dp\.local_date >= win\.start_date/);
  // Série officielle, plus de calcul maison.
  assert.match(board, /public\.study_streaks\(/);
  assert.doesNotMatch(board, /streak_freeze_days|row_number\(\) over \(partition by user_id order by d\)/i);
  // Ordre total et stable (égalités) : mêmes lignes, même ordre pour tous.
  assert.match(board, /r\.total_seconds desc,\s+r\.pseudo asc,\s+r\.id asc/);
  // Floride : leur propre fuseau.
  assert.match(sql, /'University of Central Florida'/);
  assert.match(sql, /set timezone = 'America\/Chicago'\s+where full_name = 'University of West Florida'/);
});
