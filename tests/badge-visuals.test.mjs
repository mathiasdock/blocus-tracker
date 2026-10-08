import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import vm from "node:vm";
import { translate } from "../lib/i18n.js";
import colors from "../lib/colorTokens.cjs";

const require = createRequire(import.meta.url);
const React = require("react");
const { create, act } = require("react-test-renderer");
const { transformSync } = require("@babel/core");
const root = fileURLToPath(new URL("..", import.meta.url));
const cache = new Map();
const css = { __esModule: true, default: new Proxy({}, { get: (_, key) => String(key) }) };
function load(file) {
  const absolute = path.resolve(root, file);
  if (cache.has(absolute)) return cache.get(absolute).exports;
  const module = { exports: {} }; cache.set(absolute, module);
  const source = readFileSync(absolute, "utf8");
  const { code } = transformSync(source, { filename: absolute, babelrc: false, configFile: false,
    presets: [[require.resolve("next/babel"), { "preset-react": { runtime: "automatic" } }]],
    plugins: [require.resolve("@babel/plugin-transform-modules-commonjs")] });
  const localRequire = id => {
    if (id.endsWith(".module.css")) return css;
    if (id === "./InboxSheet") return ({ children, open, title, closeLabel, onClose }) => open ? React.createElement("div", { role: "dialog", "aria-label": title },
      React.createElement("button", { "aria-label": closeLabel, onClick: onClose }), children) : null;
    if (/contexts\/|supabaseClient/.test(id)) return {};
    if (id === "../components/Layout" || id === "../components/PageHeader" || id === "../components/AnimatedNumber") return () => null;
    if (!id.startsWith(".")) return require(id);
    let resolved = path.resolve(path.dirname(absolute), id);
    if (!path.extname(resolved)) resolved += resolved.endsWith("BadgeIcon") ? ".jsx" : ".js";
    if (resolved.endsWith(".cjs")) return require(resolved);
    return load(path.relative(root, resolved));
  };
  vm.runInNewContext(code, { module, exports: module.exports, require: localRequire });
  return module.exports;
}
const { BADGES } = load("lib/badges.js");
const { artFor, rarityOf, BADGE_ART, HUES } = load("lib/badgeArt.js");
const { groupBadges } = load("lib/badgeGroups.js");
const BadgeIcon = load("components/BadgeIcon.jsx").default;
const BadgeSheet = load("components/BadgeSheet.js").default;
const { BadgeGroup } = load("pages/badges.js");
const text = node => typeof node === "string" ? node : (node?.children || []).map(text).join(" ");
function render(Component, props) { let view; act(() => { view = create(React.createElement(Component, props)); }); return view; }

test("every canonical badge has distinct semantic artwork; rules and tier XP stay canonical", () => {
  assert.equal(new Set(BADGES.map(b => BADGE_ART[b.id])).size, 30);
  for (const b of BADGES) {
    assert.ok(artFor(b.id).length > 0, b.id);
    assert.equal(b.xp, { discovery: 50, common: 125, rare: 300, epic: 600, legendary: 1200 }[rarityOf(b.id)]);
  }
  assert.equal(new Set(["streak_3", "streak_7", "streak_14", "streak_30"].map(id => JSON.stringify(artFor(id)))).size, 4);
});

test("all five tiers have a structural finish; earned/locked shapes stay identical", () => {
  for (const id of ["first_session", "hours_10", "streak_7", "streak_14", "streak_30"]) {
    const earned = render(BadgeIcon, { id, earned: true, size: 72 });
    const locked = render(BadgeIcon, { id, earned: false, size: 72 });
    const getMotif = view => view.root.findAllByType("g").find(g => g.props.transform === "translate(8 5)");
    const geometry = view => getMotif(view).findAll(n => ["path", "polygon", "rect", "circle", "ellipse"].includes(n.type))
      .map(n => [n.type, n.props.d, n.props.points, n.props.x, n.props.y, n.props.cx, n.props.cy]);
    assert.deepEqual(geometry(earned), geometry(locked));
    const finishes = earned.root.findAll(n => Boolean(n.props["data-badge-finish"]));
    assert.equal(finishes.length, rarityOf(id) === "discovery" ? 0 : 1);
    if (finishes.length) assert.equal(finishes[0].props["data-badge-finish"], rarityOf(id));
    assert.ok(locked.root.findAllByType("stop").every(n => n.props.stopColor.startsWith("var(--badge-muted-")));
    act(() => { earned.unmount(); locked.unmount(); });
  }
});

test("small metadata artwork stays legible; animation only on explicit real-unlock rendering", () => {
  const view = render(BadgeIcon, { id: "streak_30", size: 22 });
  assert.equal(view.root.findByType("svg").props.viewBox, "0 0 48 48");
  assert.equal(view.root.findAll(n => Boolean(n.props["data-badge-finish"])).length, 0);
  assert.ok(!view.root.findByType("span").props.className.includes("badge-shine"));
  act(() => view.update(React.createElement(BadgeIcon, { id: "streak_30", earned: true, animate: true })));
  assert.ok(view.root.findAllByType("span")[0].props.className.includes("badge-shine"));
  act(() => view.unmount());
});

