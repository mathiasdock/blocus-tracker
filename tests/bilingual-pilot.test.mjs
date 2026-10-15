// Bilinguisme du site public : pilote /en (2026-10-14), puis les quatre pages
// et les six guides — les onze paires FR/EN. Le registre des pages
// (lib/publicRoutes.mjs), la langue affichée (contexts/I18nContext.js), le
// passage du site vers l'app (connexion, inscription, retour de Google), le
// référencement des deux versions de chaque page et le sitemap. Les pages et
// composants sont rendus pour de vrai (React + Babel dans un contexte vm),
// comme dans tests/guide-article.test.mjs.
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import {
  ENTRY_PATHS, JOURNEY_KEY, PUBLIC_PAGES, PUBLIC_PAGE_PATHS, displayLang, equivalentPath, isEntryPath,
  languageSwitchHref, legalHref, pageAlternates, publicHref, publicPageLang,
} from "../lib/publicRoutes.mjs";
import { shouldCheckOnboarding } from "../lib/onboarding.mjs";
import { shouldRedirectToProfileRepair } from "../lib/authProfile.mjs";

const require = createRequire(import.meta.url);
const React = require("react");
const { renderToStaticMarkup, renderToString } = require("react-dom/server");
const { act, create } = require("react-test-renderer");
const { transformSync } = require("@babel/core");
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const babel = { babelrc: false, configFile: false,
  presets: [[require.resolve("next/babel"), { "preset-react": { runtime: "automatic" } }]],
  plugins: [require.resolve("@babel/plugin-transform-modules-commonjs")] };
const h = React.createElement;

// Les onze adresses françaises, dans l'ordre du sitemap : elles ne bougent pas.
const FR_PAGES = ["/", "/fonctionnalites", "/guides", "/faq", "/pomodoro", "/planning-revision", "/stats-etude",
  "/objectifs-etude", "/application-etudiant", "/blocus-belgique", "/legal"];

function storage(entries = []) {
  const map = new Map(entries);
  return { map, getItem: (k) => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, String(v)), removeItem: (k) => map.delete(k) };
}

// Un navigateur simulé : appareil, choix enregistré, parcours en cours,
// adresse (pathname + query), compte. `router.replaced` garde les adresses
// réécrites par la page.
function makeEnv({ pathname = "/", query = {}, isReady = true, device = "fr-BE", langPref = null, journey = null, user = null, mocks: extra = {} } = {}) {
  const local = storage(langPref ? [["bt_lang_pref", langPref]] : []);
  const session = storage(journey ? [[JOURNEY_KEY, journey]] : []);
  const router = { pathname, query, isReady, replaced: [] };
  const noop = () => {};
  const html = { lang: "fr", classList: { add: noop, remove: noop, contains: () => false } };
  const globals = {
    console, Intl,
    localStorage: local,
    window: {
      sessionStorage: session, localStorage: local, location: { hash: "", search: "" },
      addEventListener: noop, removeEventListener: noop, matchMedia: () => ({ matches: false }),
    },
    document: { documentElement: html, getElementById: () => null },
    navigator: { language: device, languages: [device] },
  };
  const cssModule = new Proxy({}, { get: (_, key) => (typeof key === "string" && key !== "__esModule" ? key : undefined) });
  const mocks = {
    "contexts/AuthContext": { useAuth: () => ({ user, loading: false, profileStatus: user ? "ready" : null }) },
    "contexts/ConsentContext": { useConsent: () => ({ openSettings: () => {}, allows: () => false, hydrated: true }) },
    "next/router": { useRouter: () => ({ ...router, replace: (url) => { router.replaced.push(url); router.query = url.query; return Promise.resolve(true); } }) },
    // Une adresse donnée en objet ({ pathname, query }) s'écrit comme Next l'écrirait.
    "next/link": {
      __esModule: true,
      default: ({ href, children, replace, shallow, scroll, ...rest }) => h("a", {
        href: typeof href === "object" ? `${href.pathname}${href.query ? `?${new URLSearchParams(href.query)}` : ""}` : href,
        ...rest,
      }, children),
    },
    "next/head": { __esModule: true, default: ({ children }) => h(React.Fragment, null, children) },
    "components/Mascot": { __esModule: true, default: () => h("svg", { "data-mascot": "1" }) },
    ...extra,
  };
  const cache = new Map();
  function resolveFile(abs) {
    for (const candidate of [abs, `${abs}.js`, `${abs}.mjs`, `${abs}.jsx`, `${abs}.cjs`]) if (existsSync(candidate) && !candidate.endsWith("/")) return candidate;
    throw new Error(`cannot resolve ${abs}`);
  }
  function load(file) {
    if (file.endsWith(".css")) return cssModule;
    const rel = relative(ROOT, file).replace(/\.(m?js|jsx|cjs)$/, "");
    if (mocks[rel]) return mocks[rel];
    if (cache.has(file)) return cache.get(file).exports;
    const mod = { exports: {} };
    cache.set(file, mod);
    const { code } = transformSync(readFileSync(file, "utf8"), { ...babel, filename: file });
    const req = (id) => (id.startsWith(".") ? load(resolveFile(resolve(dirname(file), id))) : mocks[id] || require(id));
    vm.runInNewContext(code, { module: mod, exports: mod.exports, require: req, process, ...globals });
    return mod.exports;
  }
  return { load: (path) => load(resolveFile(join(ROOT, path))), local, session, router, html };
}

// Monte le fournisseur de langue (effets compris) avec une sonde qui lit ce
// qu'il expose ; `go` simule une navigation dans le même onglet.
function mountI18n(env, child = null) {
  const { I18nProvider, useI18n } = env.load("contexts/I18nContext");
  const seen = {};
  function Probe() {
    Object.assign(seen, useI18n());
    return child;
  }
  let renderer;
  act(() => { renderer = create(h(I18nProvider, null, h(Probe))); });
  return {
    seen,
    renderer,
    go(pathname, query = {}) {
      Object.assign(env.router, { pathname, query });
      act(() => renderer.update(h(I18nProvider, null, h(Probe))));
    },
    unmount: () => act(() => renderer.unmount()),
  };
}

