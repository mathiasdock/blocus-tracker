// Rappel du soir — orchestration, SERVEUR UNIQUEMENT.
//
// Appelé par le cron quotidien (/api/push/daily) et par l'aperçu admin
// « Voir qui recevrait ce soir » (même code, dryRun = true : rien n'est
// écrit, rien n'est envoyé).
//
//   1. Données : sessions des 40 derniers jours (et l'historique complet des
//      séries en cours), jokers, examens de demain et de J+7, inscrits de
//      2 à 10 jours et ce qu'ils ont déjà configuré.
//   2. La base dit qui peut recevoir (compte, suspension, préférences) et
//      donne le fuseau de chacun ; le registre dit ce qui a déjà été envoyé.
//   3. Le plan (lib/eveningPlan.mjs) choisit UNE notification par membre.
//   4. Un envoi par type via le point d'envoi unique, textes personnalisés,
//      clé « un rappel par membre et par jour » : relancer le cron le même
//      soir ne renvoie rien.

import { localCalendar, reminderKey, shiftDate } from "../notificationRules.mjs";
import {
  EVENING_KINDS_ORDER, HISTORY_DAYS, NUDGE_WEEKLY_CAP, normalizeNudgeCap, planEvening, renderEveningContent,
} from "../eveningPlan.mjs";
import { dispatchNotification } from "./notify.mjs";

const DAY_MS = 864e5;
const MEMBERS_PREVIEW_LIMIT = 50;
const RECENT_DAYS = 40;
const STREAK_HISTORY_DAYS = 400;

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

async function inChunks(ids, run) {
  const out = [];
  for (let i = 0; i < ids.length; i += 200) out.push(...await run(ids.slice(i, i + 200)));
  return out;
}

/** Lecture des données du soir, avec le client service role. */
export function createActivityLoader(db) {
  return async function loadActivity(now) {
    const instant = now instanceof Date ? now : new Date(now);
    const utcToday = instant.toISOString().slice(0, 10);
    const [recent, exams, newcomers] = await Promise.all([
      fetchAll(() => db.from("sessions").select("user_id, started_at, duration_seconds")
        .gte("started_at", new Date(instant.getTime() - RECENT_DAYS * DAY_MS).toISOString()).order("id")),
      // Demain et J+7 pour tous les fuseaux, du Pacifique aux Amériques.
      fetchAll(() => db.from("exams").select("user_id, name, exam_date, exam_time")
        .gte("exam_date", shiftDate(utcToday, 0)).lte("exam_date", shiftDate(utcToday, 9)).order("id")),
      fetchAll(() => db.from("profiles").select("id, created_at")
        .gte("created_at", new Date(instant.getTime() - 10 * DAY_MS).toISOString())
        .lt("created_at", new Date(instant.getTime() - 47 * 36e5).toISOString())
        .order("id")),
    ]);

    // Séries en cours (une session ces 3 derniers jours) : leur série
    // officielle vient de la base ; l'historique ancien ne sert plus qu'à
    // l'activation.
    const streakIds = [...new Set(recent
      .filter((row) => instant.getTime() - new Date(row.started_at).getTime() < 3 * DAY_MS)
      .map((row) => row.user_id))];
    const since = new Date(instant.getTime() - STREAK_HISTORY_DAYS * DAY_MS).toISOString();
    const [older, frozen] = await Promise.all([
      inChunks(streakIds, (ids) => fetchAll(() => db.from("sessions").select("user_id, started_at, duration_seconds")
        .in("user_id", ids).gte("started_at", since)
        .lt("started_at", new Date(instant.getTime() - RECENT_DAYS * DAY_MS).toISOString()).order("id"))),
      inChunks(streakIds, (ids) => fetchAll(() => db.from("streak_freeze_days").select("user_id, used_on")
        .in("user_id", ids).order("used_on"))),
    ]);

    // Premier démarrage : a-t-il déjà ajouté un examen ou un objectif ?
    // (Les cours ne comptent pas : l'inscription en crée pour presque tous.)
    const newcomerIds = newcomers.map((row) => row.id);
    const [examOwners, objectiveOwners] = await Promise.all([
      inChunks(newcomerIds, (ids) => fetchAll(() => db.from("exams").select("user_id").in("user_id", ids).order("id"))),
      inChunks(newcomerIds, (ids) => fetchAll(() => db.from("objectives").select("user_id").in("user_id", ids).order("id"))),
    ]);

    const frozenDays = new Map();
    for (const row of frozen) {
      if (!frozenDays.has(row.user_id)) frozenDays.set(row.user_id, []);
      frozenDays.get(row.user_id).push(String(row.used_on).slice(0, 10));
    }

    // Série officielle (moteur canonique, v73) des séries en cours.
    const streakStates = new Map();
    for (let i = 0; i < streakIds.length; i += 200) {
      const { data, error } = await db.rpc("study_streak_reminder_states", {
        p_user_ids: streakIds.slice(i, i + 200), p_now: instant.toISOString(),
      });
      if (error) throw error;
      for (const row of data || []) {
        streakStates.set(row.user_id, {
          today: String(row.today).slice(0, 10),
          todayPreservesStreak: Boolean(row.today_preserves_streak),
          current: Number(row.current_streak) || 0,
        });
      }
    }
    return {
      sessions: [...recent, ...older],
      exams,
      newcomers,
      frozenDays,
      streakStates,
      configured: new Set([...examOwners, ...objectiveOwners].map((row) => row.user_id)),
    };
  };
}

