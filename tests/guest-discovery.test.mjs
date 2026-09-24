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
  const match = source.match(/const week = \[([^\]]+)\]/);
  assert.ok(match, "weekly data should stay explicit and reviewable");
  const minutes = match[1].split(",").map((value) => Number(value.trim()));
  assert.equal(minutes.reduce((total, value) => total + value, 0), 8 * 60 + 15);
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

test("the contextual gate becomes a bottom sheet and keeps dark exam semantics", async () => {
  const css = await readFile(CSS_PATH, "utf8");
  assert.match(css, /@media \(max-width: 639px\)/);
  assert.match(css, /place-items: end center/);
  assert.match(css, /:global\(\.dark\) \.page/);
  assert.match(css, /--guest-exam-bg: #30231f/);
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
