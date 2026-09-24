// Console de notifications push de l'admin.
//
//   GET  → audience (nombre d'abonnés), universités ciblables + historique
//   POST → envoi ciblé : tous les abonnés, une université, ou des membres choisis
//
// Les erreurs sont des codes stables (« invalid_link », « empty_target »…) :
// la page admin les traduit, aucune phrase n'est écrite ici.
//
// Sécurité : garde commune lib/server/adminAuth (jeton vérifié, admin non
// suspendu). La clé REST OneSignal reste server-only, elle n'apparaît jamais
// dans une réponse. Chaque envoi et chaque annulation est tracé dans le
// journal d'audit. Les comptes suspendus ne reçoivent rien.

import { getClientIp, setBaseSecurityHeaders } from "../../../lib/apiSecurity";
import { rateLimit } from "../../../lib/rateLimit";
import { getPushAudience, listRecentPushes, sendAnnouncement, sendPushToUsers, cancelPush } from "../../../lib/pushServer";
import { logAdminAction, requireAdmin } from "../../../lib/server/adminAuth";
import { isSafeInternalHref } from "../../../lib/security";

const MAX_TITLE = 60;
const MAX_BODY = 160;

// Une notification part sur des téléphones et ne se rattrape pas : on plafonne
// bas plutôt que de laisser un clic répété partir cinq fois.
const SEND_LIMIT = { max: 6, windowMs: 10 * 60 * 1000 };

function cleanText(value, max) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, max);
}

// Universités ciblables : celles des membres non suspendus (admins exclus),
// avec leur nombre de membres. Comptées ici, côté serveur, pour que la page
// n'ait jamais à charger la liste des membres.
async function listTargetUniversities(admin) {
  const counts = new Map();
  for (let from = 0; ; from += 1000) {
    const { data, error } = await admin
      .from("profiles").select("university")
      .eq("locked", false).eq("is_admin", false).not("university", "is", null)
      .order("id").range(from, from + 999);
    if (error) throw error;
    for (const row of data || []) {
      const name = String(row.university || "").trim();
      if (name) counts.set(name, (counts.get(name) || 0) + 1);
    }
    if (!data || data.length < 1000) break;
  }
  return [...counts.entries()]
    .map(([name, members]) => ({ name, members }))
    .sort((a, b) => a.name.localeCompare(b.name, "fr"));
}

