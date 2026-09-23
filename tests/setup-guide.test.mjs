import test from "node:test";
import assert from "node:assert/strict";
import { ONBOARDING_STEPS } from "../lib/onboarding.mjs";
import { guideText, setupGuide } from "../lib/setupGuide.mjs";
import { STRINGS } from "../lib/i18n.js";

test("the guide follows the five server steps on their three visible screens", () => {
  assert.equal(setupGuide({ page: "onboarding", step: ONBOARDING_STEPS.YOU }).key, "guide.repair");
  assert.equal(setupGuide({ page: "onboarding", step: ONBOARDING_STEPS.UNIVERSITY }).key, "guide.university");
  assert.equal(setupGuide({ page: "onboarding", step: ONBOARDING_STEPS.STUDIES }).key, "guide.university");
  assert.equal(setupGuide({ page: "onboarding", step: ONBOARDING_STEPS.STUDIES, university: "ULB" }).key, "guide.field");
  assert.equal(setupGuide({ page: "onboarding", step: ONBOARDING_STEPS.COURSES, courseCount: 0 }).key, "guide.firstCourse");
});

test("the first course is the moment the space is ready, and each course gets its own reaction", () => {
  const first = setupGuide({ page: "onboarding", step: ONBOARDING_STEPS.COURSES, courseCount: 1 });
  const second = setupGuide({ page: "onboarding", step: ONBOARDING_STEPS.COURSES, courseCount: 2 });
  assert.equal(first.key, "guide.ready");
  assert.equal(first.mood, "celebrating");
  assert.equal(second.mood, "happy");
  assert.notEqual(first.reaction, second.reaction);
});

test("a name is greeted only once it is given, not while it is typed", () => {
  assert.equal(setupGuide({ page: "signup", firstName: "Cam", named: false }).key, "guide.account");
  const named = setupGuide({ page: "signup", firstName: " Camille ", named: true });
  assert.equal(named.key, "guide.named");
  assert.equal(guideText(named, (key) => STRINGS.fr[key]), STRINGS.fr["guide.named"].replace("{name}", "Camille"));
  assert.equal(setupGuide({ page: "signup", firstName: "", named: true }).key, "guide.account");
  assert.equal(setupGuide({ page: "signup", awaitingEmail: "a@b.be" }).key, "guide.checkEmail");
});

test("loading and failure keep their own line and mood", () => {
  assert.equal(setupGuide({ page: "onboarding", loading: true }).key, "guide.loading");
  assert.deepEqual(
    [setupGuide({ page: "onboarding", error: true }).key, setupGuide({ page: "onboarding", error: true }).mood],
    ["guide.error", "worried"],
  );
  assert.equal(setupGuide({ page: "reset", invalid: true }).mood, "worried");
  assert.equal(setupGuide({ page: "forgot", sent: true }).key, "guide.forgotSent");
  assert.equal(setupGuide({ page: "elsewhere" }), null);
});

test("every line the guide can say exists in French and English, and stays short", () => {
  const keys = [
    "guide.login", "guide.account", "guide.named", "guide.checkEmail", "guide.repair", "guide.loading",
    "guide.error", "guide.university", "guide.field", "guide.firstCourse", "guide.ready", "guide.forgot",
    "guide.forgotSent", "guide.reset", "guide.resetChecking", "guide.resetInvalid", "guide.resetDone",
  ];
  for (const key of keys) {
    for (const lang of ["fr", "en"]) {
      const text = STRINGS[lang][key];
      assert.ok(text, `${lang} ${key}`);
      assert.ok(text.length <= 72, `${lang} ${key} is ${text.length} characters`);
    }
  }
});
