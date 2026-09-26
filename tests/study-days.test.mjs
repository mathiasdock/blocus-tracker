import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  deviceToday,
  fetchStudyDays,
  mergeStudyDays,
  secondsByDay,
  secondsOn,
  sessionsOnDay,
  syncedSessionDays,
  unsyncedSessionDays,
} from "../lib/studyDays.mjs";
import { computeSessionDayParts } from "../lib/sessionDayParts.mjs";
import { activeDaysIn, buildTimeSeries, courseBreakdown, resolvePeriod } from "../lib/statsPeriod.js";
import { computeInsights } from "../lib/statsInsights.mjs";
import { computeProgress } from "../lib/blocus.js";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const legacyCases = JSON.parse(read("./fixtures/session-days-legacy-cases.json")).cases;

// Rejoue un bloc avec l'appareil réglé sur un autre fuseau (Node relit TZ à
// chaud). Les dates « aujourd'hui » et les calculs locaux suivent ; le jour
// d'une session, lui, ne doit jamais bouger.
function inZone(timeZone, fn) {
  const before = process.env.TZ;
  process.env.TZ = timeZone;
  try { return fn(); } finally {
    if (before === undefined) delete process.env.TZ; else process.env.TZ = before;
  }
}

// Ce que renverrait la vue session_days pour une session en base.
const serverRows = (session) => syncedSessionDays(session).map(({ provenance, user_id, ...row }) => row);
const sum = (rows) => rows.reduce((a, r) => a + r.seconds, 0);

const single = { id: "s-single", user_id: "u", course_id: "c1", timezone: "Europe/Brussels", timezone_source: "device", started_at: "2026-09-21T12:00:00Z", ended_at: "2026-09-21T13:30:00Z", duration_seconds: 5400 };
const overnightNY = { id: "s-night", user_id: "u", course_id: "c2", timezone: "America/New_York", timezone_source: "device", started_at: "2026-09-20T03:30:00Z", ended_at: "2026-09-20T04:30:00Z", duration_seconds: 3600 };
const inferred = { id: "s-inferred", user_id: "u", course_id: "c1", timezone: "Europe/Brussels", timezone_source: "inferred", started_at: "2026-08-07T02:29:00Z", ended_at: "2026-08-07T03:29:00Z", duration_seconds: 3600 };
const legacy = { id: "s-legacy", user_id: "u", course_id: null, timezone: null, timezone_source: null, started_at: "2026-05-20T21:30:00Z", ended_at: "2026-05-20T22:30:00Z", duration_seconds: 3600 };

test("session sur un seul jour : une ligne, toute la durée", () => {
  const rows = serverRows(single);
  assert.deepEqual(rows, [{ session_id: "s-single", local_date: "2026-09-21", seconds: 5400, course_id: "c1" }]);
  const list = sessionsOnDay(rows, "2026-09-21", { synced: [single] });
  assert.equal(list.length, 1);
  assert.equal(list[0].day_seconds, 5400);
  assert.equal(list[0].pending, false);
});

test("23:30 → 00:30 : 30 min chaque jour, dans la liste des DEUX jours, vraies heures gardées", () => {
  const rows = serverRows(overnightNY);
  assert.deepEqual(rows.map((r) => [r.local_date, r.seconds]), [["2026-09-19", 1800], ["2026-09-20", 1800]]);
  for (const day of ["2026-09-19", "2026-09-20"]) {
    const list = sessionsOnDay(rows, day, { synced: [overnightNY] });
    assert.equal(list.length, 1, day);
    assert.equal(list[0].day_seconds, 1800, day);
    assert.equal(list[0].duration_seconds, 3600, "l'édition porte toujours sur la session entière");
    assert.equal(list[0].started_at, overnightNY.started_at);
    assert.equal(list[0].ended_at, overnightNY.ended_at);
    assert.equal(sum(list.map((s) => ({ seconds: s.day_seconds }))), secondsOn(rows, day), "liste = total du jour");
  }
});

test("historique inféré : les lignes serveur passent telles quelles", () => {
  const rows = [{ session_id: "s-inferred", local_date: "2026-08-07", seconds: 3600, course_id: "c1" }];
  assert.deepEqual(serverRows(inferred), rows);
  assert.equal(mergeStudyDays(rows, { synced: [inferred] }), rows, "rien d'ajouté : la base connaît déjà la session");
});

