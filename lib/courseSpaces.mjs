// Course spaces (Communities phase 2) — pure decisions, no I/O.
//
// Three objects stay distinct (docs/course-spaces.md):
//   - a PERSONAL course (name and color belong to one student),
//   - a CANONICAL course offering (shared title, one institution),
//   - a MEMBERSHIP (always voluntary, never inferred from a link).
// lib/courseSpacesClient.js fetches; these functions decide what the student
// sees. Keeping them pure is what lets tests/course-spaces.test.mjs pin the
// product rules: no suggestion without a real link, at most two questions,
// rejected matches never asked again, no member count under the threshold.
import { STUDY_FIELDS, normalizeStudyName } from "./studySpaces.mjs";

export const MEMBER_COUNT_THRESHOLD = 3;
export const QUESTION_LIMIT = 2;
export const GROUP_WINDOW_MS = 5 * 60 * 1000;
export const MESSAGE_MAX_LENGTH = 1000;

const CONFIDENCE_RANK = { high: 0, medium: 1 };

function byTitle(a, b) {
  return String(a.title || "").localeCompare(String(b.title || ""), undefined, { sensitivity: "base" });
}

function byCourseName(a, b) {
  return String(a.name || "").localeCompare(String(b.name || ""), undefined, { sensitivity: "base" })
    || String(a.id).localeCompare(String(b.id));
}

// "Advertising strategy" and "Advertising Strategy" are the same words; "ADV
// Strat" is not. Only a real difference earns the second line.
export function namesDiffer(personalName, canonicalTitle) {
  const personal = normalizeStudyName(personalName || "");
  return !!personal && personal !== normalizeStudyName(canonicalTitle || "");
}

// The server already withholds counts under the threshold; the client never
// trusts that alone, so "1 student" cannot reappear through a fixture or a
// future RPC.
export function visibleMemberCount(value) {
  const count = Number(value);
  return Number.isFinite(count) && count >= MEMBER_COUNT_THRESHOLD ? count : null;
}

export function isActiveCourse(course) {
  return !!course && !course.archived_at;
}

// Personal courses linked (auto or confirmed) to each offering. Archived
// courses keep their links in the database but no longer lend their color.
export function linkedCoursesByOffering(courses = [], links = []) {
  const active = new Map(courses.filter(isActiveCourse).map((course) => [course.id, course]));
  const map = new Map();
  for (const link of links) {
    if (link.status !== "auto" && link.status !== "confirmed") continue;
    const course = active.get(link.course_id);
    if (!course) continue;
    const list = map.get(link.offering_id) || [];
    if (!list.some((item) => item.id === course.id)) list.push(course);
    map.set(link.offering_id, list);
  }
  for (const list of map.values()) list.sort(byCourseName);
  return map;
}

// One shape for every row: a course space (joined, suggested, searched) or one
// of the two default spaces built from the profile (institution, program).
// `id` is what the page selects on, because a default space has no offering.
export function toSpaceEntry(row, linkedByOffering = new Map()) {
  const courses = linkedByOffering.get(row.offering_id) || [];
  const course = courses[0] || null;
  const title = row.offering_title || row.title || "";
  const kind = row.kind || "course";
  return {
    id: kind === "course" ? `course:${row.offering_id}` : `room:${row.room_id}`,
    kind,
    offeringId: row.offering_id || null,
    title,
    roomId: row.room_id || null,
    joined: !!row.joined,
    memberCount: visibleMemberCount(row.member_count),
    lastMessageAt: row.joined ? row.last_message_at || null : null,
    institutionId: row.institution_id || null,
    institutionName: row.institution_name || null,
    course,
    personalName: course && namesDiffer(course.name, title) ? course.name : null,
  };
}

