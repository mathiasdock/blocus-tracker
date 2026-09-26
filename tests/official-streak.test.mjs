// Phase 5A2 — la série officielle : une seule définition, le serveur fait foi,
// le calcul local canonique ne comble que le direct, l'hors-ligne et l'invité ;
// missions, badges et défi du jour gardent leur calcul legacy.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { pickStreak, rulesFromServer } from "../lib/useOfficialStreak.js";
import { STUDY_DAY_RULES, studyDayMinSeconds, studyStreaks } from "../lib/studyDayStates.mjs";
import { mergeStudyDays } from "../lib/studyDays.mjs";
import { activeDaysIn } from "../lib/statsPeriod.js";
import { computeInsights } from "../lib/statsInsights.mjs";
import { computeProgress } from "../lib/blocus.js";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const strip = (src) => src.replace(/\/\/[^\n]*/g, "").replace(/--[^\n]*/g, "");

test("affichage : le serveur fait foi une fois tout synchronisé", () => {
  const serverRows = [];
  const server = { current: 7, best: 12, key: serverRows };
  assert.deepEqual(pickStreak({ server, local: { current: 3, best: 3 }, pending: false, key: serverRows }),
    { current: 7, best: 12, source: "server" }, "le calcul local (fenêtre courte) ne contredit pas le serveur");
});

test("affichage : pendant le chrono ou une synchro, jamais de recul, jamais de double compte", () => {
  const serverRows = [];
  const server = { current: 4, best: 9, key: serverRows };
  // Le chrono tourne : aujourd'hui validé localement → 5, affiché tout de suite.
  assert.deepEqual(pickStreak({ server, local: { current: 5, best: 5 }, pending: true, key: serverRows }),
    { current: 5, best: 9, source: "optimistic" });
  // Nouvelles lignes serveur pas encore relues par get_my_streak : on garde le max.
  const newer = [];
  assert.equal(pickStreak({ server, local: { current: 5, best: 5 }, pending: false, key: newer }).current, 5);
  // Invité / serveur muet : le calcul local.
  assert.deepEqual(pickStreak({ server: null, local: { current: 2, best: 6 }, pending: false, key: serverRows }),
    { current: 2, best: 6, source: "local" });
});

test("hors ligne puis synchronisé : la série locale ne compte la session qu'une fois", () => {
  const rules = { ...STUDY_DAY_RULES, newRulesFrom: "2026-09-10" };
  const serverRows = [
    { session_id: "a", local_date: "2026-09-18", seconds: 600 },
    { session_id: "b", local_date: "2026-09-19", seconds: 600 },
  ];
  const offline = { id: "c", user_id: "u", started_at: "2026-09-20T10:00:00Z", ended_at: "2026-09-20T10:10:00Z", duration_seconds: 600, timezone: "Europe/Brussels" };
  const before = mergeStudyDays(serverRows, { unsynced: [offline, offline] });
  assert.equal(studyStreaks({ rows: before, today: "2026-09-20", rules }).current, 3);
  const synced = [...serverRows, { session_id: "c", local_date: "2026-09-20", seconds: 600 }];
  const after = mergeStudyDays(synced, { unsynced: [offline] });
  assert.equal(after, synced, "une fois en base, la file est ignorée");
  assert.equal(studyStreaks({ rows: after, today: "2026-09-20", rules }).current, 3);
});

test("règles renvoyées par le serveur", () => {
  assert.deepEqual(rulesFromServer({ legacy_min_seconds: 1, min_seconds: 300, new_rules_from: "2026-10-05" }),
    { legacyMinSeconds: 1, minSeconds: 300, newRulesFrom: "2026-10-05" });
  assert.equal(rulesFromServer(null), STUDY_DAY_RULES);
});