test("legacy : même règle que la vue (jour de début à Bruxelles, durée entière, pas de découpage)", () => {
  assert.deepEqual(serverRows(legacy), [{ session_id: "s-legacy", local_date: "2026-05-20", seconds: 3600, course_id: null }]);
  for (const c of legacyCases) {
    const rows = syncedSessionDays({ ...legacy, started_at: c.started_at, ended_at: c.started_at, duration_seconds: 60 });
    assert.deepEqual(rows.map((r) => [r.local_date, r.seconds, r.provenance]), [[c.expected_local_date, 60, "legacy"]], c.started_at);
  }
});

test("historique de Mathias (Bruxelles puis New York) : le jour d'une session ne dépend pas de l'appareil", () => {
  const device = { ...overnightNY, id: "s-ny", started_at: "2026-09-24T20:50:00Z", ended_at: "2026-09-24T20:52:36Z", duration_seconds: 156 };
  const expected = {
    "s-inferred": [["2026-08-07", 3600]],
    "s-legacy": [["2026-05-20", 3600]],
    "s-ny": [["2026-09-24", 156]],
  };
  for (const zone of ["America/New_York", "Europe/Brussels", "Asia/Tokyo"]) {
    inZone(zone, () => {
      for (const session of [inferred, legacy, device]) {
        assert.deepEqual(serverRows(session).map((r) => [r.local_date, r.seconds]), expected[session.id], `${session.id} @ ${zone}`);
      }
    });
  }
});

test("autour de minuit : « aujourd'hui » est la date de l'appareil, à New York comme à Bruxelles", () => {
  // 2026-09-25 03:59 UTC = 23:59 le 24 à New York, 05:59 le 25 à Bruxelles.
  const instant = new Date("2026-09-25T03:59:00Z");
  assert.equal(inZone("America/New_York", () => deviceToday(instant)), "2026-09-24");
  assert.equal(inZone("Europe/Brussels", () => deviceToday(instant)), "2026-09-25");
  // 2026-09-24 22:30 UTC = 00:30 le 25 à Bruxelles, 18:30 le 24 à New York.
  const late = new Date("2026-09-24T22:30:00Z");
  assert.equal(inZone("Europe/Brussels", () => deviceToday(late)), "2026-09-25");
  assert.equal(inZone("America/New_York", () => deviceToday(late)), "2026-09-24");

  // Une session New York 23:30 → 00:30 : vue depuis New York juste après minuit,
  // aujourd'hui = 30 min ; hier = 30 min. Vue depuis Bruxelles, rien ne bouge
  // dans ses jours — seul le jour affiché change.
  const rows = serverRows(overnightNY);
  const nyNow = new Date("2026-09-20T04:45:00Z");
  assert.equal(inZone("America/New_York", () => secondsOn(rows, deviceToday(nyNow))), 1800);
  assert.equal(inZone("Europe/Brussels", () => secondsOn(rows, deviceToday(nyNow))), 1800);
  assert.equal(inZone("Europe/Brussels", () => deviceToday(nyNow)), "2026-09-20");
});

test("session enregistrée sur un appareil, fuseau de l'appareil changé ensuite : ses jours ne bougent pas", () => {
  // Chrono lancé à New York (fuseau capturé), la personne arrive à Bruxelles
  // avant la synchronisation : la file garde le fuseau d'origine.
  const queued = { id: "s-travel", user_id: "u", course_id: null, timezone: "America/New_York", started_at: "2026-09-20T03:30:00Z", ended_at: "2026-09-20T04:30:00Z", duration_seconds: 3600 };
  const inBrussels = inZone("Europe/Brussels", () => unsyncedSessionDays(queued));
  const inNewYork = inZone("America/New_York", () => unsyncedSessionDays(queued));
  assert.deepEqual(inBrussels, inNewYork);
  assert.deepEqual(inBrussels.map((r) => [r.local_date, r.seconds, r.provenance]), [["2026-09-19", 1800, "pending"], ["2026-09-20", 1800, "pending"]]);
  // Même résultat que la base après synchronisation.
  assert.deepEqual(inBrussels.map((r) => [r.local_date, r.seconds]), serverRows({ ...queued, timezone_source: "device" }).map((r) => [r.local_date, r.seconds]));
});

