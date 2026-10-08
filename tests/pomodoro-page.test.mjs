// /pomodoro avec le vrai Chrono (P1-B, phase 2) : la page réelle (pages/pomodoro.js,
// SeoLandingPage, PublicChrono) montée sur les vrais moteurs (TimerContext,
// I18nContext, useChrono, espace invité), horloge pilotée, stockage local qui
// survit à un « rechargement », Supabase et les sons remplacés par des
// enregistreurs. L'en-tête/pied publics, les menus déroulants, next/link et le
// plein écran Focus sont des doublures (CSS modules, routeur, WebGL).
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const require = createRequire(import.meta.url);
const React = require("react");
const { renderToString } = require("react-dom/server");
const { act, create } = require("react-test-renderer");
const { transformSync } = require("@babel/core");
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const babel = { babelrc: false, configFile: false,
  presets: [[require.resolve("next/babel"), { "preset-react": { runtime: "automatic" } }]],
  plugins: [require.resolve("@babel/plugin-transform-modules-commonjs")] };
const h = React.createElement;
const T0 = Date.parse("2026-10-07T14:00:00+02:00");
const GUEST_TIMER = "bt_timer_v2:guest";
const GUEST_SPACE = "bt_guest_dashboard_v2";
const QUEUE_KEY = "bt_pending_sessions_v1";
const ACCOUNT = { id: "11111111-2222-4333-8444-555555555555" };

function makeEnv({ user = null, loading = false, deviceLanguage = "en-US" } = {}) {
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
    auth: { user, loading }, supabaseCalls: [], cues: [], headerRenders: 0 };
  const RealDate = Date;
  class FakeDate extends RealDate {
    constructor(...a) { if (a.length === 0) super(env.now); else super(...a); }
    static now() { return env.now; }
  }
  const noop = () => {};
  const listenerTarget = { addEventListener: noop, removeEventListener: noop };
  env.globals = {
    Date: FakeDate, localStorage, console, crypto: globalThis.crypto, Intl,
    window: { ...listenerTarget, confirm: () => true, matchMedia: () => ({ matches: false }) },
    document: { ...listenerTarget, visibilityState: "visible", documentElement: { classList: { add: noop, remove: noop } }, body: { style: {} } },
    navigator: { language: deviceLanguage, languages: [deviceLanguage] },
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
  const text = (children) => React.Children.toArray(children).join("");
  env.mocks = {
    "contexts/AuthContext": { useAuth: () => env.auth },
    "lib/supabaseClient": { supabase: { from: query, rpc: (...args) => query(`rpc:${args[0]}`) } },
    "lib/sensoryFeedback": { playSensoryCue: (c) => env.cues.push(c), triggerHaptic: noop },
    "lib/useWakeLock": { useWakeLock: noop },
    "next/router": { useRouter: () => ({ pathname: "/pomodoro", asPath: "/pomodoro" }) },
    "next/link": { __esModule: true, default: ({ href, children, ...rest }) => h("a", { href, ...rest }, children) },
    "next/image": { __esModule: true, default: (props) => h("img", { src: props.src, alt: props.alt }) },
    "next/dynamic": { __esModule: true, default: () => (props) => h("chrono-focus", { open: "1", onClose: props.onClose, noCourseLabel: props.noCourseLabel }) },
    "components/timer/ChronoFocus": { __esModule: true, default: () => null },
    "components/landing/PublicHeader": { __esModule: true, default: () => { env.headerRenders += 1; return h("header", null, "header"); } },
    "components/landing/PublicFooter": { __esModule: true, default: () => h("footer", null, "footer") },
    "components/FilterMenu": { __esModule: true, default: ({ value, options, onChange, ariaLabel }) =>
      h("filter-menu", { value, "aria-label": ariaLabel, onChange }, text(options.find((o) => o.value === value)?.label)) },
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
    const rel = relative(ROOT, file).replace(/\.(m?js|jsx|cjs)$/, "");
    if (env.mocks[rel]) return env.mocks[rel];
    if (cache.has(file)) return cache.get(file).exports;
    const mod = { exports: {} };
    cache.set(file, mod);
    const { code } = transformSync(readFileSync(file, "utf8"), { ...babel, filename: file });
    const req = (id) => (id.startsWith(".") ? load(resolveFile(resolve(dirname(file), id))) : env.mocks[id] || require(id));
    vm.runInNewContext(code, { module: mod, exports: mod.exports, require: req, process, ...env.globals });
    return mod.exports;
  }
  return (path) => load(resolveFile(join(ROOT, path)));
}

