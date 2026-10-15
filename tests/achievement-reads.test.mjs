import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync, existsSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { fetchCanonicalBadges } from "../lib/badgeTruth.mjs";

const require = createRequire(import.meta.url);
const React = require("react");
const { act, create } = require("react-test-renderer");
const { transformSync } = require("@babel/core");
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const compiled = new Map();
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const ok = data => ({ data, error: null });
const failed = () => ({ data: null, error: { message: "unavailable" } });
const row = (id = "a", xp = 0) => ({ user_id: id, total_xp: xp, streak: 0, study_xp: xp,
  objective_xp: 0, streak_xp: 0, exam_xp: 0, badge_xp: 0, mission_xp: 0, referral_xp: 0 });
const textOf = node => typeof node === "string" ? node : Array.isArray(node) ? node.map(textOf).join(" ") : textOf(node?.children || []);
async function flush() { await act(async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); }); }

function setup({ revision = process.env.BT_ACHIEVEMENT_REVISION, clock } = {}) {
  const listeners = new Map();
  const env = { user: { id: "a" }, lang: "fr", calls: [], reply: () => ok([]), states: {} };
  env.client = {
    rpc(name, args) { env.calls.push({ name, args }); return Promise.resolve().then(() => env.reply(name, args)); },
    from(table) {
      const q = new Proxy({}, { get(_, method) {
        if (method === "then") return (yes, no) => { env.calls.push({ name: table }); return Promise.resolve().then(() => env.reply(table)).then(yes, no); };
        if (!["select", "eq", "in", "order", "range", "gte"].includes(method)) throw Error(`unexpected write ${method}`);
        return () => q;
      } }); return q;
    },
  };
  const cache = new Map();
  env.load = file => {
    let path = resolve(root, file);
    if (!existsSync(path)) path += path.endsWith("BadgeIcon") ? ".jsx" : ".js";
    if (cache.has(path)) return cache.get(path).exports;
    const module = { exports: {} }; cache.set(path, module);
    const compiledKey = `${revision || "working"}:${path}`;
    const source = () => revision ? execFileSync("git", ["show", `${revision}:${relative(root, path)}`], { cwd: root, encoding: "utf8" }) : readFileSync(path, "utf8");
    if (!compiled.has(compiledKey)) compiled.set(compiledKey, transformSync(source(), {
      filename: path, babelrc: false, configFile: false,
      presets: [[require.resolve("next/babel"), { "preset-react": { runtime: "automatic" } }]],
      plugins: [require.resolve("@babel/plugin-transform-modules-commonjs")],
    }).code);
    const mocks = {
      "../lib/supabaseClient": { supabase: env.client },
      "../contexts/AuthContext": { useAuth: () => ({ user: env.user }) },
      "../contexts/I18nContext": { useI18n: () => ({ t: key => env.load("lib/i18n.js").translate(env.lang, key) }) },
      "../components/Layout": { default: ({ children }) => React.createElement("main", null, children) },
      "../components/PageHeader": { default: ({ right }) => React.createElement("header", null, right) },
      "../components/AnimatedNumber": { default: ({ value, suffix = "" }) => `${value}${suffix}` },
      "../components/LevelSeal": { default: ({ level }) => React.createElement("span", { "data-level": level }, String(level)) },
      "../components/BadgeIcon": { default: props => React.createElement("i", { "data-badge": props.id, "data-earned": props.earned }) },
      "./BadgeIcon": { default: props => React.createElement("i", { "data-badge": props.id, "data-earned": props.earned }) },
      "./Mascot": { default: () => null },
      "../components/BadgeSheet": { default: () => null, rarityLabel: () => "tier" },
      "../components/focus/FocusEnvironmentGallery": { default: () => React.createElement("div", { "data-focus": true }) },
      "../hooks/useFocusEnvironment": { useFocusEnvironment: () => ({}) },
      "next/link": { default: ({ children, ...props }) => React.createElement("a", props, children) },
    };
    vm.runInNewContext(compiled.get(compiledKey), { module, exports: module.exports, Date: clock ? class extends Date { static now() { return clock.now; } } : Date, Intl, console,
      window: { addEventListener(name, fn) { if (!listeners.has(name)) listeners.set(name, new Set()); listeners.get(name).add(fn); }, removeEventListener(name, fn) { listeners.get(name)?.delete(fn); } },
      require(id) {
        if (mocks[id]) return { __esModule: true, ...mocks[id] };
        if (id.endsWith(".module.css")) return { __esModule: true, default: new Proxy({}, { get: (_, key) => key }) };
        if (!id.startsWith(".")) return require(id);
        if (id.endsWith(".cjs")) return require(resolve(dirname(path), id));
        return env.load(resolve(dirname(path), id));
      },
    });
    return module.exports;
  };
  env.emit = () => act(() => { env.load("lib/userLevels.js").clearUserLevelCache(); for (const fn of listeners.get("bt-xp-changed") || []) fn(); });
  env.mount = (file = null, profile = false) => {
    const Component = file ? env.load(file).default : function Harness() {
      const hooks = env.load("hooks/useAchievementReads.js");
      if (profile) env.states = hooks.useProfileAchievementReads(env.user?.id || null);
      else {
        env.states.badges = hooks.useBadgeRead(env.user?.id || null);
        env.states.level = hooks.useLevelRead(env.user?.id || null);
      }
      return null;
    };
    const tree = () => React.createElement(Component);
    act(() => { env.renderer = create(tree()); });
    env.render = () => act(() => { env.renderer.update(tree()); });
    env.text = () => textOf(env.renderer.toJSON());
    env.close = () => act(() => { env.renderer.unmount(); });
    return env;
  };
  return env;
}

