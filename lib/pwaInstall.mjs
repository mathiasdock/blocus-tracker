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
  installationRecorded = false,
  dismissedThisSession = false,
} = {}) {
  if (!enabled || !hasUser || installed || installationRecorded || dismissedThisSession) return null;
  if (nativePromptAvailable) return "native";
  if (iosSafari) return "ios";
  return null;
}
