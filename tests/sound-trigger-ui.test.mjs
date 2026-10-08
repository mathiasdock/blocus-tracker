import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { translate } from "../lib/i18n.js";

const require = createRequire(import.meta.url);
const React = require("react");
const { act, create } = require("react-test-renderer");
const { transformSync, parseSync } = require("@babel/core");
const source = path => readFileSync(new URL(path, import.meta.url), "utf8");
const babel = { babelrc: false, configFile: false,
  presets: [[require.resolve("next/babel"), { "preset-react": { runtime: "automatic" } }]],
  plugins: [require.resolve("@babel/plugin-transform-modules-commonjs")] };

function compile(path, mocks, globals = {}) {
  const module = { exports: {} };
  const { code } = transformSync(source(path), { ...babel, filename: path });
  vm.runInNewContext(code, { module, exports: module.exports,
    require: id => id in mocks ? mocks[id] : require(id), setTimeout, clearTimeout, ...globals });
  return module.exports;
}

test("success toasts render without invoking any sound", () => {
  const timers = [], calls = [];
  const Toast = compile("../contexts/ToastContext.js", {
    "../lib/sensoryFeedback": { playSensoryCue: cue => calls.push(cue) },
  }, { setTimeout: fn => { timers.push(fn); return timers.length; }, clearTimeout() {} });
  let toast;
  const Consumer = () => { toast = Toast.useToast().toast; return null; };
  let renderer;
  act(() => { renderer = create(React.createElement(Toast.ToastProvider, null, React.createElement(Consumer))); });
  act(() => { toast("Saved", "success"); toast("Copied"); });
  assert.equal(renderer.root.findAllByType("button").length, 2);
  assert.deepEqual(calls, []);
  act(() => renderer.unmount());
});

test("saved session recap sounds once, not on its unrelated rerenders", () => {
  const calls = [];
  const Empty = () => null;
  const Recap = compile("../components/SessionCompleteCard.js", {
    "../lib/sensoryFeedback": { playSensoryCue: cue => calls.push(cue) },
    "../contexts/I18nContext": { useI18n: () => ({ t: key => key }) },
    "../lib/format": { formatMinutesShort: value => `${value}m`, displayName: () => "Friend" },
    "./AnimatedNumber": Empty, "./Mascot": Empty, "./Glyph": Empty,
    "./Layout": { Avatar: Empty },
  }, { window: { addEventListener() {}, removeEventListener() {} },
    requestAnimationFrame: () => 1, cancelAnimationFrame() {} }).default;
  const data = { durationSecs: 1800, goalPct: 25, xpGained: 50, courseName: "Methods", courseColor: "#ec4899" };
  let renderer;
  act(() => { renderer = create(React.createElement(Recap, { data, onClose() {} })); });
  act(() => renderer.update(React.createElement(Recap, { data, onClose() {}, friends: [] })));
  assert.deepEqual(calls, ["complete"]);
  act(() => renderer.unmount());
});

test("a real unlock celebration sounds once; inspecting Profile cannot announce a badge", () => {
  const calls = [];
  const Empty = () => null;
  const Celebration = compile("../components/Celebration.js", {
    "../lib/sensoryFeedback": { playSensoryCue: cue => calls.push(cue) },
    "../contexts/I18nContext": { useI18n: () => ({ t: key => key }) },
    "./Mascot": Empty, "./Flame": Empty, "./BadgeIcon": Empty, "./Glyph": Empty,
  }, { window: { addEventListener() {}, removeEventListener() {} } }).default;
  const data = { kind: "badge", badgeId: "first_session", labelKey: "badge.first", descKey: "badge.description" };
  const onClose = () => {};
  let renderer;
  act(() => { renderer = create(React.createElement(Celebration, { data, onClose })); });
  act(() => renderer.update(React.createElement(Celebration, { data, onClose })));
  assert.deepEqual(calls, ["achievement"]);
  const streak = { kind: "streak", days: 7 };
  act(() => renderer.update(React.createElement(Celebration, { data: streak, onClose })));
  act(() => renderer.update(React.createElement(Celebration, { data: streak, onClose })));
  const level = { kind: "level", level: 2, titleKey: "level.title" };
  act(() => renderer.update(React.createElement(Celebration, { data: level, onClose })));
  act(() => renderer.update(React.createElement(Celebration, { data: level, onClose })));
  assert.deepEqual(calls, ["achievement", "achievement", "levelUp"]);
  act(() => renderer.unmount());
  const profile = source("../pages/profile.js");
  assert.doesNotMatch(profile, /playSensoryCue\("xp"\)|seen-badges|newBadgeId/);
});

