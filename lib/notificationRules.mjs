// Règles des notifications — logique pure, sans réseau ni base.
//
// Partagée par les routes serveur (lib/server/notify.mjs, rappels du soir,
// demandes d'ami, envois admin), par l'admin (aperçu, validation des
// formulaires) et par les tests Node. Rien ici ne lit de secret ni n'envoie
// quoi que ce soit : ce fichier décide QUI et QUOI, jamais COMMENT.

import { isSafeInternalHref } from "./safeHref.mjs";

export const NOTIFICATION_CATEGORIES = Object.freeze(["reminder", "social", "announcement", "test"]);
export const NOTIFICATION_SOURCES = Object.freeze(["automation", "social", "admin"]);

// Rappels du soir, par ordre de priorité. Un seul par membre et par jour.
export const REMINDER_KINDS = Object.freeze([
  "exam_tomorrow", "streak_at_risk", "nudge_planning", "nudge_study", "comeback_day3",
]);
// L'examen du lendemain est un fait, pas une relance : il ne compte pas dans
// le plafond de relances et n'en est pas empêché.
export const CAP_EXEMPT_KINDS = Object.freeze(["exam_tomorrow"]);

export const PUSH_TITLE_MAX = 60;
export const PUSH_BODY_MAX = 160;
export const ANNOUNCEMENT_TITLE_MAX = 120;
export const ANNOUNCEMENT_MESSAGE_MAX = 500;
export const ANNOUNCEMENT_HREF_MAX = 300;
export const SCHEDULE_MIN_MS = 60_000;
export const SCHEDULE_MAX_MS = 90 * 864e5;
export const ONESIGNAL_BATCH = 2000;
export const CLAIM_BATCH = 1000;

export const DEFAULT_REMINDER_CAP = 3;
export const REMINDER_CAP_MIN = 1;
export const REMINDER_CAP_MAX = 7;
// Au plus 10 notifications « social » par membre sur 24 h, et une seule par
// paire expéditeur → destinataire et par jour (clé anti-doublon).
export const SOCIAL_DAILY_CAP = 10;
// Heures calmes, dans le fuseau du membre : pas de rappel avant 8 h ni à
// partir de 22 h. Le rappel du soir part une fois par jour (cron Vercel,
// 18 h UTC) ; un membre pour qui il est alors 2 h du matin n'est pas réveillé.
export const QUIET_START_HOUR = 22;
export const QUIET_END_HOUR = 8;
export const DAILY_CRON_UTC_HOUR = 18;

export const DEFAULT_TIMEZONE = "Europe/Brussels";

// Raisons d'exclusion, dans l'ordre où elles s'appliquent.
export const EXCLUSION_REASONS = Object.freeze([
  "missing", "suspended", "general_off", "category_off", "blocked",
  "quiet_hours", "frequency", "disabled", "duplicate",
]);

/** Espaces normalisés, bornes de longueur. */
export function cleanText(value, max) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

/**
 * Texte bilingue : le français fait foi, l'anglais le remplace s'il est
 * donné, et le français sert de repli quand il manque. OneSignal exige une
 * version « en » : elle existe donc toujours.
 */
export function bilingual(input, max) {
  const fr = cleanText(input?.fr, max);
  const en = cleanText(input?.en, max);
  return { fr, en: en || fr };
}

/** Les langues réellement rédigées (le repli ne compte pas). */
export function writtenLanguages(input) {
  const langs = [];
  if (cleanText(input?.fr, 10_000)) langs.push("fr");
  if (cleanText(input?.en, 10_000)) langs.push("en");
  return langs;
}

/** Remplace les jetons ({name}…) dans un texte { fr, en }. */
export function fillVars(text, vars = {}) {
  const apply = (value) =>
    Object.entries(vars).reduce((acc, [key, v]) => acc.split(`{${key}}`).join(String(v ?? "")), String(value || ""));
  return { fr: apply(text?.fr), en: apply(text?.en || text?.fr) };
}

/**
 * Formulaire d'envoi admin → contenu prêt à partir, ou un code d'erreur.
 * Français obligatoire, anglais facultatif (repli sur le français).
 */
