import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const require = createRequire(import.meta.url);
const React = require("react");
const { act, create } = require("react-test-renderer");
const { transformSync } = require("@babel/core");
const { authColors } = require("../lib/colorTokens.cjs");
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const COLORS = ["#38bdf8", "#ffffff", "#38bdf8", "#ffffff", "#38bdf8", "#ffffff"];
const plain = value => JSON.parse(JSON.stringify(value));

function eventTarget() {
  const listeners = new Map();
  return {
    listeners,
    addEventListener(type, fn) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type).add(fn);
    },
    removeEventListener(type, fn) { listeners.get(type)?.delete(fn); },
    dispatch(type, event = {}) { for (const fn of [...(listeners.get(type) || [])]) fn(event); },
    listenerCount() { return [...listeners.values()].reduce((n, set) => n + set.size, 0); },
  };
}

// Execute the real component, with a controlled browser and recording WebGL
// API. This catches scheduling and resource leaks without needing a GPU in CI.
function makeBrowser(options = {}) {
  const env = { canvases: [], rafs: new Map(), seq: 0, contexts: 0, draws: 0, loseCalls: 0,
    uniforms: new Map(), vertexSources: [], buffers: new Map(), deleted: { buffers: [], shaders: [], programs: [] },
    live: { buffers: new Set(), shaders: new Set(), programs: new Set() }, failDraw: false };
  const allocate = kind => {
    const value = { kind, id: ++env.seq };
    env.live[kind].add(value);
    return value;
  };
  const remove = (kind, value) => { env.deleted[kind].push(value); env.live[kind].delete(value); };
  const uniform = (location, value) => env.uniforms.set(location.name, plain(value));
  const gl = {
    FLOAT: 0x1406, ARRAY_BUFFER: 0x8892, ELEMENT_ARRAY_BUFFER: 0x8893, STATIC_DRAW: 0x88e4,
    UNSIGNED_SHORT: 0x1403, TRIANGLES: 4, VERTEX_SHADER: 0x8b31, FRAGMENT_SHADER: 0x8b30,
    COMPILE_STATUS: 0x8b81, LINK_STATUS: 0x8b82,
    createBuffer() { return options.failBuffer && env.live.buffers.size === 2 ? null : allocate("buffers"); },
    createShader(type) { return Object.assign(allocate("shaders"), { type }); },
    createProgram() { return allocate("programs"); },
    deleteBuffer: value => remove("buffers", value),
    deleteShader: value => remove("shaders", value),
    deleteProgram: value => remove("programs", value),
    shaderSource(shader, source) {
      shader.source = source;
      if (shader.type === gl.VERTEX_SHADER) env.vertexSources.push(source);
    },
    compileShader() {},
    getShaderParameter: () => !options.failCompile,
    getShaderInfoLog: () => "controlled compile failure",
    attachShader() {}, linkProgram() {},
    getProgramParameter: () => !options.failLink,
    getProgramInfoLog: () => "controlled link failure",
    useProgram() {},
    getUniformLocation: (_program, name) => ({ name }),
    uniform1f: uniform, uniform1i: uniform, uniform2fv: uniform, uniform3fv: uniform, uniform4fv: uniform,
    uniformMatrix4fv: (location, _transpose, value) => uniform(location, value),
    getAttribLocation: (_program, name) => ({ position: 0, uv: 1, uvNorm: 2 }[name] ?? -1),
    bindBuffer(target, buffer) { env.buffers.set(target, buffer); },
    bufferData(target, values) { env.buffers.get(target).values = Array.from(values); },
    enableVertexAttribArray() {}, vertexAttribPointer() {},
    viewport() {}, clearColor() {}, clearDepth() {},
    drawElements() { if (env.failDraw) throw new Error("controlled draw failure"); env.draws += 1; },
    getExtension: () => ({ loseContext: () => { env.loseCalls += 1; } }),
  };
  const container = { clientWidth: 400, clientHeight: 300, children: [],
    appendChild(canvas) { this.children.push(canvas); canvas.parentNode = this; },
    contains(canvas) { return this.children.includes(canvas); } };
  const reduced = { ...eventTarget(), matches: !!options.reduced };
  const fakeWindow = { ...eventTarget(), innerWidth: 400, innerHeight: 300, matchMedia: () => reduced };
  const fakeDocument = { ...eventTarget(), hidden: !!options.hidden,
    createElement(tag) {
      assert.equal(tag, "canvas");
      const canvas = { ...eventTarget(), style: {}, dataset: {},
        setAttribute() {},
        removeAttribute(name) { if (name === "data-ready") delete this.dataset.ready; },
        getContext(type, attributes) { env.contexts += 1; env.contextAttributes = attributes; return options.noWebGL ? null : gl; },
        remove() {
          if (this.parentNode) this.parentNode.children = this.parentNode.children.filter(c => c !== this);
          this.parentNode = null;
        } };
      env.canvases.push(canvas);
      return canvas;
    } };
  const globals = { window: fakeWindow, document: fakeDocument, console,
    requestAnimationFrame(fn) { const id = ++env.seq; env.rafs.set(id, fn); return id; },
    cancelAnimationFrame(id) { env.rafs.delete(id); } };
  const cache = new Map();
  const load = rel => {
    const filename = resolve(ROOT, rel);
    if (cache.has(filename)) return cache.get(filename).exports;
    const fixtureModule = { exports: {} };
    cache.set(filename, fixtureModule);
    const { code } = transformSync(readFileSync(filename, "utf8"), {
      filename, babelrc: false, configFile: false,
      presets: [[require.resolve("next/babel"), { "preset-react": { runtime: "automatic" } }]],
      plugins: [require.resolve("@babel/plugin-transform-modules-commonjs")],
    });
    const localRequire = id => {
      if (id.endsWith(".module.css")) return { environment: "environment", wave: "wave", pause: "pause", veil: "veil", pauseVeil: "pauseVeil" };
      if (id.endsWith("colorTokens.cjs")) return require(resolve(dirname(filename), id));
      if (id.startsWith(".")) return load(`${resolve(dirname(filename), id)}.js`);
      return require(id);
    };
    vm.runInNewContext(code, { ...globals, module: fixtureModule, exports: fixtureModule.exports, require: localRequire });
    return fixtureModule.exports;
  };
  env.mount = (t, { wrapper = false, props = {} } = {}) => {
    const Component = load(wrapper === "zenitho" ? "components/focus/ZenithoEnvironment.js" : wrapper ? "components/focus/GradientWaveEnvironment.js" : "components/ui/GradientWave.js").default;
    let renderer;
    act(() => { renderer = create(React.createElement(Component, props), { createNodeMock: () => container }); });
    t.after(() => act(() => renderer.unmount()));
    return { renderer, update: next => act(() => renderer.update(React.createElement(Component, next))),
      close: () => act(() => renderer.unmount()) };
  };
  env.step = now => {
    const callbacks = [...env.rafs.values()];
    env.rafs.clear();
    act(() => { callbacks.forEach(fn => fn(now)); });
  };
  env.hide = hidden => { fakeDocument.hidden = hidden; act(() => fakeDocument.dispatch("visibilitychange")); };
  env.reduce = matches => { reduced.matches = matches; act(() => reduced.dispatch("change")); };
  env.resize = () => act(() => fakeWindow.dispatch("resize"));
  return Object.assign(env, { container, fakeWindow, fakeDocument, reduced });
}

