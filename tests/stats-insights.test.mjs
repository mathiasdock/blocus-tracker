import test from 'node:test';
import assert from 'node:assert/strict';
import { computeInsights, circularMeanMinutes, spreadOverHours } from '../lib/statsInsights.mjs';
import { formatStudyTime, formatMinutesShort } from '../lib/format.js';

const ctx = { todaySecs: 0, streak: 0, bestStreak: 0, allTimeSecs: 0, dailyGoalSecs: 7200 };
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

test("les badges de nuit et de lever restent indexes sur l'heure de DEBUT", () => {
  // Une session lancee a 23 h qui deborde sur minuit n'a pas ete « lancee
  // apres minuit » : changer ce critere attribuerait un badge retroactivement.
  const late = computeInsights([at('2026-03-02T23:00:00', 3 * 3600)], ctx);
  assert.equal(late.badges.afterMidnight, false);
  assert.equal(late.badges.earlyBird, false);
  assert.equal(late.timeOfDay.night > 0, true, 'le temps apres minuit compte quand meme comme de la nuit');
  const early = computeInsights([at('2026-03-02T02:00:00', 3600)], ctx);
  assert.equal(early.badges.afterMidnight, true);
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
