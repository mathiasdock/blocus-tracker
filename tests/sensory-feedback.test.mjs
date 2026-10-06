import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

function setup({ htmlOnly = false, resume, fetchFails = false, htmlRejects = false } = {}) {
  let now = 10000;
  const sources = [], tones = [], html = [], fetched = [], timers = new Map(), storage = new Map(), listeners = [];
  let context;
  let nextTimer = 0;
  const setTimeout = (fn, delay) => { timers.set(++nextTimer, { fn, at: now + delay }); return nextTimer; };
  class Context {
    state = resume ? "suspended" : "running";
    currentTime = 0; destination = {};
    constructor() { context = this; }
    resume() { return resume ? resume(this) : Promise.resolve(); }
    decodeAudioData(bytes, cb) { const b = { duration: 0.88, src: new TextDecoder().decode(bytes) }; cb(b); return Promise.resolve(b); }
    createBufferSource() {
      const s = { playbackRate: {}, connect(gain) { s.output = gain; }, disconnect() {}, start() { sources.push(s); } };
      return s;
    }
    createGain() { return { gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {}, disconnect() {} }; }
    createOscillator() {
      const t = { frequency: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {}, disconnect() {}, start() { tones.push(t); }, stop() {} };
      return t;
    }
  }
  class Audio {
    constructor(src) { this.src = src; html.push(this); }
    play() { return htmlRejects ? Promise.reject(new Error("blocked")) : Promise.resolve(); }
  }
  const scope = {
    module: { exports: {} },
    Audio,
    window: { ...(htmlOnly ? {} : { AudioContext: Context }), Audio,
      addEventListener: (type, fn, options) => listeners.push({ type, options }), removeEventListener() {},
      matchMedia: () => ({ matches: false }) },
    localStorage: { getItem: k => storage.get(k) || null, setItem: (k, v) => storage.set(k, v) },
    Date: { now: () => now }, setTimeout, clearTimeout: id => timers.delete(id),
    fetch: async src => {
      fetched.push(src);
      if (fetchFails) throw new Error("offline");
      return { ok: true, arrayBuffer: async () => new TextEncoder().encode(src).buffer };
    },
  };
  const source = readFileSync(new URL("../lib/sensoryFeedback.js", import.meta.url), "utf8").replace(/export /g, "");
  vm.runInNewContext(`${source}\nmodule.exports = { playSensoryCue, preloadSensoryFeedback, initSensoryFeedback, writeSensoryPreferences };`, scope);
  return { ...scope.module.exports, sources, tones, html, fetched, storage, listeners, context: () => context,
    advance(ms) { now += ms; for (const [id, t] of timers) if (t.at <= now) { timers.delete(id); t.fn(); } } };
}

test("preloads only the five existing assets; removed ordinary cues cannot play", async () => {
  const s = setup(); await s.preloadSensoryFeedback();
  assert.equal(new Set(s.fetched).size, 5);
  for (const cue of ["confirm", "share", "task"]) assert.equal(s.playSensoryCue(cue), false);
});

test("different cues sharing an MP3 cannot overlap; completion releases the lock", async () => {
  const s = setup(); await s.preloadSensoryFeedback();
  assert.equal(s.playSensoryCue("complete"), true);
  assert.equal(s.playSensoryCue("goal"), false);
  assert.equal(s.playSensoryCue("pomodoro"), false);
  assert.equal(s.sources.length, 1);
  s.sources[0].onended();
  assert.equal(s.playSensoryCue("goal"), true);
});

test("timer start/resume remain audible and pause shares the start-file lock", async () => {
  const s = setup(); await s.preloadSensoryFeedback();
  assert.equal(s.playSensoryCue("start"), true);
  assert.equal(s.playSensoryCue("pause"), false);
  assert.equal(s.playSensoryCue("resume"), true);
  assert.equal(s.sources.length, 2);
});

test("break end uses the existing resume asset at a lower volume", async () => {
  const s = setup(); await s.preloadSensoryFeedback();
  assert.equal(s.playSensoryCue("breakEnd"), true);
  assert.equal(s.sources[0].buffer.src, "/sounds/bt-resume.mp3");
  assert.equal(s.sources[0].output.gain.value, 0.14);
  assert.equal(s.playSensoryCue("resume"), false);
});

test("notifications cannot stack, then stay quiet through a five-second burst", async () => {
  const s = setup(); await s.preloadSensoryFeedback();
  s.playSensoryCue("notification");
  s.advance(1800); s.sources[0].onended();
  assert.equal(s.playSensoryCue("notification"), false);
  s.advance(3200);
  assert.equal(s.playSensoryCue("notification"), true);
});

test("mute retains its local key, blocks every effect, and preserves haptics", async () => {
  const s = setup(); await s.preloadSensoryFeedback();
  s.writeSensoryPreferences({ sound: false });
  assert.deepEqual(JSON.parse(s.storage.get("bt_sensory_v1")), { sound: false, haptics: true });
  for (const cue of ["start", "resume", "goal", "complete", "xp", "notification", "breakEnd"]) {
    assert.equal(s.playSensoryCue(cue), false);
  }
});

test("pending browser resume reserves the MP3 before playback", async () => {
  let unlock;
  const s = setup({ resume: ctx => new Promise(resolve => { unlock = () => { ctx.state = "running"; resolve(); }; }) });
  await s.preloadSensoryFeedback();
  s.playSensoryCue("complete");
  assert.equal(s.playSensoryCue("goal"), false);
  unlock(); await Promise.resolve();
  assert.equal(s.sources.length, 1);
});

test("mute while resume is pending prevents delayed sound", async () => {
  let unlock;
  const s = setup({ resume: () => new Promise(resolve => { unlock = resolve; }) });
  await s.preloadSensoryFeedback(); s.playSensoryCue("complete");
  s.writeSensoryPreferences({ sound: false }); unlock(); await Promise.resolve();
  assert.equal(s.sources.length, 0);
});

test("an old pending alert is dropped instead of replayed after suspension", async () => {
  let unlock;
  const s = setup({ resume: () => new Promise(resolve => { unlock = resolve; }) });
  await s.preloadSensoryFeedback(); s.playSensoryCue("notification");
  s.advance(2100); unlock(); await Promise.resolve();
  assert.equal(s.sources.length, 0);
});

test("HTML Audio fallback also locks by file and releases on end/error", () => {
  const s = setup({ htmlOnly: true });
  s.playSensoryCue("complete");
  assert.equal(s.playSensoryCue("goal"), false);
  s.html[0].onended(); assert.equal(s.playSensoryCue("goal"), true);
  s.html[1].onerror(); assert.equal(s.playSensoryCue("pomodoro"), true);
});

test("blocked HTML playback releases the file for a later gesture", async () => {
  const s = setup({ htmlOnly: true, htmlRejects: true });
  s.playSensoryCue("complete"); await Promise.resolve();
  assert.equal(s.playSensoryCue("goal"), true);
});

test("offline synthesis uses the same lock and releases after its envelope", async () => {
  const s = setup({ fetchFails: true }); await s.preloadSensoryFeedback();
  s.playSensoryCue("complete"); assert.equal(s.tones.length, 3);
  assert.equal(s.playSensoryCue("goal"), false);
  s.advance(360); assert.equal(s.playSensoryCue("goal"), true);
});

test("gesture unlock stays registered for pointer and keyboard", () => {
  const s = setup(); const cleanup = s.initSensoryFeedback();
  assert.deepEqual(s.listeners.map(l => l.type), ["pointerdown", "keydown"]);
  assert.ok(s.listeners.every(l => l.options.capture && l.options.once));
  cleanup();
});
