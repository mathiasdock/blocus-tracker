import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import * as preferences from "../lib/focusPreferences.mjs";

const require = createRequire(import.meta.url);
const React = require("react");
const { act, create } = require("react-test-renderer");
const { transformSync } = require("@babel/core");
const source = readFileSync(new URL("../hooks/useFocusEnvironment.js", import.meta.url), "utf8");
const { code } = transformSync(source, { babelrc: false, configFile: false,
  plugins: [require.resolve("@babel/plugin-transform-modules-commonjs")] });
const server = (equipped_id = "forest", highest_level = 1) => ({ data: [{ equipped_id, highest_level }], error: null });
const deferred = () => {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
};
function target() {
  const listeners = new Map();
  return {
    listeners,
    addEventListener(name, fn) { if (!listeners.has(name)) listeners.set(name, new Set()); listeners.get(name).add(fn); },
    removeEventListener(name, fn) { listeners.get(name)?.delete(fn); },
    dispatchEvent(event) { for (const fn of [...(listeners.get(event.type) || [])]) fn(event); },
  };
}

function setup({ userId = "account-a", reply = () => server() } = {}) {
  const env = { user: userId ? { id: userId } : null, calls: [], reply, localReads: 0 };
  const win = target();
  const doc = { ...target(), visibilityState: "visible" };
  const client = { rpc: (...args) => { env.calls.push(args); return env.reply(...args); } };
  const fixtureModule = { exports: {} };
  class CustomEvent { constructor(type, opts = {}) { this.type = type; this.detail = opts.detail; } }
  vm.runInNewContext(code, { module: fixtureModule, exports: fixtureModule.exports, console, window: win, document: doc, CustomEvent,
    localStorage: { getItem: () => { env.localReads += 1; throw Error("local claims must not be read"); } },
    require: id => {
      if (id === "react") return React;
      if (id === "../contexts/AuthContext") return { useAuth: () => ({ user: env.user }) };
      if (id === "../lib/supabaseClient") return { supabase: client };
      if (id === "../lib/focusPreferences.mjs") return preferences;
      throw Error(`unexpected import ${id}`);
    },
  });
  env.window = win; env.document = doc; env.client = client; env.values = [];
  env.mount = (copies = 1) => {
    function Probe({ index }) { env.values[index] = fixtureModule.exports.useFocusEnvironment(); return null; }
    const tree = () => React.createElement(React.Fragment, null, Array.from({ length: copies }, (_, index) => React.createElement(Probe, { key: index, index })));
    act(() => { env.renderer = create(tree()); });
    env.rerender = () => act(() => env.renderer.update(tree()));
    env.close = () => act(() => env.renderer.unmount());
  };
  env.fire = (where, type, detail) => act(() => env[where].dispatchEvent({ type, detail }));
  return env;
}
async function flush() { await act(async () => { for (let i = 0; i < 5; i += 1) await Promise.resolve(); }); }
async function call(env, method, ...args) {
  let result;
  await act(async () => { result = await env.values[0][method](...args); });
  return result;
}

test("guest remains in Forest without RPCs or local unlock claims", async () => {
  const env = setup({ userId: null }); env.mount(); await flush();
  assert.equal(env.values[0].environmentId, "forest"); assert.equal(env.values[0].highestLevel, 1);
  assert.equal(await call(env, "equip", "gradient-wave"), false);
  assert.equal(env.calls.length, 0); assert.equal(env.localReads, 0); env.close();
});

test("multiple consumers and immediate openings share one server read", async () => {
  const pending = deferred(); const env = setup({ reply: () => pending.promise }); env.mount(3);
  assert.equal(env.calls.length, 1); assert.equal(env.values[0].loading, true);
  pending.resolve(server("forest", 5)); await flush();
  assert.ok(env.values.every(value => value.highestLevel === 5 && value.environmentId === "forest"));
  await call(env, "refresh"); env.fire("window", "focus"); env.fire("document", "visibilitychange"); await flush();
  assert.equal(env.calls.length, 1); env.close();
});

test("foreground read is bounded, hidden tabs stay quiet, XP changes force revalidation", async () => {
  const env = setup(); env.mount(); await flush();
  env.document.visibilityState = "hidden";
  env.fire("window", "focus"); env.fire("document", "visibilitychange"); await flush();
  assert.equal(env.calls.length, 1);
  env.reply = () => server("forest", 5);
  env.fire("window", "bt-xp-changed"); await flush();
  assert.equal(env.calls.length, 2); assert.equal(env.values[0].highestLevel, 5);
  env.document.visibilityState = "visible"; env.fire("document", "visibilitychange"); await flush();
  assert.equal(env.calls.length, 2);
  const realNow = Date.now; const later = realNow() + 10_001;
  try {
    Date.now = () => later;
    env.reply = () => server("gradient-wave", 5);
    env.fire("window", "focus"); await flush();
    assert.equal(env.calls.length, 3); assert.equal(env.values[0].environmentId, "gradient-wave");
  } finally { Date.now = realNow; env.close(); }
});

test("account change resets immediately and late reads cannot overwrite the new account", async () => {
  const a = deferred(); const b = deferred(); const env = setup({ reply: () => env.calls.length === 1 ? a.promise : b.promise });
  env.mount(); const old = env.values[0];
  env.user = { id: "account-b" }; env.rerender();
  assert.equal(env.values[0].environmentId, "forest"); assert.equal(env.values[0].highestLevel, 1);
  b.resolve(server("gradient-wave", 5)); await flush();
  a.resolve(server("gradient-wave", 20)); await flush();
  assert.equal(env.values[0].highestLevel, 5); assert.equal(env.values[0].environmentId, "gradient-wave");
  assert.equal(await old.equip("gradient-wave"), false); assert.equal(env.calls.length, 2); env.close();
});

