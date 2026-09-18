// Activity (/feed) — pure decisions, no I/O.
//
// Activity answers one question: "what meaningful study happened around me?"
// Two registers, and the split is decided here rather than in the page:
//   - ORDINARY STUDY  → one quiet row: person, course, duration, time.
//   - ACCOMPLISHMENT  → a real Blocus object (badge, level seal, flame).
// A manual post is neither: it is someone's own words, shown as written.
//
// Everything below is a rule the tests pin (tests/activity-feed.test.mjs):
// what may be published at all, what is grouped, what is never inferred.

// A session worth telling someone about. Below this it is a false start, a
// mis-tap or a two-minute look at a slide — the study still counts everywhere
// else in Blocus (Stats, streak, XP), it just does not become a social event.
export const SESSION_SHARE_MIN_SECONDS = 20 * 60;
// The same recurring objective ("Réviser le chapitre 4", every Monday) is a
// real accomplishment each time, but socially it is the same sentence: it is
// announced once a week at most.
export const GOAL_REPEAT_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
// Server bounds, unchanged: one minute (an event already published stays
// readable) up to a week.
const SESSION_MIN_SECONDS = 60;
const SESSION_MAX_SECONDS = 604800;

export const ACHIEVEMENT_TYPES = new Set(["badge_unlocked", "level_up", "streak"]);

// The only shapes Activity interprets. Anything else — including a legacy
// caption that happens to read like an achievement — stays plain text: an
// accomplishment is never inferred from free text.
export function validActivity(kind, data) {
  if (!data || data.version !== 1 || data.type !== kind) return false;
  if (kind === "session_completed") {
    return Number.isFinite(data.seconds) && data.seconds >= SESSION_MIN_SECONDS && data.seconds <= SESSION_MAX_SECONDS;
  }
  if (kind === "level_up") return Number.isInteger(data.level) && data.level > 1 && data.level <= 10000;
  if (kind === "streak") return Number.isInteger(data.days) && data.days > 1 && data.days <= 100000;
  if (kind === "badge_unlocked") return typeof data.badgeId === "string" && data.badgeId.length > 0;
  if (kind === "goal_completed") return typeof data.title === "string" && data.title.trim().length > 0;
  return false;
}

// Publishing rule, applied before a post is created — never at display time,
// so an event already shared keeps rendering as what it was.
export function isSharableSession(seconds) {
  return Number.isFinite(seconds) && seconds >= SESSION_SHARE_MIN_SECONDS;
}

export function normalizeGoalTitle(title = "") {
  return String(title).trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ");
}

// True when this exact objective was already announced recently. `posts` are
// the caller's own recent rows; an empty list means "nothing known", so the
// objective is published — a failed lookup must never silence a real event.
export function goalAlreadyShared(posts = [], title = "", now = Date.now()) {
  const key = normalizeGoalTitle(title);
  if (!key) return false;
  return posts.some((post) => {
    const activity = post?.activity;
    if (!validActivity("goal_completed", activity)) return false;
    if (normalizeGoalTitle(activity.title) !== key) return false;
    const at = Date.parse(post.created_at);
    return Number.isFinite(at) && now - at < GOAL_REPEAT_WINDOW_MS;
  });
}

