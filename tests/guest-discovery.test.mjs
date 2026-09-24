import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { STRINGS } from "../lib/i18n.js";

const COMPONENT_PATH = new URL("../components/guest/GuestDiscovery.js", import.meta.url);
const DASHBOARD_PATH = new URL("../pages/dashboard.js", import.meta.url);
const CSS_PATH = new URL("../components/guest/GuestDiscovery.module.css", import.meta.url);
const TIMER_PATH = new URL("../contexts/TimerContext.js", import.meta.url);
const DIALOG_FOCUS_PATH = new URL("../components/useDialogFocus.js", import.meta.url);

test("the discovery previews cover exactly the requested product routes", async () => {
  const source = await readFile(COMPONENT_PATH, "utf8");
  for (const route of ["/planning", "/stats", "/feed", "/messages", "/communautes"]) {
    assert.match(source, new RegExp(`pathname === ["']${route}["']`));
  }
  assert.doesNotMatch(source, /pathname === ["']\/admin/);
});

test("demonstration UI cannot reach persistence or production analytics", async () => {
  const source = await readFile(COMPONENT_PATH, "utf8");
  assert.doesNotMatch(source, /supabase|fetch\s*\(|localStorage|analytics|leaderboard/i);
});

test("previews reuse the shipped product structures instead of marketing page scaffolds", async () => {
  const source = await readFile(COMPONENT_PATH, "utf8");
  for (const reused of ["ActivityTimeline", "StudyTimeChart", "StudyByCourse", "PlanningExamMark", "SegmentedGlide", "CourseMarker"]) {
    assert.match(source, new RegExp(`\\b${reused}\\b`), `${reused} should stay part of the preview`);
  }
  assert.doesNotMatch(source, /function DemoHeader|<DemoHeader/);
  assert.doesNotMatch(source, /guest\.(planning|stats|feed|messages|communautes)\.(eyebrow|title|text|f\d)/);
});

test("every discovery and gate sentence exists in French and English", async () => {
  const source = await readFile(COMPONENT_PATH, "utf8");
  const literalKeys = [...source.matchAll(/t\(["'](guest\.[^"']+)["']\)/g)].map((match) => match[1]);
  const dynamicKeys = ["planning", "activity", "friends", "community", "profile", "course"]
    .flatMap((gate) => [`guest.gate.${gate}.title`, `guest.gate.${gate}.text`]);
  for (const key of new Set([...literalKeys, ...dynamicKeys])) {
    assert.equal(typeof STRINGS.fr[key], "string", `missing FR: ${key}`);
    assert.equal(typeof STRINGS.en[key], "string", `missing EN: ${key}`);
    assert.ok(STRINGS.fr[key].trim(), `empty FR: ${key}`);
    assert.ok(STRINGS.en[key].trim(), `empty EN: ${key}`);
  }
});

test("the stats preview is coherent: 8h15 equals the seven daily bars", async () => {
  const source = await readFile(COMPONENT_PATH, "utf8");
  const match = source.match(/const WEEK_MINUTES = \[([^\]]+)\]/);
  assert.ok(match, "weekly data should stay explicit and reviewable");
  const minutes = match[1].split(",").map((value) => Number(value.trim()));
  assert.equal(minutes.reduce((total, value) => total + value, 0), 8 * 60 + 15);
  assert.match(source, /new Intl\.DateTimeFormat\(lang === "en" \? "en-GB" : "fr-BE", \{ weekday: "narrow" \}\)/);
});

test("reading demo planning items stays open while personal changes are gated", async () => {
  const source = await readFile(COMPONENT_PATH, "utf8");
  for (const className of ["bt-planning-next-exam", "bt-planning-week-exam", "bt-plan-objective-chip", "bt-planning-agenda-exam"]) {
    const line = source.split("\n").find((candidate) => candidate.includes(`className=\"${className}`));
    assert.ok(line, `missing ${className}`);
    assert.doesNotMatch(line, /onGate/, `${className} should remain consultable without a gate`);
  }
  assert.match(source, /aria-label=\{t\("guest\.demo\.add"\)\} onClick=\{\(\) => onGate\("planning"\)\}/);
});

test("commenting gates on the first click instead of opening a fake input", async () => {
  const source = await readFile(COMPONENT_PATH, "utf8");
  assert.match(source, /onClickCapture=\{\(event\) => \{/);
  assert.match(source, /event\.target\.closest\("\.bt-activity-quiet-btn"\)/);
  assert.match(source, /event\.stopPropagation\(\)/);
});

test("the guest timer uses only local demo courses and a separate storage version", async () => {
  const source = await readFile(DASHBOARD_PATH, "utf8");
  assert.match(source, /bt_guest_dashboard_v2/);
  assert.match(source, /guest-course-physics/);
  assert.match(source, /guest-course-economics/);
  assert.match(source, /writeGuestDashboardData/);
  assert.match(source, /challenge && !isGuest/);
  const guestSave = source.match(/async function stopAndSave\(\)[\s\S]*?if \(isGuest\) \{([\s\S]*?)\n    \}\n\n    enqueueSession\(payload\);/);
  assert.ok(guestSave, "guest save branch should remain explicit");
  assert.doesNotMatch(guestSave[1], /supabase|xpGained|setCompletionToast/i);
});

test("the contextual gate becomes a bottom sheet while previews use the real exam vocabulary", async () => {
  const component = await readFile(COMPONENT_PATH, "utf8");
  const css = await readFile(CSS_PATH, "utf8");
  assert.match(css, /@media \(max-width: 639px\)/);
  assert.match(css, /place-items: end center/);
  assert.match(component, /PlanningExamMark/);
  assert.match(component, /bt-planning-week-exam/);
  assert.doesNotMatch(css, /--guest-exam-/);
});

test("guest and account timers have separate owners and guest time is discarded at sign-in", async () => {
  const source = await readFile(TIMER_PATH, "utf8");
  assert.match(source, /bt_timer_v2/);
  assert.match(source, /timerStorageKey\(timerOwner\)/);
  assert.match(source, /activeOwnerRef\.current === GUEST_OWNER && timerOwner !== GUEST_OWNER/);
  assert.match(source, /localStorage\.removeItem\(timerStorageKey\(GUEST_OWNER\)\)/);
  assert.match(source, /activeOwnerRef\.current !== timerOwner/);
});

test("the gate contains forward and reverse keyboard focus", async () => {
  const [component, focusHook] = await Promise.all([
    readFile(COMPONENT_PATH, "utf8"),
    readFile(DIALOG_FOCUS_PATH, "utf8"),
  ]);
  assert.match(component, /tabIndex=\{-1\} className=\{styles\.backdrop\}/);
  assert.match(focusHook, /active === dialogRef\.current \|\| focusIsOutside/);
});
