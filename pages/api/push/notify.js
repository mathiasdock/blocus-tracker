// Événements sociaux → notification push. Appelée par la base :
//   • push_friend_request  (v62_1) : nouvelle demande d'ami ;
//   • push_friend_accepted (v63)   : demande passée d'en attente à acceptée ;
//   • push_private_message (v63)   : nouveau message privé (id seulement).
//
// Sécurité :
//   • secret fort, tiré au hasard dans Vault et vérifié par la base
//     (push_webhook_secret_ok) — l'ancien secret faible n'ouvre plus rien ;
//   • le corps reçu ne sert qu'à connaître le type et l'identifiant :
//     l'événement est relu en base et doit être frais. Un appel forgé ne peut
//     donc ni choisir le destinataire ni le texte ;
//   • un message privé est relu SANS son contenu (jamais sélectionné) ;
//   • tout le reste (préférences, suspension, blocage, fréquence, anti-doublon)
//     passe par le point d'envoi unique (lib/server/notify.mjs).
// Lecture profiles limitée au prénom / pseudo (jamais l'email).
import { createClient } from "@supabase/supabase-js";
import { getClientIp, requireJson, setBaseSecurityHeaders } from "../../../lib/apiSecurity";
import { rateLimit } from "../../../lib/rateLimit";
import { loadAutomations } from "../../../lib/pushAutomations.mjs";
import { socialEventFromWebhook } from "../../../lib/notificationRules.mjs";
import { createNotificationStore } from "../../../lib/server/notify.mjs";
import {
  isWebhookAuthorized, notifyFriendAccepted, notifyFriendRequest, notifyPrivateMessage,
} from "../../../lib/server/socialPush.mjs";
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
  // Tous les appels viennent de la base (même adresse) : demandes, acceptations
  // et messages confondus.
  if (!rateLimit(`push-notify:${getClientIp(req)}`, 300, 60_000).ok) {
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
  const event = socialEventFromWebhook(payload);
  if (!event) return res.status(200).json({ skipped: true, reason: "unsupported_event" });

  const loadProfile = async (id) => {
    const { data } = await admin.from("profiles").select("pseudo, first_name, locked").eq("id", id).maybeSingle();
    return data || null;
  };
  const loadFriendship = async (id) => {
    const { data } = await admin.from("friendships")
      .select("id, requester, addressee, status, created_at, accepted_at").eq("id", id).maybeSingle();
    return data || null;
  };

  try {
    const deps = {
      store: createNotificationStore(admin),
      onesignal: oneSignalFromEnv(),
      automations: await loadAutomations(admin),
      loadProfile,
    };
    let result;
    if (event.type === "private_message") {
      result = await notifyPrivateMessage({
        ...deps,
        messageId: event.id,
        loadMessage: async (id) => {
          // Jamais le contenu : seulement qui, à qui, quand.
          const { data } = await admin.from("private_messages")
            .select("id, sender_id, receiver_id, created_at").eq("id", id).maybeSingle();
          return data || null;
        },
      });
    } else if (event.type === "friend_accepted") {
      result = await notifyFriendAccepted({ ...deps, friendshipId: event.id, loadFriendship });
    } else {
      result = await notifyFriendRequest({ ...deps, friendshipId: event.id, loadFriendship });
    }
    console.info("push/notify", { type: event.type, status: result.status, reason: result.reason || null });
    return res.status(200).json({ ok: true, status: result.status });
  } catch (error) {
    console.error("push/notify failed", { code: error?.code || "unknown" });
    return res.status(500).json({ error: "send_failed" });
  }
}
