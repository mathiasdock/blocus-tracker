// Suspendre ou réactiver un membre — POST { suspend: boolean, reason }.
//
// Une suspension a deux moitiés, faites dans un ordre qui ne laisse jamais un
// compte « à moitié libre » :
//   · la base (admin_set_suspension, v57) : plus aucune écriture, contenus
//     masqués aux autres, sortie des classements et des recherches ;
//   · Supabase Auth (bannissement) : plus de connexion ni de renouvellement
//     de session.
// Suspendre : la base d'abord (elle refuse un admin ou soi-même), puis Auth.
// Réactiver : Auth d'abord, puis la base ; si la base échoue, on rebannit.
// Un échec côté Auth après une suspension réussie en base est renvoyé à
// l'écran (authBlocked: false) et tracé : l'app déconnecte de toute façon un
// compte suspendu à son prochain chargement.
import { getClientIp, requireJson, setBaseSecurityHeaders } from "../../../../../lib/apiSecurity";
import { rateLimit } from "../../../../../lib/rateLimit";
import {
  loadTargetProfile, logAdminAction, requireAdmin, sendAdminError,
} from "../../../../../lib/server/adminAuth";
import { classifyAdminDbError, isUuid, validateReason } from "../../../../../lib/adminModeration.mjs";

// Suspension indéfinie : elle dure jusqu'à une réactivation manuelle.
const BAN_FOREVER = "876000h";

async function setAuthBan(admin, userId, banned) {
  const { error } = await admin.auth.admin.updateUserById(userId, {
    ban_duration: banned ? BAN_FOREVER : "none",
  });
  return error ? { ok: false, status: error.status || null } : { ok: true };
}

export default async function handler(req, res) {
  setBaseSecurityHeaders(res);
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  if (!requireJson(req, res)) return;
  if (!rateLimit(`admin-suspension:${getClientIp(req)}`, 20, 60_000).ok) {
    return res.status(429).json({ error: "rate_limited" });
  }

  const ctx = await requireAdmin(req, res, "admin/members/suspension");
  if (!ctx) return;

  const targetId = String(req.query.id || "");
  if (!isUuid(targetId)) return sendAdminError(res, "invalid");
  const suspend = req.body?.suspend;
  if (typeof suspend !== "boolean") return sendAdminError(res, "invalid");
  const reason = validateReason(req.body?.reason);
  if (!reason.ok) return sendAdminError(res, reason.error);

  const target = await loadTargetProfile(ctx.admin, targetId);
  if (target.error) return sendAdminError(res, target.error);
  if (targetId === ctx.userId) return sendAdminError(res, "self_target");
  if (target.profile.is_admin) return sendAdminError(res, "admin_target");

  if (suspend) {
    const { data, error } = await ctx.admin.rpc("admin_set_suspension", {
      p_actor: ctx.userId, p_target: targetId, p_suspend: true, p_reason: reason.reason,
    });
    if (error) return sendAdminError(res, classifyAdminDbError(error));

    const ban = await setAuthBan(ctx.admin, targetId, true);
    if (!ban.ok) {
      console.error("admin/members/suspension auth ban failed", { status: ban.status });
      await logAdminAction(ctx.admin, ctx.userId, "member_auth_ban_failed", {
        targetUserId: targetId, targetType: "user", targetId,
        details: { status: ban.status },
      });
    }
    return res.status(200).json({
      ok: true, suspended: true, changed: data?.changed !== false, authBlocked: ban.ok,
    });
  }

  const unban = await setAuthBan(ctx.admin, targetId, false);
  if (!unban.ok) {
    console.error("admin/members/suspension auth unban failed", { status: unban.status });
    return sendAdminError(res, "auth_failed");
  }
  const { data, error } = await ctx.admin.rpc("admin_set_suspension", {
    p_actor: ctx.userId, p_target: targetId, p_suspend: false, p_reason: reason.reason,
  });
  if (error) {
    // La base a refusé : on remet le bannissement pour rester cohérent.
    await setAuthBan(ctx.admin, targetId, true);
    return sendAdminError(res, classifyAdminDbError(error));
  }
  return res.status(200).json({
    ok: true, suspended: false, changed: data?.changed !== false, authBlocked: false,
  });
}
