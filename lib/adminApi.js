// Accès de l'admin à ses données — navigateur uniquement.
//
// Deux chemins, et seulement deux :
//   adminRpc(name, params)  → les lectures admin_* de la base (v61, v61_3),
//                             qui revérifient elles-mêmes que l'appelant est
//                             admin (assert_admin) ;
//   adminFetch(path, opts)  → les routes serveur /api/admin/* (OneSignal,
//                             stockage), avec le jeton de la session.
// Les erreurs remontent comme des CODES stables, traduits par la page
// (adm.error.<code>) : jamais un message technique brut à l'écran.
//
// Aperçu hors ligne : les mêmes appels répondent avec des données de
// démonstration chargées à la demande (lib/offlineAdmin.js), sans rien
// écrire nulle part.

import { isOfflineDev, supabase } from "./supabaseClient";

const KNOWN_ERRORS = new Set([
  "session", "network", "forbidden", "failed", "misconfigured", "rate_limited",
  "onesignal_unreachable", "onesignal_rejected", "cancel_refused", "invalid_link",
  "title_required", "invalid_date", "date_too_soon", "date_too_far", "invalid_target",
  "empty_target", "members_unreadable", "unknown_automation", "token_missing", "save_failed",
  "invalid_selection", "nothing_selected",
  // Notifications (v62)
  "english_incomplete", "invalid", "not_found", "not_cancellable", "onesignal_unconfigured",
  "announcement_inactive", "end_before_start", "invalid_cap",
]);

function codeFromRpcError(error) {
  if (!error) return null;
  if (error.code === "42501" || /not allowed|admin/i.test(error.message || "")) return "forbidden";
  if (error.code === "57014") return "timeout";
  return "failed";
}

export async function adminRpc(name, params = {}) {
  if (isOfflineDev) {
    const { offlineAdminRpc } = await import("./offlineAdmin");
    return offlineAdminRpc(name, params);
  }
  try {
    const { data, error } = await supabase.rpc(name, params);
    if (error) return { data: null, error: codeFromRpcError(error) };
    return { data, error: null };
  } catch (_) {
    return { data: null, error: "network" };
  }
}

function codeFromResponse(status, payload) {
  const raw = typeof payload?.error === "string" ? payload.error : "";
  if (KNOWN_ERRORS.has(raw)) return raw;
  if (status === 401) return "session";
  if (status === 403) return "forbidden";
  if (status === 429) return "rate_limited";
  if (/misconfigured/i.test(raw)) return "misconfigured";
  return "failed";
}

// options : { method, body, query }. Renvoie { data, error }.
export async function adminFetch(path, options = {}) {
  const method = options.method || "GET";
  const query = options.query ? `?${new URLSearchParams(options.query).toString()}` : "";
  if (isOfflineDev) {
    const { offlineAdminApi } = await import("./offlineAdmin");
    return offlineAdminApi(path, { method, body: options.body, query: options.query || {} });
  }
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData?.session?.access_token;
  if (!token) return { data: null, error: "session" };
  try {
    const res = await fetch(`${path}${query}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(options.body ? { "Content-Type": "application/json" } : {}),
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
    });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok) return { data: null, error: codeFromResponse(res.status, payload), detail: payload?.token || null };
    return { data: payload, error: null };
  } catch (_) {
    return { data: null, error: "network" };
  }
}