function add(target, key, n = 1) {
  if (!n) return;
  target[key] = (target[key] || 0) + n;
}

/**
 * @param store       createNotificationStore(db)
 * @param onesignal   client OneSignal (ignoré en dryRun)
 * @param loadActivity(now) → { sessions, exams, newcomers, frozenDays, streakStates, configured }
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
    ...activity.newcomers.map((row) => row.id),
  ].filter(Boolean))];

  const [audience, history, settings] = await Promise.all([
    candidates.length ? store.audience({ category: "reminder", scope: "users", userIds: candidates }) : [],
    candidates.length
      ? store.history({ userIds: candidates, since: new Date(instant.getTime() - HISTORY_DAYS * DAY_MS).toISOString() })
      : [],
    store.settings(),
  ]);
  const byId = new Map(audience.map((row) => [row.user_id, row]));
  const cap = normalizeNudgeCap(settings.remindersWeeklyCap ?? NUDGE_WEEKLY_CAP);
  const createdAt = new Map(activity.newcomers.map((row) => [row.id, row.created_at]));

  const members = new Map(audience
    .filter((row) => row.reason !== "missing")
    .map((row) => [row.user_id, { timezone: row.timezone, reason: row.reason || null, createdAt: createdAt.get(row.user_id) || null }]));
  const enabled = Object.fromEntries(Object.entries(automations).map(([kind, conf]) => [kind, conf?.enabled !== false]));
  const { entries, skipped } = planEvening({
    now: instant,
    members,
    sessions: activity.sessions,
    frozenDays: activity.frozenDays,
    streakStates: activity.streakStates,
    exams: activity.exams,
    configured: activity.configured,
    history,
    cap,
    enabled,
  });

  const groups = new Map(EVENING_KINDS_ORDER.map((kind) => [kind, []]));
  const plannedSkips = { ...skipped };
  for (const entry of entries) {
    const row = byId.get(entry.userId);
    const conf = automations[entry.kind];
    if (!row || !conf) continue;
    // Texte final : rien ne part s'il manque une donnée (jamais inventée).
    const content = renderEveningContent(entry.kind, conf, entry.data);
    if (!content) { plannedSkips.nothing = (plannedSkips.nothing || 0) + 1; continue; }
    groups.get(entry.kind)?.push({ ...row, reason: entry.reason, localDate: entry.localDate, content });
  }

  const summary = {
    date: localCalendar(instant, "Europe/Brussels").today,
    dryRun,
    cap,
    evaluated: candidates.length,
    planned: [...groups.values()].reduce((sum, rows) => sum + rows.length, 0),
    skipped: plannedSkips,
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
        // Le registre garde le modèle ; le nom d'un examen ou la longueur
        // d'une série ne sont que dans la notification.
        logContent: { title: conf.title, body: conf.body, url: conf.url },
        contentFor: (row) => row.content,
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
