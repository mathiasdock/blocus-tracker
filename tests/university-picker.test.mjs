import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import vm from "node:vm";
import * as universities from "../lib/universities.js";
import { translate } from "../lib/i18n.js";
import * as selection from "../lib/universitySelection.mjs";
import { deriveOnboardingState, ONBOARDING_STEPS } from "../lib/onboarding.mjs";
import { normalizeStudyName } from "../lib/studySpaces.mjs";

const require = createRequire(import.meta.url);
const React = require("react");
const { act, create } = require("react-test-renderer");
const babel = require("@babel/core");
const source = readFileSync(new URL("../components/UniPicker.js", import.meta.url), "utf8");
const { code } = babel.transformSync(source, {
  babelrc: false, configFile: false,
  presets: [[require.resolve("next/dist/compiled/babel/preset-react"), { runtime: "automatic" }]],
  plugins: [require.resolve("@babel/plugin-transform-modules-commonjs")],
});

function mountPicker(t, { lang = "en", initial = "", disabled = false, response = { universities: [] }, failure = false } = {}) {
  let value = initial;
  const changes = [], calls = [], timers = new Map(), listeners = new Map();
  let nextTimer = 0, focuses = 0;
  const module = { exports: {} };
  vm.runInNewContext(code, {
    module, exports: module.exports,
    require: name => {
      if (name === "./Glyph") return ({ children }) => React.createElement("svg", null, children);
      if (name === "../contexts/I18nContext") return { useI18n: () => ({ lang, t: key => translate(lang, key) }) };
      if (name === "../lib/universities") return universities;
      if (name === "../lib/universitySelection.mjs") return selection;
      return require(name);
    },
    document: {
      addEventListener: (name, fn) => listeners.set(name, fn),
      removeEventListener: name => listeners.delete(name),
    },
    AbortController,
    setTimeout: fn => { timers.set(++nextTimer, fn); return nextTimer; },
    clearTimeout: id => timers.delete(id),
    fetch: async (url, options) => {
      calls.push({ url, signal: options.signal });
      if (failure) throw new Error("directory unavailable");
      return { ok: true, json: async () => response };
    },
  }, { filename: "UniPicker.js" });
  const UniPicker = module.exports.default;
  function Harness() {
    const [selected, setSelected] = React.useState(initial);
    return React.createElement(UniPicker, {
      id: "institution", value: selected, disabled,
      onChange: next => { value = next; changes.push(next); setSelected(next); },
    });
  }
  let renderer;
  act(() => { renderer = create(React.createElement(Harness), {
    createNodeMock: node => node.type === "input" ? { focus: () => { focuses += 1; } } : { contains: () => false },
  }); });
  t.after(() => act(() => renderer.unmount()));
  const input = () => renderer.root.findByType("input");
  const button = key => renderer.root.findAllByType("button").find(node => node.children.join("") === translate(lang, key));
  return {
    get value() { return value; }, get focuses() { return focuses; },
    changes, calls, renderer, input, button,
    click: key => act(() => button(key).props.onClick()),
    type: text => act(() => input().props.onChange({ target: { value: text } })),
    key: key => {
      let prevented = false, stopped = false;
      act(() => input().props.onKeyDown({ key, nativeEvent: {}, preventDefault: () => { prevented = true; }, stopPropagation: () => { stopped = true; } }));
      return { prevented, stopped };
    },
    runSearch: async () => act(async () => {
      const callbacks = [...timers.values()]; timers.clear();
      for (const fn of callbacks) await fn();
    }),
  };
}

test("manual names use the existing bounds, international characters and a clean single line", () => {
  for (const name of ["", " ", "A", "--", "x".repeat(181), "Uni\u0000test", "Uni\u200btest"]) {
    assert.equal(selection.institutionNameForSelection(name), null);
  }
  assert.equal(selection.institutionNameForSelection("  Institut   des Arts\n de Lille "), "Institut des Arts de Lille");
  assert.equal(selection.institutionNameForSelection("東京大学"), "東京大学");
  assert.equal(selection.institutionNameForSelection("École d’art & design"), "École d’art & design");
  assert.equal(selection.institutionNameForSelection("x".repeat(180)), "x".repeat(180));
});

test("known names/abbreviations reuse canonical profile identity without collapsing ambiguous countries", () => {
  const known = universities.ALL_UNIVERSITIES;
  assert.equal(selection.institutionNameForSelection("  universite   de liege ", known), "Université de Liège");
  assert.equal(selection.institutionNameForSelection("ucf", known), "University of Central Florida");
  assert.equal(selection.institutionNameForSelection("New College", known), "New College");
  const ambiguous = [{ full: "College · US", name: "College" }, { full: "College · UK", name: "College" }];
  assert.equal(selection.institutionNameForSelection("College", ambiguous), "College");
  assert.equal(selection.institutionNameForSelection("College · UK", ambiguous), "College · UK");
  const merged = selection.mergeInstitutionOptions([{ id: "1", full: "Université de Liège", name: "ULiège" }],
    [{ id: "2", full: "universite de liege", name: "Liège" }, { id: "3", full: "Other · UK", name: "Other" }]);
  assert.deepEqual(merged.map(row => row.id), ["1", "3"]);
});

