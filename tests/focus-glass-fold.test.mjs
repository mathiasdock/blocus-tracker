import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import vm from "node:vm";

const require = createRequire(import.meta.url);
const React = require("react");
const { act, create } = require("react-test-renderer");
const { transformSync } = require("@babel/core");
const source = readFileSync(new URL("../components/ui/GlassFold.js", import.meta.url), "utf8");

function target() {
  const listeners = new Map();
  return { listeners, addEventListener: (key, fn) => listeners.set(key, fn), removeEventListener: key => listeners.delete(key), dispatch: (key, event = {}) => listeners.get(key)?.(event) };
}
function browser(t, options = {}) {
  const live = { buffers: new Set(), programs: new Set(), shaders: new Set() };
  const uniforms = new Map(), rafs = new Map();
  let draws = 0, contexts = 0, loses = 0, seq = 0, observed = 0;
  const observers = new Set();
  const alloc = kind => { const object = {}; live[kind].add(object); return object; };
  const uniform = (location, value) => uniforms.set(location, JSON.parse(JSON.stringify(value)));
  const gl = {
    VERTEX_SHADER: 1, FRAGMENT_SHADER: 2, COMPILE_STATUS: 3, LINK_STATUS: 4, ARRAY_BUFFER: 5, STATIC_DRAW: 6, FLOAT: 7, TRIANGLES: 8,
    createShader: () => alloc("shaders"), createProgram: () => alloc("programs"), createBuffer: () => options.bufferFail ? null : alloc("buffers"),
    shaderSource: (shader, text) => shader.source = text, compileShader() {}, getShaderParameter: () => !options.compileFail,
    attachShader() {}, linkProgram() {}, getProgramParameter: () => !options.linkFail, useProgram() {},
    deleteShader: shader => live.shaders.delete(shader), deleteProgram: p => live.programs.delete(p), deleteBuffer: b => live.buffers.delete(b),
    bindBuffer() {}, bufferData: (_target, data) => gl.vertices = Array.from(data),
    getAttribLocation: () => 0, enableVertexAttribArray() {}, vertexAttribPointer() {}, viewport: (...args) => gl.viewportValue = args,
    getUniformLocation: (_p, name) => name, uniform1f: uniform, uniform3fv: uniform, uniform2f: (location, x, y) => uniform(location, [x, y]),
    drawArrays: (_mode, _start, count) => { assert.equal(count, 6); if (options.drawFail) throw Error("draw failure"); draws++; },
    getExtension: name => name === "WEBGL_lose_context" ? { loseContext: () => loses++ } : null,
  };
  const canvas = { ...target(), style: {}, width: 300, height: 150, attributes: {},
    setAttribute: (k, v) => canvas.attributes[k] = v, removeAttribute: k => delete canvas.attributes[k],
    getContext: (_type, settings) => { contexts++; canvas.contextSettings = settings; return options.noWebGL ? null : gl; },
    remove: () => container.children.splice(container.children.indexOf(canvas), 1),
  };
  const container = { clientWidth: 390, clientHeight: 844, children: [], appendChild: c => container.children.push(c) };
  const reduced = { ...target(), matches: !!options.reduced };
  const document = { ...target(), hidden: false, createElement: () => canvas };
  const window = { ...target(), devicePixelRatio: 3, matchMedia: () => reduced,
    requestAnimationFrame: fn => { const id = ++seq; rafs.set(id, fn); return id; }, cancelAnimationFrame: id => rafs.delete(id),
    ResizeObserver: class {
      constructor(callback) { this.callback = callback; }
      observe(element) { assert.equal(element, container); observed++; observers.add(this); }
      disconnect() { observed--; observers.delete(this); }
    },
  };
  document.defaultView = window;
  container.ownerDocument = document;
  canvas.ownerDocument = document;
  const openerDocument = { ...target(), hidden: true, createElement() { throw Error("opener canvas created"); } };
  const openerWindow = { ...target(), matchMedia() { throw Error("opener media query used"); } };
  const module = { exports: {} };
  const { code } = transformSync(source, { filename: "GlassFold.js", babelrc: false, configFile: false, presets: [[require.resolve("next/babel"), { "preset-react": { runtime: "automatic" } }]], plugins: [require.resolve("@babel/plugin-transform-modules-commonjs")] });
  vm.runInNewContext(code, { require, module, exports: module.exports, process: { env: { NODE_ENV: "test" } },
    document: options.separateOwner ? openerDocument : document, window: options.separateOwner ? openerWindow : window, console,
    requestAnimationFrame() { throw Error("global RAF used"); }, cancelAnimationFrame() { throw Error("global RAF cancellation used"); },
    ResizeObserver: class { constructor() { throw Error("global ResizeObserver used"); } },
  });
  let renderer;
  act(() => { renderer = create(React.createElement(module.exports.default, options.props), { createNodeMock: () => container }); });
  const close = () => act(() => renderer.unmount());
  t.after(close);
  return { gl, canvas, container, uniforms, live, rafs, document, window, reduced, openerWindow, openerDocument, close,
    get draws() { return draws; }, get contexts() { return contexts; }, get loses() { return loses; }, get observed() { return observed; },
    update: props => act(() => renderer.update(React.createElement(module.exports.default, props))),
    step: now => act(() => { const fns = [...rafs.values()]; rafs.clear(); fns.forEach(fn => fn(now)); }),
    hide: value => act(() => { document.hidden = value; document.dispatch("visibilitychange"); }),
    reduce: value => act(() => { reduced.matches = value; reduced.dispatch("change"); }),
    resize: (width, height) => act(() => { container.clientWidth = width; container.clientHeight = height; window.dispatch("resize"); }),
    observeResize: (width, height) => act(() => { container.clientWidth = width; container.clientHeight = height; [...observers].forEach(observer => observer.callback()); }),
  };
}

