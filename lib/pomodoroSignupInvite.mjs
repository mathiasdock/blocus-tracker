// Invitation douce à créer un compte, après une vraie session invitée sur
// /pomodoro (P1-B phase 3). Ce module décide seulement du « quand » ; le texte
// est dans lib/i18n.js (publicChrono.invite*), l'affichage dans
// components/timer/PublicChrono.js.
//
// - Une vraie session : au moins 10 min d'étude, terminée (bloc Pomodoro
//   complet ou « Terminer ») et relue dans l'espace invité local.
// - Jamais pendant que le chrono compte, en pause, pendant le repos Pomodoro ni
//   en Focus : seulement au repos, Démarrer reste le premier geste possible.
// - Une fois vue à l'écran ou fermée, plus rien sur cet appareil pendant
//   30 jours : ni après le bloc suivant, ni au rechargement. Un repère local
//   seulement — les « invitations déjà vues » de la politique cookies
//   (strictement nécessaire, « quelques semaines ») — jamais envoyé nulle part.

export const SIGNUP_INVITE_KEY = "bt_pomodoro_invite_v1";
export const SIGNUP_INVITE_MIN_SECONDS = 10 * 60;
const QUIET_MS = 30 * 24 * 60 * 60 * 1000;

export function qualifiesForSignupInvite(seconds) {
  return Number.isFinite(seconds) && seconds >= SIGNUP_INVITE_MIN_SECONDS;
}

/** Chrono au repos, prêt pour la session suivante, hors du plein écran Focus. */
export function signupInviteAtRest({ running, elapsed, onBreak, focusOpen }) {
  return !running && elapsed === 0 && !onBreak && !focusOpen;
}

/**
 * Vrai si l'invitation a été vue ou fermée il y a moins de 30 jours. Un
 * repère expiré ou illisible est effacé : il ne dure pas plus que ce que la
 * politique cookies annonce.
 */
export function signupInviteQuiet(storage, now = Date.now()) {
  let raw = null;
  try { raw = storage?.getItem(SIGNUP_INVITE_KEY); } catch { return false; }
  if (!raw) return false;
  let at = Number.NaN;
  try { at = Date.parse(JSON.parse(raw)?.at); } catch {}
  if (Number.isFinite(at) && Math.abs(now - at) < QUIET_MS) return true;
  try { storage.removeItem(SIGNUP_INVITE_KEY); } catch {}
  return false;
}

/** `reason` : "seen" | "dismissed" | "signup" — ce qui a clos l'invitation. */
export function rememberSignupInvite(storage, reason, now = Date.now()) {
  try {
    storage?.setItem(SIGNUP_INVITE_KEY, JSON.stringify({ at: new Date(now).toISOString(), reason }));
  } catch {}
}
