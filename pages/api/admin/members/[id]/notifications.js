// Fiche membre admin : l'appareil est-il vraiment joignable ? — GET.
//
// Lecture seule, chez OneSignal, pour UN compte : ses abonnements push
// (type de navigateur, actif ou non, dernière activité). Les préférences, les
// appareils déclarés et les derniers envois viennent de la base
// (admin_member_notifications, v62) ; cette route ne fait que la partie que
// seul OneSignal connaît. Jamais de jeton d'abonnement dans la réponse.
import { getClientIp, setBaseSecurityHeaders } from "../../../../../lib/apiSecurity";
import { rateLimit } from "../../../../../lib/rateLimit";
import { isUuid } from "../../../../../lib/adminModeration.mjs";
import { requireAdmin } from "../../../../../lib/server/adminAuth";
import { oneSignalFromEnv } from "../../../../../lib/server/oneSignalRest.mjs";

export default async function handler(req, res) {
  setBaseSecurityHeaders(res);
  if (req.method !== "GET") return res.status(405).json({ error: "method_not_allowed" });
  if (!rateLimit(`admin-member-push:${getClientIp(req)}`, 30, 60_000).ok) {
    return res.status(429).json({ error: "rate_limited" });
  }
  const auth = await requireAdmin(req, res, "admin/members/notifications");
  if (!auth) return;

  const userId = String(req.query.id || "");
  if (!isUuid(userId)) return res.status(400).json({ error: "invalid" });

  const onesignal = oneSignalFromEnv();
  if (!onesignal.configured) return res.status(200).json({ checked: false, reason: "unconfigured" });
  try {
    const result = await onesignal.viewUser(userId);
    const active = result.subscriptions.filter((sub) => sub.enabled);
    return res.status(200).json({
      checked: true,
      found: result.found,
      reachable: active.length > 0,
      subscriptions: result.subscriptions,
      checkedAt: new Date().toISOString(),
    });
  } catch (error) {
    return res.status(200).json({ checked: false, reason: error?.code || "onesignal_unreachable" });
  }
}
