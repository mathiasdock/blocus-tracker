// Rappels push quotidiens, declenches par un Vercel Cron (voir vercel.json).
//
// Un seul rappel par utilisateur et par jour, par ordre de priorite :
//   1. Examen demain      → "Ton examen est demain"
//   2. Serie en danger    → a etudie hier mais pas aujourd'hui
//   3. Nudge etude/planning → actif recemment mais pas etudie aujourd'hui
//
// Securite : appelable uniquement avec le secret cron (Vercel injecte
//   "Authorization: Bearer <CRON_SECRET>" quand CRON_SECRET est defini ;
//   on accepte aussi ?secret=<CRON_SECRET> pour un test manuel).
// Mode test : ?dry=1 → calcule et RENVOIE qui serait notifie, sans rien envoyer.
//
// Env vars requises (Vercel, server-only sauf NEXT_PUBLIC_*) :
//   NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
//   NEXT_PUBLIC_ONESIGNAL_APP_ID, ONESIGNAL_REST_API_KEY, CRON_SECRET
import { createClient } from "@supabase/supabase-js";
import { getClientIp, setBaseSecurityHeaders, timingSafeEqualText } from "../../../lib/apiSecurity";
import { rateLimit } from "../../../lib/rateLimit";
import { sendPushToUsers } from "../../../lib/pushServer";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const CRON_SECRET = process.env.CRON_SECRET;

const TZ = "Europe/Brussels";
const fmt = new Intl.DateTimeFormat("en-CA", { timeZone: TZ }); // → "YYYY-MM-DD"
const dayFrom = (msOffset) => fmt.format(new Date(Date.now() + msOffset));
const dayOf = (ts) => fmt.format(new Date(ts));

// Recupere toutes les lignes (PostgREST plafonne a 1000 → pagination).
async function fetchAll(query) {
  const rows = [];
  for (let from = 0; from < 200000; from += 1000) {
    const { data, error } = await query.range(from, from + 999);
    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < 1000) break;
  }
  return rows;
}

function authorized(req) {
  if (!CRON_SECRET) return false;
  const bearer = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  const q = typeof req.query.secret === "string" ? req.query.secret : "";
  return timingSafeEqualText(bearer, CRON_SECRET) || timingSafeEqualText(q, CRON_SECRET);
}

export default async function handler(req, res) {
  setBaseSecurityHeaders(res);
  if (req.method !== "GET" && req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  if (!rateLimit(`push-daily:${getClientIp(req)}`, 20, 60_000).ok) {
    return res.status(429).json({ error: "Too many requests" });
  }
  if (!authorized(req)) return res.status(401).json({ error: "Unauthorized" });
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    return res.status(500).json({ error: "Server misconfigured" });
  }

  const dry = req.query.dry === "1" || req.query.dry === "true";
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  try {
    const today = dayFrom(0);
    const tomorrow = dayFrom(864e5);
    const yesterday = dayFrom(-864e5);
    const day2 = dayFrom(-2 * 864e5);
    const day3 = dayFrom(-3 * 864e5);

    // 1. Examen demain → user_ids
    const exams = await fetchAll(
      admin.from("exams").select("user_id").eq("exam_date", tomorrow)
    );
    const examUsers = new Set(exams.map((e) => e.user_id).filter(Boolean));

    // 2. Sessions des 4 derniers jours → jours d'etude (heure de Bruxelles) par user
    const since = new Date(Date.now() - 4 * 864e5).toISOString();
    const sessions = await fetchAll(
      admin.from("sessions").select("user_id, started_at").gte("started_at", since)
    );
    const daysByUser = new Map();
    for (const s of sessions) {
      if (!s.user_id || !s.started_at) continue;
      let set = daysByUser.get(s.user_id);
      if (!set) daysByUser.set(s.user_id, (set = new Set()));
      set.add(dayOf(s.started_at));
    }

    // Repartition en groupes exclusifs (un seul rappel / user).
    const streakAtRisk = [];
    const studyNudge = [];
    for (const [uid, days] of daysByUser) {
      if (examUsers.has(uid)) continue;           // priorite a l'examen
      if (days.has(today)) continue;              // deja etudie aujourd'hui → rien
      if (days.has(yesterday)) { streakAtRisk.push(uid); continue; } // serie en danger
      if (days.has(day2) || days.has(day3)) studyNudge.push(uid);    // actif il y a 2-3j → nudge doux
      // >3 jours sans etudier : on ne relance pas (evite le harcelement).
    }
    const examList = [...examUsers];

    // Nudge alterne etude / planning selon le jour (variete anti-lassitude).
    const planningDay = parseInt(today.replace(/-/g, ""), 10) % 2 === 0;

    const MESSAGES = {
      exam: {
        title: { fr: "Ton examen est demain 📖", en: "Your exam is tomorrow 📖" },
        body: { fr: "Une dernière révision aujourd'hui, et tu seras prêt·e.", en: "One last review today and you're ready." },
        url: "/planning",
      },
      streak: {
        title: { fr: "Ta série est en danger 🔥", en: "Your streak is at risk 🔥" },
        body: { fr: "Tu n'as pas encore étudié aujourd'hui. Garde ta série !", en: "You haven't studied today yet. Keep your streak alive!" },
        url: "/dashboard",
      },
      nudge: planningDay
        ? {
            title: { fr: "Prépare ta journée 🗓️", en: "Plan your day 🗓️" },
            body: { fr: "Prends 2 minutes pour organiser ton planning de révision.", en: "Take 2 minutes to set up your study plan." },
            url: "/planning",
          }
        : {
            title: { fr: "C'est l'heure de réviser 📚", en: "Time to study 📚" },
            body: { fr: "Lance une petite session avant la fin de la journée.", en: "Start a quick session before the day ends." },
            url: "/dashboard",
          },
    };

    const summary = {
      date: today,
      counts: { exam: examList.length, streak: streakAtRisk.length, nudge: studyNudge.length },
      totalTargeted: examList.length + streakAtRisk.length + studyNudge.length,
    };

    if (dry) {
      return res.status(200).json({ dry: true, ...summary, nudgeVariant: planningDay ? "planning" : "study" });
    }

    // Envoi batché, résilient (un groupe qui échoue n'annule pas les autres).
    const sent = {};
    for (const [key, ids] of [["exam", examList], ["streak", streakAtRisk], ["nudge", studyNudge]]) {
      if (!ids.length) { sent[key] = { recipients: 0 }; continue; }
      try {
        const r = await sendPushToUsers(ids, MESSAGES[key]);
        sent[key] = { recipients: r.recipients, batches: r.batches };
      } catch (e) {
        sent[key] = { error: e?.message || "send-failed" };
      }
    }
    console.info("push/daily done", { date: today, counts: summary.counts, sent });
    return res.status(200).json({ ok: true, ...summary, sent });
  } catch (err) {
    console.error("push/daily error:", err?.message || err);
    return res.status(500).json({ error: "Daily push failed" });
  }
}
