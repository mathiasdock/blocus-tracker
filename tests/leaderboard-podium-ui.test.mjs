import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { translate } from "../lib/i18n.js";
import { formatStudyTime } from "../lib/format.js";

const require = createRequire(import.meta.url);
const React = require("react");
const { act, create } = require("react-test-renderer");
const { transformSync } = require("@babel/core");
const styles = new Proxy({}, { get: (_, key) => key === "__esModule" ? false : String(key) });
const source = readFileSync(new URL("../components/Leaderboard.js", import.meta.url), "utf8");
const { code } = transformSync(source, {
  filename: "Leaderboard.js", babelrc: false, configFile: false,
  presets: [[require.resolve("next/babel"), { "preset-react": { runtime: "automatic" } }]],
  plugins: [require.resolve("@babel/plugin-transform-modules-commonjs")],
});

const members = [
  { user_id: "first", pseudo: "Alexandra Very Long Surname", avatar_url: null, total_seconds: "3661", alltime_seconds: "8000", streak_days: "17", active_days: "4", period_days: "4" },
  { user_id: "second", pseudo: "Bastien", avatar_url: "/avatar.jpg", total_seconds: "1855", alltime_seconds: "6000", streak_days: "8", active_days: "3", period_days: "4" },
  { user_id: "third", pseudo: "Camille", avatar_url: null, total_seconds: "0", alltime_seconds: "0", streak_days: "0", active_days: "0", period_days: "4" },
];
const levelMap = { first: { totalXP: 500, current: { level: 6 } }, second: { totalXP: 250, current: { level: 3 } } };
const entries = members.map((member, i) => ({ row: { ...member, name: member.pseudo }, rank: i + 1 }));
const text = node => typeof node === "string" || typeof node === "number" ? String(node)
  : (node?.children || []).map(text).join("");

function motionEnvironment({ reduced = false, intersection = true, animationAPI = true } = {}) {
  const observers = [], nodes = [], animations = [];
  class Observer {
    constructor(callback, options) {
      this.callback = callback;
      this.options = options;
      this.observed = [];
      this.disconnects = 0;
      observers.push(this);
    }
    observe(node) { this.observed.push(node); }
    disconnect() { this.disconnects += 1; }
    emit(isIntersecting) { this.callback([{ isIntersecting }]); }
  }
  return {
    window: {
      matchMedia: query => { assert.equal(query, "(prefers-reduced-motion: reduce)"); return { matches: reduced }; },
      ...(intersection ? { IntersectionObserver: Observer } : {}),
    },
    observers, nodes, animations,
    createNodeMock(element) {
      if (element.type !== "ol") return null;
      const node = { style: {} };
      if (animationAPI) node.animate = (keyframes, options) => {
        const animation = { keyframes, options, cancellations: 0, cancel() { this.cancellations += 1; } };
        animations.push(animation);
        return animation;
      };
      nodes.push(node);
      return node;
    },
  };
}

