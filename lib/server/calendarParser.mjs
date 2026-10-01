import ICAL from "ical.js";
import { CalendarError, MAX_FEED_BYTES } from "./calendarFeed.mjs";

export const MAX_COMPONENTS = 2000;
export const MAX_EVENTS = 300;
export const FIELD_BYTES = Object.freeze({ uid: 255, title: 160, excerpt: 120, courseKey: 96, courseLabel: 80, url: 384, hint: 96, recurrence: 80 });
export const PAST_DAYS = 45;
export const FUTURE_DAYS = 365;
const DAY = 86400000;

export function shortText(input, bytes) {
  // Persist plain text only; the excerpt is never HTML to render.
  // Bound sanitizing work too, including adversarial strings of unclosed '<'.
  const prefix = String(input).slice(0, 2048).replace(/[\uD800-\uDBFF]$/, "");
  const clean = prefix.replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style\s*>/gi, " ").replace(/<[^>]*>/g, " ")
    .replace(/&(?:nbsp|amp|lt|gt|quot|apos);|&#(?:x[0-9a-f]+|\d+);/gi, " ")
    .replace(/[\u0000-\u001f\u007f<>]/g, " ").replace(/\s+/g, " ").trim();
  let result = "", used = 0;
  for (const char of clean) { used += Buffer.byteLength(char); if (used > bytes) break; result += char; }
  return result.trim();
}

function bounded(input, bytes) {
  if (Buffer.byteLength(input) > bytes || input.includes("\u0000")) throw new Error("field_limit");
  return input;
}
const value = (component, name) => component.getFirstPropertyValue(name);
const text = (component, name) => String(value(component, name) ?? "");

// ICAL handles embedded VTIMEZONE. For feeds omitting it, use Node's IANA
// database. Floating times stay floating; never apply the server's timezone.
function ianaInstant(local, zone) {
  const formatter = new Intl.DateTimeFormat("en-GB", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" });
  const wall = Date.parse(`${local}Z`);
  const candidates = new Set();
  for (const delta of [-86400000, 0, 86400000]) {
    const probe = wall + delta;
    const parts = Object.fromEntries(formatter.formatToParts(probe).map(p => [p.type, p.value]));
    const offset = Date.parse(`${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}Z`) - probe;
    const candidate = wall - offset;
    const actual = Object.fromEntries(formatter.formatToParts(candidate).map(p => [p.type, p.value]));
    if (`${actual.year}-${actual.month}-${actual.day}T${actual.hour}:${actual.minute}:${actual.second}` === local) candidates.add(candidate);
  }
  if (!candidates.size) throw new Error("nonexistent_local_time");
  return new Date(Math.min(...candidates)).toISOString(); // RFC: first occurrence of an ambiguous local time.
}

function dateValue(component, name, fallbackZone) {
  const property = component.getFirstProperty(name);
  if (!property) return null;
  const raw = property.toJSON()[3];
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}):(\d{2})(Z)?)?$/.exec(raw);
  if (!match) throw new Error("invalid_date");
  const [, year, month, day, hour, minute, second] = match;
  const check = new Date(`${year}-${month}-${day}T00:00:00Z`);
  if (check.toISOString().slice(0, 10) !== `${year}-${month}-${day}` || +(hour || 0) > 23 || +(minute || 0) > 59 || +(second || 0) > 59) throw new Error("invalid_date");
  const time = property.getFirstValue();
  if (time.isDate) return { local: time.toString(), date: time.toString(), instant: null, zone: null, allDay: true };
  const local = raw.replace(/Z$/, "");
  const zone = raw.endsWith("Z") ? "UTC" : property.getParameter("tzid") || fallbackZone || null;
  let instant = null;
  if (zone === "UTC" || zone === "Etc/UTC" || zone === "GMT") instant = `${local}.000Z`;
  else if (zone) {
    const embedded = component.getTimeZoneByID(zone);
    if (embedded) { time.zone = embedded; instant = time.toJSDate().toISOString(); }
    else instant = ianaInstant(local, zone);
  }
  return { local, instant, date: null, zone, allDay: false };
}

function courseIdentity(provider, eventUrl, title, feedUrl) {
  if (provider !== "canvas" || !eventUrl) return { key: null, label: null };
  try {
    const url = new URL(eventUrl);
    if (feedUrl && url.origin !== new URL(feedUrl).origin) return { key: null, label: null };
    if (url.searchParams.getAll("include_contexts").length > 1) return { key: null, label: null };
    const context = url.searchParams.get("include_contexts");
    const pathId = /^\/courses\/(\d+)(?:\/|$)/.exec(url.pathname)?.[1];
    const contextId = /^course_(\d+)$/.exec(context || "")?.[1];
    if ((context && !contextId) || (pathId && contextId && pathId !== contextId)) return { key: null, label: null };
    const id = contextId || pathId;
    return { key: id ? `canvas:course:${id}` : null, label: id ? /\[([^\[\]]+)\]\s*$/.exec(title)?.[1] || null : null };
  } catch { return { key: null, label: null }; }
}

function safeEventUrl(input) {
  try { const url = new URL(input); return ["https:", "http:"].includes(url.protocol) && !url.username && !url.password ? url.href : null; }
  catch { return null; }
}