test("Glass Fold GLSL is byte-identical to the supplied original shader", () => {
  for (const [name, digest] of [["VERTEX", "f5672aa2553a6685149c92dfe400fff73d72a1b2415d651c78d38f96bb713774"], ["FRAGMENT", "d73f13c0035897c7a1a283f5e5f20ebb698d83d991e219e762923ed794858767"]]) {
    const shader = source.split(`const ${name} = \``)[1].split("`")[0];
    assert.equal(createHash("sha256").update(shader).digest("hex"), digest);
  }
});

test("PiP Glass Fold follows its owner window's frames, motion, resize and visibility while the opener is hidden", t => {
  const env = browser(t, { separateOwner: true, props: { fps: 24 } });
  env.step(0); env.step(50);
  const time = env.uniforms.get("u_time");
  assert.ok(time > 0);
  assert.equal(env.canvas.ownerDocument, env.document);
  assert.equal(env.observed, 1);
  assert.equal(env.openerDocument.listeners.size, 0);
  assert.equal(env.openerWindow.listeners.size, 0);
  env.observeResize(320, 240);
  assert.deepEqual(env.uniforms.get("u_resolution"), [320, 240]);
  env.hide(true); assert.equal(env.rafs.size, 0);
  env.step(10000); assert.equal(env.uniforms.get("u_time"), time);
  env.hide(false); env.step(20000); env.step(20050);
  assert.ok(Math.abs(env.uniforms.get("u_time") - time - .025) < 1e-9);
  env.reduce(true); assert.equal(env.rafs.size, 0);
  env.reduce(false); assert.equal(env.rafs.size, 1);
  env.close();
  assert.equal(env.rafs.size, 0); assert.equal(env.observed, 0);
  for (const item of [env.document, env.window, env.reduced, env.canvas]) assert.equal(item.listeners.size, 0);
  for (const resources of Object.values(env.live)) assert.equal(resources.size, 0);
});

test("the optional 24fps cap changes only draw cadence and retains source shader speed", t => {
  const env = browser(t, { props: { fps: 24 } });
  const initial = env.draws;
  for (let i = 0; i <= 120; i++) env.step(i * 1000 / 120);
  assert.ok(Math.abs(env.uniforms.get("u_time") - .5) < .00001);
  assert.ok(env.draws - initial <= 25);
  const contexts = env.contexts;
  env.update({ fps: 30 });
  assert.equal(env.contexts, contexts);
});

