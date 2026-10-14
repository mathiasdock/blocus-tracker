import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const require = createRequire(import.meta.url);
const React = require("react");
const { act, create } = require("react-test-renderer");
const { transformSync } = require("@babel/core");
const { focusColors, rgb } = require("../lib/colorTokens.cjs");
const source = readFileSync(new URL("../components/FocusShaderBackground.js", import.meta.url), "utf8");

function target() {
  const listeners = new Map();
  return {
    listeners,
    addEventListener: (key, fn) => listeners.set(key, fn),
    removeEventListener: key => listeners.delete(key),
    dispatch: (key, event = {}) => listeners.get(key)?.(event),
  };
}

function browser(t, options = {}) {
  const live = { buffers: new Set(), programs: new Set(), shaders: new Set() };
  const uniforms = new Map(), rafs = new Map(), observers = new Set();
  let draws = 0, contexts = 0, loses = 0, seq = 0, now = 0, lost = false;
  const alloc = kind => { const value = {}; live[kind].add(value); return value; };
  const uniform = (location, values) => uniforms.set(location, Array.from(values));
  const gl = {
    VERTEX_SHADER: 1, FRAGMENT_SHADER: 2, COMPILE_STATUS: 3, LINK_STATUS: 4, ARRAY_BUFFER: 5, STATIC_DRAW: 6, FLOAT: 7, TRIANGLES: 8,
    createShader: type => Object.assign(alloc("shaders"), { type }), createProgram: () => alloc("programs"), createBuffer: () => alloc("buffers"),
    shaderSource: (shader, text) => shader.source = text, compileShader() {},
    getShaderParameter: shader => !lost && options.failCompile !== shader.type, getShaderInfoLog: () => "compile failure",
    attachShader() {}, linkProgram() {}, getProgramParameter: () => !options.failLink, getProgramInfoLog: () => "link failure", useProgram() {},
    deleteShader: value => live.shaders.delete(value), deleteProgram: value => live.programs.delete(value), deleteBuffer: value => live.buffers.delete(value),
    bindBuffer() {}, bufferData() {}, getAttribLocation: () => 0, enableVertexAttribArray() {}, vertexAttribPointer() {}, viewport() {},
    getUniformLocation: (_program, name) => name, uniform3fv: uniform, uniform4f: (location, ...values) => uniform(location, values),
    drawArrays: (_mode, _start, count) => { assert.equal(count, 3); draws++; },
    getExtension: name => name === "WEBGL_lose_context" ? { loseContext: () => { loses++; lost = true; } } : null,
  };
  const canvas = { style: {}, width: 300, height: 150,
    rect: { left: 0, top: 0, width: 320, height: 240 },
    getBoundingClientRect: () => canvas.rect,
    getContext: () => { contexts++; return options.noWebGL ? null : gl; },
  };
  const reduced = { ...target(), matches: !!options.reduced };
  const document = { ...target(), hidden: false, documentElement: target() };
  const window = { ...target(), devicePixelRatio: 3, matchMedia: () => reduced, performance: { now: () => now },
    requestAnimationFrame: fn => { const id = ++seq; rafs.set(id, fn); return id; }, cancelAnimationFrame: id => rafs.delete(id),
    ResizeObserver: class {
      constructor(callback) { this.callback = callback; }
      observe(element) { assert.equal(element, canvas); observers.add(this); }
      disconnect() { observers.delete(this); }
    },
  };
  document.defaultView = window; canvas.ownerDocument = document;
  const openerDocument = { ...target(), hidden: true, documentElement: target() };
  const openerWindow = { ...target(), devicePixelRatio: 1, matchMedia() { throw Error("opener media query used"); } };
  const module = { exports: {} };
  const { code } = transformSync(source, {
    filename: "FocusShaderBackground.js", babelrc: false, configFile: false,
    presets: [[require.resolve("next/babel"), { "preset-react": { runtime: "automatic" } }]],
    plugins: [require.resolve("@babel/plugin-transform-modules-commonjs")],
  });
  vm.runInNewContext(code, {
    require: id => id.endsWith("colorTokens.cjs") ? require("../lib/colorTokens.cjs") : require(id),
    module, exports: module.exports, document: openerDocument, window: openerWindow,
    performance: { now() { throw Error("opener clock used"); } },
    requestAnimationFrame() { throw Error("global RAF used"); }, cancelAnimationFrame() { throw Error("global RAF cancellation used"); },
    ResizeObserver: class { constructor() { throw Error("global ResizeObserver used"); } },
    console: { warn() {} },
  });
  let renderer;
  act(() => { renderer = create(React.createElement(module.exports.default, options.props), { createNodeMock: () => canvas }); });
  const close = () => act(() => renderer.unmount());
  t.after(close);
  return {
    canvas, uniforms, live, rafs, observers, document, window, reduced, openerDocument, openerWindow, close,
    get draws() { return draws; }, get contexts() { return contexts; }, get loses() { return loses; },
    update: props => act(() => renderer.update(React.createElement(module.exports.default, props))),
    remountSameCanvas: () => act(() => { renderer = create(React.createElement(module.exports.default, options.props), { createNodeMock: () => canvas }); }),
    step: time => act(() => { now = time; const fns = [...rafs.values()]; rafs.clear(); fns.forEach(fn => fn(now)); }),
    hide: hidden => act(() => { document.hidden = hidden; document.dispatch("visibilitychange"); }),
    reduce: matches => act(() => { reduced.matches = matches; reduced.dispatch("change", { matches }); }),
    resize: (width, height) => act(() => { canvas.rect.width = width; canvas.rect.height = height; [...observers].forEach(observer => observer.callback()); }),
    pointer: (clientX, clientY) => act(() => window.dispatch("pointermove", { clientX, clientY, pointerType: "mouse" })),
  };
}