function compile({ lang = "en", rows = members, motion = motionEnvironment({ reduced: true }) } = {}) {
  const rpcCalls = [];
  const module = { exports: {} };
  const Avatar = ({ url, pseudo, size }) => React.createElement("img", { src: url, alt: pseudo, width: size, height: size });
  const EmptyState = ({ title }) => React.createElement("p", { "data-empty": true }, title);
  const AnimatedNumber = ({ value, format, suffix = "" }) => React.createElement("span", { "data-animated-number": true }, `${format ? format(value) : value}${suffix}`);
  const FilterMenu = ({ ariaLabel, value }) => React.createElement("span", { "aria-label": ariaLabel }, value);
  const Flame = () => React.createElement("svg", { "aria-hidden": true, "data-flame": true });
  const friendshipQuery = {
    select() { return this; }, or() { return this; },
    eq() { return Promise.resolve({ data: [] }); },
  };
  const supabase = {
    from(table) { assert.equal(table, "friendships"); return friendshipQuery; },
    rpc(name, parameters) {
      rpcCalls.push({ name, parameters });
      return Promise.resolve({ data: rows, error: null });
    },
  };
  const t = key => translate(lang, key);
  const mocks = {
    "./Layout": { Avatar }, "./Skeleton": { SkeletonList: () => null },
    "./EmptyState": EmptyState,
    "../contexts/I18nContext": { useI18n: () => ({ lang, t }) },
    "../lib/supabaseClient": { supabase }, "../lib/format": { formatStudyTime },
    "../lib/userLevels": { loadUserLevelMap: async () => levelMap },
    "./AnimatedNumber": AnimatedNumber, "./FilterMenu": FilterMenu, "./Flame": Flame,
    "./Leaderboard.module.css": styles,
  };
  vm.runInNewContext(code, {
    module, exports: module.exports, window: motion.window,
    require: id => id in mocks ? mocks[id] : require(id),
  });
  return { ...module.exports, Avatar, EmptyState, AnimatedNumber, FilterMenu, Flame, t, motion, rpcCalls };
}

function directProps(harness, overrides = {}) {
  const Value = ({ row, staticValue }) => React.createElement("span", { "data-static-value": staticValue }, formatStudyTime(Number(row.total_seconds)));
  return {
    entries, levelOf: id => ({ first: 6, second: 3 }[id] || 0), userId: "second",
    onViewUser: () => {}, Value, t: harness.t, ...overrides,
  };
}

async function renderBoard(harness) {
  let page;
  await act(async () => {
    page = create(React.createElement(harness.default, {
      user: { id: "second" }, profile: {}, onViewUser: () => {}, compact: true,
    }), { createNodeMock: harness.motion.createNodeMock });
  });
  return page;
}

async function pickMetric(page, harness, value) {
  const filter = page.root.findAllByType(harness.FilterMenu).find(menu => menu.props.ariaLabel === harness.t("stats.metricFilterLabel"));
  await act(async () => filter.props.onChange(value));
}

test("podium keeps true 2/1/3 ranks, profile buttons, own marker and avatar levels", () => {
  const harness = compile();
  const viewed = [];
  const props = directProps(harness, { onViewUser: id => viewed.push(id) });
  let page;
  act(() => { page = create(React.createElement(harness.Podium, props)); });
  assert.equal(page.root.findByType("ol").props["aria-label"], harness.t("stats.podiumLabel"));
  const places = page.root.findAllByType("li");
  assert.deepEqual(places.map(place => place.props.value), [2, 1, 3]);
  assert.deepEqual(places.map(place => place.props["data-rank"]), [2, 1, 3]);
  const buttons = page.root.findAllByType("button");
  assert.deepEqual(buttons.map(button => button.props.type), ["button", "button", "button"]);
  assert.deepEqual(buttons.map(button => button.props.disabled), [true, false, false]);
  assert.ok(text(buttons[0]).includes(harness.t("stats.me")));
  assert.equal(buttons[1].props.title, members[0].pseudo);
  act(() => { buttons[1].props.onClick(); buttons[2].props.onClick(); });
  assert.deepEqual(viewed, ["first", "third"]);
  assert.deepEqual(page.root.findAllByType(harness.Avatar).map(avatar => avatar.props.size), [48, 64, 48]);
  assert.deepEqual(page.root.findAll(node => String(node.props.className || "").startsWith("bt-lb-level")).map(level => level.props["aria-label"]), ["Level 3", "Level 6"]);
  assert.ok(page.root.findAllByType(props.Value).every(value => value.props.staticValue === true));
  assert.ok(page.root.findAllByProps({ className: "step font-num" }).every(step => step.props["aria-hidden"] === "true"));
  assert.equal(page.root.findAllByType("svg").length, 0);
  act(() => page.unmount());
});

