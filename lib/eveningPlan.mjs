// Rappel du soir — le PLAN, en logique pure (ni base, ni réseau).
//
// Pour chaque membre, dans SON fuseau horaire, UNE notification au plus par
// soir, la première applicable dans cet ordre :
//   1. examen demain            (fait)
//   2. examen dans 7 jours      (fait — fenêtre unique : jamais sacrifié à une relance)
//   3. série en danger          (relance)
//   4. premier démarrage        (relance, une fois dans la vie du compte)
//   5. second démarrage         (relance, une fois dans la vie du compte)
//   6. reprise après 7 jours    (relance, une fois par absence)
//   7. reprise après 21 jours   (relance, une fois par absence, puis STOP)
//
// Un fait (un examen existe) n'est jamais plafonné. Une relance l'est :
// 2 au plus sur 7 jours glissants, jamais la même deux soirs de suite, et
// aucune le soir où le membre a déjà étudié. Une relance bloquée (plafond,
// coupée par l'admin) laisse la place au type suivant.
//
// « Vraie session » = 10 minutes ou plus. La SÉRIE, elle, se compte
// exactement comme dans Stats (lib/format.js computeStreak) : tout jour avec
// une session, quelle qu'en soit la durée, plus les jours gelés par un joker.
// Le champ « en train d'étudier » (profiles.studying_since) n'est jamais lu.
//
// Le plan s'appuie sur l'historique du registre (notification_recipients) :
// ce qui a déjà été envoyé décide du reste. Aucune donnée inventée : sans
// examen, pas de notification d'examen ; sans série réelle, pas de série.

import { cleanText, isQuietHour, localCalendar, shiftDate, PUSH_TITLE_MAX } from "./notificationRules.mjs";

export const REAL_SESSION_SECONDS = 600;
export const STREAK_MIN_DAYS = 3;
// Au plus 2 relances sur 7 jours glissants (réglable plus bas, pas plus haut).
export const NUDGE_WEEKLY_CAP = 2;
export const NUDGE_CAP_MIN = 1;
const HOUR_MS = 36e5;
const DAY_MS = 864e5;
// Premier démarrage : à partir de 48 h après l'inscription. La fenêtre va
// jusqu'à 96 h pour qu'un passage du cron en retard (Vercel : à l'heure près)
// ne fasse pas sauter l'unique envoi ; le registre garantit « une seule fois ».
export const FIRST_ACTIVATION_HOURS = [48, 96];
export const SECOND_ACTIVATION_HOURS = [168, 240];
// Jours (calendrier du membre) depuis la dernière vraie session.
export const REACTIVATION_7D_DAYS = [7, 13];
export const REACTIVATION_21D_DAYS = [21, 34];
// Entre deux cycles de reprise : au moins 30 jours, pour qu'un membre qui
// étudie une fois par semaine ne reçoive pas « on reprend ? » chaque semaine.
export const REACTIVATION_COOLDOWN_DAYS = 30;
// Profondeur de l'historique lu dans le registre (il garde 180 jours).
export const HISTORY_DAYS = 60;

// Ordre de priorité (les deux variantes du premier démarrage : même place).
export const EVENING_KINDS_ORDER = Object.freeze([
  "exam_tomorrow", "exam_in_7_days", "streak_at_risk", "first_activation_plan", "first_activation_start",
  "second_activation", "reactivation_7d", "reactivation_21d",
]);
export const FACT_KINDS = Object.freeze(["exam_tomorrow", "exam_in_7_days"]);
export const FIRST_ACTIVATION_KINDS = Object.freeze(["first_activation_plan", "first_activation_start"]);
export const NUDGE_KINDS = Object.freeze([
  "streak_at_risk", ...FIRST_ACTIVATION_KINDS, "second_activation", "reactivation_7d", "reactivation_21d",
]);
// Anciennes relances (avant la V1) : elles comptent encore dans le plafond.
export const LEGACY_NUDGE_KINDS = Object.freeze(["nudge_planning", "nudge_study", "comeback_day3"]);
const REACTIVATION_KINDS = ["reactivation_7d", "reactivation_21d"];

const time = (value) => new Date(value).getTime();

/**
 * Série telle que Stats l'affiche, vue d'un soir SANS session aujourd'hui :
 * jours consécutifs en remontant depuis hier.
 * @param days Set de dates locales "YYYY-MM-DD" (sessions de toute durée + jours gelés)
 */
export function streakBefore(days, today) {
  let streak = 0;
  let day = shiftDate(today, -1);
  while (streak < 366 && days.has(day)) {
    streak += 1;
    day = shiftDate(day, -1);
  }
  return streak;
}

/** Jours de calendrier entre deux dates locales "YYYY-MM-DD". */
export function daysBetween(fromDate, toDate) {
  return Math.round((Date.parse(`${toDate}T00:00:00Z`) - Date.parse(`${fromDate}T00:00:00Z`)) / DAY_MS);
}

export function normalizeNudgeCap(value) {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return NUDGE_WEEKLY_CAP;
  return Math.min(NUDGE_WEEKLY_CAP, Math.max(NUDGE_CAP_MIN, n));
}