function assertReleased(env) {
  for (const resources of Object.values(env.live)) assert.equal(resources.size, 0);
  assert.equal(env.rafs.size, 0);
  assert.equal(env.fakeWindow.listenerCount(), 0);
  assert.equal(env.fakeDocument.listenerCount(), 0);
  assert.equal(env.reduced.listenerCount(), 0);
  for (const canvas of env.canvases) assert.equal(canvas.listenerCount(), 0);
  assert.equal(env.container.children.length, 0);
}

test("Zenitho preserves UVCanvas's four colors, original uniform parameters, layer gate and initial phase", t => {
  const env = makeBrowser();
  const page = env.mount(t, { wrapper: "zenitho" });
  const colors = ["#ef008f", "#6ec3f4", "#7038ff", "#ffba27"];
  const uploaded = [env.uniforms.get("u_baseColor"), ...Array.from({ length: 3 }, (_, i) => env.uniforms.get(`u_waveLayers[${i}].color`))];
  assert.deepEqual(uploaded, colors.map(hex => hex.slice(1).match(/../g).map(v => parseInt(v, 16) / 255)));
  assert.equal(env.uniforms.get("u_global.noiseSpeed"), 0.000005 * 0.55);
  assert.deepEqual(env.uniforms.get("u_global.noiseFreq"), [0.00014, 0.00029]);
  assert.equal(env.uniforms.get("u_time") * env.uniforms.get("u_global.noiseSpeed"), 1253106 * 0.000005);
  assert.deepEqual(env.uniforms.get("u_active_colors"), [1, 1, 1, 1]);
  assert.equal(env.uniforms.get("u_darken_top"), 0);
  assert.equal(env.uniforms.get("u_shadow_power"), 5);
  assert.equal(env.uniforms.get("u_vertDeform.noiseAmp"), 320);
  assert.equal(env.uniforms.get("u_vertDeform.noiseSeed"), 5);
  for (let i = 1; i < colors.length; i++) {
    assert.deepEqual(env.uniforms.get(`u_waveLayers[${i - 1}].noiseFreq`), [2 + i / 4, 3 + i / 4]);
    assert.equal(env.uniforms.get(`u_waveLayers[${i - 1}].noiseSeed`), 5 + 10 * i);
  }
  assert.match(env.vertexSources[0], /u_time \* u_global.noiseSpeed/);
  assert.equal(env.contexts, 1);
  assert.equal(env.canvases[0].width, 200);
  assert.equal(env.canvases[0].height, 150);
  page.close(); assertReleased(env);
});

