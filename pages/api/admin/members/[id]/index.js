// Supprimer définitivement le compte d'un membre — DELETE { reason, confirm }.
//
// `confirm` doit reprendre le pseudo du membre : une friction volontaire
// contre le clic de trop. Ordre des opérations :
//   1. effacer TOUS ses fichiers (avatar, photos, pièces jointes) ;
//   2. seulement si l'effacement est complet, supprimer le compte en base
//      (admin_delete_account, v58 : journal anonyme + journal d'audit).
// Contrairement à la suppression par la personne elle-même, un échec de
// l'étape 1 arrête tout : on ne crée pas de fichiers orphelins d'un compte
// qui n'existe plus. L'admin peut simplement réessayer.
import { getClientIp, requireJson, setBaseSecurityHeaders } from "../../../../../lib/apiSecurity";
import { rateLimit } from "../../../../../lib/rateLimit";
import {
  loadTargetProfile, requireAdmin, sendAdminError,
} from "../../../../../lib/server/adminAuth";
import { countRemoved, purgeUserFiles } from "../../../../../lib/server/userFiles";
import {
  classifyAdminDbError, deletionConfirmed, isUuid, validateReason,
} from "../../../../../lib/adminModeration.mjs";

export default async function handler(req, res) {
  setBaseSecurityHeaders(res);
  if (req.method !== "DELETE") return res.status(405).json({ error: "Method not allowed" });
  if (!requireJson(req, res)) return;
  if (!rateLimit(`admin-member-delete:${getClientIp(req)}`, 10, 60_000).ok) {
    return res.status(429).json({ error: "rate_limited" });
  }

  const ctx = await requireAdmin(req, res, "admin/members/delete");
  if (!ctx) return;

  const targetId = String(req.query.id || "");
  if (!isUuid(targetId)) return sendAdminError(res, "invalid");
  const reason = validateReason(req.body?.reason);
  if (!reason.ok) return sendAdminError(res, reason.error);

  const target = await loadTargetProfile(ctx.admin, targetId);
  if (target.error) return sendAdminError(res, target.error);
  if (targetId === ctx.userId) return sendAdminError(res, "self_target");
  if (target.profile.is_admin) return sendAdminError(res, "admin_target");
  if (!deletionConfirmed(req.body?.confirm, target.profile.pseudo)) {
    return sendAdminError(res, "confirmation_mismatch");
  }

  const storage = await purgeUserFiles(ctx.admin, targetId);
  if (storage.failed.length) {
    console.error("admin/members/delete file purge incomplete", {
      removed: countRemoved(storage), failed: storage.failed.length,
    });
    return sendAdminError(res, "files_failed");
  }

  const { error } = await ctx.admin.rpc("admin_delete_account", {
    p_actor: ctx.userId, p_target: targetId, p_reason: reason.reason,
  });
  if (error) return sendAdminError(res, classifyAdminDbError(error));

  console.info("admin/members/delete completed", { files: countRemoved(storage) });
  return res.status(200).json({ ok: true, files: countRemoved(storage) });
}
