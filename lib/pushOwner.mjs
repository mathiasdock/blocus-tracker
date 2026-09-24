// Qui a activé les notifications SUR CET APPAREIL — logique pure (navigateur).
//
// Avant : un simple drapeau « bt_push_enabled = 1 ». Après une déconnexion,
// la personne suivante qui se connectait sur le même appareil était rattachée
// automatiquement à l'abonnement de la précédente — sans l'avoir activé.
// Désormais l'appareil retient le COMPTE qui a activé (bt_push_owner) :
//   • ce compte se reconnecte → rattachement automatique, comme avant ;
//   • un autre compte se connecte → rien ; il active lui-même s'il le veut.
// L'ancien drapeau est repris une fois, au nom du compte connecté.
//
// Module .mjs sans dépendance : testé tel quel par Node (tests/).

export const PUSH_OWNER_KEY = "bt_push_owner";
export const LEGACY_PUSH_FLAG = "bt_push_enabled";
export const DEVICE_KEY = "bt_push_device";
export const PRESENCE_PREFIX = "bt_push_seen:";
export const PENDING_LOGOUT_KEY = "bt_push_pending_logout";
export const PRESENCE_INTERVAL_MS = 12 * 3600e3;

function safeGet(storage, key) {
  try { return storage?.getItem(key) ?? null; } catch (_) { return null; }
}
function safeSet(storage, key, value) {
  try { storage?.setItem(key, value); return true; } catch (_) { return false; }
}
function safeRemove(storage, key) {
  try { storage?.removeItem(key); } catch (_) {}
}

/** { owner, mine, legacy } pour le compte connecté. */
export function readPushOwner(storage, userId) {
  const owner = safeGet(storage, PUSH_OWNER_KEY);
  const legacy = safeGet(storage, LEGACY_PUSH_FLAG) === "1";
  if (owner) return { owner, mine: Boolean(userId) && owner === userId, legacy };
  // Ancien drapeau sans propriétaire : repris par le compte connecté.
  return { owner: null, mine: Boolean(userId) && legacy, legacy };
}

/** L'activation a réussi pour ce compte, sur cet appareil. */
export function claimPushOwner(storage, userId) {
  if (!userId) return false;
  safeRemove(storage, LEGACY_PUSH_FLAG);
  return safeSet(storage, PUSH_OWNER_KEY, String(userId));
}

/** Plus rien à rattacher sur cet appareil (consentement retiré). */
export function clearPushOwner(storage) {
  safeRemove(storage, PUSH_OWNER_KEY);
  safeRemove(storage, LEGACY_PUSH_FLAG);
}

/** Faut-il rattacher l'abonnement au démarrage ? */
export function shouldReassociate({ storage, userId, functionalConsent }) {
  if (!functionalConsent || !userId) return false;
  return readPushOwner(storage, userId).mine;
}

/** Identifiant de l'appareil, tiré au hasard une fois (jamais celui de OneSignal). */
export function deviceKey(storage, randomUUID) {
  const existing = safeGet(storage, DEVICE_KEY);
  if (existing && /^[0-9a-f-]{36}$/i.test(existing)) return existing;
  const fresh = randomUUID();
  safeSet(storage, DEVICE_KEY, fresh);
  return fresh;
}

/** Famille d'appareil, grossière : aucune empreinte, juste de quoi compter. */
export function platformFamily({ userAgent = "", platform = "", maxTouchPoints = 0 } = {}) {
  const ua = String(userAgent);
  if (/iPhone|iPad|iPod/.test(ua) || (platform === "MacIntel" && maxTouchPoints > 1)) return "ios";
  if (/Android/.test(ua)) return "android";
  if (/Mac OS X|Macintosh/.test(ua)) return "macos";
  if (/Windows/.test(ua)) return "windows";
  if (/Linux|CrOS/.test(ua)) return "linux";
  return "other";
}

/** Déclarer l'appareil au plus deux fois par jour et par compte. */
export function shouldReportPresence(storage, userId, now = Date.now()) {
  if (!userId) return false;
  const last = Number(safeGet(storage, `${PRESENCE_PREFIX}${userId}`) || 0);
  return !last || now - last > PRESENCE_INTERVAL_MS;
}

export function markPresenceReported(storage, userId, now = Date.now()) {
  if (userId) safeSet(storage, `${PRESENCE_PREFIX}${userId}`, String(now));
}

export function forgetPresence(storage, userId) {
  if (userId) safeRemove(storage, `${PRESENCE_PREFIX}${userId}`);
}

// Déconnexion faite alors que le service de notifications n'était pas encore
// chargé : l'appareil resterait rattaché au compte. On le note, et le
// prochain lancement de l'app termine le détachement — sauf si c'est la même
// personne qui revient.
export function markPendingLogout(storage, userId) {
  if (userId) safeSet(storage, PENDING_LOGOUT_KEY, String(userId));
}

/** { pending, finish } : faut-il détacher l'appareil au démarrage ? */
export function pendingLogoutFor(storage, userId) {
  const pending = safeGet(storage, PENDING_LOGOUT_KEY);
  if (!pending) return { pending: null, finish: false };
  return { pending, finish: !userId || pending !== userId };
}

export function clearPendingLogout(storage) {
  safeRemove(storage, PENDING_LOGOUT_KEY);
}
