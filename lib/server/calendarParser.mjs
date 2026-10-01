import ICAL from "ical.js";
import { CalendarError, MAX_FEED_BYTES } from "./calendarFeed.mjs";

export const MAX_EVENTS = 2000;
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

function scrubValues(input, scrub) {
  if (typeof input === "string") return scrub(input);
  if (Array.isArray(input)) return input.map(item => scrubValues(item, scrub));
  if (input && typeof input === "object") return Object.fromEntries(Object.entries(input).map(([key, val]) => [key, scrubValues(val, scrub)]));
  return input;
}

export function parseCalendar(input, { provider = "ical", feedUrl = null } = {}) {
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
    if (components.length > MAX_EVENTS) throw new Error();
    const scrub = redactor(feedUrl);
    const records = new Map();
    const calendarZone = text(root, "x-wr-timezone") || null;
    for (const component of components) {
      const uid = text(component, "uid");
      if (!uid || uid.length > 1024) throw new Error();
      const start = dateValue(component, "dtstart", calendarZone);
      const end = dateValue(component, "dtend", calendarZone);
      const due = dateValue(component, "due", calendarZone);
      const recurrence = dateValue(component, "recurrence-id", calendarZone);
      const status = text(component, "status").toUpperCase();
      if (!start && !due && status !== "CANCELLED") throw new Error();
      const title = text(component, "summary");
      const url = safeEventUrl(text(component, "url"));
      const course = courseIdentity(provider, url, title, feedUrl);
      const metadata = {
        calendar_name: text(root, "x-wr-calname") || null,
        categories: component.getAllProperties("categories").flatMap(p => p.getValues().map(String)),
        course_fields: component.getAllProperties().filter(p => /^x-(?:canvas-)?course-(?:id|name|code)$/.test(p.name)).map(p => p.toJSON()),
        recurrence: component.getAllProperties().filter(p => ["rrule", "rdate", "exdate", "duration"].includes(p.name)).map(p => p.toJSON()),
        dates: { start, end, due, recurrence },
      };
      const row = {
        external_uid: uid,
        recurrence_id: recurrence ? recurrence.instant || `${recurrence.zone || "floating"}:${recurrence.local}` : "",
        raw_title: title, description: text(component, "description") || null,
        location: text(component, "location") || null, external_url: url,
        starts_at: start?.instant || null, ends_at: end?.instant || null, due_at: due?.instant || null,
        start_date: start?.date || null, end_date: end?.date || null, due_date: due?.date || null,
        all_day: (start || due)?.allDay || false,
        external_course_key: course.key, external_course_label: course.label,
        provider_updated_at: dateValue(component, "last-modified", null)?.instant || dateValue(component, "dtstamp", null)?.instant || null,
        sequence: Number(value(component, "sequence") || 0), raw_status: status || null,
        status: status === "CANCELLED" ? "cancelled" : "active", metadata,
      };
      if (!Number.isSafeInteger(row.sequence) || row.sequence < 0) throw new Error();
      // Size limits reject the whole snapshot; silently skipping rows would
      // incorrectly mark the previous version of those events as removed.
      const serialized = JSON.stringify(row);
      if (Buffer.byteLength(serialized) > 32768) throw new Error();
      const safeRow = scrubValues(row, scrub);
      if (safeRow.external_url !== row.external_url) safeRow.external_url = null;
      const key = JSON.stringify([safeRow.external_uid, safeRow.recurrence_id]);
      const previous = records.get(key);
      if (!previous || row.sequence > previous.sequence || (row.sequence === previous.sequence && (row.provider_updated_at || "") >= (previous.provider_updated_at || ""))) records.set(key, safeRow);
    }
    return [...records.values()];
  } catch { throw new CalendarError("invalid_calendar_feed", 422); }
}
