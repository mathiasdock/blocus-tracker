// Feedbacks ponctuels du chrono, synthétisés sur l'appareil. Aucun fichier,
// aucune requête réseau et aucun egress. Les volumes restent volontairement
// très bas : ces sons doivent se ressentir davantage qu'ils ne s'entendent.

const STORAGE_KEY = "bt_sensory_v1";

export const DEFAULT_SENSORY_PREFERENCES = Object.freeze({
  sound: true,
  haptics: true,
});

let audioContext = null;
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
  return typeof window !== "undefined" && !!(window.AudioContext || window.webkitAudioContext);
}

export function isHapticsSupported() {
  if (typeof window === "undefined" || typeof navigator.vibrate !== "function") return false;
  const coarsePointer = window.matchMedia?.("(pointer: coarse)").matches;
  const standalone = window.matchMedia?.("(display-mode: standalone)").matches || navigator.standalone === true;
  return !!(coarsePointer || standalone);
}

function getAudioContext() {
  if (!isSensorySoundSupported()) return null;
  if (!audioContext) {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    try {
      audioContext = new AudioContext({ latencyHint: "interactive" });
    } catch {
      audioContext = new AudioContext();
    }
  }
  if (audioContext.state === "suspended") {
    try { audioContext.resume()?.catch?.(() => {}); } catch {}
  }
  return audioContext;
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

export function playSensoryCue(cue) {
  if (!readSensoryPreferences().sound) return false;
  const ctx = getAudioContext();
  if (!ctx) return false;

  if (cue === "start") {
    tone(ctx, { frequency: 720, endFrequency: 920, duration: 0.055, gain: 0.012 });
  } else if (cue === "pause") {
    tone(ctx, { frequency: 280, endFrequency: 190, duration: 0.11, gain: 0.014, type: "triangle" });
  } else if (cue === "resume") {
    tone(ctx, { frequency: 440, endFrequency: 620, duration: 0.08, gain: 0.013 });
  } else if (cue === "goal") {
    tone(ctx, { frequency: 523.25, duration: 0.18, gain: 0.011, type: "triangle" });
    tone(ctx, { frequency: 659.25, delay: 0.045, duration: 0.2, gain: 0.012, type: "triangle" });
    tone(ctx, { frequency: 783.99, delay: 0.095, duration: 0.22, gain: 0.01 });
  } else if (cue === "pomodoro") {
    tone(ctx, { frequency: 659.25, duration: 0.42, gain: 0.009, type: "triangle" });
    tone(ctx, { frequency: 880, delay: 0.07, duration: 0.48, gain: 0.009, type: "triangle" });
    tone(ctx, { frequency: 1046.5, delay: 0.15, duration: 0.55, gain: 0.007 });
  } else {
    return false;
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