function groupBy(list, keyOf) {
  const out = new Map();
  for (const item of list) {
    const key = keyOf(item);
    if (!key) continue;
    if (!out.has(key)) out.set(key, []);
    out.get(key).push(item);
  }
  return out;
}

/**
 * @param now
 * @param members    Map(userId → { timezone, createdAt?, reason? }) — reason :
 *                   exclusion décidée par la base (préférences, suspension)
 * @param sessions   [{ user_id, started_at, duration_seconds }]
 * @param frozenDays Map(userId → ["YYYY-MM-DD"])   jokers utilisés
 * @param exams      [{ user_id, name, exam_date, exam_time }]
 * @param configured Set(userId) : a déjà ajouté un examen ou un objectif
 * @param history    [{ user_id, kind, created_at }] rappels envoyés (registre)
 * @param cap        plafond de relances sur 7 jours (≤ 2)
 * @param enabled    { [kind]: false } pour un type coupé dans l'admin
 * @returns { entries: [{ userId, kind, localDate, reason, data }], skipped }
 *   Une entrée avec `reason` est comptée comme exclue sous son type.
 */
export function planEvening({
  now, members, sessions = [], frozenDays = new Map(), exams = [], configured = new Set(),
  history = [], cap = NUDGE_WEEKLY_CAP, enabled = {},
}) {
  const instant = now instanceof Date ? now : new Date(now);
  const nowMs = instant.getTime();
  const nudgeCap = normalizeNudgeCap(cap);
  const sessionsBy = groupBy(sessions, (row) => row?.started_at && row.user_id);
  const examsBy = groupBy(exams, (row) => row?.exam_date && row.user_id);
  const historyBy = groupBy(history, (row) => row?.created_at && row.user_id);

  const entries = [];
  const skipped = { quiet_hours: 0, already_sent: 0, nothing: 0 };

  for (const [userId, member] of members) {
    const cal = localCalendar(instant, member?.timezone);
    if (isQuietHour(cal.hour)) { skipped.quiet_hours += 1; continue; }

    const sent = historyBy.get(userId) || [];
    if (sent.some((row) => cal.dayOf(row.created_at) === cal.today)) { skipped.already_sent += 1; continue; }

    const own = sessionsBy.get(userId) || [];
    const days = new Set(own.map((row) => cal.dayOf(row.started_at)));
    for (const day of frozenDays.get(userId) || []) days.add(String(day).slice(0, 10));
    const studiedToday = days.has(cal.today);
    const real = own.filter((row) => Number(row.duration_seconds) >= REAL_SESSION_SECONDS);
    const lastRealMs = real.reduce((max, row) => Math.max(max, time(row.started_at)), 0);
    const lastRealDay = lastRealMs ? cal.dayOf(lastRealMs) : null;
    const ageHours = member?.createdAt ? (nowMs - time(member.createdAt)) / HOUR_MS : null;
    const sentKinds = (kinds, sinceMs = 0) => sent.some((row) => kinds.includes(row.kind) && time(row.created_at) > sinceMs);
    const examsOn = (date) => (examsBy.get(userId) || [])
      .filter((row) => String(row.exam_date).slice(0, 10) === date)
      .sort((a, b) => String(a.exam_time || "99").localeCompare(String(b.exam_time || "99")) || String(a.name).localeCompare(String(b.name)))
      .map((row) => ({ name: row.name, time: row.exam_time || null }));

    // Candidats, du plus prioritaire au moins prioritaire.
    const candidates = [];
    const tomorrow = examsOn(cal.tomorrow);
    if (tomorrow.length) candidates.push({ kind: "exam_tomorrow", data: { exams: tomorrow } });
    const nextWeek = examsOn(shiftDate(cal.today, 7));
    if (nextWeek.length) candidates.push({ kind: "exam_in_7_days", data: { exams: nextWeek } });
    if (!studiedToday) {
      const streak = streakBefore(days, cal.today);
      if (streak >= STREAK_MIN_DAYS) candidates.push({ kind: "streak_at_risk", data: { days: streak } });
    }
    if (!studiedToday && !lastRealMs && ageHours !== null) {
      if (ageHours >= FIRST_ACTIVATION_HOURS[0] && ageHours < FIRST_ACTIVATION_HOURS[1]
        && !sentKinds(FIRST_ACTIVATION_KINDS)) {
        candidates.push({ kind: configured.has(userId) ? "first_activation_start" : "first_activation_plan", data: {} });
      }
      if (ageHours >= SECOND_ACTIVATION_HOURS[0] && ageHours < SECOND_ACTIVATION_HOURS[1]
        && sentKinds(FIRST_ACTIVATION_KINDS) && !sentKinds(["second_activation"])) {
        candidates.push({ kind: "second_activation", data: {} });
      }
    }
    if (!studiedToday && lastRealDay) {
      const away = daysBetween(lastRealDay, cal.today);
      const sevenSent = sentKinds(["reactivation_7d"], lastRealMs);
      if (away >= REACTIVATION_7D_DAYS[0] && away <= REACTIVATION_7D_DAYS[1] && !sevenSent
        && !sentKinds(REACTIVATION_KINDS, nowMs - REACTIVATION_COOLDOWN_DAYS * DAY_MS)) {
        candidates.push({ kind: "reactivation_7d", data: {} });
      }
      if (away >= REACTIVATION_21D_DAYS[0] && away <= REACTIVATION_21D_DAYS[1] && sevenSent
        && !sentKinds(["reactivation_21d"], lastRealMs)) {
        candidates.push({ kind: "reactivation_21d", data: {} });
      }
    }

    if (!candidates.length) { skipped.nothing += 1; continue; }

    // Exclu par la base (préférences, suspension) : compté sous ce qu'il
    // aurait reçu, jamais envoyé.
    if (member?.reason) {
      entries.push({ userId, kind: candidates[0].kind, localDate: cal.today, reason: member.reason, data: candidates[0].data });
      continue;
    }

    const recentNudges = sent.filter((row) => (NUDGE_KINDS.includes(row.kind) || LEGACY_NUDGE_KINDS.includes(row.kind))
      && time(row.created_at) > nowMs - 7 * DAY_MS).length;
    let blocked = null;
    let chosen = null;
    for (const candidate of candidates) {
      let reason = null;
      if (enabled[candidate.kind] === false) reason = "disabled";
      else if (NUDGE_KINDS.includes(candidate.kind)) {
        const sameYesterday = sent.some((row) => row.kind === candidate.kind && cal.dayOf(row.created_at) === cal.yesterday);
        if (recentNudges >= nudgeCap || sameYesterday) reason = "frequency";
      }
      if (!reason) { chosen = candidate; break; }
      if (!blocked) blocked = { ...candidate, reason };
    }
    if (chosen) entries.push({ userId, kind: chosen.kind, localDate: cal.today, reason: null, data: chosen.data });
    else entries.push({ userId, kind: blocked.kind, localDate: cal.today, reason: blocked.reason, data: blocked.data });
  }
  return { entries, skipped };
}

