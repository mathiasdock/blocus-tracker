// Choisit UN insight, ou aucun.
//
// L'ancien résumé empilait quatre phrases reprises des chiffres déjà affichés
// au-dessus, et servait des formules absurdes quand la donnée manquait
// (« Déjà 0 min aujourd'hui — beau rythme »). Ici, chaque insight a un seuil :
// s'il n'est pas franchi, on ne dit rien. Mieux vaut le silence qu'une
// observation que les données ne soutiennent pas.
//
// Renvoie { key, vars } — la traduction et le formatage restent à la vue.

const MIN_SESSIONS = 5;

/**
 * @param {object} insights  sortie de computeInsights()
 * @param {object} ctx       { courseRows, activeDaysThisWeek, activeDaysLastWeek }
 * @returns {{key: string, vars: object} | null}
 */
export function pickInsight(insights, { courseRows = [] } = {}) {
  if (!insights?.hasData || insights.sessionCount < MIN_SESSIONS) return null;

  // 1. Régularité — le signal le plus actionnable, donc prioritaire. Exige une
  //    semaine passée réellement active, sinon « plus régulier que la semaine
  //    dernière » compare à rien.
  const last = insights.activeDaysLastWeek;
  const now = insights.activeDaysThisWeek;
  if (last >= 2 && now - last >= 2) {
    return { key: "moreRegular", vars: { n: now, prev: last } };
  }

  // 2. Moment de la journée — seulement si un créneau domine vraiment.
  const slot = insights.dominantSlot;
  const pct = slot ? insights.timeOfDayPct[slot] : 0;
  if (slot && pct >= 45) {
    return { key: `slot_${slot}`, vars: { pct } };
  }

  // 3. Cours dominant — seulement s'il y a au moins deux cours à départager.
  const withTime = courseRows.filter((c) => c.secs > 0 && c.id !== "__none__");
  if (withTime.length >= 2 && withTime[0].pct >= 50) {
    return { key: "topCourse", vars: { course: withTime[0].name, pct: withTime[0].pct } };
  }

  // 4. Meilleur jour de semaine — en dernier, c'est le moins actionnable.
  //    Exige qu'il se détache nettement de la moyenne des autres jours.
  if (insights.bestWeekday != null && insights.weekdaySecs) {
    const secs = insights.weekdaySecs;
    const total = secs.reduce((a, b) => a + b, 0);
    const best = secs[insights.bestWeekday];
    const othersAvg = (total - best) / 6;
    if (othersAvg > 0 && best >= othersAvg * 1.6) {
      return { key: "bestWeekday", vars: { weekday: insights.bestWeekday } };
    }
  }

  return null;
}
