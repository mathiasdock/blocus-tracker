// Rappel du soir — le plan (lib/eveningPlan.mjs), en logique pure : quel
// membre reçoit quoi, un soir donné, dans son fuseau. Aucune base, aucun envoi.
import test from "node:test";
import assert from "node:assert/strict";
import {
  NUDGE_WEEKLY_CAP, examVars, formatExamTime, normalizeNudgeCap, planEvening, renderEveningContent,
} from "../lib/eveningPlan.mjs";
import { computeSessionDayParts, sessionDays } from "../lib/sessionDayParts.mjs";
import { STUDY_DAY_RULES, studyDayStates, studyStreaks } from "../lib/studyDayStates.mjs";
import { AUTOMATION_BY_KEY, EVENING_KINDS } from "../lib/pushAutomations.mjs";

const NOW = new Date("2026-09-24T18:00:00Z"); // 20:00 à Bruxelles
const HOUR = 36e5;
const DAY = 864e5;
const U = "00000000-0000-4000-8000-000000000001";
const V = "00000000-0000-4000-8000-000000000002";

const members = (extra = {}, userId = U) => new Map([[userId, { timezone: "Europe/Brussels", ...extra }]]);
// Une session à midi (Bruxelles) ce jour-là ; 30 min par défaut.
const session = (day, seconds = 1800, userId = U) => ({ user_id: userId, started_at: `${day}T10:00:00Z`, duration_seconds: seconds });
const sent = (kind, at, userId = U) => ({ user_id: userId, kind, created_at: new Date(at).toISOString() });
const daysAgo = (n) => new Date(NOW.getTime() - n * DAY).toISOString().slice(0, 10);
// Série officielle telle que la base la renverrait (study_streak_reminder_states),
// calculée avec le même moteur canonique (lib/studyDayStates.mjs).
function officialStates({ sessions = [], frozenDays = new Map(), blocus = [], rules = STUDY_DAY_RULES, today = "2026-09-24", timezone = "Europe/Brussels" }) {
  const out = new Map();
  for (const userId of new Set([...sessions.map((row) => row.user_id), ...frozenDays.keys()])) {
    const rows = sessions.filter((row) => row.user_id === userId).flatMap((row, i) => {
      const s = { id: `${userId}-${i}`, user_id: userId, course_id: null, timezone, ...row,
        ended_at: new Date(new Date(row.started_at).getTime() + row.duration_seconds * 1000).toISOString() };
      return sessionDays(s, computeSessionDayParts(s));
    });
    const freezes = frozenDays.get(userId) || [];
    const [day] = studyDayStates({ rows, freezes, blocusRanges: blocus, from: today, to: today, today, rules });
    out.set(userId, { today, todayPreservesStreak: day.preserves_streak, current: studyStreaks({ rows, freezes, blocusRanges: blocus, today, rules }).current });
  }
  return out;
}
const plan = ({ blocus, rules, ...input }) => planEvening({
  now: NOW, members: members(), ...input,
  streakStates: input.streakStates || officialStates({ ...input, blocus, rules }),
});
const only = (result) => {
  assert.equal(result.entries.length, 1, JSON.stringify(result));
  return result.entries[0];
};

// ── Examens ───────────────────────────────────────────────────────────────
test("exam tomorrow: named, with its time, in French and English", () => {
  const entry = only(plan({ exams: [{ user_id: U, name: "Économie", exam_date: "2026-09-25", exam_time: "09:00:00" }] }));
  assert.equal(entry.kind, "exam_tomorrow");
  assert.equal(entry.reason, null);
  const content = renderEveningContent("exam_tomorrow", AUTOMATION_BY_KEY.exam_tomorrow, entry.data);
  assert.equal(content.title.fr, "Économie demain à 9 h 📚");
  assert.equal(content.title.en, "Économie tomorrow at 9 am 📚");
  assert.equal(content.body.fr, "Une dernière révision aujourd'hui et tu seras prêt.");
  assert.equal(content.url, "/planning");
});

test("several exams the same day: ONE summarised notification", () => {
  const two = only(plan({
    exams: [
      { user_id: U, name: "Droit", exam_date: "2026-09-25", exam_time: "14:30:00" },
      { user_id: U, name: "Économie", exam_date: "2026-09-25", exam_time: "09:00:00" },
    ],
  }));
  assert.equal(renderEveningContent("exam_tomorrow", AUTOMATION_BY_KEY.exam_tomorrow, two.data).title.fr, "Économie et Droit demain 📚");
  const three = only(plan({
    exams: ["A", "B", "C"].map((name) => ({ user_id: U, name, exam_date: "2026-09-25", exam_time: null })),
  }));
  const content = renderEveningContent("exam_tomorrow", AUTOMATION_BY_KEY.exam_tomorrow, three.data);
  assert.equal(content.title.fr, "3 examens demain 📚");
  assert.equal(content.title.en, "3 exams tomorrow 📚");
});

