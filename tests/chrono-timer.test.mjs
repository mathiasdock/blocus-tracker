// Le Chrono partagé (P1-B, phase 1) : moteur global (contexts/TimerContext.js),
// comportement (components/timer/useChrono.js), espace invité local
// (lib/guestStudySpace.js) et file hors ligne des comptes (lib/timerDraft.js),
// exécutés pour de vrai : horloge pilotée, stockage local qui survit à un
// rechargement, Supabase et les sons remplacés par des enregistreurs.
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const require = createRequire(import.meta.url);
const React = require("react");
const { act, create } = require("react-test-renderer");
const { transformSync } = require("@babel/core");
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const babel = { babelrc: false, configFile: false,
  presets: [[require.resolve("next/babel"), { "preset-react": { runtime: "automatic" } }]],
  plugins: [require.resolve("@babel/plugin-transform-modules-commonjs")] };
const T0 = Date.parse("2026-10-07T14:00:00+02:00");
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const GUEST_KEY = "bt_timer_v2:guest";
const QUEUE_KEY = "bt_pending_sessions_v1";

// Un « navigateur » : stockage local, horloge, minuteries, et ce que les
// modules auraient envoyé à Supabase ou joué comme son.
function makeBrowser() {
  const store = new Map();
  const localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => { store.set(k, String(v)); },
    removeItem: (k) => { store.delete(k); },
    clear: () => store.clear(),
    key: (i) => [...store.keys()][i] ?? null,
    get length() { return store.size; },
  };
  const env = { now: T0, store, localStorage, intervals: new Map(), timeouts: new Map(), seq: 0,
    supabaseCalls: [], cues: [], haptics: [], user: null };
  const RealDate = Date;
  class FakeDate extends RealDate {
    constructor(...a) { if (a.length === 0) super(env.now); else super(...a); }
    static now() { return env.now; }
  }
  const noop = () => {};
  const listenerTarget = { addEventListener: noop, removeEventListener: noop };
  env.globals = {
    Date: FakeDate, localStorage, console, crypto: globalThis.crypto, Intl,
    window: { ...listenerTarget, confirm: () => true },
    document: { ...listenerTarget, visibilityState: "visible", documentElement: { classList: { add: noop, remove: noop } }, body: { style: {} } },
    navigator: {},
    setInterval: (fn) => { const id = ++env.seq; env.intervals.set(id, fn); return id; },
    clearInterval: (id) => env.intervals.delete(id),
    setTimeout: (fn, ms = 0) => { const id = ++env.seq; env.timeouts.set(id, { fn, at: env.now + ms }); return id; },
    clearTimeout: (id) => env.timeouts.delete(id),
  };
  const query = (table) => {
    const call = { table, ops: [] };
    env.supabaseCalls.push(call);
    const chain = new Proxy({}, { get: (_, op) => op === "then"
      ? (resolveFn) => Promise.resolve({ data: null, error: null }).then(resolveFn)
      : (...args) => { call.ops.push([op, args]); return chain; } });
    return chain;
  };
  env.mocks = {
    "contexts/AuthContext": { useAuth: () => ({ user: env.user, loading: false }) },
    "lib/supabaseClient": { supabase: { from: query, rpc: (...args) => query(`rpc:${args[0]}`) } },
    "contexts/I18nContext": { useI18n: () => ({ t: (k) => k, lang: "fr" }) },
    "lib/sensoryFeedback": { playSensoryCue: (c) => env.cues.push(c), triggerHaptic: (h) => env.haptics.push(h) },
    "lib/useWakeLock": { useWakeLock: () => {} },
    "components/FilterMenu": { default: ({ value, ariaLabel }) => React.createElement("filter-menu", { value, "aria-label": ariaLabel }) },
  };
  env.load = makeLoader(env);
  return env;
}

