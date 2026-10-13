import test from "node:test";
import assert from "node:assert/strict";
import { FOCUS_ENVIRONMENTS, getFocusEnvironment, environmentState, nextFocusUnlock } from "../lib/focusEnvironments.mjs";
import { translate } from "../lib/i18n.js";

test("registry keeps two real renderers and two unavailable reservations", () => {
  assert.deepEqual(FOCUS_ENVIRONMENTS.map(environment => environment.requiredLevel), [1, 5, 12, 20]);
  assert.deepEqual(FOCUS_ENVIRONMENTS.filter(environment => environment.available).map(environment => environment.renderer), ["forest", "gradient-wave"]);
  for (const environment of FOCUS_ENVIRONMENTS.filter(environment => !environment.available)) {
    assert.equal(environment.renderer, null);
    assert.equal(environment.preview, undefined);
    assert.equal(environmentState(environment, 30), "coming-soon");
  }
  assert.equal(getFocusEnvironment("unknown").id, "forest");
  assert.deepEqual(getFocusEnvironment("forest").theme, {});
});

test("level boundary and next available unlock never promise a future renderer", () => {
  const wave = getFocusEnvironment("gradient-wave");
  assert.equal(environmentState(wave, 4), "locked");
  assert.equal(environmentState(wave, 5), "unlocked");
  assert.equal(nextFocusUnlock(1).id, "gradient-wave");
  assert.equal(nextFocusUnlock(5), null);
});

test("gallery copy is complete in French and English", () => {
  for (const lang of ["fr", "en"]) for (const key of ["title", "intro", "forest", "wave", "future3", "future4", "level", "locked", "equipped", "available", "comingSoon", "next", "saveError", "retry"]) {
    assert.notEqual(translate(lang, `focusEnv.${key}`), `focusEnv.${key}`);
  }
});

function luminance(hex) {
  const c = hex.slice(1).match(/../g).map(v => parseInt(v, 16) / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4);
  return .2126 * c[0] + .7152 * c[1] + .0722 * c[2];
}
function contrast(a, b) { const [light, dark] = [luminance(a), luminance(b)].sort((a, b) => b - a); return (light + .05) / (dark + .05); }
test("Wave ink, actions and gallery keep accessible text contrast without a dark global veil", () => {
  const theme = getFocusEnvironment("gradient-wave").theme;
  for (const background of ["#38bdf8", "#ffffff", "#BDBDBD", theme["--bt-focus-env-panel"], theme["--bt-focus-env-selected"]]) {
    assert.ok(contrast(theme["--bt-focus-env-text"], background) >= 4.5);
    assert.ok(contrast(theme["--bt-focus-env-muted"], background) >= 4.5);
  }
  assert.ok(contrast(theme["--bt-focus-env-action-text"], theme["--bt-focus-env-action"]) >= 4.5);
  assert.ok(contrast(theme["--bt-focus-env-ring"], theme["--bt-focus-env-panel"]) >= 3);
  const pausedTheme = getFocusEnvironment("gradient-wave").pausedTheme;
  assert.ok(contrast(pausedTheme["--bt-focus-env-text"], pausedTheme["--bt-focus-env-secondary"]) >= 4.5);
});