export function validatePushContent(body = {}) {
  const titleFr = cleanText(body.titleFr, PUSH_TITLE_MAX);
  const bodyFr = cleanText(body.bodyFr, PUSH_BODY_MAX);
  if (!titleFr || !bodyFr) return { ok: false, error: "title_required" };
  const titleEn = cleanText(body.titleEn, PUSH_TITLE_MAX);
  const bodyEn = cleanText(body.bodyEn, PUSH_BODY_MAX);
  // Une moitié d'anglais serait pire que pas d'anglais du tout.
  if (Boolean(titleEn) !== Boolean(bodyEn)) return { ok: false, error: "english_incomplete" };
  const url = String(body.url || "").trim();
  if (!isSafeInternalHref(url) || url.length > ANNOUNCEMENT_HREF_MAX) return { ok: false, error: "invalid_link" };
  return {
    ok: true,
    content: {
      title: { fr: titleFr, en: titleEn || titleFr },
      body: { fr: bodyFr, en: bodyEn || bodyFr },
      url: url || null,
    },
    langs: titleEn ? ["fr", "en"] : ["fr"],
  };
}

/** Date d'envoi différé : null (maintenant) ou une date entre 1 min et 90 jours. */
export function validateSchedule(value, now = Date.now()) {
  if (value === undefined || value === null || value === "") return { ok: true, sendAfter: null };
  const when = new Date(value);
  if (Number.isNaN(when.getTime())) return { ok: false, error: "invalid_date" };
  if (when.getTime() < now + SCHEDULE_MIN_MS) return { ok: false, error: "date_too_soon" };
  if (when.getTime() > now + SCHEDULE_MAX_MS) return { ok: false, error: "date_too_far" };
  return { ok: true, sendAfter: when.toISOString() };
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function isUuidLike(value) {
  return UUID_RE.test(String(value || ""));
}

/**
 * Cible d'un envoi admin → { type, university?, userIds? } ou un code.
 * « all » veut dire tous les comptes Blocus Tracker éligibles, jamais un
 * segment OneSignal.
 */
export function parseAdminTarget(target = {}, maxUsers = 2000) {
  const type = target?.type;
  if (type === "all") return { ok: true, target: { type: "all" } };
  if (type === "university") {
    const university = cleanText(target.university, 160);
    if (!university) return { ok: false, error: "invalid_target" };
    return { ok: true, target: { type: "university", university } };
  }
  if (type === "users") {
    const userIds = [...new Set((Array.isArray(target.userIds) ? target.userIds : []).map(String))]
      .filter(isUuidLike)
      .slice(0, maxUsers);
    if (!userIds.length) return { ok: false, error: "empty_target" };
    return { ok: true, target: { type: "users", userIds } };
  }
  return { ok: false, error: "invalid_target" };
}

// ── Fuseaux horaires ───────────────────────────────────────────────────────
const calendarFormats = new Map();
function formatsFor(timeZone) {
  const tz = timeZone || DEFAULT_TIMEZONE;
  if (calendarFormats.has(tz)) return calendarFormats.get(tz);
  let entry;
  try {
    entry = {
      tz,
      day: new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }),
      hour: new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", hourCycle: "h23" }),
    };
  } catch (_) {
    // Fuseau inconnu : Bruxelles, comme le reste de l'app.
    entry = formatsFor(DEFAULT_TIMEZONE);
  }
  calendarFormats.set(tz, entry);
  return entry;
}

