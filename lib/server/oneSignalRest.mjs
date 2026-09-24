// Client REST OneSignal — SERVEUR UNIQUEMENT (routes pages/api/**).
//
// La clé REST (ONESIGNAL_REST_API_KEY) ne quitte jamais le serveur et
// n'apparaît dans aucune réponse ni aucun journal. Le ciblage passe TOUJOURS
// par des identifiants de comptes Blocus Tracker (include_aliases.external_id)
// choisis par lib/server/notify.mjs : ce client ne sait pas viser un segment.
//
// Deux familles d'adresses, parce qu'elles n'ont pas le même historique :
//   • envoi, annulation, statistiques, application : l'API v1
//     (onesignal.com/api/v1, en-tête « Basic ») — celle qu'utilisent déjà les
//     rappels du soir en production, donc le chemin éprouvé ;
//   • utilisateurs (lecture, suppression) : api.onesignal.com, en-tête « Key »,
//     puis « Basic » si la clé est une ancienne clé REST.

const LEGACY_API = "https://onesignal.com/api/v1";
const USERS_API = "https://api.onesignal.com";
const TIMEOUT_MS = 15_000;

export class OneSignalError extends Error {
  constructor(code, status = null) {
    super(code);
    this.code = code;
    this.status = status;
  }
}

/** Origine seule (« https://www.blocus-tracker.com ») : un chemin en trop dans l'env produisait des liens en 404. */
export function siteOrigin(raw) {
  const value = String(raw || "").trim();
  if (!value) return "";
  try { return new URL(value).origin; } catch (_) { return value.replace(/\/+$/, ""); }
}

export function absoluteUrl(url, origin) {
  if (!url) return null;
  const value = String(url);
  if (/^https?:\/\//i.test(value)) return value;
  return `${origin}/${value.replace(/^\/+/, "")}`;
}

function mapSubscription(sub) {
  return {
    type: String(sub?.type || "unknown"),
    enabled: sub?.enabled !== false && Number(sub?.notification_types ?? 1) > 0,
    lastActive: Number(sub?.last_active) ? new Date(Number(sub.last_active) * 1000).toISOString() : null,
  };
}

export function createOneSignalClient({ appId, apiKey, fetchImpl = globalThis.fetch, siteUrl = "" } = {}) {
  const configured = Boolean(appId && apiKey && fetchImpl);
  const origin = siteOrigin(siteUrl);

  async function request(url, { method = "GET", body, auth = "Basic" } = {}) {
    const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), TIMEOUT_MS) : null;
    try {
      const res = await fetchImpl(url, {
        method,
        headers: {
          Authorization: `${auth} ${apiKey}`,
          Accept: "application/json",
          ...(body ? { "Content-Type": "application/json; charset=utf-8" } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: controller?.signal,
      });
      const data = await res.json().catch(() => ({}));
      return { status: res.status, ok: res.ok, data };
    } catch (_) {
      throw new OneSignalError("onesignal_unavailable");
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  function requireConfig() {
    if (!configured) throw new OneSignalError("onesignal_unconfigured");
  }

  function failure(response) {
    return new OneSignalError(response.status >= 500 || response.status === 429 ? "onesignal_unavailable" : "onesignal_rejected", response.status);
  }

  async function usersRequest(path, method) {
    let response = await request(`${USERS_API}${path}`, { method, auth: "Key" });
    if (response.status === 401 || response.status === 403) {
      response = await request(`${USERS_API}${path}`, { method, auth: "Basic" });
    }
    return response;
  }

  return {
    configured,

    /**
     * Un envoi vers des comptes précis. title/body : { fr, en } (en toujours
     * présent). Renvoie { id } ou { id: null, noRecipients: true } quand aucun
     * des comptes n'a d'abonnement actif.
     */
    async send({ externalIds, title, body, url, sendAfter }) {
      requireConfig();
      if (!Array.isArray(externalIds) || !externalIds.length) throw new OneSignalError("empty_target");
      const payload = {
        app_id: appId,
        target_channel: "push",
        headings: title,
        contents: body,
        include_aliases: { external_id: externalIds.map(String) },
      };
      const link = absoluteUrl(url, origin);
      if (link) payload.web_url = link;
      if (sendAfter) payload.send_after = sendAfter;
      const response = await request(`${LEGACY_API}/notifications`, { method: "POST", body: payload });
      if (!response.ok) throw failure(response);
      if (!response.data?.id) return { id: null, noRecipients: true };
      return { id: String(response.data.id), noRecipients: false };
    },

    /** Annule un envoi programmé (sans effet sur un envoi déjà parti). */
    async cancel(notificationId) {
      requireConfig();
      const response = await request(
        `${LEGACY_API}/notifications/${encodeURIComponent(notificationId)}?app_id=${encodeURIComponent(appId)}`,
        { method: "DELETE" },
      );
      if (!response.ok) throw failure(response);
      return { ok: true };
    },

    /** Chiffres de livraison d'un envoi, tels que OneSignal les donne. */
    async delivery(notificationId) {
      requireConfig();
      const response = await request(
        `${LEGACY_API}/notifications/${encodeURIComponent(notificationId)}?app_id=${encodeURIComponent(appId)}`,
      );
      if (!response.ok) throw failure(response);
      const n = response.data || {};
      return {
        successful: Number(n.successful || 0),
        failed: Number(n.failed || 0),
        errored: Number(n.errored || 0),
        remaining: Number(n.remaining || 0),
        canceled: Boolean(n.canceled),
        completedAt: n.completed_at ? new Date(n.completed_at * 1000).toISOString() : null,
      };
    },

    /** Nombre d'abonnements de l'application (tous comptes confondus). */
    async app() {
      requireConfig();
      const response = await request(`${LEGACY_API}/apps/${encodeURIComponent(appId)}`);
      if (!response.ok) throw failure(response);
      return {
        total: Number(response.data?.players || 0),
        messageable: Number(response.data?.messageable_players || 0),
      };
    },

    /** Abonnements d'un compte chez OneSignal (lecture). */
    async viewUser(externalId) {
      requireConfig();
      const response = await usersRequest(
        `/apps/${encodeURIComponent(appId)}/users/by/external_id/${encodeURIComponent(externalId)}`, "GET",
      );
      if (response.status === 404) return { found: false, subscriptions: [] };
      if (!response.ok) throw failure(response);
      const subscriptions = (response.data?.subscriptions || [])
        .filter((sub) => /push/i.test(String(sub?.type || "")))
        .map(mapSubscription);
      return { found: true, subscriptions };
    },

    /** Supprime un compte chez OneSignal, avec ses abonnements. Absent = déjà fait. */
    async deleteUser(externalId) {
      requireConfig();
      const response = await usersRequest(
        `/apps/${encodeURIComponent(appId)}/users/by/external_id/${encodeURIComponent(externalId)}`, "DELETE",
      );
      if (response.status === 404) return { deleted: false, missing: true };
      if (!response.ok) throw failure(response);
      return { deleted: true, missing: false };
    },
  };
}

/** Client configuré depuis l'environnement du serveur. */
export function oneSignalFromEnv(env = process.env) {
  const rawId = String(env.NEXT_PUBLIC_ONESIGNAL_APP_ID || "").trim();
  const appId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(rawId) ? rawId : null;
  return createOneSignalClient({
    appId,
    apiKey: env.ONESIGNAL_REST_API_KEY || null,
    siteUrl: env.NEXT_PUBLIC_SITE_URL || "",
  });
}
