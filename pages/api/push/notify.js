// Demande d'ami → notification push. Appelée par la base (déclencheur
// push_friend_request, v62_1) à chaque nouvelle demande.
//
// Sécurité :
//   • secret fort, tiré au hasard dans Vault et vérifié par la base
//     (push_webhook_secret_ok) — l'ancien secret faible n'ouvre plus rien ;
//   • le corps reçu ne sert qu'à connaître l'identifiant de la demande : elle
//     est relue en base, doit être en attente et fraîche. Un appel forgé ne
//     peut donc ni choisir le destinataire ni le texte ;
//   • tout le reste (préférences, suspension, blocage, fréquence, anti-doublon)
//     passe par le point d'envoi unique (lib/server/notify.mjs).
// Lecture profiles limitée au nom affiché (jamais l'email).
import { createClient } from "@supabase/supabase-js";
import { getClientIp, requireJson, setBaseSecurityHeaders } from "../../../lib/apiSecurity";
import { rateLimit } from "../../../lib/rateLimit";
import { displayName } from "../../../lib/format";
import { loadAutomations } from "../../../lib/pushAutomations.mjs";
import { friendshipIdFromWebhook } from "../../../lib/notificationRules.mjs";
import { createNotificationStore } from "../../../lib/server/notify.mjs";
import { isWebhookAuthorized, notifyFriendRequest } from "../../../lib/server/friendRequestPush.mjs";
import { oneSignalFromEnv } from "../../../lib/server/oneSignalRest.mjs";

export const config = {
  api: {
    bodyParser: { sizeLimit: "16kb" },
  },
};

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

export default async function handler(req, res) {
  setBaseSecurityHeaders(res);

  if (req.method !== "POST") return res.status(405).json({ error: "method_not_allowed" });
  if (!requireJson(req, res)) return;
  if (!rateLimit(`push-notify:${getClientIp(req)}`, 120, 60_000).ok) {
    return res.status(429).json({ error: "rate_limited" });
  }
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) return res.status(500).json({ error: "misconfigured" });

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const authorized = await isWebhookAuthorized({
    header: req.headers["x-webhook-secret"],
    envSecret: process.env.ONESIGNAL_WEBHOOK_SECRET || "",
    verifyVaultSecret: async (secret) => {
      const { data, error } = await admin.rpc("push_webhook_secret_ok", { p_secret: secret });
      return !error && data === true;
    },
  });
  if (!authorized) {
    console.warn("push/notify unauthorized call");
    return res.status(401).json({ error: "unauthorized" });
  }

  let payload = req.body || {};
  if (typeof payload === "string") {
    try { payload = JSON.parse(payload); } catch (_) { return res.status(400).json({ error: "invalid_payload" }); }
  }
  const friendshipId = friendshipIdFromWebhook(payload);
  if (!friendshipId) return res.status(200).json({ skipped: true, reason: "unsupported_event" });

  try {
    const result = await notifyFriendRequest({
      store: createNotificationStore(admin),
      onesignal: oneSignalFromEnv(),
      automations: await loadAutomations(admin),
      nameOf: displayName,
      friendshipId,
      loadFriendship: async (id) => {
        const { data } = await admin.from("friendships")
          .select("id, requester, addressee, status, created_at").eq("id", id).maybeSingle();
        return data || null;
      },
      loadProfile: async (id) => {
        const { data } = await admin.from("profiles")
          .select("pseudo, first_name, last_name, locked").eq("id", id).maybeSingle();
        return data || null;
      },
    });
    console.info("push/notify friend_request", { status: result.status, reason: result.reason || null });
    return res.status(200).json({ ok: true, status: result.status });
  } catch (error) {
    console.error("push/notify failed", { code: error?.code || "unknown" });
    return res.status(500).json({ error: "send_failed" });
  }
}
