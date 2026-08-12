// Réglages des notifications automatiques, côté admin.
//
//   GET  → le catalogue (quand chaque notification part) fusionné avec les
//          réglages enregistrés
//   PUT  → enregistre l'activation et les textes d'UNE notification
//
// Ces textes partent sur les téléphones de tous les membres : l'écriture est
// réservée au service role et passe par la vérification profiles.is_admin,
// comme /api/admin/push.

import { createClient } from "@supabase/supabase-js";
import { getBearerToken, getClientIp, setBaseSecurityHeaders } from "../../../lib/apiSecurity";
import { rateLimit } from "../../../lib/rateLimit";
import { AUTOMATIONS, AUTOMATION_BY_KEY, loadAutomations } from "../../../lib/pushAutomations";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const MAX_TITLE = 60;
const MAX_BODY = 160;

async function requireAdmin(req, res) {
  const token = getBearerToken(req);
  if (!token) { res.status(401).json({ error: "Unauthorized" }); return null; }
  if (!SUPABASE_URL || !ANON_KEY || !SERVICE_ROLE_KEY) {
    res.status(500).json({ error: "Server misconfigured" }); return null;
  }
  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: userData, error: userError } = await userClient.auth.getUser(token);
  const userId = userData?.user?.id;
  if (userError || !userId) { res.status(401).json({ error: "Unauthorized" }); return null; }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: profile, error } = await admin
    .from("profiles").select("is_admin").eq("id", userId).maybeSingle();
  if (error || !profile?.is_admin) {
    res.status(403).json({ error: "Forbidden" }); return null;
  }
  return { admin, userId };
}

const clean = (v, max) => String(v || "").replace(/\s+/g, " ").trim().slice(0, max);

export default async function handler(req, res) {
  setBaseSecurityHeaders(res);
  if (req.method !== "GET" && req.method !== "PUT") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  const limited = rateLimit(`admin-automations:${getClientIp(req)}`, 40, 60_000);
  if (!limited.ok) return res.status(429).json({ error: "Too many requests" });

  const auth = await requireAdmin(req, res);
  if (!auth) return;

  if (req.method === "GET") {
    const settings = await loadAutomations(auth.admin);
    return res.status(200).json({
      automations: AUTOMATIONS.map((a) => ({
        key: a.key,
        label: a.label,
        trigger: a.trigger,
        vars: a.vars,
        defaults: { title: a.title, body: a.body, url: a.url },
        current: settings[a.key],
      })),
    });
  }

  // ── Enregistrement ────────────────────────────────────────────────────────
  const body = req.body || {};
  const def = AUTOMATION_BY_KEY[body.key];
  if (!def) return res.status(400).json({ error: "Notification inconnue." });

  const url = String(body.url || "").trim();
  if (url && !url.startsWith("/")) {
    return res.status(400).json({ error: "Le lien doit être un chemin interne, commençant par /." });
  }

  const titleFr = clean(body.titleFr, MAX_TITLE);
  const bodyFr = clean(body.bodyFr, MAX_BODY);
  if (!titleFr || !bodyFr) {
    return res.status(400).json({ error: "Le titre et le message en français sont obligatoires." });
  }

  // Un jeton perdu à la réécriture donnerait « t'a envoyé une demande » sans
  // le prénom : on refuse plutôt que d'envoyer une phrase amputée.
  for (const token of def.vars || []) {
    if (def.body.fr.includes(token) && !bodyFr.includes(token)) {
      return res.status(400).json({ error: `Le message doit conserver ${token}.` });
    }
  }

  const { error } = await auth.admin.from("push_automations").upsert({
    key: def.key,
    enabled: body.enabled !== false,
    title_fr: titleFr,
    title_en: clean(body.titleEn, MAX_TITLE) || def.title.en,
    body_fr: bodyFr,
    body_en: clean(body.bodyEn, MAX_BODY) || def.body.en,
    url: url || def.url,
    updated_at: new Date().toISOString(),
    updated_by: auth.userId,
  }, { onConflict: "key" });

  if (error) {
    console.error("admin/push-automations upsert failed:", error.message);
    return res.status(500).json({ error: "Enregistrement impossible.", detail: error.message });
  }
  return res.status(200).json({ ok: true });
}
