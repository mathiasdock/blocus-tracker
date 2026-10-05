import test from "node:test";
import assert from "node:assert/strict";
import { changeProfileFriendship, loadSocialProfile, profileCourses, publicProfileProgression, sharedBadgeHighlights } from "../lib/socialProfile.mjs";

function fakeClient({ relationship = null, statsError = null, progressionError = null, profile = { id: "peer", university: "UCF" }, mutationError = null } = {}) {
  const calls = [];
  const client = {
    calls,
    from(table) {
      const call = { table, fields: "", filters: [], mode: "read" }; calls.push(call);
      const q = {};
      for (const method of ["select", "eq", "is", "or", "in", "order", "limit", "maybeSingle", "single", "insert", "update", "delete"]) {
        q[method] = (...args) => {
          if (method === "select") call.fields = args[0];
          else if (["insert", "update", "delete"].includes(method)) { call.mode = method; call.payload = args[0]; }
          else call.filters.push([method, ...args]);
          return q;
        };
      }
      q.then = (resolve, reject) => Promise.resolve(call.mode !== "read"
        ? { data: call.mode === "delete" ? null : { id: "link", requester: "me", addressee: "peer", status: call.payload.status }, error: mutationError }
        : { data: table === "profiles" ? profile : table === "friendships" ? relationship : [], error: null }).then(resolve, reject);
      return q;
    },
    rpc(name, params) {
      calls.push({ rpc: name, params });
      return Promise.resolve(name === "get_gamification_levels"
        ? { data: [{ total_xp: 400, streak: 1, badge_count: 3, private_field: "excluded" }], error: progressionError }
        : { data: [{ seconds_30d: 3600, total_seconds: 50000 }], error: statsError });
    },
  };
  return client;
}

test("non-friend profile only uses public aggregate RPC and explicitly shared achievements", async () => {
  const client = fakeClient();
  const result = await loadSocialProfile(client, "me", "peer");
  assert.equal(result.seconds30d, null);
  assert.equal(result.courses, null);
  assert.deepEqual(result.progression, { totalXP: 400, streak: 1, badgeCount: 3 });
  assert.equal(client.calls.some(c => c.rpc === "get_user_profile_stats" || c.table === "courses"), false);
  assert.equal(client.calls.some(c => ["sessions", "objectives", "exams", "user_badges"].includes(c.table)), false);
  const postQuery = client.calls.find(c => c.table === "posts");
  assert.deepEqual(postQuery.filters.find(f => f[0] === "in"), ["in", "visibility", ["public"]]);
  assert.equal(client.calls[0].fields.includes("studying_since"), false);
  assert.equal(client.calls[0].fields.includes("email"), false);
});

test("friends read the existing 30-day aggregate and limited course fields, never exam data", async () => {
  const client = fakeClient({ relationship: { id: "link", status: "accepted", requester: "me", addressee: "peer" } });
  const result = await loadSocialProfile(client, "me", "peer");
  assert.equal(result.seconds30d, 3600);
  assert.equal("totalSeconds" in result, false);
  const courseQueries = client.calls.filter(c => c.table === "courses");
  assert.equal(courseQueries.length, 2);
  assert.ok(courseQueries.every(c => c.fields === "id,name,color,study_institution_id"));
  assert.deepEqual(client.calls.find(c => c.table === "posts").filters.find(f => f[0] === "in"), ["in", "visibility", ["public", "friends"]]);
});

test("pending friendship is not permission to read study data", async () => {
  const client = fakeClient({ relationship: { status: "pending" } });
  await loadSocialProfile(client, "me", "peer");
  assert.equal(client.calls.some(c => c.rpc === "get_user_profile_stats"), false);
});

test("a refused/failed metric stays unavailable, never manufactured as zero", async () => {
  const client = fakeClient({ relationship: { status: "accepted" }, statsError: { code: "42501" }, progressionError: { code: "42501" } });
  const result = await loadSocialProfile(client, "me", "peer");
  assert.equal(result.seconds30d, null);
  assert.equal(result.progression, null);
  assert.equal(result.partial, true);
  assert.deepEqual(publicProfileProgression({ total_xp: 0, streak: 0, badge_count: 0 }), { totalXP: 0, streak: 0, badgeCount: 0 });
  assert.deepEqual(publicProfileProgression({ total_xp: null, streak: -1, badge_count: "not a number" }), { totalXP: null, streak: null, badgeCount: null });
});

