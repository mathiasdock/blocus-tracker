// Modèle canonique des jours d'étude — miroir JavaScript de la migration v71
// (public.study_day_rules, study_day_states, study_streaks).
//
// Phase 5A1 : RIEN dans l'app ne l'utilise encore. Il existe pour que le futur
// affichage (Dashboard, Stats, profil…) applique exactement la même règle que
// le serveur ; tests/study-day-states.test.mjs vérifie la parité sur les mêmes
// cas que supabase/tests/study_day_states.sql.
//
// Deux notions séparées :
//   · jour ÉTUDIÉ : secondes de cette local_date (session_days) >= seuil de
//     CETTE date (1 s avant la bascule, 300 s à partir d'elle) ;
//   · jour qui PRÉSERVE la série : étudié, ou neutre (joker, hors blocus).
// États : 'studied' | 'neutral' | 'missed' | 'pending' (aujourd'hui ou plus
// tard, pas encore étudié : ne casse rien).

/** Valeurs par défaut de public.study_day_rules (v71). */
export const STUDY_DAY_RULES = Object.freeze({
  legacyMinSeconds: 1,
  minSeconds: 300,
  // Date locale de bascule « YYYY-MM-DD », ou null tant qu'elle n'est pas programmée.
  minSecondsFrom: null,
});

export function studyDayMinSeconds(date, rules = STUDY_DAY_RULES) {
  return rules.minSecondsFrom && date >= rules.minSecondsFrom ? rules.minSeconds : rules.legacyMinSeconds;
}

function nextDate(date) {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/**
 * États de chaque date de [from, to].
 * @param rows          lignes session_days { local_date, seconds }
 * @param freezes       dates « YYYY-MM-DD » couvertes par un joker
 * @param blocusRanges  [[start, end], …] ; vide = pas de notion de hors blocus
 * @param today         date locale d'aujourd'hui
 */
export function studyDayStates({ rows = [], freezes = [], blocusRanges = [], from, to, today, rules = STUDY_DAY_RULES }) {
  const secs = new Map();
  for (const row of rows) secs.set(row.local_date, (secs.get(row.local_date) || 0) + (Number(row.seconds) || 0));
  const frozen = new Set(freezes);
  const hasBlocus = blocusRanges.length > 0;
  const out = [];
  if (!from || !to || from > to) return out;
  for (let d = from; d <= to; d = nextDate(d)) {
    const studiedSeconds = secs.get(d) || 0;
    const minSeconds = studyDayMinSeconds(d, rules);
    const isStudied = studiedSeconds >= minSeconds;
    const hasFreeze = frozen.has(d);
    const outsideBlocus = hasBlocus && !blocusRanges.some(([start, end]) => d >= start && d <= end);
    const state = isStudied ? "studied"
      : hasFreeze || outsideBlocus ? "neutral"
      : d >= today ? "pending"
      : "missed";
    out.push({
      local_date: d, studied_seconds: studiedSeconds, min_seconds: minSeconds,
      is_studied: isStudied, has_freeze: hasFreeze, outside_blocus: outsideBlocus,
      preserves_streak: isStudied || hasFreeze || outsideBlocus, state,
    });
  }
  return out;
}

/** Série actuelle, meilleure série, jours étudiés — même règle que public.study_streaks. */
export function studyStreaks({ rows = [], freezes = [], blocusRanges = [], today, rules = STUDY_DAY_RULES }) {
  const dates = [...rows.map((r) => r.local_date), ...freezes].sort();
  if (!dates.length) return { current: 0, best: 0, studiedDays: 0 };
  const first = dates[0];
  const states = studyDayStates({ rows, freezes, blocusRanges, from: first, to: first > today ? first : today, today, rules });
  let lastMissed = null;
  let best = 0;
  let run = 0;
  let studiedDays = 0;
  for (const day of states) {
    if (day.state === "studied") { run += 1; studiedDays += 1; best = Math.max(best, run); }
    else if (day.state === "missed") { run = 0; lastMissed = day.local_date; }
  }
  const current = states.filter((d) => d.state === "studied" && (!lastMissed || d.local_date > lastMissed)).length;
  return { current: Math.min(366, current), best, studiedDays };
}
