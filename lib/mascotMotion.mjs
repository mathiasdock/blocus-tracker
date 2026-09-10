// A small character director, not a render loop. The browser interpolates
// transforms; one timer chooses the next blink/gesture, with real pauses.
export const MASCOT_MOODS = [
  "neutral", "focused", "happy", "proud", "celebrating", "sleepy", "worried", "surprised",
];

export function mascotState(streak) {
  const s = Number(streak) || 0;
  return s <= 0 ? "asleep" : s < 7 ? "content" : s < 30 ? "happy" : "fired";
}

export function resolveMascotMood(mood, streak) {
  if (mood === "celebrate") return "celebrating";
  if (MASCOT_MOODS.includes(mood)) return mood;
  const state = mascotState(streak);
  // A long streak is a happy resting character, not an endless celebration.
  return state === "asleep" ? "sleepy" : state === "content" ? "neutral" : "happy";
}

export function poseForMood(mood, streak) {
  if (!MASCOT_MOODS.includes(mood) && mood !== "celebrate") return mascotState(streak);
  return { neutral: "content", focused: "content", worried: "content", sleepy: "asleep",
    happy: "happy", proud: "happy", surprised: "happy", celebrating: "fired" }[resolveMascotMood(mood, streak)];
}

const REST = "translate(0px, 0px) rotate(0deg) scale(1, 1)";
// Reuse the app's bt-rise settling curve. Gentle in-place motion uses the
// existing ease-in-out; a character breath is slower than a UI transition.
const SETTLE = "cubic-bezier(0.16, 1, 0.3, 1)";
const PROFILES = {
  neutral:     { gap: [4500, 8000], gestures: ["look", "ear", "tilt", "shift"] },
  focused:     { gap: [7000, 11000], gestures: ["read", "ear"] },
  happy:       { gap: [3800, 6500], gestures: ["wag", "look", "tilt", "step"] },
  proud:       { gap: [5500, 9000], gestures: ["nod", "wag"] },
  celebrating: { gap: [5000, 8500], gestures: ["wag", "tilt"] },
  sleepy:      { gap: [7000, 12000], gestures: ["doze", "dream"] },
  worried:     { gap: [6500, 10000], gestures: ["check", "ear"] },
  surprised:   { gap: [5500, 9000], gestures: ["look", "ear"] },
};

const track = (part, transforms, duration, delay = 0) => ({
  part, frames: transforms.map(transform => ({ transform })), duration, delay,
});

/** Each score ends at rest. Related parts follow the same gesture, never
 * independent loops. px here are SVG viewBox units, so motion scales with size. */