export function buildCourseSpaceView({ courses = [], links = [], summaries = [], defaults = [] } = {}) {
  const activeCourses = courses.filter(isActiveCourse);
  const activeIds = new Set(activeCourses.map((course) => course.id));
  const linkedByOffering = linkedCoursesByOffering(courses, links);
  const summaryByOffering = new Map(summaries.map((row) => [row.offering_id, row]));
  const titleByOffering = new Map(links.map((link) => [link.offering_id, link.offering_title]));

  const joined = summaries
    .filter((row) => row.joined && row.room_id)
    .map((row) => toSpaceEntry(row, linkedByOffering))
    .sort((a, b) => {
      if (!!a.lastMessageAt !== !!b.lastMessageAt) return a.lastMessageAt ? -1 : 1;
      return (Date.parse(b.lastMessageAt) || 0) - (Date.parse(a.lastMessageAt) || 0) || byTitle(a, b);
    });

  // A suggestion exists only because one of the student's own active courses
  // is linked to that offering. Nothing else — no popularity list, no other
  // institution — can put a course here.
  const suggestions = [...linkedByOffering.keys()]
    .filter((offeringId) => !summaryByOffering.get(offeringId)?.joined)
    .map((offeringId) => toSpaceEntry(
      summaryByOffering.get(offeringId) || { offering_id: offeringId, offering_title: titleByOffering.get(offeringId) },
      linkedByOffering,
    ))
    .sort((a, b) => (b.memberCount || 0) - (a.memberCount || 0) || Number(!!b.roomId) - Number(!!a.roomId) || byTitle(a, b));

  // Questions: an active course without an auto/confirmed link, with a
  // suggested candidate. The server never returns rejected pairs, so a "No"
  // cannot come back. One candidate per course, the most likely first.
  const settled = new Set(links.filter((link) => link.status === "auto" || link.status === "confirmed").map((link) => link.course_id));
  const courseById = new Map(activeCourses.map((course) => [course.id, course]));
  // Equal confidence: the shorter title carries fewer extra qualifiers ("II",
  // a year, a track), then the alphabet keeps the order stable.
  const likelier = (a, b) => a.rank - b.rank
    || String(a.offeringTitle).length - String(b.offeringTitle).length
    || String(a.offeringTitle).localeCompare(String(b.offeringTitle));
  const bestByCourse = new Map();
  for (const link of links) {
    if (link.status !== "suggested" || !activeIds.has(link.course_id) || settled.has(link.course_id)) continue;
    const candidate = { rank: CONFIDENCE_RANK[link.confidence] ?? 9, course: courseById.get(link.course_id), offeringId: link.offering_id, offeringTitle: link.offering_title || "" };
    const current = bestByCourse.get(link.course_id);
    if (!current || likelier(candidate, current) < 0) bestByCourse.set(link.course_id, candidate);
  }
  const allQuestions = [...bestByCourse.values()]
    .sort((a, b) => a.rank - b.rank || byCourseName(a.course, b.course))
    .map(({ course, offeringId, offeringTitle }) => ({ key: `${course.id}:${offeringId}`, course, offeringId, offeringTitle }));

  // The institution and the program of the profile, in that order. They are
  // not suggestions: the student belongs to them, and only leaving removes
  // one (`ensure_my_default_rooms` then offers to join it again).
  const defaultSpaces = defaults
    .map((row) => toSpaceEntry(row))
    .sort((a, b) => Number(a.kind === "program") - Number(b.kind === "program") || byTitle(a, b));

  return {
    defaults: defaultSpaces,
    joined,
    suggestions,
    questions: allQuestions.slice(0, QUESTION_LIMIT),
    pendingQuestions: allQuestions.length,
    activeCourseCount: activeCourses.length,
    linkedByOffering,
  };
}

// What the desktop opens on arrival: the conversation most likely to be worth
// reading. With no course space joined yet, the institution space keeps the
// page from opening on a blank panel — without inventing any content.
export function pickInitialSpace(view) {
  return view.joined[0]
    || view.defaults.find((entry) => entry.kind === "university")
    || view.defaults[0]
    || view.suggestions[0]
    || null;
}

const SMALL_WORDS = /^(of|de|du|des|da|la|le|les|the|and|et|für|van|von)$/i;

// Typographic fallback when an institution has no logo in the project: its
// initials, in ink — never an invented pictogram.
export function universityInitials(name = "") {
  const words = String(name).replace(/[^\p{L}\p{N}\s]/gu, " ").split(/\s+/).filter(Boolean);
  const strong = words.filter((word) => word.length > 2 && !SMALL_WORDS.test(word));
  const picked = strong.length >= 2 ? strong.slice(0, 2) : words.slice(0, 1);
  const initials = picked.length >= 2
    ? picked.map((word) => word[0]).join("")
    : (picked[0] || "").slice(0, 2);
  return initials.toUpperCase() || "?";
}

const FIELD_BY_ENGLISH_NAME = new Map(STUDY_FIELDS.map((field) => [field.en.toLowerCase(), field]));

// A program space created from the broad field carries its English name in the
// database (the taxonomy's own key); the page shows it in the reader's
// language. A free-text program is shown exactly as the student wrote it.
export function programLabel(title = "", lang = "fr") {
  const field = FIELD_BY_ENGLISH_NAME.get(String(title).trim().toLowerCase());
  if (!field) return String(title);
  return lang === "en" ? field.en : field.fr;
}

// Which empty sentence is true. Order matters: without an institution there
// is no boundary to match within; without courses there is nothing to match.
export function coldStartState({ hasInstitution, view }) {
  if (!hasInstitution) return "noInstitution";
  if (!view.activeCourseCount && !view.joined.length) return "noCourses";
  if (!view.joined.length && !view.suggestions.length && !view.questions.length) return "noMatches";
  return null;
}

// ── Room stream ────────────────────────────────────────────────────────────

