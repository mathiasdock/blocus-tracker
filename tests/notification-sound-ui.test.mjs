import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import * as center from "../lib/notificationCenter.mjs";
import { createNotificationSoundTracker } from "../lib/notificationSounds.mjs";

const require = createRequire(import.meta.url);
const React = require("react");
const { act, create } = require("react-test-renderer");
const { transformSync } = require("@babel/core");

async function setup() {
  const timers = new Map(), sounds = [], reads = [], listeners = {};
  let timer = 0, realtime, state, renderer;
  const user = { id: "member" }, router = { pathname: "/dashboard", push() {} };
  const document = { hidden: false, addEventListener() {}, removeEventListener() {} };
  let summary = { feed: 0, friends: 0, messages: 0, rooms: [], groups: [], bell: 0 };
  let items = [];
  const channel = { on(event, filter, handler) { realtime = handler; return channel; }, subscribe() { return channel; } };
  const mocks = {
    "next/router": { useRouter: () => router },
    "../lib/supabaseClient": { supabase: { channel: () => channel, removeChannel() {}, rpc() {} } },
    "./AuthContext": { useAuth: () => ({ user }) },
    "../lib/sensoryFeedback": { playSensoryCue: cue => sounds.push(cue) },
    "../lib/notificationSounds.mjs": { createNotificationSoundTracker },
    "../lib/notificationCenter.mjs": { ...center,
      fetchSummary: async () => summary,
      fetchInbox: async () => { reads.push("inbox"); return { items, unread: summary.bell, hasMore: false }; },
    },
  };
  const module = { exports: {} };
  const { code } = transformSync(readFileSync(new URL("../contexts/NotificationContext.js", import.meta.url), "utf8"), {
    filename: "NotificationContext.js", babelrc: false, configFile: false,
    presets: [[require.resolve("next/babel"), { "preset-react": { runtime: "automatic" } }]],
    plugins: [require.resolve("@babel/plugin-transform-modules-commonjs")],
  });
  vm.runInNewContext(code, { module, exports: module.exports, require: id => id in mocks ? mocks[id] : require(id),
    window: { addEventListener(name, cb) { listeners[name] = cb; }, removeEventListener() {} }, document,
    localStorage: { length: 0, getItem: () => null, setItem() {}, removeItem() {} }, navigator: {}, console,
    setTimeout: (fn, ms) => { timers.set(++timer, { fn, ms }); return timer; }, clearTimeout: id => timers.delete(id) });
  const { NotificationProvider, useNotifications } = module.exports;
  const Consumer = () => { state = useNotifications(); return null; };
  const render = () => React.createElement(NotificationProvider, null, React.createElement(Consumer));
  await act(async () => { renderer = create(render()); });
  return { sounds, reads, router, document,
    async poll(nextItems, bell, messages = 0) {
      items = nextItems; summary = { ...summary, bell, messages };
      await act(async () => {
        state.refreshNotifications();
        for (const [id, t] of timers) if (t.ms === 100) { timers.delete(id); t.fn(); }
      });
    },
    async message(row) { await act(async () => realtime({ new: row })); },
    async route(pathname) { router.pathname = pathname; await act(async () => renderer.update(render())); },
    close() { act(() => renderer.unmount()); },
  };
}
const item = (kind, atMs, extra = {}) => ({ kind, key: `${kind}:a`, atMs, read: false, ...extra });

test("real notification provider filters reactions and deduplicates immediate DM against the inbox", async () => {
  const s = await setup();
  try {
    assert.deepEqual(s.sounds, []);
    assert.equal(s.reads.length, 1); // Initial silent baseline.
    await s.poll([item("reaction", 1)], 1);
    assert.deepEqual(s.sounds, []);
    const created_at = "2026-10-06T12:00:00Z";
    await s.message({ sender_id: "sender", created_at });
    assert.deepEqual(s.sounds, ["notification"]);
    await s.poll([item("private_message", Date.parse(created_at), { key: "private_message:sender" }), item("reaction", 1)], 2, 1);
    assert.deepEqual(s.sounds, ["notification"]);
    await s.message({ sender_id: "sender", created_at });
    assert.equal(s.sounds.length, 1);
    await s.poll([item("friend_request", Date.parse(created_at) + 1)], 3, 1);
    await s.poll([item("friend_accepted", Date.parse(created_at) + 2)], 4, 1);
    assert.equal(s.sounds.length, 3);
    const before = s.reads.length;
    await s.poll([item("friend_accepted", Date.parse(created_at) + 2)], 4, 1);
    assert.equal(s.reads.length, before); // No extra inbox read on unchanged count.
    assert.equal(s.sounds.length, 3);
  } finally { s.close(); }
});

test("Messages and hidden tabs stay silent without replaying the same event later", async () => {
  const s = await setup();
  try {
    await s.route("/messages");
    const created_at = "2026-10-06T12:00:00Z";
    await s.message({ sender_id: "sender", created_at });
    await s.poll([item("private_message", Date.parse(created_at), { key: "private_message:sender" })], 1, 1);
    assert.deepEqual(s.sounds, []);
    await s.route("/dashboard");
    s.document.hidden = true;
    await s.poll([item("friend_request", Date.parse(created_at) + 1)], 2, 1);
    s.document.hidden = false;
    await s.poll([item("friend_request", Date.parse(created_at) + 1)], 2, 1);
    assert.deepEqual(s.sounds, []);
  } finally { s.close(); }
});
