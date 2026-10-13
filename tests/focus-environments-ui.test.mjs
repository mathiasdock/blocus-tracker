import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { existsSync, readFileSync } from "node:fs";
import { dirname, extname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const require = createRequire(import.meta.url);
const React = require("react");
const { act, create } = require("react-test-renderer");
const { transformSync } = require("@babel/core");
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const compiled = new Map();
const text = node => typeof node === "string" ? node : (node?.children || []).map(text).join("");
const plain = value => JSON.parse(JSON.stringify(value));

function events() {
  const listeners = new Map();
  return { listeners,
    addEventListener(type, fn, capture = false) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type).add({ fn, capture: !!capture });
    },
    removeEventListener(type, fn, capture = false) {
      for (const entry of listeners.get(type) || []) if (entry.fn === fn && entry.capture === !!capture) listeners.get(type).delete(entry);
    },
    dispatch(type, event = {}, phase = "all") {
      for (const entry of [...(listeners.get(type) || [])]) {
        if (phase === "all" || entry.capture === (phase === "capture")) entry.fn(event);
      }
    },
    listenerCount() { return [...listeners.values()].reduce((n, value) => n + value.size, 0); } };
}

// Real Gallery, Control, renderer adapter and ChronoFocus; only the preference
// hook, GPU engines, sound and time graphics are replaced by recording ports.
function browser({ lang = "fr", environmentId = "forest", highestLevel = 1 } = {}) {
  const env = { lang, calls: [], equips: [], refreshes: 0, retries: 0, equipOK: true,
    preferenceSubscribers: new Set(), timers: new Map(), nextTimer: 0, focused: null };
  const style = new Map([["--bt-focus-canvas", "previous-canvas"]]);
  const classes = new Set(["dark"]);
  const document = { ...events(), body: { style: { overflow: "auto" } }, documentElement: {
    style: { getPropertyValue: key => style.get(key) || "", setProperty: (key, value) => style.set(key, value), removeProperty: key => style.delete(key) },
    classList: { add: name => classes.add(name), remove: name => classes.delete(name), contains: name => classes.has(name) } } };
  const window = events();
  const focusNode = name => ({ ...events(), name, insideControl: true, tagName: "BUTTON", focus() { env.focused = this; } });
  const trigger = focusNode("environment-trigger");
  const firstGalleryButton = focusNode("gallery-close");
  const controlRoot = { ...events(), tagName: "DIV", insideControl: true,
    contains: target => !!target?.insideControl,
    querySelector: selector => selector === "[data-gallery] button" ? firstGalleryButton : null };
  env.preferences = { environmentId, highestLevel, loading: false, saving: false, error: null,
    async equip(id) {
      env.equips.push(id);
      if (env.equipOK) env.setPreferences({ environmentId: id });
      return env.equipOK;
    },
    refresh() { env.refreshes += 1; return Promise.resolve(true); },
    retry() { env.retries += 1; return Promise.resolve(true); } };
  env.setPreferences = next => {
    env.preferences = { ...env.preferences, ...next };
    for (const refresh of env.preferenceSubscribers) refresh(value => value + 1);
  };
  env.chrono = { courseId: "math", running: true, elapsed: 123, pomodoro: false,
    pomoPhase: "work", pomoCount: 0, isPaused: false, onBreak: false, pauseSince: "02:03",
    pomoTargetSecs: 1500, blockGoalSecs: 900, blocksAria: "123 seconds of 900 planned", liveMessage: "Keep going",
    startWithFeedback: () => env.calls.push("start"), pauseWithFeedback: () => env.calls.push("pause"),
    skipBreak: () => env.calls.push("skipBreak"), leavePomodoro: () => env.calls.push("leavePomodoro") };
  const port = name => function Port(props) { return React.createElement(name, props); };
  const mocks = {
    "contexts/I18nContext": { useI18n: () => ({ lang: env.lang, t: key => env.translate(env.lang, key) }) },
    "hooks/useFocusEnvironment": { useFocusEnvironment: () => {
      const [, update] = React.useState(0);
      React.useEffect(() => { env.preferenceSubscribers.add(update); return () => env.preferenceSubscribers.delete(update); }, []);
      return env.preferences;
    } },
    "components/Glyph": { default: ({ children }) => React.createElement("glyph", null, children) },
    "components/StudyBlocks": { default: port("study-blocks"), RestTrack: port("rest-track") },
    "components/timer/TimerDigits": { default: port("timer-digits") },
    "components/AmbientSoundControl": { default: port("ambient-control") },
    "components/FocusShaderBackground": { default: props => React.createElement("environment-renderer", { kind: "forest", ...props }) },
  };
  const globals = { window, document, console,
    setTimeout(fn, ms) { const id = ++env.nextTimer; env.timers.set(id, { fn, ms }); return id; },
    clearTimeout(id) { env.timers.delete(id); } };
  const cache = new Map();
  const resolveFile = abs => {
    for (const candidate of extname(abs) ? [abs] : [abs, `${abs}.js`, `${abs}.mjs`, `${abs}.jsx`]) if (existsSync(candidate)) return candidate;
    throw new Error(`Cannot resolve ${abs}`);
  };
  const load = path => {
    const filename = resolveFile(resolve(ROOT, path));
    const key = relative(ROOT, filename).replace(/\.(m?js|jsx)$/, "");
    if (mocks[key]) return { __esModule: true, ...mocks[key] };
    if (cache.has(filename)) return cache.get(filename).exports;
    const fixtureModule = { exports: {} };
    cache.set(filename, fixtureModule);
    if (!compiled.has(filename)) compiled.set(filename, transformSync(readFileSync(filename, "utf8"), {
      filename, babelrc: false, configFile: false,
      presets: [[require.resolve("next/babel"), { "preset-react": { runtime: "automatic" } }]],
      plugins: [require.resolve("@babel/plugin-transform-modules-commonjs")],
    }).code);
    const localRequire = id => {
      if (id.endsWith(".module.css")) {
        const values = Object.fromEntries([...readFileSync(resolve(dirname(filename), id), "utf8").matchAll(/\.([a-zA-Z][\w-]*)/g)].map(match => [match[1], match[1]]));
        return { __esModule: true, default: values };
      }
      if (id === "next/dynamic") return () => function WaveRenderer(props) { return React.createElement("environment-renderer", { kind: "gradient-wave", ...props }); };
      if (id.startsWith(".")) return load(resolve(dirname(filename), id));
      return require(id);
    };
    vm.runInNewContext(compiled.get(filename), { ...globals, module: fixtureModule, exports: fixtureModule.exports, require: localRequire });
    return fixtureModule.exports;
  };
  env.translate = load("lib/i18n").translate;
  env.mount = (t, component, extra = {}) => {
    const Component = load(component).default;
    const isFocus = component === "components/timer/ChronoFocus";
    const isControl = component === "components/focus/FocusEnvironmentControl";
    let options = extra;
    const props = () => isFocus ? { chrono: env.chrono, courses: [{ id: "math", name: "Mathématiques", color: "#123abc" }],
      onClose: () => env.calls.push("close"), onFinish: () => env.calls.push("finish"), ...options }
      : { preferences: env.preferences, ...(isControl ? { visible: true } : {}), ...options };
    const tree = () => React.createElement(Component, props());
    let renderer;
    act(() => { renderer = create(tree(), { createNodeMock: element => {
      if (element.props.className === "control") return controlRoot;
      if (element.props.className === "trigger") return trigger;
      return { focus() {}, getBoundingClientRect: () => ({ x: 0, y: 0, width: 0, height: 0 }) };
    } }); });
    t.after(() => act(() => renderer.unmount()));
    return { renderer, rerender: () => act(() => renderer.update(tree())),
      updateChrono(next) { env.chrono = { ...env.chrono, ...next }; this.rerender(); },
      updateProps(next) { options = { ...options, ...next }; this.rerender(); },
      close: () => act(() => renderer.unmount()) };
  };
  env.key = ({ key, code, target = { tagName: "DIV" }, repeat = false, defaultPrevented = false }) => {
    const event = { key, code, target, repeat, defaultPrevented, propagationStopped: false,
      preventDefault() { this.defaultPrevented = true; }, stopPropagation() { this.propagationStopped = true; } };
    act(() => {
      document.dispatch("keydown", event, "capture");
      if (!event.propagationStopped && target.insideControl) controlRoot.dispatch("keydown", event);
      if (!event.propagationStopped) document.dispatch("keydown", event, "bubble");
      if (!event.propagationStopped) window.dispatch("keydown", event);
    });
    return event;
  };
  return Object.assign(env, { document, window, style, classes, trigger, firstGalleryButton, controlRoot });
}

