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
  return {
    addEventListener(type, fn) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type).add(fn);
    },
    removeEventListener(type, fn) { listeners.get(type)?.delete(fn); },
    dispatch(type, event = {}) { for (const fn of [...(listeners.get(type) || [])]) fn(event); },
    listenerCount() { return [...listeners.values()].reduce((n, set) => n + set.size, 0); },
  };
}

function element(tagName) {
  const classes = new Set();
  return {
    tagName: tagName.toUpperCase(), children: [], className: "", textContent: "",
    appendChild(node) { this.children.push(node); return node; },
    classList: {
      contains: name => classes.has(name),
      toggle(name, enabled) { if (enabled) classes.add(name); else classes.delete(name); },
    },
  };
}

function browser({ lang = "fr", desktop = true, supported = true } = {}) {
  const env = { lang, requests: [], portals: [], observers: [], timerCalls: [], clockCalls: [], order: [] };
  const root = element("html");
  root.lang = lang;
  root.classList.toggle("dark", true);
  const document = { ...events(), documentElement: root,
    baseURI: "https://blocus.example/dashboard", styleSheets: [
      { cssRules: [{ cssText: '@font-face { font-family: "Nunito Sans"; src: url("/fonts/nunito-sans-latin.woff2"); }' },
        { cssText: ":root { --bt-surface: #fffdfb; } .time { font-variant-numeric: tabular-nums; }" }] },
      { href: "https://assets.example/loaded.css", get cssRules() { throw new Error("Cross-origin stylesheet"); } },
    ] };
  const media = { ...events(), matches: desktop };
  const window = { ...events(), focus() { env.order.push("opener.focus"); },
    matchMedia(query) { env.mediaQuery = query; return media; },
    open() { throw new Error("Mini timer must not use window.open"); } };
  const trigger = { focus() { env.order.push("trigger.focus"); } };
  const control = { contains: node => node === trigger };
  env.makeWindow = () => {
    const pip = { ...events(), closed: false, focusCount: 0,
      document: { title: "", createElement: element, documentElement: element("html"), head: element("head"), body: element("body") },
      focus() { this.focusCount += 1; },
      close() { env.order.push("pip.close"); this.closed = true; this.dispatch("pagehide"); },
    };
    return pip;
  };
  env.pip = env.makeWindow();
  env.request = () => Promise.resolve(env.pip);
  if (supported) window.documentPictureInPicture = {
    requestWindow(options) { env.requests.push(plain(options)); return env.request(); },
  };
  const chrono = { courseId: "math", running: true, elapsed: 123, pomodoro: false,
    pomoTargetSecs: 1500, isPaused: false, onBreak: false };
  for (const name of ["startWithFeedback", "pauseWithFeedback", "reset", "finish", "skipBreak", "leavePomodoro"]) {
    chrono[name] = () => env.timerCalls.push(name);
  }
  env.chrono = Object.freeze(chrono);
  const mocks = {
    "contexts/I18nContext": { useI18n: () => ({ lang: env.lang, t: key => env.translate(env.lang, key) }) },
    "components/Glyph": { default: ({ children }) => React.createElement("glyph", null, children) },
  };
  const globals = { window, document, console,
    MutationObserver: class {
      constructor(callback) { this.callback = callback; this.connected = false; env.observers.push(this); }
      observe(target, options) { this.connected = true; this.target = target; this.options = plain(options); }
      disconnect() { this.connected = false; }
    },
    setInterval(...args) { env.clockCalls.push(["setInterval", ...args]); },
    clearInterval(...args) { env.clockCalls.push(["clearInterval", ...args]); },
    setTimeout(...args) { env.clockCalls.push(["setTimeout", ...args]); },
    clearTimeout(...args) { env.clockCalls.push(["clearTimeout", ...args]); },
  };
  const cache = new Map();
  const load = path => {
    const abs = resolve(ROOT, path);
    const filename = (extname(abs) ? [abs] : [abs, `${abs}.js`, `${abs}.mjs`]).find(existsSync);
    assert.ok(filename, `Module exists: ${path}`);
    const key = relative(ROOT, filename).replace(/\.(m?js)$/, "");
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
      if (id === "react-dom") return { createPortal(children, target) {
        env.portals.push(target);
        return React.createElement("portal", { target }, children);
      } };
      if (id.endsWith(".module.css")) return { __esModule: true,
        default: Object.fromEntries([...readFileSync(resolve(dirname(filename), id), "utf8").matchAll(/\.([a-zA-Z][\w-]*)/g)].map(match => [match[1], match[1]])) };
      if (id.startsWith(".")) return load(resolve(dirname(filename), id));
      return require(id);
    };
    vm.runInNewContext(compiled.get(filename), { ...globals, module: fixtureModule, exports: fixtureModule.exports, require: localRequire });
    return fixtureModule.exports;
  };
  env.translate = load("lib/i18n").translate;
  env.mount = (t, props = {}) => {
    const Component = load("components/focus/FocusMiniTimer").default;
    let extra = props;
    const tree = () => React.createElement(Component, { chrono: env.chrono,
      courses: [{ id: "math", name: "Mathématiques", color: "#123abc" }], visible: true, ...extra });
    let renderer;
    act(() => { renderer = create(tree(), { createNodeMock: node => node.props.className === "trigger" ? trigger : control }); });
    const page = { renderer, rerender: () => act(() => renderer.update(tree())),
      updateChrono(next) { env.chrono = Object.freeze({ ...env.chrono, ...next }); this.rerender(); },
      updateProps(next) { extra = { ...extra, ...next }; this.rerender(); },
      close: () => act(() => renderer.unmount()) };
    t.after(page.close);
    return page;
  };
  env.mutateRoot = ({ dark, lang: nextLang }) => {
    if (dark !== undefined) root.classList.toggle("dark", dark);
    if (nextLang) root.lang = nextLang;
    act(() => { for (const observer of env.observers) if (observer.connected) observer.callback(); });
  };
  env.assertReadOnly = () => {
    assert.deepEqual(env.timerCalls, [], "window actions never mutate the chrono");
    assert.deepEqual(env.clockCalls, [], "the view never creates its own clock");
  };
  return Object.assign(env, { window, document, media, trigger });
}