function badgeClient(sync, reads) {
  let calls = 0;
  return { rpc: () => Promise.resolve(sync), from: () => ({ select: () => ({ eq: () => Promise.resolve(reads[Math.min(calls++, reads.length - 1)]) }) }), get calls() { return calls; } };
}
const stored = ids => ids.map(badge_id => ({ badge_id, earned_at: "2026-09-01T10:00:00Z" }));
const catalog = ["streak_3", "hours_10"];

test("badges require both sources, including empty and partial/error responses", async () => {
  assert.deepEqual(await fetchCanonicalBadges(badgeClient(ok([]), [ok([])]), "a", catalog), { ids: [], earnedAt: {} });
  for (const [sync, rows] of [[failed(), ok(stored(catalog))], [ok(catalog), failed()], [failed(), failed()], [{ data: [], error: {} }, ok([])], [ok([null]), ok([])]]) {
    assert.equal(await fetchCanonicalBadges(badgeClient(sync, [rows]), "a", catalog), null);
  }
});

test("badges preserve historic dates and only reread when the parallel snapshot missed a synced award", async () => {
  const client = badgeClient(ok(catalog), [ok(stored([catalog[0]])), ok(stored(catalog))]);
  const result = await fetchCanonicalBadges(client, "a", catalog);
  assert.deepEqual(result.ids, catalog); assert.equal(result.earnedAt.streak_3, "2026-09-01T10:00:00Z"); assert.equal(client.calls, 2);
  const complete = badgeClient(ok(catalog), [ok(stored(catalog))]);
  await fetchCanonicalBadges(complete, "a", catalog); assert.equal(complete.calls, 1);
  for (const response of [failed(), ok(stored([catalog[0]])), ok([{ badge_id: "streak_3", earned_at: null }])]) {
    assert.equal(await fetchCanonicalBadges(badgeClient(ok(catalog), [ok([]), response]), "a", catalog), null);
  }
});

test("canonical zero is reliable; cache deduplicates concurrency and normal navigation", async () => {
  const env = setup(); const pending = deferred(); env.reply = () => pending.promise;
  const { loadCanonicalUserLevelMap: strict, loadUserLevelMap: legacy } = env.load("lib/userLevels.js");
  const first = strict(env.client, ["a"], { selfUserId: "a" });
  const second = legacy(env.client, ["a"], { selfUserId: "a", includeSelfReferralStats: true });
  pending.resolve(ok([row()])); const [a, b] = await Promise.all([first, second]);
  assert.equal(a.a.totalXP, 0); assert.equal(a.a.current.level, 1); assert.equal(b.a.totalXP, 0);
  await strict(env.client, ["a"], { selfUserId: "a" }); assert.equal(env.calls.length, 1);
});