test("Zenitho restores UVCanvas's XZ mesh, density and camera; other renderers retain their XY defaults", t => {
  for (const wrapper of [false, true, "zenitho"]) {
    const env = makeBrowser();
    const page = env.mount(t, { wrapper });
    const [positions, uv, uvNorm, indices] = [...env.live.buffers].map(buffer => buffer.values);
    const source = wrapper === "zenitho";
    assert.equal(env.contextAttributes.antialias, source, "only Zenitho restores source edge antialiasing");
    const x = Math.ceil(400 * (source ? .06 : .02)), y = Math.ceil(300 * (source ? .16 : .05));
    assert.equal(positions.length, 3 * (x + 1) * (y + 1));
    assert.equal(indices.length, 6 * x * y);
    assert.deepEqual(positions.slice(0, 3), source ? [-200, 0, 150] : [-200, 150, 0]);
    assert.deepEqual(positions.slice(-3), source ? [200, 0, -150] : [200, -150, 0]);
    for (let i = source ? 1 : 2; i < positions.length; i += 3) assert.equal(positions[i], 0);
    assert.deepEqual(uv.slice(0, 2), [0, 1]);
    assert.deepEqual(uvNorm.slice(0, 2), [-1, 1]);
    assert.equal(env.uniforms.get("projectionMatrix")[10], source ? -.0005 : -.001);
    page.close(); assertReleased(env);
  }
});

test("Zenitho bounds its denser mesh on large displays without Uint16 overflow", t => {
  const env = makeBrowser();
  env.container.clientWidth = 3840;
  env.container.clientHeight = 2160;
  const page = env.mount(t, { wrapper: "zenitho" });
  const [positions, , , indices] = [...env.live.buffers].map(buffer => buffer.values);
  assert.equal(positions.length / 3, 181 * 181);
  assert.ok(indices.every(index => index < positions.length / 3 && index < 65536));
  assert.equal(env.canvases[0].width, 1920);
  assert.equal(env.canvases[0].height, 1080);
  page.close(); assertReleased(env);
});

test("Zenitho advances shader phase at 55% real time, independently of its drawing cadence", t => {
  for (const cadence of [40, 50, 100]) {
    const env = makeBrowser();
    const page = env.mount(t, { wrapper: "zenitho" });
    const phase = () => env.uniforms.get("u_time") * env.uniforms.get("u_global.noiseSpeed");
    const initial = phase();
    env.step(0);
    for (let now = cadence; now <= 1000; now += cadence) env.step(now);
    assert.ok(Math.abs((phase() - initial) - 1000 * 0.000005 * 0.55) < 1e-8);
    page.close(); assertReleased(env);
  }
});

