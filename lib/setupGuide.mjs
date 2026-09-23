import { ONBOARDING_STEPS, setupStageFor } from "./onboarding.mjs";

// What the mascot says before the app, page by page and step by step.
//
// One short line per moment, never a paragraph: the form carries the details.
// A new `reaction` makes the mascot move (components/Mascot plays a gesture
// when it changes), so it only changes on something real — a new step, a
// name the student has given, a university chosen, a course added — and
// never on each keystroke.
//
// Returns { key, values, mood, reaction } or null (no guide on this page).
export function setupGuide(state = {}) {
  const { page } = state;

  if (page === "login") return { key: "guide.login", mood: "happy", reaction: "login" };

  if (page === "signup") {
    if (state.awaitingEmail) return { key: "guide.checkEmail", mood: "neutral", reaction: "check-email" };
    const name = String(state.firstName || "").trim();
    if (name && state.named) return { key: "guide.named", values: { name }, mood: "happy", reaction: "named" };
    return { key: "guide.account", mood: "neutral", reaction: "account" };
  }

  if (page === "onboarding") {
    if (state.loading) return { key: "guide.loading", mood: "neutral", reaction: "loading" };
    if (state.error) return { key: "guide.error", mood: "worried", reaction: "error" };
    if (state.step === ONBOARDING_STEPS.YOU) return { key: "guide.repair", mood: "neutral", reaction: "repair" };
    if (setupStageFor(state.step) === 1) {
      return String(state.university || "").trim()
        ? { key: "guide.field", mood: "happy", reaction: "field" }
        : { key: "guide.university", mood: "neutral", reaction: "university" };
    }
    const count = Math.max(0, Number(state.courseCount) || 0);
    if (count === 0) return { key: "guide.firstCourse", mood: "neutral", reaction: "courses-0" };
    // One course is enough to start: that is the moment the space is ready.
    return { key: "guide.ready", mood: count === 1 ? "celebrating" : "happy", reaction: `courses-${count}` };
  }

  if (page === "forgot") {
    return state.sent
      ? { key: "guide.forgotSent", mood: "happy", reaction: "sent" }
      : { key: "guide.forgot", mood: "neutral", reaction: "forgot" };
  }

  if (page === "reset") {
    if (state.invalid) return { key: "guide.resetInvalid", mood: "worried", reaction: "invalid" };
    if (state.success) return { key: "guide.resetDone", mood: "celebrating", reaction: "done" };
    if (state.checking) return { key: "guide.resetChecking", mood: "neutral", reaction: "checking" };
    return { key: "guide.reset", mood: "neutral", reaction: "reset" };
  }

  return null;
}

// The guide's sentence in the reader's language, with its values filled in.
export function guideText(guide, t) {
  if (!guide) return "";
  let text = t(guide.key);
  for (const [name, value] of Object.entries(guide.values || {})) text = text.replace(`{${name}}`, value);
  return text;
}