test("exam in 7 days: exactly one week before, never the day after", () => {
  const entry = only(plan({ exams: [{ user_id: U, name: "Économie", exam_date: "2026-10-01", exam_time: null }] }));
  assert.equal(entry.kind, "exam_in_7_days");
  const content = renderEveningContent("exam_in_7_days", AUTOMATION_BY_KEY.exam_in_7_days, entry.data);
  assert.equal(content.title.fr, "Économie dans 7 jours 📅");
  assert.equal(content.title.en, "Économie in 7 days 📅");
  // 6 ou 8 jours : rien. Un examen supprimé n'est plus dans les données : rien.
  assert.equal(plan({ exams: [{ user_id: U, name: "X", exam_date: "2026-09-30" }] }).entries.length, 0);
  assert.equal(plan({ exams: [{ user_id: U, name: "X", exam_date: "2026-10-02" }] }).entries.length, 0);
  assert.equal(plan({ exams: [] }).entries.length, 0);
});

test("exam times and long names fit a notification", () => {
  assert.equal(formatExamTime("09:00:00", "fr"), "9 h");
  assert.equal(formatExamTime("14:30:00", "fr"), "14 h 30");
  assert.equal(formatExamTime("14:30:00", "en"), "2:30 pm");
  assert.equal(formatExamTime("00:15:00", "en"), "12:15 am");
  assert.equal(formatExamTime(null, "fr"), null);
  const long = examVars([{ name: "Introduction approfondie à la macroéconomie européenne contemporaine", time: "08:00" }], "fr");
  assert.ok(long.exams.length <= 32);
  const title = renderEveningContent("exam_tomorrow", AUTOMATION_BY_KEY.exam_tomorrow, {
    exams: [{ name: "Introduction approfondie à la macroéconomie européenne contemporaine", time: "08:00" }],
  }).title.fr;
  assert.ok(title.length <= 60, title);
  // Aucune donnée inventée : sans examen nommé, rien ne part.
  assert.equal(renderEveningContent("exam_tomorrow", AUTOMATION_BY_KEY.exam_tomorrow, { exams: [] }), null);
});

// ── Série ─────────────────────────────────────────────────────────────────
test("streak: 1 or 2 days → nothing; 3 days or more → at risk, with the real length", () => {
  assert.equal(plan({ sessions: [session(daysAgo(1)), session(daysAgo(2))] }).entries.length, 0);
  const entry = only(plan({ sessions: [session(daysAgo(1)), session(daysAgo(2)), session(daysAgo(3)), session(daysAgo(4))] }));
  assert.equal(entry.kind, "streak_at_risk");
  assert.equal(entry.data.days, 4);
  const content = renderEveningContent("streak_at_risk", AUTOMATION_BY_KEY.streak_at_risk, entry.data);
  assert.equal(content.title.fr, "Ta série de 4 jours est en danger 🔥");
  assert.equal(content.title.en, "Your 4-day streak is at risk 🔥");
  assert.equal(content.url, "/dashboard");
});

test("streak: the official streak — before the cutover short sessions count and a joker adds a day", () => {
  // Avant le 2026-10-05, toute seconde valide la journée.
  const short = only(plan({ sessions: [1, 2, 3].map((n) => session(daysAgo(n), 120)) }));
  assert.equal(short.data.days, 3);
  // Joker historique : préserve la série et compte +1.
  const frozen = only(plan({
    sessions: [session(daysAgo(1)), session(daysAgo(3)), session(daysAgo(4))],
    frozenDays: new Map([[U, [daysAgo(2)]]]),
  }));
  assert.equal(frozen.data.days, 4);
});

