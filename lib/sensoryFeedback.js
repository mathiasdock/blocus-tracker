// Retours ponctuels de l'app. Les cinq fichiers sont des extraits locaux de la
// galerie ElevenLabs, préchargés puis joués via Web Audio. Le synthé reste un
// filet de sécurité si un asset n'est pas encore décodé ou si son chargement
// échoue : un clic important ne doit jamais sembler mort.

const STORAGE_KEY = "bt_sensory_v1";

const SOUND_CUES = Object.freeze({
  start:        { src: "/sounds/bt-start.mp3",        volume: 0.22, rate: 1,    minGap: 100 },
  pause:        { src: "/sounds/bt-start.mp3",        volume: 0.16, rate: 0.74, minGap: 100 },
  resume:       { src: "/sounds/bt-resume.mp3",       volume: 0.24, rate: 1,    minGap: 100 },
  goal:         { src: "/sounds/bt-complete.mp3",     volume: 0.16, rate: 1,    minGap: 500 },
  pomodoro:     { src: "/sounds/bt-complete.mp3",     volume: 0.18, rate: 0.96, minGap: 500 },
  complete:     { src: "/sounds/bt-complete.mp3",     volume: 0.18, rate: 1,    minGap: 500 },
  xp:           { src: "/sounds/bt-xp.mp3",           volume: 0.15, rate: 1,    minGap: 700 },
  notification: { src: "/sounds/bt-notification.mp3", volume: 0.12, rate: 1,    minGap: 1200 },
});

const ASSET_PATHS = [...new Set(Object.values(SOUND_CUES).map((cue) => cue.src))];

export const DEFAULT_SENSORY_PREFERENCES = Object.freeze({
  sound: true,
  haptics: true,
});

let audioContext = null;
let preloadPromise = null;
const audioBuffers = new Map();
const lastCueAt = new Map();
let lastHapticAt = 0;

export function readSensoryPreferences() {
  if (typeof window === "undefined") return { ...DEFAULT_SENSORY_PREFERENCES };
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    return {
      sound: typeof saved.sound === "boolean" ? saved.sound : true,
      haptics: typeof saved.haptics === "boolean" ? saved.haptics : true,
    };
  } catch {
    return { ...DEFAULT_SENSORY_PREFERENCES };
  }
}

export function writeSensoryPreferences(next) {
  const preferences = { ...readSensoryPreferences(), ...next };
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences)); } catch {}
  return preferences;
}

export function isSensorySoundSupported() {
  return typeof window !== "undefined" && !!(window.AudioContext || window.webkitAudioContext || window.Audio);
}

export function isHapticsSupported() {
  if (typeof window === "undefined" || typeof navigator.vibrate !== "function") return false;
  const coarsePointer = window.matchMedia?.("(pointer: coarse)").matches;
  const standalone = window.matchMedia?.("(display-mode: standalone)").matches || navigator.standalone === true;
  return !!(coarsePointer || standalone);
}

function getAudioContext() {
  if (typeof window === "undefined" || !(window.AudioContext || window.webkitAudioContext)) return null;
  if (!audioContext) {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    try {
      audioContext = new AudioContext({ latencyHint: "interactive" });
    } catch {
      audioContext = new AudioContext();
    }
  }
  return audioContext;
}

function decodeAudio(ctx, arrayBuffer) {
  return new Promise((resolve, reject) => {
    try {
      const result = ctx.decodeAudioData(arrayBuffer.slice(0), resolve, reject);
      if (result?.then) result.then(resolve, reject);
    } catch (error) {
      reject(error);
    }
  });
}

export function preloadSensoryFeedback() {
  if (typeof window === "undefined" || !readSensoryPreferences().sound) return Promise.resolve(false);
  if (preloadPromise) return preloadPromise;
  const ctx = getAudioContext();
  if (!ctx || typeof fetch !== "function") return Promise.resolve(false);

  preloadPromise = Promise.all(ASSET_PATHS.map(async (src) => {
    try {
      const response = await fetch(src, { cache: "force-cache" });
      if (!response.ok) return;
      const buffer = await decodeAudio(ctx, await response.arrayBuffer());
      audioBuffers.set(src, buffer);
    } catch {
      // Le synthé de secours prendra le relais au moment de l'interaction.
    }
  })).then(() => audioBuffers.size > 0);

  return preloadPromise;
}