test("canonical reads reject missing/null/invalid totals and never query fallback tables", async () => {
  for (const response of [failed(), ok([]), ok([row("b")]), ok([{ user_id: "a", total_xp: null }]), ok([{ user_id: "a", total_xp: "bad" }]), ok([{ user_id: "a", total_xp: -1 }])]) {
    const env = setup(); env.reply = () => response;
    await assert.rejects(env.load("lib/userLevels.js").loadCanonicalUserLevelMap(env.client, ["a"]));
    assert.equal(env.calls.length, 1);
  }
});

test("an incomplete XP breakdown is unknown rather than seven claimed zero sources", async () => {
  const env = setup(); env.reply = () => ok([{ user_id: "a", total_xp: 1500 }]);
  const data = await env.load("lib/userLevels.js").loadCanonicalUserLevelMap(env.client, ["a"]);
  assert.equal(data.a.totalXP, 1500); assert.equal(data.a.breakdown, null);
});

test("legacy fallback shape is unchanged but cannot poison the strict cache", async () => {
  const env = setup(); env.reply = name => name === "get_gamification_levels" ? failed() : ok([]);
  const levels = env.load("lib/userLevels.js");
  const fallback = await levels.loadUserLevelMap(env.client, ["a"]);
  assert.equal(fallback.a.current.level, 1); assert.equal(fallback.a.totalXP, 0);
  await assert.rejects(levels.loadCanonicalUserLevelMap(env.client, ["a"]));
  env.reply = () => ok([row("a", 1200)]);
  assert.equal((await levels.loadCanonicalUserLevelMap(env.client, ["a"])).a.totalXP, 1200);
});

test("failed reads are not cached; force retry bypasses a fresh value and old in-flight results cannot refill the cache", async () => {
  const env = setup(); const levels = env.load("lib/userLevels.js"); const opts = { selfUserId: "a" };
  env.reply = () => ok([row("a", 100)]);
  await levels.loadCanonicalUserLevelMap(env.client, ["a"], opts);
  env.reply = () => failed(); await assert.rejects(levels.loadCanonicalUserLevelMap(env.client, ["a"], { ...opts, force: true }));
  const old = deferred(); env.reply = () => old.promise;
  const oldRead = levels.loadCanonicalUserLevelMap(env.client, ["a"], opts); await flush();
  env.reply = () => ok([row("a", 200)]);
  await levels.loadCanonicalUserLevelMap(env.client, ["a"], { ...opts, force: true });
  old.resolve(ok([row("a", 300)])); await oldRead;
  assert.equal((await levels.loadCanonicalUserLevelMap(env.client, ["a"], opts)).a.totalXP, 200);
  levels.clearUserLevelCache(); env.reply = () => ok([row("a", 400)]);
  assert.equal((await levels.loadCanonicalUserLevelMap(env.client, ["a"], opts)).a.totalXP, 400);
});

test("cache is isolated by viewer, target and client and expires after three minutes", async () => {
  const env = setup(); env.reply = (_, args) => ok(args.p_user_ids.map(id => row(id, 1)));
  const strict = env.load("lib/userLevels.js").loadCanonicalUserLevelMap;
  const now = Date.now; let clock = now(); Date.now = () => clock;
  try {
    await strict(env.client, ["a"], { selfUserId: "a" });
    await strict(env.client, ["a"], { selfUserId: "b" });
    await strict(env.client, ["b"], { selfUserId: "a" });
    assert.equal(env.calls.length, 3);
    clock += 180001; await strict(env.client, ["a"], { selfUserId: "a" }); assert.equal(env.calls.length, 4);
    const other = { rpc: () => Promise.resolve(ok([row("a", 5)])) };
    assert.equal((await strict(other, ["a"], { selfUserId: "a" })).a.totalXP, 5);
  } finally { Date.now = now; }
});

