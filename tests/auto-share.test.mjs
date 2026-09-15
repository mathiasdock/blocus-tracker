import test from "node:test";
import assert from "node:assert/strict";
import { autoSharePost, flushAutoShare, loadAutoShare, writeAutoShare, validActivity, shareSavedSession } from "../lib/autoShare.js";
const storage = new Map();
global.window = { localStorage: { getItem: k => storage.get(k) ?? null, setItem: (k, v) => storage.set(k, v) } };
function database() {
  const rows = [];
  const settings = new Map();
  let fail = false;
  return {
    rows, settings, setFail: value => { fail = value; },
    from(table) {
      let user;
      const q = {
        select() { return q; }, eq(key, value) { user = value; return q; },
        async maybeSingle() { return { data: table === "auto_share_settings" ? { preferences: settings.get(user) } : { name: "Marketing", color: "#ee4488" } }; },
        async upsert(row) { if (fail) return { error: { code: "network" } }; settings.set(row.user_id, row.preferences); return {}; },
        async insert(row) {
          if (fail) return { error: { code: "network" } };
          if (rows.some(r => r.user_id === row.user_id && r.auto_event_key === row.auto_event_key)) return { error: { code: "23505" } };
          rows.push(row); return {};
        },
      }; return q;
    },
  };
}
const event = userId => ({ userId, kind: "session_completed", eventKey: "session1", activity: { version: 1, type: "session_completed", seconds: 2700 } });
test("unstructured, unknown and zero-duration events cannot publish", async () => {
  const db = database();
  db.settings.set("quality", { session_completed: true });
  for (const seconds of [0, 59, NaN, -1]) assert.equal(await autoSharePost(db, { ...event("quality"), activity: { version: 1, type: "session_completed", seconds } }), false);
  assert.equal(validActivity("record", { version: 1, type: "record" }), false);
  assert.equal(validActivity("goal_completed", { version: 1, type: "goal_completed", title: " " }), false);
  assert.equal(db.rows.length, 0);
});
test("off means off; consent is account scoped", async () => {
  const db = database(); db.settings.set("enabled", { session_completed: true });
  await autoSharePost(db, event("enabled"));
  await autoSharePost(db, event("disabled"));
  assert.equal(db.rows.length, 1);
  assert.equal(db.rows[0].visibility, "friends");
});
test("concurrent/repeated calls dedupe, distinct sessions on same day publish", async () => {
  const db = database(); db.settings.set("dedupe", { session_completed: true });
  await Promise.all([autoSharePost(db, event("dedupe")), autoSharePost(db, event("dedupe"))]);
  await autoSharePost(db, event("dedupe"));
  await autoSharePost(db, { ...event("dedupe"), eventKey: "session2" });
  assert.equal(db.rows.length, 2);
});
test("failed delivery retries without widening visibility", async () => {
  const db = database(); db.settings.set("retry", { session_completed: true, visibility: "friends" });
  db.setFail(true); assert.equal(await autoSharePost(db, event("retry")), false);
  db.settings.set("retry", { session_completed: true, visibility: "public" });
  db.setFail(false); await flushAutoShare(db, "retry");
  assert.equal(db.rows.length, 1); assert.equal(db.rows[0].visibility, "friends");
  await flushAutoShare(db, "retry"); assert.equal(db.rows.length, 1);
});
test("disabling consent cancels pending publication", async () => {
  const db = database(); db.settings.set("cancel", { session_completed: true });
  db.setFail(true); await autoSharePost(db, event("cancel"));
  db.settings.set("cancel", { session_completed: false });
  db.setFail(false); await flushAutoShare(db, "cancel");
  assert.equal(db.rows.length, 0);
});
test("same identifier in different event types does not collide in retry queue", async () => {
  const db = database(); db.settings.set("types", { level_up: true, streak: true });
  db.setFail(true);
  await autoSharePost(db, { userId: "types", kind: "level_up", eventKey: "14", activity: { version: 1, type: "level_up", level: 14 } });
  await autoSharePost(db, { userId: "types", kind: "streak", eventKey: "14", activity: { version: 1, type: "streak", days: 14 } });
  db.setFail(false); await flushAutoShare(db, "types"); assert.equal(db.rows.length, 2);
});
test("preferences persist remotely and failed settings saves reject", async () => {
  const db = database();
  await writeAutoShare(db, "settings", { badge_unlocked: true });
  assert.equal((await loadAutoShare(db, "settings")).badge_unlocked, true);
  db.setFail(true); await assert.rejects(writeAutoShare(db, "settings", { badge_unlocked: false }));
  assert.equal(db.settings.get("settings").badge_unlocked, true);
});
test("saved session never leaks its private note and uses course snapshot", async () => {
  const db = database(); db.settings.set("session", { session_completed: true });
  await shareSavedSession(db, { id: "s", user_id: "session", duration_seconds: 120, course_id: "c", note: "private" });
  assert.equal(db.rows[0].activity.courseName, "Marketing");
  assert.equal(JSON.stringify(db.rows).includes("private"), false);
});
