import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import { FOCUS_ENVIRONMENTS, getFocusEnvironment, environmentState, nextFocusUnlock } from "../lib/focusEnvironments.mjs";
import { translate } from "../lib/i18n.js";

test("registry contains exactly four real environments at Levels 1, 5, 12 and 20", () => {
  assert.deepEqual(FOCUS_ENVIRONMENTS.map(environment => environment.requiredLevel), [1, 5, 12, 20]);
  assert.deepEqual(FOCUS_ENVIRONMENTS.filter(environment => environment.available).map(environment => environment.renderer), ["forest", "gradient-wave", "zenitho", "glass-fold"]);
  assert.equal(FOCUS_ENVIRONMENTS.filter(environment => !environment.available).length, 0);
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
  assert.equal(nextFocusUnlock(5).id, "zenitho");
  assert.equal(environmentState(getFocusEnvironment("zenitho"), 11), "locked");
  assert.equal(environmentState(getFocusEnvironment("zenitho"), 12), "unlocked");
  assert.equal(nextFocusUnlock(12).id, "glass-fold");
  assert.equal(environmentState(getFocusEnvironment("glass-fold"), 19), "locked");
  assert.equal(environmentState(getFocusEnvironment("glass-fold"), 20), "unlocked");
  assert.equal(nextFocusUnlock(20), null);
});

test("gallery copy is complete in French and English", () => {
  for (const lang of ["fr", "en"]) for (const key of ["title", "intro", "forest", "wave", "zenitho", "glassFold", "level", "locked", "equipped", "available", "comingSoon", "next", "saveError", "retry"]) {
    assert.notEqual(translate(lang, `focusEnv.${key}`), `focusEnv.${key}`);
  }
});

test("Focus timer glyphs have no contrasting outline and caption backing has no large glow", () => {
  const css = readFileSync(new URL("../components/focus/FocusEnvironments.module.css", import.meta.url), "utf8");
  assert.match(css, /text-shadow: none;\s+-webkit-text-stroke: 0/);
  assert.doesNotMatch(css, /text-shadow:\s*0 1px|text-shadow:\s*0 -1px/);
  assert.doesNotMatch(css, /filter: blur\(4px\)/);
  assert.match(css, /filter: blur\(1px\)/);
});

test("Zenitho controls and large timer ink keep their source-palette contrast", () => {
  const environment = getFocusEnvironment("zenitho");
  for (const tokens of [environment.theme, { ...environment.theme, ...environment.pausedTheme }]) {
    for (const background of [tokens["--bt-focus-env-panel"], tokens["--bt-focus-env-secondary"], tokens["--bt-focus-env-selected"]]) {
      assert.ok(contrast(tokens["--bt-focus-env-text"], background) >= 4.5);
      assert.ok(contrast(tokens["--bt-focus-env-muted"], background) >= 4.5);
    }
    for (const background of [tokens["--bt-focus-env-action"], tokens["--bt-focus-env-action-hover"]]) {
      assert.ok(contrast(tokens["--bt-focus-env-action-text"], background) >= 4.5);
    }
    assert.ok(contrast(tokens["--bt-focus-env-ring"], tokens["--bt-focus-env-panel"]) >= 3);
  }
  // Large digits use dark ink against the source palette, without a global
  // veil. Do not certify small moving captions with a removed white backing.
  const ink = environment.theme["--bt-focus-env-stage-text"];
  for (const frameColor of ["#ef008f", "#6ec3f4", "#7038ff", "#ffba27"]) {
    assert.ok(contrast(ink, frameColor) >= 3);
  }
});

test("Zenitho captions have no white backing or replacement halo; Glass Fold stays unchanged", () => {
  const css = readFileSync(new URL("../components/focus/FocusEnvironments.module.css", import.meta.url), "utf8");
  assert.doesNotMatch(css, /\.focus\[data-environment="zenitho"\][^{]*:global\([ps][^)]*data-focus-reading[^)]*\)::before/);
  assert.doesNotMatch(css, /background:\s*rgba\(255,255,255,\.55\)/);
  assert.match(css, /\.focus\[data-environment="glass-fold"\][^{]*::before\s*\{[^}]*background:\s*rgba\(6,8,30,\.7\)/);
  assert.equal(getFocusEnvironment("zenitho").theme["--bt-focus-env-stage-text"], "#1C1027");
});

