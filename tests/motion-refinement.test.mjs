import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const require = createRequire(import.meta.url);
const React = require("react");
const { act, create } = require("react-test-renderer");
const { transformSync } = require("@babel/core");

function compilePresence(fakeWindow) {
  const source = readFileSync(new URL("../components/useExitPresence.js", import.meta.url), "utf8");
  const { code } = transformSync(source, {
    babelrc: false, configFile: false,
    plugins: [require.resolve("@babel/plugin-transform-modules-commonjs")],
  });
  const module = { exports: {} };
  vm.runInNewContext(code, { module, exports: module.exports, require, window: fakeWindow });
  return module.exports.default;
}

test("a sheet stays mounted for a short exit and a reopening cancels that exit", () => {
  const timers = new Map();
  let nextTimer = 0;
  const fakeWindow = {
    matchMedia: () => ({ matches: false }),
    setTimeout: fn => { timers.set(++nextTimer, fn); return nextTimer; },
    clearTimeout: id => timers.delete(id),
  };
  const useExitPresence = compilePresence(fakeWindow);
  const Probe = ({ open }) => {
    const { present, exiting } = useExitPresence(open);
    return present ? React.createElement("div", { "data-motion": exiting ? "exit" : "enter" }) : null;
  };
  let renderer;
  act(() => { renderer = create(React.createElement(Probe, { open: false })); });
  assert.equal(renderer.toJSON(), null);
  act(() => { renderer.update(React.createElement(Probe, { open: true })); });
  assert.equal(renderer.toJSON().props["data-motion"], "enter");
  act(() => { renderer.update(React.createElement(Probe, { open: false })); });
  assert.equal(renderer.toJSON().props["data-motion"], "exit");
  assert.equal(timers.size, 1);
  act(() => { renderer.update(React.createElement(Probe, { open: true })); });
  assert.equal(renderer.toJSON().props["data-motion"], "enter");
  assert.equal(timers.size, 0, "reopening cancels the pending unmount");
  act(() => { renderer.update(React.createElement(Probe, { open: false })); });
  act(() => { [...timers.values()][0](); });
  assert.equal(renderer.toJSON(), null);
  act(() => renderer.unmount());
});

test("reduced motion closes a sheet immediately", () => {
  const useExitPresence = compilePresence({ matchMedia: () => ({ matches: true }) });
  const Probe = ({ open }) => {
    const { present } = useExitPresence(open);
    return present ? React.createElement("div") : null;
  };
  let renderer;
  act(() => { renderer = create(React.createElement(Probe, { open: true })); });
  act(() => { renderer.update(React.createElement(Probe, { open: false })); });
  assert.equal(renderer.toJSON(), null);
  act(() => renderer.unmount());
});

test("motion stays attached to meaningful events, not every second or badge inspection", () => {
  // Les chiffres du Chrono (sortis du Dashboard dans components/timer).
  const digits = readFileSync(new URL("../components/timer/TimerDigits.js", import.meta.url), "utf8");
  const badgeSheet = readFileSync(new URL("../components/BadgeSheet.js", import.meta.url), "utf8");
  const celebration = readFileSync(new URL("../components/Celebration.js", import.meta.url), "utf8");
  const planning = readFileSync(new URL("../styles/planning.css", import.meta.url), "utf8");
  assert.match(digits, /key={`s\$\{i\}`} ch=\{ch\} animate=\{false\}/);
  assert.doesNotMatch(badgeSheet, /badge-shine/);
  assert.match(celebration, /<BadgeIcon id=\{data\.badgeId\} earned size=\{88\} animate \/>/);
  assert.match(planning, /bt-plan-period-next 170ms/);
  assert.match(planning, /bt-plan-period-enter \{ animation: none !important/);
});
