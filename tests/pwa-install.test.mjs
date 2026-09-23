import test from "node:test";
import assert from "node:assert/strict";
import {
  PWA_INSTALL_COOLDOWN_MS,
  PWA_INSTALL_MAX_SHOWS,
  decidePwaPrompt,
  isIOSSafari,
  isPwaInstalled,
} from "../lib/pwaInstall.mjs";

const visibleState = {
  enabled: true,
  hasUser: true,
  installed: false,
  done: false,
  dismissedThisSession: false,
  dismissedAt: 0,
  shownCount: 0,
  now: 2_000_000_000_000,
};

test("installed display modes always suppress the install prompt", () => {
  assert.equal(isPwaInstalled({ displayModeStandalone: true }), true);
  assert.equal(isPwaInstalled({ navigatorStandalone: true }), true);
  assert.equal(decidePwaPrompt({ ...visibleState, installed: true, nativePromptAvailable: true }), null);
});

test("a browser install event takes precedence over Safari instructions", () => {
  assert.equal(decidePwaPrompt({
    ...visibleState,
    nativePromptAvailable: true,
    iosSafari: true,
  }), "native");
});

test("Safari instructions are restricted to iOS Safari", () => {
  const safari = {
    userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1",
    platform: "iPhone",
    maxTouchPoints: 5,
  };
  const chrome = { ...safari, userAgent: `${safari.userAgent} CriOS/140.0.0.0` };

  assert.equal(isIOSSafari(safari), true);
  assert.equal(isIOSSafari(chrome), false);
  assert.equal(decidePwaPrompt({ ...visibleState, iosSafari: true }), "ios");
  assert.equal(decidePwaPrompt(visibleState), null);
});

test("dismissal applies a cooldown and repeated prompts are capped", () => {
  assert.equal(decidePwaPrompt({
    ...visibleState,
    iosSafari: true,
    dismissedAt: visibleState.now - PWA_INSTALL_COOLDOWN_MS + 1,
  }), null);
  assert.equal(decidePwaPrompt({
    ...visibleState,
    iosSafari: true,
    dismissedAt: visibleState.now - PWA_INSTALL_COOLDOWN_MS,
  }), "ios");
  assert.equal(decidePwaPrompt({
    ...visibleState,
    iosSafari: true,
    shownCount: PWA_INSTALL_MAX_SHOWS,
  }), null);
});

test("signed-out, disabled and explicitly completed states stay hidden", () => {
  assert.equal(decidePwaPrompt({ ...visibleState, iosSafari: true, hasUser: false }), null);
  assert.equal(decidePwaPrompt({ ...visibleState, iosSafari: true, enabled: false }), null);
  assert.equal(decidePwaPrompt({ ...visibleState, iosSafari: true, done: true }), null);
  assert.equal(decidePwaPrompt({ ...visibleState, iosSafari: true, dismissedThisSession: true }), null);
});