export default async function handler(req, res) {
  setBaseSecurityHeaders(res);

  if (!["GET", "POST", "DELETE"].includes(req.method)) {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const limited = rateLimit(`admin-push:${getClientIp(req)}`, 30, 60_000);
  if (!limited.ok) return res.status(429).json({ error: "Too many requests" });

  const auth = await requireAdmin(req, res, "admin/push");
  if (!auth) return;

  // ── Lecture : audience + historique ───────────────────────────────────────
  if (req.method === "GET") {
    const [audience, history, universities] = await Promise.all([
      getPushAudience().catch((e) => ({ error: e.message })),
      listRecentPushes(20).catch(() => []),
      listTargetUniversities(auth.admin).catch(() => []),
    ]);
    if (audience?.error) {
      console.error("admin/push audience failed:", audience.error);
      return res.status(502).json({ error: "onesignal_unreachable", universities });
    }
    return res.status(200).json({ audience, history, universities });
  }

  // ── Annulation d'un envoi programmé ───────────────────────────────────────
  if (req.method === "DELETE") {
    const id = String(req.query.id || "").trim();
    if (!id) return res.status(400).json({ error: "failed" });
    try {
      await cancelPush(id);
      await logAdminAction(auth.admin, auth.userId, "push_cancelled", { targetType: "push", targetId: id });
      return res.status(200).json({ ok: true });
    } catch (error) {
      console.error("admin/push cancel failed:", error.message);
      return res.status(502).json({ error: "cancel_refused" });
    }
  }

  // ── Envoi ─────────────────────────────────────────────────────────────────
  const sendLimited = rateLimit(`admin-push-send:${auth.userId}`, SEND_LIMIT.max, SEND_LIMIT.windowMs);
  if (!sendLimited.ok) {
    return res.status(429).json({ error: "rate_limited" });
  }

  const body = req.body || {};
  const title = cleanText(body.title, MAX_TITLE);
  const message = cleanText(body.message, MAX_BODY);
  const target = body.target || {};

  if (!title || !message) {
    return res.status(400).json({ error: "title_required" });
  }
  // Seuls des chemins internes : un lien externe dans une notification de
  // l'app serait un vecteur d'hameçonnage si le compte admin était compromis.
  // « //site.com » commence aussi par « / » : isSafeInternalHref le refuse.
  const rawUrl = String(body.url || "").trim();
  if (!isSafeInternalHref(rawUrl)) {
    return res.status(400).json({ error: "invalid_link" });
  }
  // Envoi différé. On refuse une date passée : OneSignal partirait aussitôt,
  // sans que l'admin comprenne pourquoi. Plafonné à 90 jours — au-delà, c'est
  // une erreur de saisie plus probablement qu'une intention.
  let sendAfter;
  if (body.sendAfter) {
    const when = new Date(body.sendAfter);
    if (Number.isNaN(when.getTime())) return res.status(400).json({ error: "invalid_date" });
    if (when.getTime() < Date.now() + 60_000) {
      return res.status(400).json({ error: "date_too_soon" });
    }
    if (when.getTime() > Date.now() + 90 * 864e5) {
      return res.status(400).json({ error: "date_too_far" });
    }
    sendAfter = when.toISOString();
  }

  const opts = { title, body: message, url: rawUrl || undefined, sendAfter };

  try {
    if (target.type === "all") {
      // « Tous » veut dire tous ceux qui n'ont pas dit non : le refus des
      // annonces est appliqué ici, pas seulement affiché dans le profil.
      const r = await sendAnnouncement(auth.admin, opts);
      await logAdminAction(auth.admin, auth.userId, "push_sent", {
        targetType: "push", targetId: r.id || (r.notificationIds || [])[0] || null,
        details: { scope: "all", title, scheduled: Boolean(sendAfter), recipients: r.recipients ?? null },
      });
      return res.status(200).json({ ok: true, recipients: r.recipients ?? null, scope: "all", optedOut: r.optedOut ?? null });
    }

    let userIds = [];
    if (target.type === "university" && target.university) {
      const { data, error } = await auth.admin
        .from("profiles").select("id").eq("university", target.university).eq("locked", false);
      if (error) return res.status(500).json({ error: "members_unreadable" });
      userIds = (data || []).map((r) => r.id);
    } else if (target.type === "users") {
      const picked = [...new Set((target.userIds || []).filter(Boolean).map(String))].slice(0, 2000);
      // Un compte suspendu ne reçoit plus rien, même désigné nommément. Par
      // paquets : 2000 identifiants dans une seule URL dépasseraient sa taille.
      for (let i = 0; i < picked.length; i += 150) {
        const { data, error } = await auth.admin
          .from("profiles").select("id").in("id", picked.slice(i, i + 150)).eq("locked", false);
        if (error) return res.status(500).json({ error: "members_unreadable" });
        userIds.push(...(data || []).map((r) => r.id));
      }
    } else {
      return res.status(400).json({ error: "invalid_target" });
    }

    if (!userIds.length) return res.status(400).json({ error: "empty_target" });

    const r = await sendPushToUsers(userIds, opts);
    await logAdminAction(auth.admin, auth.userId, "push_sent", {
      targetType: "push", targetId: (r.notificationIds || [])[0] || null,
      details: {
        scope: target.type, title, scheduled: Boolean(sendAfter), targeted: userIds.length,
        university: target.type === "university" ? target.university : undefined,
      },
    });
    return res.status(200).json({ ok: true, recipients: r.recipients ?? null, targeted: userIds.length, scope: target.type });
  } catch (error) {
    console.error("admin/push send failed:", error.message);
    return res.status(502).json({ error: "onesignal_rejected" });
  }
}