function makeLoader(env) {
  const cache = new Map();
  function resolveFile(abs) {
    for (const candidate of [abs, `${abs}.js`, `${abs}.mjs`, `${abs}.jsx`]) if (existsSync(candidate) && !candidate.endsWith("/")) return candidate;
    throw new Error(`cannot resolve ${abs}`);
  }
  function load(file) {
    const rel = relative(ROOT, file).replace(/\.(m?js|jsx)$/, "");
    if (env.mocks[rel]) return env.mocks[rel];
    if (cache.has(file)) return cache.get(file).exports;
    const module = { exports: {} };
    cache.set(file, module);
    const { code } = transformSync(readFileSync(file, "utf8"), { ...babel, filename: file });
    const req = (id) => (id.startsWith(".") ? load(resolveFile(resolve(dirname(file), id))) : require(id));
    vm.runInNewContext(code, { module, exports: module.exports, require: req, ...env.globals });
    return module.exports;
  }
  return (path) => load(resolveFile(join(ROOT, path)));
}

// Une page qui affiche le Chrono, montée dans le moteur global comme sous _app.
function mountApp(env, { pageMounted = true, opts = {} } = {}) {
  const { TimerProvider } = env.load("contexts/TimerContext");
  const { useChrono } = env.load("components/timer/useChrono");
  const saved = [];
  const page = { saved, chrono: null, mounted: pageMounted };
  function Page() {
    page.chrono = useChrono({ ownerId: env.user?.id || "guest-local", enabled: true, defaultMode: "free",
      onWorkComplete: (payload) => saved.push(payload), ...opts });
    return null;
  }
  const tree = () => React.createElement(TimerProvider, null, page.mounted ? React.createElement(Page) : null);
  let renderer;
  act(() => { renderer = create(tree()); });
  page.rerender = () => act(() => renderer.update(tree()));
  page.leave = () => { page.mounted = false; page.rerender(); };
  page.back = () => { page.mounted = true; page.rerender(); };
  page.close = () => act(() => renderer.unmount());
  page.do = (fn) => act(() => fn(page.chrono));
  return page;
}

// Le temps passe : l'horloge avance, les minuteries échues partent, le
// chrono re-rend (intervalle de 500 ms) et ses effets réagissent.
function advance(env, ms) {
  act(() => {
    env.now += ms;
    for (const [id, t] of [...env.timeouts]) if (t.at <= env.now) { env.timeouts.delete(id); t.fn(); }
    for (const fn of [...env.intervals.values()]) fn();
  });
  act(() => {
    for (const [id, t] of [...env.timeouts]) if (t.at <= env.now) { env.timeouts.delete(id); t.fn(); }
  });
}
const snapshot = (env, key = GUEST_KEY) => JSON.parse(env.store.get(key));
// Valeurs nées dans le bac à sable (autre « realm ») : comparées en clair.
const plain = (value) => JSON.parse(JSON.stringify(value));

test("Libre : démarrer, pause, reprise, fin — une session, un id, rien vers Supabase", () => {
  const env = makeBrowser();
  const page = mountApp(env);
  assert.equal(page.chrono.hydrated, true);
  assert.equal(page.chrono.pomodoro, false);
  page.do((c) => c.setCourseId("guest-course-physics"));
  page.do((c) => c.startWithFeedback());
  assert.deepEqual(env.cues, ["start"]);
  const id = page.chrono.sessionId;
  assert.match(id, UUID);
  advance(env, 90_000);
  assert.equal(page.chrono.elapsed, 90);
  assert.equal(page.chrono.liveStudySecs, 90);
  page.do((c) => c.pauseWithFeedback());
  advance(env, 60_000);
  assert.equal(page.chrono.running, false);
  assert.equal(page.chrono.isPaused, true);
  assert.equal(page.chrono.elapsed, 90);
  assert.equal(page.chrono.pauseSince, "01:00");
  page.do((c) => c.startWithFeedback());
  advance(env, 30_000);
  assert.deepEqual(env.cues, ["start", "pause", "resume"]);
  assert.equal(page.chrono.elapsed, 120);
  assert.equal(page.chrono.sessionId, id, "pause/reprise gardent la même session");
  // « Terminer » côté page : quitter le cycle puis remettre à zéro.
  page.do((c) => { c.leavePomodoro(); c.reset(); });
  assert.equal(page.chrono.elapsed, 0);
  assert.equal(page.chrono.sessionId, "");
  assert.equal(page.saved.length, 0, "le mode Libre n'enregistre rien tout seul");
  assert.deepEqual(env.supabaseCalls, [], "un invité ne parle jamais à Supabase");
  assert.equal(env.store.has(QUEUE_KEY), false);
  page.close();
});

