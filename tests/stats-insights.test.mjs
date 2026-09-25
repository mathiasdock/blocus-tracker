import test from 'node:test';
import assert from 'node:assert/strict';
import { computeInsights, circularMeanMinutes, spreadOverHours, regularityTrend } from '../lib/statsInsights.mjs';
import { buildTimeSeries } from '../lib/statsPeriod.js';
import { formatStudyTime, formatMinutesShort } from '../lib/format.js';

const ctx = undefined;
const at = (iso, secs) => ({ started_at: iso, duration_seconds: secs });

test("l'heure moyenne se calcule sur un cercle, pas sur une regle graduee", () => {
  // Le cas qui donnait midi : 23 h et 1 h encadrent minuit, leur moyenne est
  // minuit — surement pas l'heure a laquelle cette personne n'etudie jamais.
  assert.equal(circularMeanMinutes([23 * 60, 1 * 60]), 0);
  assert.equal(circularMeanMinutes([22 * 60, 2 * 60]), 0);
  // Une journee ordinaire reste evidemment juste.
  assert.equal(circularMeanMinutes([8 * 60, 10 * 60]), 9 * 60);
  assert.equal(circularMeanMinutes([9 * 60 + 30]), 9 * 60 + 30);
});

test("des departs trop disperses ne produisent AUCUNE heure moyenne", () => {
  // Quatre departs aux quatre coins du cadran : il n'y a pas d'heure
  // habituelle, et en inventer une serait pire que de se taire.
  assert.equal(circularMeanMinutes([0, 6 * 60, 12 * 60, 18 * 60]), null);
  assert.equal(circularMeanMinutes([]), null);
});

test("une session est repartie sur les heures qu'elle traverse", () => {
  const hours = Array(24).fill(0);
  spreadOverHours('2026-03-02T17:00:00', 3 * 3600, hours);
  assert.equal(hours[17], 3600);
  assert.equal(hours[18], 3600);
  assert.equal(hours[19], 3600);
  assert.equal(hours[16], 0);
  // Passe minuit : la fin de la session appartient au lendemain, pas a 23 h.
  const night = Array(24).fill(0);
  spreadOverHours('2026-03-02T23:00:00', 2 * 3600, night);
  assert.equal(night[23], 3600);
  assert.equal(night[0], 3600);
  // Le total reparti egale toujours la duree mesuree.
  const partial = Array(24).fill(0);
  spreadOverHours('2026-03-02T10:40:00', 50 * 60, partial);
  assert.equal(partial.reduce((a, b) => a + b, 0), 50 * 60);
  assert.equal(partial[10], 20 * 60);
  assert.equal(partial[11], 30 * 60);
});

test("le soir cesse d'etre compte comme de l'apres-midi", () => {
  // 17 h -> 20 h : une heure d'apres-midi et deux de soiree. Avant, la
  // totalite allait au creneau de DEPART et la page annoncait « 100 % de ton
  // temps se passe l'apres-midi ».
  const out = computeInsights([at('2026-03-02T17:00:00', 3 * 3600)], ctx);
  assert.equal(out.timeOfDay.afternoon, 3600);
  assert.equal(out.timeOfDay.evening, 2 * 3600);
  assert.equal(out.timeOfDayPct.afternoon, 33);
  assert.equal(out.timeOfDayPct.evening, 67);
  assert.equal(out.dominantSlot, 'evening');
});

test("l'heure la plus etudiee est celle ou le temps s'est reellement ecoule", () => {
  const out = computeInsights([
    at('2026-03-02T14:00:00', 3600),          // 14 h
    at('2026-03-03T13:30:00', 2 * 3600),      // 13h30 -> 15h30
  ], ctx);
  // 14 h cumule 1 h + 30 min = 90 min ; 13 h et 15 h n'en ont que 30.
  assert.equal(out.topStudyHour, 14);
});