export function gestureScore(name, direction = 1, variation = 1) {
  const d = direction * variation;
  switch (name) {
    case "blink":
      return [track("eyes", ["scaleY(1)", "scaleY(.08)", "scaleY(1)"], 170)];
    case "doubleBlink":
      return [{ part: "eyes", duration: 360, frames: [
        { transform: "scaleY(1)", offset: 0 }, { transform: "scaleY(.08)", offset: .18 },
        { transform: "scaleY(1)", offset: .36 }, { transform: "scaleY(1)", offset: .56 },
        { transform: "scaleY(.08)", offset: .72 }, { transform: "scaleY(1)", offset: 1 },
      ] }];
    case "look":
    case "check":
    case "read": {
      const focused = name === "read";
      const x = focused ? 2 * d : 2.5 * d;
      const y = focused ? 2.5 : name === "check" ? 1.5 : -.5;
      return [
        track("gaze", [REST, `translate(${x}px, ${y}px)`, `translate(${-x}px, ${y}px)`, REST], 1800),
        track("head", [REST, `translateY(${focused ? 3 : 0}px) rotate(${5 * d}deg)`, `rotate(${-3 * d}deg)`, REST], 2100, 80),
        ...(focused ? [track("prop", [REST, "rotate(-2deg) translateY(-1px)", REST], 2100)] : []),
        ...(name === "check" ? [track("forearm-left", [REST, "rotate(-12deg)", REST], 1200, 200)] : []),
      ];
    }
    case "wave":
      return [
        track("arm-right", [REST, "rotate(-94deg)", "rotate(-80deg)", "rotate(-104deg)", "rotate(-82deg)", "rotate(-96deg)", REST], 1700),
        track("forearm-right", [REST, "rotate(-12deg)", "rotate(16deg)", "rotate(-12deg)", REST], 1100, 260),
        track("head", [REST, "rotate(-7deg)", "rotate(-7deg)", REST], 1700, 60),
        track("tail", [REST, "rotate(-13deg)", "rotate(17deg)", "rotate(-10deg)", REST], 1250, 250),
      ];
    case "ear":
      return [track(direction < 0 ? "ear-left" : "ear-right", [REST, `rotate(${16 * d}deg)`, `rotate(${-5 * d}deg)`, REST], 520)];
    case "tilt":
      return [
        track("head", [REST, `rotate(${9 * d}deg)`, `rotate(${9 * d}deg)`, REST], 1800),
        track(direction < 0 ? "ear-right" : "ear-left", [REST, `rotate(${-12 * d}deg)`, REST], 640, 120),
        track("gaze", [REST, `translate(${2 * d}px, -1px)`, REST], 1500, 100),
      ];
    case "wag":
      return [track("tail", [REST, "rotate(-17deg)", "rotate(22deg)", "rotate(-14deg)", "rotate(18deg)", REST], 1250 / variation)];
    case "shift":
      return [
        track("action", [REST, `translateX(${2 * d}px) rotate(${2 * d}deg)`, REST], 2200),
        track(direction < 0 ? "arm-right" : "arm-left", [REST, `rotate(${7 * d}deg)`, REST], 1800, 120),
      ];
    case "step":
      return [
        track("action", [REST, `translateX(${3 * d}px) rotate(${3 * d}deg)`, REST], 1700),
        track(direction < 0 ? "leg-right" : "leg-left", [REST, `translateY(-4px) rotate(${12 * d}deg)`, REST], 1200, 200),
        track("head", [REST, `rotate(${-5 * d}deg)`, REST], 1400, 100),
      ];
    case "nod":
      return [
        track("head", [REST, "translateY(4px) rotate(-4deg)", "translateY(-2px)", REST], 850),
        track("ear-right", [REST, "rotate(10deg)", REST], 460, 160),
      ];
    case "proud":
      return [
        track("action", [REST, "translateY(-3px) rotate(-3deg) scale(.97, 1.045)", "translateY(-3px) scale(.97, 1.045)", REST], 1500),
        track("head", [REST, "translateY(-3px) rotate(-5deg)", REST], 1300, 130),
        track("arm-right", [REST, "rotate(-28deg)", "rotate(-28deg)", REST], 1200, 100),
        track("forearm-right", [REST, "rotate(35deg)", REST], 1000, 200),
        track("tail", [REST, "rotate(18deg)", "rotate(-7deg)", REST], 800, 430),
      ];
    case "surprised":
      return [
        track("action", [REST, "translateY(-7px) scale(.94, 1.07)", REST], 800),
        track("arm-left", [REST, "rotate(28deg)", REST], 800),
        track("arm-right", [REST, "rotate(-28deg)", REST], 800),
        track("ear-left", [REST, "rotate(16deg)", REST], 650, 60),
        track("ear-right", [REST, "rotate(-16deg)", REST], 650, 100),
      ];
    case "celebrate":
      return [
        { part: "action", duration: 1700, frames: [
          { transform: REST, offset: 0 },
          { transform: "translateY(2px) scale(1.10, .86)", offset: .12 },
          { transform: "translateY(-23px) rotate(-7deg) scale(.94, 1.08)", offset: .30 },
          { transform: "translateY(2px) rotate(2deg) scale(1.11, .87)", offset: .46 },
          { transform: "translateY(-14px) rotate(6deg) scale(.97, 1.04)", offset: .62 },
          { transform: "translateY(1px) scale(1.07, .92)", offset: .77 },
          { transform: "translateY(-2px) scale(.99, 1.02)", offset: .90 },
          { transform: REST, offset: 1 },
        ] },
        ...["left", "right"].map(side => {
          const sign = side === "left" ? 1 : -1;
          return { part: `arm-${side}`, duration: 1700, frames: [
            { transform: REST, offset: 0 },
            { transform: `rotate(${-12 * sign}deg)`, offset: .12 },
            { transform: `rotate(${85 * sign}deg)`, offset: .30 },
            { transform: `rotate(${55 * sign}deg)`, offset: .46 },
            { transform: `rotate(${82 * sign}deg)`, offset: .62 },
            { transform: `rotate(${40 * sign}deg)`, offset: .77 },
            { transform: REST, offset: 1 },
          ] };
        }),
        track("forearm-left", [REST, "rotate(18deg)", "rotate(-10deg)", REST], 1200, 180),
        track("forearm-right", [REST, "rotate(-18deg)", "rotate(10deg)", REST], 1200, 200),
        track("leg-left", [REST, "rotate(25deg) translateY(-3px)", REST, "rotate(-10deg)", REST], 1300, 180),
        track("leg-right", [REST, "rotate(-25deg) translateY(-3px)", REST, "rotate(10deg)", REST], 1300, 180),
        track("head", [REST, "rotate(7deg)", "rotate(-7deg)", REST], 1300, 180),
        track("ear-left", [REST, "rotate(-23deg)", "rotate(12deg)", REST], 1300, 140),
        track("ear-right", [REST, "rotate(23deg)", "rotate(-12deg)", REST], 1300, 180),
        track("tail", [REST, "rotate(-20deg)", "rotate(25deg)", "rotate(-16deg)", REST], 1250, 280),
        { part: "sparkles", duration: 1400, delay: 180, frames: [
          { transform: "scale(.85)", opacity: 0 },
          { transform: "scale(1)", opacity: 1, offset: .25 },
          { transform: "scale(1.06)", opacity: .85, offset: .65 },
          { transform: "scale(1.12)", opacity: 0 },
        ] },
        { part: "shadow", duration: 1700, frames: [
          { transform: "scaleX(1)", opacity: .10, offset: 0 },
          { transform: "scaleX(.6)", opacity: .03, offset: .30 },
          { transform: "scaleX(1.10)", opacity: .12, offset: .46 },
          { transform: "scaleX(.72)", opacity: .04, offset: .62 },
          { transform: "scaleX(1.05)", opacity: .12, offset: .77 },
          { transform: "scaleX(1)", opacity: .10, offset: 1 },
        ] },
      ];
    case "doze":
      return [
        track("head", [REST, "translateY(5px) rotate(8deg)", "translateY(5px) rotate(8deg)", REST], 2600),
        track("ear-right", [REST, "rotate(12deg)", REST], 2100, 200),
      ];
    case "yawn":
      return [
        track("head", [REST, "translateY(-4px) rotate(-10deg)", "translateY(-4px) rotate(-10deg)", REST], 2400),
        track("arm-left", [REST, "rotate(85deg)", "rotate(85deg)", REST], 2400),
        track("arm-right", [REST, "rotate(-85deg)", "rotate(-85deg)", REST], 2400, 80),
        track("ear-left", [REST, "rotate(-12deg)", REST], 2100, 100),
      ];
    case "dream":
      return [{ part: "sleep", duration: 2600, frames: [
        { transform: REST, opacity: .5 }, { transform: "translateY(-3px)", opacity: .75 },
        { transform: REST, opacity: .5 },
      ] }];
    default: return [];
  }
}