export function shiftDate(isoDate, days) {
  const [y, m, d] = String(isoDate).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** Le calendrier d'un membre à un instant donné, dans SON fuseau. */
export function localCalendar(now, timeZone) {
  const { tz, day, hour } = formatsFor(timeZone);
  const instant = now instanceof Date ? now : new Date(now);
  const today = day.format(instant);
  return {
    timeZone: tz,
    today,
    yesterday: shiftDate(today, -1),
    tomorrow: shiftDate(today, 1),
    day2: shiftDate(today, -2),
    day3: shiftDate(today, -3),
    hour: Number(hour.format(instant)) % 24,
    dayOf: (value) => day.format(new Date(value)),
  };
}

export function isQuietHour(hour) {
  return hour >= QUIET_START_HOUR || hour < QUIET_END_HOUR;
}

/** Relance étude / planning en alternance, selon le jour du membre. */
export function nudgeKindFor(localDate) {
  return Number(String(localDate).replace(/-/g, "")) % 2 === 0 ? "nudge_planning" : "nudge_study";
}

/**
 * Plan du rappel du soir. Un seul rappel par membre, par ordre de priorité :
 *   1. examen demain (son calendrier) ;
 *   2. rien s'il a déjà étudié aujourd'hui ;
 *   3. série en danger : a étudié hier, pas aujourd'hui ;
 *   4. relance douce : a étudié il y a 2 ou 3 jours (étude / planning en alternance) ;
 *   5. relance des nouveaux : inscrit il y a 3 jours, jamais reparti ;
 *   au-delà de 3 jours sans étudier : pas de relance (anti-harcèlement).
 * Heures calmes appliquées dans le fuseau du membre.
 *
 * @param members Map(userId → { timezone })
 * @returns { entries: [{ userId, kind, localDate }], skipped: { studied_today, inactive, quiet_hours } }
 */
export function planReminders({ now, members, sessions = [], exams = [], newcomerIds = [] }) {
  const calendars = new Map();
  const calendarOf = (userId) => {
    if (!calendars.has(userId)) calendars.set(userId, localCalendar(now, members.get(userId)?.timezone));
    return calendars.get(userId);
  };

  const days = new Map();
  for (const session of sessions) {
    if (!session?.user_id || !session.started_at || !members.has(session.user_id)) continue;
    const set = days.get(session.user_id) || new Set();
    set.add(calendarOf(session.user_id).dayOf(session.started_at));
    days.set(session.user_id, set);
  }
  const examDays = new Map();
  for (const exam of exams) {
    if (!exam?.user_id || !exam.exam_date) continue;
    const set = examDays.get(exam.user_id) || new Set();
    set.add(String(exam.exam_date).slice(0, 10));
    examDays.set(exam.user_id, set);
  }
  const newcomers = new Set(newcomerIds);

  const entries = [];
  const skipped = { studied_today: 0, inactive: 0, quiet_hours: 0 };
  for (const userId of members.keys()) {
    const cal = calendarOf(userId);
    const studied = days.get(userId) || new Set();
    let kind = null;
    if (examDays.get(userId)?.has(cal.tomorrow)) kind = "exam_tomorrow";
    else if (studied.has(cal.today)) { skipped.studied_today += 1; continue; }
    else if (studied.has(cal.yesterday)) kind = "streak_at_risk";
    else if (studied.has(cal.day2) || studied.has(cal.day3)) kind = nudgeKindFor(cal.today);
    else if (newcomers.has(userId)) kind = "comeback_day3";
    else { skipped.inactive += 1; continue; }

    if (isQuietHour(cal.hour)) { skipped.quiet_hours += 1; continue; }
    entries.push({ userId, kind, localDate: cal.today });
  }
  return { entries, skipped };
}

/** Plafond de relances sur 7 jours. L'examen du lendemain n'est pas plafonné. */
export function isCappedReminder(kind, recentReminders, cap) {
  if (CAP_EXEMPT_KINDS.includes(kind)) return false;
  return Number(recentReminders || 0) >= Number(cap || DEFAULT_REMINDER_CAP);
}

export function normalizeCap(value) {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n) || n < REMINDER_CAP_MIN || n > REMINDER_CAP_MAX) return null;
  return n;
}

// ── Clés anti-doublon ──────────────────────────────────────────────────────
/** Un rappel automatique par membre et par jour (son jour), quel que soit le type. */
export function reminderKey(userId, localDate) {
  return `reminder:${localDate}:${userId}`;
}
/** Une notification de demande d'ami par paire et par jour (UTC). */
export function friendRequestKey(requesterId, addresseeId, now = new Date()) {
  const day = (now instanceof Date ? now : new Date(now)).toISOString().slice(0, 10);
  return `friend_request:${requesterId}:${addresseeId}:${day}`;
}
/** Envoi admin : un destinataire une seule fois par envoi. */
export function adminRecipientKey(sendId, userId) {
  return `admin:${sendId}:${userId}`;
}

// ── Demandes d'ami ─────────────────────────────────────────────────────────
// La route ne croit jamais le contenu reçu : elle relit la demande en base et
// ne notifie qu'une demande en attente, fraîche (moins de 15 minutes).
export const FRIEND_REQUEST_FRESH_MS = 15 * 60_000;
export function friendRequestVerdict(friendship, now = Date.now()) {
  if (!friendship) return { ok: false, reason: "not_found" };
  if (friendship.status !== "pending") return { ok: false, reason: "not_pending" };
  if (!friendship.requester || !friendship.addressee || friendship.requester === friendship.addressee) {
    return { ok: false, reason: "invalid" };
  }
  const created = new Date(friendship.created_at).getTime();
  if (!Number.isFinite(created) || now - created > FRIEND_REQUEST_FRESH_MS) return { ok: false, reason: "stale" };
  return { ok: true };
}

/**
 * Identifiant de la demande dans l'appel du webhook : le nouveau format
 * ({ friendship_id }) ou l'ancien webhook Supabase ({ record: { id } }).
 */
export function friendshipIdFromWebhook(payload) {
  const id = payload?.friendship_id || (payload?.table === "friendships" ? payload?.record?.id : null);
  return isUuidLike(id) ? String(id) : null;
}

// ── Audience ───────────────────────────────────────────────────────────────
/**
 * Comptage d'une audience (lignes de notification_audience, avec
 * éventuellement une raison ajoutée côté serveur : fréquence, heures calmes).
 */
