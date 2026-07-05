// lib/ics.js — génère un fichier iCalendar (.ics, RFC 5545) à partir du
// planning de l'utilisateur (objectifs + examens), pour l'importer dans
// Google Agenda / Apple Calendrier / Outlook.
//
// Volontairement PUR : aucune dépendance Supabase, aucun état. Reçoit les
// lignes déjà chargées (`objectives`, `exams`), un résolveur `courseName`
// et la fonction i18n `t`, et renvoie une chaîne. Le déclenchement du
// téléchargement (`downloadIcs`) est isolé pour rester testable côté data.
//
// Choix de modélisation :
//  • Événement avec heure  → heure LOCALE flottante (pas de Z / TZID) : un
//    examen à 14:30 reste 14:30 quel que soit le fuseau du calendrier.
//  • Événement sans heure   → journée entière (VALUE=DATE, DTEND exclusif).
//  • Objectif récurrent     → RRULE hebdo (BYDAY) + UNTIL optionnel.
//  • Objectifs déjà `done`  → ignorés (un agenda regarde vers l'avenir).

const DOMAIN = "blocus-tracker.app";

// JS getDay() (0=Dimanche … 6=Samedi) → code jour iCalendar (BYDAY).
// `recurrence_weekdays` stocke justement des valeurs getDay() (cf. planning.js).
const BYDAY = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];

function pad(n) { return String(n).padStart(2, "0"); }

// Échappe une valeur texte selon RFC 5545 §3.3.11.
function esc(str) {
  return String(str == null ? "" : str)
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

// "2026-07-05" → "20260705"
function dateCompact(ymd) { return String(ymd).replace(/-/g, ""); }

// "2026-07-05" + n jours → "20260706" (DTEND all-day est exclusif).
function addDaysCompact(ymd, n) {
  const d = new Date(ymd + "T12:00:00");
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
}

// "2026-07-05" + "14:30" → "20260705T143000" (local flottant).
function dateTimeCompact(ymd, hhmm) {
  const [h, m] = hhmm.split(":");
  return `${dateCompact(ymd)}T${pad(h)}${pad(m)}00`;
}

// Début (ymd, hhmm) + durée en minutes → "YYYYMMDDTHHMMSS" local flottant.
function addMinutesCompact(ymd, hhmm, durationMin) {
  const [h, m] = hhmm.split(":").map(Number);
  const d = new Date(ymd + "T00:00:00");
  d.setHours(h, m + durationMin, 0, 0);
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(d.getHours())}${pad(d.getMinutes())}00`;
}

// Horodatage UTC courant "YYYYMMDDTHHMMSSZ" pour DTSTAMP (obligatoire).
function nowStamp() {
  return new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

// Pliage des lignes trop longues (RFC 5545 §3.1) : coupe à 73 puis
// continue avec CRLF + espace. 73 (< 75) laisse une marge pour les
// accents encodés en UTF-8 sur plusieurs octets.
function fold(line) {
  if (line.length <= 73) return line;
  const chunks = [line.slice(0, 73)];
  let s = line.slice(73);
  while (s.length > 72) { chunks.push(" " + s.slice(0, 72)); s = s.slice(72); }
  if (s.length) chunks.push(" " + s);
  return chunks.join("\r\n");
}

function objectiveEvent(o, { courseName, t, stamp }) {
  const lines = ["BEGIN:VEVENT", `UID:obj-${o.id}@${DOMAIN}`, `DTSTAMP:${stamp}`];
  const minutes = o.target_minutes || 60;

  if (o.scheduled_time) {
    lines.push(`DTSTART:${dateTimeCompact(o.scheduled_date, o.scheduled_time)}`);
    lines.push(`DTEND:${addMinutesCompact(o.scheduled_date, o.scheduled_time, minutes)}`);
  } else {
    lines.push(`DTSTART;VALUE=DATE:${dateCompact(o.scheduled_date)}`);
    lines.push(`DTEND;VALUE=DATE:${addDaysCompact(o.scheduled_date, 1)}`);
  }

  const wk = Array.isArray(o.recurrence_weekdays) ? o.recurrence_weekdays : null;
  if (wk && wk.length) {
    const byday = wk.slice().sort((a, b) => a - b).map(d => BYDAY[d]).filter(Boolean).join(",");
    let rule = `RRULE:FREQ=WEEKLY;BYDAY=${byday}`;
    if (o.recurrence_until) {
      // UNTIL doit correspondre au type de DTSTART : DATE si journée
      // entière, sinon date-heure UTC (fin de journée pour inclure la
      // dernière occurrence locale).
      rule += o.scheduled_time
        ? `;UNTIL=${dateCompact(o.recurrence_until)}T235959Z`
        : `;UNTIL=${dateCompact(o.recurrence_until)}`;
    }
    lines.push(rule);
  }

  const summary = o.title || courseName(o.course_id) || t("plan.icsStudyBlock");
  lines.push(`SUMMARY:${esc(summary)}`);
  const desc = [courseName(o.course_id), `${minutes} min`].filter(Boolean).join(" · ");
  if (desc) lines.push(`DESCRIPTION:${esc(desc)}`);
  lines.push("END:VEVENT");
  return lines;
}

function examEvent(e, { courseName, t, stamp }) {
  const lines = ["BEGIN:VEVENT", `UID:exam-${e.id}@${DOMAIN}`, `DTSTAMP:${stamp}`];

  if (e.exam_time) {
    lines.push(`DTSTART:${dateTimeCompact(e.exam_date, e.exam_time)}`);
    lines.push(`DTEND:${addMinutesCompact(e.exam_date, e.exam_time, 120)}`);
  } else {
    lines.push(`DTSTART;VALUE=DATE:${dateCompact(e.exam_date)}`);
    lines.push(`DTEND;VALUE=DATE:${addDaysCompact(e.exam_date, 1)}`);
  }

  const base = e.name || courseName(e.course_id) || t("plan.icsStudyBlock");
  lines.push(`SUMMARY:${esc(`${t("plan.examPrefix")} — ${base}`)}`);
  if (e.location) lines.push(`LOCATION:${esc(e.location)}`);
  const desc = courseName(e.course_id);
  if (desc) lines.push(`DESCRIPTION:${esc(desc)}`);
  lines.push("END:VEVENT");
  return lines;
}

// Nombre d'événements réellement exportables (pour prévenir si vide).
export function countExportable({ objectives = [], exams = [] }) {
  return objectives.filter(o => !o.done).length + exams.length;
}

export function buildIcs({ objectives = [], exams = [], courseName = () => "", t, calName }) {
  const ctx = { courseName, t, stamp: nowStamp() };
  const events = [];
  objectives.filter(o => !o.done).forEach(o => events.push(...objectiveEvent(o, ctx)));
  exams.forEach(e => events.push(...examEvent(e, ctx)));

  const out = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Blocus Tracker//Planning//FR",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${esc(calName || "Blocus Tracker")}`,
    ...events,
    "END:VCALENDAR",
  ];
  return out.map(fold).join("\r\n") + "\r\n";
}

// Déclenche le téléchargement du .ics côté navigateur.
export function downloadIcs(filename, ics) {
  const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
