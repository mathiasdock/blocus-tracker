// Calculs d'insights pour la page Statistiques.
//
// Fonctions pures : reçoivent le tableau `sessions` (déjà chargé) et renvoient
// des faits structurés (indices, secondes, booléens). Le formatage (langue,
// libellés) reste dans le composant. Rien ici ne touche au réseau.
//
// RÈGLE DE LA PAGE : ne jamais annoncer plus que ce que la donnée porte. Une
// session stocke une heure de DÉBUT et une DURÉE — pas un niveau d'attention,
// pas une préférence déclarée. Tout ce qui est calculé ici doit donc pouvoir
// se dire en une phrase littéralement vraie (« l'heure où tu étudies le plus »
// et non « ton heure la plus productive »).

const DAY_MS = 864e5;
const TAU = Math.PI * 2;

// Jour LOCAL, pas UTC. `toISOString().slice(0,10)` rangeait une session de
// 23 h (heure belge) dans la veille : « meilleure journée » calculée ici ne
// tombait donc pas sur la même valeur que celle calculée dans la page, qui
// utilise localISO. StudyHeatmap porte déjà un commentaire sur ce même piège,
// corrigé de son côté seulement. Les deux parlent enfin la même langue.
function isoDay(dateLike) {
  const d = dateLike instanceof Date ? dateLike : new Date(dateLike);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// getDay() renvoie 0=Dim..6=Sam ; on veut 0=Lun..6=Dim (semaine ISO).
function isoWeekday(dateLike) {
  return (new Date(dateLike).getDay() + 6) % 7;
}

// Numéro de semaine ISO "YYYY-Www" pour regrouper les records hebdomadaires.
function isoWeekKey(dateLike) {
  const d = new Date(dateLike);
  d.setHours(0, 0, 0, 0);
  // Jeudi de la semaine courante décide l'année ISO.
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
  const week1 = new Date(d.getFullYear(), 0, 4);
  const week = 1 + Math.round(((d - week1) / DAY_MS - 3 + ((week1.getDay() + 6) % 7)) / 7);
  return `${d.getFullYear()}-W${String(week).padStart(2, "0")}`;
}

/**
 * Répartit la durée d'une session sur les heures d'horloge qu'elle TRAVERSE.
 *
 * Avant, toute la durée était versée à l'heure de DÉBUT : une session de 17 h
 * à 20 h comptait trois heures « d'après-midi » alors que deux d'entre elles
 * se sont passées le soir. La page disait ensuite « 62 % de ton temps d'étude
 * se passe l'après-midi » — un chiffre que les sessions ne soutenaient pas.
 * Ici une heure d'horloge reçoit exactement les secondes qui s'y sont
 * écoulées.
 *
 * (Le passage à l'heure d'été décale une heure deux fois par an ; on raisonne
 * en heures d'horloge locales, donc l'écart est celui du calendrier, pas une
 * erreur de calcul.)
 */
export function spreadOverHours(startedAt, seconds, out) {
  let left = Math.max(0, Number(seconds) || 0);
  if (!left) return out;
  const start = new Date(startedAt);
  if (Number.isNaN(start.getTime())) return out;

  // Une durée de plusieurs jours (donnée aberrante) remplirait la boucle de
  // milliers de tours : les journées entières sont versées d'un bloc, à
  // l'identique pour les 24 heures, et seul le reste est parcouru.
  const fullDays = Math.floor(left / 86400);
  if (fullDays > 0) {
    for (let h = 0; h < 24; h++) out[h] += fullDays * 3600;
    left -= fullDays * 86400;
  }

  let hour = start.getHours();
  let offset = start.getMinutes() * 60 + start.getSeconds();
  while (left > 0) {
    const take = Math.min(left, 3600 - offset);
    out[hour] += take;
    left -= take;
    offset = 0;
    hour = (hour + 1) % 24;
  }
  return out;
}

/**
 * Heure moyenne de début, calculée en CIRCULAIRE.
 *
 * Une moyenne arithmétique traite l'horloge comme une règle graduée : 23 h et
 * 1 h y donnaient (1380 + 60) / 2 = 720 minutes, soit midi — l'heure exacte où
 * cette personne n'étudie jamais. Chaque heure devient donc un point sur un
 * cercle de 24 h, et la moyenne est la direction de leur somme.
 *
 * @returns {number|null} minutes depuis minuit, ou null si les départs sont
 *   trop dispersés pour qu'une « heure moyenne » veuille dire quelque chose
 *   (quelqu'un qui étudie autant à 3 h qu'à 15 h n'a pas d'heure habituelle).
 */
export function circularMeanMinutes(minutesList) {
  const list = (minutesList || []).filter((m) => Number.isFinite(m));
  if (!list.length) return null;
  let sin = 0, cos = 0;
  for (const m of list) {
    const angle = (TAU * m) / 1440;
    sin += Math.sin(angle);
    cos += Math.cos(angle);
  }
  // Longueur du vecteur résultant, entre 0 (dispersion totale) et 1
  // (tous les départs à la même heure).
  const strength = Math.hypot(sin, cos) / list.length;
  if (strength < 0.05) return null;
  const minutes = ((Math.atan2(sin, cos) / TAU) * 1440 + 1440) % 1440;
  return Math.round(minutes) % 1440;
}

// Plus longue série de jours CONSÉCUTIFS où l'objectif quotidien est atteint.
function longestGoalStreak(dayTotals, goalSecs) {
  const days = Object.keys(dayTotals).filter(d => dayTotals[d] >= goalSecs).sort();
  let best = 0, run = 0, prev = null;
  for (const d of days) {
    if (prev && (new Date(d + "T00:00:00") - new Date(prev + "T00:00:00")) === DAY_MS) run += 1;
    else run = 1;
    best = Math.max(best, run);
    prev = d;
  }
  return best;
}

export function computeInsights(sessions, { todaySecs, streak, bestStreak, allTimeSecs, dailyGoalSecs }) {
  const now = Date.now();
  const empty = {
    hasData: false,
    sessionCount: 0,
    monthSecs: 0,
    topWeekday: null, topWeekdaySecs: 0, weekdaySecs: [0, 0, 0, 0, 0, 0, 0],
    timeOfDay: { morning: 0, afternoon: 0, evening: 0, night: 0 },
    timeOfDayPct: { morning: 0, afternoon: 0, evening: 0, night: 0 },
    dominantSlot: null,
    avgSessionSecs: 0, avgStartMinutes: null, topStudyHour: null,
    longestSessionSecs: 0, bestDaySecs: 0, bestWeekSecs: 0, bestMonthSecs: 0,
    activeDaysThisWeek: 0, activeDaysLastWeek: 0, moreRegular: false,
    goalStreakBest: 0,
    badges: {},
  };
  if (!sessions || sessions.length === 0) return empty;

  const dayTotals = {};
  const weekdaySecs = [0, 0, 0, 0, 0, 0, 0];
  const hourSecs = Array(24).fill(0);
  const weekTotals = {};
  const monthTotals = {};
  let longest = 0;
  let totalSecs = 0;
  const startMinutes = [];
  let afterMidnight = false, earlyBird = false;

  const monthAgo = isoDay(new Date(now - 30 * DAY_MS));
  let monthSecs = 0;

  for (const s of sessions) {
    const secs = s.duration_seconds || 0;
    const day = isoDay(s.started_at);
    const dt = new Date(s.started_at);
    const h = dt.getHours();

    dayTotals[day] = (dayTotals[day] || 0) + secs;
    weekdaySecs[isoWeekday(s.started_at)] += secs;
    weekTotals[isoWeekKey(s.started_at)] = (weekTotals[isoWeekKey(s.started_at)] || 0) + secs;
    monthTotals[day.slice(0, 7)] = (monthTotals[day.slice(0, 7)] || 0) + secs;
    if (day >= monthAgo) monthSecs += secs;
    if (secs > longest) longest = secs;
    totalSecs += secs;

    // Le temps va aux heures RÉELLEMENT traversées (voir spreadOverHours).
    spreadOverHours(s.started_at, secs, hourSecs);

    // Ces deux badges restent indexés sur l'heure de DÉBUT : ils récompensent
    // le fait d'avoir lancé une session à une heure inhabituelle, pas d'avoir
    // débordé dessus. Les changer maintenant réécrirait rétroactivement des
    // badges déjà vus — ce n'est pas l'objet de cette passe.
    if (h < 5) afterMidnight = true;
    if (h < 7) earlyBird = true;

    startMinutes.push(h * 60 + dt.getMinutes());
  }

  // Les créneaux dérivent des heures d'horloge : mêmes frontières qu'avant
  // (matin 5–12, après-midi 12–18, soir 18–24, nuit 0–5), mais alimentées par
  // le temps réellement passé dans chaque heure.
  const sumHours = (from, to) => hourSecs.slice(from, to).reduce((a, b) => a + b, 0);
  const slot = {
    morning: sumHours(5, 12),
    afternoon: sumHours(12, 18),
    evening: sumHours(18, 24),
    night: sumHours(0, 5),
  };

  const slotTotal = slot.morning + slot.afternoon + slot.evening + slot.night || 1;
  const timeOfDayPct = {
    morning: Math.round(slot.morning / slotTotal * 100),
    afternoon: Math.round(slot.afternoon / slotTotal * 100),
    evening: Math.round(slot.evening / slotTotal * 100),
    night: Math.round(slot.night / slotTotal * 100),
  };
  const dominantSlot = ["morning", "afternoon", "evening", "night"]
    .reduce((a, b) => slot[b] > slot[a] ? b : a, "morning");

  const topWeekday = weekdaySecs.some(v => v > 0)
    ? weekdaySecs.indexOf(Math.max(...weekdaySecs)) : null;
  // L'heure d'horloge qui cumule le plus de temps d'étude. Ce n'est PAS une
  // mesure de productivité : rien dans une session ne dit ce qui a été compris.
  const topStudyHour = hourSecs.some(v => v > 0)
    ? hourSecs.indexOf(Math.max(...hourSecs)) : null;
  const bestWeekSecs = Math.max(0, ...Object.values(weekTotals));
  const bestMonthSecs = Math.max(0, ...Object.values(monthTotals));
  const bestDaySecs = Math.max(0, ...Object.values(dayTotals));

  // Régularité : jours actifs distincts cette semaine vs la semaine passée.
  const thisWeekKey = isoWeekKey(now);
  const lastWeekKey = isoWeekKey(now - 7 * DAY_MS);
  let activeDaysThisWeek = 0, activeDaysLastWeek = 0;
  for (const day of Object.keys(dayTotals)) {
    if (dayTotals[day] <= 0) continue;
    if (isoWeekKey(day + "T12:00:00") === thisWeekKey) activeDaysThisWeek += 1;
    else if (isoWeekKey(day + "T12:00:00") === lastWeekKey) activeDaysLastWeek += 1;
  }

  const goalStreakBest = longestGoalStreak(dayTotals, dailyGoalSecs);

  const badges = {
    firstHour:     allTimeSecs >= 3600,
    streak7:       (bestStreak >= 7 || streak >= 7),
    hours50:       allTimeSecs >= 50 * 3600,
    hours100:      allTimeSecs >= 100 * 3600,
    session3h:     longest >= 3 * 3600,
    marathonDay:   bestDaySecs >= 6 * 3600,
    afterMidnight: afterMidnight,
    earlyBird:     earlyBird,
    goal10:        goalStreakBest >= 10,
  };

  return {
    hasData: true,
    sessionCount: sessions.length,
    monthSecs,
    topWeekday, topWeekdaySecs: topWeekday != null ? weekdaySecs[topWeekday] : 0,
    // Exposé pour que le choix d'insight puisse vérifier que le jour le plus
    // étudié se détache vraiment des autres avant de l'annoncer.
    weekdaySecs,
    timeOfDay: slot, timeOfDayPct, dominantSlot,
    // Moyenne sur les secondes puis arrondi — jamais l'inverse.
    avgSessionSecs: Math.round(totalSecs / sessions.length),
    avgStartMinutes: circularMeanMinutes(startMinutes),
    topStudyHour,
    longestSessionSecs: longest,
    bestDaySecs, bestWeekSecs, bestMonthSecs,
    activeDaysThisWeek, activeDaysLastWeek,
    moreRegular: activeDaysThisWeek > activeDaysLastWeek,
    goalStreakBest,
    badges,
  };
}