test("« jours étudiés » : seuil de la date, jamais un joker ni un jour hors blocus", () => {
  const rules = { ...STUDY_DAY_RULES, newRulesFrom: "2026-09-10" };
  const minFor = (d) => studyDayMinSeconds(d, rules);
  const rows = [
    { session_id: "a", local_date: "2026-09-08", seconds: 30 },    // avant la bascule : compte
    { session_id: "b", local_date: "2026-09-11", seconds: 299 },   // après : 4 min 59, ne compte pas
    { session_id: "c", local_date: "2026-09-12", seconds: 120 },
    { session_id: "d", local_date: "2026-09-12", seconds: 180 },   // 2 + 3 min : compte
  ];
  const range = { fromISO: "2026-09-01", toISO: "2026-09-30" };
  assert.equal(activeDaysIn(rows, range, minFor), 2);
  assert.equal(activeDaysIn(rows, range), 3, "sans règle : ancien comportement (toute seconde)");
  assert.equal(computeProgress({ start_date: "2026-09-01", end_date: "2026-09-30" }, rows, minFor).activeDays, 2);
  assert.equal(computeProgress({ start_date: "2026-09-01", end_date: "2026-09-30" }, rows, minFor).hoursDone, 629 / 3600, "le temps, lui, reste entier");
  const insights = computeInsights([{ started_at: "2026-09-12T10:00:00Z", duration_seconds: 300 }], rows, minFor);
  assert.equal(insights.bestDaySecs, 300);
});

test("une seule série dans l'app : plus aucun calcul indépendant", () => {
  const dashboard = read("../pages/dashboard.js");
  const stats = read("../pages/stats.js");
  const profile = read("../pages/profile.js");
  const planning = read("../pages/planning.js");
  const levels = read("../lib/userLevels.js");
  const format = read("../lib/format.js");
  const evening = read("../lib/eveningPlan.mjs");
  for (const [name, src] of [["stats", stats], ["profile", profile], ["planning", planning], ["userLevels", levels]]) {
    assert.doesNotMatch(src, /computeStreak|computeBestStreak/, name);
  }
  assert.match(stats, /useOfficialStreak\(/);
  assert.match(profile, /useOfficialStreak\(/);
  assert.match(dashboard, /const officialStreak = useOfficialStreak\(\{/);
  assert.match(dashboard, /const streak = officialStreak\.current;/);
  assert.match(levels, /studyStreaks\(\{/);
  assert.doesNotMatch(format, /export function computeBestStreak/);
  assert.doesNotMatch(evening, /streakBefore/);
  assert.match(evening, /streakStates\.get\(userId\)/);
  // Seul reste LEGACY : le repli local des missions du Chrono (phase 5B).
  const legacyCalls = dashboard.match(/computeStreak\(/g) || [];
  assert.equal(legacyCalls.length, 1);
  assert.match(dashboard, /const legacyMissionStreak = useMemo\(\s*\(\) => computeStreak\(/);
  assert.match(dashboard, /streak: legacyMissionStreak,/);
});

test("v73 : série officielle canonique, missions / badges / défi du jour laissés au calcul legacy", () => {
  const sql = strip(read("../supabase/migration_v73_official_streak.sql"));
  // Niveaux / XP : le moteur canonique, plus l'ancien.
  const levels = sql.slice(sql.indexOf("create or replace function public.get_gamification_levels"), sql.indexOf("create or replace function public.get_my_streak"));
  assert.match(levels, /FROM public\.study_streaks\(v_user_id\) s;/);
  assert.doesNotMatch(levels, /gamification_(current|best)_streak/);
  assert.match(levels, /\+ \(v_best_streak \* 10\)/);
  // Aucun consommateur legacy n'est redéfini ici.
  for (const fn of ["award_badges_for_user", "refresh_daily_missions_for_user", "gamification_pick_challenge", "gamification_current_streak", "gamification_best_streak", "get_leaderboard_v2"]) {
    assert.doesNotMatch(sql, new RegExp(`create (or replace )?function public\\.${fn}\\b`), fn);
  }
  assert.match(sql, /comment on function public\.gamification_current_streak\(uuid\) is\s+'LEGACY/);
  // Ma série : bornée à ±1 jour, exécutable par un compte connecté seulement.
  assert.match(sql, /when p_today between v_server_today - 1 and v_server_today \+ 1 then p_today/);
  assert.match(sql, /grant execute on function public\.get_my_streak\(date\) to authenticated;/);
  assert.match(sql, /revoke all on function public\.study_streak_reminder_states\(uuid\[\], timestamptz\) from public, anon, authenticated;/);
});
