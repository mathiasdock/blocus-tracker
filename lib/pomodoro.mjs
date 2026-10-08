// Cycle Pomodoro du Chrono : durées proposées et lecture sûre de l'état
// enregistré avec le chrono (contexts/TimerContext.js).
//
// Jusqu'au 2026-10-07, le mode, la phase et les durées vivaient seulement dans
// la page du Dashboard : un rechargement ou un changement de page rendait un
// Pomodoro en cours au mode Libre, et une pause Pomodoro pouvait alors être
// enregistrée comme du temps étudié. Ils voyagent désormais avec le chrono, dans
// le même stockage local (un par propriétaire : invité ou compte).

export const POMO_WORK_OPTIONS = [15, 20, 25, 30, 45, 50, 60];
export const POMO_BREAK_OPTIONS = [3, 5, 10, 15];

export const POMODORO_DEFAULTS = Object.freeze({
  pomodoro: false,
  pomoPhase: "work", // "work" | "break"
  pomoCount: 0,
  pomoWorkMin: 25,
  pomoBreakMin: 5,
});

/**
 * État Pomodoro lu dans un instantané du chrono. Un instantané d'avant ces
 * champs, ou une valeur inattendue, donne l'état par défaut (mode Libre,
 * 25/5) : exactement ce qu'un rechargement donnait jusqu'ici.
 */
export function normalizePomodoroState(raw) {
  const s = raw && typeof raw === "object" ? raw : {};
  const pomodoro = s.pomodoro === true;
  const workMin = Number(s.pomoWorkMin);
  const breakMin = Number(s.pomoBreakMin);
  const count = Number(s.pomoCount);
  return {
    pomodoro,
    pomoPhase: pomodoro && s.pomoPhase === "break" ? "break" : "work",
    pomoCount: pomodoro && Number.isInteger(count) && count > 0 ? count : 0,
    pomoWorkMin: POMO_WORK_OPTIONS.includes(workMin) ? workMin : POMODORO_DEFAULTS.pomoWorkMin,
    pomoBreakMin: POMO_BREAK_OPTIONS.includes(breakMin) ? breakMin : POMODORO_DEFAULTS.pomoBreakMin,
  };
}

/**
 * Un Pomodoro est-il en cours ? Oui tant que sa session existe : bloc de
 * travail ou pause, qui compte ou mis en pause. C'est ce qui doit survivre à
 * un rechargement ou à un changement de page. Sans session (rien ne compte, le
 * chrono est à zéro), une page qui ouvre le Chrono le montre dans son mode par
 * défaut, cycle remis à zéro : le Dashboard s'ouvre en Libre, comme avant — un
 * Pomodoro terminé ne laisse pas un vieux mode derrière lui.
 */
export function pomodoroCycleInProgress({ pomodoro, running, elapsed }) {
  return Boolean(pomodoro) && (Boolean(running) || elapsed > 0);
}
