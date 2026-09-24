// Rappel du soir — orchestration, SERVEUR UNIQUEMENT.
//
// Appelé par le cron quotidien (/api/push/daily) et par l'aperçu admin
// « Voir qui recevrait aujourd'hui » (même code, dryRun = true : rien n'est
// écrit, rien n'est envoyé).
//
//   1. Activité récente : sessions des 5 derniers jours, examens proches,
//      inscrits d'il y a 3 jours → les membres « candidats ».
//   2. La base dit qui peut recevoir (compte, suspension, préférences) et
//      donne le fuseau de chacun, et ses relances des 7 derniers jours.
//   3. Le plan décide UN rappel par membre, dans son fuseau, hors heures
//      calmes (lib/notificationRules.mjs).
//   4. Automatique coupé, plafond de relances : exclus, comptés.
//   5. Un envoi par type via le point d'envoi unique, clé anti-doublon
//      « un rappel par membre et par jour » : relancer le cron le même jour
//      ne renvoie rien à ceux qui l'ont déjà reçu.

import {
  DEFAULT_REMINDER_CAP, REMINDER_KINDS, isCappedReminder, localCalendar, planReminders,
  reminderKey, shiftDate,
} from "../notificationRules.mjs";
import { dispatchNotification } from "./notify.mjs";

const DAY_MS = 864e5;
const MEMBERS_PREVIEW_LIMIT = 50;

async function fetchAll(buildQuery) {
  const rows = [];
  for (let from = 0; from < 200_000; from += 1000) {
    const { data, error } = await buildQuery().range(from, from + 999);
    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < 1000) break;
  }
  return rows;
}

/** Lecture de l'activité récente, avec le client service role. */
export function createActivityLoader(db) {
  return async function loadActivity(now) {
    const instant = now instanceof Date ? now : new Date(now);
    const since = new Date(instant.getTime() - 5 * DAY_MS).toISOString();
    const utcToday = instant.toISOString().slice(0, 10);
    const [sessions, exams, newcomers] = await Promise.all([
      fetchAll(() => db.from("sessions").select("user_id, started_at").gte("started_at", since).order("id")),
      // Tous les « demain » possibles, du Pacifique aux Amériques.
      fetchAll(() => db.from("exams").select("user_id, exam_date")
        .gte("exam_date", shiftDate(utcToday, -1)).lte("exam_date", shiftDate(utcToday, 2)).order("id")),
      // Fenêtre d'un jour : la relance des nouveaux ne part qu'une fois.
      fetchAll(() => db.from("profiles").select("id")
        .gte("created_at", new Date(instant.getTime() - 4 * DAY_MS).toISOString())
        .lt("created_at", new Date(instant.getTime() - 3 * DAY_MS).toISOString())
        .order("id")),
    ]);
    return { sessions, exams, newcomerIds: newcomers.map((row) => row.id) };
  };
}

function add(target, key, n = 1) {
  if (!n) return;
  target[key] = (target[key] || 0) + n;
}

/**
 * @param store       createNotificationStore(db)
 * @param onesignal   client OneSignal (ignoré en dryRun)
 * @param loadActivity(now) → { sessions, exams, newcomerIds }
 * @param automations loadAutomations(db) : { [kind]: { enabled, title, body, url } }
 * @param lookupPseudos(ids) → Map(id → pseudo)   (aperçu admin seulement)
 */
