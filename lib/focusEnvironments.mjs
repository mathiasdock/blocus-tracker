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
      "--bt-focus-env-action": "#C6ECFF",
      "--bt-focus-env-action-text": "#073650",
      "--bt-focus-env-action-hover": "#F7FCFF",
      "--bt-focus-env-secondary": "#2C0D0D",
      "--bt-focus-env-control": "rgba(24, 5, 5, 0.72)",
      "--bt-focus-env-control-active": "#58201A",
      "--bt-focus-env-panel": "#2C0D0D",
      "--bt-focus-env-border": "rgba(255, 217, 212, 0.28)",
      "--bt-focus-env-selected": "#FFE5E1",
      "--bt-focus-env-ring": "#FFEDEB",
    } },
  { id: "zenitho", nameKey: "focusEnv.zenitho", requiredLevel: 12, renderer: "zenitho", available: true,
    preview: 'url("/focus-environments/zenitho.jpg") center / cover',
    theme: {
      "--bt-focus-env-canvas": "#7038ff",
      "--bt-focus-env-text": "#FBF7FF",
      "--bt-focus-env-muted": "#E9DDF7",
      "--bt-focus-env-stage-text": "#1C1027",
      "--bt-focus-env-accent": "#1C1027",
      "--bt-focus-env-block-fill": "#5144B7",
      "--bt-focus-env-block-rgb": "81, 68, 183",
      "--bt-focus-env-action": "#EFE2FF",
      "--bt-focus-env-action-text": "#301446",
      "--bt-focus-env-action-hover": "#FBF7FF",
      "--bt-focus-env-secondary": "#301B46",
      "--bt-focus-env-control": "#301B46",
      "--bt-focus-env-control-active": "#573675",
      "--bt-focus-env-panel": "#241332",
      "--bt-focus-env-border": "rgba(233, 221, 247, 0.28)",
      "--bt-focus-env-selected": "#573675",
      "--bt-focus-env-selected-text": "#FBF7FF",
      "--bt-focus-env-ring": "#EFE2FF",
    }, pausedTheme: {
      "--bt-focus-env-text": "#FFEDEB",
      "--bt-focus-env-muted": "#FFD9D4",
      "--bt-focus-env-stage-text": "#FFEDEB",
      "--bt-focus-env-secondary": "#2C0D0D",
      "--bt-focus-env-control": "rgba(24, 5, 5, 0.72)",
      "--bt-focus-env-control-active": "#58201A",
      "--bt-focus-env-panel": "#2C0D0D",
      "--bt-focus-env-border": "rgba(255, 217, 212, 0.28)",
      "--bt-focus-env-selected": "#58201A",
      "--bt-focus-env-ring": "#FFEDEB",
    } },
  { id: "glass-fold", nameKey: "focusEnv.glassFold", requiredLevel: 20, renderer: "glass-fold", available: true,
    preview: 'url("/focus-environments/glass-fold.jpg") center / cover',
    theme: {
      "--bt-focus-env-canvas": "#06081E",
      "--bt-focus-env-text": "#F2F9FF",
      "--bt-focus-env-muted": "#E2F2FF",
      "--bt-focus-env-accent": "#96D7FF",
      "--bt-focus-env-block-fill": "#96D7FF",
      "--bt-focus-env-block-rgb": "150, 215, 255",
      "--bt-focus-env-action": "#96D7FF",
      "--bt-focus-env-action-text": "#06081E",
      "--bt-focus-env-action-hover": "#C8E9FF",
      "--bt-focus-env-secondary": "#0C1742",
      "--bt-focus-env-control": "#0C1742",
      "--bt-focus-env-control-active": "#244796",
      "--bt-focus-env-panel": "#0C1234",
      "--bt-focus-env-border": "rgba(150, 215, 255, 0.35)",
      "--bt-focus-env-selected": "#244796",
      "--bt-focus-env-selected-text": "#F2F9FF",
      "--bt-focus-env-ring": "#96D7FF",
    }, pausedTheme: {
      "--bt-focus-env-text": "#FFEDEB",
      "--bt-focus-env-muted": "#FFD9D4",
      "--bt-focus-env-secondary": "#2C0D0D",
      "--bt-focus-env-control": "rgba(24, 5, 5, 0.72)",
      "--bt-focus-env-control-active": "#58201A",
      "--bt-focus-env-panel": "#2C0D0D",
      "--bt-focus-env-border": "rgba(255, 217, 212, 0.28)",
      "--bt-focus-env-selected": "#58201A",
      "--bt-focus-env-ring": "#FFEDEB",
    } },
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
