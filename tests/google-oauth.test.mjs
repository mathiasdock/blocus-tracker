import test from "node:test";
import assert from "node:assert/strict";
import {
  canUseGoogleCallbackSession,
  finishGoogleOAuth,
  googleRedirectTo,
  pendingReferralCode,
  rememberGoogleReturnPath,
  safeGoogleReturnPath,
  takeGoogleReturnPath,
} from "../lib/googleOAuth.mjs";
import { parseInitialAuthCallback, shouldCaptureAuthCallback } from "../lib/authRecovery.mjs";

function callback(userId = "person-1") {
  const jwt = `${Buffer.from("{}").toString("base64url")}.${Buffer.from(JSON.stringify({ sub: userId, exp: 2_000_000_000 })).toString("base64url")}.signature`;
  return parseInitialAuthCallback(`https://www.blocus-tracker.com/auth/google-callback#${new URLSearchParams({
    access_token: jwt,
    refresh_token: "secret-not-copied",
    token_type: "bearer",
    expires_in: "3600",
  })}`);
}

function mockSupabase({ profile = null, courses = [], metadata = {}, sessionUserId = "person-1", locked = false } = {}) {
  const calls = [];
  const user = { id: sessionUserId, email: "same@example.com", user_metadata: metadata };
  return {
    calls,
    auth: {
      async getSession() { calls.push("getSession"); return { data: { session: { user } }, error: null }; },
      async getUser() { calls.push("getUser"); return { data: { user }, error: null }; },
      async updateUser(payload) { calls.push(["updateUser", payload]); return { error: null }; },
    },
    from(table) {
      calls.push(["from", table]);
      return {
        select() { return this; },
        eq() { return this; },
        is() { return this; },
        async maybeSingle() { return { data: profile ? { ...profile, locked } : null, error: null }; },
        async limit() { return { data: courses, error: null }; },
      };
    },
  };
}

const completeProfile = {
  id: "person-1", pseudo: "student", first_name: "Sam", university: "UCF",
  broad_field: "business", study_year: "BAC 1",
};

test("OAuth redirects only to this app's fixed callback; return paths stay internal", () => {
  assert.equal(googleRedirectTo("https://www.blocus-tracker.com"), "https://www.blocus-tracker.com/auth/google-callback");
  assert.equal(googleRedirectTo("https://blocus-tracker.com"), "https://blocus-tracker.com/auth/google-callback");
  assert.equal(googleRedirectTo("http://localhost:3000"), "http://localhost:3000/auth/google-callback");
  assert.throws(() => googleRedirectTo("http://other.example"));
  assert.equal(safeGoogleReturnPath("/planning?view=month"), "/planning?view=month");
  for (const value of ["https://evil.example", "//evil.example", "/\\evil", "/%2f%2fevil", "/auth/google-callback", "/login"]) {
    assert.equal(safeGoogleReturnPath(value), null, value);
  }
});

test("return target is single-use and expires; referral is bounded by its existing window", () => {
  const items = new Map();
  const storage = {
    getItem: key => items.get(key) || null,
    setItem: (key, value) => items.set(key, value),
    removeItem: key => items.delete(key),
  };
  rememberGoogleReturnPath(storage, "/planning", 1000);
  assert.equal(takeGoogleReturnPath(storage, 1100), "/planning");
  assert.equal(takeGoogleReturnPath(storage, 1100), null);
  rememberGoogleReturnPath(storage, "/planning", 1000);
  assert.equal(takeGoogleReturnPath(storage, 1000 + 11 * 60 * 1000), null);
  storage.setItem("bt_ref_code", JSON.stringify({ code: " ab12cd34 ", ts: 1000 }));
  assert.equal(pendingReferralCode(storage, 1100), "AB12CD34");
  assert.equal(pendingReferralCode(storage, 1000 + 31 * 24 * 60 * 60 * 1000), null);
});