for (const kind of ["badges", "level"]) {
  test(`${kind}: initial unknown, error, retry success, refresh error retains data and retry rereads`, async () => {
    const env = setup(); const initial = deferred(); env.reply = name => name === "get_gamification_levels" ? (kind === "level" ? initial.promise : ok([row()])) : kind === "badges" ? initial.promise : ok([]);
    env.mount(); await flush(); assert.equal(env.states[kind].data, null); assert.equal(env.states[kind].loading, true);
    initial.resolve(failed()); await flush(); assert.equal(env.states[kind].error, true); assert.equal(env.states[kind].data, null);
    env.reply = name => name === "get_gamification_levels" ? ok([row("a", 100)]) : name === "sync_my_badges" ? ok(["streak_3"]) : ok(stored(["streak_3"]));
    act(() => { env.states[kind].retry(); env.states[kind].retry(); }); await flush();
    const reliable = env.states[kind].data; assert.ok(reliable); assert.equal(env.states[kind].error, false);
    const calls = env.calls.length;
    env.reply = () => failed();
    if (kind === "badges") act(() => { env.states.badges.refresh(); });
    else env.emit();
    await flush();
    assert.equal(env.states[kind].error, true); assert.equal(env.states[kind].data, reliable);
    assert.ok(env.calls.length > calls);
    env.reply = name => name === "get_gamification_levels" ? ok([row("a", 200)]) : ok([]);
    act(() => { env.states[kind].retry(); }); await flush();
    assert.equal(env.states[kind].error, false);
    assert.equal(kind === "level" ? env.states[kind].data.totalXP : env.states[kind].data.ids.length, kind === "level" ? 200 : 0);
    env.close();
  });
}

test("account A→B→A hides all old data synchronously and ignores old responses, including unmount", async () => {
  const env = setup(); const oldA = deferred(); const oldB = deferred();
  env.reply = name => name === "get_gamification_levels" ? oldA.promise : ok([]);
  env.mount(); await flush();
  env.user = { id: "b" }; env.reply = name => name === "get_gamification_levels" ? oldB.promise : ok([]); env.render();
  assert.equal(env.states.level.data, null); await flush();
  env.user = { id: "a" }; env.reply = name => name === "get_gamification_levels" ? ok([row("a", 50)]) : ok([]); env.render(); await flush();
  assert.equal(env.states.level.data.totalXP, 50);
  oldA.resolve(ok([row("a", 999)])); oldB.resolve(ok([row("b", 888)])); await flush();
  assert.equal(env.states.level.data.totalXP, 50); env.user = null; env.render(); assert.equal(env.states.level.data, null); assert.equal(env.states.badges.data, null); env.close();
});

test("a newer explicit badge read supersedes an older badge response", async () => {
  const env = setup(); const old = deferred(); env.reply = name => name === "get_gamification_levels" ? ok([row()]) : old.promise;
  env.mount(); await flush(); env.reply = name => name === "get_gamification_levels" ? ok([row()]) : ok([]);
  act(() => { env.states.badges.refresh({ supersede: true }); }); await flush(); assert.equal(env.states.badges.data.ids.length, 0);
  old.resolve(ok(stored(catalog))); await flush(); assert.equal(env.states.badges.data.ids.length, 0); env.close();
});

for (const [file, kind] of [["pages/badges.js", "badges"], ["pages/progression.js", "level"]]) {
  for (const lang of ["fr", "en"]) {
    test(`${file} ${lang}: initial error has retry and no false locked collection or level`, async () => {
      const env = setup(); env.lang = lang; env.reply = () => failed(); env.mount(file); await flush();
      assert.equal(env.renderer.root.findAllByProps({ role: "alert" }).length, 1);
      assert.ok(env.text().includes(lang === "fr" ? "Réessayer" : "Retry"));
      assert.equal(env.renderer.root.findAllByProps({ role: "progressbar" }).length, 0);
      assert.equal(env.renderer.root.findAll(node => node.props["data-earned"] !== undefined).length, 0);
      assert.equal(env.renderer.root.findAll(node => node.props["data-level"] !== undefined).length, 0);
      env.reply = name => name === "get_gamification_levels" ? ok([row()]) : ok([]);
      const retry = env.renderer.root.findByType("button"); act(() => { retry.props.onClick(); }); await flush();
      assert.equal(env.renderer.root.findAllByProps({ role: "alert" }).length, 0);
      assert.ok(env.renderer.root.findAllByProps({ role: "progressbar" }).length > 0);
      if (kind === "level") assert.ok(env.text().includes("0 XP"));
      env.close();
    });
  }
}