const decode = (s) => s.replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
const text = (html) => decode(html.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ");
const attrs = (html, tag) => [...html.matchAll(new RegExp(`<${tag}\\b([^>]*)>`, "g"))].map((m) => Object.fromEntries(
  [...m[1].matchAll(/([a-zA-Z:-]+)="([^"]*)"/g)].map(([, k, v]) => [k.toLowerCase(), decode(v)]),
));
const plain = (value) => JSON.parse(JSON.stringify(value));
const leaves = (value) => (typeof value === "string" ? [value] : value && typeof value === "object" ? Object.values(value).flatMap(leaves) : []);

// Chaque page française et sa version anglaise : les onze paires validées.
const PAIRS = {
  "/": "/en", "/fonctionnalites": "/en/features", "/guides": "/en/guides", "/faq": "/en/faq",
  "/pomodoro": "/en/pomodoro", "/planning-revision": "/en/study-planner", "/stats-etude": "/en/study-stats",
  "/objectifs-etude": "/en/study-goals", "/application-etudiant": "/en/study-app", "/blocus-belgique": "/en/blocus-belgium",
  "/legal": "/en/legal",
};
const EN_PAGES = Object.values(PAIRS);
const NOT_YET = FR_PAGES.filter((path) => !PAIRS[path]);
const GUIDES = ["/pomodoro", "/planning-revision", "/stats-etude", "/objectifs-etude", "/application-etudiant", "/blocus-belgique"];

// ── Le registre ────────────────────────────────────────────────────────────
test("registre : les onze adresses françaises inchangées, onze adresses anglaises, chaque page a son fichier", () => {
  assert.deepEqual(PUBLIC_PAGES.map((page) => page.fr), FR_PAGES);
  assert.deepEqual(PUBLIC_PAGES.filter((page) => page.en).map((page) => page.en), EN_PAGES);
  assert.deepEqual(PUBLIC_PAGE_PATHS, [...FR_PAGES, ...EN_PAGES]);
  assert.deepEqual(NOT_YET, []);
  for (const path of FR_PAGES) {
    const file = path === "/" ? "pages/index.js" : `pages${path}.js`;
    assert.ok(existsSync(join(ROOT, file)), file);
  }
  // pages/en ne contient que des pages du registre — aucune page de l'app.
  const enFiles = readdirSync(join(ROOT, "pages/en")).sort();
  const enPaths = enFiles.map((file) => (file === "index.js" ? "/en" : `/en/${file.replace(/\.js$/, "")}`)).sort();
  assert.deepEqual(enPaths, [...EN_PAGES].sort());
  for (const path of enPaths) assert.equal(publicPageLang(path), "en");
  // Chaque page anglaise est la page française elle-même : aucun second gabarit.
  for (const [fr, en] of Object.entries(PAIRS)) {
    const file = en === "/en" ? "pages/en/index.js" : `pages${en}.js`;
    const target = fr === "/" ? "index" : fr.slice(1);
    assert.match(readFileSync(join(ROOT, file), "utf8"), new RegExp(`export \\{ default \\} from "\\.\\./${target}";`), file);
  }
  for (const app of ["/dashboard", "/signup", "/login", "/admin", "/profile", "/en/dashboard", "/en/signup", "/en/admin", "/en/profile", "/en/planning"]) {
    assert.equal(publicPageLang(app), null, app);
    assert.equal(existsSync(join(ROOT, `pages${app}.js`)) && app.startsWith("/en/"), false, app);
  }
});

test("registre : les deux versions d'une page seulement quand les deux existent", () => {
  for (const [fr, en] of Object.entries(PAIRS)) {
    assert.deepEqual(pageAlternates(fr), { fr, en }, fr);
    assert.deepEqual(pageAlternates(`${en}?doc=terms#x`), { fr, en }, en);
    assert.equal(equivalentPath(fr, "en"), en);
    assert.equal(equivalentPath(en, "fr"), fr);
  }
  // Hors du registre : ni version, ni équivalent.
  for (const path of ["/dashboard", "/en/dashboard", "/en/planning", "/404"]) {
    assert.equal(pageAlternates(path), null, path);
    assert.equal(equivalentPath(path, "en"), null, path);
    assert.equal(equivalentPath(path, "fr"), null, path);
  }
});

test("registre : toute page indexable de lib/seo.js est dans le registre, avec la locale de sa langue", () => {
  const env = makeEnv();
  const { PAGE_SEO } = env.load("lib/seo");
  const indexable = Object.entries(PAGE_SEO).filter(([, page]) => page.index === true).map(([path]) => path).sort();
  assert.deepEqual(indexable, [...PUBLIC_PAGE_PATHS].sort());
  for (const path of indexable) {
    const locale = PAGE_SEO[path].locale || "fr_BE";
    assert.equal(locale.slice(0, 2), publicPageLang(path), path);
  }
});

test("premiers réglages et réparation de profil : jamais de redirection depuis le site public, français ou anglais, ni depuis les pages d'entrée", () => {
  const managed = { id: "u", user_metadata: { onboarding_version: 1 } };
  for (const pathname of [...PUBLIC_PAGE_PATHS, ...ENTRY_PATHS]) {
    assert.equal(shouldCheckOnboarding({ authLoading: false, user: managed, profileStatus: "ready", pathname }), false, pathname);
    assert.equal(shouldRedirectToProfileRepair({ authLoading: false, hasUser: true, profileStatus: "missing", pathname }), false, pathname);
  }
  // L'app, elle, reste gardée — et une adresse anglaise inexistante aussi.
  for (const pathname of ["/dashboard", "/planning", "/en/dashboard"]) {
    assert.equal(shouldCheckOnboarding({ authLoading: false, user: managed, profileStatus: "ready", pathname }), true, pathname);
    assert.equal(shouldRedirectToProfileRepair({ authLoading: false, hasUser: true, profileStatus: "missing", pathname }), true, pathname);
  }
});

// ── Liens et sélecteur ─────────────────────────────────────────────────────
test("liens d'une page anglaise : connexion et inscription en anglais, pages de même langue quand elles existent, app inchangée", () => {
  assert.equal(publicHref("/signup", "en"), "/signup?lang=en");
  assert.equal(publicHref("/signup?campaign=affiche", "en"), "/signup?campaign=affiche&lang=en");
  assert.equal(publicHref("/signup?lang=fr&campaign=x", "en"), "/signup?campaign=x&lang=en");
  assert.equal(publicHref("/signup?lang=en", "en"), "/signup?lang=en");
  assert.equal(publicHref("/login", "en"), "/login?lang=en");
  assert.equal(publicHref("/", "en"), "/en");
  assert.equal(publicHref("/?campaign=affiche#faq-title", "en"), "/en?campaign=affiche#faq-title");
  assert.equal(publicHref("/fonctionnalites", "en"), "/en/features");
  assert.equal(publicHref("/guides", "en"), "/en/guides");
  assert.equal(publicHref("/faq#question-3", "en"), "/en/faq#question-3");
  assert.equal(publicHref("/legal?doc=cookies", "en"), "/en/legal?doc=cookies");
  // Les guides : leur adresse anglaise, ancre comprise.
  assert.equal(publicHref("/pomodoro#minuteur", "en"), "/en/pomodoro#minuteur");
  assert.equal(publicHref("/blocus-belgique", "en"), "/en/blocus-belgium");
  for (const [fr, en] of Object.entries(PAIRS)) assert.equal(publicHref(fr, "en"), en, fr);
  // L'app garde ses adresses ; le mode découverte suit la langue de l'app.
  for (const href of ["/dashboard", "/profile", "https://elevenlabs.io", "//evil.example", "#question-2"]) assert.equal(publicHref(href, "en"), href);
  // Une page française ne transmet rien.
  for (const href of ["/signup", "/signup?campaign=affiche", "/login", "/", "/faq", "/legal?doc=terms"]) assert.equal(publicHref(href, "fr"), href);
});

test("liens légaux : dans la langue affichée — /legal en français, /en/legal en anglais, avec le document demandé", () => {
  assert.equal(legalHref("fr"), "/legal");
  assert.equal(legalHref("en"), "/en/legal");
  for (const doc of ["privacy", "terms", "cookies", "notice"]) {
    assert.equal(legalHref("fr", doc), `/legal?doc=${doc}`);
    assert.equal(legalHref("en", doc), `/en/legal?doc=${doc}`);
  }
  // Plus aucun lien légal écrit en dur dans l'app : tous passent par legalHref
  // (profil, inscription, premiers réglages, pied de page, bandeau cookies,
  // rappel des CGU), ou par publicHref sur le site public.
  const files = ["pages/profile.js", "pages/signup.js", "pages/login.js", "pages/onboarding.js", "components/Layout.js",
    "components/ConsentManager.js", "components/LegalUpdateNotice.js", "components/landing/PublicFooter.js"];
  for (const file of files) {
    const source = readFileSync(join(ROOT, file), "utf8");
    assert.doesNotMatch(source, /href=["'{]\s*["'`]?\/legal/, file);
  }
});

test("sélecteur : même page dans l'autre langue, paramètres prévus et ancre gardés, rien d'autre", () => {
  assert.equal(languageSwitchHref({ pathname: "/", query: {} }, "en"), "/en");
  assert.equal(languageSwitchHref({ pathname: "/en", query: {} }, "fr"), "/");
  assert.equal(
    languageSwitchHref({ pathname: "/", query: { campaign: "affiche-ucl", ref: "SAM42", utm_source: "x", lang: "fr", next: "/admin" }, hash: "#faq-title" }, "en"),
    "/en?campaign=affiche-ucl&ref=SAM42#faq-title",
  );
  assert.equal(languageSwitchHref({ pathname: "/en", query: { campaign: ["a", "b"] }, hash: "#x" }, "fr"), "/?campaign=a#x");
  // Valeurs ou ancres suspectes : ignorées.
  assert.equal(languageSwitchHref({ pathname: "/", query: { campaign: "<script>", ref: "a b" }, hash: "#a\"b" }, "en"), "/en");
  // Le document légal et l'ancre suivent sur la page équivalente.
  assert.equal(languageSwitchHref({ pathname: "/legal", query: { doc: "terms", campaign: "x" }, hash: "#legal-terms-2" }, "en"), "/en/legal?campaign=x&doc=terms#legal-terms-2");
  assert.equal(languageSwitchHref({ pathname: "/en/legal", query: { doc: "notice" } }, "fr"), "/legal?doc=notice");
  assert.equal(languageSwitchHref({ pathname: "/faq", query: {}, hash: "#question-3" }, "en"), "/en/faq#question-3");
  assert.equal(languageSwitchHref({ pathname: "/en/features", query: {}, hash: "#planning" }, "fr"), "/fonctionnalites#planning");
  assert.equal(languageSwitchHref({ pathname: "/en/guides", query: {} }, "fr"), "/guides");
  // Les guides : le même guide dans l'autre langue, ancre comprise.
  assert.equal(languageSwitchHref({ pathname: "/pomodoro", query: { campaign: "x" }, hash: "#minuteur" }, "en"), "/en/pomodoro?campaign=x#minuteur");
  assert.equal(languageSwitchHref({ pathname: "/en/blocus-belgium", query: {}, hash: "#guide-section-2" }, "fr"), "/blocus-belgique#guide-section-2");
  // Hors du registre : l'accueil de l'autre langue, sans le document ni l'ancre de la page.
  assert.equal(languageSwitchHref({ pathname: "/404", query: { campaign: "x", doc: "terms" }, hash: "#minuteur" }, "en"), "/en?campaign=x");
});

test("langue affichée : l'adresse sur le site, le parcours sur les pages d'entrée, sinon la langue de l'app", () => {
  for (const pathname of FR_PAGES) assert.equal(displayLang({ pathname, journeyLang: "en", appLang: "en" }), "fr", pathname);
  for (const pathname of EN_PAGES) assert.equal(displayLang({ pathname, journeyLang: "fr", appLang: "fr" }), "en", pathname);
  for (const pathname of ENTRY_PATHS) {
    assert.equal(isEntryPath(pathname), true);
    assert.equal(displayLang({ pathname, journeyLang: "en", appLang: "fr" }), "en", pathname);
    assert.equal(displayLang({ pathname, journeyLang: null, appLang: "fr" }), "fr", pathname);
  }
  // Dans l'app, un parcours ne compte pas.
  assert.equal(displayLang({ pathname: "/dashboard", journeyLang: "en", appLang: "fr" }), "fr");
  assert.equal(displayLang({ pathname: "/signup", journeyLang: "xx", appLang: "fr" }), "fr");
});

// ── La langue dans un vrai navigateur simulé ───────────────────────────────
test("pages publiques : la langue de l'adresse, sans bascule après le chargement, quels que soient l'appareil, le choix enregistré ou le compte", () => {
  for (const [pathname, expected] of [["/", "fr"], ["/faq", "fr"], ["/legal", "fr"], ["/en", "en"], ["/en/faq", "en"], ["/en/legal", "en"]]) {
    for (const device of ["fr-BE", "en-US", "de-DE"]) {
      for (const langPref of [null, "fr", "en"]) {
        for (const user of [null, { id: "u" }]) {
          const env = makeEnv({ pathname, device, langPref, user });
          const app = mountI18n(env);
          const label = `${pathname} ${device} ${langPref} ${user ? "connecté" : "visiteur"}`;
          assert.equal(app.seen.lang, expected, label);
          assert.equal(env.html.lang, expected, label);
          assert.equal(app.seen.appLang, langPref || (device === "fr-BE" ? "fr" : "en"), label);
          // Visiter une page publique n'enregistre rien.
          assert.deepEqual([...env.local.map.keys()], langPref ? ["bt_lang_pref"] : [], label);
          assert.equal(env.session.map.has(JOURNEY_KEY), false, label);
          app.unmount();
        }
      }
    }
  }
});

test("rendu serveur : /en en anglais et / en français dès le HTML, avant tout effet", () => {
  for (const [pathname, expected] of [["/", "fr"], ["/en", "en"], ["/dashboard", "fr"]]) {
    const env = makeEnv({ pathname, device: "en-US", langPref: "en", isReady: false });
    const { I18nProvider, useI18n } = env.load("contexts/I18nContext");
    function Lang() { return useI18n().lang; }
    assert.equal(renderToStaticMarkup(h(I18nProvider, null, h(Lang))), expected, pathname);
  }
});

test("app : le choix enregistré, sinon l'appareil — inchangé", () => {
  for (const [device, langPref, expected] of [["fr-BE", null, "fr"], ["en-US", null, "en"], ["de-DE", null, "en"], ["en-US", "fr", "fr"], ["fr-BE", "en", "en"]]) {
    const env = makeEnv({ pathname: "/dashboard", device, langPref });
    const app = mountI18n(env);
    assert.equal(app.seen.lang, expected, `${device} ${langPref}`);
    app.unmount();
  }
});

test("cas critique : un étudiant en-US visite /, puis s'inscrit sans choisir le français — tout reste en anglais, rien n'est enregistré", () => {
  const env = makeEnv({ pathname: "/", device: "en-US" });
  const app = mountI18n(env);
  assert.equal(app.seen.lang, "fr");
  // Les boutons de la page française ne transmettent aucune langue.
  assert.equal(publicHref("/signup", app.seen.lang), "/signup");
  app.go("/signup");
  assert.equal(app.seen.lang, "en");
  app.go("/onboarding");
  assert.equal(app.seen.lang, "en");
  app.go("/dashboard");
  assert.equal(app.seen.lang, "en");
  assert.equal(app.seen.appLang, "en");
  assert.equal(env.local.map.has("bt_lang_pref"), false);
  assert.equal(env.session.map.has(JOURNEY_KEY), false);
  app.unmount();
});

test("appareil français qui lit /en puis clique « Get started » : inscription, retour de Google et premiers réglages en anglais ; l'app suit ensuite l'appareil, sans choix enregistré", () => {
  const env = makeEnv({ pathname: "/en", device: "fr-BE" });
  const app = mountI18n(env);
  assert.equal(app.seen.lang, "en");
  app.go("/signup", { lang: "en", campaign: "affiche" });
  assert.equal(app.seen.lang, "en");
  assert.equal(app.seen.appLang, "fr");
  assert.equal(env.session.map.get(JOURNEY_KEY), "en");
  // La langue quitte l'adresse ; la campagne reste.
  assert.deepEqual(plain(env.router.replaced), [{ pathname: "/signup", query: { campaign: "affiche" } }]);
  assert.equal(env.local.map.has("bt_lang_pref"), false);
  app.unmount();

  // Retour de Google : une nouvelle page dans le même onglet.
  const back = makeEnv({ pathname: "/auth/google-callback", device: "fr-BE", journey: "en" });
  const after = mountI18n(back);
  assert.equal(after.seen.lang, "en");
  after.go("/onboarding", { repair: "1" });
  assert.equal(after.seen.lang, "en");
  assert.deepEqual(back.router.replaced, []);
  // Arrivée dans l'app : le parcours s'efface, l'appareil reprend la main.
  after.go("/dashboard");
  assert.equal(after.seen.lang, "fr");
  assert.equal(back.session.map.has(JOURNEY_KEY), false);
  assert.equal(back.local.map.has("bt_lang_pref"), false);
  after.unmount();

  // Nouvel onglet (lien de confirmation de l'e-mail) : pas de parcours, l'appareil.
  const mail = makeEnv({ pathname: "/onboarding", device: "fr-BE" });
  const fresh = mountI18n(mail);
  assert.equal(fresh.seen.lang, "fr");
  fresh.unmount();
});

test("un choix enregistré n'est jamais écrasé : depuis /en l'inscription commence en anglais, l'app garde le choix", () => {
  const env = makeEnv({ pathname: "/signup", query: { lang: "en" }, device: "en-US", langPref: "fr" });
  const app = mountI18n(env);
  assert.equal(app.seen.lang, "en");
  assert.equal(app.seen.appLang, "fr");
  assert.equal(env.local.map.get("bt_lang_pref"), "fr");
  app.go("/dashboard");
  assert.equal(app.seen.lang, "fr");
  app.unmount();
});

test("retour sur le site public : le parcours s'efface", () => {
  const env = makeEnv({ pathname: "/login", query: { lang: "en" }, device: "fr-BE" });
  const app = mountI18n(env);
  assert.equal(app.seen.lang, "en");
  app.go("/");
  assert.equal(app.seen.lang, "fr");
  app.go("/login");
  assert.equal(app.seen.lang, "fr");
  assert.equal(env.session.map.has(JOURNEY_KEY), false);
  app.unmount();
});

test("connexion et inscription : choisir sa langue l'enregistre et remplace le parcours", () => {
  const env = makeEnv({ pathname: "/signup", device: "en-US", journey: "en" });
  const Choice = env.load("components/auth/AuthLanguageChoice").default;
  const app = mountI18n(env, h(Choice));
  const buttons = () => app.renderer.root.findAllByType("button");
  assert.deepEqual(buttons().map((b) => [b.props.lang, b.props["aria-pressed"], b.props.children]), [["fr", false, "Français"], ["en", true, "English"]]);
  assert.equal(app.renderer.root.findByProps({ role: "group" }).props["aria-label"], "Language");
  act(() => buttons()[0].props.onClick());
  assert.equal(app.seen.lang, "fr");
  assert.equal(app.seen.appLang, "fr");
  assert.equal(env.local.map.get("bt_lang_pref"), "fr");
  assert.equal(env.session.map.has(JOURNEY_KEY), false);
  assert.deepEqual(buttons().map((b) => b.props["aria-pressed"]), [true, false]);
  app.go("/dashboard");
  assert.equal(app.seen.lang, "fr");
  app.unmount();
});

test("connexion depuis /en : page en anglais, mais la langue des e-mails (bt_email_lang) reste celle de l'app", async () => {
  const synced = [];
  const env = makeEnv({
    pathname: "/login", query: { lang: "en" }, device: "fr-BE",
    mocks: {
      "contexts/AuthContext": { useAuth: () => ({ signIn: async () => ({ error: null }), user: null, loading: false, profileStatus: null }) },
      "lib/authEmailLanguage.mjs": { syncAuthEmailLanguage: async (_client, language) => { synced.push(language); return true; } },
      "lib/authEmailLanguage": { syncAuthEmailLanguage: async (_client, language) => { synced.push(language); return true; } },
      "lib/supabaseClient": { supabase: {} },
      "components/auth/GoogleAuthButton": { __esModule: true, default: () => null },
      "components/auth/MascotGuide": { __esModule: true, default: () => null },
      "components/auth/AuthCaptcha": { __esModule: true, default: () => null, useAuthCaptcha: () => ({ requireToken: () => true, token: "t", reset: () => {} }) },
    },
  });
  const Login = env.load("pages/login").default;
  const app = mountI18n(env, h(Login));
  const root = app.renderer.root;
  assert.equal(app.seen.lang, "en");
  assert.equal(root.findByType("h1").props.children, "Sign in");
  const input = (id) => root.find((n) => n.type === "input" && n.props.id === id);
  act(() => input("login-id").props.onChange({ target: { value: "sam" } }));
  act(() => input("login-password").props.onChange({ target: { value: "secret" } }));
  await act(async () => { await root.findByType("form").props.onSubmit({ preventDefault() {} }); });
  assert.deepEqual(synced, ["fr"]);
  app.unmount();
});

// ── Référencement ──────────────────────────────────────────────────────────
test("SEO : / et /en — titre, description, canonical propre, locale, image de partage et hreflang réciproques", () => {
  const env = makeEnv();
  const { getSeoForPath } = env.load("lib/seo");
  const fr = getSeoForPath("/");
  const en = getSeoForPath("/en");
  assert.equal(fr.title, "Blocus Tracker | Chrono, planning et stats pour étudiants");
  assert.equal(fr.canonicalUrl, "https://www.blocus-tracker.com/");
  assert.equal(fr.locale, "fr_BE");
  assert.equal(fr.imageAlt, "Blocus Tracker, application d'étude pour étudiants");
  assert.equal(en.title, "Blocus Tracker | Study timer, planner and stats for students");
  assert.equal(en.description, "Blocus Tracker helps students time their study sessions, organize their revision, track their stats and stay motivated with their friends.");
  assert.equal(en.canonicalUrl, "https://www.blocus-tracker.com/en");
  assert.equal(en.locale, "en_US");
  assert.equal(en.imageAlt, "Blocus Tracker, a study app for students");
  assert.match(en.robots, /^index, follow/);
  assert.deepEqual(plain(fr.alternates), { fr: "/", en: "/en" });
  assert.deepEqual(plain(en.alternates), { fr: "/", en: "/en" });
  // Une page de l'app, une adresse anglaise inexistante : pas de hreflang, pas d'index.
  assert.equal(getSeoForPath("/dashboard").alternates, null);
  assert.equal(getSeoForPath("/en/dashboard").index, false);
  assert.equal(getSeoForPath("/en/planning").index, false);
});

test("SEO : les dix pages anglaises hors accueil — leur titre, leur description, leur canonical, hreflang réciproques ; les pages françaises inchangées", () => {
  const env = makeEnv();
  const { getSeoForPath } = env.load("lib/seo");
  const expected = {
    "/en/features": ["Features: study timer, planner, stats | Blocus Tracker", "Timer and Focus mode, exam planner, stats, XP and badges, friends and course spaces: everything Blocus Tracker does for your revision."],
    "/en/guides": ["Study guides to revise better | Blocus Tracker", "The Pomodoro method, revision planning, goals, study stats and the blocus: practical guides to organize your revision."],
    "/en/faq": ["Frequently asked questions | Blocus Tracker", "Price, account, planning, social features, phone and personal data: answers to frequently asked questions about Blocus Tracker."],
    "/en/pomodoro": ["Free Pomodoro timer for studying | Blocus Tracker", "Start a free Pomodoro timer, set your work and break times, and track the time you actually spend studying."],
    "/en/study-planner": ["Study planner: build a revision plan that holds up", "Learn how to build a realistic revision plan for your exams, with priorities, goals, breaks and tracking in Blocus Tracker."],
    "/en/study-stats": ["Study stats: track your revision time and progress", "Find out which stats to track to study more consistently: study time, streaks, records, goals and progress."],
    "/en/study-goals": ["Study goals: set realistic revision goals", "A simple method to set study goals that are motivating, measurable and suited to your exams, with Blocus Tracker."],
    "/en/study-app": ["Study app: timer, planner and stats for students", "Choose a study app that brings together a timer, a revision planner, stats, goals and motivation from your friends."],
    "/en/blocus-belgium": ["Student blocus in Belgium: definition, planning and tips", "What is the blocus in Belgium, when does it happen and how do you organize it? Definition, exam session dates, a realistic plan and a typical day."],
    "/en/legal": ["Privacy, terms and legal notice | Blocus Tracker", "Read Blocus Tracker's privacy policy, terms of service, local storage information and legal notice."],
  };
  const frenchBefore = {
    "/fonctionnalites": "Fonctionnalités : chrono, planning, stats | Blocus Tracker",
    "/guides": "Guides pour mieux réviser | Blocus Tracker",
    "/faq": "Questions fréquentes | Blocus Tracker",
    "/pomodoro": "Minuteur Pomodoro gratuit pour étudier | Blocus Tracker",
    "/planning-revision": "Planning de révision efficace | Méthode et outil étudiant",
    "/stats-etude": "Statistiques d'étude | Suivre son temps de révision",
    "/objectifs-etude": "Objectifs d'étude | Fixer des objectifs de révision réalistes",
    "/application-etudiant": "Application pour étudier | Chrono, planning et stats étudiant",
    "/blocus-belgique": "Blocus étudiant en Belgique : définition, planning et conseils",
    "/legal": "Confidentialité, CGU et mentions légales | Blocus Tracker",
  };
  for (const [fr, en] of Object.entries(PAIRS).filter(([path]) => path !== "/")) {
    const seoEn = getSeoForPath(`${en}?doc=terms`);
    assert.deepEqual([seoEn.title, seoEn.description], expected[en], en);
    assert.equal(seoEn.canonicalUrl, `https://www.blocus-tracker.com${en}`);
    assert.equal(seoEn.locale, "en_US");
    assert.equal(seoEn.imageAlt, "Blocus Tracker, a study app for students");
    assert.match(seoEn.robots, /^index, follow/);
    assert.deepEqual(plain(seoEn.alternates), { fr, en });
    const seoFr = getSeoForPath(fr);
    assert.equal(seoFr.title, frenchBefore[fr]);
    assert.equal(seoFr.canonicalUrl, `https://www.blocus-tracker.com${fr}`);
    assert.equal(seoFr.locale, "fr_BE");
    assert.deepEqual(plain(seoFr.alternates), { fr, en });
    // Un guide reste un article dans les deux langues.
    assert.equal(seoEn.type, seoFr.type, en);
  }
  for (const fr of GUIDES) assert.equal(getSeoForPath(PAIRS[fr]).type, "article", fr);
});

test("SEO : les balises du head — hreflang fr et en sur les deux versions de chaque page traduite, seulement là, pas de x-default", () => {
  const head = (pathname) => {
    const env = makeEnv({ pathname });
    const SeoHead = env.load("components/SeoHead").default;
    return renderToStaticMarkup(h(SeoHead));
  };
  const links = (html) => attrs(html, "link").filter((l) => l.rel === "alternate").map((l) => [l.hreflang, l.href]);
  for (const [fr, en] of Object.entries(PAIRS)) {
    const pair = [["fr", `https://www.blocus-tracker.com${fr}`], ["en", `https://www.blocus-tracker.com${en}`]];
    for (const pathname of [fr, en]) {
      const html = head(pathname);
      assert.deepEqual(links(html), pair, pathname);
      assert.equal(attrs(html, "link").find((l) => l.rel === "canonical").href, `https://www.blocus-tracker.com${pathname}`, pathname);
    }
  }
  for (const pathname of [...NOT_YET, "/dashboard", "/signup"]) assert.deepEqual(links(head(pathname)), [], pathname);
  const en = head("/en");
  const meta = (html, key) => attrs(html, "meta").find((m) => m.property === key || m.name === key)?.content;
  assert.equal(meta(en, "og:locale"), "en_US");
  assert.equal(meta(en, "og:url"), "https://www.blocus-tracker.com/en");
  assert.equal(meta(en, "og:image:alt"), "Blocus Tracker, a study app for students");
  assert.equal(meta(en, "twitter:image:alt"), "Blocus Tracker, a study app for students");
  assert.equal(attrs(en, "link").find((l) => l.rel === "canonical").href, "https://www.blocus-tracker.com/en");
  const fr = head("/");
  assert.equal(meta(fr, "og:locale"), "fr_BE");
  assert.equal(meta(fr, "og:image:alt"), "Blocus Tracker, application d'étude pour étudiants");
  assert.doesNotMatch(en + fr, /x-default/);
});

test("JSON-LD : l'accueil anglais en anglais, égal à son texte visible ; l'accueil français inchangé", () => {
  const env = makeEnv();
  const { structuredDataForPath, HOME_FAQ, HOME_FAQ_EN } = env.load("lib/seo");
  const en = plain(structuredDataForPath("/en"));
  assert.deepEqual(en.map((n) => n["@type"]), ["Organization", "SoftwareApplication", "FAQPage", "WebPage", "BreadcrumbList"]);
  const byType = (nodes, type) => nodes.find((n) => n["@type"] === type);
  assert.deepEqual(byType(en, "FAQPage").mainEntity.map((q) => [q.name, q.acceptedAnswer.text]), plain(HOME_FAQ_EN.map((q) => [q.q, q.a])));
  assert.equal(byType(en, "WebPage").inLanguage, "en");
  assert.equal(byType(en, "WebPage").url, "https://www.blocus-tracker.com/en");
  assert.equal(byType(en, "WebPage").name, "Blocus Tracker | Study timer, planner and stats for students");
  assert.equal(byType(en, "SoftwareApplication").url, "https://www.blocus-tracker.com/en");
  assert.equal(byType(en, "SoftwareApplication")["@id"], "https://www.blocus-tracker.com/en#software");
  assert.deepEqual(byType(en, "BreadcrumbList").itemListElement, [{ "@type": "ListItem", position: 1, name: "Home", item: "https://www.blocus-tracker.com/en" }]);
  assert.doesNotMatch(JSON.stringify(en), /fr-BE|Accueil|étudiant|Chrono/);

  const fr = plain(structuredDataForPath("/"));
  assert.deepEqual(fr.map((n) => n["@type"]), ["Organization", "WebSite", "SoftwareApplication", "FAQPage", "WebPage", "BreadcrumbList"]);
  assert.deepEqual(byType(fr, "FAQPage").mainEntity.map((q) => q.name), plain(HOME_FAQ.map((q) => q.q)));
  assert.equal(byType(fr, "WebPage").inLanguage, "fr-BE");
  assert.equal(byType(fr, "WebSite").inLanguage, "fr-BE");
  assert.equal(byType(fr, "SoftwareApplication")["@id"], "https://www.blocus-tracker.com/#software");
  assert.deepEqual(byType(fr, "BreadcrumbList").itemListElement, [{ "@type": "ListItem", position: 1, name: "Accueil", item: "https://www.blocus-tracker.com/" }]);
  // Aucune page française ne déclare de l'anglais.
  for (const path of FR_PAGES) assert.doesNotMatch(JSON.stringify(structuredDataForPath(path)), /"inLanguage":"en"|"name":"Home"/, path);
});

test("JSON-LD : fonctionnalités, guides, FAQ et légal en anglais, égaux à leur texte visible ; les versions françaises inchangées", () => {
  const env = makeEnv();
  const { structuredDataForPath, FAQ, FAQ_EN } = env.load("lib/seo");
  const { SEO_LANDING_PAGES, SEO_LANDING_PATHS } = env.load("lib/seoLandingPages");
  const { SEO_LANDING_PAGES_EN } = env.load("lib/seoLandingPagesEn");
  const byType = (nodes, type) => nodes.find((n) => n["@type"] === type);
  const types = (path) => plain(structuredDataForPath(path)).map((n) => n["@type"]);
  const site = "https://www.blocus-tracker.com";

  assert.deepEqual(types("/en/features"), ["Organization", "WebPage", "BreadcrumbList"]);
  assert.deepEqual(types("/en/legal"), ["Organization", "WebPage", "BreadcrumbList"]);
  assert.deepEqual(types("/en/faq"), ["Organization", "WebPage", "FAQPage", "BreadcrumbList"]);
  assert.deepEqual(types("/en/guides"), ["Organization", "WebPage", "ItemList", "BreadcrumbList"]);
  for (const fr of GUIDES) assert.deepEqual(types(PAIRS[fr]), ["Organization", "WebPage", "Article", "FAQPage", "BreadcrumbList"], PAIRS[fr]);
  // Les françaises gardent leur forme.
  assert.deepEqual(types("/fonctionnalites"), ["Organization", "WebSite", "WebPage", "BreadcrumbList"]);
  assert.deepEqual(types("/legal"), ["Organization", "WebSite", "WebPage", "BreadcrumbList"]);
  assert.deepEqual(types("/faq"), ["Organization", "WebSite", "WebPage", "FAQPage", "BreadcrumbList"]);
  assert.deepEqual(types("/guides"), ["Organization", "WebSite", "WebPage", "ItemList", "BreadcrumbList"]);
  for (const fr of GUIDES) assert.deepEqual(types(fr), ["Organization", "WebSite", "WebPage", "Article", "FAQPage", "BreadcrumbList"], fr);

  // FAQ : les neuf questions affichées sur /en/faq.
  const faqEn = plain(structuredDataForPath("/en/faq"));
  assert.deepEqual(byType(faqEn, "FAQPage").mainEntity.map((q) => [q.name, q.acceptedAnswer.text]), plain(FAQ_EN.map((q) => [q.q, q.a])));
  const faqFr = plain(structuredDataForPath("/faq"));
  assert.deepEqual(byType(faqFr, "FAQPage").mainEntity.map((q) => [q.name, q.acceptedAnswer.text]), plain(FAQ.map((q) => [q.q, q.a])));

  // Guides : les titres anglais affichés, l'adresse anglaise de chaque guide.
  const guidesEn = byType(plain(structuredDataForPath("/en/guides")), "ItemList");
  assert.equal(guidesEn.name, "Blocus Tracker guides");
  assert.deepEqual(guidesEn.itemListElement.map((i) => [i.name, i.url]), plain(SEO_LANDING_PATHS.map((path) => [SEO_LANDING_PAGES_EN[path].h1, `${site}${PAIRS[path]}`])));
  const guidesFr = byType(plain(structuredDataForPath("/guides")), "ItemList");
  assert.equal(guidesFr.name, "Guides Blocus Tracker");
  assert.deepEqual(guidesFr.itemListElement.map((i) => [i.name, i.url]), plain(SEO_LANDING_PATHS.map((path) => [SEO_LANDING_PAGES[path].h1, `${site}${path}`])));

  // Page, fil d'Ariane : en anglais, vers les adresses anglaises.
  for (const [fr, en] of Object.entries(PAIRS).filter(([path]) => path !== "/")) {
    const nodes = plain(structuredDataForPath(en));
    const page = byType(nodes, "WebPage");
    assert.equal(page.inLanguage, "en", en);
    assert.equal(page.url, `${site}${en}`);
    const crumbs = byType(nodes, "BreadcrumbList").itemListElement;
    assert.deepEqual(crumbs.map((c) => c.item), [`${site}/en`, `${site}${en}`], en);
    assert.equal(crumbs[0].name, "Home");
    assert.doesNotMatch(JSON.stringify(nodes), /fr-BE|Accueil|Questions fréquentes|Fonctionnalités|mentions légales/, en);
    const frCrumbs = byType(plain(structuredDataForPath(fr)), "BreadcrumbList").itemListElement;
    assert.deepEqual(frCrumbs.map((c) => [c.name, c.item]).slice(0, 1), [["Accueil", `${site}/`]], fr);
  }
});

test("JSON-LD : les six guides anglais — un article en anglais (titre, description, sujet, dates de la page française) et la FAQ affichée ; les guides français inchangés", () => {
  const env = makeEnv();
  const { structuredDataForPath, getSeoForPath } = env.load("lib/seo");
  const { SEO_LANDING_PAGES } = env.load("lib/seoLandingPages");
  const { SEO_LANDING_PAGES_EN } = env.load("lib/seoLandingPagesEn");
  const byType = (nodes, type) => nodes.find((n) => n["@type"] === type);
  const site = "https://www.blocus-tracker.com";
  for (const fr of GUIDES) {
    const en = PAIRS[fr];
    const page = SEO_LANDING_PAGES_EN[fr];
    const nodes = plain(structuredDataForPath(en));
    const article = byType(nodes, "Article");
    assert.equal(article["@id"], `${site}${en}#article`, en);
    assert.equal(article.inLanguage, "en", en);
    assert.equal(article.headline, page.h1, en);
    assert.equal(article.description, getSeoForPath(en).description, en);
    assert.equal(article.about, page.eyebrow, en);
    assert.deepEqual(article.mainEntityOfPage, { "@id": `${site}${en}#webpage` }, en);
    // Une traduction partage les dates de sa page.
    const frArticle = byType(plain(structuredDataForPath(fr)), "Article");
    assert.equal(article.datePublished, frArticle.datePublished, en);
    assert.equal(article.dateModified, frArticle.dateModified, en);
    assert.equal(article.dateModified, SEO_LANDING_PAGES[fr].dateModified || "2026-07-06", en);
    // La FAQ du JSON-LD est celle qu'affiche la page anglaise.
    assert.deepEqual(byType(nodes, "FAQPage").mainEntity.map((q) => [q.name, q.acceptedAnswer.text]), plain(page.faq.map((q) => [q.q, q.a])), en);
    const crumbs = byType(nodes, "BreadcrumbList").itemListElement;
    assert.deepEqual(crumbs.map((c) => [c.name, c.item]), [["Home", `${site}/en`], [getSeoForPath(en).title.replace(" | Blocus Tracker", ""), `${site}${en}`]], en);
    assert.doesNotMatch(JSON.stringify(nodes), /fr-BE|Accueil|"inLanguage":"fr/, en);
    // Le guide français : son article, sa FAQ, en français.
    const frNodes = plain(structuredDataForPath(fr));
    assert.equal(byType(frNodes, "Article").inLanguage, "fr-BE", fr);
    assert.equal(byType(frNodes, "Article").headline, SEO_LANDING_PAGES[fr].h1, fr);
    assert.deepEqual(byType(frNodes, "FAQPage").mainEntity.map((q) => q.name), plain(SEO_LANDING_PAGES[fr].faq.map((q) => q.q)), fr);
  }
});

test("_document : <html lang> de l'adresse dès le serveur — en pour /en, fr ailleurs", () => {
  const env = makeEnv({
    mocks: {
      "next/document": {
        Html: ({ children, ...props }) => h("html", props, children),
        Head: ({ children }) => h("head", null, children),
        Main: () => h("main"),
        NextScript: () => null,
      },
    },
  });
  const Document = env.load("pages/_document").default;
  const lang = (page) => attrs(renderToStaticMarkup(h(Document, { __NEXT_DATA__: { page } })), "html")[0].lang;
  for (const page of EN_PAGES) assert.equal(lang(page), "en", page);
  for (const page of ["/", "/faq", "/legal", "/fonctionnalites", "/pomodoro", "/dashboard", "/signup", "/_error", undefined]) assert.equal(lang(page), "fr", String(page));
});

// ── Les deux accueils rendus côté serveur ──────────────────────────────────
function renderHome(pathname, { query = {}, isReady = false } = {}) {
  const env = makeEnv({ pathname, query, isReady, device: "de-DE", langPref: pathname === "/" ? "en" : "fr" });
  const { I18nProvider } = env.load("contexts/I18nContext");
  const Home = env.load("pages/en/index").default;
  return { html: renderToString(h(I18nProvider, null, h(Home))), env };
}

test("accueil : /en réutilise la page d'accueil, en anglais dans le HTML serveur ; / reste en français", () => {
  const source = readFileSync(join(ROOT, "pages/en/index.js"), "utf8");
  assert.match(source, /export \{ default \} from "\.\.\/index";/);
  const { html: en, env } = renderHome("/en");
  const { html: fr } = renderHome("/");
  const content = env.load("lib/landingContent");
  const enCopy = content.getLandingContent("en");
  const frCopy = content.getLandingContent("fr");
  assert.ok(text(en).includes(`${enCopy.hero.titleStart} ${enCopy.hero.titleEnd} ${enCopy.hero.titleMark}`), "titre anglais");
  assert.ok(text(fr).includes(`${frCopy.hero.titleStart} ${frCopy.hero.titleEnd} ${frCopy.hero.titleMark}`), "titre français");
  // Aucun mélange : les textes propres à une langue n'apparaissent pas dans l'autre.
  const frOnly = leaves(frCopy).filter((s) => s.length >= 12 && !leaves(enCopy).includes(s));
  const enOnly = leaves(enCopy).filter((s) => s.length >= 12 && !leaves(frCopy).includes(s));
  for (const s of frOnly) assert.ok(!text(en).includes(s), `français dans /en : ${s}`);
  for (const s of enOnly) assert.ok(!text(fr).includes(s), `anglais dans / : ${s}`);
  const { HOME_FAQ, HOME_FAQ_EN } = env.load("lib/seo");
  for (const item of HOME_FAQ_EN) assert.ok(text(en).includes(item.q) && text(en).includes(item.a), item.q);
  for (const item of HOME_FAQ) assert.ok(!text(en).includes(item.q), item.q);
  // Les captures de la langue de la page.
  const images = (html) => attrs(html, "img").map((i) => i.src).filter((src) => src.startsWith("/site-web/"));
  assert.ok(images(en).length > 0 && images(en).every((src) => /\/site-web\/[^/]+\/en\//.test(src)), images(en).join(" "));
  assert.ok(images(fr).length > 0 && images(fr).every((src) => /\/site-web\/[^/]+\/fr\//.test(src)), images(fr).join(" "));
});

test("accueil : liens de même langue, inscription et connexion en anglais depuis /en, rien de changé sur /", () => {
  const hrefs = (html) => attrs(html, "a").map((a) => a.href);
  const { html: en } = renderHome("/en");
  const { html: fr } = renderHome("/");
  // Logo : l'accueil de la même langue.
  assert.deepEqual(attrs(en, "a").filter((a) => a.class?.includes("wordmark")).map((a) => a.href), ["/en", "/en"]);
  assert.deepEqual(attrs(fr, "a").filter((a) => a.class?.includes("wordmark")).map((a) => a.href), ["/", "/"]);
  // En anglais, l'inscription et la connexion emportent la langue ; jamais d'adresse privée sous /en.
  assert.ok(hrefs(en).filter((href) => href.startsWith("/signup")).every((href) => href === "/signup?lang=en"));
  assert.ok(hrefs(en).filter((href) => href.startsWith("/login")).every((href) => href === "/login?lang=en"));
  assert.equal(hrefs(en).filter((href) => href.startsWith("/signup")).length, 4);
  assert.ok(hrefs(en).includes("/dashboard"));
  // Sous /en, seulement des pages publiques qui existent — jamais une adresse privée.
  assert.ok(hrefs(en).filter((href) => href.startsWith("/en/")).every((href) => EN_PAGES.includes(href.split(/[?#]/)[0])), hrefs(en).join(" "));
  // Toutes les pages publiques : leur adresse anglaise, jamais la française.
  for (const href of ["/en/features", "/en/faq", "/en/guides", "/en/legal", "/en/pomodoro"]) assert.ok(hrefs(en).includes(href), href);
  for (const href of FR_PAGES.filter((path) => path !== "/")) assert.ok(!hrefs(en).includes(href), href);
  // En français, aucun paramètre de langue ni adresse anglaise, sauf le sélecteur.
  assert.ok(hrefs(fr).every((href) => !/[?&]lang=/.test(href)), hrefs(fr).join(" "));
  assert.deepEqual(hrefs(fr).filter((href) => href.startsWith("/en")), ["/en"]);
  assert.equal(hrefs(fr).filter((href) => href === "/signup").length, 4);
});

// ── Les quatre pages anglaises rendues côté serveur ────────────────────────
function renderPage(file, pathname, { query = {}, isReady = false, mocks = {} } = {}) {
  const env = makeEnv({ pathname, query, isReady, device: "de-DE", langPref: publicPageLang(pathname) === "fr" ? "en" : "fr", mocks });
  const { I18nProvider } = env.load("contexts/I18nContext");
  const Page = env.load(file).default;
  return { html: renderToString(h(I18nProvider, null, h(Page))), env };
}
const PAGE_FILES = { "/fonctionnalites": "pages/fonctionnalites", "/guides": "pages/guides", "/faq": "pages/faq", "/legal": "pages/legal" };

test("pages anglaises : le contenu anglais dans le HTML serveur, aucun texte français ; les pages françaises sans anglais", () => {
  for (const [fr, file] of Object.entries(PAGE_FILES)) {
    const en = PAIRS[fr];
    const { html: htmlEn, env } = renderPage(`pages${en}`, en);
    const { html: htmlFr } = renderPage(file, fr);
    const { getLandingContent } = env.load("lib/landingContent");
    const section = { "/fonctionnalites": "features", "/guides": "guidesPage", "/faq": "faqPage" }[fr];
    const h1 = (html) => text(html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/)[1]).trim();
    if (section) {
      assert.equal(h1(htmlEn), getLandingContent("en")[section].title, en);
      assert.equal(h1(htmlFr), getLandingContent("fr")[section].title, fr);
      const frOnly = leaves(getLandingContent("fr")[section]).filter((s) => s.length >= 12 && !leaves(getLandingContent("en")[section]).includes(s));
      const enOnly = leaves(getLandingContent("en")[section]).filter((s) => s.length >= 12 && !leaves(getLandingContent("fr")[section]).includes(s));
      for (const s of frOnly) assert.ok(!text(htmlEn).includes(s), `français dans ${en} : ${s}`);
      for (const s of enOnly) assert.ok(!text(htmlFr).includes(s), `anglais dans ${fr} : ${s}`);
    } else {
      assert.equal(h1(htmlEn), "Legal & privacy");
      assert.equal(h1(htmlFr), "Légal & confidentialité");
    }
    // L'en-tête et le pied de page : textes et liens de la langue de la page.
    const enHeader = getLandingContent("en").header;
    assert.ok(text(htmlEn).includes(enHeader.signup) && !text(htmlEn).includes("Commencer gratuitement"), en);
    // Images de la langue de la page.
    const images = (html) => attrs(html, "img").map((i) => i.src).filter((src) => src?.startsWith("/site-web/"));
    assert.ok(images(htmlEn).every((src) => /\/site-web\/[^/]+\/en\//.test(src)), en);
    assert.ok(images(htmlFr).every((src) => /\/site-web\/[^/]+\/fr\//.test(src)), fr);
  }
});

test("pages anglaises : menu, pied de page et guides — liens anglais vers les pages traduites, rien vers une adresse privée", () => {
  // Tous les liens, hors le sélecteur de langue (vérifié à part).
  const hrefs = (html) => attrs(html, "a").filter((a) => a.class !== "langLink").map((a) => a.href);
  for (const [fr, file] of Object.entries(PAGE_FILES)) {
    const en = PAIRS[fr];
    const { html: htmlEn } = renderPage(`pages${en}`, en);
    const { html: htmlFr } = renderPage(file, fr);
    // Menu : Features, Guides, FAQ en anglais ; la page courante marquée.
    const nav = attrs(htmlEn, "a").filter((a) => a.class === "navLink");
    assert.deepEqual(nav.map((a) => a.href), ["/en/features", "/en/guides", "/en/faq"], en);
    assert.deepEqual(nav.filter((a) => a["aria-current"] === "page").map((a) => a.href), EN_PAGES.includes(en) && en !== "/en/legal" ? [en] : [], en);
    // Pied de page : l'accueil, les pages traduites et les documents légaux en anglais.
    for (const href of ["/en", "/en/features", "/en/guides", "/en/faq", "/en/legal", "/login?lang=en", "/signup?lang=en"]) assert.ok(hrefs(htmlEn).includes(href), `${en} → ${href}`);
    for (const href of ["/", "/fonctionnalites", "/guides", "/faq", "/legal", "/login", "/signup"]) assert.ok(!hrefs(htmlEn).includes(href), `${en} ne doit pas mener à ${href}`);
    assert.ok(hrefs(htmlEn).filter((href) => href.startsWith("/en/")).every((href) => EN_PAGES.includes(href.split(/[?#]/)[0])), en);
    // Le sélecteur mène à la page française équivalente.
    assert.deepEqual(attrs(htmlEn, "a").filter((a) => a.class === "langLink").map((a) => a.href), [fr], en);
    // Version française : aucun lien anglais hors du sélecteur.
    assert.deepEqual(hrefs(htmlFr).filter((href) => href.startsWith("/en")), [], fr);
    assert.deepEqual(attrs(htmlFr, "a").filter((a) => a.class === "langLink").map((a) => a.href), [en], fr);
  }
  // /en/guides mène aux six guides anglais, jamais aux français.
  const { html: guides } = renderPage("pages/en/guides", "/en/guides");
  for (const fr of GUIDES) {
    assert.ok(hrefs(guides).includes(PAIRS[fr]), PAIRS[fr]);
    assert.ok(!hrefs(guides).includes(fr), fr);
  }
});

// ── Les six guides anglais rendus côté serveur ─────────────────────────────
const GUIDE_FILES = {
  "/pomodoro": "pomodoro", "/planning-revision": "study-planner", "/stats-etude": "study-stats",
  "/objectifs-etude": "study-goals", "/application-etudiant": "study-app", "/blocus-belgique": "blocus-belgium",
};
// Les textes d'une page de guide : les chaînes avec une espace (phrases,
// libellés), hors adresses et noms de captures ; les textes alternatifs des
// captures à part (attributs, pas texte visible).
const ALT_KEYS = ["alt", "phoneAlt"];
const walk = (value, keep, key = null) => (typeof value === "string" ? (keep(key) ? [value] : [])
  : value && typeof value === "object" ? Object.entries(value).flatMap(([k, v]) => walk(v, keep, Array.isArray(value) ? key : k)) : []);
const guideStrings = (page) => walk(page, (key) => !ALT_KEYS.includes(key) && !["href", "name", "mobile", "phone", "path"].includes(key))
  .filter((s) => / /.test(s) && !/^(\/|https?:)/.test(s));
const guideAlts = (page) => walk(page, (key) => ALT_KEYS.includes(key));
// Le Chrono de /pomodoro a ses propres tests (tests/pomodoro-page.test.mjs) :
// ici, une doublure à sa place.
const CHRONO_STUB = { "components/timer/PublicChrono": { __esModule: true, default: () => h("div", { "data-chrono": "1" }) } };

test("guides anglais : le contenu anglais dans le HTML serveur, aucun texte français ; menu, pied de page, sélecteur et tous les liens en anglais", () => {
  const hrefs = (html) => attrs(html, "a").filter((a) => a.class !== "langLink").map((a) => a.href);
  for (const fr of GUIDES) {
    const en = PAIRS[fr];
    assert.equal(`/en/${GUIDE_FILES[fr]}`, en);
    const { html: htmlEn, env } = renderPage(`pages${en}`, en, { mocks: CHRONO_STUB });
    const { html: htmlFr } = renderPage(`pages${fr}`, fr, { mocks: CHRONO_STUB });
    const { SEO_LANDING_PAGES } = env.load("lib/seoLandingPages");
    const { SEO_LANDING_PAGES_EN } = env.load("lib/seoLandingPagesEn");
    const h1 = (html) => text(html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/)[1]).trim();
    assert.equal(h1(htmlEn), SEO_LANDING_PAGES_EN[fr].h1, en);
    // text() ramène les espaces insécables de la typographie française à des espaces.
    assert.equal(h1(htmlFr), SEO_LANDING_PAGES[fr].h1, fr);
    // Aucun mélange : les phrases d'une langue n'apparaissent pas dans l'autre.
    const frText = guideStrings(SEO_LANDING_PAGES[fr]).filter((s) => s.length >= 12);
    const enText = guideStrings(SEO_LANDING_PAGES_EN[fr]).filter((s) => s.length >= 12);
    for (const s of frText.filter((s) => !enText.includes(s))) assert.ok(!text(htmlEn).includes(s), `français dans ${en} : ${s}`);
    for (const s of enText.filter((s) => !frText.includes(s))) assert.ok(!text(htmlFr).includes(s), `anglais dans ${fr} : ${s}`);
    for (const s of enText) assert.ok(text(htmlEn).includes(s), `${en} : ${s}`);
    // Captures de la langue de la page, avec leurs textes alternatifs anglais.
    const images = (html) => attrs(html, "img").map((i) => i.src).filter((src) => src?.startsWith("/site-web/"));
    assert.ok(images(htmlEn).every((src) => /\/site-web\/[^/]+\/en\//.test(src)), en);
    assert.ok(images(htmlFr).every((src) => /\/site-web\/[^/]+\/fr\//.test(src)), fr);
    const alts = attrs(htmlEn, "img").filter((i) => i.src?.startsWith("/site-web/")).map((i) => i.alt);
    assert.deepEqual([...new Set(alts)].sort(), [...new Set(guideAlts(SEO_LANDING_PAGES_EN[fr]))].sort(), en);
    // Menu anglais, aucune page marquée ; le sélecteur mène au guide français.
    assert.deepEqual(attrs(htmlEn, "a").filter((a) => a.class === "navLink").map((a) => a.href), ["/en/features", "/en/guides", "/en/faq"], en);
    assert.deepEqual(attrs(htmlEn, "a").filter((a) => a["aria-current"] === "page"), [], en);
    assert.deepEqual(attrs(htmlEn, "a").filter((a) => a.class === "langLink").map((a) => a.href), [fr], en);
    assert.deepEqual(attrs(htmlFr, "a").filter((a) => a.class === "langLink").map((a) => a.href), [en], fr);
    // Tous les liens : pages anglaises qui existent, inscription et connexion en
    // anglais, l'app, le Chrono de la page, les sources.
    for (const href of hrefs(htmlEn)) {
      const path = href.split(/[?#]/)[0];
      const ok = EN_PAGES.includes(path) || href === "/signup?lang=en" || href === "/login?lang=en" || href === "/dashboard"
        || href === "#minuteur" || href.startsWith("https://");
      assert.ok(ok, `${en} → ${href}`);
    }
    for (const item of SEO_LANDING_PAGES[fr].related) assert.ok(hrefs(htmlEn).includes(PAIRS[item.href]), `${en} → ${PAIRS[item.href]}`);
    // Version française : aucun lien anglais hors du sélecteur, aucun paramètre de langue.
    assert.deepEqual(hrefs(htmlFr).filter((href) => href.startsWith("/en") || /[?&]lang=/.test(href)), [], fr);
  }
});

test("/en/legal : les quatre documents anglais dans le HTML, un visible ; ?doc=privacy|terms|cookies|notice ouvre le bon et reste sur /en/legal", () => {
  const env = makeEnv();
  const { LEGAL_DOCS } = env.load("lib/legal");
  const visible = (html) => [...html.matchAll(/<article id="legal-(\w+)"([^>]*)>/g)].filter((m) => !/\shidden(=|\s|$)/.test(m[2])).map((m) => m[1]);
  const { html } = renderPage("pages/en/legal", "/en/legal");
  for (const doc of LEGAL_DOCS) {
    assert.ok(text(html).includes(doc.en.title), doc.id);
    for (const section of doc.en.sections) assert.ok(text(html).includes(section.h), `${doc.id} : ${section.h}`);
    assert.ok(!text(html).includes(doc.fr.title), `titre français de ${doc.id}`);
  }
  assert.deepEqual(visible(html), ["privacy"]);
  assert.deepEqual(attrs(html, "a").filter((a) => /doc=/.test(a.href)).map((a) => a.href),
    ["/en/legal?doc=privacy", "/en/legal?doc=terms", "/en/legal?doc=cookies", "/en/legal?doc=notice"]);
  for (const doc of ["privacy", "terms", "cookies", "notice"]) {
    const { html: opened } = renderPage("pages/en/legal", "/en/legal", { query: { doc }, isReady: true });
    assert.deepEqual(visible(opened), [doc], doc);
    assert.deepEqual(attrs(opened, "a").filter((a) => a["aria-current"] === "page" && /doc=/.test(a.href)).map((a) => a.href), [`/en/legal?doc=${doc}`], doc);
    // Le sélecteur garde le document : la version française du même document.
    assert.deepEqual(attrs(opened, "a").filter((a) => a.class === "langLink").map((a) => a.href), [`/legal?doc=${doc}`], doc);
  }
  // La page française : mêmes documents en français, liens sur /legal.
  const { html: fr } = renderPage("pages/legal", "/legal");
  assert.deepEqual(attrs(fr, "a").filter((a) => /doc=/.test(a.href)).map((a) => a.href),
    ["/legal?doc=privacy", "/legal?doc=terms", "/legal?doc=cookies", "/legal?doc=notice"]);
  for (const doc of LEGAL_DOCS) assert.ok(text(fr).includes(doc.fr.title), doc.id);
});

test("bandeau cookies : la politique cookies dans la langue affichée — page publique, app anglaise, app française", () => {
  for (const [pathname, device, langPref, expected] of [
    ["/en/faq", "fr-BE", null, "/en/legal?doc=cookies"],
    ["/faq", "en-US", "en", "/legal?doc=cookies"],
    ["/dashboard", "en-US", null, "/en/legal?doc=cookies"],
    ["/dashboard", "fr-BE", null, "/legal?doc=cookies"],
    ["/dashboard", "fr-BE", "en", "/en/legal?doc=cookies"],
  ]) {
    const env = makeEnv({
      pathname, device, langPref,
      mocks: {
        "contexts/ConsentContext": {
          useConsent: () => ({ needsDecision: true, gpc: false, categories: {}, acceptAll() {}, rejectAll() {}, save() {}, settingsOpen: false, openSettings() {}, closeSettings() {} }),
        },
      },
    });
    const ConsentManager = env.load("components/ConsentManager").default;
    const app = mountI18n(env, h(ConsentManager));
    const links = app.renderer.root.findAll((n) => n.type === "a").map((a) => a.props.href);
    assert.ok(links.length > 0 && links.every((href) => href === expected), `${pathname} ${device} ${langPref} → ${links.join(" ")}`);
    app.unmount();
  }
});

test("accueil : le sélecteur — EN sur /, FR sur /en, dans le HTML serveur, nommé et annoncé dans sa langue", () => {
  const switchOf = (html) => attrs(html, "a").filter((a) => a.class === "langLink");
  const { html: fr } = renderHome("/");
  const { html: en } = renderHome("/en");
  assert.deepEqual(switchOf(fr).map(({ href, hreflang, lang }) => ({ href, hreflang, lang })), [{ href: "/en", hreflang: "en", lang: "en" }]);
  assert.deepEqual(switchOf(en).map(({ href, hreflang, lang }) => ({ href, hreflang, lang })), [{ href: "/", hreflang: "fr", lang: "fr" }]);
  assert.match(fr, /class="langLink">EN<span class="srOnly"> – English version<\/span><\/a>/);
  assert.match(en, /class="langLink">FR<span class="srOnly"> – Version française<\/span><\/a>/);
  // Une fois l'adresse lue (après le chargement), la campagne suit — et l'inscription aussi.
  const { html: campaign } = renderHome("/en", { query: { campaign: "affiche", utm_source: "x" }, isReady: true });
  assert.deepEqual(switchOf(campaign).map((a) => a.href), ["/?campaign=affiche"]);
  assert.ok(attrs(campaign, "a").some((a) => a.href === "/signup?campaign=affiche&lang=en"));
});

test("en-tête sur petits téléphones : une seule rangée, le lien de langue garde 44 px de cible", () => {
  const css = readFileSync(join(ROOT, "components/landing/Landing.module.css"), "utf8");
  const block = (query) => {
    const start = css.indexOf(`@media (${query}) {\n  .wordmark`);
    assert.ok(start >= 0, query);
    return css.slice(start, css.indexOf("\n}", start));
  };
  assert.match(css, /\.langLink \{[^}]*position: relative;[^}]*min-width: 44px;[^}]*min-height: 44px;/);
  // La cible est le rectangle entier, pas seulement la pastille arrondie.
  assert.ok(css.includes('.langLink::after { content: ""; position: absolute; inset: 0; }'));
  const under380 = block("max-width: 379px");
  for (const rule of [".headerActions { gap: 2px; }", ".langLink { min-width: 40px; }", ".langLink::after { inset: 0 -2px; }"]) {
    assert.ok(under380.includes(rule), rule);
  }
  const under360 = block("max-width: 359px");
  for (const rule of [".wordmark { font-size: 0.875rem; }", ".loginLong { display: none; }", ".loginShort { display: inline; }"]) {
    assert.ok(under360.includes(rule), rule);
  }
  const { getLandingContent } = makeEnv().load("lib/landingContent");
  assert.equal(getLandingContent("fr").header.loginShort, "Connexion");
  assert.equal(getLandingContent("en").header.loginShort, "Sign in");
});

// ── Sitemap ────────────────────────────────────────────────────────────────
test("sitemap : les onze adresses françaises dans le même ordre et au même rythme, de vraies dates, puis les onze anglaises", async () => {
  const env = makeEnv();
  const { getServerSideProps } = env.load("pages/sitemap.xml");
  let xml = "";
  await getServerSideProps({ res: { setHeader() {}, write(chunk) { xml += chunk; }, end() {} } });
  const urls = [...xml.matchAll(/<url>\s*<loc>([^<]+)<\/loc>\s*<lastmod>([^<]+)<\/lastmod>\s*<changefreq>([^<]+)<\/changefreq>\s*<priority>([^<]+)<\/priority>\s*<\/url>/g)]
    .map(([, loc, lastmod, changefreq, priority]) => [loc.replace("https://www.blocus-tracker.com", ""), lastmod, changefreq, priority]);
  assert.deepEqual(urls, [
    ["/", "2026-09-29", "weekly", "1.0"],
    ["/fonctionnalites", "2026-10-14", "monthly", "0.8"],
    ["/guides", "2026-10-14", "monthly", "0.8"],
    ["/faq", "2026-09-27", "monthly", "0.7"],
    ["/pomodoro", "2026-10-07", "weekly", "0.86"],
    ["/planning-revision", "2026-07-06", "weekly", "0.9"],
    ["/stats-etude", "2026-07-06", "weekly", "0.78"],
    ["/objectifs-etude", "2026-07-06", "weekly", "0.76"],
    ["/application-etudiant", "2026-07-06", "weekly", "0.88"],
    ["/blocus-belgique", "2026-10-07", "weekly", "0.92"],
    ["/legal", "2026-09-27", "monthly", "0.3"],
    ["/en", "2026-09-29", "weekly", "1.0"],
    ["/en/features", "2026-10-14", "monthly", "0.8"],
    ["/en/guides", "2026-10-14", "monthly", "0.8"],
    ["/en/faq", "2026-09-27", "monthly", "0.7"],
    ["/en/pomodoro", "2026-10-07", "weekly", "0.86"],
    ["/en/study-planner", "2026-07-06", "weekly", "0.9"],
    ["/en/study-stats", "2026-07-06", "weekly", "0.78"],
    ["/en/study-goals", "2026-07-06", "weekly", "0.76"],
    ["/en/study-app", "2026-07-06", "weekly", "0.88"],
    ["/en/blocus-belgium", "2026-10-07", "weekly", "0.92"],
    ["/en/legal", "2026-09-27", "monthly", "0.3"],
  ]);
  // Chaque guide : la date qu'il déclare lui-même (JSON-LD, mention sur la page).
  const { structuredDataForPath } = env.load("lib/seo");
  for (const [path, lastmod] of urls.slice(4, 10)) {
    const article = structuredDataForPath(path).find((n) => n["@type"] === "Article");
    assert.equal(article.dateModified, lastmod, path);
  }
});