test("les statistiques ne fabriquent plus de badges a part", () => {
  // Un badge n'a qu'une regle d'obtention : lib/badges.js, attribue par le
  // serveur. La page lisait neuf conditions locales dessinees comme de vrais
  // badges ; plus rien de tel ne doit reapparaitre ici.
  const out = computeInsights([at('2026-03-02T23:00:00', 3 * 3600)], ctx);
  assert.equal('badges' in out, false);
  assert.equal(out.timeOfDay.night > 0, true, 'le temps apres minuit compte toujours comme de la nuit');
});

test("l'evolution de la regularite ne parle que d'un ecart net", () => {
  const base = { hasData: true, sessionCount: 12 };
  assert.deepEqual(regularityTrend({ ...base, activeDaysThisWeek: 5, activeDaysLastWeek: 2 }), { now: 5, prev: 2 });
  assert.equal(regularityTrend({ ...base, activeDaysThisWeek: 3, activeDaysLastWeek: 2 }), null, 'un jour d ecart est du bruit');
  assert.equal(regularityTrend({ ...base, activeDaysThisWeek: 4, activeDaysLastWeek: 1 }), null, 'une semaine passee quasi vide ne sert pas de reference');
  assert.equal(regularityTrend({ ...base, sessionCount: 3, activeDaysThisWeek: 5, activeDaysLastWeek: 2 }), null);
  assert.equal(regularityTrend(null), null);
});

test("une barre qui compte moins de jours que ses voisines le dit", () => {
  // Historique commence un mercredi : la premiere semaine n'a que 5 jours.
  const range = { fromISO: '2026-06-03', toISO: '2026-07-14', days: 42 };
  const series = buildTimeSeries([{ session_id: 's', local_date: '2026-06-03', seconds: 3600 }], range, 'fr');
  assert.equal(series[0].gran, 'week');
  assert.equal(series[0].partial, true);
  assert.equal(series[0].days, 5);
  assert.equal(series[0].fullDays, 7);
  assert.equal(series[1].partial, false, 'une semaine entiere n est pas partielle');
  const last = series[series.length - 1];
  assert.equal(last.days, 2, 'le lundi 13 et le mardi 14 juillet');
  assert.equal(last.partial, true);
  // Une serie par jour n'a jamais de seau partiel.
  const daily = buildTimeSeries([], { fromISO: '2026-07-08', toISO: '2026-07-14', days: 7 }, 'fr');
  assert.equal(daily.some((b) => b.partial), false);
});

test("un mois incomplet compte ses vrais jours, fevrier compris", () => {
  const range = { fromISO: '2026-01-01', toISO: '2026-07-10', days: 191 };
  const series = buildTimeSeries([], range, 'fr');
  assert.equal(series[0].gran, 'month');
  const feb = series.find((b) => b.iso === '2026-02');
  assert.equal(feb.fullDays, 28);
  assert.equal(feb.partial, false);
  const jul = series.find((b) => b.iso === '2026-07');
  assert.equal(jul.days, 10);
  assert.equal(jul.fullDays, 31);
  assert.equal(jul.partial, true);
});

test("la duree moyenne d'une session sort des secondes, pas de minutes arrondies", () => {
  const out = computeInsights([at('2026-03-02T09:00:00', 100), at('2026-03-02T11:00:00', 101)], ctx);
  assert.equal(out.avgSessionSecs, 101); // (100 + 101) / 2 = 100,5 -> 101
  assert.equal(out.sessionCount, 2);
});

test("une duree positive ne s'affiche jamais « 0 min »", () => {
  // Vingt secondes comptent comme une journee active et une case de heatmap :
  // les ecrire « 0 min » effacait une activite reelle.
  assert.equal(formatMinutesShort(20), '0 min', 'le format historique est inchange ailleurs');
  assert.equal(formatStudyTime(20), '< 1 min');
  assert.equal(formatStudyTime(0), '0 min');
  assert.equal(formatStudyTime(50), '1 min');
  assert.equal(formatStudyTime(3600), '1h');
  assert.equal(formatStudyTime(5400), '1h30');
});