test("Profile achievement links omit unknown claims, retain confirmed zero, and keep known sibling content", () => {
  const env = setup(); const Cards = env.load("components/ProfileAchievementCards.js").default;
  const t = key => env.load("lib/i18n.js").translate("fr", key);
  let renderer; act(() => { renderer = create(React.createElement(Cards, { levelInfo: null, earnedBadgeIds: null, t })); });
  assert.equal(renderer.root.findAllByType("a").length, 0); assert.equal(renderer.root.findAllByType("i").length, 0);
  act(() => { renderer.update(React.createElement(Cards, { levelInfo: env.load("lib/xp.js").getLevelInfo(0), earnedBadgeIds: null, t })); });
  assert.equal(renderer.root.findAllByType("a").length, 1);
  act(() => { renderer.update(React.createElement(Cards, { levelInfo: null, earnedBadgeIds: [], t })); });
  assert.equal(renderer.root.findAllByType("a").length, 1); assert.equal(renderer.root.findByType("a").props.href, "/badges");
  assert.ok(textOf(renderer.toJSON()).includes("0"));
  act(() => { renderer.unmount(); });
  const source = readFileSync(resolve(root, "pages/profile.js"), "utf8");
  assert.match(source, /useProfileAchievementReads\(user\?\.id \|\| null\)/);
  assert.doesNotMatch(source, /fallbackTotalXP|computeTotalXP|clearUserLevelCache/);
});

test("Badges prerenders safely before authentication and selection exist", () => {
  const env = setup(); env.user = null;
  const { renderToStaticMarkup } = require("react-dom/server");
  const Page = env.load("pages/badges.js").default;
  assert.doesNotThrow(() => renderToStaticMarkup(React.createElement(Page)));
});

test("changing accounts immediately hides a previously successful badge/XP snapshot", async () => {
  const env = setup(); env.reply = name => name === "get_gamification_levels" ? ok([row("a", 500)]) : name === "sync_my_badges" ? ok(["streak_3"]) : ok(stored(["streak_3"]));
  env.mount(); await flush(); assert.equal(env.states.level.data.totalXP, 500); assert.equal(env.states.badges.data.ids.length, 1);
  const pending = deferred(); env.reply = () => pending.promise; env.user = { id: "b" }; env.render();
  assert.equal(env.states.level.data, null); assert.equal(env.states.badges.data, null);
  await flush(); env.close(); pending.resolve(failed()); await flush();
});

test("a partial multi-user canonical response is rejected as a whole", async () => {
  const env = setup(); env.reply = () => ok([row("a", 10)]);
  await assert.rejects(env.load("lib/userLevels.js").loadCanonicalUserLevelMap(env.client, ["a", "b"]));
});

test("full canonical source values stay identical for legacy and explicit consumers", async () => {
  const env = setup(); env.reply = () => ok([{ ...row("a", 2300), objective_xp: 100, study_xp: 200,
    streak_xp: 300, exam_xp: 400, badge_xp: 500, mission_xp: 600, referral_xp: 200, streak: 7 }]);
  const levels = env.load("lib/userLevels.js");
  const a = await levels.loadCanonicalUserLevelMap(env.client, ["a"]);
  const b = await levels.loadUserLevelMap(env.client, ["a"]);
  assert.deepEqual(JSON.parse(JSON.stringify(a)), JSON.parse(JSON.stringify(b)));
});

test("Profile reads XP only after badges settle, and a successful badge retry refreshes the older XP snapshot once", async () => {
  const env = setup(); const pending = deferred(); env.reply = name => name === "get_gamification_levels" ? ok([row("a", 100)]) : pending.promise;
  env.mount(null, true); await flush(); assert.equal(env.calls.filter(c => c.name === "get_gamification_levels").length, 0);
  pending.resolve(failed()); await flush(); assert.equal(env.states.level.data.totalXP, 100);
  assert.equal(env.states.badges.error, true);
  env.reply = name => name === "get_gamification_levels" ? ok([row("a", 400)]) : name === "sync_my_badges" ? ok(["streak_3"]) : ok(stored(["streak_3"]));
  act(() => { env.states.badges.retry(); }); await flush();
  assert.equal(env.states.level.data.totalXP, 400);
  assert.equal(env.calls.filter(c => c.name === "get_gamification_levels").length, 2);
  act(() => { env.states.badges.refresh(); }); await flush();
  assert.equal(env.calls.filter(c => c.name === "get_gamification_levels").length, 2); env.close();
});

