// Portions quotidiennes d'une session — miroir JavaScript de la règle SQL
// `public.compute_session_day_parts` (supabase/migration_v65_session_day_parts.sql).
//
// En production, SEULE la base calcule les portions (table session_day_parts,
// tenue par un déclencheur). Ce fichier sert au mode démo hors ligne, qui n'a
// pas de base. tests/session-day-parts.test.mjs vérifie la parité avec le SQL
// sur exactement les mêmes cas limites (tests/fixtures/session-day-parts-cases.json).
//
// Règle (version 1) :
//   1. découper [started_at, ended_at] aux minuits LOCAUX du fuseau de la session ;
//   2. chaque jour reçoit duration × (part de l'intervalle ce jour-là), arrondi à
//      la seconde inférieure ; le dernier jour reçoit le reste ;
//   3. portions nulles omises ; intervalle nul → tout au jour local du début.

export const DAY_PARTS_VERSION = 1;

const TZ_PATTERN = /^[A-Za-z]+(\/[A-Za-z0-9_+-]+)+$/;
const dayFormats = new Map();

function dayFormat(timeZone) {
  let format = dayFormats.get(timeZone);
  if (!format) {
    format = new Intl.DateTimeFormat("en-CA", {
      timeZone, year: "numeric", month: "2-digit", day: "2-digit",
    });
    dayFormats.set(timeZone, format);
  }
  return format;
}

/** Même critère que public.is_valid_session_timezone : nom IANA de région ou « UTC ». */
export function isValidSessionTimezone(timeZone) {
  if (typeof timeZone !== "string" || timeZone.length > 64) return false;
  if (timeZone !== "UTC" && !TZ_PATTERN.test(timeZone)) return false;
  try {
    dayFormat(timeZone).format(0);
    return true;
  } catch {
    return false;
  }
}

/** Fuseau IANA de l'appareil, ou null s'il n'est pas exploitable. */
export function deviceTimezone() {
  try {
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return isValidSessionTimezone(timeZone) ? timeZone : null;
  } catch {
    return null;
  }
}

/** Date locale « YYYY-MM-DD » d'un instant (ms) dans un fuseau. */
export function localDateIn(ms, timeZone) {
  return dayFormat(timeZone).format(ms);
}

// Premier instant (ms) après `fromMs` où la date locale n'est plus celle de
// `fromMs`. `toMs` doit déjà être sur une autre date. La date locale ne recule
// jamais : une recherche dichotomique à la milliseconde suffit, et elle retrouve
// exactement les minuits de PostgreSQL, y compris un minuit qui n'existe pas
// (Santiago : la journée commence à 01:00).
function nextLocalMidnight(fromMs, toMs, timeZone) {
  const day = localDateIn(fromMs, timeZone);
  let lo = fromMs;
  let hi = toMs;
  while (hi - lo > 1) {
    const mid = Math.floor((lo + hi) / 2);
    if (localDateIn(mid, timeZone) === day) lo = mid;
    else hi = mid;
  }
  return hi;
}

/**
 * @returns {{ local_date: string, seconds: number }[]}
 */
export function computeSessionDayParts({ started_at, ended_at, duration_seconds, timezone }) {
  const duration = Math.trunc(Number(duration_seconds) || 0);
  const start = new Date(started_at).getTime();
  const end = new Date(ended_at).getTime();
  if (!timezone || !Number.isFinite(start) || !Number.isFinite(end) || duration <= 0) return [];

  const walls = [];
  if (end > start) {
    let cursor = start;
    const lastDay = localDateIn(end, timezone);
    while (localDateIn(cursor, timezone) !== lastDay) {
      const midnight = nextLocalMidnight(cursor, end, timezone);
      walls.push({ local_date: localDateIn(cursor, timezone), wall: midnight - cursor });
      cursor = midnight;
    }
    if (end > cursor) walls.push({ local_date: lastDay, wall: end - cursor });
  }

  if (!walls.length) return [{ local_date: localDateIn(start, timezone), seconds: duration }];

  // Entiers exacts (BigInt) : un flottant donnerait 1799,9999… là où le SQL
  // (numeric) donne 1800.
  const total = walls.reduce((sum, part) => sum + BigInt(part.wall), 0n);
  const parts = [];
  let given = 0;
  walls.forEach((part, index) => {
    const share = index < walls.length - 1
      ? Number((BigInt(duration) * BigInt(part.wall)) / total)
      : duration - given;
    given += share;
    if (share > 0) parts.push({ local_date: part.local_date, seconds: share });
  });
  return parts;
}
