// Présence "live" — source unique de vérité pour "cet utilisateur est en
// train d'étudier (dans un chrono)".
//
// Le heartbeat du timer (contexts/TimerContext.js) réécrit `studying_since`
// toutes les 5 min tant que le chrono tourne. Une session abandonnée (app ou
// onglet fermé EN PLEIN chrono) démonte le provider : `studying_since` n'est
// jamais remis à null et se fige. Tester la simple présence de la valeur
// compte donc ces sessions fantômes indéfiniment — c'est l'origine du faux
// compteur "en ligne" de l'admin.
//
// La vérité, c'est la FRAÎCHEUR : une session n'est vivante que si son
// `studying_since` a été rafraîchi récemment. Fenêtre = 10 min → tolère un
// heartbeat manqué (5 min) + marge, tout en purgeant les sessions mortes.

export const STUDY_LIVE_WINDOW_MS = 10 * 60 * 1000;

export function isStudyingLive(studyingSince) {
  if (!studyingSince) return false;
  const t = new Date(studyingSince).getTime();
  if (Number.isNaN(t)) return false;
  return Date.now() - t < STUDY_LIVE_WINDOW_MS;
}