test("Zenitho has no running dark veil/filter; contrast ground belongs to paused state only", t => {
  const env = makeBrowser();
  const page = env.mount(t, { wrapper: "zenitho" });
  const pauseVeils = () => page.renderer.root.findAllByProps({ className: "pauseVeil" });
  assert.equal(pauseVeils().length, 0);
  assert.equal(env.uniforms.get("u_darken_top"), 0);
  const css = readFileSync(resolve(ROOT, "components/focus/ZenithoEnvironment.module.css"), "utf8");
  assert.doesNotMatch(css, /\.veil\s*\{|filter:|rgba\(25, 12, 41/);
  page.update({ paused: true });
  assert.equal(pauseVeils().length, 1);
  page.update({ paused: false });
  assert.equal(pauseVeils().length, 0);
  assert.equal(env.contexts, 1);
});

test("Zenitho suspends on pause/background/reduced motion and resumes without reallocating or catching up", t => {
  const env = makeBrowser();
  const page = env.mount(t, { wrapper: "zenitho" });
  env.step(100); env.step(150);
  const time = env.uniforms.get("u_time");
  page.update({ paused: true });
  assert.equal(env.rafs.size, 0);
  env.step(10000);
  assert.equal(env.uniforms.get("u_time"), time);
  page.update({ paused: false }); env.step(20000); env.step(20050);
  assert.equal(env.uniforms.get("u_time"), time + 50);
  env.hide(true); assert.equal(env.rafs.size, 0);
  env.hide(false); env.step(30000); env.step(30050);
  assert.equal(env.uniforms.get("u_time"), time + 100);
  env.reduce(true); assert.equal(env.rafs.size, 0);
  assert.equal(env.contexts, 1);
  page.close(); assertReleased(env);
});

test("Zenitho has a still reduced-motion frame, graceful WebGL fallback and complete cleanup", t => {
  for (const options of [{ reduced: true }, { noWebGL: true }, { failCompile: true }, { failLink: true }, { failBuffer: true }]) {
    const env = makeBrowser(options);
    const page = env.mount(t, { wrapper: "zenitho" });
    env.step(1000);
    assert.equal(env.rafs.size, 0);
    assert.equal(env.container.children.length, options.reduced ? 1 : 0);
    if (options.reduced) assert.equal(env.draws, 1);
    page.close(); assertReleased(env);
  }
});

test("Focus wrapper uses all six original blue/white entries and the source's real deformation defaults", t => {
  const env = makeBrowser();
  env.mount(t, { wrapper: true });
  assert.equal(env.container.children.length, 1, "the six-color shader initializes");
  const uploaded = [env.uniforms.get("u_baseColor"), ...Array.from({ length: 5 }, (_, i) => env.uniforms.get(`u_waveLayers[${i}].color`))];
  assert.deepEqual(uploaded, COLORS.map(hex => hex.slice(1).match(/../g).map(v => parseInt(v, 16) / 255)));
  assert.equal(env.uniforms.get("u_global.noiseSpeed"), 0.000004);
  assert.deepEqual(env.uniforms.get("u_global.noiseFreq"), [0.0001, 0.0009]);
  assert.equal(env.uniforms.get("u_vertDeform.incline"), 0);
  assert.equal(env.uniforms.get("u_vertDeform.noiseAmp"), 320);
  assert.equal(env.uniforms.get("u_vertDeform.noiseFlow"), 3);
  assert.doesNotMatch(env.vertexSources[0], /\bu_active_colors\b/);
  assert.equal(env.uniforms.has("u_active_colors"), false);
});

test("one-, two-, four- and eight-color palettes initialize without invalid empty arrays or lost layers", t => {
  for (const count of [1, 2, 4, 8]) {
    const env = makeBrowser();
    const colors = Array.from({ length: count }, (_, i) => i % 2 ? "#ffffff" : "#38bdf8");
    const page = env.mount(t, { props: { colors, fullColorLayers: true } });
    assert.equal(env.container.children.length, 1, `${count} colors initializes`);
    assert.equal(env.uniforms.get("u_baseColor").length, 3);
    for (let i = 0; i < count - 1; i++) assert.equal(env.uniforms.get(`u_waveLayers[${i}].color`).length, 3);
    assert.doesNotMatch(env.vertexSources[0], /\bu_active_colors\b|uniform\s+\w+\s+u_waveLayers\[0\]/);
    page.close();
    assertReleased(env);
  }
});

test("Auth defaults preserve the historical shader gate, palettes and seeded speed", t => {
  for (const colors of [authColors.light, authColors.dark]) {
    const env = makeBrowser();
    const page = env.mount(t, { props: { colors, noiseSpeed: 0.0000007, fps: 24, scale: 0.5, seed: 171000 } });
    assert.equal(env.container.children.length, 1);
    assert.equal(env.uniforms.get("u_time"), 171000);
    assert.equal(env.uniforms.get("u_global.noiseSpeed"), 0.0000007);
    assert.equal(env.uniforms.get("u_vertDeform.incline"), 0);
    assert.equal(env.canvases[0].width, 200);
    assert.equal(env.canvases[0].height, 150);
    assert.match(env.vertexSources[0], /uniform vec4 u_active_colors;/);
    assert.match(env.vertexSources[0], /for \(int i = 0; i < u_waveLayers_length; i\+\+\) \{\s+if \(u_active_colors\[i \+ 1\] == 1\.\) \{/);
    assert.doesNotMatch(env.vertexSources[0], /#define WAVE_LAYER_COUNT|#if WAVE_LAYER_COUNT/);
    assert.deepEqual(env.uniforms.get("u_active_colors"), [1, 1, 1, 1]);
    assert.deepEqual(env.uniforms.get("u_waveLayers[4].color"), colors[5].slice(1).match(/../g).map(v => parseInt(v, 16) / 255));
    page.close();
  }
});

test("pause/resume freezes the existing scene without allocating a second WebGL context", t => {
  const env = makeBrowser();
  const page = env.mount(t, { wrapper: true });
  env.step(100); env.step(150);
  const time = env.uniforms.get("u_time");
  const canvas = env.canvases[0];
  page.update({ paused: true });
  assert.equal(page.renderer.toJSON().props["data-paused"], "true");
  assert.equal(env.rafs.size, 0);
  env.step(5000);
  assert.equal(env.uniforms.get("u_time"), time);
  page.update({ paused: false });
  assert.equal(page.renderer.toJSON().props["data-paused"], undefined);
  assert.equal(env.contexts, 1);
  assert.equal(env.container.children[0], canvas);
  env.step(6000); env.step(6050);
  assert.equal(env.uniforms.get("u_time"), time + 50);
  page.close();
  assertReleased(env);
  assert.equal(env.deleted.buffers.length, 4);
  assert.equal(env.deleted.shaders.length, 2);
  assert.equal(env.deleted.programs.length, 1);
});

test("hidden tabs and reduced motion stop scheduling; a return resumes without a time jump", t => {
  const env = makeBrowser();
  env.mount(t);
  env.step(100); env.step(150);
  const time = env.uniforms.get("u_time");
  env.hide(true);
  assert.equal(env.rafs.size, 0);
  env.step(10000);
  assert.equal(env.uniforms.get("u_time"), time);
  env.hide(false);
  env.step(20000); env.step(20050);
  assert.equal(env.uniforms.get("u_time"), time + 50);
  env.reduce(true);
  assert.equal(env.rafs.size, 0);
  const draws = env.draws;
  env.step(30000);
  assert.equal(env.draws, draws);
  env.reduce(false);
  env.step(40000); env.step(40050);
  assert.equal(env.uniforms.get("u_time"), time + 100);
});

test("initial reduced motion has one still frame and keeps the paused red CSS field", t => {
  const env = makeBrowser({ reduced: true });
  const page = env.mount(t, { wrapper: true, props: { paused: true } });
  env.step(100);
  assert.equal(env.draws, 1);
  assert.equal(env.rafs.size, 0);
  assert.equal(page.renderer.toJSON().props["data-paused"], "true");
  const css = readFileSync(resolve(ROOT, "components/focus/GradientWaveEnvironment.module.css"), "utf8");
  assert.match(css, /\.environment\[data-paused="true"\] \.pause \{ opacity: 1; \}/);
  assert.match(css, /var\(--bt-pause-strong\)/);
  assert.doesNotMatch(css, /--bt-danger|@keyframes/);
});

test("context loss exposes CSS, stops drawing, and restoration rebuilds exactly one live scene", t => {
  const env = makeBrowser();
  const page = env.mount(t);
  env.step(100); env.step(150);
  const time = env.uniforms.get("u_time");
  const canvas = env.canvases[0];
  let prevented = false;
  act(() => canvas.dispatch("webglcontextlost", { preventDefault() { prevented = true; } }));
  assert.equal(prevented, true);
  assert.equal(canvas.style.visibility, "hidden");
  assert.equal(canvas.dataset.ready, undefined);
  assert.equal(env.rafs.size, 0);
  const draws = env.draws;
  env.resize(); env.step(9999);
  assert.equal(env.draws, draws);
  act(() => canvas.dispatch("webglcontextrestored"));
  assert.equal(env.contexts, 2);
  assert.equal(env.container.children.length, 1);
  assert.equal(env.container.children[0], canvas);
  assert.equal(canvas.style.visibility, "");
  assert.equal(env.uniforms.get("u_time"), time);
  assert.equal(env.live.buffers.size, 4);
  assert.equal(env.live.shaders.size, 2);
  assert.equal(env.live.programs.size, 1);
  env.step(10000);
  assert.equal(canvas.dataset.ready, "true");
  page.close();
  assertReleased(env);
  assert.equal(env.deleted.buffers.length, 8);
  assert.equal(env.deleted.shaders.length, 4);
  assert.equal(env.deleted.programs.length, 2);
});

test("WebGL absence or partial allocation failure leaves CSS and releases every owned resource", t => {
  for (const options of [{ noWebGL: true }, { failCompile: true }, { failLink: true }, { failBuffer: true }]) {
    const env = makeBrowser(options);
    const page = env.mount(t, { wrapper: true });
    assert.equal(env.container.children.length, 0);
    assert.equal(env.rafs.size, 0);
    for (const resources of Object.values(env.live)) assert.equal(resources.size, 0);
    page.close();
    assertReleased(env);
  }
});

test("palette changes replace one scene and release its allocations before the next scene", t => {
  const env = makeBrowser();
  const page = env.mount(t, { props: { colors: authColors.light } });
  const first = env.canvases[0];
  page.update({ colors: authColors.dark });
  assert.equal(env.container.children.length, 1);
  assert.notEqual(env.container.children[0], first);
  assert.equal(first.listenerCount(), 0);
  assert.equal(env.live.buffers.size, 4);
  assert.equal(env.live.shaders.size, 2);
  assert.equal(env.live.programs.size, 1);
  assert.equal(env.deleted.buffers.length, 4);
  assert.equal(env.deleted.shaders.length, 2);
  assert.equal(env.deleted.programs.length, 1);
  assert.equal(env.rafs.size, 2, "only the next scene's readiness and animation remain");
  page.close();
  assertReleased(env);
});

test("a runtime drawing failure restores CSS and stops further work", t => {
  const env = makeBrowser();
  const page = env.mount(t);
  env.step(100);
  env.failDraw = true;
  env.step(150);
  assert.equal(env.container.children.length, 0);
  assert.equal(env.rafs.size, 0);
  for (const resources of Object.values(env.live)) assert.equal(resources.size, 0);
  page.close();
  assertReleased(env);
});

test("unmount before the first animation frame cancels readiness and all lifecycle listeners", t => {
  const env = makeBrowser();
  const page = env.mount(t);
  const canvas = env.canvases[0];
  page.close();
  assertReleased(env);
  env.step(1000);
  canvas.dispatch("webglcontextrestored");
  assert.equal(env.contexts, 1);
  assert.equal(env.draws, 1);
  assert.equal(canvas.dataset.ready, undefined);
  assert.equal(env.loseCalls, 1);
});