test("Pomodoro : travail, fin automatique, repos, fin du repos — seul le travail est enregistré", () => {
  const env = makeBrowser();
  const page = mountApp(env);
  page.do((c) => c.pickMode("pomodoro"));
  assert.equal(page.chrono.pomodoro, true);
  assert.equal(page.chrono.pomoPhase, "work");
  page.do((c) => c.startWithFeedback());
  const workId = page.chrono.sessionId;
  advance(env, 24 * 60_000);
  assert.equal(page.saved.length, 0);
  assert.equal(page.chrono.blockGoalSecs, 25 * 60);
  advance(env, 60_000);
  assert.equal(page.saved.length, 1, "un seul bloc de travail");
  assert.equal(page.saved[0].duration_seconds, 25 * 60);
  assert.equal(page.saved[0].id, workId, "le bloc porte l'id de la session");
  assert.equal(page.saved[0].user_id, "guest-local");
  assert.equal(page.chrono.pomoPhase, "break");
  assert.equal(page.chrono.pomoCount, 1);
  assert.ok(env.cues.includes("pomodoro"));
  // La pause démarre seule 80 ms plus tard, avec sa propre session.
  advance(env, 100);
  assert.equal(page.chrono.running, true);
  assert.equal(page.chrono.onBreak, true);
  assert.notEqual(page.chrono.sessionId, workId);
  advance(env, 2 * 60_000);
  assert.equal(page.chrono.liveStudySecs, 0, "la pause n'est pas du temps étudié");
  assert.equal(page.chrono.blockGoalSecs, null);
  advance(env, 3 * 60_000);
  assert.equal(page.chrono.running, false);
  assert.equal(page.chrono.elapsed, 0);
  assert.equal(page.chrono.pomoPhase, "work");
  assert.equal(page.chrono.hint, "dash.breakEnded");
  assert.equal(env.cues.at(-1), "breakEnd");
  assert.equal(page.saved.length, 1, "la pause n'est jamais enregistrée");
  assert.deepEqual(env.supabaseCalls, []);
  page.close();
});

test("Pomodoro : durées personnalisées appliquées et mémorisées", () => {
  const env = makeBrowser();
  const page = mountApp(env);
  page.do((c) => { c.pickMode("pomodoro"); c.pickWorkMin(15); c.setPomoBreakMin(3); });
  assert.equal(snapshot(env).pomoWorkMin, 15);
  assert.equal(snapshot(env).pomoBreakMin, 3);
  page.do((c) => c.startWithFeedback());
  advance(env, 15 * 60_000);
  assert.equal(page.saved[0].duration_seconds, 15 * 60);
  advance(env, 100);
  assert.equal(page.chrono.pomoTargetSecs, 3 * 60);
  advance(env, 3 * 60_000);
  assert.equal(page.chrono.pomoPhase, "work");
  page.close();
  // Rechargement au repos : la page s'ouvre en Libre, les durées restent.
  const again = mountApp(env);
  assert.equal(again.chrono.pomodoro, false);
  assert.equal(again.chrono.pomoWorkMin, 15);
  assert.equal(again.chrono.pomoBreakMin, 3);
  again.close();
});

