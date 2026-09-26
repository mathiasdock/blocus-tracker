// Phase 5A3 — jokers : quand les proposer (moteur canonique), ne pas les
// proposer trop tôt (chrono, file hors ligne), et le serveur qui vérifie et
// rembourse (v74, testé en base par supabase/tests/streak_freezes.sql).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { freezeGap, liveChronoDays, pendingSessionDays } from "../lib/streakFreezeGap.mjs";
import { STUDY_DAY_RULES, studyDayStates, studyStreaks } from "../lib/studyDayStates.mjs";
import { mergeStudyDays } from "../lib/studyDays.mjs";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const RULES = { ...STUDY_DAY_RULES, newRulesFrom: "2026-10-05" };
const TODAY = "2026-10-15";
const row = (local_date, seconds, session_id = `s-${local_date}-${seconds}`) => ({ session_id, local_date, seconds });
const gap = (rows, extra = {}) => freezeGap({ rows, today: TODAY, rules: RULES, stock: 2, ...extra });

test("jour déjà étudié : pas de joker", () => {
  assert.deepEqual(gap([row("2026-10-13", 900), row("2026-10-14", 900)]).days, []);
});

test("après le 05/10 : 4:59 reste manqué (joker proposé), 5:00 est étudié (rien)", () => {
  const at459 = gap([row("2026-10-13", 900), row("2026-10-14", 299)]);
  assert.deepEqual(at459, { days: ["2026-10-14"], blocked: false, canRepair: true });
  assert.deepEqual(gap([row("2026-10-13", 900), row("2026-10-14", 300)]).days, []);
});

test("avant le 05/10 : une seconde suffit, le jour n'est pas proposé", () => {
  const g = freezeGap({ rows: [row("2026-09-28", 600), row("2026-09-29", 1)], today: "2026-09-30", rules: RULES, stock: 2 });
  assert.deepEqual(g.days, []);
});

test("hors blocus : jamais proposé, et il ne casse pas la remontée", () => {
  const blocusRanges = [["2026-10-01", "2026-10-13"]];
  // 14 hors blocus : neutre, jamais proposé ; seul 13 (dans le blocus) manque.
  assert.deepEqual(gap([row("2026-10-12", 900)], { blocusRanges }).days, ["2026-10-13"]);
  assert.deepEqual(gap([row("2026-10-13", 900)], { blocusRanges }).days, []);
});

test("pas de série à sauver, trou trop long, stock insuffisant", () => {
  assert.deepEqual(gap([]).days, [], "aucun jour étudié");
  assert.deepEqual(gap([row("2026-10-10", 900)]).days, [], "4 jours manqués > 2 jokers");
  const two = gap([row("2026-10-12", 900)], { stock: 1 });
  assert.deepEqual(two.days, ["2026-10-13", "2026-10-14"]);
  assert.equal(two.canRepair, false, "on ne brûle pas un joker pour une série perdue quand même");
  assert.equal(gap([row("2026-10-12", 900)], { stock: 2 }).canRepair, true);
});

test("un joker déjà posé est neutre : la remontée le traverse", () => {
  const g = gap([row("2026-10-11", 900)], { freezes: ["2026-10-12"] });
  assert.deepEqual(g.days, ["2026-10-13", "2026-10-14"]);
});

test("joker historique (+1) conservé ; joker après le 05/10 : neutre, +0", () => {
  const before = studyStreaks({ rows: [row("2026-09-28", 60), row("2026-09-30", 60)], freezes: ["2026-09-29"], today: "2026-09-30", rules: RULES });
  assert.equal(before.current, 3);
  const after = studyStreaks({ rows: [row("2026-10-12", 600), row("2026-10-14", 600)], freezes: ["2026-10-13"], today: "2026-10-14", rules: RULES });
  assert.equal(after.current, 2);
  const [day] = studyDayStates({ rows: [], freezes: ["2026-10-13"], from: "2026-10-13", to: "2026-10-13", today: TODAY, rules: RULES });
  assert.equal(day.state, "neutral");
  assert.equal(day.is_studied, false);
  assert.equal(day.increments_streak, false);
});

// ── Chrono en cours : minuit (Bruxelles, UTC+2 le 15/10) ──────────────────────
const at = (iso) => new Date(iso).getTime();

test("chrono commencé hier à 23:50 et toujours ouvert : bloque hier", () => {
  const days = liveChronoDays({ elapsedSeconds: 30 * 60, timezone: "Europe/Brussels", now: at("2026-10-14T22:20:00Z") });
  assert.deepEqual(days, ["2026-10-14", "2026-10-15"]);
  const g = gap([row("2026-10-13", 900), row("2026-10-14", 120)], { blockedDays: days });
  assert.deepEqual(g, { days: ["2026-10-14"], blocked: true, canRepair: false });
});

test("chrono commencé aujourd'hui (00:05) : ne bloque pas hier", () => {
  const days = liveChronoDays({ elapsedSeconds: 60 * 60, timezone: "Europe/Brussels", now: at("2026-10-14T23:05:00Z") });
  assert.deepEqual(days, ["2026-10-15"]);
  assert.equal(gap([row("2026-10-13", 900)], { blockedDays: days }).canRepair, true);
});