// ── Textes personnalisés ───────────────────────────────────────────────────
function cut(text, max) {
  const value = cleanText(text, 500);
  return value.length <= max ? value : `${value.slice(0, max - 1).trimEnd()}…`;
}

/** « 9 h », « 9 h 30 » / « 9 am », « 9:30 am », « 12 pm ». */
export function formatExamTime(value, lang) {
  const match = /^(\d{1,2}):(\d{2})/.exec(String(value || ""));
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  if (lang === "en") {
    const h12 = hours % 12 || 12;
    return `${h12}${minutes ? `:${String(minutes).padStart(2, "0")}` : ""} ${hours < 12 ? "am" : "pm"}`;
  }
  return `${hours} h${minutes ? ` ${String(minutes).padStart(2, "0")}` : ""}`;
}

/** Jetons d'une notification d'examen : {exams} et {at}, dans chaque langue. */
export function examVars(exams = [], lang) {
  const list = exams.filter((exam) => cleanText(exam?.name, 200));
  if (!list.length) return null;
  if (list.length === 1) {
    const at = formatExamTime(list[0].time, lang);
    return { exams: cut(list[0].name, 32), at: at ? (lang === "en" ? ` at ${at}` : ` à ${at}`) : "" };
  }
  if (list.length === 2) {
    const joiner = lang === "en" ? " and " : " et ";
    return { exams: `${cut(list[0].name, 18)}${joiner}${cut(list[1].name, 18)}`, at: "" };
  }
  return { exams: lang === "en" ? `${list.length} exams` : `${list.length} examens`, at: "" };
}

function fill(template, vars) {
  return Object.entries(vars).reduce((acc, [key, value]) => acc.split(`{${key}}`).join(String(value ?? "")), String(template || ""));
}

/**
 * Texte final d'une entrée du plan, à partir du modèle (éditable dans
 * l'admin). null si une donnée manque : rien ne part plutôt qu'une phrase
 * inventée ou amputée.
 */
export function renderEveningContent(kind, conf, data = {}) {
  const vars = { fr: {}, en: {} };
  if (kind === "exam_tomorrow" || kind === "exam_in_7_days") {
    const fr = examVars(data.exams, "fr");
    const en = examVars(data.exams, "en");
    if (!fr || !en) return null;
    vars.fr = fr;
    vars.en = en;
  } else if (kind === "streak_at_risk") {
    if (!(Number(data.days) >= STREAK_MIN_DAYS)) return null;
    vars.fr = { days: Number(data.days) };
    vars.en = { days: Number(data.days) };
  }
  return {
    title: {
      fr: cut(fill(conf.title.fr, vars.fr), PUSH_TITLE_MAX),
      en: cut(fill(conf.title.en || conf.title.fr, vars.en), PUSH_TITLE_MAX),
    },
    body: { fr: fill(conf.body.fr, vars.fr), en: fill(conf.body.en || conf.body.fr, vars.en) },
    url: conf.url || null,
  };
}