// La page telle que _app la monte : langue, chrono global, page.
function pageTree(env) {
  const { I18nProvider } = env.load("contexts/I18nContext");
  const { TimerProvider } = env.load("contexts/TimerContext");
  const Pomodoro = env.load("pages/pomodoro").default;
  return () => h(I18nProvider, null, h(TimerProvider, null, h(Pomodoro)));
}

function mount(env) {
  const tree = pageTree(env);
  let renderer;
  act(() => { renderer = create(tree()); });
  const page = {
    renderer,
    update: () => act(() => renderer.update(tree())),
    close: () => act(() => renderer.unmount()),
  };
  page.text = (node = renderer.root) => textOf(node);
  page.tool = () => renderer.root.findAll((n) => n.props?.id === "minuteur")[0];
  page.buttons = () => page.tool().findAll((n) => n.type === "button");
  page.button = (re) => page.buttons().find((b) => re.test(textOf(b)));
  page.click = (re) => {
    const b = page.button(re);
    assert.ok(b, `bouton ${re} introuvable — ${page.buttons().map((x) => textOf(x)).join(" | ")}`);
    act(() => b.props.onClick());
  };
  page.menu = (label) => page.tool().findAll((n) => n.type === "filter-menu" && n.props["aria-label"] === label)[0];
  page.pick = (label, value) => act(() => page.menu(label).props.onChange(value));
  page.focusOpen = () => renderer.root.findAll((n) => n.type === "chrono-focus").length > 0;
  return page;
}

function textOf(node) {
  if (typeof node === "string") return node;
  return (node.children || []).map(textOf).join("");
}