const buttons = page => page.renderer.root.findAllByType("button");
const buttonNamed = (page, label) => buttons(page).find(button => text(button) === label || button.props["aria-label"] === label);
const options = page => buttons(page).filter(button => button.props.className === "option");
const click = async button => { assert.ok(button, "button exists"); assert.ok(!button.props.disabled, "button is enabled"); await act(async () => { await button.props.onClick(); }); };
const renderers = page => page.renderer.root.findAllByType("environment-renderer");

test("FR/EN gallery exposes equipped/locked levels and reserves future environments without preview or action", t => {
  for (const lang of ["fr", "en"]) {
    const env = browser({ lang });
    const page = env.mount(t, "components/focus/FocusEnvironmentGallery");
    const [forest, wave] = options(page);
    assert.equal(options(page).length, 2);
    assert.equal(forest.props["aria-pressed"], true);
    assert.equal(forest.props.disabled, false);
    assert.match(text(forest), new RegExp(env.translate(lang, "focusEnv.forest")));
    assert.match(text(forest), new RegExp(env.translate(lang, "focusEnv.equipped")));
    assert.match(text(forest), new RegExp(env.translate(lang, "focusEnv.level").replace("{n}", "1")));
    assert.equal(wave.props.disabled, true);
    assert.equal(wave.props["aria-pressed"], false);
    assert.match(text(wave), new RegExp(env.translate(lang, "focusEnv.locked")));
    assert.match(text(wave), new RegExp(env.translate(lang, "focusEnv.level").replace("{n}", "5")));
    const reserved = page.renderer.root.findByProps({ className: "reserved" });
    assert.equal(reserved.findAllByType("li").length, 2);
    assert.equal(reserved.findAllByType("button").length, 0);
    assert.equal(reserved.findAll(node => node.props.style?.background).length, 0);
    assert.match(text(reserved), /12/); assert.match(text(reserved), /20/);
    assert.match(text(reserved), new RegExp(env.translate(lang, "focusEnv.future3")));
    assert.match(text(reserved), new RegExp(env.translate(lang, "focusEnv.future4")));
    assert.match(text(reserved), new RegExp(env.translate(lang, "focusEnv.comingSoon")));
    assert.equal(page.renderer.root.findAllByProps({ className: "preview" }).length, 2);
    assert.equal(renderers(page).length, 0);
    assert.match(text(page.renderer.toJSON()), new RegExp(env.translate(lang, "focusEnv.next").replace("{name}", "Gradient Wave").replace("{n}", "5").replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    page.close();
  }
});

test("unlocked selection emits the exact id and closes only after a successful equip", async t => {
  const env = browser({ lang: "en", highestLevel: 5 });
  let selected = 0;
  const page = env.mount(t, "components/focus/FocusEnvironmentGallery", { onSelected: () => selected += 1 });
  assert.equal(options(page)[1].props.disabled, false);
  assert.match(text(options(page)[1]), /Available/);
  env.equipOK = false;
  await click(options(page)[1]);
  assert.deepEqual(env.equips, ["gradient-wave"]);
  assert.equal(selected, 0);
  env.equipOK = true;
  await click(options(page)[1]);
  page.rerender();
  assert.deepEqual(env.equips, ["gradient-wave", "gradient-wave"]);
  assert.equal(selected, 1);
  assert.equal(options(page)[1].props["aria-pressed"], true);
  assert.match(text(options(page)[1]), /Equipped/);
  assert.equal(page.renderer.root.findAllByProps({ className: "next" }).length, 0);
});

test("choosing an already-equipped environment closes without a server equip, including guest Forest", async t => {
  for (const environmentId of ["forest", "gradient-wave"]) {
    const env = browser({ environmentId, highestLevel: environmentId === "forest" ? 1 : 5 });
    env.equipOK = false;
    const page = env.mount(t, "components/focus/FocusEnvironmentControl");
    await click(buttonNamed(page, env.translate("fr", "focusEnv.title")));
    await click(options(page).find(option => option.props["aria-pressed"]));
    assert.deepEqual(env.equips, [], "the equipped choice does not depend on a write or authenticated owner");
    assert.equal(buttonNamed(page, env.translate("fr", "focusEnv.title")).props["aria-expanded"], false);
    assert.equal(env.focused, env.trigger);
    page.close();
  }
});

test("loading/saving disable equip, show status, and an error retries the pending preference action", async t => {
  const env = browser({ highestLevel: 5 });
  env.preferences.loading = true;
  const page = env.mount(t, "components/focus/FocusEnvironmentGallery");
  assert.ok(options(page).every(button => button.props.disabled));
  assert.equal(page.renderer.root.findByProps({ role: "status" }).children.join(""), env.translate("fr", "common.loading"));
  env.preferences = { ...env.preferences, loading: false, saving: true };
  page.rerender();
  assert.ok(options(page).every(button => button.props.disabled));
  assert.equal(page.renderer.root.findByProps({ role: "status" }).children.join(""), env.translate("fr", "common.saving"));
  env.preferences = { ...env.preferences, saving: false, error: "focus_unavailable" };
  page.rerender();
  assert.match(text(page.renderer.root.findByProps({ role: "alert" })), /Impossible de synchroniser/);
  await click(buttonNamed(page, env.translate("fr", "focusEnv.retry")));
  assert.equal(env.retries, 1);
  assert.equal(env.refreshes, 0);
});

test("selection mounts exactly one renderer and keeps environment tokens scoped to Focus", async t => {
  const env = browser({ highestLevel: 5 });
  const page = env.mount(t, "components/timer/ChronoFocus");
  assert.equal(renderers(page).length, 1);
  assert.equal(renderers(page)[0].props.kind, "forest");
  assert.equal(page.renderer.toJSON().props["data-environment"], "forest");
  await click(buttonNamed(page, env.translate("fr", "focusEnv.title")));
  assert.equal(env.refreshes, 1);
  await click(options(page)[1]);
  assert.deepEqual(env.equips, ["gradient-wave"]);
  assert.equal(renderers(page).length, 1);
  assert.equal(renderers(page)[0].props.kind, "gradient-wave");
  assert.equal(page.renderer.toJSON().props["data-environment"], "gradient-wave");
  assert.equal(page.renderer.toJSON().props.style["--bt-focus-env-canvas"], "#38bdf8");
  assert.equal(env.style.get("--bt-focus-canvas"), "#38bdf8");
  assert.equal(env.style.get("--bt-ink-text"), undefined);
  assert.equal(env.style.get("--bt-focus-env-text"), undefined);
  assert.equal(env.style.size, 1, "only the fullscreen safe-area canvas is applied to the root");
  assert.equal(buttonNamed(page, env.translate("fr", "focusEnv.title")).props["aria-expanded"], false);
  assert.equal(env.focused, env.trigger);
  await click(buttonNamed(page, env.translate("fr", "focusEnv.title")));
  await click(options(page)[0]);
  assert.equal(renderers(page).length, 1);
  assert.equal(renderers(page)[0].props.kind, "forest");
  assert.equal(env.style.get("--bt-focus-canvas"), "var(--bt-ink)");
  assert.equal(page.renderer.toJSON().props.style["--bt-focus-env-canvas"], undefined);
  page.close();
  assert.equal(env.style.get("--bt-focus-canvas"), "previous-canvas");
  assert.equal(env.document.body.style.overflow, "auto");
  assert.deepEqual([...env.classes], ["dark"]);
});

test("Escape closes the gallery first and returns focus; the next Escape exits Focus", async t => {
  const env = browser({ highestLevel: 5 });
  const page = env.mount(t, "components/timer/ChronoFocus");
  await click(buttonNamed(page, env.translate("fr", "focusEnv.title")));
  assert.equal(env.focused, env.firstGalleryButton);
  const first = env.key({ key: "Escape", code: "Escape", target: env.firstGalleryButton });
  assert.equal(first.defaultPrevented, true);
  assert.equal(first.propagationStopped, true);
  assert.deepEqual(env.calls, []);
  assert.equal(env.focused, env.trigger);
  assert.equal(buttonNamed(page, env.translate("fr", "focusEnv.title")).props["aria-expanded"], false);
  env.key({ key: "Escape", code: "Escape", defaultPrevented: true });
  assert.deepEqual(env.calls, [], "a previously handled Escape is respected");
  env.key({ key: "Escape", code: "Escape", target: env.trigger });
  assert.deepEqual(env.calls, ["close"]);
});

test("Escape after tabbing outside an open gallery closes the gallery, preserves Focus and restores the trigger", async t => {
  const env = browser({ highestLevel: 5 });
  const page = env.mount(t, "components/timer/ChronoFocus");
  await click(buttonNamed(page, env.translate("fr", "focusEnv.title")));
  const pauseButton = { tagName: "BUTTON", name: "main-pause", focus() { env.focused = this; } };
  pauseButton.focus();
  assert.ok([...env.document.listeners.get("keydown")].some(listener => listener.capture), "gallery Escape is caught during document capture");
  const escape = env.key({ key: "Escape", code: "Escape", target: pauseButton });
  assert.equal(escape.defaultPrevented, true);
  assert.equal(escape.propagationStopped, true);
  assert.deepEqual(env.calls, []);
  assert.equal(buttonNamed(page, env.translate("fr", "focusEnv.title")).props["aria-expanded"], false);
  assert.equal(env.focused, env.trigger);
});

test("Space pauses/resumes outside controls, never while gallery is open or a button/input owns the key", async t => {
  const env = browser({ highestLevel: 5 });
  const page = env.mount(t, "components/timer/ChronoFocus");
  const pause = env.key({ key: " ", code: "Space" });
  assert.equal(pause.defaultPrevented, true);
  assert.deepEqual(env.calls, ["pause"]);
  for (const tagName of ["BUTTON", "INPUT", "TEXTAREA", "SELECT"]) env.key({ key: " ", code: "Space", target: { tagName } });
  env.key({ key: " ", code: "Space", repeat: true });
  assert.deepEqual(env.calls, ["pause"]);
  await click(buttonNamed(page, env.translate("fr", "focusEnv.title")));
  const gallerySpace = env.key({ key: " ", code: "Space" });
  assert.equal(gallerySpace.defaultPrevented, false);
  assert.deepEqual(env.calls, ["pause"]);
  await click(buttonNamed(page, env.translate("fr", "common.close")));
  page.updateChrono({ running: false, isPaused: true });
  env.key({ key: " ", code: "Space" });
  assert.deepEqual(env.calls, ["pause", "start"]);
  page.updateChrono({ courseId: null, pomodoro: false });
  env.key({ key: " ", code: "Space" });
  assert.deepEqual(env.calls, ["pause", "start"]);
});

test("free-study Focus retains elapsed time, course color, blocks, pause warning and finish order", async t => {
  const env = browser({ environmentId: "gradient-wave", highestLevel: 5 });
  const page = env.mount(t, "components/timer/ChronoFocus");
  assert.equal(page.renderer.root.findByType("timer-digits").props.seconds, 123);
  const blocks = page.renderer.root.findByType("study-blocks");
  assert.deepEqual(plain({ earned: blocks.props.earnedSecs, planned: blocks.props.plannedSecs,
    running: blocks.props.running, focus: blocks.props.focus, label: blocks.props.label }),
  { earned: 123, planned: 900, running: true, focus: true, label: "123 seconds of 900 planned" });
  assert.match(text(page.renderer.toJSON()), /Mathématiques/);
  assert.equal(page.renderer.root.findAll(node => node.props.style?.backgroundColor === "#123abc").length, 1);
  assert.equal(page.renderer.root.findByType("ambient-control").props.active, true);
  await click(buttonNamed(page, env.translate("fr", "dash.pause")));
  assert.deepEqual(env.calls, ["pause"]);
  page.updateChrono({ running: false, isPaused: true });
  assert.equal(renderers(page)[0].props.paused, true);
  assert.equal(page.renderer.root.findAll(node => node.props.className === "bt-pause-flash").length, 1);
  assert.equal(page.renderer.root.findByType("timer-digits").props.seconds, 123);
  assert.equal(env.style.get("--bt-focus-canvas"), "#1A0605");
  assert.match(text(page.renderer.toJSON()), /02:03/);
  await click(buttonNamed(page, env.translate("fr", "dash.resume")));
  await click(buttonNamed(page, env.translate("fr", "dash.finish")));
  assert.deepEqual(env.calls, ["pause", "start", "leavePomodoro", "finish", "close"]);
  page.updateProps({ saveStatus: "saving" });
  assert.equal(buttonNamed(page, env.translate("fr", "common.saving")).props.disabled, true);
  page.updateProps({ saveStatus: "idle" });
  page.updateChrono({ elapsed: 0, isPaused: false });
  assert.equal(buttonNamed(page, env.translate("fr", "dash.finish")).props.disabled, true);
});

test("Pomodoro work and rest retain countdown, cycles, and skip-break behavior in either environment", async t => {
  for (const environmentId of ["forest", "gradient-wave"]) {
    const env = browser({ lang: "en", environmentId, highestLevel: 5 });
    env.chrono = { ...env.chrono, courseId: null, pomodoro: true, elapsed: 120, pomoCount: 2 };
    const page = env.mount(t, "components/timer/ChronoFocus", { noCourseLabel: "Pomodoro session" });
    assert.equal(page.renderer.root.findByType("timer-digits").props.seconds, 1380);
    assert.match(text(page.renderer.toJSON()), /Pomodoro session/);
    assert.match(text(page.renderer.toJSON()), /Cycle 2/i);
    assert.equal(page.renderer.root.findAllByType("rest-track").length, 0);
    page.updateChrono({ onBreak: true, pomoPhase: "break", pomoTargetSecs: 300, elapsed: 30, isPaused: true, running: false });
    assert.equal(renderers(page)[0].props.paused, false, "Pomodoro rest does not borrow the free-study red pause field");
    assert.equal(page.renderer.root.findByType("timer-digits").props.seconds, 270);
    const rest = page.renderer.root.findByType("rest-track");
    assert.equal(rest.props.remainingSecs, 270); assert.equal(rest.props.totalSecs, 300);
    assert.equal(page.renderer.root.findAllByType("study-blocks").length, 0);
    assert.equal(buttonNamed(page, env.translate("en", "dash.finish")), undefined);
    assert.equal(buttonNamed(page, env.translate("en", "dash.resume")), undefined);
    await click(buttonNamed(page, env.translate("en", "dash.skipBreak")));
    assert.deepEqual(env.calls, ["skipBreak"]);
    page.close();
  }
});

test("control close/outside dismissal and Focus unmount remove listeners and pending idle timers", async t => {
  const env = browser();
  const page = env.mount(t, "components/timer/ChronoFocus");
  await click(buttonNamed(page, env.translate("fr", "focusEnv.title")));
  assert.equal(env.document.listeners.get("pointerdown")?.size, 1);
  act(() => env.document.dispatch("pointerdown", { target: { tagName: "DIV" } }));
  assert.equal(buttonNamed(page, env.translate("fr", "focusEnv.title")).props["aria-expanded"], false);
  assert.equal(env.controlRoot.listenerCount(), 0);
  assert.ok(env.timers.size > 0);
  page.close();
  assert.equal(env.timers.size, 0);
  assert.equal(env.document.listenerCount(), 0);
  assert.equal(env.window.listenerCount(), 0);
  assert.equal(env.controlRoot.listenerCount(), 0);
  assert.equal(env.preferenceSubscribers.size, 0);
});

test("an open gallery stays visible after the timer's idle controls fade", async t => {
  const env = browser();
  const page = env.mount(t, "components/timer/ChronoFocus");
  await click(buttonNamed(page, env.translate("fr", "focusEnv.title")));
  act(() => {
    for (const [id, timer] of [...env.timers]) {
      env.timers.delete(id);
      timer.fn();
    }
  });
  const control = page.renderer.root.findByProps({ className: "control" });
  assert.equal(control.props.style.opacity, 1);
  assert.equal(control.props.style.pointerEvents, "auto");
  assert.equal(page.renderer.root.findByType("ambient-control").props.visible, false);
  assert.equal(page.renderer.root.findAllByProps({ id: "focus-environment-gallery" }).length, 1);
});
