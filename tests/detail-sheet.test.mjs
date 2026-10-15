import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const require = createRequire(import.meta.url);
const React = require("react");
const { act, create } = require("react-test-renderer");
const { renderToString } = require("react-dom/server");
const { transformSync } = require("@babel/core");
function compile(path, globals, mocks = {}) {
  const module = { exports: {} };
  const { code } = transformSync(readFileSync(new URL(path, import.meta.url), "utf8"), {
    filename: path, babelrc: false, configFile: false,
    presets: [[require.resolve("next/babel"), { "preset-react": { runtime: "automatic" } }]],
    plugins: [require.resolve("@babel/plugin-transform-modules-commonjs")],
  });
  vm.runInNewContext(code, { module, exports: module.exports,
    require: id => id in mocks ? mocks[id] : require(id), ...globals });
  return module.exports.default;
}

function harness({ reduced = false } = {}) {
  const calls = { show: 0, close: 0, request: 0, after: 0, restore: 0, initial: 0 };
  const timers = new Map(); let nextTimer = 0, renderer;
  const document = { activeElement: null, body: {} };
  const opener = { isConnected: true, focus: () => { calls.restore++; document.activeElement = opener; } };
  const close = { focus: () => { calls.initial++; document.activeElement = close; } };
  const dialog = {
    open: false,
    showModal() { calls.show++; dialog.open = true; document.activeElement = close; },
    close() { calls.close++; dialog.open = false; },
    contains: node => node === close || nodes.includes(node),
    querySelectorAll: () => nodes,
  };
  let nodes = [close];
  document.activeElement = opener;
  const window = {
    matchMedia: () => ({ matches: reduced }),
    setTimeout(fn) { timers.set(++nextTimer, fn); return nextTimer; },
    clearTimeout(id) { timers.delete(id); },
  };
  const globals = { window, document, getComputedStyle: node => ({ visibility: node.visibility || "visible" }) };
  const presence = compile("../components/useExitPresence.js", globals);
  const Sheet = compile("../components/DetailSheet.js", globals, {
    "./useExitPresence": presence,
    "./Glyph": () => null,
    "./DetailSheet.module.css": { modal: "detail-modal" },
  });
  const props = { open: false, title: "Preferences", closeLabel: "Close", onClose: () => calls.request++, onAfterClose: () => calls.after++,
    children: React.createElement("input", { name: "content" }) };
  const h = {
    calls, timers, dialog, document, opener, close, Sheet,
    render(next = {}) {
      Object.assign(props, next);
      act(() => {
        const element = React.createElement(Sheet, props);
        if (renderer) renderer.update(element);
        else renderer = create(element, { createNodeMock: element => element.type === "dialog" ? dialog : element.type === "button" ? close : {} });
      });
      return renderer.toJSON();
    },
    flush() { const pending = [...timers.values()]; timers.clear(); act(() => pending.forEach(fn => fn())); },
    cancel(target = dialog) {
      let prevented = false;
      act(() => renderer.root.findByType("dialog").props.onCancel({ target, currentTarget: dialog, preventDefault: () => { prevented = true; } }));
      return prevented;
    },
    click() { act(() => renderer.root.findByType("button").props.onClick()); },
    root: () => renderer.root,
    unmount() { act(() => renderer?.unmount()); },
    nodes: list => { nodes = list; },
  };
  return h;
}

test("closed sheet has no modal, focus change or after-close callback", () => {
  const h = harness();
  assert.equal(h.render(), null);
  assert.deepEqual(h.calls, { show: 0, close: 0, request: 0, after: 0, restore: 0, initial: 0 });
  h.unmount();
});

test("opens a native modal and focuses Close, without restarting on title/callback updates", () => {
  const h = harness();
  const tree = h.render({ open: true });
  assert.equal(tree.type, "dialog");
  assert.equal(tree.props["aria-label"], "Preferences");
  assert.equal(tree.props["aria-modal"], "true");
  assert.equal(h.document.activeElement, h.close);
  h.render({ title: "Préférences", onClose: () => {} });
  assert.equal(h.calls.show, 1); assert.equal(h.calls.initial, 1);
  assert.equal(h.calls.restore, 0);
  h.unmount();
});

test("native cancel prevents browser immediate close and requests the consumer once", () => {
  const h = harness(); h.render({ open: true });
  assert.equal(h.cancel(), true); assert.equal(h.calls.request, 1);
  assert.equal(h.dialog.open, true);
  assert.equal(h.cancel({ nestedDialog: true }), false);
  assert.equal(h.calls.request, 1);
  h.unmount();
});

test("exit retains native modality/content until the existing 150ms presence expires", () => {
  const h = harness(); h.render({ open: true }); h.click();
  const tree = h.render({ open: false, title: "Gone", children: null });
  assert.equal(tree.props["aria-label"], "Preferences");
  assert.equal(h.root().findAllByType("input").length, 1);
  assert.equal(h.dialog.open, true); assert.equal(h.timers.size, 1);
  h.click(); h.cancel(); assert.equal(h.calls.request, 1);
  h.flush();
  assert.equal(h.dialog.open, false); assert.equal(h.calls.close, 1);
  assert.equal(h.calls.restore, 1); assert.equal(h.document.activeElement, h.opener);
  assert.equal(h.calls.after, 1);
  h.render(); assert.equal(h.calls.after, 1);
  h.unmount();
});