test("rechargement pendant le travail : Pomodoro, phase et temps restent, puis un seul bloc", () => {
  const env = makeBrowser();
  const page = mountApp(env);
  page.do((c) => { c.setCourseId("guest-course-physics"); c.pickMode("pomodoro"); });
  page.do((c) => c.startWithFeedback());
  const workId = page.chrono.sessionId;
  advance(env, 5 * 60_000);
  const snap = snapshot(env);
  assert.equal(snap.pomodoro, true);
  assert.equal(snap.pomoPhase, "work");
  assert.equal(snap.running, true);
  assert.equal(snap.sessionId, workId);
  assert.equal(snap.startMs, T0);
  page.close();
  env.now += 60_000;
  const reloaded = mountApp(env);
  assert.equal(reloaded.chrono.pomodoro, true);
  assert.equal(reloaded.chrono.pomoPhase, "work");
  assert.equal(reloaded.chrono.running, true);
  assert.equal(reloaded.chrono.elapsed, 6 * 60);
  assert.equal(reloaded.chrono.courseId, "guest-course-physics");
  advance(env, 19 * 60_000);
  assert.equal(reloaded.saved.length, 1);
  assert.equal(reloaded.saved[0].id, workId);
  assert.equal(reloaded.saved[0].duration_seconds, 25 * 60);
  reloaded.close();
});

test("rechargement pendant un travail en pause : la pause reste une pause du travail", () => {
  const env = makeBrowser();
  const page = mountApp(env);
  page.do((c) => c.pickMode("pomodoro"));
  page.do((c) => c.startWithFeedback());
  advance(env, 5 * 60_000);
  page.do((c) => c.pauseWithFeedback());
  page.close();
  env.now += 10 * 60_000;
  const reloaded = mountApp(env);
  assert.equal(reloaded.chrono.pomodoro, true);
  assert.equal(reloaded.chrono.pomoPhase, "work");
  assert.equal(reloaded.chrono.isPaused, true);
  assert.equal(reloaded.chrono.elapsed, 5 * 60);
  assert.equal(reloaded.chrono.pomoTargetSecs - reloaded.chrono.elapsed, 20 * 60);
  reloaded.close();
});

test("rechargement pendant le repos : le repos reste du repos et ne s'enregistre jamais", () => {
  const env = makeBrowser();
  const page = mountApp(env);
  page.do((c) => c.pickMode("pomodoro"));
  page.do((c) => c.startWithFeedback());
  advance(env, 25 * 60_000);
  advance(env, 100);
  advance(env, 60_000);
  assert.equal(page.chrono.onBreak, true);
  page.close();
  const reloaded = mountApp(env);
  assert.equal(reloaded.chrono.pomodoro, true, "avant le correctif, le chrono redevenait Libre ici");
  assert.equal(reloaded.chrono.pomoPhase, "break");
  assert.equal(reloaded.chrono.onBreak, true);
  assert.equal(reloaded.chrono.liveStudySecs, 0);
  assert.equal(reloaded.chrono.blockGoalSecs, null);
  assert.equal(reloaded.chrono.pomoCount, 1);
  advance(env, 4 * 60_000);
  assert.equal(reloaded.chrono.running, false);
  assert.equal(reloaded.chrono.elapsed, 0);
  assert.equal(reloaded.chrono.pomoPhase, "work");
  assert.equal(reloaded.saved.length, 0, "la pause n'a produit aucune session");
  reloaded.close();
});

test("rechargement pendant un repos mis en pause (Espace dans Focus) : toujours du repos", () => {
  const env = makeBrowser();
  const page = mountApp(env);
  page.do((c) => c.pickMode("pomodoro"));
  page.do((c) => c.startWithFeedback());
  advance(env, 25 * 60_000);
  advance(env, 100);
  advance(env, 60_000);
  page.do((c) => c.pauseWithFeedback());
  page.close();
  const reloaded = mountApp(env);
  assert.equal(reloaded.chrono.pomodoro, true);
  assert.equal(reloaded.chrono.onBreak, true);
  assert.equal(reloaded.chrono.isPaused, true);
  assert.equal(reloaded.chrono.liveStudySecs, 0);
  reloaded.close();
});