for (const lang of ["fr", "en"]) {
  test(`${lang}: visible link, manual confirmation, same profile/onboarding contract`, t => {
    const app = mountPicker(t, { lang });
    assert.ok(app.button("signup.uniNotFound"));
    app.click("signup.uniNotFound");
    assert.equal(app.input().props.role, undefined);
    assert.equal(app.input().props.placeholder, translate(lang, "signup.uniCustom"));
    assert.equal(app.focuses, 1);
    app.type("  Northbridge   Student Institute ");
    assert.equal(app.value, ""); // Drafts are not yet saved or usable by parent submit.
    assert.equal(app.key("Enter").prevented, true); // No accidental whole-form submit.
    assert.equal(app.value, "Northbridge Student Institute");
    assert.equal(app.input().props.value, app.value);
    assert.equal(app.input().props.role, "combobox");
    assert.equal(app.input().props["aria-expanded"], false);
    assert.equal(app.calls.length, 0); // Manual entry needs no remote service.
    const profile = { id: "new-user", pseudo: "student", first_name: "Sam", university: app.value, broad_field: "business", study_year: "BAC 1" };
    assert.equal(deriveOnboardingState({ user: { id: "new-user", user_metadata: { onboarding_version: 1 } }, profile, courses: [] }).step, ONBOARDING_STEPS.COURSES);
    assert.equal(universities.universityShortName(app.value), app.value);
    assert.equal(normalizeStudyName(app.value), normalizeStudyName("northbridge student institute"));
    assert.equal(app.changes.filter(name => name === app.value).length, 1);
  });
}

test("invalid manual names do not propagate and expose an associated accessible error", t => {
  const app = mountPicker(t);
  app.click("signup.uniNotFound");
  app.type(" "); app.click("signup.uniConfirm");
  assert.equal(app.value, "");
  assert.equal(app.input().props["aria-invalid"], true);
  assert.match(app.input().props["aria-describedby"], /institution-manual-error/);
  assert.equal(app.renderer.root.findByProps({ role: "alert" }).children[0], translate("en", "signup.uniNameInvalid"));
  app.type("A"); app.key("Enter"); assert.equal(app.value, "");
  app.type("New College"); app.click("signup.uniConfirm"); assert.equal(app.value, "New College");
});

test("manual draft can be cancelled with Back or Escape, preserving the prior profile selection", t => {
  const app = mountPicker(t, { initial: "University of Central Florida" });
  app.click("signup.uniNotFound");
  assert.equal(app.value, "University of Central Florida");
  app.type("Not yet confirmed");
  app.click("signup.backToList");
  assert.equal(app.value, "University of Central Florida");
  app.click("signup.uniNotFound");
  assert.deepEqual(app.key("Escape"), { prevented: true, stopped: true });
  assert.equal(app.value, "University of Central Florida");
  assert.match(app.input().props.value, /University of Central Florida/);
  assert.equal(app.changes.length, 0);
});

test("empty search results still offer manual entry and carry the search text into the draft", async t => {
  const app = mountPicker(t);
  app.type("Northbridge Unlisted Institute"); await app.runSearch();
  assert.equal(app.renderer.root.findAllByProps({ role: "option" }).length, 0);
  assert.ok(app.button("signup.uniNotFound"));
  app.click("signup.uniNotFound");
  assert.equal(app.input().props.value, "Northbridge Unlisted Institute");
  app.click("signup.uniConfirm");
  assert.equal(app.value, "Northbridge Unlisted Institute");
});

test("unavailable worldwide directory leaves curated search and manual entry usable", async t => {
  const app = mountPicker(t, { failure: true });
  app.type("UCF"); await app.runSearch();
  const options = app.renderer.root.findAllByProps({ role: "option" });
  assert.ok(options.some(node => node.children.join("").includes("Central Florida")));
  app.key("ArrowDown"); app.key("Enter");
  assert.equal(app.value, "University of Central Florida");
  app.type("Northbridge Unlisted Institute"); await app.runSearch();
  app.click("signup.uniNotFound"); app.click("signup.uniConfirm");
  assert.equal(app.value, "Northbridge Unlisted Institute");
});

test("opening manual entry aborts in-flight searches and uses a known remote identity", async t => {
  const app = mountPicker(t, { response: { universities: [{ id: "remote", full: "Northbridge Institute", name: "Northbridge" }] } });
  app.type("northbridge institute"); await app.runSearch();
  const signal = app.calls[0].signal;
  app.click("signup.uniNotFound");
  assert.equal(signal.aborted, true);
  app.click("signup.uniConfirm");
  assert.equal(app.value, "Northbridge Institute");
});

test("disabled picker disables both the search and manual-entry action", t => {
  const app = mountPicker(t, { disabled: true });
  assert.equal(app.input().props.disabled, true);
  assert.equal(app.button("signup.uniNotFound").props.disabled, true);
});
