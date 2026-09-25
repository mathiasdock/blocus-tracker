// Jours d'étude affichés par le Dashboard et les Statistiques.
//
// Source unique : la vue public.session_days (v70) — une ligne par session et
// par jour local, `seconds` étant la part de la session tombée ce jour-là.
// Une session 23:30 → 00:30 donne donc deux lignes de 30 min, et une session
// historique sans fuseau une seule ligne (règle legacy figée, voir v70).
//
// Seul complément : les sessions que la base ne connaît pas encore (file hors
// ligne, session qu'on vient d'arrêter). Leurs jours sont calculés ici avec la
// MÊME règle que le déclencheur (lib/sessionDayParts.mjs). Une session n'est
// jamais comptée deux fois : son identifiant — l'UUID client qui sert aussi de
// clé d'idempotence à la file hors ligne — n'est retenu qu'une fois, et dès
// que la base renvoie ses lignes, ce sont elles qui comptent.
//
// « Aujourd'hui » = la date locale de l'appareil. Elle sert uniquement à
// choisir quelle `local_date` est aujourd'hui ; elle ne recalcule jamais le
// jour d'une session passée.

import {
  computeSessionDayParts,
  deviceTimezone,
  isValidSessionTimezone,
  sessionDays,
} from "./sessionDayParts.mjs";

export const STUDY_DAY_COLUMNS = "session_id, local_date, seconds, course_id";
const PAGE_SIZE = 1000;

function localDateOf(dateLike) {
  const d = new Date(dateLike);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Date locale « YYYY-MM-DD » de l'appareil, maintenant. */
export function deviceToday(now = new Date()) {
  return localDateOf(now);
}

/**
 * Lit session_days pour un compte, page par page (PostgREST plafonne une
 * réponse à 1 000 lignes). → { data, error }
 */
export async function fetchStudyDays(supabase, userId, { fromISO = null } = {}) {
  const rows = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    let query = supabase.from("session_days").select(STUDY_DAY_COLUMNS).eq("user_id", userId);
    if (fromISO) query = query.gte("local_date", fromISO);
    const { data, error } = await query
      .order("local_date", { ascending: true })
      .order("session_id", { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1);
    if (error) return { data: null, error };
    rows.push(...(data || []));
    if (!data || data.length < PAGE_SIZE) return { data: rows, error: null };
  }
}

function toRows(session, parts, provenance) {
  return parts.map((part) => ({
    session_id: session.id,
    local_date: part.local_date,
    seconds: part.seconds,
    course_id: session.course_id ?? null,
    provenance,
  }));
}

/**
 * Jours d'une session PAS ENCORE en base (file hors ligne, arrêt en cours
 * d'envoi, mode invité). Même règle que le déclencheur v65 : le fuseau capturé
 * au démarrage, sinon celui que la base prendra — le profil, que l'app aligne
 * sur l'appareil.
 */
export function unsyncedSessionDays(session, fallbackTimezone = deviceTimezone()) {
  if (!session?.id) return [];
  const timezone = isValidSessionTimezone(session.timezone) ? session.timezone : fallbackTimezone;
  if (timezone) return toRows(session, computeSessionDayParts({ ...session, timezone }), "pending");
  // Appareil sans fuseau exploitable (très rare) : tout au jour local du début.
  const seconds = Math.trunc(Number(session.duration_seconds) || 0);
  if (seconds <= 0 || Number.isNaN(new Date(session.started_at).getTime())) return [];
  return toRows(session, [{ local_date: localDateOf(session.started_at), seconds }], "pending");
}

/**
 * Jours d'une ligne de `sessions` DÉJÀ en base dont session_days n'est pas
 * encore relue (insertion optimiste, durée qu'on vient de modifier). Miroir de
 * la vue : portions dans le fuseau de la session, règle legacy sans fuseau.
 */
export function syncedSessionDays(session) {
  if (!session?.id) return [];
  if (!session.timezone) return sessionDays(session);
  return sessionDays(session, computeSessionDayParts(session));
}

/**
 * Lignes session_days + jours des sessions connues localement que la base n'a
 * pas (ou pas encore) renvoyées. Chaque session compte UNE fois : les lignes
 * serveur d'abord, puis les sessions en base connues localement, puis celles
 * qui n'y sont pas encore.
 */
export function mergeStudyDays(serverRows = [], { synced = [], unsynced = [] } = {}) {
  const seen = new Set((serverRows || []).map((row) => row.session_id));
  const extra = [];
  for (const session of synced || []) {
    if (!session?.id || seen.has(session.id)) continue;
    seen.add(session.id);
    extra.push(...syncedSessionDays(session));
  }
  for (const session of unsynced || []) {
    if (!session?.id || seen.has(session.id)) continue;
    seen.add(session.id);
    extra.push(...unsyncedSessionDays(session));
  }
  return extra.length ? [...(serverRows || []), ...extra] : (serverRows || []);
}

/** Secondes par jour local. */
export function secondsByDay(rows) {
  const out = {};
  for (const row of rows || []) {
    const secs = Number(row.seconds) || 0;
    if (secs > 0) out[row.local_date] = (out[row.local_date] || 0) + secs;
  }
  return out;
}

/** Secondes d'un jour donné. */
export function secondsOn(rows, localDate) {
  let total = 0;
  for (const row of rows || []) if (row.local_date === localDate) total += Number(row.seconds) || 0;
  return total;
}

/**
 * Sessions d'un jour, dans l'ordre de la liste (plus récente d'abord), chacune
 * avec `day_seconds` = sa part de CE jour. Les heures de début et de fin restent
 * les vraies. `pending` marque une session que la base n'a pas encore.
 */
export function sessionsOnDay(rows, localDate, { synced = [], unsynced = [] } = {}) {
  const byId = new Map();
  for (const session of unsynced || []) if (session?.id) byId.set(session.id, session);
  for (const session of synced || []) if (session?.id) byId.set(session.id, session);
  const out = [];
  for (const row of rows || []) {
    if (row.local_date !== localDate) continue;
    const session = byId.get(row.session_id);
    if (!session) continue;
    out.push({ ...session, day_seconds: Number(row.seconds) || 0, pending: row.provenance === "pending" });
  }
  return out.sort((a, b) => new Date(b.started_at) - new Date(a.started_at));
}
