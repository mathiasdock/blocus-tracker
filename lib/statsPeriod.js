// Périodes d'observation des statistiques.
//
// Chaque section analytique porte SON filtre, dans son propre en-tête. Un
// réglage global posé entre deux cartes ne disait pas ce qu'il commandait :
// on ne savait pas si « 30 jours » valait aussi pour la heatmap, pour la
// comparaison, pour le classement. Un filtre rattaché visuellement à sa carte
// répond tout seul à la question.
//
// Fonctions pures : elles reçoivent des sessions déjà chargées et ne touchent
// ni au réseau ni au DOM. Tout raisonne en date LOCALE (localISO), comme le
// reste de l'app — la heatmap et le calcul de série ont déjà été corrigés pour
// ça, une fenêtre en UTC décalerait les totaux d'un jour en soirée.

import { localISO } from "./format";

// Périodes proposées dans l'interface. Les libellés sont explicites à dessein :
// « 7 jours » ne disait pas s'il s'agissait de la semaine calendaire ou d'une
// fenêtre glissante. « Ce mois-ci » (calendaire) et « 30 derniers jours »
// (glissant) sont deux choses différentes et coexistent désormais sans se
// confondre. `blocus` reste géré par resolvePeriod mais n'est plus proposé.
export const PERIOD_KEYS = ["7", "30", "month", "year", "all"];
const DAY_MS = 864e5;

function shiftISO(iso, days) {
  const d = new Date(iso + "T12:00:00");
  d.setDate(d.getDate() + days);
  return localISO(d);
}

/** Nombre de jours inclus entre deux dates ISO (bornes comprises). */
export function daysBetween(fromISO, toISO) {
  const a = new Date(fromISO + "T12:00:00");
  const b = new Date(toISO + "T12:00:00");
  return Math.max(1, Math.round((b - a) / DAY_MS) + 1);
}

/** Secondes étudiées par jour local, sur toutes les sessions fournies. */
export function dayTotals(sessions) {
  const out = {};
  for (const s of sessions || []) {
    const d = localISO(s.started_at);
    out[d] = (out[d] || 0) + (s.duration_seconds || 0);
  }
  return out;
}

/**
 * Bornes de la période choisie.
 * @returns {{key, fromISO, toISO, days}} — `blocus` retombe sur 30 jours si
 *   aucune période d'étude n'est déclarée, `all` sur aujourd'hui si l'historique
 *   est vide (une page sans session ne doit pas produire de plage invalide).
 */
export function resolvePeriod(key, { sessions = [], blocusRanges = null } = {}) {
  const today = localISO(new Date());

  if (key === "blocus" && blocusRanges && blocusRanges.length) {
    // La plage la plus récente : c'est le blocus qu'on est en train de vivre,
    // ou le dernier terminé — pas la première jamais créée.
    const latest = [...blocusRanges].sort((a, b) => b[0].localeCompare(a[0]))[0];
    const [from, to] = latest;
    // Jamais au-delà d'aujourd'hui : afficher les jours à venir d'un blocus en
    // cours dessinerait une chute à zéro qui n'est pas un relâchement.
    const end = to < today ? to : today;
    return { key, fromISO: from, toISO: end, days: daysBetween(from, end) };
  }

  if (key === "all") {
    const first = (sessions || []).reduce(
      (min, s) => { const d = localISO(s.started_at); return !min || d < min ? d : min; },
      null
    );
    const from = first || today;
    return { key, fromISO: from, toISO: today, days: daysBetween(from, today) };
  }

  // Périodes CALENDAIRES : du 1er du mois / du 1er janvier à aujourd'hui.
  // Elles s'arrêtent à aujourd'hui et non à la fin du mois ou de l'année :
  // dessiner les jours à venir ferait une chute à zéro qui n'est pas un
  // relâchement (même règle que pour une période de blocus en cours).
  if (key === "month" || key === "year") {
    const now = new Date();
    const from = key === "month"
      ? localISO(new Date(now.getFullYear(), now.getMonth(), 1))
      : localISO(new Date(now.getFullYear(), 0, 1));
    return { key, fromISO: from, toISO: today, days: daysBetween(from, today) };
  }

  const n = key === "7" ? 7 : 30;
  return { key: key === "7" ? "7" : "30", fromISO: shiftISO(today, -(n - 1)), toISO: today, days: n };
}

/** Sessions comprises dans la période (bornes locales incluses). */
export function sessionsInPeriod(sessions, { fromISO, toISO }) {
  return (sessions || []).filter((s) => {
    const d = localISO(s.started_at);
    return d >= fromISO && d <= toISO;
  });
}

/**
 * Granularité du graphique. Au-delà d'un mois, une barre par jour devient une
 * forêt illisible sur téléphone : on regroupe. Le seuil est fixé par la
 * lisibilité (≈ 31 barres max), pas par le calendrier.
 */
export function granularityFor(days) {
  if (days <= 31) return "day";
  if (days <= 182) return "week";
  return "month";
}

