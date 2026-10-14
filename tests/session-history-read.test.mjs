import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const require = createRequire(import.meta.url);
const React = require("react");
const { act, create } = require("react-test-renderer");
const { transformSync } = require("@babel/core");
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const compiled = new Map();
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
const ok = data => ({ data, error: null });
const failed = () => ({ data: null, error: { message: "network unavailable" } });
const rows = (count, prefix = "session") => Array.from({ length: count }, (_, i) => ({
  id: `${prefix}-${i}`, user_id: "account-a", course_id: "active", duration_seconds: 1200,
  started_at: "2026-10-14T10:00:00Z", ended_at: "2026-10-14T10:20:00Z",
}));

function setup({ reply = () => ok(rows(1)), lang = "fr" } = {}) {
  const env = { user: { id: "account-a" }, reply, calls: [], lang, tick: 0 };
  const courses = [{ id: "active", name: "Biologie", archived_at: null },
    { id: "archived", name: "Ancien cours", archived_at: "2026-09-01" }];
  const supabase = { from(table) {
    const call = { table, ops: [] };
    const query = new Proxy({}, { get: (_, method) => {
      if (method === "then") return (yes, no) => {
        env.calls.push(call);
        return Promise.resolve().then(() => table === "sessions" ? env.reply(call) : ok(courses)).then(yes, no);
      };
      if (!["select", "eq", "order", "range"].includes(method)) throw Error(`unexpected write or query: ${method}`);
      return (...args) => { call.ops.push([method, args]); return query; };
    } });
    return query;
  } };
  const cache = new Map();
  const load = file => {
    const path = resolve(root, file);
    if (cache.has(path)) return cache.get(path).exports;
    const module = { exports: {} };
    cache.set(path, module);
    if (!compiled.has(path)) compiled.set(path, transformSync(readFileSync(path, "utf8"), {
      filename: path, babelrc: false, configFile: false,
      presets: [[require.resolve("next/babel"), { "preset-react": { runtime: "automatic" } }]],
      plugins: [require.resolve("@babel/plugin-transform-modules-commonjs")],
    }).code);
    const mocks = {
      "../lib/supabaseClient": { supabase },
      "../contexts/AuthContext": { useAuth: () => ({ user: env.user }) },
      "../contexts/I18nContext": { useI18n: () => ({ lang: env.lang, t: key => load("lib/i18n.js").translate(env.lang, key) }) },
      "../contexts/ToastContext": { useToast: () => ({ toast() { throw Error("read must not trigger a mutation toast"); } }) },
      "../components/Layout": { default: ({ children }) => React.createElement("main", null, children) },
      "../components/LoadingScreen": { default: () => React.createElement("p", { role: "status" }, "loading") },
      "../components/TodaySessionsCard": { default: props => React.createElement("section", { "data-history": true, ...props }) },
      "../lib/clientCache": { clearClientCache() {} },
      "../lib/studyDays.mjs": { mergeStudyDays: () => [] },
      "../lib/sessionDayImpact.mjs": { daysLostByChange: () => [] },
      "../lib/streakFreezes": { invalidateStreakFreezeUpkeep() {} },
      "../lib/xpEvents": { notifyXPChanged() {} },
    };
    vm.runInNewContext(compiled.get(path), { module, exports: module.exports, console, Intl, Date,
      require(id) {
        if (mocks[id]) return { __esModule: true, ...mocks[id] };
        if (!id.startsWith(".")) return require(id);
        return load(resolve(dirname(path), id.endsWith(".js") ? id : `${id}.js`));
      },
    });
    return module.exports;
  };
  const History = load("pages/historique.js").default;
  const tree = () => React.createElement(History, { tick: env.tick });
  act(() => { env.renderer = create(tree()); });
  env.refresh = () => act(() => { env.tick += 1; env.renderer.update(tree()); });
  env.filter = value => act(() => env.renderer.root.findByType("select").props.onChange({ target: { value } }));
  env.cards = () => env.renderer.root.findAllByProps({ "data-history": true });
  env.ids = () => env.cards().flatMap(card => card.props.sessions.map(row => row.id));
  env.reads = () => env.calls.filter(call => call.table === "sessions");
  const textOf = node => typeof node === "string" ? node
    : Array.isArray(node) ? node.map(textOf).join(" ") : textOf(node?.children || []);
  env.text = () => textOf(env.renderer.toJSON());
  env.alerts = () => env.renderer.root.findAllByProps({ role: "alert" });
  env.buttons = label => env.renderer.root.findAllByType("button").filter(button => button.props.children === label);
  env.click = label => act(() => { env.buttons(label)[0].props.onClick(); });
  env.close = () => act(() => env.renderer.unmount());
  return env;
}
async function flush() { await act(async () => { for (let i = 0; i < 8; i += 1) await Promise.resolve(); }); }
const range = call => call.ops.find(([op]) => op === "range")[1];
const course = call => call.ops.find(([op, args]) => op === "eq" && args[0] === "course_id")?.[1][1];