for (const profile of [false, true]) test(`regression: ${profile ? "Profile" : "Badges reader"} syncs only on mount, account change and explicit retry, never XP events`, async () => {
  const env = setup();
  env.reply = (name, args) => name === "get_gamification_levels" ? ok(args.p_user_ids.map(id => row(id, 200))) : ok([]);
  env.mount(null, profile); await flush();
  const count = name => env.calls.filter(call => call.name === name).length;
  assert.equal(count("sync_my_badges"), 1, "one legitimate initial badge sync");
  assert.equal(count("get_gamification_levels"), 1);
  const before = env.calls.length;
  env.emit(); env.emit(); env.emit(); await flush();
  assert.deepEqual(env.calls.slice(before).map(call => call.name), ["get_gamification_levels"], "XP burst must deduplicate XP reads without syncing badges or reading their table");
  for (let i = 0; i < 3; i++) { env.emit(); await flush(); }
  assert.equal(count("sync_my_badges"), 1);
  assert.equal(count("get_gamification_levels"), 5);
  // Same-account auth-object renewal does not introduce a new trigger.
  env.user = { id: "a" }; env.render(); await flush(); assert.equal(count("sync_my_badges"), 1);
  env.reply = (name, args) => name === "get_gamification_levels" ? ok(args.p_user_ids.map(id => row(id, 300))) : failed();
  env.user = { id: "b" }; env.render(); await flush();
  assert.equal(count("sync_my_badges"), 2, "account change syncs exactly once");
  assert.equal(env.states.badges.error, true);
  env.reply = (name, args) => name === "get_gamification_levels" ? ok(args.p_user_ids.map(id => row(id, 300))) : ok([]);
  act(() => { env.states.badges.retry(); env.states.badges.retry(); }); await flush();
  assert.equal(count("sync_my_badges"), 3, "double retry shares one sync");
  assert.equal(env.states.badges.error, false);
  env.user = null; env.render(); await flush(); const afterLogout = env.calls.length;
  env.emit(); await flush(); assert.equal(env.calls.length, afterLogout);
  env.close(); env.emit(); await flush(); assert.equal(env.calls.length, afterLogout);
});

test("regression: legacy freshness at 179 seconds matches main instead of restarting TTL from shared cached rows", async () => {
  const observations = [];
  for (const revision of ["0729a0808558226888eebd444df3ac5aeeb43e94", process.env.BT_ACHIEVEMENT_REVISION]) {
    const clock = { now: 0 }; const env = setup({ revision, clock }); let xp = 100;
    env.reply = () => ok([row("a", xp)]);
    const load = env.load("lib/userLevels.js").loadUserLevelMap;
    const a = { selfUserId: "a" }, b = { selfUserId: "a", includeSelfReferralStats: true };
    const at0 = (await load(env.client, ["a"], a)).a.totalXP;
    clock.now = 179000; xp = 200;
    const at179 = (await load(env.client, ["a"], b)).a.totalXP;
    clock.now = 181000;
    const at181 = (await load(env.client, ["a"], b)).a.totalXP;
    observations.push({ revision: revision || "working", at0, at179, at181, rpcCalls: env.calls.length });
  }
  assert.deepEqual(observations.map(({ at0, at179, at181, rpcCalls }) => ({ at0, at179, at181, rpcCalls })), [
    { at0: 100, at179: 200, at181: 200, rpcCalls: 2 },
    { at0: 100, at179: 200, at181: 200, rpcCalls: 2 },
  ]);
});