test("changer de page puis revenir : le cycle continue sans relecture du stockage", () => {
  const env = makeBrowser();
  const page = mountApp(env);
  page.do((c) => c.pickMode("pomodoro"));
  page.do((c) => c.startWithFeedback());
  advance(env, 10 * 60_000);
  page.leave();
  advance(env, 20 * 60_000);
  assert.equal(page.saved.length, 0, "sans page du Chrono, rien n'est clos en arrière-plan");
  page.back();
  assert.equal(page.chrono.pomodoro, true);
  advance(env, 500);
  assert.equal(page.saved.length, 1, "au retour, le bloc de travail est clos à 25 min");
  assert.equal(page.saved[0].duration_seconds, 25 * 60);
  assert.equal(page.chrono.pomoPhase, "break");
  page.close();
});

test("au repos, le Dashboard rouvre en Libre — un Pomodoro terminé ne colle pas", () => {
  const env = makeBrowser();
  const page = mountApp(env);
  page.do((c) => c.pickMode("pomodoro"));
  page.do((c) => c.startWithFeedback());
  advance(env, 25 * 60_000);
  advance(env, 100);
  advance(env, 5 * 60_000);
  assert.equal(page.chrono.pomoCount, 1);
  assert.equal(page.chrono.running, false);
  page.close();
  const reloaded = mountApp(env);
  assert.equal(reloaded.chrono.pomodoro, false);
  assert.equal(reloaded.chrono.pomoCount, 0);
  assert.equal(snapshot(env).pomodoro, false);
  reloaded.close();
  // Un Pomodoro choisi mais jamais démarré ne survit pas non plus à la page.
  const idle = mountApp(env);
  idle.do((c) => c.pickMode("pomodoro"));
  idle.leave();
  idle.back();
  assert.equal(idle.chrono.pomodoro, false);
  idle.close();
});

test("ancien instantané sans champs Pomodoro : Libre, 25/5, session conservée", () => {
  const env = makeBrowser();
  env.store.set(GUEST_KEY, JSON.stringify({ courseId: "guest-course-economics", note: "", running: true, startMs: T0 - 600_000, baseSeconds: 30, timezone: "Europe/Brussels" }));
  const page = mountApp(env);
  assert.equal(page.chrono.pomodoro, false);
  assert.equal(page.chrono.pomoPhase, "work");
  assert.equal(page.chrono.pomoWorkMin, 25);
  assert.equal(page.chrono.pomoBreakMin, 5);
  assert.equal(page.chrono.running, true);
  assert.equal(page.chrono.elapsed, 630);
  assert.equal(page.chrono.courseId, "guest-course-economics");
  assert.equal(page.chrono.sessionId, "", "pas d'id inventé pour une session commencée avant");
  page.close();
});

test("instantané corrompu ou invalide : valeurs sûres", () => {
  const env = makeBrowser();
  env.store.set(GUEST_KEY, "{not json");
  const broken = mountApp(env);
  assert.equal(broken.chrono.running, false);
  assert.equal(broken.chrono.pomodoro, false);
  broken.close();
  env.store.set(GUEST_KEY, JSON.stringify({ running: false, baseSeconds: 120, pomodoro: "yes", pomoPhase: "rest", pomoWorkMin: 999, pomoBreakMin: -1, pomoCount: -3, sessionId: "abc" }));
  const odd = mountApp(env);
  assert.equal(odd.chrono.pomodoro, false);
  assert.equal(odd.chrono.pomoPhase, "work");
  assert.equal(odd.chrono.pomoWorkMin, 25);
  assert.equal(odd.chrono.pomoBreakMin, 5);
  assert.equal(odd.chrono.pomoCount, 0);
  assert.equal(odd.chrono.sessionId, "");
  assert.equal(odd.chrono.elapsed, 120);
  odd.close();
});