test("successful history keeps owner filter, 25-row pages and stable two-column ordering", async () => {
  const env = setup(); await flush();
  assert.deepEqual(env.ids(), ["session-0"]);
  assert.equal(env.alerts().length, 0);
  assert.deepEqual(JSON.parse(JSON.stringify(env.reads()[0].ops)), [
    ["select", ["*"]], ["eq", ["user_id", "account-a"]],
    ["order", ["started_at", { ascending: false }]], ["order", ["id", { ascending: false }]], ["range", [0, 24]],
  ]);
  env.close();
});

test("empty is shown only after a successful empty read, never during initial loading", async () => {
  const pending = deferred(); const env = setup({ reply: () => pending.promise }); await flush();
  assert.ok(!env.text().includes("Aucune session enregistrée."));
  assert.ok(env.text().includes("loading"));
  pending.resolve(ok([])); await flush();
  assert.ok(env.text().includes("Aucune session enregistrée."));
  assert.equal(env.alerts().length, 0); env.close();
});

for (const [name, reply] of [
  ["Supabase error", () => failed()],
  ["rejected read", () => Promise.reject(Error("connection lost"))],
  ["missing data without error", () => ok(null)],
]) test(`${name} shows an error and retry, not an empty history`, async () => {
  const env = setup({ reply }); await flush();
  assert.equal(env.alerts().length, 1); assert.equal(env.buttons("Réessayer").length, 1);
  assert.ok(!env.text().includes("Aucune session enregistrée."));
  assert.ok(!env.text().includes("loading")); env.close();
});

test("retry starts the first page again and synchronous double clicks share one pending read", async () => {
  const env = setup({ reply: () => failed() }); await flush();
  const pending = deferred(); env.reply = () => pending.promise;
  const retry = env.buttons("Réessayer")[0].props.onClick;
  act(() => { retry(); retry(); }); await flush();
  assert.equal(env.reads().length, 2); assert.deepEqual(range(env.reads()[1]), [0, 24]);
  assert.equal(env.alerts().length, 0);
  pending.resolve(ok(rows(1, "retried"))); await flush();
  assert.deepEqual(env.ids(), ["retried-0"]); env.close();
});

test("failed pagination preserves 25 known sessions, then retries that page without gaps or duplicates", async () => {
  const env = setup({ reply: () => ok(rows(25)) }); await flush();
  env.reply = () => failed(); env.click("Charger plus"); await flush();
  assert.equal(env.ids().length, 25); assert.equal(env.alerts().length, 1);
  assert.ok(env.text().includes("Les sessions déjà chargées restent affichées."));
  assert.equal(env.buttons("Charger plus").length, 0);
  assert.deepEqual(range(env.reads()[1]), [25, 49]);
  env.reply = () => ok(rows(3, "next")); env.click("Réessayer"); await flush();
  assert.deepEqual(range(env.reads()[2]), [25, 49]);
  assert.equal(env.ids().length, 28); assert.equal(new Set(env.ids()).size, 28);
  assert.equal(env.buttons("Charger plus").length, 0); assert.equal(env.alerts().length, 0); env.close();
});

test("a successful empty last page keeps known history and stops pagination", async () => {
  const env = setup({ reply: () => ok(rows(25)) }); await flush();
  env.reply = () => ok([]); env.click("Charger plus"); await flush();
  assert.equal(env.ids().length, 25); assert.equal(env.buttons("Charger plus").length, 0);
  assert.ok(!env.text().includes("Aucune session enregistrée.")); env.close();
});