test("session sans fuseau capturé, pas encore en base : fuseau de l'appareil (celui que la base prendra via le profil)", () => {
  const payload = { id: "s-nocapture", user_id: "u", started_at: "2026-09-20T03:30:00Z", ended_at: "2026-09-20T04:30:00Z", duration_seconds: 3600 };
  const ny = inZone("America/New_York", () => unsyncedSessionDays(payload));
  assert.deepEqual(ny.map((r) => [r.local_date, r.seconds]), computeSessionDayParts({ ...payload, timezone: "America/New_York" }).map((p) => [p.local_date, p.seconds]));
  const brussels = inZone("Europe/Brussels", () => unsyncedSessionDays(payload));
  assert.deepEqual(brussels.map((r) => [r.local_date, r.seconds]), [["2026-09-20", 3600]]);
});

test("hors ligne puis synchronisé : jamais compté deux fois", () => {
  const payload = { id: "s-offline", user_id: "u", course_id: "c1", timezone: "Europe/Brussels", started_at: "2026-09-24T21:40:00Z", ended_at: "2026-09-24T22:20:00Z", duration_seconds: 2400 };
  const day1 = "2026-09-24";
  const day2 = "2026-09-25";
  const base = serverRows(single);

  // 1. Arrêtée hors ligne : dans la file ET dans le crédit de la page.
  const offline = mergeStudyDays(base, { unsynced: [payload, payload] });
  assert.equal(secondsOn(offline, day1), 1200);
  assert.equal(secondsOn(offline, day2), 1200);
  const offlineList = sessionsOnDay(offline, day2, { unsynced: [payload] });
  assert.equal(offlineList.length, 1);
  assert.equal(offlineList[0].pending, true, "pas modifiable avant d'être en base");

  // 2. Insérée, ligne renvoyée par la base mais session_days pas encore relue.
  const inserted = { ...payload, timezone_source: "device" };
  const justSynced = mergeStudyDays(base, { synced: [inserted], unsynced: [payload] });
  assert.equal(secondsOn(justSynced, day1), 1200);
  assert.equal(secondsOn(justSynced, day2), 1200);
  assert.equal(sessionsOnDay(justSynced, day2, { synced: [inserted], unsynced: [payload] })[0].pending, false);

  // 3. session_days la contient : les lignes serveur l'emportent, la file est ignorée.
  const server = [...base, ...serverRows(inserted)];
  const synced = mergeStudyDays(server, { synced: [inserted], unsynced: [payload] });
  assert.equal(synced, server);
  assert.equal(secondsOn(synced, day1) + secondsOn(synced, day2), 2400);

  // Le total ne bouge à aucune étape.
  const totals = [offline, justSynced, synced].map((rows) => sum(rows));
  assert.deepEqual(totals, [5400 + 2400, 5400 + 2400, 5400 + 2400]);
});

test("Dashboard et Stats : mêmes totaux sur chaque période, jours = session_days, liste = total", () => {
  const sessions = [single, overnightNY, inferred, legacy];
  const rows = sessions.flatMap(serverRows);
  const byDay = secondsByDay(rows);
  inZone("Europe/Brussels", () => {
    // Stats : graphique, par cours, jours actifs sur « depuis le début ».
    const range = resolvePeriod("all", { days: rows });
    assert.equal(range.fromISO, "2026-05-20");
    const series = buildTimeSeries(rows, range, "fr");
    assert.equal(series.reduce((a, b) => a + b.secs, 0), sum(rows));
    const breakdown = courseBreakdown(rows, [{ id: "c1" }, { id: "c2" }], range);
    assert.equal(breakdown.totalSecs, sum(rows));
    assert.equal(activeDaysIn(rows, range), Object.keys(byDay).length);
    // Un jour du graphique = la somme de ses lignes (fenêtre journalière).
    const week = { fromISO: "2026-09-15", toISO: "2026-09-21", days: 7 };
    const daily = buildTimeSeries(rows, week, "fr");
    for (const bucket of daily) assert.equal(bucket.secs, byDay[bucket.iso] || 0, bucket.iso);
    // La session de nuit compte UNE session dans une barre qui couvre ses deux jours.
    const weekly = buildTimeSeries(rows, { fromISO: "2026-08-01", toISO: "2026-09-27", days: 58 }, "fr");
    const nightWeek = weekly.find((b) => b.iso === "2026-09-14");
    assert.equal(nightWeek.count, 1);
    assert.equal(nightWeek.secs, 3600);
  });
  // Chaque jour : liste du jour = total du jour.
  for (const day of Object.keys(byDay)) {
    const list = sessionsOnDay(rows, day, { synced: sessions });
    assert.equal(list.reduce((a, s) => a + s.day_seconds, 0), byDay[day], day);
  }
  // Chaque session : somme de ses jours = sa durée.
  for (const session of sessions) {
    assert.equal(sum(rows.filter((r) => r.session_id === session.id)), session.duration_seconds, session.id);
  }
});