export function summarizeAudience(rows = []) {
  const excluded = {};
  let eligible = 0;
  let reachable = 0;
  let devices = 0;
  for (const row of rows) {
    if (row.reason) {
      excluded[row.reason] = (excluded[row.reason] || 0) + 1;
      continue;
    }
    eligible += 1;
    if (Number(row.devices) > 0) {
      reachable += 1;
      devices += Number(row.devices);
    }
  }
  return { targeted: rows.length, excluded, eligible, reachable, devices };
}

/** Prochain passage du rappel du soir (cron quotidien, heure UTC). */
export function nextDailyRun(now = new Date(), hourUtc = DAILY_CRON_UTC_HOUR) {
  const instant = now instanceof Date ? now : new Date(now);
  const next = new Date(Date.UTC(instant.getUTCFullYear(), instant.getUTCMonth(), instant.getUTCDate(), hourUtc));
  if (next.getTime() <= instant.getTime()) next.setUTCDate(next.getUTCDate() + 1);
  return next.toISOString();
}

// ── Annonces dans l'app ────────────────────────────────────────────────────
/**
 * Formulaire d'annonce → ligne app_announcements, ou un code d'erreur.
 * Les dates sont facultatives : sans elles, l'annonce vit comme avant.
 */
export function validateAnnouncement(form = {}, now = Date.now()) {
  const title = cleanText(form.titleFr, ANNOUNCEMENT_TITLE_MAX);
  const message = String(form.messageFr ?? "").trim().slice(0, ANNOUNCEMENT_MESSAGE_MAX);
  if (!title || !message) return { ok: false, error: "title_required" };
  const titleEn = cleanText(form.titleEn, ANNOUNCEMENT_TITLE_MAX);
  const messageEn = String(form.messageEn ?? "").trim().slice(0, ANNOUNCEMENT_MESSAGE_MAX);
  if (Boolean(titleEn) !== Boolean(messageEn)) return { ok: false, error: "english_incomplete" };
  const href = String(form.href || "").trim();
  if (!isSafeInternalHref(href) || href.length > ANNOUNCEMENT_HREF_MAX) return { ok: false, error: "invalid_link" };
  const type = ["new", "info", "important"].includes(form.type) ? form.type : "info";

  const parse = (value) => {
    if (!value) return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? undefined : date;
  };
  const startsAt = parse(form.startsAt);
  const endsAt = parse(form.endsAt);
  if (startsAt === undefined || endsAt === undefined) return { ok: false, error: "invalid_date" };
  if (endsAt && endsAt.getTime() <= Math.max(now, startsAt ? startsAt.getTime() : 0)) {
    return { ok: false, error: "end_before_start" };
  }

  const audience = form.audience === "university" ? "university" : "all";
  const university = cleanText(form.university, 160);
  if (audience === "university" && !university) return { ok: false, error: "invalid_target" };

  return {
    ok: true,
    row: {
      title,
      message,
      title_en: titleEn || null,
      message_en: messageEn || null,
      type,
      href: href || null,
      starts_at: startsAt ? startsAt.toISOString() : null,
      ends_at: endsAt ? endsAt.toISOString() : null,
      audience,
      audience_university: audience === "university" ? university : null,
    },
  };
}

/** Texte de la notification push qui accompagne une annonce. */
export function announcementPushContent(row) {
  const cut = (text, max) => {
    const value = cleanText(text, 10_000);
    if (value.length <= max) return value;
    const slice = value.slice(0, max - 1);
    const space = slice.lastIndexOf(" ");
    return `${(space > max * 0.6 ? slice.slice(0, space) : slice).trimEnd()}…`;
  };
  const titleFr = cut(row?.title, PUSH_TITLE_MAX);
  const bodyFr = cut(row?.message, PUSH_BODY_MAX);
  const titleEn = row?.title_en ? cut(row.title_en, PUSH_TITLE_MAX) : "";
  const bodyEn = row?.message_en ? cut(row.message_en, PUSH_BODY_MAX) : "";
  return {
    title: { fr: titleFr, en: titleEn || titleFr },
    body: { fr: bodyFr, en: bodyEn || bodyFr },
    url: row?.href && isSafeInternalHref(row.href) ? row.href : null,
    langs: titleEn ? ["fr", "en"] : ["fr"],
  };
}

/** Est-ce qu'une annonce est visible maintenant (hors cible) ? */
export function announcementWindowState(row, now = Date.now()) {
  if (!row?.is_active) return "inactive";
  if (row.starts_at && new Date(row.starts_at).getTime() > now) return "scheduled";
  if (row.ends_at && new Date(row.ends_at).getTime() <= now) return "expired";
  return "live";
}