test("streak: after the cutover, today counts only from 5 minutes; a joker keeps it without adding", () => {
  const rules = { ...STUDY_DAY_RULES, newRulesFrom: daysAgo(10) };
  const history = [1, 2, 3, 4].map((n) => session(daysAgo(n)));
  // 4 min 59 aujourd'hui : la journée n'est pas validée, le rappel part.
  assert.equal(only(plan({ sessions: [...history, session(daysAgo(0), 299)], rules })).kind, "streak_at_risk");
  // 5 min : validée, plus rien.
  assert.equal(plan({ sessions: [...history, session(daysAgo(0), 300)], rules }).entries.length, 0);
  // Joker après la bascule : il préserve (pas de trou), mais n'ajoute rien.
  const kept = only(plan({
    sessions: [session(daysAgo(1)), session(daysAgo(3)), session(daysAgo(4)), session(daysAgo(5))],
    frozenDays: new Map([[U, [daysAgo(2)]]]),
    rules,
  }));
  assert.equal(kept.data.days, 4);
});

test("streak: outside the declared blocus the streak is paused — no « at risk »", () => {
  const history = [1, 2, 3, 4].map((n) => session(daysAgo(n)));
  assert.equal(plan({ sessions: history, blocus: [[daysAgo(30), daysAgo(1)]] }).entries.length, 0);
  assert.equal(only(plan({ sessions: history, blocus: [[daysAgo(30), daysAgo(0)]] })).kind, "streak_at_risk");
});

test("streak: no official state, or a state for another day → no streak reminder", () => {
  const history = [1, 2, 3, 4].map((n) => session(daysAgo(n)));
  assert.equal(plan({ sessions: history, streakStates: new Map() }).entries.length, 0);
  const stale = new Map([[U, { today: daysAgo(1), todayPreservesStreak: false, current: 9 }]]);
  assert.equal(plan({ sessions: history, streakStates: stale }).entries.length, 0);
});

test("streak: no push once today is covered — short or real session, or a joker", () => {
  const history = [1, 2, 3, 4].map((n) => session(daysAgo(n)));
  assert.equal(plan({ sessions: [...history, session(daysAgo(0), 300)] }).entries.length, 0);
  assert.equal(plan({ sessions: [...history, session(daysAgo(0), 900)] }).entries.length, 0);
  assert.equal(plan({ sessions: history, frozenDays: new Map([[U, [daysAgo(0)]]]) }).entries.length, 0);
});

// ── Activation ────────────────────────────────────────────────────────────
test("first start, 48 to 72 h after signing up: the right variant, once", () => {
  const createdAt = new Date(NOW.getTime() - 50 * HOUR).toISOString();
  assert.equal(only(planEvening({ now: NOW, members: members({ createdAt }) })).kind, "first_activation_plan");
  // Un examen ou un objectif ajouté : le chrono plutôt que le planning.
  assert.equal(only(planEvening({ now: NOW, members: members({ createdAt }), configured: new Set([U]) })).kind, "first_activation_start");
  // Déjà reçu : plus jamais.
  assert.equal(planEvening({
    now: NOW, members: members({ createdAt: new Date(NOW.getTime() - 70 * HOUR).toISOString() }),
    history: [sent("first_activation_plan", NOW.getTime() - 22 * HOUR)],
  }).entries.length, 0);
  // Trop tôt (40 h), trop tard (100 h), ou a déjà vraiment étudié : rien.
  for (const hours of [40, 100]) {
    assert.equal(planEvening({ now: NOW, members: members({ createdAt: new Date(NOW.getTime() - hours * HOUR).toISOString() }) }).entries.length, 0);
  }
  assert.equal(planEvening({ now: NOW, members: members({ createdAt }), sessions: [session(daysAgo(1), 900)] }).entries.length, 0);
});

test("second start, about 7 days after signing up: only after the first, once, then never again", () => {
  const createdAt = new Date(NOW.getTime() - 170 * HOUR).toISOString();
  const first = sent("first_activation_start", NOW.getTime() - 5 * DAY);
  assert.equal(only(planEvening({ now: NOW, members: members({ createdAt }), history: [first] })).kind, "second_activation");
  // Sans le premier : rien. Déjà reçu : rien.
  assert.equal(planEvening({ now: NOW, members: members({ createdAt }) }).entries.length, 0);
  assert.equal(planEvening({
    now: NOW, members: members({ createdAt: new Date(NOW.getTime() - 200 * HOUR).toISOString() }),
    history: [first, sent("second_activation", NOW.getTime() - DAY - HOUR)],
  }).entries.length, 0);
  // Un essai de 5 minutes n'est pas un vrai démarrage : la relance part.
  assert.equal(only(planEvening({
    now: NOW, members: members({ createdAt }), history: [first], sessions: [session(daysAgo(3), 300)],
  })).kind, "second_activation");
  // Après le second : plus aucune relance d'activation automatique.
  for (const days of [11, 20, 40]) {
    assert.equal(planEvening({
      now: NOW, members: members({ createdAt: new Date(NOW.getTime() - days * DAY).toISOString() }),
      history: [first, sent("second_activation", NOW.getTime() - (days - 7) * DAY)],
    }).entries.length, 0);
  }
});

