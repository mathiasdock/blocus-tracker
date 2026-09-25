// Modèle canonique des jours d'étude — miroir JavaScript des migrations v71/v72
// (public.study_day_rules, study_day_states, study_streaks).
//
// Phase 5A1 : RIEN dans l'app ne l'utilise encore. Il existe pour que le futur
// affichage (Dashboard, Stats, profil…) applique exactement la même règle que
// le serveur ; tests/study-day-states.test.mjs vérifie la parité sur les mêmes
// cas que supabase/tests/study_day_states.sql.
//
// Une date de bascule (2026-10-05) versionne deux règles :
//                      avant                      à partir de la bascule
//   jour étudié        >= 1 s                     >= 300 s
//   jour avec joker    préserve la série, +1      préserve la série, +0
// Trois notions explicites par date :
//   · is_studied        : secondes de cette local_date (session_days) >= seuil ;
//   · preserves_streak  : étudiée, joker ou hors blocus — ne casse pas la série ;
//   · increments_streak : ajoute 1 à la longueur (étudiée, ou joker AVANT la
//                         bascule ; un jour hors blocus n'ajoute jamais rien).
// États : 'studied' | 'neutral' | 'missed' | 'pending' (aujourd'hui ou plus
// tard, pas encore étudié : ne casse rien).

/** Valeurs de public.study_day_rules (v72). */
export const STUDY_DAY_RULES = Object.freeze({
  legacyMinSeconds: 1,
  minSeconds: 300,
  // Date locale de bascule « YYYY-MM-DD » des deux règles (seuil et joker).
  newRulesFrom: "2026-10-05",
});

const isNewRules = (date, rules) => Boolean(rules.newRulesFrom) && date >= rules.newRulesFrom;

export function studyDayMinSeconds(date, rules = STUDY_DAY_RULES) {
  return isNewRules(date, rules) ? rules.minSeconds : rules.legacyMinSeconds;
}

/** Un joker posé ce jour-là ajoute-t-il encore 1 à la longueur (ancienne règle) ? */
export function freezeIncrementsStreak(date, rules = STUDY_DAY_RULES) {
  return !isNewRules(date, rules);
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
      preserves_streak: isStudied || hasFreeze || outsideBlocus,
      increments_streak: isStudied || (hasFreeze && freezeIncrementsStreak(d, rules)),
      state,
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
  // Longueur = jours qui l'incrémentent ; seul un jour 'missed' coupe la suite.
  let best = 0;
  let run = 0;
  let studiedDays = 0;
  for (const day of states) {
    if (day.state === "missed") { run = 0; continue; }
    if (day.increments_streak) { run += 1; best = Math.max(best, run); }
    if (day.is_studied) studiedDays += 1;
  }
  return { current: Math.min(366, run), best, studiedDays };
}