// Local calendar day, never the UTC one: at 00:30 in Brussels a session
// belongs to the evening that just ended, not to tomorrow.
export function localDayKey(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function timeOf(value) {
  const time = Date.parse(value);
  return Number.isFinite(time) ? time : 0;
}

// What register a row belongs to. `session` and `goal` carry data; an
// achievement carries an object; everything else is someone's own words.
export function entryKindOf(post) {
  const type = post?.activity?.type;
  if (type && validActivity(type, post.activity)) {
    if (type === "session_completed") return "session";
    if (type === "goal_completed") return "goal";
    if (ACHIEVEMENT_TYPES.has(type)) return "achievement";
  }
  return "note";
}

// Courses of a grouped day, longest first. A session without a course keeps
// its time in the total and adds no name: no invented academic identity.
function mergeCourse(courses, activity) {
  const name = typeof activity.courseName === "string" ? activity.courseName.trim() : "";
  if (!name) return;
  const color = /^#[0-9a-f]{6}$/i.test(activity.courseColor || "") ? activity.courseColor : null;
  const found = courses.find((course) => course.name === name);
  if (found) {
    found.seconds += activity.seconds;
    if (!found.color && color) found.color = color;
    return;
  }
  courses.push({ name, color, seconds: activity.seconds });
}

/**
 * The timeline, newest first.
 *
 * Sessions of one student on one local day collapse into a single row carrying
 * the total — "Tom a étudié 2 h 35 aujourd'hui" — placed at the time of their
 * most recent session. Everyone else's events keep their own place in the
 * chronology, so nothing is reordered to make the grouping possible. The total
 * is the exact sum of the sessions actually shared, never a rounded figure.
 *
 * Achievements and manual posts are never grouped: two badges are two events.
 */
export function buildActivityTimeline({ posts = [], blockedIds = [] } = {}) {
  const blocked = blockedIds instanceof Set ? blockedIds : new Set(blockedIds);
  const ordered = [...posts]
    .filter((post) => post && !blocked.has(post.user_id))
    .sort((a, b) => timeOf(b.created_at) - timeOf(a.created_at) || String(a.id).localeCompare(String(b.id)));

  const items = [];
  const groups = new Map();
  for (const post of ordered) {
    const kind = entryKindOf(post);
    const at = post.created_at;
    if (kind === "session") {
      const day = localDayKey(at);
      const key = `${post.user_id}:${day}`;
      const group = groups.get(key);
      if (group) {
        group.seconds += post.activity.seconds;
        group.count += 1;
        group.since = at;
        group.posts.push(post);
        mergeCourse(group.courses, post.activity);
        continue;
      }
      const entry = {
        type: "session", key: `session:${key}`, userId: post.user_id, day, at, since: at,
        seconds: post.activity.seconds, count: 1, courses: [], posts: [post], post,
      };
      mergeCourse(entry.courses, post.activity);
      groups.set(key, entry);
      items.push(entry);
      continue;
    }
    items.push({
      type: kind === "achievement" ? "achievement" : kind === "goal" ? "goal" : "note",
      key: `${kind}:${post.id}`, userId: post.user_id, at, post,
      achievement: kind === "achievement" ? post.activity.type : null,
    });
  }

  for (const entry of items) {
    if (entry.type === "session") entry.courses.sort((a, b) => b.seconds - a.seconds || a.name.localeCompare(b.name));
  }

  // Day markers are inserted last, over the final order: a grouped session sits
  // at its newest event, and that is the day it is announced under.
  const withDays = [];
  let day = null;
  for (const entry of items) {
    const entryDay = localDayKey(entry.at);
    if (entryDay !== day) {
      day = entryDay;
      withDays.push({ type: "day", key: `day:${entryDay}`, day: entryDay, at: entry.at });
    }
    withDays.push(entry);
  }
  return withDays;
}

// Rows that carry an author's reaction target. An ordinary study row keeps its
// encouragement (that is the whole point of seeing it), but never a comment
// thread: a conversation belongs in Friends.
// A grouped day is encouraged through its most recent session — the row the
// reader is actually looking at. `post` is that row for every entry type.
export function reactionTarget(entry) {
  return entry.post;
}

export function allowsComments(entry) {
  return entry.type === "note" || entry.type === "achievement" || entry.type === "goal";
}

// Which sentence the empty timeline tells. Never "no activity" when the load
// failed, never an invitation to share when the student already shares.
export function emptyStateKind({ loadState, itemCount, sharesSomething }) {
  if (loadState === "error") return "error";
  if (loadState !== "ready" || itemCount > 0) return null;
  return sharesSomething ? "quiet" : "offer";
}
