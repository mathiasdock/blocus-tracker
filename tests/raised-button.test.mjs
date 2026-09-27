import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import colors from '../lib/colorTokens.cjs';

const { light, dark, rgb } = colors;
const read = (file) => fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
function luminance(hex) {
  const c = rgb(hex).map(v => v / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4);
  return c[0] * .2126 + c[1] * .7152 + c[2] * .0722;
}
const contrast = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + .05) / (lo + .05);
};

test('raised variant only uses color tokens', () => {
  const css = read('styles/raised.css');
  assert.equal((css.match(/#[0-9a-f]{3,8}\b/gi) || []).length, 0);
  assert.match(read('pages/_app.js'), /import "\.\.\/styles\/globals\.css";\nimport "\.\.\/styles\/raised\.css";/);
});

test('raised stays reserved to one hero CTA per screen', () => {
  const usage = { 'pages/dashboard.js': 1, 'pages/index.js': 1 };
  for (const [file, count] of Object.entries(usage)) {
    assert.equal((read(file).match(/\bbtn-raised\b(?!-)/g) || []).length, count, file);
  }
  for (const file of ['components/SeoLandingPage.js', 'pages/signup.js', 'pages/onboarding.js', 'pages/messages.js']) {
    assert.doesNotMatch(read(file), /\bbtn-raised\b/, file);
  }
});

test('raised faces keep readable text in both themes, hover included', () => {
  for (const overrides of [{}, dark]) {
    const t = { ...light, ...overrides };
    for (const [fg, bg] of [
      ['--bt-on-brand', '--bt-brand-primary'], ['--bt-on-brand', '--bt-brand-light'],
      ['--bt-on-action', '--bt-action'], ['--bt-on-action', '--bt-action-hover'],
    ]) assert.ok(contrast(t[fg], t[bg]) >= 4.5, `${fg} on ${bg}`);
  }
});
