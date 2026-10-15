import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { formatMinutesShort, formatStudyTime } from "../lib/format.js";

const require = createRequire(import.meta.url);
const React = require("react");
const { act, create } = require("react-test-renderer");
const { renderToString } = require("react-dom/server");
const { transformSync } = require("@babel/core");
const { code } = transformSync(readFileSync(new URL("../components/AnimatedNumber.js", import.meta.url), "utf8"), {
  filename: "AnimatedNumber.js", babelrc: false, configFile: false,
  presets: [[require.resolve("next/babel"), { "preset-react": { runtime: "automatic" } }]],
  plugins: [require.resolve("@babel/plugin-transform-modules-commonjs")],
});

function harness({ reducedMotion = false, server = false } = {}) {
  let now = 0, nextId = 0;
  const frames = new Map();
  const module = { exports: {} };
  const globals = { module, exports: module.exports, require };
  if (!server) Object.assign(globals, {
    window: { matchMedia: () => ({ matches: reducedMotion }) },
    performance: { now: () => now },
    requestAnimationFrame: fn => { frames.set(++nextId, fn); return nextId; },
    cancelAnimationFrame: id => frames.delete(id),
  });
  vm.runInNewContext(code, globals);
  const Component = module.exports.default;
  let renderer;
  return {
    Component, frames,
    render(props) {
      act(() => {
        const element = React.createElement(Component, props);
        if (renderer) renderer.update(element); else renderer = create(element);
      });
      return renderer.toJSON();
    },
    tick(time) {
      now = time;
      const pending = [...frames.values()]; frames.clear();
      act(() => pending.forEach(fn => fn(now)));
      return renderer.toJSON();
    },
    close() { act(() => renderer?.unmount()); },
  };
}

function text(node) {
  return typeof node === "string" ? node : (node?.children || []).map(text).join("");
}
function accessibleText(node) {
  if (typeof node === "string") return node;
  if (node?.props?.["aria-hidden"] === "true") return "";
  return (node?.children || []).map(accessibleText).join("");
}
function assertSemantics(tree, expected) {
  assert.equal(accessibleText(tree), expected, "the final value is real accessible text exactly once");
  assert.equal(tree.props["aria-label"], undefined, "generic spans cannot have an ARIA name");
  assert.equal(tree.props["aria-labelledby"], undefined);
  assert.equal(tree.props.role, undefined, "no artificial widget or live-region role");
  assert.equal(tree.props["aria-live"], undefined);
  assert.equal(tree.children[0].props.className, "sr-only");
  assert.equal(tree.children[1].props["aria-hidden"], "true");
}

for (const [name, props, expected] of [
  ["integer", { value: 42 }, "42"],
  ["true zero", { value: 0 }, "0"],
  ["decimal", { value: 12.345, decimals: 2 }, "12.35"],
  ["negative decimal", { value: -3.25, decimals: 1 }, "-3.2"],
  ["prefix and suffix", { value: 125, prefix: "+", suffix: " XP" }, "+125 XP"],
  ["custom formatter", { value: 3660, format: formatMinutesShort }, "1h01"],
  ["sub-minute formatter", { value: 20, format: formatStudyTime }, "< 1 min"],
  ["formatter receives rounded value", { value: 1.236, decimals: 2, format: n => n.toFixed(2).replace(".", ","), prefix: "~", suffix: " h" }, "~1,24 h"],
  ["existing invalid-value fallback", { value: Number.NaN }, "0"],
]) test(`final accessible ${name} is available before and throughout animation`, () => {
  const h = harness();
  assertSemantics(h.render(props), expected);
  for (const time of [80, 200, 400]) assertSemantics(h.tick(time), expected);
  assert.equal(text(h.tick(500).children[1]), expected);
  assert.equal(h.frames.size, 0);
  h.close();
});

test("dynamic targets replace accessible text immediately, with no frame-by-frame text changes", () => {
  const h = harness();
  h.render({ value: 100 }); h.tick(400);
  assertSemantics(h.render({ value: 200 }), "200");
  const values = [40, 80, 120, 200, 300, 400].map(offset => {
    const tree = h.tick(400 + offset);
    assertSemantics(tree, "200");
    return text(tree.children[1]);
  });
  assert.ok(new Set(values).size > 2, "visual animation still has intermediate values");
  assert.equal(values.at(-1), "200");
  assertSemantics(h.render({ value: 25, prefix: "+", suffix: " XP" }), "+25 XP");
  assertSemantics(h.tick(1200), "+25 XP");
  h.close();
});

test("a mid-animation value change cancels the old frame and keeps the latest target", () => {
  const h = harness();
  h.render({ value: 100 }); h.tick(200);
  assertSemantics(h.render({ value: 10 }), "10");
  assert.equal(h.frames.size, 1);
  assertSemantics(h.tick(600), "10");
  assert.equal(text(h.tick(700).children[1]), "10");
  h.close(); assert.equal(h.frames.size, 0);
});

for (const options of [{ reducedMotion: true }, { duration: 0 }]) {
  test(`no animation frames with ${options.reducedMotion ? "reduced motion" : "zero duration"}`, () => {
    const h = harness(options);
    const props = { value: 42, duration: options.duration ?? 400 };
    assertSemantics(h.render(props), "42");
    assert.equal(text(h.render(props).children[1]), "42");
    assertSemantics(h.render({ ...props, value: 63 }), "63");
    assert.equal(h.frames.size, 0);
    h.close();
  });
}

test("className, style, duration and neighboring units keep their existing contract", () => {
  const h = harness();
  const style = { fontSize: 30, color: "var(--bt-ink-text)" };
  const tree = h.render({ value: 8, duration: 900, className: "font-bold leading-none", style });
  assert.equal(tree.props.className, "font-num tabular-nums font-bold leading-none");
  assert.equal(tree.props.style, style);
  assert.equal(text(h.tick(400).children[1]), "7");
  assert.equal(text(h.tick(900).children[1]), "8");
  const total = { children: [tree, "/30 badges"] };
  assert.equal(accessibleText(total), "8/30 badges");
  assert.equal(accessibleText({ props: { "aria-hidden": "true" }, children: [tree] }), "");
  h.close();
});

test("server render exposes final text without window, timers or animation APIs", () => {
  const { Component } = harness({ server: true });
  const element = React.createElement(Component, { value: 12.5, decimals: 1, prefix: "+", suffix: " XP" });
  const markup = renderToString(element);
  assert.match(markup, /<span class="sr-only">\+12\.5 XP<\/span>/);
  assert.match(markup, /<span aria-hidden="true">\+0\.0 XP<\/span>/);
  assert.doesNotMatch(markup, /aria-label|aria-live|role=/);
  assert.equal(renderToString(element), markup, "deterministic first markup for hydration");
});

test("formatting-only updates replace final text without replaying the animation", () => {
  const h = harness();
  h.render({ value: 12.34 }); h.tick(400);
  const tree = h.render({ value: 12.34, decimals: 1, prefix: "~", suffix: " h", format: n => String(n).replace(".", ",") });
  assertSemantics(tree, "~12,3 h");
  assert.equal(text(tree.children[1]), "~12,3 h");
  assert.equal(h.frames.size, 0);
  h.close();
});

test("unmount cancels the pending animation frame", () => {
  const h = harness();
  h.render({ value: 100 });
  assert.equal(h.frames.size, 1);
  h.close();
  assert.equal(h.frames.size, 0);
});
