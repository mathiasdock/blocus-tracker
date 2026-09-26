// Phase 5A3-bis — joker rendu puis jour redevenu non étudié : la base annule le
// remboursement (v75, testé en base par supabase/tests/streak_freeze_reactivation.sql) ;
// l'app prévient avant une suppression / réduction qui ferait perdre un jour.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { daysLostByChange } from "../lib/sessionDayImpact.mjs";
import { STUDY_DAY_RULES } from "../lib/studyDayStates.mjs";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const RULES = { ...STUDY_DAY_RULES, newRulesFrom: "2026-10-05" };
const session = (id, start, secs) => ({
  id, timezone: "Europe/Brussels", duration_seconds: secs,
  started_at: new Date(start).toISOString(),
  ended_at: new Date(new Date(start).getTime() + secs * 1000).toISOString(),
});
const row = (s, local_date, seconds = s.duration_seconds) => ({ session_id: s.id, local_date, seconds });

test("suppression de la seule session du jour (après le 05/10) : jour perdu", () => {
  const a = session("a", "2026-10-12T08:00:00Z", 300);
  assert.deepEqual(daysLostByChange({ rows: [row(a, "2026-10-12")], session: a, rules: RULES }), ["2026-10-12"]);
});

test("plusieurs sessions : perdu seulement quand le TOTAL passe sous 5 min", () => {
  const [a, b, c] = ["a", "b", "c"].map((id, i) => session(id, `2026-10-12T${String(8 + i).padStart(2, "0")}:00:00Z`, 200));
  const rows = [row(a, "2026-10-12"), row(b, "2026-10-12"), row(c, "2026-10-12")];
  assert.deepEqual(daysLostByChange({ rows, session: a, rules: RULES }), [], "600 → 400 s : toujours validé");
  assert.deepEqual(daysLostByChange({ rows: rows.slice(1), session: b, rules: RULES }), ["2026-10-12"], "400 → 200 s");
});

test("réduction : 4 min perd le jour, 5 min le garde (la fin reste, le début recule)", () => {
  const a = session("a", "2026-10-12T08:00:00Z", 600);
  const rows = [row(a, "2026-10-12")];
  assert.deepEqual(daysLostByChange({ rows, session: a, newSeconds: 240, rules: RULES }), ["2026-10-12"]);
  assert.deepEqual(daysLostByChange({ rows, session: a, newSeconds: 300, rules: RULES }), []);
});

test("session à cheval sur minuit raccourcie : seul le jour qui passe sous le seuil est annoncé", () => {
  // 23:54 → 00:06 à Bruxelles (UTC+2) : 6 min le 12, 6 min le 13.
  const a = session("a", "2026-10-12T21:54:00Z", 720);
  const rows = [row(a, "2026-10-12", 360), row(a, "2026-10-13", 360)];
  // Raccourcie à 4 min : 00:02 → 00:06, tout le 13 (4 min) ; le 12 tombe à 0.
  assert.deepEqual(daysLostByChange({ rows, session: a, newSeconds: 240, rules: RULES }), ["2026-10-12", "2026-10-13"]);
  // Raccourcie à 10 min : 23:56 → 00:06 → 4 min le 12, 6 min le 13.
  assert.deepEqual(daysLostByChange({ rows, session: a, newSeconds: 600, rules: RULES }), ["2026-10-12"]);
});

test("avant le 05/10 : une seconde suffit, seule la suppression fait perdre le jour", () => {
  const a = session("a", "2026-09-20T08:00:00Z", 600);
  const rows = [row(a, "2026-09-20")];
  assert.deepEqual(daysLostByChange({ rows, session: a, newSeconds: 60, rules: RULES }), []);
  assert.deepEqual(daysLostByChange({ rows, session: a, rules: RULES }), ["2026-09-20"]);
});

test("jour déjà sous le seuil : rien à annoncer", () => {
  const a = session("a", "2026-10-12T08:00:00Z", 120);
  assert.deepEqual(daysLostByChange({ rows: [row(a, "2026-10-12")], session: a, rules: RULES }), []);
});

test("v75 : réactivation = annulation du remboursement, jamais de stock négatif", () => {
  const sql = read("../supabase/migration_v75_streak_freeze_reactivation.sql").replace(/--[^\n]*/g, "");
  // Contrôle à la validation, sur l'état final du jour, pour insertion ET suppression.
  assert.match(sql, /create constraint trigger b10_reconcile_streak_freeze\s+after insert or delete on public\.session_day_parts\s+deferrable initially deferred/);
  assert.match(sql, /drop trigger if exists b10_refund_streak_freeze/);
  const fn = sql.slice(sql.indexOf("function public.reconcile_streak_freeze_day"), sql.indexOf("function public.reconcile_streak_freeze_after_day_part"));
  // Verrou du profil avant toute lecture.
  assert.ok(fn.indexOf("for update") < fn.indexOf("from public.session_days"));
  // Crédit réel seulement ; reprise seulement si crédité ; sinon perdu, jamais < 0.
  assert.match(fn, /v_credited := v_month = v_now_month and v_saved_month is not distinct from v_now_month and v_stock < 2;/);
  assert.match(fn, /if v_refund\.stock_restored then/);
  assert.match(fn, /if v_stock < 1 then\s+update public\.streak_freeze_refunds set forfeited_at = now\(\)/);
  assert.match(fn, /set streak_freezes = v_stock - 1/);
  // Le joker d'origine (sa date d'utilisation), sans la fenêtre des 31 jours.
  assert.match(fn, /values \(p_user_id, p_day, v_refund\.used_at, v_refund\.stock_month\)/);
  assert.doesNotMatch(fn, /- 31/);
  assert.doesNotMatch(sql, /create (or replace )?function public\.(study_day_states|study_streaks|redeem_streak_freezes|gamification_current_streak)\b/);
});

test("app : l'avertissement est branché sur le Chrono et l'historique (FR + EN)", () => {
  const card = read("../components/TodaySessionsCard.js");
  const dashboard = read("../pages/dashboard.js");
  const history = read("../pages/historique.js");
  const i18n = read("../lib/i18n.js");
  assert.match(card, /dayLossFor\?\.\(session, null\)/);
  assert.match(card, /dayLossFor\?\.\(session, minutes \* 60\)/);
  assert.match(dashboard, /dayLossFor=\{sessionDayLoss\}/);
  assert.match(history, /dayLossFor=\{sessionDayLoss\}/);
  assert.equal((i18n.match(/"dash\.sessionStreakWarning": "/g) || []).length, 2);
  // Après suppression / modification, le stock est relu (joker repris).
  assert.equal((dashboard.match(/invalidateStreakFreezeUpkeep\(\);\n\s+setFreezeReload\(\(n\) => n \+ 1\);/g) || []).length, 3);
});