// Appelé une seule fois par `_app`. Le listener en capture réveille le contexte
// avant le onClick React : Safari/iOS autorise ensuite les sons asynchrones
// (XP, notification, fin automatique) sans bloquer l'autoplay.
export function initSensoryFeedback() {
  if (typeof window === "undefined") return () => {};
  void preloadSensoryFeedback();

  const unlock = () => {
    const ctx = getAudioContext();
    if (ctx && ctx.state !== "running") {
      try { ctx.resume()?.catch?.(() => {}); } catch {}
    }
    void preloadSensoryFeedback();
  };

  window.addEventListener("pointerdown", unlock, { capture: true, once: true });
  window.addEventListener("keydown", unlock, { capture: true, once: true });
  return () => {
    window.removeEventListener("pointerdown", unlock, { capture: true });
    window.removeEventListener("keydown", unlock, { capture: true });
  };
}

function tone(ctx, { frequency, endFrequency, delay = 0, duration, gain, type = "sine" }) {
  const startAt = ctx.currentTime + delay;
  const endAt = startAt + duration;
  const oscillator = ctx.createOscillator();
  const envelope = ctx.createGain();

  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, startAt);
  if (endFrequency) oscillator.frequency.exponentialRampToValueAtTime(endFrequency, endAt);
  envelope.gain.setValueAtTime(0.0001, startAt);
  envelope.gain.exponentialRampToValueAtTime(gain, startAt + Math.min(0.012, duration / 4));
  envelope.gain.exponentialRampToValueAtTime(0.0001, endAt);
  oscillator.connect(envelope);
  envelope.connect(ctx.destination);
  oscillator.start(startAt);
  oscillator.stop(endAt + 0.02);
  oscillator.onended = () => {
    try { oscillator.disconnect(); envelope.disconnect(); } catch {}
  };
}

function playSynthFallback(ctx, cue) {
  if (cue === "pause") {
    tone(ctx, { frequency: 260, endFrequency: 180, duration: 0.1, gain: 0.035, type: "triangle" });
  } else if (cue === "notification") {
    tone(ctx, { frequency: 740, duration: 0.12, gain: 0.03 });
    tone(ctx, { frequency: 980, delay: 0.06, duration: 0.16, gain: 0.026 });
  } else if (cue === "goal" || cue === "pomodoro" || cue === "complete" || cue === "xp") {
    tone(ctx, { frequency: 523.25, duration: 0.18, gain: 0.03, type: "triangle" });
    tone(ctx, { frequency: 659.25, delay: 0.05, duration: 0.21, gain: 0.032, type: "triangle" });
    tone(ctx, { frequency: 783.99, delay: 0.1, duration: 0.24, gain: 0.027 });
  } else {
    tone(ctx, { frequency: cue === "resume" ? 460 : 700, endFrequency: cue === "resume" ? 650 : 900, duration: 0.07, gain: 0.035 });
  }
}

function playBuffer(ctx, config) {
  const buffer = audioBuffers.get(config.src);
  if (!buffer) return false;
  const source = ctx.createBufferSource();
  const gain = ctx.createGain();
  source.buffer = buffer;
  source.playbackRate.value = config.rate;
  gain.gain.value = config.volume;
  source.connect(gain);
  gain.connect(ctx.destination);
  source.start();
  source.onended = () => {
    try { source.disconnect(); gain.disconnect(); } catch {}
  };
  return true;
}

function playHtmlAudio(config) {
  if (typeof window === "undefined" || !window.Audio) return false;
  try {
    const audio = new Audio(config.src);
    audio.preload = "auto";
    audio.volume = config.volume;
    audio.playbackRate = config.rate;
    audio.play().catch(() => {});
    return true;
  } catch {
    return false;
  }
}

export function playSensoryCue(cue) {
  const config = SOUND_CUES[cue];
  if (!config || !readSensoryPreferences().sound) return false;

  const now = Date.now();
  if (now - (lastCueAt.get(cue) || 0) < config.minGap) return false;
  lastCueAt.set(cue, now);

  const ctx = getAudioContext();
  if (!ctx) return playHtmlAudio(config);

  const play = () => {
    if (!playBuffer(ctx, config)) {
      void preloadSensoryFeedback();
      playSynthFallback(ctx, cue);
    }
  };

  if (ctx.state !== "running") {
    try {
      const resumed = ctx.resume();
      if (resumed?.then) resumed.then(play).catch(() => playHtmlAudio(config));
      else play();
    } catch {
      return playHtmlAudio(config);
    }
  } else {
    play();
  }
  return true;
}

const HAPTIC_PATTERNS = {
  start: 7,
  block: 10,
  goal: [10, 35, 12],
};

export function triggerHaptic(kind) {
  if (!readSensoryPreferences().haptics || !isHapticsSupported()) return false;
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return false;
  const pattern = HAPTIC_PATTERNS[kind];
  if (!pattern || Date.now() - lastHapticAt < 300) return false;
  lastHapticAt = Date.now();
  try { return navigator.vibrate(pattern); } catch { return false; }
}
