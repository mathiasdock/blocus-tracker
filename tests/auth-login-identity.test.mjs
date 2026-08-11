import test from "node:test";
import assert from "node:assert/strict";
import {
  buildLoginIdentity,
  classifyAuthError,
  pickPseudoCandidate,
} from "../lib/authLogin.mjs";
import {
  canStartProfileRequest,
  isCurrentProfileRequest,
  shouldRedirectToProfileRepair,
} from "../lib/authProfile.mjs";

test("login uses the Auth email belonging to the resolved profile id", () => {
  const profile = {
    id: "account-a",
    pseudo: "AliceDupont",
    // Reproduces the unsafe production state: this stale value belongs to B.
    email: "account-b@example.test",
  };
  const authUser = { id: "account-a", email: "account-a@example.test" };

  assert.deepEqual(buildLoginIdentity(profile, authUser), {
    userId: "account-a",
    email: "account-a@example.test",
  });
});

test("login rejects an Auth identity that does not belong to the profile", () => {
  const profile = { id: "account-a", pseudo: "AliceDupont" };
  const wrongAuthUser = { id: "account-b", email: "account-b@example.test" };

  assert.equal(buildLoginIdentity(profile, wrongAuthUser), null);
});

test("a unique pseudo remains usable with different capitalization", () => {
  const profile = { id: "account-a", pseudo: "AliceDupont" };
  assert.equal(pickPseudoCandidate([profile], "  alicedupont "), profile);
});

test("a normalized duplicate is rejected unless the exact pseudo disambiguates it", () => {
  const upper = { id: "account-a", pseudo: "StudyBuddy" };
  const lower = { id: "account-b", pseudo: "studybuddy" };

  assert.equal(pickPseudoCandidate([upper, lower], "STUDYBUDDY"), null);
  assert.equal(pickPseudoCandidate([upper, lower], "StudyBuddy"), upper);
});

test("retryable Supabase network errors are not reported as bad credentials", () => {
  assert.equal(
    classifyAuthError({ name: "AuthRetryableFetchError", status: 0 }),
    "unavailable"
  );
  assert.equal(classifyAuthError({ code: "request_timeout" }), "unavailable");
});

test("credential and rate-limit errors keep their distinct classifications", () => {
  assert.equal(classifyAuthError({ status: 400, code: "invalid_credentials" }), "invalid");
  assert.equal(classifyAuthError({ status: 429 }), "rate_limited");
});

test("a stale account callback cannot start after another user becomes active", () => {
  assert.equal(canStartProfileRequest("account-a", "account-b"), false);
  assert.equal(canStartProfileRequest("account-b", "account-b"), true);
});

test("an in-flight profile request cannot commit after the active account changes", () => {
  assert.equal(
    isCurrentProfileRequest({
      requestId: 4,
      currentRequestId: 4,
      requestedUserId: "account-a",
      activeUserId: "account-b",
    }),
    false
  );
});

test("only a confirmed missing profile triggers the repair flow", () => {
  const base = {
    authLoading: false,
    hasUser: true,
    pathname: "/dashboard",
  };

  assert.equal(shouldRedirectToProfileRepair({ ...base, profileStatus: "missing" }), true);
  assert.equal(shouldRedirectToProfileRepair({ ...base, profileStatus: "error" }), false);
  assert.equal(
    shouldRedirectToProfileRepair({ ...base, profileStatus: "missing", pathname: "/onboarding" }),
    false
  );
});