test("a new Google account is marked for the existing onboarding, without creating a duplicate profile", async () => {
  const db = mockSupabase();
  const result = await finishGoogleOAuth({ supabase: db, callback: callback(), referralCode: "AB12CD34" });
  assert.deepEqual(result, { path: "/onboarding", newProfile: true });
  assert.deepEqual(db.calls.find(call => Array.isArray(call) && call[0] === "updateUser"), [
    "updateUser", { data: { onboarding_version: 1, pending_referral_code: "AB12CD34" } },
  ]);
  assert.equal(db.calls.some(call => Array.isArray(call) && call[0] === "from" && call[1] !== "profiles"), false);
});

test("the same Google user returns through their existing profile and course truth", async () => {
  const db = mockSupabase({ profile: completeProfile, metadata: { onboarding_version: 1 }, courses: [{ id: "course-1" }] });
  const result = await finishGoogleOAuth({ supabase: db, callback: callback(), destination: "/planning" });
  assert.deepEqual(result, { path: "/planning", newProfile: false });
  assert.equal(db.calls.some(call => Array.isArray(call) && call[0] === "updateUser"), false);
});

test("an existing password account linked by Supabase to the same verified email keeps its UUID and profile", async () => {
  // The actual linking decision belongs to Supabase Auth. The app only sees
  // the returned UUID, and must neither create a profile nor merge emails.
  const db = mockSupabase({ profile: completeProfile, metadata: {}, sessionUserId: "person-1" });
  const result = await finishGoogleOAuth({ supabase: db, callback: callback() });
  assert.deepEqual(result, { path: "/dashboard", newProfile: false });
  assert.equal(db.calls.some(call => Array.isArray(call) && call[0] === "updateUser"), false);
});

test("a managed account with incomplete studies or no courses resumes onboarding", async () => {
  const db = mockSupabase({ profile: completeProfile, metadata: { onboarding_version: 1 }, courses: [] });
  assert.deepEqual(await finishGoogleOAuth({ supabase: db, callback: callback() }), { path: "/onboarding", newProfile: false });
  const partial = mockSupabase({ profile: { ...completeProfile, university: null }, metadata: { onboarding_version: 1 }, courses: [{ id: "course-1" }] });
  assert.deepEqual(await finishGoogleOAuth({ supabase: partial, callback: callback() }), { path: "/onboarding", newProfile: false });
});

test("a suspended profile is never routed into the app", async () => {
  const db = mockSupabase({ profile: completeProfile, locked: true });
  assert.deepEqual(await finishGoogleOAuth({ supabase: db, callback: callback() }), { error: "suspended" });
});

test("cancel, OAuth error and a missing callback cannot reuse a prior session", async () => {
  const db = mockSupabase({ profile: completeProfile });
  const cancelled = parseInitialAuthCallback("https://www.blocus-tracker.com/auth/google-callback?error=access_denied");
  assert.deepEqual(await finishGoogleOAuth({ supabase: db, callback: cancelled }), { error: "cancelled" });
  assert.deepEqual(await finishGoogleOAuth({ supabase: db, callback: parseInitialAuthCallback("https://www.blocus-tracker.com/auth/google-callback?error=server_error") }), { error: "oauth_error" });
  assert.deepEqual(await finishGoogleOAuth({ supabase: db, callback: parseInitialAuthCallback("https://www.blocus-tracker.com/auth/google-callback") }), { error: "missing_callback" });
  assert.deepEqual(db.calls, []);
});

test("a stale different-user session cannot complete the callback", async () => {
  const db = mockSupabase({ profile: completeProfile, sessionUserId: "person-2" });
  assert.equal(canUseGoogleCallbackSession(callback(), { user: { id: "person-2" } }), false);
  assert.deepEqual(await finishGoogleOAuth({ supabase: db, callback: callback() }), { error: "missing_session" });
  assert.equal(db.calls.some(call => Array.isArray(call) && call[0] === "from"), false);
});

test("only recovery and Google callback routes capture auth fragments", () => {
  assert.equal(shouldCaptureAuthCallback("/auth/google-callback"), true);
  assert.equal(shouldCaptureAuthCallback("/reset-password"), true);
  assert.equal(shouldCaptureAuthCallback("/login"), false);
});
