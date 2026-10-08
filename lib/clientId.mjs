// UUID v4 — utilise crypto.randomUUID (dispo partout en HTTPS moderne) avec
// fallback Math.random pour les contextes anciens.
//
// Seul : le chrono (contexts/TimerContext.js, chargé sur toutes les pages)
// identifie sa session sans embarquer la file hors ligne (lib/timerDraft.js),
// qui réexporte cette fonction.
export function newClientId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