// Local calendar day of a timestamp or Date, never the UTC day: at 00:30 in
// Brussels, toISOString() still names yesterday.
export function localDayKey(value) {
  const date = value instanceof Date ? value : new Date(value);
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

// Parsed, not compared as text: the server writes "+00:00" and a browser
// writes "Z", and the two spellings do not sort together.
function timeOf(value) {
  const time = Date.parse(value);
  return Number.isFinite(time) ? time : 0;
}

function compareMessages(a, b) {
  const delta = timeOf(a.created_at) - timeOf(b.created_at);
  if (delta) return delta < 0 ? -1 : 1;
  return String(a.id).localeCompare(String(b.id));
}

export function sortMessages(messages = []) {
  return [...messages].sort(compareMessages);
}

// Oldest → newest, one day marker per local day, consecutive messages of one
// author grouped while they stay within five minutes of each other.
export function groupRoomMessages(messages = [], viewerId = null) {
  const items = [];
  let group = null;
  let day = null;
  for (const message of sortMessages(messages)) {
    const messageDay = localDayKey(message.created_at);
    if (messageDay !== day) {
      day = messageDay;
      items.push({ type: "day", key: `day:${messageDay}`, day: messageDay, at: message.created_at });
      group = null;
    }
    const last = group?.messages[group.messages.length - 1];
    const joins = group && group.userId === message.user_id
      && Date.parse(message.created_at) - Date.parse(last.created_at) <= GROUP_WINDOW_MS;
    if (joins) {
      group.messages.push(message);
    } else {
      group = { type: "group", key: `group:${message.id}`, userId: message.user_id, mine: !!viewerId && message.user_id === viewerId, messages: [message] };
      items.push(group);
    }
  }
  return items;
}

// A poll returns the newest page. A page shorter than the page size IS the
// whole visible room: anything missing from it was deleted or hidden. A full
// page keeps the older messages already loaded, but inside the page window the
// server is the truth. Without any overlap a gap would be invisible, so the
// page replaces everything and older history is fetched again on demand.
export function mergeLatestPage(current = [], latest = [], pageSize = Infinity) {
  const page = sortMessages(latest);
  if (page.length < pageSize) return { messages: page, complete: true, reset: false };
  const oldest = page[0];
  const known = sortMessages(current);
  const newestKnown = known[known.length - 1];
  if (!newestKnown || compareMessages(newestKnown, oldest) < 0) return { messages: page, complete: false, reset: true };
  return { messages: [...known.filter((message) => compareMessages(message, oldest) < 0), ...page], complete: false, reset: false };
}

export function mergeOlderPage(current = [], older = []) {
  const ids = new Set(current.map((message) => message.id));
  return sortMessages([...older.filter((message) => !ids.has(message.id)), ...current]);
}

export function newMessagesFromOthers(before = [], after = [], viewerId = null) {
  const ids = new Set(before.map((message) => message.id));
  const newest = before.length ? sortMessages(before)[before.length - 1] : null;
  return after.filter((message) => !ids.has(message.id)
    && message.user_id !== viewerId
    && (!newest || compareMessages(message, newest) > 0)).length;
}

// An exam date students may share. The server accepts yesterday to 730 days
// ahead of ITS current date (UTC); the local bounds stay one day inside that
// window so a date offered here is never refused there around midnight.
export function examDateBounds(now = new Date()) {
  const min = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const max = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 729);
  return { min: localDayKey(min), max: localDayKey(max) };
}

// A file name split for middle truncation: the tail keeps the extension and
// the characters just before it (where versions and chapter numbers live);
// only the head may be shortened, by CSS, and only when space runs out.
export function splitFileName(name = "") {
  const value = String(name);
  const dot = value.lastIndexOf(".");
  const extension = dot > 0 && value.length - dot <= 6 ? value.length - dot : 0;
  const tailLength = Math.min(extension + 8, Math.floor(value.length / 2));
  return { head: value.slice(0, value.length - tailLength), tail: value.slice(value.length - tailLength) };
}

// A shared exam date is "already in your planning" when the student has an
// exam that day on the same personal course — or, without a linked course,
// under the same name Blocus would have given it.
export function isSharedExamPlanned(exams = [], { examDate, courseId = null, name = "" }) {
  return exams.some((exam) => exam.exam_date === examDate && (courseId ? exam.course_id === courseId : exam.name === name));
}

const SERVER_ERRORS = [
  ["Rate limit exceeded", "rate"],
  ["Duplicate message", "duplicate"],
  ["Message too long", "tooLong"],
  ["Empty message", "empty"],
  ["Invalid attachment", "attachment"],
  ["Invalid exam date", "examDate"],
  ["Join this course space to post", "notMember"],
  ["Too many course spaces", "tooMany"],
  ["Course space not available", "unavailable"],
  ["Message not available", "unavailable"],
  ["Cannot report your own message", "ownReport"],
];

// Server messages are stable English sentences (see the migration); the UI
// shows its own translated sentence for each, never the raw text.
export function courseSpaceErrorKey(error, context = "post") {
  const message = String(error?.message || error || "");
  const match = SERVER_ERRORS.find(([text]) => message.includes(text));
  if (!match) return "courseSpaces.error.generic";
  if (match[1] === "rate" && context === "report") return "courseSpaces.error.reportRate";
  return `courseSpaces.error.${match[1]}`;
}
