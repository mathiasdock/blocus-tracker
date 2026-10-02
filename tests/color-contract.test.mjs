import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import colors from '../lib/colorTokens.cjs';

const { brand, light, dark, rgb, focusColors, renderColorCSS } = colors;
const root = new URL('../', import.meta.url);
const read = (file) => fs.readFileSync(new URL(file, root), 'utf8');
function luminance(hex) {
  const c = rgb(hex).map(v => v / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4);
  return c[0] * .2126 + c[1] * .7152 + c[2] * .0722;
}
function contrast(a, b) {
  const values = [luminance(a), luminance(b)].sort((a, b) => b - a);
  return (values[0] + .05) / (values[1] + .05);
}
test('official palette and generated CSS/identity sources have one authority', () => {
  assert.deepEqual(Object.values(brand), ['#D8F3DC','#B7E4C7','#95D5B2','#74C69D','#52B788','#40916C','#2D6A4F','#1B4332','#081C15']);
  assert.equal(read('styles/colors.css'), renderColorCSS());
  const manifest = JSON.parse(read('public/manifest.json'));
  assert.equal(manifest.theme_color, brand.primary);
  assert.equal(manifest.background_color, brand.primary);
  assert.ok(manifest.icons.every(icon => icon.src.endsWith(`?v=${colors.assetVersion}`)));
  assert.match(read('public/app-icon.svg'), new RegExp(`fill="${brand.primary}" data-brand-color="primary"`));
  assert.equal((read('tailwind.config.js').match(/#[0-9a-f]{3,8}\b/gi) || []).length, 0);
});
test('essential text pairs meet 4.5:1 in both themes', () => {
  for (const [mode, overrides] of Object.entries({ light: {}, dark })) {
    const t = { ...light, ...overrides };
    for (const [fg, bg] of [
      ['--bt-on-brand','--bt-brand-primary'], ['--bt-on-brand','--bt-brand-hover'],
      ['--bt-on-action','--bt-action'], ['--bt-on-action','--bt-action-hover'],
      ['--bt-brand-text','--bt-surface'], ['--bt-brand-text','--bt-brand-surface'],
      ['--bt-selected-text','--bt-selected-bg'], ['--bt-success','--bt-success-bg'],
      ['--bt-message-own-text','--bt-message-own-bg'], ['--bt-message-own-muted','--bt-message-own-bg'],
      ['--bt-text-1','--bt-message-other-bg'],
      ['--bt-level-text','--bt-level-bg'], ['--bt-ink-text','--bt-ink-soft'], ['--bt-ink-muted','--bt-ink-soft'],
      ['--bt-text-2','--bt-surface'], ['--bt-text-3','--bt-bg'],
      ['--bt-data-text','--bt-data-surface'],
    ]) assert.ok(contrast(t[fg], t[bg]) >= 4.5, `${mode}: ${fg} on ${bg}`);
  }
});
test('focus and data marks meet non-text contrast on their actual surfaces', () => {
  for (const overrides of [{}, dark]) {
    const t = { ...light, ...overrides };
    for (const bg of ['--bt-bg','--bt-surface','--bt-brand-surface']) {
      assert.ok(contrast(t['--bt-focus-ring'], t[bg]) >= 3, bg);
    }
    assert.ok(contrast(t['--bt-data-study'], t['--bt-surface']) >= 3);
  }
  assert.ok(contrast(light['--bt-focus-on-ink'], brand.deep) >= 3);
  assert.ok(contrast(light['--bt-focus-on-ink'], brand.deepest) >= 3);
});
test('semantic data/status/progress/message values do not alias brand colors', () => {
  for (const t of [light, dark]) for (const [key, value] of Object.entries(t)) {
    if (/^--bt-(success|status|progress|data|heatmap|message|selected|level)/.test(key)) {
      assert.doesNotMatch(value, /var\(--bt-(brand|accent|action|mint)/, key);
    }
  }
});
test('hero and focus keep deliberate scopes; pause/artwork are not migrated', () => {
  const css = read('styles/globals.css');
  assert.match(css, /\.btn-hero\s*\{/);
  assert.doesNotMatch(css, /\.bt-dashboard-grid\s+\.btn-primary/);
  assert.match(css, /html body :focus-visible/);
  assert.deepEqual(focusColors, [brand.deepest, brand.deep, brand.hover, brand.light, brand.border]);
  assert.equal(light['--bt-pause-strong'], '#DC2626');
  assert.equal(light['--bt-danger'], '#B83E3E');
  assert.match(read('lib/courseColors.js'), /#10b981/);
  assert.match(read('components/Mascot.js'), /const GREEN = brand.primary/);
});

// Deliberate exceptions: character/achievement artwork and real course hues.
// Historical prose and raster screenshots are documented, not live CSS sources.
const allowed = new Set(['components/Mascot.js', 'lib/courseColors.js', 'lib/universities.js']);
const oldHex = /#(?:14b885|0e8f68|087454|0b2e23|114134|eafbf4|c6eed9|2bd9a4|5de0b5|22e4a4|0ea571|0fa173|10a878|082b21|065f46|06694d|f2fbf7|8fd4b8|ecfaf4|7fc7ab|0d2b22|15231e|193128|0f3a2c|0a2a20|0b1f19|071c15|0e2a20|0f2a21|f1fbf6|e2f7ed|54d3a9|20c996|123d31|9fd7c1|061f18|12352d|0a3327|071d17)\b/gi;
const oldRGB = /rgba?\(\s*(?:20\s*,\s*184\s*,\s*133|8\s*,\s*116\s*,\s*84|143\s*,\s*212\s*,\s*184|43\s*,\s*217\s*,\s*164|159\s*,\s*215\s*,\s*193)\s*[,)]/gi;
function files(dir) {
  return fs.readdirSync(new URL(dir, root), { withFileTypes: true }).flatMap(entry => {
    const file = path.posix.join(dir, entry.name);
    return entry.isDirectory() ? files(file) : /\.(?:js|jsx|cjs|mjs|css|svg|html|json)$/.test(file) ? [file] : [];
  });
}
test('no retired brand literal survives in executable/UI sources outside the whitelist', () => {
  const offenders = [];
  for (const file of ['pages','components','styles','lib','scripts'].flatMap(files)) {
    if (allowed.has(file)) continue;
    const matches = [...read(file).matchAll(oldHex), ...read(file).matchAll(oldRGB)];
    if (matches.length) offenders.push(`${file}: ${matches.map(m => m[0]).join(', ')}`);
  }
  assert.deepEqual(offenders, []);
});
