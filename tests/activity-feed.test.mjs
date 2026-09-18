import test from "node:test";
import assert from "node:assert/strict";
import {
  GOAL_REPEAT_WINDOW_MS,
  SESSION_SHARE_MIN_SECONDS,
  allowsComments,
  buildActivityTimeline,
  emptyStateKind,
  entryKindOf,
  goalAlreadyShared,
  isSharableSession,
  reactionTarget,
  validActivity,
} from "../lib/activityFeed.mjs";

const at = (hour, minute = 0, day = 17) => new Date(2026, 8, day, hour, minute).toISOString();
const session = (id, user, seconds, course, when) => ({
  id, user_id: user, created_at: when,
  activity: { version: 1, type: "session_completed", seconds, courseName: course?.name || "", courseColor: course?.color || "" },
});

test("a session under twenty minutes is never published, the study itself is untouched", () => {
  assert.equal(SESSION_SHARE_MIN_SECONDS, 1200);
  assert.equal(isSharableSession(70), false);
  assert.equal(isSharableSession(19 * 60), false);
  assert.equal(isSharableSession(20 * 60), true);
  // An event already published stays readable: display validity keeps the
  // one-minute floor, only publishing uses the threshold.
  assert.equal(validActivity("session_completed", { version: 1, type: "session_completed", seconds: 70 }), true);
  assert.equal(validActivity("session_completed", { version: 1, type: "session_completed", seconds: 30 }), false);
});

test("sessions of one student on one day become one row with the exact total", () => {
  const items = buildActivityTimeline({
    posts: [
      session("s1", "tom", 3600, { name: "Droit civil", color: "#3b82f6" }, at(9)),
      session("s2", "tom", 2100, { name: "Droit civil", color: "#3b82f6" }, at(14)),
      session("s3", "tom", 1500, { name: "Macro", color: "#ec4899" }, at(16)),
    ],
  });
  const rows = items.filter((item) => item.type === "session");
  assert.equal(rows.length, 1);
  assert.equal(rows[0].seconds, 7200);
  assert.equal(rows[0].count, 3);
  assert.equal(rows[0].at, at(16), "the row sits at the most recent session");
  assert.deepEqual(rows[0].courses.map((course) => course.name), ["Droit civil", "Macro"]);
  assert.equal(rows[0].courses[0].seconds, 5700, "the longest course leads");
});

test("two students are never merged, and another day is another row", () => {
  const items = buildActivityTimeline({
    posts: [
      session("a", "tom", 1800, { name: "Droit" }, at(10)),
      session("b", "lina", 1800, { name: "Droit" }, at(11)),
      session("c", "tom", 1800, { name: "Droit" }, at(10, 0, 16)),
    ],
  });
  assert.equal(items.filter((item) => item.type === "session").length, 3);
  assert.equal(items.filter((item) => item.type === "day").length, 2);
});

test("an achievement is never grouped and keeps its own place in the chronology", () => {
  const items = buildActivityTimeline({
    posts: [
      session("s1", "tom", 1800, { name: "Droit" }, at(9)),
      { id: "b1", user_id: "tom", created_at: at(12), activity: { version: 1, type: "badge_unlocked", badgeId: "first-session" } },
      session("s2", "tom", 1800, { name: "Droit" }, at(15)),
      { id: "l1", user_id: "tom", created_at: at(16), activity: { version: 1, type: "level_up", level: 4 } },
    ],
  });
  const kinds = items.filter((item) => item.type !== "day").map((item) => item.type);
  // Newest first: level, session group (placed at 15 h, carrying both), badge.
  assert.deepEqual(kinds, ["achievement", "session", "achievement"]);
  const group = items.find((item) => item.type === "session");
  assert.equal(group.count, 2);
  assert.equal(group.seconds, 3600);
});

test("a session without a course keeps its time and invents no identity", () => {
  const [, row] = buildActivityTimeline({ posts: [session("s", "tom", 2400, null, at(9))] });
  assert.equal(row.seconds, 2400);
  assert.deepEqual(row.courses, []);
});

test("a blocked student disappears from the timeline entirely", () => {
  const items = buildActivityTimeline({
    posts: [session("s1", "tom", 1800, { name: "Droit" }, at(9)), session("s2", "spam", 1800, { name: "Droit" }, at(10))],
    blockedIds: ["spam"],
  });
  assert.equal(items.filter((item) => item.type === "session").length, 1);
  assert.equal(items.find((item) => item.type === "session").userId, "tom");
});

test("a legacy caption is words, never a deduced achievement", () => {
  const post = { id: "p", user_id: "tom", created_at: at(9), caption: "A terminé une session de 1 h 45 en Droit civil." };
  assert.equal(entryKindOf(post), "note");
  assert.equal(entryKindOf({ ...post, activity: { type: "badge_unlocked" } }), "note", "unversioned data is not an event");
  assert.equal(entryKindOf({ ...post, activity: { version: 1, type: "streak", days: 7 } }), "achievement");
});

test("the same recurring objective is announced once a week, a different one always", () => {
  const now = Date.parse(at(18));
  const posted = (title, when) => ({ created_at: when, activity: { version: 1, type: "goal_completed", title } });
  const recent = [posted("Réviser le chapitre 4", at(9)), posted("Faire les annales", at(9, 0, 10))];
  assert.equal(goalAlreadyShared(recent, "reviser le chapitre 4", now), true, "accents and case are the same objective");
  assert.equal(goalAlreadyShared(recent, "Réviser le chapitre 5", now), false);
  assert.equal(goalAlreadyShared(recent, "Faire les annales", now), false, "eight days ago is a new accomplishment");
  assert.equal(goalAlreadyShared([], "Réviser le chapitre 4", now), false, "nothing known means the event is published");
  assert.equal(GOAL_REPEAT_WINDOW_MS, 7 * 24 * 60 * 60 * 1000);
});

test("study rows carry encouragement, conversations stay in Friends", () => {
  const items = buildActivityTimeline({
    posts: [session("s1", "tom", 1800, null, at(9)), session("s2", "tom", 1800, null, at(10))],
  });
  const row = items.find((item) => item.type === "session");
  assert.equal(reactionTarget(row).id, "s2", "the newest session of the day carries the reaction");
  assert.equal(allowsComments(row), false);
  assert.equal(allowsComments({ type: "note", post: {} }), true);
  assert.equal(allowsComments({ type: "achievement", post: {} }), true);
});

test("an empty timeline says why it is empty", () => {
  assert.equal(emptyStateKind({ loadState: "error", itemCount: 0 }), "error");
  assert.equal(emptyStateKind({ loadState: "error", itemCount: 4 }), "error");
  assert.equal(emptyStateKind({ loadState: "loading", itemCount: 0 }), null);
  assert.equal(emptyStateKind({ loadState: "ready", itemCount: 2 }), null);
  assert.equal(emptyStateKind({ loadState: "ready", itemCount: 0, sharesSomething: false }), "offer");
  assert.equal(emptyStateKind({ loadState: "ready", itemCount: 0, sharesSomething: true }), "quiet");
});
