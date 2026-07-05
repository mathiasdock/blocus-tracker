// Calculs d'insights pour la page Statistiques.
//
// Fonctions pures : reçoivent le tableau `sessions` (déjà chargé, ~370 j) et
// renvoient des faits structurés (indices, secondes, booléens). Le formatage
// (langue, libellés) reste dans le composant. Rien ici ne touche au réseau.

const DAY_MS = 864e5;

function isoDay(dateLike) {
  return new Date(dateLike).toISOString().slice(0, 10);
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
    bestWeekday: null, bestWeekdaySecs: 0,
    timeOfDay: { morning: 0, afternoon: 0, evening: 0, night: 0 },
    timeOfDayPct: { morning: 0, afternoon: 0, evening: 0, night: 0 },
    dominantSlot: null,
    avgSessionSecs: 0, avgStartMinutes: null, mostProductiveHour: null,
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
  const slot = { morning: 0, afternoon: 0, evening: 0, night: 0 };
  let longest = 0;
  let startMinutesSum = 0, startCount = 0;
  let afterMidnight = false, earlyBird = false;

  const monthAgo = new Date(now - 30 * DAY_MS).toISOString().slice(0, 10);
  let monthSecs = 0;

  for (const s of sessions) {
    const secs = s.duration_seconds || 0;
    const day = isoDay(s.started_at);
    const dt = new Date(s.started_at);
    const h = dt.getHours();

    dayTotals[day] = (dayTotals[day] || 0) + secs;
    weekdaySecs[isoWeekday(s.started_at)] += secs;
    hourSecs[h] += secs;
    weekTotals[isoWeekKey(s.started_at)] = (weekTotals[isoWeekKey(s.started_at)] || 0) + secs;
    monthTotals[day.slice(0, 7)] = (monthTotals[day.slice(0, 7)] || 0) + secs;
    if (day >= monthAgo) monthSecs += secs;
    if (secs > longest) longest = secs;

    if (h >= 5 && h < 12) slot.morning += secs;
    else if (h >= 12 && h < 18) slot.afternoon += secs;
    else if (h >= 18 && h < 24) slot.evening += secs;
    else { slot.night += secs; afterMidnight = true; }
    if (h < 7) earlyBird = true;

    startMinutesSum += h * 60 + dt.getMinutes();
    startCount += 1;
  }

  const slotTotal = slot.morning + slot.afternoon + slot.evening + slot.night || 1;
  const timeOfDayPct = {
    morning: Math.round(slot.morning / slotTotal * 100),
    afternoon: Math.round(slot.afternoon / slotTotal * 100),
    evening: Math.round(slot.evening / slotTotal * 100),
    night: Math.round(slot.night / slotTotal * 100),
  };
  const dominantSlot = ["morning", "afternoon", "evening", "night"]
    .reduce((a, b) => slot[b] > slot[a] ? b : a, "morning");

  const bestWeekday = weekdaySecs.some(v => v > 0)
    ? weekdaySecs.indexOf(Math.max(...weekdaySecs)) : null;
  const mostProductiveHour = hourSecs.some(v => v > 0)
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
    bestWeekday, bestWeekdaySecs: bestWeekday != null ? weekdaySecs[bestWeekday] : 0,
    timeOfDay: slot, timeOfDayPct, dominantSlot,
    avgSessionSecs: startCount ? Math.round(sessions.reduce((a, s) => a + (s.duration_seconds || 0), 0) / startCount) : 0,
    avgStartMinutes: startCount ? Math.round(startMinutesSum / startCount) : null,
    mostProductiveHour,
    longestSessionSecs: longest,
    bestDaySecs, bestWeekSecs, bestMonthSecs,
    activeDaysThisWeek, activeDaysLastWeek,
    moreRegular: activeDaysThisWeek > activeDaysLastWeek,
    goalStreakBest,
    badges,
  };
}