test("habitudes : records par jour depuis les jours, habitudes de session depuis les sessions", () => {
  const sessions = [overnightNY];
  const rows = serverRows(overnightNY);
  const out = inZone("America/New_York", () => computeInsights(sessions, rows));
  assert.equal(out.bestDaySecs, 1800, "la nuit est partagée entre deux jours");
  assert.equal(out.longestSessionSecs, 3600, "la plus longue session reste une session");
  assert.equal(out.sessionCount, 1);
  const before = inZone("America/New_York", () => computeInsights(sessions));
  assert.equal(before.bestDaySecs, 3600, "sans jours fournis : ancien comportement, session entière au jour de début");
});

test("blocus : heures et jours actifs depuis session_days", () => {
  const rows = serverRows(overnightNY);
  const period = { start_date: "2026-09-20", end_date: "2026-09-30", goal_hours: null };
  const progress = computeProgress(period, rows);
  assert.equal(progress.hoursDone, 0.5, "seule la part tombée dans la période compte");
  assert.equal(progress.activeDays, 1);
});

test("lecture paginée de session_days", async () => {
  const pages = [Array.from({ length: 1000 }, (_, i) => ({ i })), [{ i: 1000 }]];
  const calls = [];
  const fake = {
    from(table) {
      const q = {
        filters: [],
        select() { return q; },
        eq(c, v) { q.filters.push(["eq", c, v]); return q; },
        gte(c, v) { q.filters.push(["gte", c, v]); return q; },
        order() { return q; },
        range(from, to) {
          calls.push({ table, from, to, filters: q.filters });
          return Promise.resolve({ data: pages[calls.length - 1] || [], error: null });
        },
      };
      return q;
    },
  };
  const { data, error } = await fetchStudyDays(fake, "u", { fromISO: "2026-06-27" });
  assert.equal(error, null);
  assert.equal(data.length, 1001);
  assert.deepEqual(calls.map((c) => [c.table, c.from, c.to]), [["session_days", 0, 999], ["session_days", 1000, 1999]]);
  assert.deepEqual(calls[0].filters, [["eq", "user_id", "u"], ["gte", "local_date", "2026-06-27"]]);
});

test("Dashboard et Stats lisent session_days ; séries, gels et missions gardent leur source", () => {
  const dashboard = read("../pages/dashboard.js");
  const stats = read("../pages/stats.js");
  for (const [name, src] of [["dashboard", dashboard], ["stats", stats]]) {
    assert.match(src, /fetchStudyDays\(supabase, user\.id/, name);
    assert.match(src, /mergeStudyDays\(/, name);
    assert.doesNotMatch(src, /localISO\(s\.started_at\)/, `${name} ne range plus une session par son heure de début`);
  }
  // Jokers (5A3) : le trou se lit sur les jours canoniques, plus sur les
  // sessions (tests/streak-freezes.test.mjs) ; la série est officielle (5A2).
  assert.match(dashboard, /runStreakFreezeUpkeep\(supabase, user\.id\)/);
  assert.match(stats, /runStreakFreezeUpkeep\(supabase, user\.id\)/);
  // Missions (repli local) : sessions commencées depuis minuit, comme avant.
  assert.match(dashboard, /const dayStart = new Date\(localDayStartISO\(\)\)\.getTime\(\);/);
  assert.match(dashboard, /getDailyMissionDefs\(todayISO\(\), user\?\.id, \{ streak: missionStats\.streak \}\)/);
  // La liste du jour affiche la part du jour, l'édition la session entière.
  const card = read("../components/TodaySessionsCard.js");
  assert.match(card, /formatMinutesShort\(session\.day_seconds \?\? session\.duration_seconds\)/);
  assert.match(card, /const maxMinutes = Math\.max\(1, Math\.floor\(Number\(session\.duration_seconds \|\| 0\) \/ 60\)\);/);
});