// ── Reprise ───────────────────────────────────────────────────────────────
test("comeback after 7 days, then after 21 days, then STOP", () => {
  assert.equal(only(plan({ sessions: [session(daysAgo(8))] })).kind, "reactivation_7d");
  // J+21 : seulement si la reprise à 7 jours est partie pour CETTE absence.
  const seven = sent("reactivation_7d", NOW.getTime() - 13 * DAY);
  assert.equal(only(plan({ sessions: [session(daysAgo(21))], history: [seven] })).kind, "reactivation_21d");
  assert.equal(plan({ sessions: [session(daysAgo(21))] }).entries.length, 0);
  // Après J+21 : plus rien tant qu'il ne revient pas.
  const twentyOne = sent("reactivation_21d", NOW.getTime() - 7 * DAY);
  assert.equal(plan({ sessions: [session(daysAgo(28))], history: [seven, twentyOne] }).entries.length, 0);
  // Jamais pour quelqu'un qui n'a jamais vraiment étudié.
  assert.equal(plan({ sessions: [session(daysAgo(8), 300)] }).entries.length, 0);
});

test("a new real session resets the cycle; a short one does not; 30 days between cycles", () => {
  // Ancien cycle il y a 40 jours, revenu puis reparti il y a 9 jours : nouveau cycle.
  const oldCycle = sent("reactivation_7d", NOW.getTime() - 40 * DAY);
  assert.equal(only(plan({ sessions: [session(daysAgo(9))], history: [oldCycle] })).kind, "reactivation_7d");
  // Déjà envoyé pour cette absence : rien.
  assert.equal(plan({ sessions: [session(daysAgo(10))], history: [sent("reactivation_7d", NOW.getTime() - 2 * DAY)] }).entries.length, 0);
  // Cycle précédent il y a 20 jours : trop récent, même pour une nouvelle absence.
  assert.equal(plan({ sessions: [session(daysAgo(9))], history: [sent("reactivation_7d", NOW.getTime() - 20 * DAY)] }).entries.length, 0);
  // Une session de 3 minutes ne remet pas le compteur à zéro.
  assert.equal(only(plan({ sessions: [session(daysAgo(8)), session(daysAgo(3), 180)] })).kind, "reactivation_7d");
});

// ── Règles globales ───────────────────────────────────────────────────────
test("priority: one notification per evening, the first that applies", () => {
  const streak = [1, 2, 3].map((n) => session(daysAgo(n)));
  const tomorrow = { user_id: U, name: "Droit", exam_date: "2026-09-25" };
  const nextWeek = { user_id: U, name: "Économie", exam_date: "2026-10-01" };
  assert.equal(only(plan({ sessions: streak, exams: [tomorrow, nextWeek] })).kind, "exam_tomorrow");
  // Les faits d'examen passent avant les relances : J-7 n'a qu'un seul soir.
  assert.equal(only(plan({ sessions: streak, exams: [nextWeek] })).kind, "exam_in_7_days");
  assert.equal(only(plan({ sessions: streak })).kind, "streak_at_risk");
  assert.deepEqual(EVENING_KINDS, [
    "exam_tomorrow", "exam_in_7_days", "streak_at_risk", "first_activation_plan", "first_activation_start",
    "second_activation", "reactivation_7d", "reactivation_21d",
  ]);
});