function assertReleased(env) {
  for (const resources of Object.values(env.live)) assert.equal(resources.size, 0);
  for (const item of [env.document, env.document.documentElement, env.window, env.reduced]) assert.equal(item.listeners.size, 0);
  assert.equal(env.rafs.size, 0); assert.equal(env.observers.size, 0);
}

test("Forest defaults retain the palette, source speed, uncapped frames and 2x DPR ceiling", t => {
  const env = browser(t);
  env.step(0); env.step(10); env.step(20);
  assert.equal(env.draws, 3);
  assert.equal(env.canvas.width, 640); assert.equal(env.canvas.height, 480);
  assert.ok(Math.abs(env.uniforms.get("u_scene")[2] - .02 * .75) < 1e-12);
  const colors = [...focusColors, ...Array(3).fill(focusColors[4])].flatMap(hex => rgb(hex).map(channel => channel / 255));
  assert.deepEqual(env.uniforms.get("u_colors[0]"), Array.from(new Float32Array(colors)));
  assert.equal(env.openerDocument.listeners.size, 0); assert.equal(env.openerWindow.listeners.size, 0);
});

test("Forest's opt-in 24fps and 1x DPR bound PiP work without changing shader time", t => {
  const env = browser(t, { props: { fps: 24, maxDpr: 1 } });
  for (let i = 0; i <= 120; i++) env.step(i * 1000 / 120);
  assert.ok(env.draws <= 25);
  assert.ok(Math.abs(env.uniforms.get("u_scene")[2] - .75) < .00001);
  assert.equal(env.canvas.width, 320); assert.equal(env.canvas.height, 240);
  assert.equal(env.contexts, 1);
});

test("Forest's owner document controls visibility, motion, pointer, resize and cleanup with the opener hidden", t => {
  const env = browser(t);
  env.pointer(320, 0); env.step(0); env.step(50);
  assert.ok(env.uniforms.get("u_cursor")[0] > 0);
  const time = env.uniforms.get("u_scene")[2];
  env.hide(true); assert.equal(env.rafs.size, 0);
  env.step(10000); assert.equal(env.uniforms.get("u_scene")[2], time);
  env.hide(false); env.step(10050);
  assert.ok(Math.abs(env.uniforms.get("u_scene")[2] - time - .05 * .75) < 1e-12);
  env.reduce(true); assert.equal(env.rafs.size, 0); assert.equal(env.uniforms.get("u_cursor")[0], 0);
  env.resize(400, 300); assert.deepEqual(env.uniforms.get("u_scene").slice(0, 2), [800, 600]);
  env.reduce(false); assert.equal(env.rafs.size, 1);
  env.close(); assertReleased(env); assert.equal(env.loses, 0);
});

test("Forest isPlaying suspends the existing scene and resumes without a time jump or reallocation", t => {
  const env = browser(t);
  env.step(0); env.step(50);
  const time = env.uniforms.get("u_scene")[2];
  env.update({ isPlaying: false }); assert.equal(env.rafs.size, 0);
  env.step(10000); assert.equal(env.uniforms.get("u_scene")[2], time);
  env.update({ isPlaying: true }); env.step(10050);
  assert.ok(Math.abs(env.uniforms.get("u_scene")[2] - time - .05 * .75) < 1e-12);
  assert.equal(env.contexts, 1);
  env.close(); assertReleased(env);
});

test("Forest renders a static reduced-motion frame and releases failed shader initialization", t => {
  const env = browser(t, { reduced: true });
  assert.equal(env.draws, 1); assert.equal(env.rafs.size, 0);
  env.close(); assertReleased(env);
  for (const options of [{ noWebGL: true }, { failCompile: 1 }, { failCompile: 2 }, { failLink: true }]) {
    const failed = browser(t, options);
    assert.equal(failed.draws, 0); assert.equal(failed.rafs.size, 0);
    failed.close(); assertReleased(failed);
  }
});

test("Forest supports StrictMode's setup/cleanup/setup on the same React-owned canvas", t => {
  const env = browser(t, { props: { fps: 24, maxDpr: 1 } });
  env.step(0);
  assert.equal(env.draws, 1);
  env.close(); assertReleased(env);
  env.remountSameCanvas(); env.step(50);
  assert.equal(env.draws, 2);
  assert.equal(env.contexts, 2);
  assert.equal(env.loses, 0);
  assert.equal(env.live.programs.size, 1);
  assert.equal(env.live.buffers.size, 1);
  env.close(); assertReleased(env);
});
