// Rappel du soir, déclenché chaque jour par le cron Vercel (vercel.json,
// 18 h UTC). Toute la décision vit dans lib/server/dailyReminders.mjs :
// un rappel par membre et par jour, dans son fuseau, hors heures calmes,
// préférences et suspension respectées, plafond de relances sur 7 jours,
// anti-doublon — le relancer le même jour ne renvoie rien.
//
// Sécurité : secret cron uniquement (Vercel envoie « Authorization: Bearer
// <CRON_SECRET> »). Mode test : ?dry=1 calcule sans rien écrire ni envoyer.
// Chaque vrai passage est inscrit dans system_job_runs (page Système).
//
// Env : NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
//       NEXT_PUBLIC_ONESIGNAL_APP_ID, ONESIGNAL_REST_API_KEY, CRON_SECRET
import { createClient } from "@supabase/supabase-js";
import { getClientIp, setBaseSecurityHeaders, timingSafeEqualText } from "../../../lib/apiSecurity";
import { rateLimit } from "../../../lib/rateLimit";
import { loadAutomations } from "../../../lib/pushAutomations.mjs";
import { createNotificationStore } from "../../../lib/server/notify.mjs";
import { createActivityLoader, jobRunDetails, runDailyReminders } from "../../../lib/server/dailyReminders.mjs";
import { oneSignalFromEnv } from "../../../lib/server/oneSignalRest.mjs";
import { finishJobRun, startJobRun } from "../../../lib/server/jobRuns";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const CRON_SECRET = process.env.CRON_SECRET;

function authorized(req) {
  if (!CRON_SECRET) return false;
  const bearer = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  return timingSafeEqualText(bearer, CRON_SECRET);
}

export default async function handler(req, res) {
  setBaseSecurityHeaders(res);
  if (req.method !== "GET" && req.method !== "POST") {
    return res.status(405).json({ error: "method_not_allowed" });
  }
  if (!rateLimit(`push-daily:${getClientIp(req)}`, 20, 60_000).ok) {
    return res.status(429).json({ error: "rate_limited" });
  }
  if (!authorized(req)) return res.status(401).json({ error: "unauthorized" });
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) return res.status(500).json({ error: "misconfigured" });

  const dry = req.query.dry === "1" || req.query.dry === "true";
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const runId = dry ? null : await startJobRun(admin, "push_daily");

  try {
    const summary = await runDailyReminders({
      store: createNotificationStore(admin),
      onesignal: oneSignalFromEnv(),
      loadActivity: createActivityLoader(admin),
      automations: await loadAutomations(admin),
      dryRun: dry,
    });
    const details = jobRunDetails(summary);
    if (!dry) await finishJobRun(admin, runId, summary.failed > 0 ? "error" : "ok", details);
    console.info("push/daily done", { dry, date: details.date, sent: details.sent, failed: details.failed });
    return res.status(200).json({ ok: true, dry, ...details });
  } catch (error) {
    console.error("push/daily failed", { code: error?.code || "unknown" });
    await finishJobRun(admin, runId, "error", { stage: "prepare", error: error?.code || "unknown" });
    return res.status(500).json({ error: "daily_failed" });
  }
}