const trigger = page => page.renderer.root.findByProps({ className: "trigger" });
const portals = page => page.renderer.root.findAllByType("portal");
const mini = page => portals(page)[0].findByType("main");
const timer = page => mini(page).findByProps({ role: "timer" });
const status = page => mini(page).findByProps({ role: "status" });
const feedback = page => page.renderer.root.findByProps({ id: "mini-timer-feedback" });
const click = async button => { assert.ok(!button.props.disabled); await act(async () => { await button.props.onClick(); }); };

test("desktop click requests native PiP immediately and guards a pending double click", async t => {
  const env = browser();
  let resolveRequest;
  env.request = () => new Promise(resolve => { resolveRequest = resolve; });
  const page = env.mount(t);
  const button = trigger(page);
  assert.match(env.mediaQuery, /min-width.*hover.*pointer/);
  let opening;
  act(() => {
    opening = button.props.onClick();
    button.props.onClick();
    assert.deepEqual(env.requests, [{ width: 320, height: 240 }], "request runs in the original click before yielding");
  });
  assert.equal(trigger(page).props.disabled, true);
  assert.equal(trigger(page).props["aria-busy"], true);
  assert.equal(text(trigger(page)), env.translate("fr", "miniTimer.opening"));
  await act(async () => { resolveRequest(env.pip); await opening; });
  assert.equal(trigger(page).props.disabled, false);
  assert.equal(portals(page).length, 1);
  assert.equal(portals(page)[0].props.target, env.pip.document.body.children[0]);
  assert.equal(text(timer(page)), "02:03");
  env.assertReadOnly();
});

test("unsupported desktop browsers explain availability in FR and EN without a fake popup", async t => {
  for (const lang of ["fr", "en"]) {
    const env = browser({ lang, supported: false });
    const page = env.mount(t, { visible: false });
    assert.equal(text(trigger(page)), env.translate(lang, "miniTimer.title"));
    await click(trigger(page));
    assert.equal(text(feedback(page).findByType("p")), env.translate(lang, "miniTimer.unsupported"));
    assert.match(text(feedback(page)), /Chrome.*Edge/);
    assert.equal(trigger(page).props["aria-describedby"], "mini-timer-feedback");
    assert.equal(page.renderer.root.findByProps({ className: "control" }).props["data-visible"], "true");
    assert.equal(portals(page).length, 0);
    assert.deepEqual(env.requests, []);
    env.assertReadOnly();
    page.close();
  }
});