test("Zenitho alone overrides study fill/glow, keeps structural goal/paused markers and uses a lightweight real preview", () => {
  const css = readFileSync(new URL("../components/focus/FocusEnvironments.module.css", import.meta.url), "utf8");
  const blocks = css.match(/\.focus\[data-environment="zenitho"\] :global\(\.bt-blocks\.is-focus\) \{([^}]+)\}/)[1];
  assert.match(blocks, /--bt-progress-fill: var\(--bt-focus-env-block-fill\)/);
  assert.match(blocks, /--bt-progress-rgb: var\(--bt-focus-env-block-rgb\)/);
  assert.match(blocks, /--bt-block-slot-bg:/);
  assert.match(blocks, /--bt-block-slot-edge:/);
  assert.match(blocks, /--bt-block-tick:/);
  assert.match(blocks, /--bt-block-tick-halo:/);
  assert.doesNotMatch(blocks, /--bt-block-hold|animation:/);
  assert.equal(getFocusEnvironment("zenitho").theme["--bt-focus-env-block-fill"], "#5144B7");
  assert.match(css, /\.focus\[data-environment="zenitho"\]::after \{ display: none; \}/);
  const asset = new URL("../public/focus-environments/zenitho.jpg", import.meta.url);
  assert.ok(statSync(asset).size < 50000, "the selector does not need a heavy bitmap or live WebGL preview");
  assert.equal(readFileSync(asset).readUInt16BE(0), 0xffd8);
});

function mix(foreground, background, alpha) {
  const rgb = hex => hex.slice(1).match(/../g).map(v => parseInt(v, 16));
  const front = rgb(foreground), back = rgb(background);
  return `#${front.map((value, i) => Math.round(value * alpha + back[i] * (1 - alpha)).toString(16).padStart(2, "0")).join("")}`;
}
function luminance(hex) {
  const c = hex.slice(1).match(/../g).map(v => parseInt(v, 16) / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4);
  return .2126 * c[0] + .7152 * c[1] + .0722 * c[2];
}
function contrast(a, b) { const [light, dark] = [luminance(a), luminance(b)].sort((a, b) => b - a); return (light + .05) / (dark + .05); }
test("Glass Fold uses accessible local light text/cyan primary, secondary, selected and paused pairs", () => {
  const env = getFocusEnvironment("glass-fold");
  for (const tokens of [env.theme, { ...env.theme, ...env.pausedTheme }]) {
    for (const ground of [tokens["--bt-focus-env-panel"], tokens["--bt-focus-env-secondary"], tokens["--bt-focus-env-selected"]]) {
      assert.ok(contrast(tokens["--bt-focus-env-text"], ground) >= 4.5);
      assert.ok(contrast(tokens["--bt-focus-env-muted"], ground) >= 4.5);
    }
    for (const ground of [tokens["--bt-focus-env-action"], tokens["--bt-focus-env-action-hover"]]) assert.ok(contrast(tokens["--bt-focus-env-action-text"], ground) >= 4.5);
    assert.ok(contrast(tokens["--bt-focus-env-ring"], tokens["--bt-focus-env-panel"]) >= 3);
  }
  // Conservative 60% of the actual 70% text-sized backing against even a
  // white edge. No global shader filter or dark central vignette is added.
  assert.ok(contrast(env.theme["--bt-focus-env-muted"], mix("#06081e", "#ffffff", .6)) >= 4.5);
  const css = readFileSync(new URL("../components/focus/FocusEnvironments.module.css", import.meta.url), "utf8");
  const blocks = css.match(/\.focus\[data-environment="glass-fold"\] :global\(\.bt-blocks\.is-focus\) \{([^}]+)\}/)[1];
  assert.match(blocks, /--bt-progress-fill: var\(--bt-focus-env-block-fill\)/);
  assert.match(blocks, /--bt-progress-rgb: var\(--bt-focus-env-block-rgb\)/);
  assert.doesNotMatch(blocks, /--bt-block-hold|animation:/);
  assert.equal(env.theme["--bt-focus-env-block-fill"], "#96D7FF");
  const asset = new URL("../public/focus-environments/glass-fold.jpg", import.meta.url);
  assert.ok(statSync(asset).size < 50000); assert.equal(readFileSync(asset).readUInt16BE(0), 0xffd8);
});
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
  for (const tokens of [theme, pausedTheme]) {
    for (const background of [tokens["--bt-focus-env-action"], tokens["--bt-focus-env-action-hover"]]) {
      assert.ok(contrast(tokens["--bt-focus-env-action-text"], background) >= 4.5);
    }
  }
});
