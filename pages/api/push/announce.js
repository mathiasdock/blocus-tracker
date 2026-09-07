// Annonce push ponctuelle à TOUS les abonnés (segment "Subscribed Users").
// Ex. prévenir que l'app remarche, une nouveauté, une maintenance.
//
// ⚠️ Outward-facing : ça part à tous tes abonnés push. À déclencher à la main.
//
// Auth : secret cron (Authorization: Bearer <CRON_SECRET> ou header
//        x-cron-secret). Corps JSON : { title, body, url? } où
//        title/body sont une string ou un objet { fr, en }.
//
// Exemple (une seule fois) :
//   curl -X POST https://www.blocus-tracker.com/api/push/announce \
//     -H "x-cron-secret: $CRON_SECRET" -H "Content-Type: application/json" \
//     -d '{"title":{"fr":"Blocus Tracker est de retour ✅","en":"Blocus Tracker is back ✅"},
//          "body":{"fr":"L'\''app refonctionne — relance ton chrono !","en":"The app works again — start your timer!"},
//          "url":"/dashboard"}'
import { getClientIp, requireJson, setBaseSecurityHeaders, timingSafeEqualText } from "../../../lib/apiSecurity";
import { rateLimit } from "../../../lib/rateLimit";
import { createClient } from "@supabase/supabase-js";
import { sendAnnouncement } from "../../../lib/pushServer";

const CRON_SECRET = process.env.CRON_SECRET;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

function authorized(req) {
  if (!CRON_SECRET) return false;
  const bearer = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  const hdr = req.headers["x-cron-secret"];
  const header = Array.isArray(hdr) ? hdr[0] : hdr || "";
  return [bearer, header].some((s) => s && timingSafeEqualText(s, CRON_SECRET));
}

export const config = { api: { bodyParser: { sizeLimit: "16kb" } } };

export default async function handler(req, res) {
  setBaseSecurityHeaders(res);
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  if (!rateLimit(`push-announce:${getClientIp(req)}`, 10, 60_000).ok) {
    return res.status(429).json({ error: "Too many requests" });
  }
  if (!requireJson(req, res)) return;
  if (!authorized(req)) return res.status(401).json({ error: "Unauthorized" });

  const payload = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
  const { title, body, url } = payload;
  const nonEmpty = (v) => (typeof v === "string" ? v.trim() : v && (v.fr || v.en));
  if (!nonEmpty(title) || !nonEmpty(body)) {
    return res.status(400).json({ error: "title and body are required (string or { fr, en })" });
  }

  try {
    // Les personnes ayant refusé les annonces sont retirées AVANT l'envoi
    // (lib/pushServer.js → sendAnnouncement).
    const admin = SUPABASE_URL && SERVICE_ROLE_KEY
      ? createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
        auth: { autoRefreshToken: false, persistSession: false },
      })
      : null;
    const r = await sendAnnouncement(admin, { title, body, url });
    console.info("push/announce sent", { id: r.id || null, recipients: r.recipients, scope: r.scope, optedOut: r.optedOut ?? null });
    return res.status(200).json({ ok: true, id: r.id || null, recipients: r.recipients, scope: r.scope });
  } catch (err) {
    console.error("push/announce error:", err?.message || err);
    return res.status(500).json({ error: "Broadcast failed" });
  }
}