for (const lang of ["fr", "en"]) {
  test(`podium quantities stay exact and static across all three metrics (${lang})`, async () => {
    const harness = compile({ lang });
    const page = await renderBoard(harness);
    const values = () => page.root.findAllByProps({ className: "value" });
    assert.deepEqual(values().map(text), [formatStudyTime(1855), formatStudyTime(3661), formatStudyTime(0)]);
    assert.equal(page.root.findAllByType(harness.AnimatedNumber).length, 0);
    await pickMetric(page, harness, "streak");
    assert.deepEqual(values().map(text), [8, 17, 0].map(value => `${value} ${harness.t("stats.dayUnit")}`));
    assert.equal(page.root.findAllByType(harness.Flame).length, 3);
    assert.equal(harness.rpcCalls.at(-1).parameters.p_period, "week");
    await pickMetric(page, harness, "regularity");
    assert.deepEqual(values().map(text), [3, 4, 0].map(value => `${value}/4 ${harness.t("stats.dayUnit")}`));
    assert.equal(harness.rpcCalls.at(-1).parameters.p_period, "week");
    assert.equal(page.root.findAllByType(harness.Flame).length, 0);
    assert.equal(page.root.findAllByType(harness.AnimatedNumber).length, 0);
    assert.ok(values().every(value => value.findAllByType("span").some(span => span.props.style?.color === "var(--bt-text-1)")));
    assert.ok(harness.rpcCalls.every(call => call.name === "get_leaderboard_v2"));
    act(() => page.unmount());
  });
}

for (const count of [0, 1, 2]) {
  test(`${count} leaderboard members retain the sparse list or empty state without a podium`, async () => {
    const harness = compile({ rows: members.slice(0, count) });
    const page = await renderBoard(harness);
    assert.equal(page.root.findAllByType(harness.Podium).length, 0);
    assert.equal(page.root.findAllByType("ol").length, 0);
    assert.deepEqual(page.root.findAllByType(harness.RankBadge).map(badge => badge.props.rank), Array.from({ length: count }, (_, index) => index + 1));
    assert.equal(page.root.findAllByType(harness.EmptyState).length, count === 0 ? 1 : 0);
    assert.equal(harness.motion.animations.length, 0);
    act(() => page.unmount());
  });
}

test("first sight reveals once; repeat updates and a shared-ref remount do not replay", () => {
  const motion = motionEnvironment();
  const harness = compile({ motion });
  const entrancePlayedRef = { current: false };
  const props = directProps(harness, { entrancePlayedRef });
  let page;
  act(() => { page = create(React.createElement(harness.Podium, props), { createNodeMock: motion.createNodeMock }); });
  assert.equal(motion.observers.length, 1);
  assert.equal(motion.observers[0].observed[0], motion.nodes[0]);
  assert.equal(motion.animations.length, 0);
  assert.deepEqual(motion.nodes[0].style, {});
  act(() => motion.observers[0].emit(false));
  assert.equal(entrancePlayedRef.current, false);
  act(() => motion.observers[0].emit(true));
  assert.equal(entrancePlayedRef.current, true);
  assert.equal(motion.animations.length, 1);
  const animation = motion.animations[0];
  assert.ok(animation.options.duration > 0 && animation.options.duration <= 300);
  assert.equal(animation.keyframes.at(-1).opacity, 1);
  assert.equal(animation.keyframes.at(-1).transform, "translateY(0)");
  assert.equal(animation.options.iterations || 1, 1);
  assert.equal(motion.observers[0].disconnects, 1);
  act(() => { motion.observers[0].emit(true); page.update(React.createElement(harness.Podium, { ...props })); });
  assert.equal(motion.animations.length, 1);
  const disconnectsBeforeUnmount = motion.observers[0].disconnects;
  act(() => page.unmount());
  assert.equal(animation.cancellations, 1);
  assert.equal(motion.observers[0].disconnects, disconnectsBeforeUnmount + 1);
  act(() => { page = create(React.createElement(harness.Podium, props), { createNodeMock: motion.createNodeMock }); });
  assert.equal(motion.nodes.length, 2);
  assert.equal(motion.observers.length, 1);
  assert.equal(motion.animations.length, 1);
  act(() => page.unmount());
});