test("unsupported feedback dismisses with Escape, outside pointer and close, then cleans up on unmount", async t => {
  const env = browser({ supported: false });
  const page = env.mount(t);
  const dismissed = () => {
    assert.equal(page.renderer.root.findAllByProps({ id: "mini-timer-feedback" }).length, 0);
    assert.equal(env.document.listenerCount(), 0);
  };
  await click(trigger(page));
  assert.equal(env.document.listenerCount(), 2);
  const escape = { key: "Escape", defaultPrevented: false, propagationStopped: false,
    preventDefault() { this.defaultPrevented = true; },
    stopPropagation() { this.propagationStopped = true; } };
  act(() => env.document.dispatch("keydown", escape));
  assert.equal(escape.defaultPrevented, true);
  assert.equal(escape.propagationStopped, true, "Escape is consumed before Focus can close");
  assert.deepEqual(env.order, ["trigger.focus"]);
  dismissed();
  await click(trigger(page));
  act(() => env.document.dispatch("pointerdown", { target: {} }));
  dismissed();
  await click(trigger(page));
  await click(feedback(page).findByType("button"));
  assert.deepEqual(env.order, ["trigger.focus", "trigger.focus"]);
  dismissed();
  await click(trigger(page));
  assert.equal(env.document.listenerCount(), 2);
  page.close();
  assert.equal(env.document.listenerCount(), 0);
  assert.equal(env.media.listenerCount(), 0);
  env.assertReadOnly();
});

test("mobile has no mini timer affordance and responds to desktop media changes", t => {
  for (const supported of [true, false]) {
    const env = browser({ desktop: false, supported });
    const page = env.mount(t);
    assert.equal(page.renderer.toJSON(), null);
    act(() => { env.media.matches = true; env.media.dispatch("change"); });
    assert.equal(text(trigger(page)), env.translate("fr", "miniTimer.title"));
    act(() => { env.media.matches = false; env.media.dispatch("change"); });
    assert.equal(page.renderer.toJSON(), null);
    assert.deepEqual(env.requests, []);
    env.assertReadOnly();
    page.close();
  }
});

test("the portal renders live chrono/course props, paused/stopped states and supplied Pomodoro targets", async t => {
  const env = browser({ lang: "en" });
  const page = env.mount(t);
  await click(trigger(page));
  assert.equal(text(timer(page)), "02:03");
  assert.equal(text(status(page)), "In progress");
  assert.equal(mini(page).findByProps({ className: "courseDot" }).props.style.backgroundColor, "#123abc");
  page.updateChrono({ elapsed: 3661 });
  assert.equal(text(timer(page)), "01:01:01");
  page.updateChrono({ elapsed: 3678, running: false, isPaused: true });
  assert.equal(text(timer(page)), "01:01:18");
  assert.equal(timer(page).props["data-paused"], true);
  assert.equal(text(status(page)), "Paused");
  page.updateChrono({ elapsed: 0, running: false, isPaused: false, courseId: null });
  page.updateProps({ noCourseLabel: "General study" });
  assert.equal(text(timer(page)), "00:00");
  assert.equal(text(status(page)), "Ready to start");
  assert.equal(text(mini(page).findByProps({ className: "course" })), "General study");
  assert.equal(mini(page).findAllByProps({ className: "courseDot" }).length, 0);
  page.updateChrono({ running: true, pomodoro: true, elapsed: 61, pomoTargetSecs: 1020 });
  assert.equal(text(timer(page)), "15:59");
  page.updateChrono({ onBreak: true, elapsed: 73, pomoTargetSecs: 240 });
  assert.equal(text(timer(page)), "02:47");
  assert.equal(text(status(page)), "Pomodoro break");
  page.updateChrono({ elapsed: 300 });
  assert.equal(text(timer(page)), "00:00");
  assert.equal(timer(page).props["aria-live"], "off");
  assert.equal(mini(page).findAllByType("button").length, 1, "the only PiP action is Return to Focus");
  env.assertReadOnly();
});

test("native pagehide removes the portal and listeners without pausing or finishing", async t => {
  const env = browser();
  const page = env.mount(t);
  await click(trigger(page));
  assert.equal(env.pip.listenerCount(), 1);
  act(() => { env.pip.closed = true; env.pip.dispatch("pagehide"); });
  assert.equal(portals(page).length, 0);
  assert.equal(env.pip.listenerCount(), 0);
  assert.equal(env.observers[0].connected, false);
  assert.equal(env.chrono.running, true);
  env.pip = env.makeWindow();
  await click(trigger(page));
  assert.equal(env.requests.length, 2);
  assert.equal(portals(page).length, 1);
  env.assertReadOnly();
});

