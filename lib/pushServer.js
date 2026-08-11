// Envoi de notifications push côté SERVEUR via l'API REST OneSignal.
//
// ⚠️ À utiliser UNIQUEMENT dans des routes API (pages/api/**) ou du code serveur.
//    La clé REST (ONESIGNAL_REST_API_KEY) ne doit JAMAIS arriver côté client.
//
// Cible un utilisateur précis via son external_id = Supabase user.id
// (mappé côté client par OneSignal.login()).

const ONESIGNAL_API = "https://onesignal.com/api/v1/notifications";
const ONESIGNAL_APP_API = "https://onesignal.com/api/v1/apps";

// Segment par défaut de OneSignal regroupant tous les abonnés. L'ancien nom
// "Subscribed Users" n'existe plus : le viser renvoyait une erreur, donc
// sendBroadcast() n'atteignait personne.
export const ALL_SUBSCRIBERS_SEGMENT = "Total Subscriptions";

// NEXT_PUBLIC_SITE_URL contient un chemin en trop en production
// ("…/dashboard"), ce qui produisait des liens /dashboard/planning menant à une
// 404. On ne garde que l'origine : le réglage de l'env n'a plus d'incidence.
function siteOrigin() {
  const raw = (process.env.NEXT_PUBLIC_SITE_URL || "").trim();
  if (!raw) return "";
  try { return new URL(raw).origin; } catch (_) { return raw.replace(/\/+$/, ""); }
}

// Appel bas-niveau : payload commun (app_id, headings/contents, url) fusionné
// avec le ciblage (include_aliases OU included_segments).
async function postToOneSignal(targeting, { title, body, url } = {}) {
  const appId = process.env.NEXT_PUBLIC_ONESIGNAL_APP_ID;
  const apiKey = process.env.ONESIGNAL_REST_API_KEY;
  if (!appId || !apiKey) throw new Error("OneSignal not configured (missing app id / REST key)");

  const payload = {
    app_id: appId,
    target_channel: "push",
    headings: typeof title === "string" ? { en: title } : title,
    contents: typeof body === "string" ? { en: body } : body,
    ...targeting,
  };
  if (url) {
    payload.web_url = url.startsWith("http")
      ? url
      : `${siteOrigin()}/${String(url).replace(/^\/+/, "")}`;
  }

  const res = await fetch(ONESIGNAL_API, {
    method: "POST",
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      Authorization: `Basic ${apiKey}`,
    },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`OneSignal error ${res.status}: ${JSON.stringify(data)}`);
  return { ok: true, id: data.id, recipients: data.recipients };
}

/**
 * Notifie UN utilisateur (via external_id = Supabase user.id).
 * title/body : string (mono-langue) ou objet { fr, en }. url : chemin relatif.
 */
export async function sendPushToUser(userId, opts = {}) {
  if (!userId) return { ok: false, reason: "no-user" };
  return postToOneSignal({ include_aliases: { external_id: [String(userId)] } }, opts);
}

/**
 * Notifie PLUSIEURS utilisateurs en un seul appel (batch). OneSignal ne
 * délivre qu'aux external_id réellement abonnés → aucun risque d'envoyer à un
 * non-abonné. Chunké à 2000 ids/appel (limite OneSignal).
 */
export async function sendPushToUsers(userIds, opts = {}) {
  const ids = [...new Set((userIds || []).filter(Boolean).map(String))];
  if (!ids.length) return { ok: true, recipients: 0, batches: 0 };
  let recipients = 0, batches = 0;
  const notificationIds = [];
  for (let i = 0; i < ids.length; i += 2000) {
    const r = await postToOneSignal({ include_aliases: { external_id: ids.slice(i, i + 2000) } }, opts);
    recipients += r.recipients || 0;
    if (r.id) notificationIds.push(r.id);
    batches++;
  }
  return { ok: true, recipients, batches, notificationIds };
}

/**
 * Diffusion à TOUS les abonnés push (segment OneSignal "Subscribed Users").
 * Réservé aux annonces ponctuelles (ex. "l'app remarche").
 */
export async function sendBroadcast(opts = {}) {
  return postToOneSignal({ included_segments: [ALL_SUBSCRIBERS_SEGMENT] }, opts);
}

// ── Lecture (console admin) ─────────────────────────────────────────────────

function onesignalHeaders() {
  const apiKey = process.env.ONESIGNAL_REST_API_KEY;
  if (!apiKey) throw new Error("OneSignal not configured (missing REST key)");
  return { Authorization: `Basic ${apiKey}`, Accept: "application/json" };
}

/** Nombre d'appareils abonnés. `messageable` = ceux qui peuvent réellement recevoir. */
export async function getPushAudience() {
  const appId = process.env.NEXT_PUBLIC_ONESIGNAL_APP_ID;
  if (!appId) throw new Error("OneSignal not configured (missing app id)");
  const res = await fetch(`${ONESIGNAL_APP_API}/${appId}`, { headers: onesignalHeaders() });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`OneSignal error ${res.status}`);
  return {
    total: Number(data.players || 0),
    messageable: Number(data.messageable_players || 0),
  };
}

/** Historique des envois, normalisé pour l'affichage. */
export async function listRecentPushes(limit = 12) {
  const appId = process.env.NEXT_PUBLIC_ONESIGNAL_APP_ID;
  if (!appId) throw new Error("OneSignal not configured (missing app id)");
  const url = `${ONESIGNAL_API}?app_id=${encodeURIComponent(appId)}&limit=${Math.min(50, Math.max(1, limit))}`;
  const res = await fetch(url, { headers: onesignalHeaders() });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`OneSignal error ${res.status}`);
  const pick = (obj) => (obj && (obj.fr || obj.en || Object.values(obj)[0])) || "";
  return (data.notifications || []).map((n) => ({
    id: n.id,
    title: pick(n.headings),
    body: pick(n.contents),
    sentAt: n.completed_at ? n.completed_at * 1000 : (n.queued_at ? n.queued_at * 1000 : null),
    successful: Number(n.successful || 0),
    failed: Number(n.failed || 0) + Number(n.errored || 0),
    // Un envoi ciblé ne porte pas de segment : on résume la cible pour l'admin.
    audience: (n.included_segments || []).length
      ? (n.included_segments || []).join(", ")
      : `${(n.include_aliases?.external_id || []).length} membre(s)`,
    url: n.web_url || null,
  }));
}