test("reopening during exit cancels the old timeout without closing/refocusing/reopening", () => {
  const h = harness(); h.render({ open: true }); h.render({ open: false });
  assert.equal(h.timers.size, 1);
  h.render({ open: true });
  assert.equal(h.timers.size, 0); assert.equal(h.dialog.open, true);
  assert.equal(h.calls.show, 1); assert.equal(h.calls.restore, 0); assert.equal(h.calls.after, 0);
  h.render({ open: false }); h.flush();
  assert.equal(h.calls.close, 1); h.unmount();
});

test("reduced motion releases focus and native modality immediately", () => {
  const h = harness({ reduced: true }); h.render({ open: true });
  assert.equal(h.render({ open: false }), null);
  assert.equal(h.dialog.open, false); assert.equal(h.timers.size, 0);
  assert.equal(h.calls.restore, 1); assert.equal(h.calls.after, 1);
  h.unmount();
});

test("unmount during opening/exit closes the captured node and does not run a handoff", () => {
  for (const exiting of [false, true]) {
    const h = harness(); h.render({ open: true });
    if (exiting) h.render({ open: false });
    h.unmount();
    assert.equal(h.dialog.open, false); assert.equal(h.calls.close, 1);
    assert.equal(h.calls.restore, 1); assert.equal(h.calls.after, 0); assert.equal(h.timers.size, 0);
  }
});

test("a removed opener is never focused on close", () => {
  const h = harness(); h.render({ open: true }); h.opener.isConnected = false;
  h.render({ open: false }); h.flush();
  assert.equal(h.calls.restore, 0); h.unmount();
});

test("restores the opener when DOM removal has already moved focus to body", () => {
  const h = harness(); h.render({ open: true });
  h.document.activeElement = h.document.body;
  h.render({ open: false }); h.flush();
  assert.equal(h.calls.restore, 1); assert.equal(h.document.activeElement, h.opener);
  h.unmount();
});

test("closing does not steal focus from another dialog", () => {
  const h = harness(); h.render({ open: true });
  const other = {}; h.document.activeElement = other;
  h.render({ open: false }); h.flush();
  assert.equal(h.calls.restore, 0); assert.equal(h.document.activeElement, other);
  h.unmount();
});

test("a busy consumer can refuse close then accept a subsequent request", () => {
  const h = harness(); let busy = true, accepted = 0;
  h.render({ open: true, onClose: () => { if (!busy) accepted++; } });
  h.cancel(); assert.equal(accepted, 0);
  busy = false; h.cancel(); assert.equal(accepted, 1); h.unmount();
});

test("Tab boundaries wrap inside the sheet and skip hidden, inert and negative-tabindex elements", () => {
  const h = harness(); h.render({ open: true });
  const node = (options = {}) => ({ tabIndex: 0, getClientRects: () => [1], closest: () => null,
    focus() { h.document.activeElement = this; }, ...options });
  const first = node(), last = node();
  h.nodes([first, node({ tabIndex: -1 }), node({ disabled: true }), node({ visibility: "hidden" }), node({ getClientRects: () => [] }), node({ closest: () => ({ inert: true }) }), last]);
  const key = (active, shiftKey) => {
    h.document.activeElement = active; let prevented = false;
    h.root().findByType("dialog").props.onKeyDown({ key: "Tab", shiftKey, target: { closest: () => h.dialog },
      preventDefault: () => { prevented = true; } });
    return prevented;
  };
  assert.equal(key(last, false), true); assert.equal(h.document.activeElement, first);
  assert.equal(key(first, true), true); assert.equal(h.document.activeElement, last);
  assert.equal(key(first, false), false);
  h.unmount();
});

test("a nested native dialog or prevented Tab is not handled by the parent", () => {
  const h = harness(); h.render({ open: true });
  for (const event of [{ key: "Tab", target: { closest: () => ({}) } }, { key: "Tab", defaultPrevented: true }]) {
    h.root().findByType("dialog").props.onKeyDown({ ...event, preventDefault: () => assert.fail("parent cannot consume this key") });
  }
  h.unmount();
});

test("sheet SSR is deterministic and does not call browser APIs", () => {
  const presence = compile("../components/useExitPresence.js", {});
  const Sheet = compile("../components/DetailSheet.js", {}, { "./useExitPresence": presence, "./Glyph": () => null, "./DetailSheet.module.css": { modal: "detail-modal" } });
  const html = renderToString(React.createElement(Sheet, { open: true, title: "Preferences", closeLabel: "Close" }, "Content"));
  assert.match(html, /<dialog/); assert.doesNotMatch(html, /<dialog[^>]* open=/);
  assert.match(html, /Content/);
});
