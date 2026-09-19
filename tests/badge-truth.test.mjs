import test from "node:test";
import assert from "node:assert/strict";
import { canonicalBadgeIds, fetchCanonicalBadgeIds } from "../lib/badgeTruth.mjs";

const catalog = ["first_session", "streak_3", "streak_7", "hours_10", "marathon_day", "planner"];

test("the server's two lists are merged once, in catalogue order", () => {
  assert.deepEqual(
    canonicalBadgeIds({ synced: ["hours_10", "first_session"], stored: ["first_session", "streak_3"], catalog }),
    ["first_session", "streak_3", "hours_10"],
  );
});

test("an id the app does not know never counts, so earned can never exceed total", () => {
  const ids = canonicalBadgeIds({ synced: ["retired_badge"], stored: ["first_session"], catalog });
  assert.deepEqual(ids, ["first_session"]);
  assert.ok(ids.length <= catalog.length);
});

test("one answering source is enough, and garbage is ignored", () => {
  assert.deepEqual(canonicalBadgeIds({ synced: null, stored: ["planner"], catalog }), ["planner"]);
  assert.deepEqual(canonicalBadgeIds({ synced: "nope", stored: undefined, catalog }), []);
});

// A fake client with the two calls the helper makes.
function client({ synced, stored, failSync = false, failRows = false }) {
  return {
    rpc: () => Promise.resolve(failSync ? { data: null, error: { message: "x" } } : { data: synced, error: null }),
    from: () => ({
      select: () => ({
        eq: () => Promise.resolve(failRows ? { data: null, error: { message: "x" } } : { data: (stored || []).map((badge_id) => ({ badge_id })), error: null }),
      }),
    }),
  };
}

test("Profile and Badges read the same list: the count is the same on both screens", async () => {
  const db = client({ synced: ["first_session", "streak_3"], stored: ["first_session", "hours_10"] });
  const onProfile = await fetchCanonicalBadgeIds(db, "u", catalog);
  const onBadges = await fetchCanonicalBadgeIds(db, "u", catalog);
  assert.deepEqual(onProfile, onBadges);
  assert.equal(onProfile.length, 3);
});

test("a total read failure returns null instead of an empty collection", async () => {
  assert.equal(await fetchCanonicalBadgeIds(client({ failSync: true, failRows: true }), "u", catalog), null);
  assert.deepEqual(await fetchCanonicalBadgeIds(client({ failSync: true, stored: ["planner"] }), "u", catalog), ["planner"]);
  assert.equal(await fetchCanonicalBadgeIds(null, "u", catalog), null);
});