const MONTHS_SHORT = {
  fr: ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."],
  en: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
};

// Lundi de la semaine contenant `iso` (semaine ISO, comme partout ailleurs).
function mondayOf(iso) {
  const d = new Date(iso + "T12:00:00");
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return localISO(d);
}

/**
 * Barres du graphique principal, sur toute la période — y compris les jours
 * SANS session. Un jour à zéro est une information (c'est le trou dans la
 * régularité) : le masquer donnerait une courbe faussement continue.
 * @returns {Array<{iso, label, secs, count, isToday}>}
 */
export function buildTimeSeries(sessions, { fromISO, toISO, days }, lang = "fr") {
  const gran = granularityFor(days);
  const months = MONTHS_SHORT[lang === "en" ? "en" : "fr"];
  const locale = lang === "en" ? "en-GB" : "fr-FR";
  const today = localISO(new Date());

  // Agrégation d'abord par jour local, puis regroupement selon la granularité.
  const perDaySecs = {};
  const perDayCount = {};
  for (const s of sessionsInPeriod(sessions, { fromISO, toISO })) {
    const d = localISO(s.started_at);
    perDaySecs[d] = (perDaySecs[d] || 0) + (s.duration_seconds || 0);
    perDayCount[d] = (perDayCount[d] || 0) + 1;
  }

  const buckets = new Map();
  const total = daysBetween(fromISO, toISO);
  for (let i = 0; i < total; i++) {
    const iso = shiftISO(fromISO, i);
    if (iso > toISO) break;
    const key = gran === "day" ? iso : gran === "week" ? mondayOf(iso) : iso.slice(0, 7);
    if (!buckets.has(key)) buckets.set(key, { iso: key, secs: 0, count: 0 });
    const b = buckets.get(key);
    b.secs += perDaySecs[iso] || 0;
    b.count += perDayCount[iso] || 0;
  }

  return [...buckets.values()].map((b) => {
    let label;
    if (gran === "day") {
      const d = new Date(b.iso + "T12:00:00");
      // Sur une fenêtre courte, le jour de semaine se lit mieux qu'un numéro ;
      // sur un mois, le numéro évite sept « lun. » identiques.
      label = days <= 8
        ? d.toLocaleDateString(locale, { weekday: "short" })
        : String(d.getDate());
    } else if (gran === "week") {
      const d = new Date(b.iso + "T12:00:00");
      label = `${d.getDate()} ${months[d.getMonth()]}`;
    } else {
      label = months[Number(b.iso.slice(5, 7)) - 1];
    }
    return { ...b, label, gran, isToday: gran === "day" && b.iso === today };
  });
}

/** Libellé long d'une barre, pour le détail affiché au clic. */
export function bucketLongLabel(bucket, lang = "fr") {
  const locale = lang === "en" ? "en-GB" : "fr-FR";
  if (!bucket) return "";
  if (bucket.gran === "day") {
    return new Date(bucket.iso + "T12:00:00").toLocaleDateString(locale, {
      weekday: "long", day: "numeric", month: "long",
    });
  }
  if (bucket.gran === "week") {
    const start = new Date(bucket.iso + "T12:00:00");
    const end = new Date(bucket.iso + "T12:00:00");
    end.setDate(end.getDate() + 6);
    return `${start.getDate()} – ${end.toLocaleDateString(locale, { day: "numeric", month: "short" })}`;
  }
  return new Date(bucket.iso + "-01T12:00:00").toLocaleDateString(locale, { month: "long", year: "numeric" });
}

/** Répartition par cours sur la période, triée du plus au moins étudié. */
export function courseBreakdown(sessions, courses, range) {
  const inPeriod = sessionsInPeriod(sessions, range);
  const byId = {};
  let total = 0;
  for (const s of inPeriod) {
    const secs = s.duration_seconds || 0;
    total += secs;
    const k = s.course_id || "__none__";
    byId[k] = (byId[k] || 0) + secs;
  }
  const rows = (courses || [])
    .map((c) => ({ id: c.id, name: c.name, color: c.color, secs: byId[c.id] || 0 }))
    .filter((c) => c.secs > 0);
  // Le temps sans cours existe (chrono lancé sans choisir) : le taire ferait des
  // pourcentages qui ne tombent pas sur 100.
  if (byId.__none__ > 0) {
    rows.push({ id: "__none__", name: null, color: "var(--bt-text-3)", secs: byId.__none__ });
  }
  rows.sort((a, b) => b.secs - a.secs);
  return {
    rows: rows.map((r) => ({ ...r, pct: total > 0 ? Math.round((r.secs / total) * 100) : 0 })),
    totalSecs: total,
  };
}

/** Jours avec au moins une session sur la période. */
export function activeDaysIn(sessions, range) {
  const set = new Set(sessionsInPeriod(sessions, range).map((s) => localISO(s.started_at)));
  return set.size;
}
