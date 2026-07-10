// Envoi de notifications push côté SERVEUR via l'API REST OneSignal.
//
// ⚠️ À utiliser UNIQUEMENT dans des routes API (pages/api/**) ou du code serveur.
//    La clé REST (ONESIGNAL_REST_API_KEY) ne doit JAMAIS arriver côté client.
//
// Cible un utilisateur précis via son external_id = Supabase user.id
// (mappé côté client par OneSignal.login()).

const ONESIGNAL_API = "https://onesignal.com/api/v1/notifications";

// Appel bas-niveau : payload commun (app_id, headings/contents, url) fusionné
// avec le ciblage (include_aliases OU included_segments).
async function postToOneSignal(targeting, { title, body, url } = {}) {
  const appId = process.env.NEXT_PUBLIC_ONESIGNAL_APP_ID;
  const apiKey = process.env.ONESIGNAL_REST_API_KEY;
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "";
  if (!appId || !apiKey) throw new Error("OneSignal not configured (missing app id / REST key)");

  const payload = {
    app_id: appId,
    target_channel: "push",
    headings: typeof title === "string" ? { en: title } : title,
    contents: typeof body === "string" ? { en: body } : body,
    ...targeting,
  };
  if (url) payload.web_url = url.startsWith("http") ? url : `${siteUrl}${url}`;

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
  return postToOneSignal({ included_segments: ["Subscribed Users"] }, opts);
}
