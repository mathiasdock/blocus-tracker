// Bilinguisme du site public, pilote /en (2026-10-14) : le registre des pages
// FR/EN (lib/publicRoutes.mjs), la langue affichée (contexts/I18nContext.js),
// le passage du site vers l'app (connexion, inscription, retour de Google),
// le référencement des deux accueils et le sitemap. Les pages et composants
// sont rendus pour de vrai (React + Babel dans un contexte vm), comme dans
// tests/guide-article.test.mjs.
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import {
  ENTRY_PATHS, JOURNEY_KEY, PUBLIC_PAGES, PUBLIC_PAGE_PATHS, displayLang, equivalentPath, isEntryPath,
  languageSwitchHref, pageAlternates, publicHref, publicPageLang,
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
    "next/link": { __esModule: true, default: ({ href, children, ...rest }) => h("a", { href, ...rest }, children) },
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

// ── Le registre ────────────────────────────────────────────────────────────
test("registre : les onze adresses françaises inchangées, /en comme seule adresse anglaise, chaque page a son fichier", () => {
  assert.deepEqual(PUBLIC_PAGES.map((page) => page.fr), FR_PAGES);
  assert.deepEqual(PUBLIC_PAGES.filter((page) => page.en).map((page) => page.en), ["/en"]);
  assert.deepEqual(PUBLIC_PAGE_PATHS, [...FR_PAGES, "/en"]);
  for (const path of FR_PAGES) {
    const file = path === "/" ? "pages/index.js" : `pages${path}.js`;
    assert.ok(existsSync(join(ROOT, file)), file);
  }
  // pages/en ne contient que des pages du registre — aucune page de l'app.
  const enFiles = readdirSync(join(ROOT, "pages/en")).sort();
  const enPaths = enFiles.map((file) => (file === "index.js" ? "/en" : `/en/${file.replace(/\.js$/, "")}`));
  assert.deepEqual(enPaths, PUBLIC_PAGES.filter((page) => page.en).map((page) => page.en));
  for (const path of enPaths) assert.equal(publicPageLang(path), "en");
  for (const app of ["/dashboard", "/signup", "/login", "/admin", "/profile", "/en/dashboard", "/en/signup", "/en/admin", "/en/faq"]) {
    assert.equal(publicPageLang(app), null, app);
    assert.equal(existsSync(join(ROOT, `pages${app}.js`)) && app.startsWith("/en/"), false, app);
  }
});

test("registre : les deux versions d'une page seulement quand les deux existent", () => {
  assert.deepEqual(pageAlternates("/"), { fr: "/", en: "/en" });
  assert.deepEqual(pageAlternates("/en?campaign=affiche#faq-title"), { fr: "/", en: "/en" });
  for (const path of FR_PAGES.slice(1)) assert.equal(pageAlternates(path), null, path);
  assert.equal(pageAlternates("/dashboard"), null);
  assert.equal(equivalentPath("/", "en"), "/en");
  assert.equal(equivalentPath("/en", "fr"), "/");
  assert.equal(equivalentPath("/faq", "en"), null);
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
  // Pas encore traduites : l'adresse française, en attendant.
  for (const href of ["/fonctionnalites", "/faq", "/legal?doc=cookies", "/pomodoro"]) assert.equal(publicHref(href, "en"), href);
  // L'app garde ses adresses ; le mode découverte suit la langue de l'app.
  for (const href of ["/dashboard", "/profile", "https://elevenlabs.io", "//evil.example", "#question-2"]) assert.equal(publicHref(href, "en"), href);
  // Une page française ne transmet rien.
  for (const href of ["/signup", "/signup?campaign=affiche", "/login", "/", "/faq"]) assert.equal(publicHref(href, "fr"), href);
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
  // Sans version anglaise : l'accueil anglais, sans le document ni l'ancre de la page.
  assert.equal(languageSwitchHref({ pathname: "/legal", query: { doc: "terms", campaign: "x" }, hash: "#legal-terms-2" }, "en"), "/en?campaign=x");
  assert.equal(languageSwitchHref({ pathname: "/faq", query: {}, hash: "#question-3" }, "en"), "/en");
});

test("langue affichée : l'adresse sur le site, le parcours sur les pages d'entrée, sinon la langue de l'app", () => {
  for (const pathname of FR_PAGES) assert.equal(displayLang({ pathname, journeyLang: "en", appLang: "en" }), "fr", pathname);
  assert.equal(displayLang({ pathname: "/en", journeyLang: "fr", appLang: "fr" }), "en");
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
  for (const [pathname, expected] of [["/", "fr"], ["/faq", "fr"], ["/en", "en"]]) {
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
  // Une page française sans version anglaise, une page de l'app : pas de hreflang.
  assert.equal(getSeoForPath("/faq").alternates, null);
  assert.equal(getSeoForPath("/legal?doc=terms").alternates, null);
  assert.equal(getSeoForPath("/dashboard").alternates, null);
  assert.equal(getSeoForPath("/en/dashboard").index, false);
});

test("SEO : les balises du head — hreflang fr et en sur les deux accueils, seulement là, pas de x-default", () => {
  const head = (pathname) => {
    const env = makeEnv({ pathname });
    const SeoHead = env.load("components/SeoHead").default;
    return renderToStaticMarkup(h(SeoHead));
  };
  const links = (html) => attrs(html, "link").filter((l) => l.rel === "alternate").map((l) => [l.hreflang, l.href]);
  const pair = [["fr", "https://www.blocus-tracker.com/"], ["en", "https://www.blocus-tracker.com/en"]];
  for (const pathname of ["/", "/en"]) assert.deepEqual(links(head(pathname)), pair, pathname);
  for (const pathname of ["/faq", "/pomodoro", "/legal", "/dashboard", "/signup"]) assert.deepEqual(links(head(pathname)), [], pathname);
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
  assert.equal(lang("/en"), "en");
  for (const page of ["/", "/faq", "/legal", "/dashboard", "/signup", "/_error", undefined]) assert.equal(lang(page), "fr", String(page));
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
  assert.deepEqual(hrefs(en).filter((href) => href.startsWith("/en/")), []);
  // Pages pas encore traduites : leur adresse française.
  for (const href of ["/fonctionnalites", "/faq", "/guides", "/legal", "/pomodoro"]) assert.ok(hrefs(en).includes(href), href);
  // En français, aucun paramètre de langue nulle part.
  assert.ok(hrefs(fr).every((href) => !/[?&]lang=/.test(href)), hrefs(fr).join(" "));
  assert.equal(hrefs(fr).filter((href) => href === "/signup").length, 4);
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
test("sitemap : les onze adresses françaises dans le même ordre et au même rythme, de vraies dates, puis /en", async () => {
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
  ]);
  // Chaque guide : la date qu'il déclare lui-même (JSON-LD, mention sur la page).
  const { structuredDataForPath } = env.load("lib/seo");
  for (const [path, lastmod] of urls.slice(4, 10)) {
    const article = structuredDataForPath(path).find((n) => n["@type"] === "Article");
    assert.equal(article.dateModified, lastmod, path);
  }
});
