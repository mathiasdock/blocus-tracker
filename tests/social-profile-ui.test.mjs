import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { translate } from "../lib/i18n.js";

const require = createRequire(import.meta.url);
const React = require("react");
const { act, create } = require("react-test-renderer");
const { transformSync } = require("@babel/core");

function compileModal(data, lang = "en") {
  const actions = [], routes = [];
  const primitives = {};
  for (const name of ["Glyph", "LevelPill", "BadgeIcon"]) primitives[`./${name}`] = () => null;
  const mocks = {
    ...primitives,
    "next/router": { useRouter: () => ({ push: path => routes.push(path) }) },
    "./Layout": { Avatar: () => null },
    "./InboxSheet": ({ children }) => React.createElement("div", null, children),
    "../contexts/AuthContext": { useAuth: () => ({ user: { id: "me" } }) },
    "../contexts/I18nContext": { useI18n: () => ({ lang, t: key => translate(lang, key) }) },
    "../lib/supabaseClient": { supabase: {} },
    "../lib/format": { displayName: profile => profile.first_name, formatStudyTime: seconds => `${seconds / 3600}h` },
    "../lib/studyYears": { studyYearShortLabel: () => "Bac 2" },
    "../lib/studySpaces.mjs": { fieldLabel: () => "Business" },
    "../lib/xp": { getLevelInfo: () => ({ current: { level: 2, titleKey: "xp.title.2" } }) },
    "../lib/badges": { BADGES: [] },
    "../lib/security": { clientRateLimit: () => ({ ok: true }) },
    "../lib/xpEvents": { notifyXPChanged: () => {} },
    "../lib/socialProfile.mjs": {
      loadSocialProfile: async () => data,
      profileCourses: (courses = []) => ({ visible: courses.slice(0, 3), remaining: Math.max(0, courses.length - 3) }),
      sharedBadgeHighlights: () => [],
      changeProfileFriendship: async (_, { action }) => {
        actions.push(action);
        return action === "remove" ? null : { id: "link", requester: "me", addressee: "peer", status: "pending" };
      },
    },
    "./UserProfileModal.module.css": new Proxy({}, { get: (_, key) => String(key) }),
  };
  const module = { exports: {} };
  const source = readFileSync(new URL("../components/UserProfileModal.js", import.meta.url), "utf8");
  const { code } = transformSync(source, {
    filename: "UserProfileModal.js", babelrc: false, configFile: false,
    presets: [[require.resolve("next/babel"), { "preset-react": { runtime: "automatic" } }]],
    plugins: [require.resolve("@babel/plugin-transform-modules-commonjs")],
  });
  vm.runInNewContext(code, { module, exports: module.exports, require: id => id in mocks ? mocks[id] : require(id) });
  return { Modal: module.exports.default, actions, routes };
}

const text = node => typeof node === "string" || typeof node === "number" ? String(node)
  : (node?.children || []).map(text).join(" ");
const fixture = (friends = false) => ({ profile: { id: "peer", first_name: "Emma", pseudo: "emma", university: "UCF" },
  relationship: friends ? { id: "link", requester: "me", addressee: "peer", status: "accepted" } : null,
  progression: { totalXP: 400, streak: 1, badgeCount: 3 }, seconds30d: friends ? 3600 : null,
  courses: friends ? [{ id: "course", name: "Services Marketing", color: "pink" }] : null, sharedPosts: [], partial: false });

async function render(Modal) {
  let renderer;
  await act(async () => { renderer = create(React.createElement(Modal, { userId: "peer", onClose: () => {} })); });
  return renderer;
}
const button = (renderer, label) => renderer.root.findAllByType("button").find(node => text(node) === label);

test("non-friend CTA stays single-shot and changes to disabled pending state", async () => {
  const { Modal, actions } = compileModal(fixture());
  const renderer = await render(Modal);
  assert.ok(!text(renderer.toJSON()).includes("Study · 30 days"));
  const add = button(renderer, "Add as friend");
  await act(async () => { add.props.onClick(); add.props.onClick(); });
  assert.deepEqual(actions, ["add"]);
  assert.equal(button(renderer, "Request pending…").props.disabled, true);
  act(() => renderer.unmount());
});

test("friend primary CTA opens the existing direct conversation route", async () => {
  const { Modal, routes } = compileModal(fixture(true));
  const renderer = await render(Modal);
  act(() => button(renderer, "Message").props.onClick());
  assert.deepEqual(routes, ["/messages?dm=peer"]);
  assert.equal(button(renderer, "You're already friends"), undefined);
  act(() => renderer.unmount());
});

test("confirmed removal immediately drops friends-only data from the real rendered modal", async () => {
  const { Modal, actions } = compileModal(fixture(true));
  const renderer = await render(Modal);
  assert.ok(text(renderer.toJSON()).includes("Services Marketing"));
  act(() => renderer.root.findByProps({ "aria-label": "Manage friendship" }).props.onClick());
  act(() => button(renderer, "Remove friend").props.onClick());
  assert.ok(text(renderer.toJSON()).includes("Remove this person from your friends?"));
  await act(async () => button(renderer, "Remove friend").props.onClick());
  assert.deepEqual(actions, ["remove"]);
  const rendered = text(renderer.toJSON());
  assert.ok(!rendered.includes("Services Marketing"));
  assert.ok(!rendered.includes("Study · 30 days"));
  assert.ok(rendered.includes("Add as friend"));
  act(() => renderer.unmount());
});

test("French profile labels preserve singular streak and zero badge count", async () => {
  const data = fixture(true); data.progression.badgeCount = 0;
  const { Modal } = compileModal(data, "fr");
  const renderer = await render(Modal);
  const rendered = text(renderer.toJSON());
  assert.ok(rendered.includes("1 jour"));
  assert.ok(rendered.includes("Badges obtenus 0"));
  assert.ok(rendered.includes("Étude · 30 jours"));
  assert.ok(!rendered.includes("modal."));
  act(() => renderer.unmount());
});
