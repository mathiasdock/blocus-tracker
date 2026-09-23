import test from "node:test";
import assert from "node:assert/strict";
import {
  ONBOARDING_STEPS,
  buildSignupMetadata,
  deriveOnboardingState,
  hasDuplicateCourse,
  mergeCourseById,
  nextCourseColor,
  normalizeCourseName,
  signupNeedsEmailConfirmation,
  shouldCheckOnboarding,
} from "../lib/onboarding.mjs";

const managedUser = { id: "new-user", user_metadata: { onboarding_version: 1 } };
const legacyUser = { id: "legacy-user", user_metadata: {} };
const baseProfile = {
  id: "new-user",
  pseudo: "student",
  first_name: "Sam",
  university: "UCF",
  broad_field: "business",
  study_year: "BAC 1",
};
const course = { id: "course-1", name: "Marketing", color: "#ef4444", archived_at: null };

test("fresh signup starts with the account step before an Auth user exists", () => {
  assert.equal(deriveOnboardingState({ user: null, profile: null }).step, ONBOARDING_STEPS.ACCOUNT);
});

test("an immediate signup session continues into canonical onboarding", () => {
  assert.equal(signupNeedsEmailConfirmation({ user: managedUser, session: { user: managedUser } }), false);
});

test("a signup without a session explicitly requires email confirmation", () => {
  assert.equal(signupNeedsEmailConfirmation({ user: managedUser, session: null }), true);
});

test("refresh resumes at University when identity exists but university is missing", () => {
  const state = deriveOnboardingState({
    user: managedUser,
    profile: { ...baseProfile, university: null },
    courses: [],
  });
  assert.equal(state.step, ONBOARDING_STEPS.UNIVERSITY);
});

test("login from another device resumes from server data rather than local storage", () => {
  const state = deriveOnboardingState({
    user: managedUser,
    profile: { ...baseProfile, broad_field: null, study_year: null },
    courses: [],
  });
  assert.equal(state.step, ONBOARDING_STEPS.STUDIES);
});

test("missing broad field or year keeps the student in Studies", () => {
  assert.equal(
    deriveOnboardingState({ user: managedUser, profile: { ...baseProfile, broad_field: "" }, courses: [] }).step,
    ONBOARDING_STEPS.STUDIES,
  );
  assert.equal(
    deriveOnboardingState({ user: managedUser, profile: { ...baseProfile, study_year: "" }, courses: [] }).step,
    ONBOARDING_STEPS.STUDIES,
  );
});

test("a complete academic profile with zero active courses resumes at Courses", () => {
  assert.equal(
    deriveOnboardingState({ user: managedUser, profile: baseProfile, courses: [] }).step,
    ONBOARDING_STEPS.COURSES,
  );
  assert.equal(
    deriveOnboardingState({ user: managedUser, profile: baseProfile, courses: [{ ...course, archived_at: "2026-01-01" }] }).step,
    ONBOARDING_STEPS.COURSES,
  );
});

test("one active course completes the canonical journey", () => {
  assert.equal(deriveOnboardingState({ user: managedUser, profile: baseProfile, courses: [course] }).complete, true);
});

test("legacy complete users are not forced back for missing new fields", () => {
  const state = deriveOnboardingState({
    user: legacyUser,
    profile: { id: "legacy-user", pseudo: "old", first_name: "Old", broad_field: null },
    courses: [],
  });
  assert.equal(state.complete, true);
  assert.equal(state.legacy, true);
});

test("a missing legacy profile enters the repair identity step", () => {
  const state = deriveOnboardingState({ user: legacyUser, profile: null, courses: [], repair: true });
  assert.equal(state.step, ONBOARDING_STEPS.YOU);
  assert.equal(state.repair, true);
});

test("course duplicate detection is case, whitespace and accent insensitive", () => {
  assert.equal(normalizeCourseName("  Économie   Politique "), "economie politique");
  assert.equal(hasDuplicateCourse([course], " MARKETING "), true);
  assert.equal(hasDuplicateCourse([{ ...course, name: "Économie" }], "economie"), true);
});

test("retrying the same course write merges the stable client id instead of duplicating it", () => {
  const firstResponse = { ...course, name: "Marketing" };
  const retryResponse = { ...course, name: "Services Marketing" };
  const afterFirstWrite = mergeCourseById([], firstResponse);
  const afterRetry = mergeCourseById(afterFirstWrite, retryResponse);

  assert.equal(afterRetry.length, 1);
  assert.equal(afterRetry[0].name, "Services Marketing");
});

test("automatic course colours prefer the next unused semantic course colour", () => {
  assert.equal(nextCourseColor([course], ["#ef4444", "#f97316"]), "#f97316");
});

test("signup metadata preserves referral and legal acceptance for post-confirmation replay", () => {
  const metadata = buildSignupMetadata({
    pseudo: " sam ",
    firstName: " Sam ",
    lastName: " ",
    timezone: "America/New_York",
    referralCode: " friend1 ",
    termsVersion: "terms-v1",
    privacyVersion: "privacy-v1",
  });

  assert.equal(metadata.onboarding_version, 1);
  assert.equal(metadata.pending_referral_code, "FRIEND1");
  assert.equal(metadata.pending_terms_version, "terms-v1");
  assert.equal(metadata.pending_privacy_version, "privacy-v1");
  assert.equal(metadata.last_name, null);
});

test("only managed new accounts are guarded outside onboarding routes", () => {
  const base = { authLoading: false, profileStatus: "ready", pathname: "/dashboard" };
  assert.equal(shouldCheckOnboarding({ ...base, user: managedUser }), true);
  assert.equal(shouldCheckOnboarding({ ...base, user: legacyUser }), false);
  assert.equal(shouldCheckOnboarding({ ...base, user: managedUser, pathname: "/onboarding" }), false);
});