test("equip locks concurrent saves and waits for confirmed success", async () => {
  const pending = deferred(); const env = setup({ reply: name => name === "get_my_focus_environment" ? server("forest", 5) : pending.promise });
  env.mount(); await flush(); let saving;
  act(() => { saving = env.values[0].equip("gradient-wave"); });
  assert.equal(env.values[0].saving, true); assert.equal(env.values[0].environmentId, "forest");
  assert.equal(await call(env, "equip", "forest"), false); assert.equal(env.calls.length, 2);
  pending.resolve(server("gradient-wave", 5)); await act(async () => assert.equal(await saving, true));
  assert.equal(env.values[0].environmentId, "gradient-wave"); assert.equal(env.values[0].saving, false); env.close();
});

test("a late save cannot overwrite a new account's choice", async () => {
  const pending = deferred();
  const env = setup({ reply: name => name === "get_my_focus_environment" ? server() : pending.promise });
  env.mount(); await flush(); let saving;
  act(() => { saving = env.values[0].equip("gradient-wave"); });
  env.user = { id: "account-b" }; env.rerender(); await flush();
  pending.resolve(server("gradient-wave", 5)); await act(async () => assert.equal(await saving, false));
  assert.equal(env.values[0].environmentId, "forest"); assert.equal(env.values[0].highestLevel, 1);
  assert.equal(env.values[0].saving, false); env.close();
});

test("account change at the RPC boundary rejects the mutation for both accounts", async () => {
  let owner = "account-a";
  const saved = { "account-a": "forest", "account-b": "forest" };
  const env = setup({ reply: (name, params) => {
    if (name === "get_my_focus_environment") return server(saved[owner], 5);
    owner = "account-b";
    env.user = { id: owner }; env.rerender();
    if (params.p_expected_user_id !== owner) return { error: { code: "42501", hint: "focus_auth_required" } };
    saved[owner] = params.p_environment_id;
    return server(saved[owner], 5);
  } });
  env.client.auth = { getSession: async () => ({ data: { session: { user: { id: owner } } }, error: null }) };
  env.mount(); await flush();
  assert.equal(await call(env, "equip", "gradient-wave"), false);
  await flush();
  assert.deepEqual(saved, { "account-a": "forest", "account-b": "forest" });
  assert.equal(env.values[0].environmentId, "forest");
  assert.equal(env.values[0].saving, false);
  assert.deepEqual(env.calls.find(([name]) => name === "equip_focus_environment")[1], { p_environment_id: "gradient-wave", p_expected_user_id: "account-a" });
  env.close();
});

test("failed save preserves choice and retry repeats the failed operation", async () => {
  let failures = 1;
  const env = setup({ reply: name => name === "get_my_focus_environment" ? server("forest", 5)
    : failures-- > 0 ? Promise.reject(Error("private network diagnostic")) : server("gradient-wave", 5) });
  env.mount(); await flush();
  assert.equal(await call(env, "equip", "gradient-wave"), false);
  assert.equal(env.values[0].environmentId, "forest"); assert.equal(env.values[0].error, "focus_save_failed");
  assert.equal(await call(env, "retry"), true);
  assert.equal(env.values[0].environmentId, "gradient-wave"); assert.equal(env.values[0].error, null);
  assert.equal(env.calls.at(-1)[1].p_environment_id, "gradient-wave"); env.close();
});

test("equip supersedes late reads and updates other consumers from a server snapshot", async () => {
  const pending = deferred(); const env = setup({ reply: name => name === "get_my_focus_environment" ? pending.promise : server("gradient-wave", 5) });
  env.mount(2);
  assert.equal(await call(env, "equip", "gradient-wave"), true); await flush();
  assert.ok(env.values.every(value => value.environmentId === "gradient-wave"));
  pending.resolve(server()); await flush();
  assert.ok(env.values.every(value => value.environmentId === "gradient-wave"));
  await call(env, "refresh"); assert.equal(env.calls.length, 2); env.close();
});

test("missing migration falls back to Forest and retry can recover", async () => {
  const env = setup({ reply: () => ({ data: null, error: { code: "PGRST202" } }) }); env.mount(); await flush();
  assert.equal(env.values[0].environmentId, "forest"); assert.equal(env.values[0].highestLevel, 1);
  assert.equal(env.values[0].error, "focus_unavailable"); assert.equal(env.values[0].loading, false);
  env.reply = () => server("forest", 5);
  assert.equal(await call(env, "retry"), true); assert.equal(env.values[0].highestLevel, 5); env.close();
});

test("logout removes all foreground listeners and stale responses", async () => {
  const pending = deferred(); const env = setup({ reply: () => pending.promise }); env.mount();
  env.user = null; env.rerender();
  pending.resolve(server("gradient-wave", 30)); await flush();
  assert.equal(env.values[0].environmentId, "forest"); assert.equal(env.values[0].highestLevel, 1);
  assert.ok([...env.window.listeners.values()].every(listeners => listeners.size === 0));
  assert.ok([...env.document.listeners.values()].every(listeners => listeners.size === 0)); env.close();
});
