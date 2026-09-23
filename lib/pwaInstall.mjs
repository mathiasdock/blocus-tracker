export const PWA_INSTALL_COOLDOWN_MS = 30 * 24 * 60 * 60 * 1000;
export const PWA_INSTALL_MAX_SHOWS = 3;

export function isPwaInstalled({ displayModeStandalone = false, navigatorStandalone = false } = {}) {
  return displayModeStandalone || navigatorStandalone;
}

export function isIOSSafari({ userAgent = "", platform = "", maxTouchPoints = 0 } = {}) {
  const iosDevice = /iPad|iPhone|iPod/.test(userAgent)
    || (platform === "MacIntel" && maxTouchPoints > 1);
  if (!iosDevice || !/WebKit/i.test(userAgent)) return false;

  // Every iOS browser uses WebKit, so Safari is identified by excluding the
  // browsers that add their own marker to the user agent.
  return !/(CriOS|FxiOS|EdgiOS|OPiOS|DuckDuckGo|GSA)/i.test(userAgent);
}

export function decidePwaPrompt({
  enabled = true,
  hasUser = false,
  installed = false,
  nativePromptAvailable = false,
  iosSafari = false,
  done = false,
  dismissedThisSession = false,
  dismissedAt = 0,
  shownCount = 0,
  now = Date.now(),
} = {}) {
  if (!enabled || !hasUser || installed || done || dismissedThisSession) return null;
  if (shownCount >= PWA_INSTALL_MAX_SHOWS) return null;
  if (dismissedAt && now - dismissedAt < PWA_INSTALL_COOLDOWN_MS) return null;
  if (nativePromptAvailable) return "native";
  if (iosSafari) return "ios";
  return null;
}
