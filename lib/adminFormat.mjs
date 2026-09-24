// Mise en forme des lectures admin (v61 / v61_3) — aucune statistique ici.
//
// Les chiffres viennent tous des fonctions admin_* de la base : ce module ne
// fait que les écrire (heures, taux, dates de Bruxelles) et décider quoi
// signaler sur la page Aujourd'hui à partir des champs déjà calculés. Il
// n'additionne ni ne recompte rien : un taux absent (petite cohorte, fenêtre
// pas finie) reste absent et s'écrit « n sur m ».

export const ADMIN_TZ = "Europe/Brussels";

export const MEMBER_SEGMENTS = Object.freeze([
  "all", "active", "no_real_session", "dormant", "incomplete_signup", "placeholder_email", "suspended",
]);
export const MEMBER_SORTS = Object.freeze([
  "signup_desc", "last_session_desc", "time_30d_desc", "time_total_desc", "pseudo_asc", "signup_asc",
]);
export const MEMBERS_PAGE_SIZE = 50;
export const AUDIT_PAGE_SIZE = 25;

// Les tâches planifiées suivies par system_job_runs (v60).
export const ADMIN_JOBS = Object.freeze(["purge_posts", "push_daily"]);

export function localeFor(lang) {
  return lang === "en" ? "en-GB" : "fr-BE";
}

function isNil(value) {
  return value === null || value === undefined || value === "";
}

export function formatCount(value, lang) {
  if (isNil(value) || !Number.isFinite(Number(value))) return "—";
  return new Intl.NumberFormat(localeFor(lang), { maximumFractionDigits: 0 }).format(Number(value));
}