test("invité puis compte : instantanés séparés, la session invitée ne devient jamais celle du compte", () => {
  const env = makeBrowser();
  const page = mountApp(env);
  page.do((c) => c.pickMode("pomodoro"));
  page.do((c) => c.startWithFeedback());
  advance(env, 10 * 60_000);
  assert.ok(env.store.has(GUEST_KEY));
  assert.deepEqual(env.supabaseCalls, []);
  // Connexion pendant la visite.
  env.user = { id: "11111111-1111-4111-8111-111111111111" };
  page.rerender();
  assert.equal(page.chrono.running, false);
  assert.equal(page.chrono.elapsed, 0);
  assert.equal(page.chrono.pomodoro, false);
  assert.equal(page.chrono.sessionId, "");
  assert.equal(env.store.has(GUEST_KEY), false, "le chrono invité est jeté à la connexion");
  assert.ok(env.store.has(`bt_timer_v2:${env.user.id}`));
  assert.equal(env.store.has(QUEUE_KEY), false, "rien n'est mis en file pour le compte");
  assert.ok(env.supabaseCalls.every((call) => call.table === "profiles"), "seule la présence du compte est écrite");
  advance(env, 30 * 60_000);
  assert.equal(page.saved.length, 0, "aucun bloc invité n'est clos au nom du compte");
  page.close();
});

test("deux onglets sur le même Pomodoro : un seul id, compté une fois dans l'espace invité", () => {
  const env = makeBrowser();
  const tabA = mountApp(env);
  tabA.do((c) => c.pickMode("pomodoro"));
  tabA.do((c) => c.startWithFeedback());
  advance(env, 5 * 60_000);
  const tabB = mountApp(env); // ouvert pendant le Pomodoro : il relit le même chrono
  assert.equal(tabB.chrono.sessionId, tabA.chrono.sessionId);
  advance(env, 20 * 60_000);
  assert.equal(tabA.saved.length, 1);
  assert.equal(tabB.saved.length, 1);
  assert.equal(tabA.saved[0].id, tabB.saved[0].id);
  const { appendGuestSession } = env.load("lib/guestStudySpace");
  appendGuestSession(tabA.saved[0], "fr");
  const sessions = appendGuestSession(tabB.saved[0], "fr");
  assert.equal(sessions.length, 1);
  assert.equal(JSON.parse(env.store.get("bt_guest_dashboard_v2")).sessions.length, 1);
  tabA.close();
  tabB.close();
});

test("espace invité : relu au moment d'écrire, première session gardée, cours conservés", () => {
  const env = makeBrowser();
  const space = env.load("lib/guestStudySpace");
  const seeded = space.readGuestDashboardData("fr");
  assert.deepEqual(plain(seeded.courses.map((c) => c.id)), ["guest-course-physics", "guest-course-economics"]);
  const first = { id: "a", user_id: space.GUEST_USER_ID, duration_seconds: 600 };
  space.appendGuestSession(first, "fr");
  // Un autre onglet écrit une autre session entre-temps.
  space.appendGuestSession({ id: "b", user_id: space.GUEST_USER_ID, duration_seconds: 300 }, "fr");
  const again = space.appendGuestSession({ ...first, duration_seconds: 900 }, "fr");
  assert.deepEqual(plain(again.map((s) => [s.id, s.duration_seconds])), [["b", 300], ["a", 600]]);
  const stored = JSON.parse(env.store.get(space.GUEST_DASHBOARD_KEY));
  assert.equal(stored.courses.length, 2);
  assert.deepEqual([...env.store.keys()], [space.GUEST_DASHBOARD_KEY], "aucune autre clé, jamais la file hors ligne");
});

