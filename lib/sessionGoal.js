// Objectif de session du chrono — durée visée pour la session en cours.
//
// La clé vivait en dur dans pages/dashboard.js. Le planning doit pouvoir la
// pré-remplir ("Commencer à réviser" sur un objectif de 45 min ouvre le chrono
// avec 45 min déjà visées), donc la clé et sa lecture/écriture sont ici :
// deux pages qui écrivent la même clé chacune de leur côté finissent par
// diverger. Le chrono lui-même est inchangé — il lit la même valeur qu'avant.

export const SESSION_GOAL_KEY = "bt_session_goal_v1";

/** Durée visée en minutes, ou null si aucune. Tolère un storage indisponible. */
export function readSessionGoal() {
  try {
    const raw = localStorage.getItem(SESSION_GOAL_KEY);
    if (!raw) return null;
    const min = parseInt(raw, 10);
    return Number.isFinite(min) && min > 0 ? min : null;
  } catch {
    return null;
  }
}

/** Écrit la durée visée (minutes). `null`/0 efface l'objectif. */
export function writeSessionGoal(minutes) {
  try {
    const min = Number(minutes);
    if (Number.isFinite(min) && min > 0) localStorage.setItem(SESSION_GOAL_KEY, String(min));
    else localStorage.removeItem(SESSION_GOAL_KEY);
  } catch {}
}
