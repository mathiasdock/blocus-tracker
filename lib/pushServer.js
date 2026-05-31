// Envoi de notifications push côté SERVEUR via l'API REST OneSignal.
//
// ⚠️ À utiliser UNIQUEMENT dans des routes API (pages/api/**) ou du code serveur.
//    La clé REST (ONESIGNAL_REST_API_KEY) ne doit JAMAIS arriver côté client.
//
// Cible un utilisateur précis via son external_id = Supabase user.id
// (mappé côté client par OneSignal.login()).

const ONESIGNAL_API = "https://onesignal.com/api/v1/notifications";

/**
 * @param {string} userId  Supabase user.id (external_id OneSignal)
 * @param {{ title: string|object, body: string|object, url?: string }} opts
 *        title/body : string (mono-langue) ou objet { fr, en } (multi-langue).
 *        url : chemin relatif ("/friends") ou URL absolue.
 */
export async function sendPushToUser(userId, { title, body, url } = {}) {
  const appId = process.env.NEXT_PUBLIC_ONESIGNAL_APP_ID;
  const apiKey = process.env.ONESIGNAL_REST_API_KEY;
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "";

  if (!appId || !apiKey) throw new Error("OneSignal not configured (missing app id / REST key)");
  if (!userId) return { ok: false, reason: "no-user" };

  const headings = typeof title === "string" ? { en: title } : title;
  const contents = typeof body === "string" ? { en: body } : body;

  const payload = {
    app_id: appId,
    target_channel: "push",
    include_aliases: { external_id: [String(userId)] },
    headings,
    contents,
  };

  if (url) {
    payload.web_url = url.startsWith("http") ? url : `${siteUrl}${url}`;
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
  if (!res.ok) {
    throw new Error(`OneSignal error ${res.status}: ${JSON.stringify(data)}`);
  }
  return { ok: true, id: data.id, recipients: data.recipients };
}