export async function runDailyReminders({
  store, onesignal, loadActivity, automations, now = new Date(), dryRun = false, lookupPseudos = null,
}) {
  const instant = now instanceof Date ? now : new Date(now);
  const activity = await loadActivity(instant);
  const candidates = [...new Set([
    ...activity.sessions.map((row) => row.user_id),
    ...activity.exams.map((row) => row.user_id),
    ...activity.newcomerIds,
  ].filter(Boolean))];

  const audience = candidates.length
    ? await store.audience({ category: "reminder", scope: "users", userIds: candidates })
    : [];
  const byId = new Map(audience.map((row) => [row.user_id, row]));
  const settings = await store.settings();
  const cap = settings.remindersWeeklyCap || DEFAULT_REMINDER_CAP;

  const members = new Map(audience
    .filter((row) => row.reason !== "missing")
    .map((row) => [row.user_id, { timezone: row.timezone }]));
  const { entries, skipped } = planReminders({
    now: instant,
    members,
    sessions: activity.sessions,
    exams: activity.exams,
    newcomerIds: activity.newcomerIds,
  });

  const groups = new Map(REMINDER_KINDS.map((kind) => [kind, []]));
  for (const entry of entries) {
    const row = byId.get(entry.userId);
    if (!row) continue;
    let reason = row.reason || null;
    if (!reason && automations[entry.kind]?.enabled === false) reason = "disabled";
    if (!reason && isCappedReminder(entry.kind, row.recent_reminders, cap)) reason = "frequency";
    groups.get(entry.kind)?.push({ ...row, reason, localDate: entry.localDate });
  }

  const summary = {
    date: localCalendar(instant, "Europe/Brussels").today,
    dryRun,
    cap,
    evaluated: candidates.length,
    planned: entries.length,
    skipped: { ...skipped },
    excluded: {},
    eligible: 0,
    sent: 0,
    failed: 0,
    kinds: {},
  };
  const previewIds = {};

  for (const [kind, rows] of groups) {
    if (!rows.length) continue;
    const conf = automations[kind];
    const result = await dispatchNotification({
      store,
      onesignal,
      now: instant,
      spec: {
        source: "automation",
        category: "reminder",
        kind,
        trigger: "cron:push_daily",
        target: { type: "automation" },
        audienceRows: rows,
        content: { title: conf.title, body: conf.body, url: conf.url },
        langs: ["fr", "en"],
        recipientKey: (row) => reminderKey(row.user_id, row.localDate),
        dryRun,
      },
    });
    const excluded = result.summary?.excluded || {};
    for (const [reason, n] of Object.entries(excluded)) add(summary.excluded, reason, n);
    const eligible = result.summary?.eligible || 0;
    const sent = result.counts?.sent || 0;
    const failed = result.counts?.failed || 0;
    summary.eligible += eligible;
    summary.sent += sent;
    summary.failed += failed;
    summary.kinds[kind] = {
      planned: rows.length,
      eligible,
      sent,
      failed,
      excluded,
      status: result.status,
      ...(result.sendId ? { sendId: result.sendId } : {}),
    };
    if (dryRun) previewIds[kind] = (result.eligibleRows || []).map((row) => row.user_id);
  }

  if (dryRun && lookupPseudos) {
    const ids = [...new Set(Object.values(previewIds).flat())];
    const pseudos = ids.length ? await lookupPseudos(ids.slice(0, 500)) : new Map();
    summary.members = Object.fromEntries(Object.entries(previewIds).map(([kind, list]) => [
      kind,
      {
        total: list.length,
        pseudos: list.slice(0, MEMBERS_PREVIEW_LIMIT).map((id) => pseudos.get(id)).filter(Boolean).sort((a, b) => a.localeCompare(b, "fr")),
      },
    ]));
  }
  return summary;
}

/** Détails du passage pour le journal des tâches : des compteurs, jamais un identifiant. */
export function jobRunDetails(summary) {
  return {
    date: summary.date,
    cap: summary.cap,
    evaluated: summary.evaluated,
    planned: summary.planned,
    eligible: summary.eligible,
    sent: summary.sent,
    failed: summary.failed,
    skipped: summary.skipped,
    excluded: summary.excluded,
    kinds: Object.fromEntries(Object.entries(summary.kinds).map(([kind, value]) => [kind, {
      planned: value.planned, eligible: value.eligible, sent: value.sent, failed: value.failed, status: value.status,
    }])),
  };
}
