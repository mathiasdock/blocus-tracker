// Notifications automatiques, côté admin.
//
//   GET  → le catalogue (quand chaque notification part) fusionné avec les
//          réglages enregistrés, le plafond de relances, le dernier passage
//          du rappel du soir, le prochain, et les chiffres de chaque type
//   PUT  { key, … }        → activation et textes FR/EN d'UNE notification
//   PUT  { settings: { remindersWeeklyCap } } → plafond de relances (1 à 7)
//   POST { action: "dry-run" } → « Voir qui recevrait aujourd'hui » : le vrai
//          calcul du rappel du soir, sans rien écrire ni envoyer
//
// Service role + garde commune lib/server/adminAuth ; chaque enregistrement
// est tracé dans le journal d'audit. Erreurs : des codes stables.

import { getClientIp, setBaseSecurityHeaders } from "../../../lib/apiSecurity";
import { rateLimit } from "../../../lib/rateLimit";
import { AUTOMATIONS, AUTOMATION_BY_KEY, loadAutomations } from "../../../lib/pushAutomations.mjs";
import {
  DEFAULT_REMINDER_CAP, PUSH_BODY_MAX, PUSH_TITLE_MAX, REMINDER_CAP_MAX, REMINDER_CAP_MIN,
  cleanText, nextDailyRun, normalizeCap,
} from "../../../lib/notificationRules.mjs";
import { isSafeInternalHref } from "../../../lib/safeHref.mjs";
import { createNotificationStore } from "../../../lib/server/notify.mjs";
import { createActivityLoader, runDailyReminders } from "../../../lib/server/dailyReminders.mjs";
import { oneSignalFromEnv } from "../../../lib/server/oneSignalRest.mjs";
import { logAdminAction, requireAdmin } from "../../../lib/server/adminAuth";

async function automationStatus(admin) {
  const since30 = new Date(Date.now() - 30 * 864e5).toISOString();
  const since7 = new Date(Date.now() - 7 * 864e5).toISOString();
  const [settingsRes, runRes, stats30Res, stats7Res] = await Promise.all([
    admin.from("notification_settings").select("reminders_weekly_cap, updated_at").eq("id", true).maybeSingle(),
    admin.from("system_job_runs").select("started_at, finished_at, status, details")
      .eq("job", "push_daily").order("started_at", { ascending: false }).limit(1).maybeSingle(),
    admin.rpc("notification_kind_stats", { p_since: since30 }),
    admin.rpc("notification_kind_stats", { p_since: since7 }),
  ]);
  const byKind = {};
  for (const row of stats30Res.data || []) {
    byKind[row.kind] = { sends30d: row.sends, sent30d: row.sent, failed30d: row.failed, lastSentAt: row.last_sent_at, sent7d: 0, failed7d: 0 };
  }
  for (const row of stats7Res.data || []) {
    byKind[row.kind] = { ...(byKind[row.kind] || {}), sent7d: row.sent, failed7d: row.failed };
  }
  return {
    cap: settingsRes.data?.reminders_weekly_cap ?? DEFAULT_REMINDER_CAP,
    capRange: [REMINDER_CAP_MIN, REMINDER_CAP_MAX],
    capUpdatedAt: settingsRes.data?.updated_at ?? null,
    lastRun: runRes.data || null,
    nextRunAt: nextDailyRun(new Date()),
    stats: byKind,
    statsAvailable: !stats30Res.error,
  };
}