test("chrono en pause : son début virtuel avance, il cesse de toucher hier", () => {
  // 5 min au compteur, en pause ; arrêté à 00:30 il s'écrirait 00:25 → 00:30.
  assert.deepEqual(liveChronoDays({ elapsedSeconds: 300, timezone: "Europe/Brussels", now: at("2026-10-14T22:30:00Z") }), ["2026-10-15"]);
  assert.deepEqual(liveChronoDays({ elapsedSeconds: 0, timezone: "Europe/Brussels" }), []);
});

test("voyage : le chrono se découpe dans SON fuseau (New York)", () => {
  // 01:00 UTC le 15 = 21:00 à New York le 14 : tout est encore le 14 là-bas.
  const days = liveChronoDays({ elapsedSeconds: 3600, timezone: "America/New_York", now: at("2026-10-15T01:00:00Z") });
  assert.deepEqual(days, ["2026-10-14"]);
});

// ── File hors ligne ───────────────────────────────────────────────────────────
const offline = {
  id: "offline-1", user_id: "u", timezone: "Europe/Brussels", duration_seconds: 240,
  started_at: "2026-10-14T18:00:00Z", ended_at: "2026-10-14T18:04:00Z",
};

test("session hors ligne de ce jour en attente : pas de proposition", () => {
  const rows = mergeStudyDays([row("2026-10-13", 900)], { unsynced: [offline] });
  const g = gap(rows, { blockedDays: pendingSessionDays([offline]) });
  assert.deepEqual(g.days, ["2026-10-14"], "4 min : le jour reste manqué…");
  assert.equal(g.canRepair, false, "…mais on attend la synchro avant de proposer");
});

test("synchronisée, elle rend le jour étudié : plus rien à proposer", () => {
  const synced = [row("2026-10-13", 900), row("2026-10-14", 240, "offline-1"), row("2026-10-14", 60, "offline-2")];
  assert.deepEqual(gap(synced, { freezes: ["2026-10-14"] }).days, []);
  // Relue deux fois (même session renvoyée) : toujours un seul jour, une seule série.
  const twice = mergeStudyDays(synced, { unsynced: [offline, offline] });
  assert.equal(twice, synced);
});

// ── Câblage ───────────────────────────────────────────────────────────────────
test("l'app demande au serveur avec SA date, et propose depuis le moteur canonique", () => {
  const lib = read("../lib/streakFreezes.js");
  const dashboard = read("../pages/dashboard.js");
  assert.match(lib, /rpc\("redeem_streak_freezes", \{ p_days: list, p_today: deviceToday\(\) \}\)/);
  assert.doesNotMatch(lib, /pendingDays|canRepair|localISO\(s\.started_at\)/, "plus de trou calculé sur les débuts de session");
  assert.match(dashboard, /const freezeGapInfo = useMemo\(/);
  assert.match(dashboard, /liveChronoDays\(\{ elapsedSeconds: elapsed, timezone: timerTimezone \}\)/);
  assert.match(dashboard, /pendingSessionDays\(unsyncedSessions\)/);
  assert.doesNotMatch(dashboard, /freezeInfo\?\.pendingDays/);
});

test("v74 : refus serveur canonique, remboursement additif et verrouillé", () => {
  const sql = read("../supabase/migration_v74_streak_freeze_guard_refund.sql");
  assert.match(sql, /cross join lateral public\.study_day_states\(v_user, d, d, v_today\) s\s+where s\.state <> 'missed'/);
  assert.match(sql, /Freeze day already studied/);
  assert.match(sql, /Freeze day outside blocus/);
  assert.match(sql, /when p_today between v_server_today - 1 and v_server_today \+ 1 then p_today/);
  assert.match(sql, /create table if not exists public\.streak_freeze_refunds/);
  assert.match(sql, /after insert on public\.session_day_parts/);
  // Le verrou du profil précède la suppression du joker (même ordre que redeem).
  const refund = sql.slice(sql.indexOf("function public.refund_streak_freeze_for_day"), sql.indexOf("function public.refund_streak_freeze_after_day_part"));
  assert.ok(refund.indexOf("for update") > 0 && refund.indexOf("for update") < refund.indexOf("delete from public.streak_freeze_days"));
  assert.match(refund, /least\(2, v_stock \+ 1\)/);
  // Aucun calcul legacy (missions, badges, classement) redéfini.
  for (const fn of ["gamification_current_streak", "award_badges_for_user", "refresh_daily_missions_for_user", "get_leaderboard_v2", "study_day_states", "study_streaks"]) {
    assert.doesNotMatch(sql, new RegExp(`create (or replace )?function public\\.${fn}\\b`), fn);
  }
});

test("textes : un joker n'est jamais présenté comme un jour étudié (FR + EN)", () => {
  const i18n = read("../lib/i18n.js");
  for (const key of ["streak.offerBodyOne", "streak.offerBodyMany", "streak.offerNotNeeded"]) {
    const hits = i18n.match(new RegExp(`"${key.replace(".", "\\.")}": "([^"]+)"`, "g")) || [];
    assert.equal(hits.length, 2, `${key} en FR et EN`);
  }
  assert.match(i18n, /"streak\.offerBodyOne": "[^"]*ne compte pas comme jour étudié/);
  assert.match(i18n, /"streak\.offerBodyOne": "[^"]*does not count as a study day/);
  assert.doesNotMatch(i18n, /comble ce jour|covers that day/);
});