// Defend against an upstream feed reflecting its subscription secret in text.
function redactor(feedUrl) {
  if (!feedUrl) return s => s;
  const url = new URL(feedUrl);
  const secrets = [feedUrl, ...[...url.searchParams.values(), ...url.pathname.split("/")].filter(s => s.length >= 16)];
  return s => secrets.reduce((result, secret) => result.split(secret).join("[redacted]"), s);
}

export function parseCalendar(input, { provider = "ical", feedUrl = null, now = new Date() } = {}) {
  try {
    if (typeof input !== "string" || Buffer.byteLength(input) > MAX_FEED_BYTES) throw new Error();
    const trimmed = input.replace(/^\uFEFF/, "").trim();
    if (!/^BEGIN:VCALENDAR\r?\n/i.test(trimmed) || !/\r?\nEND:VCALENDAR$/i.test(trimmed)) throw new Error();
    const root = new ICAL.Component(ICAL.parse(trimmed));
    if (root.name !== "vcalendar" || text(root, "version") !== "2.0") throw new Error();
    // A sync requires a full snapshot, not an invitation/update fragment.
    const method = text(root, "method").toUpperCase();
    if (method && method !== "PUBLISH") throw new Error();
    if (root.getAllSubcomponents().some(c => !["vevent", "vtimezone"].includes(c.name))) throw new Error();
    const components = root.getAllSubcomponents("vevent");
    if (components.length > MAX_COMPONENTS) throw new Error();
    const scrub = redactor(feedUrl);
    const records = new Map();
    const calendarZone = text(root, "x-wr-timezone") || null;
    for (const component of components) {
      const uid = text(component, "uid");
      if (!uid) throw new Error();
      bounded(uid, FIELD_BYTES.uid);
      const start = dateValue(component, "dtstart", calendarZone);
      dateValue(component, "dtend", calendarZone); // Validate, but no end-date archive.
      const due = dateValue(component, "due", calendarZone);
      const recurrence = dateValue(component, "recurrence-id", calendarZone);
      const status = text(component, "status").toUpperCase();
      if (!start && !due && status !== "CANCELLED") throw new Error();
      const title = text(component, "summary");
      const url = safeEventUrl(text(component, "url"));
      const course = courseIdentity(provider, url, title, feedUrl);
      const sequence = Number(value(component, "sequence") || 0);
      if (!Number.isSafeInteger(sequence) || sequence < 0) throw new Error();
      const providerUpdated = dateValue(component, "last-modified", null)?.instant || dateValue(component, "dtstamp", null)?.instant || "";
      const relevantDate = due || start;
      const recurrenceId = recurrence ? recurrence.instant || `${recurrence.zone || "floating"}:${recurrence.local}` : "";
      // Only a bounded course-evidence hint for ambiguous events, not arbitrary
      // provider JSON. Reliable Canvas course identities need no duplicate hint.
      const hint = course.key ? null : shortText(scrub([
        ...component.getAllProperties().filter(p => /^x-(?:canvas-)?course-(?:id|name|code)$/.test(p.name)).map(p => `${p.name}:${p.getFirstValue()}`),
        ...component.getAllProperties("categories").flatMap(p => p.getValues().map(String)),
        text(component, "location"), text(root, "x-wr-calname"),
      ].filter(Boolean).join("; ")), FIELD_BYTES.hint) || null;
      const row = {
        external_uid: bounded(scrub(uid), FIELD_BYTES.uid),
        recurrence_id: bounded(scrub(recurrenceId), FIELD_BYTES.recurrence),
        raw_title: shortText(scrub(title), FIELD_BYTES.title),
        description_excerpt: shortText(scrub(text(component, "description")), FIELD_BYTES.excerpt) || null,
        external_url: url && scrub(url) === url && Buffer.byteLength(url) <= FIELD_BYTES.url ? url : null,
        starts_at: start?.instant || null, due_at: due?.instant || null,
        // DATE for all-day/retention; floating timestamp never invents an offset.
        event_date: relevantDate ? (relevantDate.instant || relevantDate.local).slice(0, 10) : null,
        floating_at: relevantDate && !relevantDate.instant && !relevantDate.allDay ? relevantDate.local : null,
        all_day: relevantDate?.allDay || false,
        external_course_key: course.key ? bounded(course.key, FIELD_BYTES.courseKey) : null,
        external_course_label: course.label ? shortText(scrub(course.label), FIELD_BYTES.courseLabel) : null,
        course_hint: hint, is_recurring: component.hasProperty("rrule") || component.hasProperty("rdate"),
        status: status === "CANCELLED" ? "cancelled" : "active",
      };
      const key = JSON.stringify([row.external_uid, row.recurrence_id]);
      const previous = records.get(key);
      if (!previous || sequence > previous.sequence || (sequence === previous.sequence && providerUpdated >= previous.providerUpdated)) records.set(key, { row, sequence, providerUpdated });
    }
    const today = Date.parse(new Date(now).toISOString().slice(0, 10));
    const earliest = new Date(today - PAST_DAYS * DAY).toISOString().slice(0, 10);
    const latest = new Date(today + FUTURE_DAYS * DAY).toISOString().slice(0, 10);
    const retained = [...records.values()].map(entry => entry.row)
      .filter(row => row.status === "active" && row.event_date >= earliest && row.event_date <= latest);
    if (retained.length > MAX_EVENTS) throw new CalendarError("calendar_event_limit", 422);
    return retained;
  } catch (error) {
    if (error instanceof CalendarError) throw error;
    throw new CalendarError("invalid_calendar_feed", 422);
  }
}