export default async function handler(req, res) {
  setBaseSecurityHeaders(res);
  if (!["GET", "PUT", "POST"].includes(req.method)) {
    return res.status(405).json({ error: "method_not_allowed" });
  }
  if (!rateLimit(`admin-automations:${getClientIp(req)}`, 40, 60_000).ok) {
    return res.status(429).json({ error: "rate_limited" });
  }

  const auth = await requireAdmin(req, res, "admin/push-automations");
  if (!auth) return;

  if (req.method === "GET") {
    const [settings, status] = await Promise.all([
      loadAutomations(auth.admin),
      automationStatus(auth.admin).catch(() => null),
    ]);
    return res.status(200).json({
      automations: AUTOMATIONS.map((a) => ({
        key: a.key,
        category: a.category,
        label: a.label,
        trigger: a.trigger,
        vars: a.vars,
        defaults: { title: a.title, body: a.body, url: a.url },
        current: settings[a.key],
      })),
      status,
    });
  }

  // ── Aperçu : qui recevrait le rappel ce soir ──────────────────────────────
  if (req.method === "POST") {
    if (req.body?.action !== "dry-run") return res.status(400).json({ error: "invalid" });
    if (!rateLimit(`admin-automations-dry:${auth.userId}`, 6, 60_000).ok) {
      return res.status(429).json({ error: "rate_limited" });
    }
    try {
      const summary = await runDailyReminders({
        store: createNotificationStore(auth.admin),
        onesignal: oneSignalFromEnv(),
        loadActivity: createActivityLoader(auth.admin),
        automations: await loadAutomations(auth.admin),
        dryRun: true,
        lookupPseudos: async (ids) => {
          const pseudos = new Map();
          for (let i = 0; i < ids.length; i += 150) {
            const { data } = await auth.admin.from("profiles").select("id, pseudo").in("id", ids.slice(i, i + 150));
            for (const row of data || []) pseudos.set(row.id, row.pseudo);
          }
          return pseudos;
        },
      });
      return res.status(200).json({ preview: summary });
    } catch (error) {
      console.error("admin/push-automations dry-run failed", { code: error?.code || "unknown" });
      return res.status(500).json({ error: "failed" });
    }
  }

  const body = req.body || {};

  // ── Plafond de relances ───────────────────────────────────────────────────
  if (body.settings) {
    const cap = normalizeCap(body.settings.remindersWeeklyCap);
    if (!cap) return res.status(400).json({ error: "invalid_cap" });
    const { error } = await auth.admin.from("notification_settings")
      .upsert({ id: true, reminders_weekly_cap: cap, updated_at: new Date().toISOString(), updated_by: auth.userId }, { onConflict: "id" });
    if (error) return res.status(500).json({ error: "save_failed" });
    await logAdminAction(auth.admin, auth.userId, "notification_settings_updated", {
      targetType: "notification_settings", targetId: "reminders_weekly_cap", details: { reminders_weekly_cap: cap },
    });
    return res.status(200).json({ ok: true, cap });
  }

  // ── Une notification automatique ──────────────────────────────────────────
  const def = AUTOMATION_BY_KEY[body.key];
  if (!def) return res.status(400).json({ error: "unknown_automation" });

  const url = String(body.url || "").trim();
  if (!isSafeInternalHref(url)) return res.status(400).json({ error: "invalid_link" });

  const titleFr = cleanText(body.titleFr, PUSH_TITLE_MAX);
  const bodyFr = cleanText(body.bodyFr, PUSH_BODY_MAX);
  if (!titleFr || !bodyFr) return res.status(400).json({ error: "title_required" });

  // Un jeton perdu à la réécriture donnerait « t'a envoyé une demande » sans
  // le prénom : on refuse plutôt que d'envoyer une phrase amputée.
  const titleEn = cleanText(body.titleEn, PUSH_TITLE_MAX) || def.title.en;
  const bodyEn = cleanText(body.bodyEn, PUSH_BODY_MAX) || def.body.en;
  for (const token of def.vars || []) {
    if (def.body.fr.includes(token) && !bodyFr.includes(token)) {
      return res.status(400).json({ error: "token_missing", token });
    }
    if (def.body.en.includes(token) && !bodyEn.includes(token)) {
      return res.status(400).json({ error: "token_missing", token });
    }
  }

  const { error } = await auth.admin.from("push_automations").upsert({
    key: def.key,
    enabled: body.enabled !== false,
    title_fr: titleFr,
    title_en: titleEn,
    body_fr: bodyFr,
    body_en: bodyEn,
    url: url || def.url,
    updated_at: new Date().toISOString(),
    updated_by: auth.userId,
  }, { onConflict: "key" });

  if (error) {
    console.error("admin/push-automations upsert failed", { code: error.code || "unknown" });
    return res.status(500).json({ error: "save_failed" });
  }
  await logAdminAction(auth.admin, auth.userId, "push_automation_updated", {
    targetType: "push_automation", targetId: def.key,
    details: { enabled: body.enabled !== false },
  });
  return res.status(200).json({ ok: true });
}