// Durées : le format de l'app (« 6h20 », identique en FR et EN) tant qu'il
// reste lisible ; au-delà de 100 h, des heures entières (« 3 594 h »).
export function formatDuration(seconds, lang) {
  if (isNil(seconds)) return "—";
  const secs = Math.max(0, Number(seconds) || 0);
  if (secs === 0) return "0 min";
  const minutes = Math.round(secs / 60);
  if (minutes === 0) return "< 1 min";
  if (minutes < 60) return `${minutes} min`;
  if (secs >= 100 * 3600) return `${formatCount(Math.round(secs / 3600), lang)} h`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours}h${String(rest).padStart(2, "0")}` : `${hours}h`;
}

export function formatPercent(rate, lang) {
  if (isNil(rate) || !Number.isFinite(Number(rate))) return "—";
  return new Intl.NumberFormat(localeFor(lang), {
    style: "percent", minimumFractionDigits: 0, maximumFractionDigits: 1,
  }).format(Number(rate));
}

// Un taux tel que la base le donne. `rate` null veut dire « pas de taux » :
// la base l'a refusé (moins de 5 personnes, ou fenêtre pas terminée). On
// n'en recalcule pas un : on écrit le compte brut.
//   → { value, detail, hasRate }
export function describeRate({ count, base, rate }, lang, t) {
  const nOfM = t("adm.common.nOfM")
    .replace("{n}", formatCount(count, lang))
    .replace("{m}", formatCount(base, lang));
  if (!isNil(rate)) return { value: formatPercent(rate, lang), detail: nOfM, hasRate: true };
  return { value: nOfM, detail: null, hasRate: false };
}

// Dates : toujours à l'heure de Bruxelles, comme les définitions. Une date
// seule (« 2026-09-07 », début de semaine) est un jour civil : on l'écrit
// telle quelle, sans décalage de fuseau.
const DATE_STYLES = {
  day: { day: "numeric", month: "short", year: "numeric" },
  dayShort: { day: "numeric", month: "short" },
  dateTime: { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" },
  dateTimeYear: { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" },
  time: { hour: "2-digit", minute: "2-digit" },
};

export function formatDate(value, lang, style = "day") {
  if (isNil(value)) return "—";
  const civil = typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
  const date = civil ? new Date(`${value}T12:00:00Z`) : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat(localeFor(lang), {
    ...(DATE_STYLES[style] || DATE_STYLES.day),
    timeZone: civil ? "UTC" : ADMIN_TZ,
  }).format(date);
}

// Champ « date et heure » de l'admin : lu en heure de Bruxelles, comme tout ce
// que l'admin affiche — pas dans le fuseau de l'ordinateur de l'admin, sinon
// « 18:00 » saisi depuis l'étranger partirait à une autre heure que celle lue
// ensuite dans la confirmation. "AAAA-MM-JJTHH:MM" → instant ISO (UTC).
function zoneOffsetMs(instant, timeZone) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(new Date(instant));
  const get = (type) => Number(parts.find((part) => part.type === type)?.value || 0);
  return Date.UTC(get("year"), get("month") - 1, get("day"), get("hour") % 24, get("minute"), get("second")) - instant;
}

export function adminInputToIso(value, timeZone = ADMIN_TZ) {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(String(value || ""));
  if (!match) return null;
  const [, y, mo, d, h, mi] = match.map(Number);
  const wall = Date.UTC(y, mo - 1, d, h, mi);
  let instant = wall - zoneOffsetMs(wall, timeZone);
  // Changement d'heure : on recalcule avec le décalage de l'instant trouvé.
  const second = wall - zoneOffsetMs(instant, timeZone);
  if (second !== instant) instant = second;
  return new Date(instant).toISOString();
}

// Et l'inverse : un instant → la valeur d'un champ « date et heure » de Bruxelles.
export function isoToAdminInput(value, timeZone = ADMIN_TZ) {
  if (isNil(value)) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
  }).formatToParts(date);
  const get = (type) => parts.find((part) => part.type === type)?.value || "00";
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
}

// « il y a 3 jours » — le temps écoulé entre deux instants, pour lire vite.
export function formatAgo(value, now, lang) {
  if (isNil(value)) return "—";
  const then = new Date(value).getTime();
  const ref = now instanceof Date ? now.getTime() : new Date(now ?? Date.now()).getTime();
  if (!Number.isFinite(then) || !Number.isFinite(ref)) return "—";
  const seconds = Math.round((then - ref) / 1000);
  const abs = Math.abs(seconds);
  const rtf = new Intl.RelativeTimeFormat(localeFor(lang), { numeric: "auto" });
  if (abs < 60) return rtf.format(0, "second");
  if (abs < 3600) return rtf.format(Math.round(seconds / 60), "minute");
  if (abs < 86400) return rtf.format(Math.round(seconds / 3600), "hour");
  if (abs < 86400 * 45) return rtf.format(Math.round(seconds / 86400), "day");
  if (abs < 86400 * 365) return rtf.format(Math.round(seconds / (86400 * 30)), "month");
  return rtf.format(Math.round(seconds / (86400 * 365)), "year");
}

// Ce que la page Aujourd'hui doit signaler, dans l'ordre où le traiter.
// Uniquement des champs d'admin_today comparés à zéro : aucun seuil maison.
export function todayAttention(today) {
  if (!today) return [];
  const items = [];
  const queue = today.queue || {};
  if (queue.open_reports > 0) {
    items.push({ key: "reports", count: queue.open_reports, href: "/admin/inbox?view=reports", tone: "act" });
  }
  if (queue.new_feedback > 0) {
    items.push({ key: "feedback", count: queue.new_feedback, href: "/admin/inbox?view=feedback", tone: "act" });
  }
  for (const job of today.jobs || []) {
    if (job.last_status === "error") {
      items.push({ key: "jobFailed", job: job.job, at: job.last_started_at, href: "/admin/system#jobs", tone: "danger" });
    } else if (job.overdue) {
      items.push({ key: "jobOverdue", job: job.job, at: job.last_started_at, href: "/admin/system#jobs", tone: "danger" });
    } else if (!job.last_started_at) {
      items.push({ key: "jobNever", job: job.job, href: "/admin/system#jobs", tone: "info" });
    }
  }
  if (queue.push_failures_7d > 0) {
    items.push({
      key: "pushFailures", count: queue.push_failures_7d, members: queue.push_failure_members_7d,
      href: "/admin/system#push", tone: "info",
    });
  }
  const long = today.study_seconds?.long_sessions_current;
  if (long > 0) {
    items.push({ key: "longSessions", count: long, href: "/admin/system#anomalies", tone: "info" });
  }
  return items;
}

// Une case de cohorte (activation ou retour semaine 2), telle que la base la
// décrit : fenêtre pas finie, semaine vide, compte inconnu (un compte
// supprimé sans cette donnée), trop petite, ou un vrai taux.
export function cohortCell(part, cohortSize, count) {
  if (!part) return { state: "none" };
  if (!part.complete) return { state: "pending", until: part.complete_at || null };
  if (!cohortSize) return { state: "empty" };
  if (count === null || count === undefined) return { state: "unknown" };
  if (part.rate === null || part.rate === undefined) return { state: "small", count, base: cohortSize };
  return { state: "rate", rate: part.rate, count, base: cohortSize };
}

// Export CSV. Un pseudo est saisi par le membre : une cellule qui commence
// par = + - @ serait exécutée comme une formule par un tableur. On la
// neutralise, puis on échappe guillemets, virgules et retours à la ligne.
export function csvCell(value) {
  if (isNil(value)) return "";
  let text = String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  if (/[",;\n\r]/.test(text)) text = `"${text.replace(/"/g, '""')}"`;
  return text;
}

