// Notifications push de l'admin — Communications.
//
//   GET                         → abonnements OneSignal (chiffres de l'app) + écoles ciblables
//   POST { action: "preview" }  → qui recevrait : ciblés, exclus (préférence,
//                                 suspension…), éligibles, appareils connus
//   POST { action: "send" }     → envoi (ou envoi programmé) FR/EN
//   POST { action: "test" }     → « M'envoyer un test » : à l'admin seul
//   POST { action: "announcement", announcementId } → pousse une annonce
//   POST { action: "delivery", sendId } → relit la livraison chez OneSignal
//   DELETE ?id=<envoi>          → annule un envoi programmé
//
// Tout passe par le point d'envoi unique (lib/server/notify.mjs) : comptes
// Blocus Tracker éligibles seulement (jamais un segment OneSignal), refus des
// annonces appliqué à TOUS les ciblages, suspendus et comptes supprimés
// exclus, registre + journal d'audit. Garde commune lib/server/adminAuth
// (jeton vérifié, admin non suspendu). Erreurs : des codes stables.

import { getClientIp, setBaseSecurityHeaders } from "../../../lib/apiSecurity";
import { rateLimit } from "../../../lib/rateLimit";
import {
  announcementPushContent, isUuidLike, parseAdminTarget, validatePushContent, validateSchedule,
} from "../../../lib/notificationRules.mjs";
import {
  cancelScheduledSend, createNotificationStore, dispatchNotification, refreshDelivery,
} from "../../../lib/server/notify.mjs";
import { oneSignalFromEnv } from "../../../lib/server/oneSignalRest.mjs";
import { logAdminAction, requireAdmin } from "../../../lib/server/adminAuth";

// Une notification part sur des téléphones et ne se rattrape pas : on
// plafonne bas plutôt que de laisser un clic répété partir cinq fois.
const SEND_LIMIT = { max: 6, windowMs: 10 * 60 * 1000 };
const TEST_LIMIT = { max: 5, windowMs: 10 * 60 * 1000 };

// Écoles ciblables : celles des membres non suspendus (admins exclus), avec
// leur nombre de membres. Comptées ici : la page ne charge jamais la liste.
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

function targetLabel(target) {
  if (target.type === "university") return target.university;
  if (target.type === "users") return String(target.userIds.length);
  return null;
}

// L'aperçu d'un envoi : aucun identifiant, seulement des comptes.
function previewPayload(result) {
  const { targeted, excluded, eligible, reachable, devices } = result.summary;
  return { targeted, excluded, eligible, reachable, devices };
}

