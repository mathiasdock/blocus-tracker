// Invitation douce à créer un compte, après une vraie session invitée sur
// /pomodoro (P1-B phase 3). Ce module décide seulement du « quand » ; le texte
// est dans lib/i18n.js (publicChrono.invite*), l'affichage dans
// components/timer/PublicChrono.js.
//
// - Une vraie session : au moins 10 min d'étude, terminée (bloc Pomodoro
//   complet ou « Terminer ») et relue dans l'espace invité local.
// - Jamais pendant que le chrono compte, en pause, pendant le repos Pomodoro ni
//   en Focus : seulement au repos, Démarrer reste le premier geste possible.
// - Rappel : vue à l'écran sans réponse (ou « Créer un compte gratuit » suivi
//   sans compte), plus rien sur cet appareil pendant 7 jours ; après
//   « Continuer sans compte », 30 jours. Ni après le bloc suivant, ni au
//   rechargement. Un repère local seulement — les « invitations déjà vues » de
//   la politique cookies (strictement nécessaire, « quelques semaines ») —
//   jamais envoyé nulle part.

export const SIGNUP_INVITE_KEY = "bt_pomodoro_invite_v1";
export const SIGNUP_INVITE_MIN_SECONDS = 10 * 60;
const DAY_MS = 24 * 60 * 60 * 1000;
export const SIGNUP_INVITE_QUIET_DAYS = Object.freeze({ seen: 7, signup: 7, dismissed: 30 });

export function qualifiesForSignupInvite(seconds) {
  return Number.isFinite(seconds) && seconds >= SIGNUP_INVITE_MIN_SECONDS;
}

/** Chrono au repos, prêt pour la session suivante, hors du plein écran Focus. */
export function signupInviteAtRest({ running, elapsed, onBreak, focusOpen }) {
  return !running && elapsed === 0 && !onBreak && !focusOpen;
}

/**
 * Vrai pendant le silence qui suit la dernière invitation : 7 jours si elle a
 * été vue (ou suivie vers l'inscription), 30 jours si elle a été fermée. Un
 * repère expiré ou illisible est effacé : il ne dure pas plus que ce que la
 * politique cookies annonce.
 */
export function signupInviteQuiet(storage, now = Date.now()) {
  let raw = null;
  try { raw = storage?.getItem(SIGNUP_INVITE_KEY); } catch { return false; }
  if (!raw) return false;
  let at = Number.NaN;
  let days = 0;
  try {
    const record = JSON.parse(raw);
    at = Date.parse(record?.at);
    if (Object.hasOwn(SIGNUP_INVITE_QUIET_DAYS, record?.reason)) days = SIGNUP_INVITE_QUIET_DAYS[record.reason];
  } catch {}
  if (Number.isFinite(at) && Math.abs(now - at) < days * DAY_MS) return true;
  try { storage.removeItem(SIGNUP_INVITE_KEY); } catch {}
  return false;
}

/** `reason` : "seen" | "dismissed" | "signup" — ce qui a clos l'invitation. */
export function rememberSignupInvite(storage, reason, now = Date.now()) {
  try {
    storage?.setItem(SIGNUP_INVITE_KEY, JSON.stringify({ at: new Date(now).toISOString(), reason }));
  } catch {}
}
