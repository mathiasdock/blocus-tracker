import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { mock, test } from "node:test";
import { currentWeekDates, thisWeekSeconds } from "../lib/studyDays.mjs";
import { computeProgress, pickCurrent, suggestFromExams } from "../lib/blocus.js";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

// Appareil réglé sur `timeZone`, horloge arrêtée à `iso` (UTC).
function at(timeZone, iso, fn) {
  const before = process.env.TZ;
  process.env.TZ = timeZone;
  mock.timers.enable({ apis: ["Date"], now: new Date(iso) });
  try { return fn(); } finally {
    mock.timers.reset();
    if (before === undefined) delete process.env.TZ; else process.env.TZ = before;
  }
}

// Une ligne session_days par jour, 1 h chacune, du 20 au 28 septembre 2026.
const rows = Array.from({ length: 9 }, (_, i) => ({ session_id: `s${i}`, local_date: `2026-09-${String(20 + i).padStart(2, "0")}`, seconds: 3600 }));

test("« Cette semaine » = lundi → aujourd'hui, date locale de l'appareil", () => {
  // Dimanche 27 à 23:30 à Bruxelles (21:30 UTC) : la semaine du lundi 21 est complète.
  at("Europe/Brussels", "2026-09-27T21:30:00Z", () => {
    assert.deepEqual(currentWeekDates(), ["2026-09-21", "2026-09-22", "2026-09-23", "2026-09-24", "2026-09-25", "2026-09-26", "2026-09-27"]);
    assert.equal(thisWeekSeconds(rows), 7 * 3600);
  });
  // Lundi 28 à 00:30 à Bruxelles (dimanche 22:30 UTC) : nouvelle semaine, seul lundi compte.
  at("Europe/Brussels", "2026-09-27T22:30:00Z", () => {
    assert.equal(currentWeekDates()[0], "2026-09-28");
    assert.equal(thisWeekSeconds(rows), 3600);
  });
  // Lundi 28 à 00:10 à New York : lundi aussi, même si Bruxelles est à 06:10.
  at("America/New_York", "2026-09-28T04:10:00Z", () => {
    assert.equal(currentWeekDates()[0], "2026-09-28");
    assert.equal(thisWeekSeconds(rows), 3600);
  });
  // Dimanche 27 à 21:30 à New York (lundi 01:30 UTC) : encore dimanche, semaine du 21.
  at("America/New_York", "2026-09-28T01:30:00Z", () => {
    assert.equal(currentWeekDates()[0], "2026-09-21");
    assert.equal(thisWeekSeconds(rows), 7 * 3600);
  });
  // Mercredi : les jours à venir n'ajoutent rien, même s'ils ont des lignes.
  at("Europe/Brussels", "2026-09-23T10:00:00Z", () => {
    assert.equal(thisWeekSeconds(rows), 3 * 3600);
  });
  // Semaine du passage à l'heure d'hiver (dimanche 25 octobre) : sept dates, pas de doublon.
  at("Europe/Brussels", "2026-10-25T20:00:00Z", () => {
    assert.deepEqual(currentWeekDates(), ["2026-10-19", "2026-10-20", "2026-10-21", "2026-10-22", "2026-10-23", "2026-10-24", "2026-10-25"]);
  });
});

test("Dashboard et Stats : la même fonction pour « Cette semaine »", () => {
  const dashboard = read("../pages/dashboard.js");
  const stats = read("../pages/stats.js");
  assert.match(dashboard, /const weekSecs = thisWeekSeconds\(studyDays\);/);
  assert.match(stats, /const weekSecs = thisWeekSeconds\(days\);/);
  assert.doesNotMatch(dashboard, /weekStart\.setDate\(weekStart\.getDate\(\) - 6\)/, "plus de fenêtre glissante sous le libellé « Cette semaine »");
  assert.match(dashboard, /currentWeekDates\(\)\.map/);
  // Même lignes → même valeur, quel que soit l'appelant.
  at("America/New_York", "2026-09-25T02:00:00Z", () => {
    assert.equal(thisWeekSeconds(rows), thisWeekSeconds([...rows]));
    assert.equal(thisWeekSeconds(rows), 4 * 3600, "lundi 21 → jeudi 24 (il est 22 h le 24 à New York)");
  });
});

test("New York le soir (UTC déjà au lendemain) : examens et blocus prennent la date de l'appareil", () => {
  // Jeudi 24 septembre, 21:30 à New York = vendredi 25, 01:30 UTC.
  at("America/New_York", "2026-09-25T01:30:00Z", () => {
    const s = suggestFromExams([{ exam_date: "2026-09-24" }, { exam_date: "2026-10-10" }]);
    assert.equal(s.start_date, "2026-09-24", "la période proposée commence aujourd'hui, pas demain");
    assert.equal(s.examCount, 2, "l'examen de ce soir compte encore");
    assert.equal(s.end_date, "2026-10-10");
    const endsToday = { start_date: "2026-09-01", end_date: "2026-09-24", archived_at: null };
    const next = { start_date: "2026-09-25", end_date: "2026-10-10", archived_at: null };
    assert.equal(pickCurrent([next, endsToday]), endsToday, "le blocus qui finit aujourd'hui est encore en cours");
    assert.equal(computeProgress(endsToday, []).phase, "active");
  });
  // Bruxelles juste après minuit : on est bien le 25.
  at("Europe/Brussels", "2026-09-24T22:10:00Z", () => {
    assert.equal(suggestFromExams([]).start_date, "2026-09-25");
  });
});

test("les écrans de ces dates ne lisent plus la date UTC", () => {
  const card = read("../components/BlocusCard.js");
  const blocus = read("../lib/blocus.js");
  assert.doesNotMatch(card, /todayISO/);
  assert.doesNotMatch(blocus, /todayISO/);
  assert.match(card, /function ExamHorizon[\s\S]{0,400}const today = localISO\(new Date\(\)\);/);
});