test("file hors ligne des comptes inchangée : id, dédoublonnage, refus du plafond, invité exclu", async () => {
  const env = makeBrowser();
  const draft = env.load("lib/timerDraft");
  const { newClientId } = env.load("lib/clientId.mjs");
  assert.equal(draft.newClientId, newClientId, "même fonction d'id, réexportée");
  assert.match(draft.newClientId(), UUID);
  const shared = [];
  env.mocks["lib/autoShare"] = { shareSavedSession: async (_db, row) => { shared.push(row.id); return true; } };
  const draftWithShare = makeLoader(env)("lib/timerDraft");
  const user = "22222222-2222-4222-8222-222222222222";
  const row = (id, extra = {}) => ({ id, user_id: user, course_id: null, duration_seconds: 600, note: null, started_at: "2026-10-07T12:00:00Z", ended_at: "2026-10-07T12:10:00Z", ...extra });
  assert.equal(draftWithShare.enqueueSession({ id: "", user_id: user }), null);
  draftWithShare.enqueueSession(row("new"));
  draftWithShare.enqueueSession(row("new"));
  draftWithShare.enqueueSession(row("dup"));
  draftWithShare.enqueueSession(row("cap"));
  draftWithShare.enqueueSession(row("net"));
  draftWithShare.enqueueSession({ ...row("guest"), user_id: "guest-local" });
  assert.equal(draftWithShare.listPending(user).length, 4, "id unique, invité jamais listé pour le compte");
  assert.deepEqual(plain(draftWithShare.listPending("")), []);
  const inDb = new Set(["dup"]);
  const inserted = [];
  const db = { from: () => ({ insert: (payload) => ({ select: () => ({ maybeSingle: async () => {
    if (payload.id === "net") return { data: null, error: { code: "PGRST000", message: "network" } };
    if (payload.id === "cap") return { data: null, error: { code: "22023", hint: "daily_cap", details: "2026-10-07" } };
    if (inDb.has(payload.id)) return { data: null, error: { code: "23505" } };
    inDb.add(payload.id); inserted.push(payload);
    return { data: payload, error: null };
  } }) }) }) };
  const res = await draftWithShare.flushPending(db, user);
  assert.deepEqual([res.synced, res.alreadyExists, res.rejected, res.failed], [1, 1, 1, 1]);
  assert.deepEqual(inserted.map((p) => p.id), ["new"]);
  assert.deepEqual(shared, ["new", "dup"]);
  assert.deepEqual(plain(draftWithShare.listPending(user).map((p) => p.id)), ["net"], "seule l'erreur réseau reste en file");
  assert.deepEqual(JSON.parse(env.store.get(QUEUE_KEY)).map((p) => p.id), ["net", "guest"]);
  assert.equal((await draftWithShare.flushPending(db, "")).synced, 0);
});

test("la carte pendant un repos restauré : « Passer la pause », jamais « Terminer »", () => {
  const env = makeBrowser();
  const page = mountApp(env);
  page.do((c) => c.pickMode("pomodoro"));
  page.do((c) => c.startWithFeedback());
  advance(env, 25 * 60_000);
  advance(env, 100);
  advance(env, 60_000);
  page.close();
  const reloaded = mountApp(env);
  const ChronoCard = env.load("components/timer/ChronoCard").default;
  let card;
  act(() => { card = create(React.createElement(ChronoCard, { chrono: reloaded.chrono, courses: [], activeCourses: [] })); });
  const texts = card.root.findAllByType("button").map((b) => b.findAll(() => true).flatMap((n) => n.children).filter((c) => typeof c === "string").join(""));
  assert.ok(texts.some((t) => t.includes("dash.skipBreak")));
  assert.ok(!texts.some((t) => t.includes("dash.finish")));
  assert.ok(!texts.some((t) => t.includes("dash.start") || t.includes("dash.resume")));
  act(() => card.unmount());
  reloaded.close();
});