test("nudge cap: 2 over 7 rolling days, never the same two evenings in a row; facts pass", () => {
  const streak = [1, 2, 3].map((n) => session(daysAgo(n)));
  const twoNudges = [sent("reactivation_7d", NOW.getTime() - 3 * DAY), sent("streak_at_risk", NOW.getTime() - 5 * DAY)];
  const capped = only(plan({ sessions: streak, history: twoNudges }));
  assert.deepEqual([capped.kind, capped.reason], ["streak_at_risk", "frequency"]);
  // Plafonnée, la relance laisse passer un fait (examen dans 7 jours).
  const fact = only(plan({ sessions: streak, history: twoNudges, exams: [{ user_id: U, name: "Économie", exam_date: "2026-10-01" }] }));
  assert.deepEqual([fact.kind, fact.reason], ["exam_in_7_days", null]);
  // Même relance hier : pas deux soirs de suite, même sous le plafond.
  const yesterday = only(plan({ sessions: streak, history: [sent("streak_at_risk", NOW.getTime() - DAY)] }));
  assert.equal(yesterday.reason, "frequency");
  // Les anciennes relances comptent encore ; au-delà de 7 jours, plus.
  assert.equal(only(plan({ sessions: streak, history: [sent("nudge_study", NOW.getTime() - 2 * DAY), sent("comeback_day3", NOW.getTime() - 4 * DAY)] })).reason, "frequency");
  assert.equal(only(plan({ sessions: streak, history: twoNudges.map((row) => ({ ...row, created_at: new Date(NOW.getTime() - 8 * DAY).toISOString() })) })).reason, null);
  // Le réglage admin ne peut que baisser le plafond.
  assert.equal(normalizeNudgeCap(7), NUDGE_WEEKLY_CAP);
  assert.equal(normalizeNudgeCap(1), 1);
  assert.equal(only(plan({ sessions: streak, cap: 1, history: [sent("reactivation_7d", NOW.getTime() - 3 * DAY)] })).reason, "frequency");
});

test("already reminded today: nothing more, whatever the kind", () => {
  const result = plan({
    exams: [{ user_id: U, name: "Droit", exam_date: "2026-09-25" }],
    history: [sent("exam_in_7_days", NOW.getTime() - HOUR)],
  });
  assert.equal(result.entries.length, 0);
  assert.equal(result.skipped.already_sent, 1);
});

test("time zones: the member's own day, and quiet hours in their own time", () => {
  // 02:00 UTC = 22:00 la veille à New York : ces sessions sont ses 21, 22, 23.
  const nightly = [22, 23, 24].map((day) => ({ user_id: U, started_at: `2026-09-${day}T02:00:00Z`, duration_seconds: 1800 }));
  const newYork = only(planEvening({ now: NOW, members: members({ timezone: "America/New_York" }), sessions: nightly,
    streakStates: officialStates({ sessions: nightly, timezone: "America/New_York" }) }));
  assert.deepEqual([newYork.kind, newYork.localDate, newYork.data.days], ["streak_at_risk", "2026-09-24", 3]);
  // À Bruxelles, la dernière est aujourd'hui : série sauve, rien.
  assert.equal(planEvening({ now: NOW, members: members(), sessions: nightly, streakStates: officialStates({ sessions: nightly }) }).entries.length, 0);
  // Hong Kong : 2 h du matin, heures calmes.
  const hongKong = planEvening({ now: NOW, members: members({ timezone: "Asia/Hong_Kong" }), sessions: [1, 2, 3].map((n) => session(daysAgo(n))) });
  assert.equal(hongKong.entries.length, 0);
  assert.equal(hongKong.skipped.quiet_hours, 1);
});

test("preferences, suspension and switched-off kinds are counted, never sent", () => {
  const streak = [1, 2, 3].map((n) => session(daysAgo(n)));
  const excluded = only(planEvening({ now: NOW, members: members({ reason: "category_off" }), sessions: streak, streakStates: officialStates({ sessions: streak }) }));
  assert.deepEqual([excluded.kind, excluded.reason], ["streak_at_risk", "category_off"]);
  const off = only(plan({ sessions: streak, enabled: { streak_at_risk: false } }));
  assert.equal(off.reason, "disabled");
  const offWithFact = only(plan({ sessions: streak, enabled: { streak_at_risk: false }, exams: [{ user_id: U, name: "É", exam_date: "2026-10-01" }] }));
  assert.equal(offWithFact.kind, "exam_in_7_days");
});

test("each member is planned alone: nothing leaks from one to another", () => {
  const vSessions = [1, 2, 3].map((n) => session(daysAgo(n), 1800, V));
  const result = planEvening({
    now: NOW,
    members: new Map([[U, { timezone: "Europe/Brussels" }], [V, { timezone: "Europe/Brussels" }]]),
    sessions: vSessions,
    streakStates: officialStates({ sessions: vSessions }),
    exams: [{ user_id: U, name: "Droit", exam_date: "2026-09-25" }],
  });
  const byUser = Object.fromEntries(result.entries.map((entry) => [entry.userId, entry.kind]));
  assert.deepEqual(byUser, { [U]: "exam_tomorrow", [V]: "streak_at_risk" });
});