test("the leaderboard shares entrance state across real metric-filter fetch remounts", async () => {
  const motion = motionEnvironment();
  const harness = compile({ motion });
  const page = await renderBoard(harness);
  act(() => motion.observers[0].emit(true));
  assert.equal(motion.animations.length, 1);
  await pickMetric(page, harness, "streak");
  assert.ok(motion.nodes.length >= 2, "filter loading mounted a fresh podium node");
  assert.equal(motion.observers.length, 1);
  assert.equal(motion.animations.length, 1);
  assert.equal(motion.animations[0].cancellations, 1);
  act(() => page.unmount());
});

test("reduced motion keeps the rendered podium visible and skips entrance animation", () => {
  const motion = motionEnvironment({ reduced: true });
  const harness = compile({ motion });
  const entrancePlayedRef = { current: false };
  let page;
  act(() => { page = create(React.createElement(harness.Podium, directProps(harness, { entrancePlayedRef })), { createNodeMock: motion.createNodeMock }); });
  assert.equal(page.root.findAllByType("li").length, 3);
  assert.equal(page.root.findByType("ol").props.style?.opacity, undefined);
  assert.deepEqual(motion.nodes[0].style, {});
  act(() => motion.observers[0].emit(true));
  assert.equal(entrancePlayedRef.current, true);
  assert.equal(motion.animations.length, 0);
  assert.equal(page.root.findAllByProps({ className: "value" }).length, 3);
  act(() => page.unmount());
});

test("unmounting before visibility disconnects the observer without an animation", () => {
  const motion = motionEnvironment();
  const harness = compile({ motion });
  let page;
  act(() => { page = create(React.createElement(harness.Podium, directProps(harness)), { createNodeMock: motion.createNodeMock }); });
  act(() => page.unmount());
  assert.equal(motion.observers[0].disconnects, 1);
  assert.equal(motion.animations.length, 0);
});

test("without IntersectionObserver the immediate entrance still cancels on cleanup", () => {
  const motion = motionEnvironment({ intersection: false });
  const harness = compile({ motion });
  let page;
  act(() => { page = create(React.createElement(harness.Podium, directProps(harness)), { createNodeMock: motion.createNodeMock }); });
  assert.equal(motion.animations.length, 1);
  act(() => page.unmount());
  assert.equal(motion.animations[0].cancellations, 1);
});

test("missing browser animation APIs leave the same podium content visible", () => {
  const motion = motionEnvironment({ intersection: false, animationAPI: false });
  const harness = compile({ motion });
  const entrancePlayedRef = { current: false };
  let page;
  act(() => { page = create(React.createElement(harness.Podium, directProps(harness, { entrancePlayedRef })), { createNodeMock: motion.createNodeMock }); });
  assert.equal(entrancePlayedRef.current, true);
  assert.equal(page.root.findAllByType("li").length, 3);
  assert.equal(motion.animations.length, 0);
  act(() => page.unmount());
});

test("podium names and values stay unframed and the base podium is visible before entrance", () => {
  const css = readFileSync(new URL("../components/Leaderboard.module.css", import.meta.url), "utf8");
  for (const block of css.matchAll(/([^{}]+)\{([^{}]+)\}/g)) {
    if (/\.name\b|\.value\b/.test(block[1])) assert.doesNotMatch(block[2], /(?:background|border(?:-radius)?|box-shadow)\s*:/);
    if (/\.podium\b/.test(block[1])) assert.doesNotMatch(block[2], /(?:opacity\s*:\s*0(?:[;\s])|visibility\s*:\s*hidden|display\s*:\s*none)/);
  }
});