test("rarity mounts and readable metadata hold contrast in both themes", () => {
  const luminance = hex => {
    const c = colors.rgb(hex).map(v => v / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4);
    return c[0] * .2126 + c[1] * .7152 + c[2] * .0722;
  };
  const contrast = (a, b) => {
    const l = [luminance(a), luminance(b)].sort((a, b) => b - a);
    return (l[0] + .05) / (l[1] + .05);
  };
  for (const [theme, material] of [[colors.light, "deep"], [{ ...colors.light, ...colors.dark }, "mid"]]) {
    for (const hue of [HUES.steel, HUES.gold]) assert.ok(contrast(hue[material], theme["--bt-surface"]) >= 3);
    assert.ok(contrast(theme["--bt-text-2"], theme["--bt-surface"]) >= 4.5);
    assert.ok(contrast(theme["--bt-focus-ring"], theme["--bt-surface"]) >= 3);
  }
  const view = render(BadgeIcon, { id: "streak_7", earned: true, size: 72 });
  assert.equal(view.root.find(n => n.props["data-badge-id"] === "streak_7").props.style["--badge-mount-dark"], HUES.steel.mid);
  assert.equal(view.root.find(n => n.props["data-badge-finish"] === "rare").props.stroke, "var(--badge-mount)");
  const styles = readFileSync(path.join(root, "components/BadgeVisuals.module.css"), "utf8");
  assert.match(styles, /:global\(\.dark\) \.icon\s*\{[^}]*--badge-mount: var\(--badge-mount-dark\)/);
  act(() => view.unmount());
});

for (const lang of ["fr", "en"]) {
  const t = key => translate(lang, key);
  test(`collection names, state, tier and actions are accessible (${lang})`, () => {
    const group = groupBadges(BADGES)[0];
    let selected;
    const view = render(BadgeGroup, { group, earnedIds: ["first_session"], onPick: b => { selected = b; }, t });
    const buttons = view.root.findAllByType("button");
    assert.equal(buttons.length, group.items.length);
    for (const b of buttons) {
      assert.equal(b.props["aria-haspopup"], "dialog");
      assert.ok(b.props["aria-label"].includes(t(b.props["data-earned"] ? "badge.earnedLabel" : "badge.locked")));
    }
    assert.ok(text(view.toJSON()).includes(t("badge.first_session")));
    act(() => buttons[0].props.onClick());
    assert.equal(selected.id, "first_session");
    act(() => view.unmount());
  });
  test(`detail retains exact condition, tier, XP and one close action (${lang})`, () => {
    let closed = 0;
    const b = BADGES.find(b => b.id === "streak_7");
    const view = render(BadgeSheet, { badge: b, earned: false, t, onClose: () => closed++ });
    const content = text(view.toJSON());
    assert.ok(content.includes(t(b.descKey)));
    assert.ok(content.includes(t("badge.rarityRare")));
    assert.ok(content.includes("+300 XP"));
    assert.ok(content.includes(t("badge.locked")));
    assert.equal(view.root.findAllByType("button").length, 1);
    assert.equal(view.root.findByType(BadgeIcon).props.animate, undefined);
    act(() => view.root.findByType("button").props.onClick());
    assert.equal(closed, 1);
    act(() => view.unmount());
  });
  test(`earned legacy detail never claims the new rule (${lang})`, () => {
    const view = render(BadgeSheet, { badge: BADGES.find(b => b.id === "streak_3"), earned: true, earnedAt: "2026-09-01T12:00:00Z", t, onClose() {} });
    const content = text(view.toJSON());
    assert.ok(content.includes(t("badge.streak_3.descLegacy")));
    assert.ok(content.includes(t("badge.earnedLabel")));
    assert.ok(!content.includes(t("badge.howToEarn")));
    act(() => view.unmount());
  });
}

test("native modal and local fixture stay scoped; no new permanent glow or nested tiles", () => {
  const sheet = readFileSync(path.join(root, "components/BadgeSheet.js"), "utf8");
  const styles = readFileSync(path.join(root, "components/BadgeVisuals.module.css"), "utf8");
  assert.match(sheet, /<InboxSheet open=\{Boolean\(badge\)\}/);
  assert.doesNotMatch(sheet, /RarityChip|rounded-full|useExitPresence|badge-shine/);
  assert.doesNotMatch(styles, /radial-gradient|animation:|box-shadow:/);
  const fixture = readFileSync(path.join(root, "pages/dev/badges.js"), "utf8");
  assert.match(fixture, /NODE_ENV === "development".*NEXT_PUBLIC_OFFLINE_DEV === "true"/);
  assert.doesNotMatch(fixture, /\.insert\(|\.update\(|localStorage/);
});