/** Lifecycle is owned by the SVG, independent of MascotMoment's appearance
 * rules. No network, RAF loop, React frame updates, or extra dependency. */
export function createMascotDirector(root, { random = Math.random } = {}) {
  const doc = root.ownerDocument;
  const win = doc.defaultView;
  const reduced = win.matchMedia("(prefers-reduced-motion: reduce)");
  const active = new Set();
  let context = { mood: null, animated: false, reactionKey: undefined };
  let visible = !win.IntersectionObserver;
  let disposed = false;
  let generation = 0;
  let timer;
  let breath;
  let pending = false;
  let lastGesture;
  let blinkAt = 0;
  let gestureAt = 0;
  const between = (a, b) => a + random() * (b - a);
  const enabled = () => !disposed && context.animated && visible && !doc.hidden && !reduced.matches;
  const part = name => root.querySelector(`[data-mascot-part="${name}"]`);

  function play(score) {
    const element = part(score.part);
    if (!element?.animate) return Promise.resolve();
    // Ease each movement between poses, not the entire multi-pose sequence:
    // otherwise elbows and head change velocity abruptly at each keyframe.
    const animation = element.animate(score.frames.map(frame => ({ easing: "ease-in-out", ...frame })), {
      duration: score.duration, delay: score.delay || 0, easing: score.easing || "linear", fill: "none",
    });
    active.add(animation);
    return animation.finished.catch(() => {}).finally(() => active.delete(animation));
  }

  function stop() {
    generation += 1;
    win.clearTimeout(timer);
    timer = undefined;
    active.forEach(animation => animation.cancel());
    active.clear();
    breath = undefined;
    root.dataset.gesture = "rest";
  }

  function breathe(run) {
    if (run !== generation || !enabled()) return;
    const element = part("breath");
    if (!element?.animate) return;
    const sleepy = context.mood === "sleepy";
    const amplitude = between(.016, sleepy ? .034 : .025);
    breath = element.animate([
      { transform: REST, easing: "ease-in-out" },
      { transform: `scale(${1 + amplitude / 2}, ${1 + amplitude})`, offset: .43, easing: "ease-in-out" },
      { transform: REST },
    ], { duration: sleepy ? between(5200, 6600) : between(3600, 5200), easing: "linear" });
    const cycle = breath;
    active.add(cycle);
    cycle.finished.then(() => {
      active.delete(cycle);
      breathe(run);
    }, () => active.delete(cycle));
  }

  function schedule(run, delay) {
    if (run !== generation || !enabled()) return;
    timer = win.setTimeout(() => tick(run), Math.max(0, delay));
  }

  async function tick(run) {
    if (run !== generation || !enabled()) return;
    const now = win.performance.now();
    const profile = PROFILES[context.mood];
    let gesture;
    if (pending) {
      pending = false;
      gesture = { neutral: "wave", celebrating: "celebrate", proud: "proud", surprised: "surprised",
        happy: "wave", focused: "read", worried: "check", sleepy: "yawn" }[context.mood];
    } else if (context.mood !== "sleepy" && now >= blinkAt) {
      gesture = random() < .18 ? "doubleBlink" : "blink";
    } else if (now >= gestureAt) {
      const choices = profile.gestures.filter(name => name !== lastGesture);
      gesture = choices[Math.floor(random() * choices.length)];
      lastGesture = gesture;
    }
    if (gesture) {
      root.dataset.gesture = gesture;
      const expressive = ["celebrate", "proud", "surprised", "yawn"].includes(gesture);
      if (expressive) breath?.pause();
      await Promise.all(gestureScore(gesture, random() < .5 ? -1 : 1, between(.88, 1.12)).map(play));
      if (run !== generation || !enabled()) return;
      if (expressive) breath?.play();
      root.dataset.gesture = "rest";
      const finishedAt = win.performance.now();
      if (gesture === "blink" || gesture === "doubleBlink") blinkAt = finishedAt + between(2800, 6800);
      else gestureAt = finishedAt + between(...profile.gap);
    }
    const next = context.mood === "sleepy" ? gestureAt : Math.min(blinkAt, gestureAt);
    schedule(run, next - win.performance.now());
  }

  function start(run) {
    if (run !== generation || !enabled()) return;
    root.dataset.motion = "running";
    blinkAt = win.performance.now() + between(1600, 4200);
    gestureAt = win.performance.now() + between(...PROFILES[context.mood].gap);
    breathe(run);
    // Let the existing card/toast entrance settle before the character reacts.
    schedule(run, pending ? 550 : Math.min(blinkAt, gestureAt) - win.performance.now());
  }

  function refresh(smooth = false) {
    // Capture before cancellation so a context change settles from the current
    // pose. New mood posture is on different SVG groups (CSS transitions).
    const settling = smooth && enabled() ? [...active].map(animation => {
      const el = animation.effect?.target;
      return el?.isConnected ? { el, transform: win.getComputedStyle(el).transform } : null;
    }).filter(Boolean) : [];
    stop();
    const run = generation;
    root.dataset.motion = !context.animated ? "static" : reduced.matches ? "reduced" : "paused";
    if (!context.animated || reduced.matches) pending = false;
    if (!enabled()) return;
    if (!settling.length) { start(run); return; }
    const animations = settling.map(({ el, transform }) => {
      const animation = el.animate([{ transform }, { transform: REST }], { duration: 180, easing: SETTLE });
      active.add(animation);
      return animation.finished.catch(() => {}).finally(() => active.delete(animation));
    });
    Promise.all(animations).then(() => start(run));
  }

  const onAvailability = () => refresh();
  const observer = win.IntersectionObserver ? new win.IntersectionObserver(entries => {
    const next = entries.some(entry => entry.isIntersecting && entry.intersectionRatio > 0);
    if (next !== visible) { visible = next; refresh(); }
  }, { threshold: 0 }) : null;
  observer?.observe(root);
  doc.addEventListener("visibilitychange", onAvailability);
  reduced.addEventListener("change", onAvailability);

  return {
    update(next) {
      if (disposed) return;
      if (next.mood === context.mood && next.animated === context.animated && next.reactionKey === context.reactionKey) return;
      pending = next.mood !== context.mood || next.reactionKey !== context.reactionKey;
      context = next;
      lastGesture = undefined;
      refresh(true);
    },
    dispose() {
      disposed = true;
      stop();
      observer?.disconnect();
      doc.removeEventListener("visibilitychange", onAvailability);
      reduced.removeEventListener("change", onAvailability);
      root.dataset.motion = "static";
    },
  };
}
