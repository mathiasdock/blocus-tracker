// Route d'envoi de notifications push, déclenchée par un Database Webhook Supabase.
//
// Sécurité :
//   • Vérifie un secret partagé (header x-webhook-secret) → le client ne peut
//     PAS appeler cette route pour spammer arbitrairement.
//   • Clé REST OneSignal + service role Supabase : server-only.
//   • Lecture profiles limitée à pseudo/first_name/last_name (jamais email).
//
// Env vars requises (Vercel, server-only sauf NEXT_PUBLIC_*) :
//   NEXT_PUBLIC_SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY
//   ONESIGNAL_WEBHOOK_SECRET
//   NEXT_PUBLIC_ONESIGNAL_APP_ID
//   ONESIGNAL_REST_API_KEY
//
// Payload attendu (Supabase webhook) :
//   { type: "INSERT", table: "friendships", record: {...}, schema: "public" }

import { createClient } from "@supabase/supabase-js";
import { getClientIp, requireJson, setBaseSecurityHeaders, timingSafeEqualText } from "../../../lib/apiSecurity";
import { rateLimit } from "../../../lib/rateLimit";
import { sendPushToUser } from "../../../lib/pushServer";
import { displayName } from "../../../lib/format";

export const config = {
  api: {
    bodyParser: { sizeLimit: "64kb" },
  },
};

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const WEBHOOK_SECRET = process.env.ONESIGNAL_WEBHOOK_SECRET;

function safeId(id) {
  return id ? `${String(id).slice(0, 8)}...` : null;
}

export default async function handler(req, res) {
  setBaseSecurityHeaders(res);

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  if (!requireJson(req, res)) return;

  const limited = rateLimit(`push-notify:${getClientIp(req)}`, 120, 60_000);
  if (!limited.ok) {
    return res.status(429).json({ error: "Too many requests" });
  }

  // 1. Authentifie l'appel (secret partagé Supabase ↔ ce endpoint)
  const secretHeader = req.headers["x-webhook-secret"];
  const secret = Array.isArray(secretHeader) ? secretHeader[0] : secretHeader;
  if (!WEBHOOK_SECRET || !timingSafeEqualText(secret || "", WEBHOOK_SECRET)) {
    console.warn("push/notify unauthorized webhook call");
    return res.status(401).json({ error: "Unauthorized" });
  }
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    console.error("push/notify missing server configuration");
    return res.status(500).json({ error: "Server misconfigured" });
  }

  try {
    const payload = typeof req.body === "string" ? JSON.parse(req.body) : (req.body || {});
    const { type, table, schema, record } = payload;

    if (schema !== "public" || typeof table !== "string" || typeof type !== "string") {
      return res.status(400).json({ error: "Invalid webhook payload" });
    }

    console.info("push/notify received", {
      type,
      table,
      schema,
      status: record?.status || null,
      hasRecord: Boolean(record),
    });

    // ── Demande d'ami reçue ─────────────────────────────────────────
    if (table === "friendships" && type === "INSERT" && record?.status === "pending") {
      const requesterId = record.requester;
      const addresseeId = record.addressee;
      if (!requesterId || !addresseeId) {
        console.warn("push/notify skipped friendship insert with missing ids", {
          requester: safeId(requesterId),
          addressee: safeId(addresseeId),
        });
        return res.status(200).json({ skipped: true, reason: "missing-friendship-ids" });
      }

      const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
        auth: { autoRefreshToken: false, persistSession: false },
      });

      // Jamais l'email : on ne sélectionne que les colonnes d'affichage.
      const { data: prof, error: profileError } = await admin
        .from("profiles")
        .select("pseudo, first_name, last_name")
        .eq("id", requesterId)
        .maybeSingle();
      if (profileError) {
        console.warn("push/notify requester profile lookup failed", {
          requester: safeId(requesterId),
          code: profileError.code,
        });
      }

      const name = displayName(prof);

      const pushResult = await sendPushToUser(addresseeId, {
        title: { fr: "Nouvelle demande d'ami", en: "New friend request" },
        body: {
          fr: `${name} t'a envoyé une demande d'ami`,
          en: `${name} sent you a friend request`,
        },
        url: "/friends",
      });

      console.info("push/notify sent", {
        kind: "friend_request",
        requester: safeId(requesterId),
        addressee: safeId(addresseeId),
        notificationId: pushResult?.id || null,
        recipients: pushResult?.recipients ?? null,
      });

      return res.status(200).json({ ok: true });
    }

    // Aucun handler pour cet événement (extensible : messages, comments, likes…)
    console.info("push/notify skipped unsupported event", {
      type,
      table,
      status: record?.status || null,
    });
    return res.status(200).json({ skipped: true, reason: "unsupported-event" });
  } catch (err) {
    console.error("push/notify error:", err?.message || err);
    return res.status(500).json({ error: "Send failed" });
  }
}
