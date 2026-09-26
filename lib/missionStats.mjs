// Mesures du jour pour le repli local des missions (hors ligne, invité,
// serveur muet) — mêmes règles que public.mission_day_metrics (v76) :
//   · durée du jour / minutes par cours → les jours canoniques (session_days
//     + sessions pas encore en base), portion de CE jour seulement ;
//   · une session précise (plus longue, nombre, ≥ 25 min, avant midi) → les
//     sessions COMMENCÉES ce jour-là ;
//   · la série → la série officielle, passée telle quelle.
// Le serveur fait foi dès qu'il répond.

export function missionDayStats({ rows = [], startedToday = [], today, streak = 0 }) {
  const minutesOnCourse = {};
  let todaySecs = 0;
  for (const row of rows) {
    if (row.local_date !== today) continue;
    const secs = Number(row.seconds) || 0;
    todaySecs += secs;
    if (row.course_id) minutesOnCourse[row.course_id] = (minutesOnCourse[row.course_id] || 0) + secs / 60;
  }
  const durations = startedToday.map((s) => Number(s.duration_seconds) || 0);
  return {
    todaySecs,
    todayMaxSessionSecs: durations.length ? Math.max(...durations) : 0,
    todaySessionCount: durations.length,
    todayFocusedCount: durations.filter((v) => v >= 1500).length,
    // Minutes par cours, pas simple présence : deux minutes sur un second
    // cours validaient « étudie 2 cours différents ».
    todayCoursesCount: Object.values(minutesOnCourse).filter((m) => m >= 15).length,
    minutesOnCourse,
    streak,
    studiedBeforeNoon: startedToday.some((s) => new Date(s.started_at).getHours() < 12),
  };
}