test("Return focuses the opener and closes only the mini window", async t => {
  const env = browser();
  const page = env.mount(t);
  await click(trigger(page));
  await click(mini(page).findByType("button"));
  assert.deepEqual(env.order, ["opener.focus", "pip.close", "trigger.focus"]);
  assert.equal(env.pip.closed, true);
  assert.equal(portals(page).length, 0);
  assert.equal(env.chrono.running, true);
  env.assertReadOnly();
});

test("reopening focuses the existing native window instead of creating another", async t => {
  const env = browser();
  const page = env.mount(t);
  await click(trigger(page));
  const target = portals(page)[0].props.target;
  await click(trigger(page));
  assert.equal(env.requests.length, 1);
  assert.equal(env.pip.focusCount, 1);
  assert.equal(portals(page)[0].props.target, target);
  assert.equal(env.observers.length, 1);
  env.assertReadOnly();
});

test("rejected requests restore a translated usable trigger and allow retry", async t => {
  for (const lang of ["fr", "en"]) {
    const env = browser({ lang });
    const page = env.mount(t);
    env.request = () => Promise.reject(new Error("Browser denied activation"));
    await click(trigger(page));
    assert.equal(text(feedback(page).findByType("p")), env.translate(lang, "miniTimer.blocked"));
    assert.equal(trigger(page).props.disabled, false);
    assert.equal(portals(page).length, 0);
    env.request = () => Promise.resolve(env.pip);
    await click(trigger(page));
    assert.equal(env.requests.length, 2);
    assert.equal(page.renderer.root.findAllByProps({ id: "mini-timer-feedback" }).length, 0);
    assert.equal(portals(page).length, 1);
    env.assertReadOnly();
    page.close();
  }
});

test("unmount closes an active window and disconnects every PiP/media listener", async t => {
  const env = browser();
  const page = env.mount(t);
  await click(trigger(page));
  page.close();
  assert.equal(env.pip.closed, true);
  assert.equal(env.pip.listenerCount(), 0);
  assert.equal(env.media.listenerCount(), 0);
  assert.equal(env.observers[0].connected, false);
  assert.deepEqual(env.order, ["pip.close"]);
  env.assertReadOnly();
});

test("a request resolving after unmount closes its window without preparing or portaling it", async t => {
  const env = browser();
  let resolveRequest;
  env.request = () => new Promise(resolve => { resolveRequest = resolve; });
  const page = env.mount(t);
  let opening;
  act(() => { opening = trigger(page).props.onClick(); });
  page.close();
  await act(async () => { resolveRequest(env.pip); await opening; });
  assert.equal(env.pip.closed, true);
  assert.deepEqual(env.pip.document.head.children, []);
  assert.deepEqual(env.pip.document.body.children, []);
  assert.deepEqual(env.portals, []);
  assert.deepEqual(env.observers, []);
  assert.equal(env.media.listenerCount(), 0);
  env.assertReadOnly();
});

test("PiP copies loaded styles/local font URLs and follows the app root theme and language", async t => {
  const env = browser();
  const page = env.mount(t);
  await click(trigger(page));
  const doc = env.pip.document;
  const [base, style, link] = doc.head.children;
  assert.equal(base.tagName, "BASE");
  assert.equal(base.href, env.document.baseURI);
  assert.equal(style.tagName, "STYLE");
  assert.equal(style.textContent, env.document.styleSheets[0].cssRules.map(rule => rule.cssText).join("\n"));
  assert.match(style.textContent, /Nunito Sans.*\/fonts\/nunito-sans-latin\.woff2/);
  assert.equal(link.tagName, "LINK");
  assert.equal(link.rel, "stylesheet");
  assert.equal(link.href, env.document.styleSheets[1].href);
  assert.equal(doc.body.className, "windowBody");
  assert.equal(doc.documentElement.classList.contains("dark"), true);
  assert.equal(doc.documentElement.lang, "fr");
  assert.equal(doc.title, "Blocus Tracker · Mini-chrono");
  assert.equal(env.observers[0].target, env.document.documentElement);
  assert.deepEqual(env.observers[0].options, { attributes: true, attributeFilter: ["class", "lang"] });
  env.mutateRoot({ dark: false, lang: "en" });
  assert.equal(doc.documentElement.classList.contains("dark"), false);
  assert.equal(doc.documentElement.lang, "en");
  env.lang = "en";
  page.rerender();
  assert.equal(doc.title, "Blocus Tracker · Mini timer");
  assert.equal(text(status(page)), "In progress");
  assert.equal(text(mini(page).findByType("button")), "Back to Focus");
  env.assertReadOnly();
});
