// Réglages des notifications automatiques, côté admin.
//
//   GET  → le catalogue (quand chaque notification part) fusionné avec les
//          réglages enregistrés
//   PUT  → enregistre l'activation et les textes d'UNE notification
//
// Ces textes partent sur les téléphones de tous les membres : l'écriture est
// réservée au service role et passe par la garde commune lib/server/adminAuth,
// comme /api/admin/push. Chaque enregistrement est tracé dans le journal d'audit.
// Erreurs : des codes stables, traduits par la page admin.

import { getClientIp, setBaseSecurityHeaders } from "../../../lib/apiSecurity";
import { rateLimit } from "../../../lib/rateLimit";
import { AUTOMATIONS, AUTOMATION_BY_KEY, loadAutomations } from "../../../lib/pushAutomations";
import { logAdminAction, requireAdmin } from "../../../lib/server/adminAuth";
import { isSafeInternalHref } from "../../../lib/security";

const MAX_TITLE = 60;
const MAX_BODY = 160;

const clean = (v, max) => String(v || "").replace(/\s+/g, " ").trim().slice(0, max);

export default async function handler(req, res) {
  setBaseSecurityHeaders(res);
  if (req.method !== "GET" && req.method !== "PUT") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  const limited = rateLimit(`admin-automations:${getClientIp(req)}`, 40, 60_000);
  if (!limited.ok) return res.status(429).json({ error: "Too many requests" });

  const auth = await requireAdmin(req, res, "admin/push-automations");
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
  if (!def) return res.status(400).json({ error: "unknown_automation" });

  const url = String(body.url || "").trim();
  if (!isSafeInternalHref(url)) {
    return res.status(400).json({ error: "invalid_link" });
  }

  const titleFr = clean(body.titleFr, MAX_TITLE);
  const bodyFr = clean(body.bodyFr, MAX_BODY);
  if (!titleFr || !bodyFr) {
    return res.status(400).json({ error: "title_required" });
  }

  // Un jeton perdu à la réécriture donnerait « t'a envoyé une demande » sans
  // le prénom : on refuse plutôt que d'envoyer une phrase amputée.
  for (const token of def.vars || []) {
    if (def.body.fr.includes(token) && !bodyFr.includes(token)) {
      return res.status(400).json({ error: "token_missing", token });
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
    return res.status(500).json({ error: "save_failed" });
  }
  await logAdminAction(auth.admin, auth.userId, "push_automation_updated", {
    targetType: "push_automation", targetId: def.key,
    details: { enabled: body.enabled !== false },
  });
  return res.status(200).json({ ok: true });
}
