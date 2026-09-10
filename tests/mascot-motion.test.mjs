import test from "node:test";
import assert from "node:assert/strict";
import { createMascotDirector, resolveMascotMood, poseForMood, gestureScore } from "../lib/mascotMotion.mjs";

// Fake the browser clock/WAAPI, not the director. This tests scheduling and
// cleanup without a real wait or animation library.
function browser({ reducedMotion = false, random = () => .5 } = {}) {
  let now = 0;
  let seq = 0;
  let onIntersection;
  const timers = new Map();
  const animations = new Set();
  const history = [];
  const media = new EventTarget();
  media.matches = reducedMotion;
  const doc = new EventTarget();
  doc.hidden = false;
  const win = {
    performance: { now: () => now },
    setTimeout(fn, ms) { const id = ++seq; timers.set(id, { fn, time: now + ms }); return id; },
    clearTimeout(id) { timers.delete(id); },
    matchMedia: () => media,
    getComputedStyle: () => ({ transform: "matrix(1, 0, 0, 1, 0, -2)" }),
    IntersectionObserver: class {
      constructor(callback) { onIntersection = callback; }
      observe() {}
      disconnect() { onIntersection = null; }
    },
  };
  doc.defaultView = win;
  const nodes = new Map();
  function node(part) {
    if (nodes.has(part)) return nodes.get(part);
    const el = { isConnected: true, animate(frames, options) {
      let resolve, reject, endTimer, remaining = options.duration + (options.delay || 0), started = now;
      const animation = {
        effect: { target: el }, part, frames, options, playState: "running",
        finished: new Promise((yes, no) => { resolve = yes; reject = no; }),
        cancel() { win.clearTimeout(endTimer); animations.delete(animation); animation.playState = "idle"; reject(new Error("cancelled")); },
        pause() { remaining -= now - started; win.clearTimeout(endTimer); animation.playState = "paused"; },
        play() {
          started = now;
          animation.playState = "running";
          endTimer = win.setTimeout(() => { animations.delete(animation); animation.playState = "finished"; resolve(); }, remaining);
        },
      };
      history.push(animation);
      animations.add(animation);
      animation.play();
      return animation;
    } };
    nodes.set(part, el);
    return el;
  }
  const root = { ownerDocument: doc, dataset: {}, querySelector: selector => node(selector.match(/"([^"]+)"/)[1]) };
  const director = createMascotDirector(root, { random });
  const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
  return {
    root, director, timers, animations, history,
    update: (mood, reactionKey = "event-1", animated = true) => director.update({ mood, reactionKey, animated }),
    visible(value) { onIntersection?.([{ isIntersecting: value, intersectionRatio: value ? 1 : 0 }]); },
    hidden(value) { doc.hidden = value; doc.dispatchEvent(new Event("visibilitychange")); },
    reduced(value) { media.matches = value; media.dispatchEvent(new Event("change")); },
    async advance(ms) {
      const until = now + ms;
      await flush();
      for (let guard = 0; guard < 10000; guard++) {
        const next = [...timers.entries()].sort((a, b) => a[1].time - b[1].time)[0];
        if (!next || next[1].time > until) { now = until; await flush(); return; }
        now = next[1].time;
        timers.delete(next[0]);
        next[1].fn();
        await flush();
      }
      assert.fail("timer loop did not yield");
    },
  };
}

test("streak compatibility: high streak is happy at rest, explicit celebration still wins", () => {
  assert.equal(resolveMascotMood(undefined, 100), "happy");
  assert.equal(poseForMood(undefined, 100), "fired");
  assert.equal(resolveMascotMood("celebrate", 0), "celebrating");
  assert.equal(poseForMood("proud", 0), "happy");
  assert.equal(poseForMood("unknown", 0), "asleep");
});

test("one celebration per event, never a periodic jump; rerenders do not restart it", async () => {
  const b = browser();
  b.update("celebrating"); b.visible(true);
  await b.advance(1000);
  assert.equal(b.root.dataset.gesture, "celebrate");
  b.update("celebrating");
  await b.advance(60000);
  assert.equal(b.history.filter(a => a.part === "action").length, 1);
  b.update("celebrating", "event-2");
  await b.advance(2000);
  assert.equal(b.history.filter(a => a.part === "action").length, 2);
  b.director.dispose();
});

test("reduced motion and animated=false run no timers or WAAPI, and do not replay stale events", async () => {
  const b = browser({ reducedMotion: true });
  b.update("celebrating"); b.visible(true);
  await b.advance(30000);
  assert.equal(b.animations.size, 0);
  assert.equal(b.timers.size, 0);
  b.reduced(false); await b.advance(8000);
  assert.equal(b.history.filter(a => a.part === "action").length, 0);
  b.update("happy", "event-2", false);
  await b.advance(10000);
  assert.equal(b.animations.size, 0);
  assert.equal(b.timers.size, 0);
  b.director.dispose();
});

test("offscreen/hidden stop all work; becoming visible does not repeat a consumed celebration", async () => {
  const b = browser();
  b.update("celebrating");
  assert.equal(b.timers.size, 0);
  b.visible(true); await b.advance(800);
  b.hidden(true); await b.advance(10000);
  assert.equal(b.animations.size, 0);
  assert.equal(b.timers.size, 0);
  b.hidden(false); await b.advance(4000);
  assert.equal(b.history.filter(a => a.part === "action").length, 1);
  b.visible(false); await b.advance(10000);
  assert.equal(b.timers.size, 0);
  b.director.dispose();
});

test("rapid mood changes settle, use the latest reaction, and cleanup survives unmount", async () => {
  const b = browser();
  b.update("celebrating"); b.visible(true); await b.advance(800);
  b.update("worried"); await b.advance(40);
  b.update("focused"); await b.advance(40);
  b.update("proud"); await b.advance(1000);
  assert.equal(b.root.dataset.gesture, "proud");
  b.director.dispose(); await b.advance(60000);
  assert.equal(b.timers.size, 0);
  assert.equal(b.animations.size, 0);
});

test("sleep stays asleep without blinks, while breath timing varies", async () => {
  let n = 0;
  const b = browser({ random: () => (++n % 9) / 10 });
  b.update("sleepy"); b.visible(true); await b.advance(60000);
  assert.equal(b.history.filter(a => a.part === "eyes").length, 0);
  const durations = b.history.filter(a => a.part === "breath").map(a => a.options.duration);
  assert.ok(new Set(durations).size > 1);
  b.director.dispose();
});

test("new artwork uses actual shoulder, elbow and leg tracks, not just whole-body motion", () => {
  const wave = gestureScore("wave").map(score => score.part);
  assert.ok(wave.includes("arm-right") && wave.includes("forearm-right"));
  const jump = gestureScore("celebrate");
  for (const part of ["arm-left", "arm-right", "forearm-left", "forearm-right", "leg-left", "leg-right", "sparkles"]) {
    assert.ok(jump.some(score => score.part === part), part);
  }
  const body = jump.find(score => score.part === "action");
  const arm = jump.find(score => score.part === "arm-left");
  assert.match(body.frames.find(frame => frame.offset === .30).transform, /-23px/);
  assert.equal(arm.frames.find(frame => frame.offset === .30).transform, "rotate(85deg)");
  assert.equal(jump.find(score => score.part === "sparkles").frames.at(-1).opacity, 0);
});

test("neutral greeting and sleepy stretch are visible entry reactions but never repeat on rerender", async () => {
  const b = browser();
  b.update("neutral", undefined); b.visible(true); await b.advance(800);
  assert.equal(b.root.dataset.gesture, "wave");
  b.update("neutral", undefined); await b.advance(2400);
  assert.equal(b.history.filter(a => a.part === "forearm-right").length, 1);
  b.update("sleepy"); await b.advance(1000);
  assert.equal(b.root.dataset.gesture, "yawn");
  b.reduced(true); await b.advance(10000);
  assert.equal(b.root.dataset.gesture, "rest");
  assert.equal(b.animations.size, 0);
  assert.equal(b.timers.size, 0);
  b.director.dispose();
});
