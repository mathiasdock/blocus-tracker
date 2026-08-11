// Console de notifications push de l'admin.
//
//   GET  → audience (nombre d'abonnés) + historique des envois
//   POST → envoi ciblé : tous les abonnés, une université, ou des membres choisis
//
// Sécurité : mêmes garde-fous que /api/admin/insights — jeton Bearer vérifié,
// puis profiles.is_admin contrôlé avec la clé service role. La clé REST
// OneSignal reste server-only, elle n'apparaît jamais dans une réponse.

import { createClient } from "@supabase/supabase-js";
import { getBearerToken, getClientIp, setBaseSecurityHeaders } from "../../../lib/apiSecurity";
import { rateLimit } from "../../../lib/rateLimit";
import { getPushAudience, listRecentPushes, sendBroadcast, sendPushToUsers } from "../../../lib/pushServer";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const MAX_TITLE = 60;
const MAX_BODY = 160;

// Une notification part sur des téléphones et ne se rattrape pas : on plafonne
// bas plutôt que de laisser un clic répété partir cinq fois.
const SEND_LIMIT = { max: 6, windowMs: 10 * 60 * 1000 };

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
    console.warn("admin/push forbidden", { user: `${userId.slice(0, 8)}...` });
    res.status(403).json({ error: "Forbidden" }); return null;
  }
  return { admin, userId };
}

function cleanText(value, max) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, max);
}

export default async function handler(req, res) {
  setBaseSecurityHeaders(res);

  if (req.method !== "GET" && req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const limited = rateLimit(`admin-push:${getClientIp(req)}`, 30, 60_000);
  if (!limited.ok) return res.status(429).json({ error: "Too many requests" });

  const auth = await requireAdmin(req, res);
  if (!auth) return;

  // ── Lecture : audience + historique ───────────────────────────────────────
  if (req.method === "GET") {
    const [audience, history] = await Promise.all([
      getPushAudience().catch((e) => ({ error: e.message })),
      listRecentPushes(12).catch(() => []),
    ]);
    if (audience?.error) {
      return res.status(502).json({ error: "OneSignal unreachable", detail: audience.error });
    }
    return res.status(200).json({ audience, history });
  }

  // ── Envoi ─────────────────────────────────────────────────────────────────
  const sendLimited = rateLimit(`admin-push-send:${auth.userId}`, SEND_LIMIT.max, SEND_LIMIT.windowMs);
  if (!sendLimited.ok) {
    return res.status(429).json({ error: "Trop d'envois d'affilée. Attends quelques minutes." });
  }

  const body = req.body || {};
  const title = cleanText(body.title, MAX_TITLE);
  const message = cleanText(body.message, MAX_BODY);
  const target = body.target || {};

  if (!title || !message) {
    return res.status(400).json({ error: "Titre et message obligatoires." });
  }
  // Seuls des chemins internes : un lien externe dans une notification de
  // l'app serait un vecteur d'hameçonnage si le compte admin était compromis.
  const rawUrl = String(body.url || "").trim();
  if (rawUrl && !rawUrl.startsWith("/")) {
    return res.status(400).json({ error: "Le lien doit être un chemin interne, commençant par /." });
  }
  const opts = { title, body: message, url: rawUrl || undefined };

  try {
    if (target.type === "all") {
      const r = await sendBroadcast(opts);
      return res.status(200).json({ ok: true, recipients: r.recipients ?? null, scope: "all" });
    }

    let userIds = [];
    if (target.type === "university" && target.university) {
      const { data, error } = await auth.admin
        .from("profiles").select("id").eq("university", target.university);
      if (error) return res.status(500).json({ error: "Lecture des membres impossible." });
      userIds = (data || []).map((r) => r.id);
    } else if (target.type === "users") {
      userIds = [...new Set((target.userIds || []).filter(Boolean).map(String))].slice(0, 2000);
    } else {
      return res.status(400).json({ error: "Cible invalide." });
    }

    if (!userIds.length) return res.status(400).json({ error: "Aucun membre dans cette cible." });

    const r = await sendPushToUsers(userIds, opts);
    return res.status(200).json({ ok: true, recipients: r.recipients ?? null, targeted: userIds.length, scope: target.type });
  } catch (error) {
    console.error("admin/push send failed:", error.message);
    return res.status(502).json({ error: "OneSignal a refusé l'envoi.", detail: error.message });
  }
}
