// Modération ciblée d'un profil — POST { action, reason }.
//
// Trois gestes seulement, chacun tracé dans le journal d'audit :
//   · reset_username : remplace le pseudo par un pseudo neutre (user_xxxxxxxx) ;
//   · clear_bio      : efface la bio ;
//   · remove_avatar  : efface la photo — le FICHIER d'abord (sinon il resterait
//                      en ligne), puis la référence en base.
// L'édition libre d'un profil par un admin n'existe plus (v56).
import { getClientIp, requireJson, setBaseSecurityHeaders } from "../../../../../lib/apiSecurity";
import { rateLimit } from "../../../../../lib/rateLimit";
import {
  loadTargetProfile, requireAdmin, sendAdminError,
} from "../../../../../lib/server/adminAuth";
import { purgeUserFiles } from "../../../../../lib/server/userFiles";
import {
  classifyAdminDbError, isModerationAction, isUuid, validateReason,
} from "../../../../../lib/adminModeration.mjs";

export default async function handler(req, res) {
  setBaseSecurityHeaders(res);
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  if (!requireJson(req, res)) return;
  if (!rateLimit(`admin-moderation:${getClientIp(req)}`, 30, 60_000).ok) {
    return res.status(429).json({ error: "rate_limited" });
  }

  const ctx = await requireAdmin(req, res, "admin/members/moderation");
  if (!ctx) return;

  const targetId = String(req.query.id || "");
  if (!isUuid(targetId)) return sendAdminError(res, "invalid");
  const action = req.body?.action;
  if (!isModerationAction(action)) return sendAdminError(res, "invalid");
  const reason = validateReason(req.body?.reason);
  if (!reason.ok) return sendAdminError(res, reason.error);

  const target = await loadTargetProfile(ctx.admin, targetId);
  if (target.error) return sendAdminError(res, target.error);
  if (targetId === ctx.userId || target.profile.is_admin) return sendAdminError(res, "admin_target");

  if (action === "remove_avatar") {
    const storage = await purgeUserFiles(ctx.admin, targetId, ["avatars"]);
    if (storage.failed.length) {
      console.error("admin/members/moderation avatar purge failed", { failed: storage.failed.length });
      return sendAdminError(res, "files_failed");
    }
  }

  const { data, error } = await ctx.admin.rpc("admin_moderate_profile", {
    p_actor: ctx.userId, p_target: targetId, p_action: action, p_reason: reason.reason,
  });
  if (error) return sendAdminError(res, classifyAdminDbError(error));

  return res.status(200).json({ ok: true, action, pseudo: data?.pseudo || null });
}