export default async function handler(req, res) {
  setBaseSecurityHeaders(res);
  if (!["GET", "POST", "DELETE"].includes(req.method)) {
    return res.status(405).json({ error: "method_not_allowed" });
  }
  if (!rateLimit(`admin-push:${getClientIp(req)}`, 60, 60_000).ok) {
    return res.status(429).json({ error: "rate_limited" });
  }

  const auth = await requireAdmin(req, res, "admin/push");
  if (!auth) return;
  const store = createNotificationStore(auth.admin);
  const onesignal = oneSignalFromEnv();

  // ── Lecture ───────────────────────────────────────────────────────────────
  if (req.method === "GET") {
    const [app, universities] = await Promise.all([
      onesignal.app().catch(() => null),
      listTargetUniversities(auth.admin).catch(() => []),
    ]);
    // Le chiffre OneSignal compte des appareils, tous comptes confondus ; son
    // absence ne bloque rien (l'audience réelle vient de la base).
    return res.status(200).json({ configured: onesignal.configured, app, universities });
  }

  // ── Annulation d'un envoi programmé ───────────────────────────────────────
  if (req.method === "DELETE") {
    const id = String(req.query.id || "").trim();
    if (!isUuidLike(id)) return res.status(400).json({ error: "invalid" });
    try {
      const { send } = await cancelScheduledSend({ store, onesignal, sendId: id });
      await logAdminAction(auth.admin, auth.userId, "push_cancelled", {
        targetType: "push", targetId: id, details: { title: send?.title?.fr || null },
      });
      return res.status(200).json({ ok: true });
    } catch (error) {
      const code = error?.code === "not_cancellable" || error?.code === "not_found" ? error.code : "cancel_refused";
      return res.status(code === "not_found" ? 404 : 409).json({ error: code });
    }
  }

  const body = req.body || {};
  const action = body.action;

  // ── Livraison relue chez OneSignal ────────────────────────────────────────
  if (action === "delivery") {
    if (!isUuidLike(body.sendId)) return res.status(400).json({ error: "invalid" });
    try {
      const { delivery } = await refreshDelivery({ store, onesignal, sendId: body.sendId });
      return res.status(200).json({ delivery });
    } catch (error) {
      return res.status(502).json({ error: error?.code === "not_found" ? "not_found" : "onesignal_unreachable" });
    }
  }

  // ── Aperçu : qui recevrait ────────────────────────────────────────────────
  if (action === "preview") {
    const parsed = parseAdminTarget(body.target);
    if (!parsed.ok) return res.status(400).json({ error: parsed.error });
    try {
      const result = await dispatchNotification({
        store, onesignal,
        spec: {
          source: "admin", category: "announcement", kind: "admin_message", trigger: "admin:composer",
          target: parsed.target, content: null, dryRun: true,
        },
      });
      return res.status(200).json({ audience: previewPayload(result) });
    } catch (_) {
      return res.status(500).json({ error: "members_unreadable" });
    }
  }

  // ── Test à soi-même ───────────────────────────────────────────────────────
  if (action === "test") {
    if (!rateLimit(`admin-push-test:${auth.userId}`, TEST_LIMIT.max, TEST_LIMIT.windowMs).ok) {
      return res.status(429).json({ error: "rate_limited" });
    }
    const content = validatePushContent(body.content);
    if (!content.ok) return res.status(400).json({ error: content.error });
    try {
      const result = await dispatchNotification({
        store, onesignal,
        spec: {
          source: "admin", category: "test", kind: "admin_test", trigger: "admin:test",
          authorId: auth.userId, target: { type: "self", userIds: [auth.userId], label: null },
          content: content.content, langs: content.langs, recordEmpty: true,
          recipientKey: null,
        },
      });
      await logAdminAction(auth.admin, auth.userId, "push_test_sent", {
        targetType: "push", targetId: result.sendId || null,
        details: { title: content.content.title.fr, status: result.status },
      });
      return res.status(200).json({ ok: true, status: result.status, reachable: (result.counts?.sent || 0) > 0 });
    } catch (error) {
      return res.status(502).json({ error: error?.code === "onesignal_unconfigured" ? "onesignal_unconfigured" : "onesignal_rejected" });
    }
  }

  // ── Envoi (manuel ou annonce poussée) ─────────────────────────────────────
  if (action !== "send" && action !== "announcement") return res.status(400).json({ error: "invalid" });
  if (!rateLimit(`admin-push-send:${auth.userId}`, SEND_LIMIT.max, SEND_LIMIT.windowMs).ok) {
    return res.status(429).json({ error: "rate_limited" });
  }

  let payload;          // { content: { title, body, url }, langs }
  let target;
  let sendAfter = null;
  let announcementId = null;
  let kind = "admin_message";
  let trigger = "admin:composer";

  if (action === "announcement") {
    if (!isUuidLike(body.announcementId)) return res.status(400).json({ error: "invalid" });
    const { data: row, error } = await auth.admin.from("app_announcements")
      .select("id, title, message, title_en, message_en, href, is_active, starts_at, ends_at, audience, audience_university")
      .eq("id", body.announcementId).maybeSingle();
    if (error) return res.status(500).json({ error: "failed" });
    if (!row) return res.status(404).json({ error: "not_found" });
    if (!row.is_active || (row.ends_at && new Date(row.ends_at).getTime() <= Date.now())) {
      return res.status(409).json({ error: "announcement_inactive" });
    }
    const pushed = announcementPushContent(row);
    payload = { content: { title: pushed.title, body: pushed.body, url: pushed.url }, langs: pushed.langs };
    target = row.audience === "university"
      ? { type: "university", university: row.audience_university }
      : { type: "all" };
    // Une annonce qui commence plus tard : la notification part à sa date.
    if (row.starts_at && new Date(row.starts_at).getTime() > Date.now() + 60_000) {
      const schedule = validateSchedule(row.starts_at);
      if (!schedule.ok) return res.status(400).json({ error: schedule.error });
      sendAfter = schedule.sendAfter;
    }
    announcementId = row.id;
    kind = "announcement";
    trigger = "admin:announcement";
  } else {
    const validated = validatePushContent(body.content);
    if (!validated.ok) return res.status(400).json({ error: validated.error });
    const parsed = parseAdminTarget(body.target);
    if (!parsed.ok) return res.status(400).json({ error: parsed.error });
    const schedule = validateSchedule(body.sendAfter);
    if (!schedule.ok) return res.status(400).json({ error: schedule.error });
    payload = { content: validated.content, langs: validated.langs };
    target = parsed.target;
    sendAfter = schedule.sendAfter;
  }

  // Un identifiant de requête fourni par la page : un double clic ou un
  // nouvel essai après une coupure réseau ne part qu'une fois.
  const requestId = isUuidLike(body.requestId) ? body.requestId : null;
  const idempotencyKey = announcementId ? `announcement:${announcementId}` : requestId ? `admin:${requestId}` : null;

  try {
    const result = await dispatchNotification({
      store, onesignal,
      spec: {
        source: "admin", category: "announcement", kind, trigger,
        authorId: auth.userId, announcementId,
        target: { ...target, label: targetLabel(target) },
        content: payload.content, langs: payload.langs,
        sendAfter, idempotencyKey, recordEmpty: true,
        recipientKey: null,
      },
    });
    if (result.duplicate) {
      return res.status(200).json({ ok: true, duplicate: true, status: result.status, sendId: result.sendId });
    }
    await logAdminAction(auth.admin, auth.userId, "push_sent", {
      targetType: announcementId ? "announcement" : "push",
      targetId: announcementId || result.sendId || null,
      details: {
        scope: target.type,
        university: target.type === "university" ? target.university : undefined,
        title: payload.content.title.fr,
        scheduled: Boolean(sendAfter),
        targeted: result.summary?.targeted ?? null,
        eligible: result.summary?.eligible ?? null,
        recipients: result.counts?.sent ?? 0,
        status: result.status,
      },
    });
    return res.status(200).json({
      ok: true,
      status: result.status,
      sendId: result.sendId,
      audience: previewPayload(result),
      counts: result.counts || null,
    });
  } catch (error) {
    console.error("admin/push send failed", { code: error?.code || "unknown" });
    const code = error?.code === "onesignal_unconfigured" ? "onesignal_unconfigured"
      : error?.code === "audience_failed" ? "members_unreadable"
      : "onesignal_rejected";
    return res.status(502).json({ error: code });
  }
}