test("original palette/speed/scale/noise upload to one six-vertex program; time is independent of 30fps draws", t => {
  const env = browser(t);
  for (const [name, hex] of [["color1", "#1e3cc8"], ["color2", "#06081e"], ["color3", "#96d7ff"]]) assert.deepEqual(env.uniforms.get(`u_${name}`), hex.slice(1).match(/../g).map(v => parseInt(v, 16) / 255));
  assert.equal(env.uniforms.get("u_scale"), 1); assert.equal(env.uniforms.get("u_noise"), .12);
  assert.equal(env.gl.vertices.length, 12); assert.equal(env.live.programs.size, 1);
  for (let i = 0; i <= 60; i++) env.step(i * 1000 / 60);
  assert.ok(Math.abs(env.uniforms.get("u_time") - .5) < .00001);
  assert.ok(env.draws <= 33); assert.equal(env.contexts, 1);
  assert.deepEqual(env.uniforms.get("u_resolution"), [390, 844]);
  assert.equal(env.canvas.contextSettings.powerPreference, "low-power");
});

test("rerenders update uniforms without creating/resetting the WebGL program or shader time", t => {
  const env = browser(t); env.step(0); env.step(100);
  const time = env.uniforms.get("u_time");
  env.update({ noise: .2 });
  assert.equal(env.uniforms.get("u_noise"), .2); assert.equal(env.uniforms.get("u_time"), time); assert.equal(env.contexts, 1);
});

test("pause, hidden tab, resume and reduced motion never count inactive time or keep an animation loop", t => {
  const env = browser(t); env.step(0); env.step(100);
  const time = env.uniforms.get("u_time");
  env.update({ isPlaying: false }); assert.equal(env.rafs.size, 0);
  env.step(5000); assert.equal(env.uniforms.get("u_time"), time);
  env.update({ isPlaying: true }); env.step(10000); assert.equal(env.uniforms.get("u_time"), time);
  env.hide(true); const draws = env.draws; assert.equal(env.rafs.size, 0); env.resize(400, 800); assert.equal(env.draws, draws);
  env.hide(false); env.step(20000); assert.equal(env.uniforms.get("u_time"), time);
  env.reduce(true); assert.equal(env.rafs.size, 0); env.resize(320, 740); assert.deepEqual(env.uniforms.get("u_resolution"), [320, 740]);
  env.reduce(false); assert.equal(env.rafs.size, 1);
});

test("retina and 4K resizing keep aspect and bound pixel work without changing source scale", t => {
  const env = browser(t); env.resize(3840, 2160);
  assert.ok(env.canvas.width * env.canvas.height <= 1048576);
  assert.ok(Math.abs(env.canvas.width / env.canvas.height - 3840 / 2160) < .003);
  assert.equal(env.uniforms.get("u_scale"), 1); assert.equal(env.contexts, 1);
  env.resize(320, 740); assert.equal(env.canvas.width, 320); assert.equal(env.canvas.height, 740);
});

test("reduced motion and zero speed render a still frame with no RAF", t => {
  for (const options of [{ reduced: true }, { props: { speed: 0 } }]) {
    const env = browser(t, options); assert.ok(env.draws > 0); assert.equal(env.rafs.size, 0); assert.equal(env.uniforms.get("u_time"), 0);
  }
});

test("unsupported WebGL, compile/link/buffer/draw failures leave the static background and release partial resources", t => {
  for (const options of [{ noWebGL: true }, { compileFail: true }, { linkFail: true }, { bufferFail: true }, { drawFail: true }]) {
    const env = browser(t, options); assert.equal(env.canvas.attributes["data-ready"], undefined); assert.equal(env.rafs.size, 0);
    for (const set of Object.values(env.live)) assert.equal(set.size, 0);
  }
});

test("context loss suspends and restoration rebuilds only one scene at the same phase; disposal releases everything", t => {
  const env = browser(t); env.step(0); env.step(100); const time = env.uniforms.get("u_time");
  let prevented = false;
  act(() => env.canvas.dispatch("webglcontextlost", { preventDefault: () => prevented = true }));
  assert.equal(prevented, true); assert.equal(env.rafs.size, 0); assert.equal(env.canvas.attributes["data-ready"], undefined);
  act(() => env.canvas.dispatch("webglcontextrestored"));
  assert.equal(env.contexts, 2); assert.equal(env.live.programs.size, 1); assert.equal(env.uniforms.get("u_time"), time);
  env.close();
  for (const set of Object.values(env.live)) assert.equal(set.size, 0);
  for (const target of [env.document, env.window, env.reduced, env.canvas]) assert.equal(target.listeners.size, 0);
  assert.equal(env.observed, 0); assert.equal(env.rafs.size, 0); assert.equal(env.container.children.length, 0); assert.equal(env.loses, 1);
});