test("regression: a newer canonical cache must neither extend nor prematurely refresh the legacy three-minute TTL", async () => {
  const clock = { now: 0 }; const env = setup({ clock }); let xp = 100;
  env.reply = () => ok([row("a", xp)]);
  const { loadUserLevelMap: legacy, loadCanonicalUserLevelMap: strict } = env.load("lib/userLevels.js");
  const options = { selfUserId: "a" };
  assert.equal((await legacy(env.client, ["a"], options)).a.totalXP, 100);
  clock.now = 120000; xp = 200;
  assert.equal((await strict(env.client, ["a"], { ...options, force: true })).a.totalXP, 200);
  clock.now = 179999; xp = 300;
  assert.equal((await legacy(env.client, ["a"], options)).a.totalXP, 100, "legacy cache still valid until its original expiry");
  assert.equal(env.calls.length, 2);
  clock.now = 180000;
  assert.equal((await legacy(env.client, ["a"], options)).a.totalXP, 300, "expired legacy read needs fresh data, not a younger shared cached value");
  assert.equal(env.calls.length, 3);
  clock.now = 359999; xp = 400;
  assert.equal((await legacy(env.client, ["a"], options)).a.totalXP, 300);
  assert.equal(env.calls.length, 3);
  clock.now = 360000;
  assert.equal((await legacy(env.client, ["a"], options)).a.totalXP, 400);
  assert.equal(env.calls.length, 4);
});

test("regression: XP events during a pending badge load never supersede it or add a sync", async () => {
  const env = setup(); const pending = deferred();
  env.reply = name => name === "get_gamification_levels" ? ok([row()]) : pending.promise;
  env.mount(); await flush();
  const before = env.calls.filter(c => c.name === "sync_my_badges").length;
  env.emit(); env.emit(); await flush();
  assert.equal(env.calls.filter(c => c.name === "sync_my_badges").length, before);
  assert.equal(env.states.badges.loading, true);
  pending.resolve(ok([])); await flush();
  assert.deepEqual(JSON.parse(JSON.stringify(env.states.badges.data.ids)), []);
  env.close();
});

test("expired historical keys and strict readers still share a fresh in-flight RPC", async () => {
  const clock = { now: 0 }; const env = setup({ clock });
  const levels = env.load("lib/userLevels.js"); const a = { selfUserId: "a" }, b = { ...a, includeSelfReferralStats: true };
  env.reply = () => ok([row("a", 100)]);
  await levels.loadUserLevelMap(env.client, ["a"], a);
  clock.now = 180000; const pending = deferred(); env.reply = () => pending.promise;
  const reads = [levels.loadUserLevelMap(env.client, ["a"], a), levels.loadUserLevelMap(env.client, ["a"], a),
    levels.loadUserLevelMap(env.client, ["a"], b), levels.loadCanonicalUserLevelMap(env.client, ["a"], a)];
  await flush(); assert.equal(env.calls.length, 2, "one initial RPC and one shared fresh RPC");
  pending.resolve(ok([row("a", 200)]));
  const values = await Promise.all(reads); assert.deepEqual(values.map(v => v.a.totalXP), [200, 200, 200, 200]);
  await levels.loadCanonicalUserLevelMap(env.client, ["a"], a);
  await levels.loadUserLevelMap(env.client, ["a"], b); assert.equal(env.calls.length, 2);
});

test("strict cache hits never slide their deadline; real retries bypass success and in-flight reads", async () => {
  const clock = { now: 0 }; const env = setup({ clock }); const options = { selfUserId: "a" };
  const strict = env.load("lib/userLevels.js").loadCanonicalUserLevelMap;
  env.reply = () => ok([row("a", 100)]);
  await strict(env.client, ["a"], options);
  clock.now = 179999; await strict(env.client, ["a"], options); assert.equal(env.calls.length, 1);
  clock.now = 180000; const pending = deferred(); env.reply = () => pending.promise;
  const old = strict(env.client, ["a"], options); await flush();
  env.reply = () => ok([row("a", 200)]);
  const retried = await strict(env.client, ["a"], { ...options, force: true }); assert.equal(retried.a.totalXP, 200);
  pending.resolve(ok([row("a", 150)])); await old;
  assert.equal((await strict(env.client, ["a"], options)).a.totalXP, 200);
  assert.equal(env.calls.length, 3);
  env.reply = () => ok([row("a", 300)]);
  assert.equal((await strict(env.client, ["a"], { ...options, force: true })).a.totalXP, 300);
  assert.equal(env.calls.length, 4);
});