export function toCsv(rows, columns) {
  const header = columns.map((column) => csvCell(column.header)).join(",");
  const lines = (rows || []).map((row) => columns.map((column) => csvCell(column.value(row))).join(","));
  // BOM : Excel ouvre alors le fichier en UTF-8 (accents intacts).
  return `\uFEFF${[header, ...lines].join("\r\n")}\r\n`;
}

// Lecture de l'URL de la liste des membres : valeurs inconnues → défauts.
export function parseMembersQuery(query = {}) {
  const pick = (value) => (Array.isArray(value) ? value[0] : value);
  const segment = MEMBER_SEGMENTS.includes(pick(query.seg)) ? pick(query.seg) : "all";
  const sort = MEMBER_SORTS.includes(pick(query.sort)) ? pick(query.sort) : "signup_desc";
  const pageRaw = Number.parseInt(pick(query.page), 10);
  const page = Number.isFinite(pageRaw) && pageRaw > 0 ? pageRaw : 1;
  const search = String(pick(query.q) || "").slice(0, 100);
  const id = /^[0-9a-f-]{36}$/i.test(String(pick(query.id) || "")) ? String(pick(query.id)) : null;
  return { segment, sort, page, search, id };
}

// Et l'inverse : seuls les réglages différents du défaut vont dans l'URL.
export function membersQueryString({ segment, sort, page, search, id }) {
  const params = new URLSearchParams();
  if (search) params.set("q", search);
  if (segment && segment !== "all") params.set("seg", segment);
  if (sort && sort !== "signup_desc") params.set("sort", sort);
  if (page && page > 1) params.set("page", String(page));
  if (id) params.set("id", id);
  const text = params.toString();
  return text ? `?${text}` : "";
}

export function formatBytes(bytes, lang) {
  if (isNil(bytes)) return "—";
  const value = Math.max(0, Number(bytes) || 0);
  const nf = (n, digits) => new Intl.NumberFormat(localeFor(lang), { maximumFractionDigits: digits }).format(n);
  if (value < 1024) return `${nf(value, 0)} B`;
  if (value < 1024 * 1024) return `${nf(value / 1024, value < 10 * 1024 ? 1 : 0)} KB`;
  if (value < 1024 * 1024 * 1024) return `${nf(value / 1024 / 1024, value < 10 * 1024 * 1024 ? 1 : 0)} MB`;
  return `${nf(value / 1024 / 1024 / 1024, 1)} GB`;
}

// Version déployée : 7 caractères du commit suffisent pour le retrouver.
export function shortSha(sha) {
  const text = String(sha || "").trim();
  return /^[0-9a-f]{7,40}$/i.test(text) ? text.slice(0, 7) : null;
}