test("failed filter read retains and labels previous results; retry uses the selected archived course", async () => {
  const env = setup({ reply: () => ok(rows(25)) }); await flush();
  assert.ok(env.text().includes("Ancien cours · archivé"));
  assert.equal(env.cards()[0].props.courses.length, 2);
  assert.deepEqual(env.cards()[0].props.selectableCourses.map(x => x.id), ["active"]);
  env.reply = () => failed(); env.filter("archived"); await flush();
  assert.equal(env.ids().length, 25); assert.equal(env.alerts().length, 1);
  assert.ok(env.text().includes("Les sessions affichées correspondent au filtre précédent."));
  assert.equal(env.buttons("Charger plus").length, 0);
  env.reply = () => ok(rows(1, "archive")); env.click("Réessayer"); await flush();
  assert.equal(course(env.reads().at(-1)), "archived");
  assert.deepEqual(range(env.reads().at(-1)), [0, 24]);
  assert.deepEqual(env.ids(), ["archive-0"]);
  assert.ok(!env.text().includes("filtre précédent")); env.close();
});

test("a genuinely empty new filter replaces previous results with the original empty state", async () => {
  const env = setup(); await flush(); env.reply = () => ok([]); env.filter("archived"); await flush();
  assert.deepEqual(env.ids(), []); assert.ok(env.text().includes("Aucune session enregistrée."));
  assert.equal(env.alerts().length, 0); env.close();
});

for (const late of [() => ok(rows(2, "stale")), failed]) test(`late ${late === failed ? "error" : "success"} cannot replace a newer filter`, async () => {
  const pending = deferred(); const env = setup({ reply: () => pending.promise }); await flush();
  env.reply = () => ok(rows(1, "current")); env.filter("active"); await flush();
  pending.resolve(late()); await flush();
  assert.deepEqual(env.ids(), ["current-0"]); assert.equal(env.alerts().length, 0); env.close();
});

test("A → B → A rejects the old A generation even when the filter key matches again", async () => {
  const env = setup(); await flush(); const pending = deferred();
  env.reply = () => pending.promise; env.filter("active"); await flush();
  env.reply = () => ok(rows(1, "B")); env.filter("archived"); await flush();
  env.reply = () => ok(rows(1, "new-A")); env.filter("active"); await flush();
  pending.resolve(ok(rows(4, "old-A"))); await flush();
  assert.deepEqual(env.ids(), ["new-A-0"]); env.close();
});

test("late pagination cannot append into another filter or clear its pending loader", async () => {
  const env = setup({ reply: () => ok(rows(25)) }); await flush(); const old = deferred();
  env.reply = () => old.promise; env.click("Charger plus"); await flush();
  const current = deferred(); env.reply = () => current.promise; env.filter("active"); await flush();
  old.resolve(ok(rows(25, "old-page"))); await flush();
  assert.ok(env.text().includes("loading")); assert.equal(env.ids().length, 25);
  current.resolve(ok(rows(1, "current"))); await flush();
  assert.deepEqual(env.ids(), ["current-0"]); env.close();
});

test("account change hides known rows immediately and rejects a response from the old account", async () => {
  const env = setup({ reply: () => ok(rows(25)) }); await flush(); const old = deferred();
  env.reply = () => old.promise; env.click("Charger plus"); await flush();
  const current = deferred(); env.reply = () => current.promise; env.user = { id: "account-b" }; env.refresh(); await flush();
  assert.deepEqual(env.ids(), []);
  old.resolve(ok(rows(3, "private-old"))); await flush(); assert.deepEqual(env.ids(), []);
  current.resolve(ok(rows(1, "account-b"))); await flush(); assert.deepEqual(env.ids(), ["account-b-0"]); env.close();
});

test("unmount invalidates a pending read", async () => {
  const pending = deferred(); const env = setup({ reply: () => pending.promise }); await flush(); env.close();
  pending.resolve(failed()); await flush(); assert.equal(env.renderer.toJSON(), null);
});

test("English error/retry and empty copy are distinct and translated", async () => {
  const env = setup({ lang: "en", reply: () => failed() }); await flush();
  assert.ok(env.text().includes("Couldn’t load your history.")); assert.equal(env.buttons("Retry").length, 1);
  assert.ok(!env.text().includes("No sessions recorded."));
  env.reply = () => ok([]); env.click("Retry"); await flush();
  assert.ok(env.text().includes("No sessions recorded.")); assert.equal(env.alerts().length, 0); env.close();
});