test("ordinary publications, exports, copies and push activation have no sound hooks", () => {
  for (const file of ["pages/feed.js", "pages/planning.js", "components/StudyRecap.js", "components/PushOptInPrompt.js"]) {
    assert.doesNotMatch(source(`../${file}`), /playSensoryCue/);
  }
  assert.doesNotMatch(source("../components/SessionCompleteCard.js"), /playSensoryCue\("share"\)/);
  assert.doesNotMatch(source("../pages/messages.js"), /playSensoryCue\("confirm"\)/);
  assert.doesNotMatch(source("../pages/profile.js"), /playSensoryCue\("confirm"\)/);
  const dashboard = source("../pages/dashboard.js");
  const toggle = dashboard.slice(dashboard.indexOf("async function toggleObjective"), dashboard.indexOf("async function toggleObjective") + 1300);
  assert.doesNotMatch(toggle, /playSensoryCue/);
  assert.match(toggle, /triggerHaptic\("goal"\)/);
});

test("Pomodoro break end cues once and keeps the existing paused work-ready transition", () => {
  // Le cycle Pomodoro vit dans components/timer/useChrono.js, la carte et
  // Focus dans leurs composants (sortis du Dashboard le 2026-10-07).
  const code = source("../components/timer/useChrono.js");
  const ui = source("../components/timer/ChronoCard.js") + source("../components/timer/ChronoFocus.js");
  const ast = parseSync(code, { ...babel, filename: "useChrono.js" });
  let callback;
  function walk(node) {
    if (!node || typeof node !== "object") return;
    if (node.type === "CallExpression" && node.callee?.name === "useEffect") {
      const fn = node.arguments[0];
      if (fn && code.slice(fn.start, fn.end).includes('playSensoryCue("breakEnd")')) callback = code.slice(fn.start, fn.end);
    }
    for (const value of Object.values(node)) {
      if (Array.isArray(value)) value.forEach(walk); else if (value && typeof value === "object") walk(value);
    }
  }
  walk(ast);
  assert.ok(callback);
  const calls = [];
  const scope = { enabled: true, pomodoro: true, running: true, pomoHandled: { current: false }, pomoPhase: "break",
    elapsed: 300, POMO_WORK: 1500, POMO_BREAK: 300,
    pause: () => calls.push("pause"), reset: () => calls.push("reset"),
    setPomoPhase: value => { scope.pomoPhase = value; }, playSensoryCue: cue => calls.push(cue) };
  vm.runInNewContext(`(${callback})()`, scope);
  assert.deepEqual(calls, ["pause", "reset", "breakEnd"]);
  assert.equal(scope.pomoPhase, "work");
  assert.equal(scope.pomoHandled.current, false);
  scope.running = false; vm.runInNewContext(`(${callback})()`, scope);
  assert.equal(calls.length, 3);
  assert.match(ui, /role="status" className="mb-3/);
  assert.match(ui, /role="status" className="text-xs font-semibold/);
  assert.match(code, /pomoCount > 0 \? "dash.breakEnded"/);
});

test("setting describes all effects, and break-end feedback is localized FR/EN", () => {
  assert.equal(translate("fr", "sensory.soundTitle"), "Effets sonores");
  assert.equal(translate("en", "sensory.soundTitle"), "App sound effects");
  for (const lang of ["fr", "en"]) assert.notEqual(translate(lang, "dash.breakEnded"), "dash.breakEnded");
});