test("missing/locked profiles fail closed", async () => {
  await assert.rejects(loadSocialProfile(fakeClient({ profile: null }), "me", "peer"));
  await assert.rejects(loadSocialProfile(fakeClient({ profile: { locked: true } }), "me", "peer"));
});

test("course preview is capped at three, prioritizes academic matches, and counts the rest", () => {
  const courses = ["Alpha", "Beta", "Services Marketing", "Zoology", "Other"].map((name, i) => ({ id: i, name }));
  const result = profileCourses(courses, [{ name: "services marketing" }], { university: "UCF" }, { university: "ucf" }, true);
  assert.equal(result.visible.length, 3);
  assert.equal(result.visible[0].name, "Services Marketing");
  assert.equal(result.visible[0].shared, true);
  assert.equal(result.remaining, 2);
  assert.equal(profileCourses(courses, [{ name: "Services Marketing" }], { university: "UCF" }, { university: "ICHEC" }, true).sharedCount, 0);
  assert.equal(profileCourses(courses, [{ name: "Services Marketing" }], {}, {}, true).sharedCount, 0);
  assert.equal(profileCourses(courses, courses, { university: "UCF" }, { university: "UCF" }, false).sharedCount, 0);
});

test("exchange course affiliation takes precedence over home university", () => {
  const course = { name: "Marketing", study_institution_id: "ucf" };
  assert.equal(profileCourses([course], [course], { university: "ICHEC" }, { university: "UCF" }, true).sharedCount, 1);
  assert.equal(profileCourses([course], [{ ...course, study_institution_id: "ichec" }], { university: "UCF" }, { university: "UCF" }, true).sharedCount, 0);
});

test("highlights only show real, structured, allowed shared badge objects, without duplicates", () => {
  const post = (badgeId, visibility = "public") => ({ visibility, activity: { version: 1, type: "badge_unlocked", badgeId } });
  const posts = [post("first_session"), post("first_session"), post("streak_7", "friends"), post("unknown"),
    { visibility: "public", content: "Unlocked a badge" }, post("hours_50"), post("hours_100"), post("hours_250", "private")];
  const catalog = ["first_session", "streak_7", "hours_50", "hours_100", "hours_250"];
  assert.deepEqual(sharedBadgeHighlights(posts, catalog), ["first_session", "hours_50", "hours_100"]);
  assert.deepEqual(sharedBadgeHighlights(posts, catalog, true), ["first_session", "streak_7", "hours_50"]);
});

test("new request, incoming acceptance, and removal reuse existing friendship writes", async () => {
  const client = fakeClient();
  assert.equal((await changeProfileFriendship(client, { viewerId: "me", userId: "peer", action: "add" })).status, "pending");
  const incoming = { id: "link", requester: "peer", addressee: "me", status: "pending" };
  assert.equal((await changeProfileFriendship(client, { viewerId: "me", userId: "peer", relationship: incoming, action: "accept" })).status, "accepted");
  assert.equal(await changeProfileFriendship(client, { viewerId: "me", userId: "peer", relationship: incoming, action: "remove" }), null);
  assert.deepEqual(client.calls.map(c => c.mode), ["insert", "update", "delete"]);
});

test("cannot accept an outgoing request, re-add existing link, self-add, or edit another link", async () => {
  const client = fakeClient();
  const outgoing = { id: "link", requester: "me", addressee: "peer", status: "pending" };
  await assert.rejects(changeProfileFriendship(client, { viewerId: "me", userId: "peer", relationship: outgoing, action: "accept" }));
  await assert.rejects(changeProfileFriendship(client, { viewerId: "me", userId: "peer", relationship: outgoing, action: "add" }));
  await assert.rejects(changeProfileFriendship(client, { viewerId: "me", userId: "me", action: "add" }));
  await assert.rejects(changeProfileFriendship(client, { viewerId: "me", userId: "peer", relationship: { ...outgoing, requester: "stranger" }, action: "remove" }));
  assert.equal(client.calls.length, 0);
});

test("failed mutation never reports success", async () => {
  await assert.rejects(changeProfileFriendship(fakeClient({ mutationError: { code: "42501" } }), { viewerId: "me", userId: "peer", action: "add" }));
});
