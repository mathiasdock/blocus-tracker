// Cosmetic catalog only. Eligibility and the equipped choice come from the
// owner-only server preference RPC, never from this catalog or localStorage.
export const FOCUS_ENVIRONMENTS = Object.freeze([
  { id: "forest", nameKey: "focusEnv.forest", requiredLevel: 1, renderer: "forest", available: true,
    preview: "linear-gradient(145deg, #081C15, #40916C 58%, #95D5B2)", theme: {} },
  { id: "gradient-wave", nameKey: "focusEnv.wave", requiredLevel: 5, renderer: "gradient-wave", available: true,
    preview: "linear-gradient(145deg, #38bdf8, #ffffff 46%, #38bdf8)",
    theme: {
      "--bt-focus-env-canvas": "#38bdf8",
      "--bt-focus-env-text": "#073650",
      "--bt-focus-env-muted": "#12445B",
      "--bt-focus-env-accent": "#0B5070",
      "--bt-focus-env-action": "#073650",
      "--bt-focus-env-action-text": "#F7FCFF",
      "--bt-focus-env-action-hover": "#0B3046",
      "--bt-focus-env-secondary": "rgba(255, 255, 255, 0.86)",
      "--bt-focus-env-control": "rgba(255, 255, 255, 0.92)",
      "--bt-focus-env-control-active": "#C6ECFF",
      "--bt-focus-env-panel": "#F4FAFD",
      "--bt-focus-env-border": "rgba(7, 54, 80, 0.22)",
      "--bt-focus-env-selected": "#C6ECFF",
      "--bt-focus-env-selected-text": "#073650",
      "--bt-focus-env-ring": "#073650",
    }, pausedTheme: {
      "--bt-focus-env-text": "#FFEDEB",
      "--bt-focus-env-muted": "#FFD9D4",
      "--bt-focus-env-secondary": "#2C0D0D",
      "--bt-focus-env-control": "rgba(24, 5, 5, 0.72)",
      "--bt-focus-env-control-active": "#58201A",
      "--bt-focus-env-panel": "#2C0D0D",
      "--bt-focus-env-border": "rgba(255, 217, 212, 0.28)",
      "--bt-focus-env-selected": "#FFE5E1",
      "--bt-focus-env-ring": "#FFEDEB",
    } },
  { id: "reserved-12", nameKey: "focusEnv.future3", requiredLevel: 12, renderer: null, available: false, theme: {} },
  { id: "reserved-20", nameKey: "focusEnv.future4", requiredLevel: 20, renderer: null, available: false, theme: {} },
]);

export function getFocusEnvironment(id) {
  return FOCUS_ENVIRONMENTS.find(environment => environment.id === id) || FOCUS_ENVIRONMENTS[0];
}

export function environmentState(environment, highestLevel = 1) {
  if (!environment.available) return "coming-soon";
  return Number(highestLevel) >= environment.requiredLevel ? "unlocked" : "locked";
}

export function nextFocusUnlock(highestLevel = 1) {
  return FOCUS_ENVIRONMENTS.find(environment => environment.available && environment.requiredLevel > Number(highestLevel)) || null;
}