// Le temps passe : horloge, minuteries échues, tic de 500 ms du chrono.
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
const read = (env, key) => JSON.parse(env.store.get(key) ?? "null");
const plain = (value) => JSON.parse(JSON.stringify(value));
const sessionsWrites = (env) => env.supabaseCalls.filter((c) => c.table === "sessions" || c.table.startsWith("rpc:"));
const htmlText = (html) => html.replace(/<[^>]+>/g, "").replace(/&#x27;/g, "'").replace(/\s+/g, " ");

test("rendu serveur : HTML français sous un navigateur en-US, un seul H1, minuteur au repos prêt, inerte", () => {
  const env = makeEnv({ loading: true, deviceLanguage: "en-US" });
  const html = renderToString(pageTree(env)());
  const text = htmlText(html);
  assert.equal((html.match(/<h1[\s>]/g) || []).length, 1);
  assert.match(html, /<h1[^>]*>Minuteur Pomodoro gratuit pour étudier<\/h1>/);
  for (const expected of ["Travail", "25:00", "Pomodoro", "25 min", "5 min", "Démarrer", "Focus"]) assert.ok(text.includes(expected), expected);
  assert.match(html, /<div id="minuteur"[^>]*><div inert="">/);
  assert.doesNotMatch(text, /Free Pomodoro timer|Start\b|Work duration|Session mode/);
  // L'outil remplace l'illustration et le bouton vers l'app du héros.
  assert.doesNotMatch(html, /seo-preview/);
  assert.doesNotMatch(text, /Essayer le chrono Pomodoro/);
});

test("rendu serveur : rien du stockage local — même HTML avec ou sans session invitée enregistrée", () => {
  const empty = makeEnv({ loading: true });
  const withSnapshot = makeEnv({ loading: true });
  withSnapshot.store.set(GUEST_TIMER, JSON.stringify({ courseId: "guest-course-physics", note: "", running: true, startMs: T0 - 10 * 60_000,
    baseSeconds: 0, timezone: "Europe/Brussels", sessionId: "", pomodoro: false, pomoPhase: "work", pomoCount: 0, pomoWorkMin: 50, pomoBreakMin: 10 }));
  withSnapshot.store.set(GUEST_SPACE, JSON.stringify({ courses: [], sessions: [{ id: "x", duration_seconds: 60 }] }));
  assert.equal(renderToString(pageTree(withSnapshot)()), renderToString(pageTree(empty)()));
});

test("invité : Pomodoro par défaut, démarrer, pause, reprise — Démarrer n'ouvre pas Focus, Focus à la demande", () => {
  const env = makeEnv();
  const page = mount(env);
  assert.match(page.text(page.tool()), /Travail25:00/);
  assert.equal(page.menu("Mode de session").props.value, "pomodoro");
  assert.equal(page.menu("Durée de travail").props.value, "25");
  assert.equal(page.menu("Durée de pause").props.value, "5");
  // Pas de choix de cours en Pomodoro.
  assert.equal(page.tool().findAll((n) => n.props?.["aria-haspopup"] === "listbox").length, 0);
  assert.equal(page.tool().findAll((n) => n.props?.inert !== undefined).length, 0);

  page.click(/^Démarrer$/);
  assert.equal(page.focusOpen(), false);
  advance(env, 3 * 60_000);
  assert.match(page.text(page.tool()), /22:00/);
  page.click(/^Pause$/);
  advance(env, 60_000);
  assert.match(page.text(page.tool()), /22:00.*Reprendre/);
  page.click(/^Reprendre$/);
  advance(env, 60_000);
  assert.match(page.text(page.tool()), /21:00/);
  page.click(/Focus/);
  assert.equal(page.focusOpen(), true);
  assert.equal(read(env, GUEST_TIMER).pomodoro, true);
  page.close();
});

test("invité : la durée se règle dans les bornes existantes, travail → repos enregistre un bloc dans l'espace invité, le repos survit au rechargement", () => {
  const env = makeEnv();
  let page = mount(env);
  page.pick("Durée de travail", "50");
  page.pick("Durée de pause", "10");
  assert.match(page.text(page.tool()), /50:00/);
  page.click(/^Démarrer$/);
  advance(env, 50 * 60_000);
  advance(env, 100);
  const space = read(env, GUEST_SPACE);
  assert.equal(space.sessions.length, 1);
  assert.equal(space.sessions[0].duration_seconds, 3000);
  assert.equal(space.sessions[0].user_id, "guest-local");
  let snap = read(env, GUEST_TIMER);
  assert.deepEqual([snap.pomodoro, snap.pomoPhase, snap.pomoCount, snap.running], [true, "break", 1, true]);

  advance(env, 4 * 60_000);
  page.close();
  page = mount(env);
  const text = page.text(page.tool());
  assert.match(text, /Pause· Cycle 1/);
  assert.match(text, /06:00/);
  assert.ok(page.button(/Passer la pause/));
  assert.equal(page.button(/Terminer/), undefined, "le repos ne s'enregistre jamais comme temps étudié");
  advance(env, 6 * 60_000);
  assert.match(page.text(page.tool()), /Travail· Cycle 1.*50:00/);
  assert.equal(read(env, GUEST_SPACE).sessions.length, 1);
  assert.equal(env.store.has(QUEUE_KEY), false);
  assert.deepEqual(sessionsWrites(env), []);
  assert.deepEqual(env.supabaseCalls, []);
  page.close();
});

test("invité : Libre avec les deux cours d'exemple de la Découverte, Terminer → la session est dans l'espace que lit le Dashboard", () => {
  const env = makeEnv();
  const { defaultGuestDashboardData, readGuestDashboardData, GUEST_DASHBOARD_KEY } = env.load("lib/guestStudySpace");
  assert.equal(GUEST_DASHBOARD_KEY, GUEST_SPACE);
  const page = mount(env);
  page.pick("Mode de session", "free");
  const picker = page.tool().findAll((n) => n.type === "button" && n.props["aria-haspopup"] === "listbox")[0];
  assert.match(textOf(picker), /Physique/);
  act(() => picker.props.onClick());
  const options = page.tool().findAll((n) => n.props?.role === "option").map((o) => textOf(o));
  assert.deepEqual(plain(options), plain(defaultGuestDashboardData("fr").courses.map((c) => c.name)));
  // Pas d'« Ajouter un cours » : /pomodoro ne crée pas de cours.
  assert.equal(page.tool().findAll((n) => n.type === "button" && /Ajouter un cours/.test(textOf(n))).length, 0);
  act(() => page.tool().findAll((n) => n.props?.role === "option")[1].props.onClick());

  page.click(/^Démarrer$/);
  advance(env, 2 * 60_000);
  page.click(/^Terminer/);
  const sessions = plain(readGuestDashboardData("fr").sessions);
  assert.equal(sessions.length, 1);
  assert.equal(sessions[0].duration_seconds, 120);
  assert.equal(sessions[0].course_id, "guest-course-economics");
  assert.match(sessions[0].id, /^[0-9a-f-]{36}$/);
  assert.deepEqual(plain(readGuestDashboardData("fr").courses.map((c) => [c.id, c.name, c.color])),
    plain(defaultGuestDashboardData("fr").courses.map((c) => [c.id, c.name, c.color])));
  // Libre reste Libre après Terminer.
  assert.equal(page.menu("Mode de session").props.value, "free");
  assert.equal(env.store.has(QUEUE_KEY), false);
  assert.deepEqual(env.supabaseCalls, []);
  page.close();
});

test("invité : un Pomodoro lancé ici ne porte aucun cours, même choisi ailleurs ou en Libre — Focus dit « Session Pomodoro »", () => {
  const env = makeEnv();
  // Le Dashboard invité avait proposé Physique au repos.
  env.store.set(GUEST_TIMER, JSON.stringify({ courseId: "guest-course-physics", note: "", running: false, startMs: 0, baseSeconds: 0,
    timezone: "", sessionId: "", pomodoro: false, pomoPhase: "work", pomoCount: 0, pomoWorkMin: 25, pomoBreakMin: 5 }));
  const page = mount(env);
  assert.equal(read(env, GUEST_TIMER).courseId, "");
  page.pick("Mode de session", "free");
  assert.equal(read(env, GUEST_TIMER).courseId, "guest-course-physics");
  page.pick("Mode de session", "pomodoro");
  assert.equal(read(env, GUEST_TIMER).courseId, "");
  page.click(/^Démarrer$/);
  page.click(/Focus/);
  const focus = page.renderer.root.findAll((n) => n.type === "chrono-focus")[0];
  assert.equal(focus.props.noCourseLabel, "Session Pomodoro");
  advance(env, 25 * 60_000);
  advance(env, 100);
  const sessions = read(env, GUEST_SPACE).sessions;
  assert.equal(sessions.length, 1);
  assert.equal(sessions[0].course_id, null);
  page.close();
});

test("invité : la fin d'une session dit honnêtement où elle est gardée", () => {
  const env = makeEnv();
  const page = mount(env);
  page.click(/^Démarrer$/);
  advance(env, 60_000);
  page.click(/^Terminer/);
  const text = page.text(page.tool());
  assert.match(text, /Conservée sur cet appareil/);
  assert.doesNotMatch(text, /Session enregistrée/);
  page.close();
});

test("Dashboard : une session ouverte sans cours n'en reçoit pas en silence (les deux replis de cours)", () => {
  const source = readFileSync(join(ROOT, "pages/dashboard.js"), "utf8");
  assert.match(source, /const courselessSession = !courseId && \(running \|\| elapsed > 0\);/);
  assert.match(source, /setCourseId\(current => \(!current && courselessSessionRef\.current\) \|\| active\.some/);
  assert.match(source, /!activeCourses\.length \|\| courselessSession\) return;/);
});

test("invité : Terminer un Pomodoro l'enregistre et rend la page prête pour le suivant", () => {
  const env = makeEnv();
  const page = mount(env);
  page.click(/^Démarrer$/);
  advance(env, 5 * 60_000);
  page.click(/^Terminer/);
  const session = read(env, GUEST_SPACE).sessions[0];
  assert.equal(session.duration_seconds, 300);
  assert.equal(session.course_id, null);
  const snap = read(env, GUEST_TIMER);
  assert.deepEqual([snap.pomodoro, snap.pomoPhase, snap.pomoCount, snap.running, snap.baseSeconds], [true, "work", 0, false, 0]);
  assert.match(page.text(page.tool()), /Travail25:00/);
  page.close();
});

test("invité : une session Libre ouverte ailleurs reste Libre sur /pomodoro — ni convertie ni tronquée à 25 min", () => {
  const env = makeEnv();
  env.store.set(GUEST_TIMER, JSON.stringify({ courseId: "guest-course-physics", note: "", running: true, startMs: T0 - 40 * 60_000,
    baseSeconds: 0, timezone: "Europe/Brussels", sessionId: "6f1c2d3e-4a5b-4c6d-8e9f-0a1b2c3d4e5f", pomodoro: false, pomoPhase: "work", pomoCount: 0, pomoWorkMin: 25, pomoBreakMin: 5 }));
  const page = mount(env);
  advance(env, 1000);
  const snap = read(env, GUEST_TIMER);
  assert.equal(snap.pomodoro, false);
  assert.equal(snap.running, true);
  assert.equal(env.store.has(GUEST_SPACE) && read(env, GUEST_SPACE).sessions.length, 0);
  assert.match(page.text(page.tool()), /Physique.*40:01/);
  page.close();
});

test("avant la réponse de l'auth : outil inerte, Démarrer ne lance rien ; compte connu → lien vers le Chrono, aucune session", () => {
  const env = makeEnv({ loading: true });
  const accountTimer = JSON.stringify({ courseId: "", note: "", running: false, startMs: 0, baseSeconds: 0, timezone: "", sessionId: "",
    pomodoro: false, pomoPhase: "work", pomoCount: 0, pomoWorkMin: 25, pomoBreakMin: 5 });
  env.store.set(`bt_timer_v2:${ACCOUNT.id}`, accountTimer);
  const page = mount(env);
  assert.equal(page.tool().findAll((n) => n.props?.inert === "").length, 1);
  page.click(/^Démarrer$/);
  page.click(/Focus/);
  advance(env, 60_000);
  assert.equal(page.focusOpen(), false);
  assert.deepEqual(env.cues, [], "aucun démarrage, même pas son retour sonore");
  assert.ok(page.button(/^Démarrer$/) && !page.button(/^Pause$/));
  assert.equal(env.store.has(GUEST_TIMER), false);

  env.auth = { user: ACCOUNT, loading: false };
  page.update();
  advance(env, 60_000);
  const tool = page.tool();
  assert.equal(tool.findAll((n) => n.type === "button").length, 0);
  const link = tool.findAll((n) => n.type === "a")[0];
  assert.equal(link.props.href, "/dashboard");
  assert.match(textOf(tool), /Your timer is in the app|Ton Chrono est dans l'app/);
  assert.equal(env.store.get(`bt_timer_v2:${ACCOUNT.id}`), accountTimer, "le chrono du compte n'est pas touché");
  assert.equal(env.store.has(GUEST_TIMER), false);
  assert.equal(env.store.has(GUEST_SPACE), false);
  assert.deepEqual(sessionsWrites(env), []);
  page.close();
});

test("connecté : pas d'outil interactif, une session du compte en cours n'est ni modifiée ni enregistrée", () => {
  const env = makeEnv({ user: ACCOUNT, deviceLanguage: "fr-BE" });
  const running = JSON.stringify({ courseId: "c1", note: "", running: true, startMs: T0 - 5 * 60_000, baseSeconds: 0, timezone: "Europe/Brussels",
    sessionId: "6f1c2d3e-4a5b-4c6d-8e9f-0a1b2c3d4e5f", pomodoro: false, pomoPhase: "work", pomoCount: 0, pomoWorkMin: 25, pomoBreakMin: 5 });
  env.store.set(`bt_timer_v2:${ACCOUNT.id}`, running);
  const page = mount(env);
  advance(env, 30 * 60_000);
  const tool = page.tool();
  assert.match(textOf(tool), /Ton Chrono est dans l'app.*Ouvrir le Chrono/);
  assert.equal(tool.findAll((n) => n.type === "a")[0].props.href, "/dashboard");
  assert.equal(tool.findAll((n) => n.type === "button").length, 0);
  assert.equal(env.store.get(`bt_timer_v2:${ACCOUNT.id}`), running);
  assert.deepEqual(sessionsWrites(env), []);
  page.close();
});

test("seul le Chrono suit le tic de 500 ms : l'article ne se redessine pas", () => {
  const env = makeEnv();
  const page = mount(env);
  page.click(/^Démarrer$/);
  const before = env.headerRenders;
  for (let i = 0; i < 20; i += 1) advance(env, 500);
  assert.match(page.text(page.tool()), /24:50/);
  assert.equal(env.headerRenders, before);
  page.close();
});

test("SEO : title, meta, canonical, Article/FAQ/Breadcrumb alignés sur la page visible", () => {
  const env = makeEnv();
  const { getSeoForPath, structuredDataForPath } = env.load("lib/seo");
  const { SEO_LANDING_PAGES } = env.load("lib/seoLandingPages");
  const page = SEO_LANDING_PAGES["/pomodoro"];
  const seo = getSeoForPath("/pomodoro");
  assert.equal(seo.title, "Minuteur Pomodoro gratuit pour étudier | Blocus Tracker");
  assert.equal(page.h1, "Minuteur Pomodoro gratuit pour étudier");
  assert.ok(seo.title.length <= 60);
  assert.ok(seo.description.length >= 70 && seo.description.length <= 160);
  assert.match(seo.description, /Pomodoro/);
  assert.match(seo.robots, /^index, follow/);
  assert.equal(seo.canonicalUrl, "https://www.blocus-tracker.com/pomodoro");
  const nodes = plain(structuredDataForPath("/pomodoro"));
  const article = nodes.find((n) => n["@type"] === "Article");
  assert.equal(article.headline, page.h1);
  assert.equal(article.dateModified, "2026-10-07");
  assert.equal(article.inLanguage, "fr-BE");
  const faq = nodes.find((n) => n["@type"] === "FAQPage");
  assert.deepEqual(faq.mainEntity.map((q) => [q.name, q.acceptedAnswer.text]), plain(page.faq.map((q) => [q.q, q.a])));
  const crumbs = nodes.find((n) => n["@type"] === "BreadcrumbList").itemListElement;
  assert.equal(crumbs.at(-1).name, page.h1);
  assert.equal(crumbs.at(-1).item, seo.canonicalUrl);
  // Le guide reste sous l'outil, et la FAQ visible est celle du JSON-LD.
  const html = renderToString(pageTree(makeEnv({ loading: true }))());
  const text = htmlText(html);
  for (const section of page.sections) assert.ok(text.includes(section.title), section.title);
  for (const item of page.faq) assert.ok(text.includes(item.q) && text.includes(item.a), item.q);
  assert.ok(html.indexOf('id="minuteur"') < html.indexOf(page.sections[0].title));
  // Le dernier appel « Lancer le chrono » ramène à l'outil au lieu de quitter la page.
  assert.match(html, /<a href="#minuteur"[^>]*>Lancer le chrono<\/a>/);
});

test("les cinq autres guides gardent leur héros : illustration et bouton vers l'app, aucun outil", () => {
  const env = makeEnv({ loading: true });
  const { SEO_LANDING_PAGES, SEO_LANDING_PATHS } = env.load("lib/seoLandingPages");
  const { I18nProvider } = env.load("contexts/I18nContext");
  const SeoLandingPage = env.load("components/SeoLandingPage").default;
  const others = SEO_LANDING_PATHS.filter((path) => path !== "/pomodoro");
  assert.equal(others.length, 5);
  for (const path of others) {
    const page = SEO_LANDING_PAGES[path];
    const html = renderToString(h(I18nProvider, null, h(SeoLandingPage, { page })));
    assert.match(html, /seo-preview/, path);
    assert.ok(htmlText(html).includes(page.ctaLabel), path);
    assert.doesNotMatch(html, /id="minuteur"|#minuteur/, path);
    assert.match(html, /<a href="\/dashboard"[^>]*>Lancer le chrono<\/a>/, path);
  }
});
