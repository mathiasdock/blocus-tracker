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
import { sendPushToUser } from "../../../lib/pushServer";
import { displayName } from "../../../lib/format";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const WEBHOOK_SECRET = process.env.ONESIGNAL_WEBHOOK_SECRET;

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // 1. Authentifie l'appel (secret partagé Supabase ↔ ce endpoint)
  const secret = req.headers["x-webhook-secret"];
  if (!WEBHOOK_SECRET || secret !== WEBHOOK_SECRET) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    return res.status(500).json({ error: "Server misconfigured" });
  }

  const { type, table, record } = req.body || {};

  try {
    // ── Demande d'ami reçue ─────────────────────────────────────────
    if (table === "friendships" && type === "INSERT" && record?.status === "pending") {
      const requesterId = record.requester;
      const addresseeId = record.addressee;
      if (!requesterId || !addresseeId) return res.status(200).json({ skipped: true });

      const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
        auth: { autoRefreshToken: false, persistSession: false },
      });

      // Jamais l'email : on ne sélectionne que les colonnes d'affichage.
      const { data: prof } = await admin
        .from("profiles")
        .select("pseudo, first_name, last_name")
        .eq("id", requesterId)
        .maybeSingle();

      const name = displayName(prof);

      await sendPushToUser(addresseeId, {
        title: { fr: "Nouvelle demande d'ami", en: "New friend request" },
        body: {
          fr: `${name} t'a envoyé une demande d'ami`,
          en: `${name} sent you a friend request`,
        },
        url: "/friends",
      });

      return res.status(200).json({ ok: true });
    }

    // Aucun handler pour cet événement (extensible : messages, comments, likes…)
    return res.status(200).json({ skipped: true });
  } catch (err) {
    console.error("push/notify error:", err);
    return res.status(500).json({ error: "Send failed" });
  }
}
