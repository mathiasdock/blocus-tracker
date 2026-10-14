// Pages vitrines /fonctionnalites, /guides et /faq sur la grammaire des guides
// (components/landing/Showcase.module.css) : les pages réelles rendues côté
// serveur avec la vraie langue (I18nContext) et le vrai contenu
// (lib/landingContent.js, lib/seo.js, lib/seoLandingPages*.js). Garde-fous :
// titres, texte, liens et JSON-LD inchangés ; seule la mise en page change,
// plus le sommaire de la FAQ (liens vers chaque réponse).
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { existsSync, readFileSync, statSync } from "node:fs";
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

function makeEnv({ path = "/fonctionnalites", deviceLanguage = "en-US", langPref = null } = {}) {
  const store = new Map(langPref ? [["bt_lang_pref", langPref]] : []);
  const noop = () => {};
  const globals = {
    console, Intl,
    localStorage: { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) },
    window: { addEventListener: noop, removeEventListener: noop, matchMedia: () => ({ matches: false }) },
    document: { documentElement: { lang: "fr", classList: { add: noop, remove: noop } } },
    navigator: { language: deviceLanguage, languages: [deviceLanguage] },
  };
  // Les modules CSS rendent leur nom de classe ; l'en-tête, le pied et la
  // mascotte sont des doublures. Pas de « __esModule » : l'import par défaut
  // reçoit bien le module.
  const cssModule = new Proxy({}, { get: (_, key) => (typeof key === "string" && key !== "__esModule" ? key : undefined) });
  const mocks = {
    "contexts/AuthContext": { useAuth: () => ({ user: null, loading: true }) },
    "next/router": { useRouter: () => ({ pathname: path, asPath: path }) },
    "next/link": { __esModule: true, default: ({ href, children, ...rest }) => h("a", { href, ...rest }, children) },
    "components/landing/PublicHeader": { __esModule: true, default: () => h("header", null, "header") },
    "components/landing/PublicFooter": { __esModule: true, default: () => h("footer", null, "footer") },
    "components/Mascot": { __esModule: true, default: () => h("svg", { "data-mascot": "1" }) },
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
  return { load: (p) => load(resolveFile(join(ROOT, p))) };
}

function render(env, file) {
  const { I18nProvider } = env.load("contexts/I18nContext");
  return renderToString(h(I18nProvider, null, h(env.load(file).default)));
}
const decode = (s) => s.replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
const text = (html) => decode(html.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ");
const tags = (html, tag) => [...html.matchAll(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "g"))].map((m) => text(m[1]).trim());
const links = (html) => [...html.matchAll(/<a [^>]*href="([^"]+)"/g)].map((m) => m[1]);
const imgs = (html) => [...html.matchAll(/<img [^>]*>/g)].map((m) => ({ src: m[0].match(/src="([^"]+)"/)[1], alt: decode(m[0].match(/alt="([^"]*)"/)[1]), eager: /loading="eager"/.test(m[0]) }));
const norm = (s) => s.replace(/\s+/g, " ").trim();
const plain = (value) => JSON.parse(JSON.stringify(value));
const flat = (node) => (typeof node === "string" ? node : Array.isArray(node) ? node.map(flat).join("") : node && typeof node === "object" ? flat(node.children || node.props?.children || []) : "");
const shotFilesExist = (SHOTS, names) => {
  for (const name of names) for (const lang of ["fr", "en"]) for (const width of SHOTS[name].widths) {
    assert.ok(existsSync(join(ROOT, "public/site-web/v2", lang, `${name}-${width}.webp`)), `${lang}/${name}-${width}`);
  }
};

test("fonctionnalités : mêmes titres, textes et liens ; chaque domaine avec ses vraies captures", () => {
  const env = makeEnv();
  const f = env.load("lib/landingContent").getLandingContent("fr").features;
  const { SHOTS } = env.load("lib/siteShots.cjs");
  const html = render(env, "pages/fonctionnalites");
  const keys = ["chrono", "planning", "stats", "progression", "social", "spaces"];
  const ids = ["chrono", "planning", "stats", "progression", "social", "espaces-de-cours"];
  assert.deepEqual(tags(html, "h1"), [norm(f.title)]);
  assert.deepEqual(tags(html, "h2").slice(0, 6), keys.map((k) => norm(f.areas[k].title)));
  assert.equal(tags(html, "h3").length, 0);
  // Le sommaire mène aux six domaines, dans l'ordre, et chaque domaine garde son ancre.
  assert.deepEqual(links(html).filter((href) => href.startsWith("#")), ids.map((id) => `#${id}`));
  for (const id of ids) assert.match(html, new RegExp(`<section id="${id}" aria-labelledby="${id}-title"`));
  assert.match(html, new RegExp(`<nav class="index" aria-label="${f.jump}">`));
  const visible = text(html);
  for (const k of keys) for (const chunk of [f.areas[k].text, ...f.areas[k].points]) assert.ok(visible.includes(norm(chunk)), chunk);
  // Les captures : actuelles, chacune décrite, aucune chargée d'emblée (sous le haut de page).
  const list = imgs(html);
  assert.deepEqual(list.map((i) => i.src), [
    "/site-web/v2/fr/feat-chrono-900.webp", "/site-web/v2/fr/feat-focus-900.webp",
    "/site-web/v2/fr/guide-planning-month-1200.webp", "/site-web/v2/fr/guide-stats-overview-1200.webp",
    "/site-web/v2/fr/guide-goals-progress-1200.webp", "/site-web/v2/fr/feat-social-phone-900.webp", "/site-web/v2/fr/feat-spaces-phone-900.webp",
  ]);
  assert.deepEqual(list.map((i) => i.alt), plain([f.areas.chrono.alt, f.areas.chrono.focusAlt, f.areas.planning.alt, f.areas.stats.alt, f.areas.progression.alt, f.areas.social.alt, f.areas.spaces.alt]));
  assert.ok(list.every((i) => !i.eager));
  shotFilesExist(SHOTS, ["feat-chrono", "feat-chrono-mobile", "feat-focus", "feat-focus-mobile", "feat-social-phone", "feat-spaces-phone",
    "guide-planning-month", "guide-planning-month-mobile", "guide-stats-overview", "guide-stats-overview-mobile", "guide-goals-progress", "guide-goals-progress-mobile"]);
  // La carte du Chrono et le mode Focus ont le même format : côte à côte, même hauteur.
  const ratio = (name) => SHOTS[name].crop[2] / SHOTS[name].crop[3];
  assert.ok(Math.abs(ratio("feat-chrono") / ratio("feat-focus") - 1) < 0.002);
  assert.ok(Math.abs(ratio("feat-chrono-mobile") / ratio("feat-focus-mobile") - 1) < 0.002);
});

test("guides : la boucle en quatre temps et le sommaire des six guides, chacun avec une capture décorative", () => {
  const env = makeEnv({ path: "/guides" });
  const c = env.load("lib/landingContent").getLandingContent("fr").guidesPage;
  const { SEO_LANDING_PAGES, SEO_LANDING_PATHS } = env.load("lib/seoLandingPages");
  const { SHOTS } = env.load("lib/siteShots.cjs");
  const html = render(env, "pages/guides");
  assert.deepEqual(tags(html, "h1"), [norm(c.title)]);
  assert.deepEqual(tags(html, "h2").slice(0, 2), [norm(c.methodTitle), norm(c.allTitle)]);
  assert.deepEqual(tags(html, "h3"), [...c.steps.map((s) => norm(s.title)), ...SEO_LANDING_PATHS.map((p) => norm(SEO_LANDING_PAGES[p].h1))]);
  // Les quatre temps, numérotés, chacun vers son guide ; puis les six guides.
  const visible = text(html);
  c.steps.forEach((step, index) => {
    assert.ok(visible.includes(`${String(index + 1).padStart(2, "0")} ${norm(step.title)}`), step.title);
    assert.ok(visible.includes(norm(step.text)) && visible.includes(norm(step.link)), step.link);
  });
  for (const p of SEO_LANDING_PATHS) assert.ok(visible.includes(norm(c.cards[p])) && visible.includes(norm(SEO_LANDING_PAGES[p].eyebrow)), p);
  assert.deepEqual(links(html).filter((href) => !["/dashboard", "/signup"].includes(href)), [...c.steps.map((s) => s.href), ...SEO_LANDING_PATHS]);
  // Les vignettes : de vraies captures, décoratives (le titre du lien nomme le
  // guide), en un seul petit fichier chacune.
  const list = imgs(html);
  assert.equal(list.length, 6);
  assert.ok(list.every((i) => i.alt === "" && !i.eager));
  const names = list.map((i) => i.src.match(/\/fr\/(.+)-\d+\.webp$/)[1]);
  assert.deepEqual(names, plain(SEO_LANDING_PATHS.map((p) => `thumb${p.replace("/", "-")}`)));
  shotFilesExist(SHOTS, names);
  for (const name of names) for (const lang of ["fr", "en"]) {
    assert.deepEqual(plain(SHOTS[name].widths), [360], name);
    assert.ok(statSync(join(ROOT, "public/site-web/v2", lang, `${name}-360.webp`)).size < 12 * 1024, `${lang}/${name} léger`);
  }
});

test("FAQ : les neuf réponses visibles, un sommaire qui mène à chacune, JSON-LD inchangé", () => {
  const env = makeEnv({ path: "/faq" });
  const p = env.load("lib/landingContent").getLandingContent("fr").faqPage;
  const { FAQ, structuredDataForPath } = env.load("lib/seo");
  const html = render(env, "pages/faq");
  assert.deepEqual(tags(html, "h1"), [norm(p.title)]);
  assert.deepEqual(tags(html, "h2").slice(0, 9), plain(FAQ.map((item) => norm(item.q))));
  for (const item of FAQ) assert.ok(text(html).includes(norm(item.a)), item.q);
  // Aucun accordéon : pas de <details>, chaque réponse est un paragraphe visible.
  assert.doesNotMatch(html, /<details|aria-expanded|hidden=""/);
  // Le sommaire : un lien par question, vers l'article qui porte la réponse.
  const anchors = links(html).filter((href) => href.startsWith("#"));
  assert.deepEqual(anchors, plain(FAQ.map((_, index) => `#question-${index + 1}`)));
  for (const [index, item] of FAQ.entries()) {
    assert.match(html, new RegExp(`<a href="#question-${index + 1}" class="faqNavLink">${item.q.replace(/[?()]/g, "\\$&").replace(/'/g, "&#x27;").replace(/«/g, "«").replace(/»/g, "»")}</a>`));
    assert.match(html, new RegExp(`<article id="question-${index + 1}" class="faqItem">`));
  }
  assert.match(html, new RegExp(`<nav class="faqNav" aria-label="${p.title}">`));
  const nodes = plain(structuredDataForPath("/faq"));
  const faq = nodes.find((n) => n["@type"] === "FAQPage");
  assert.deepEqual(faq.mainEntity.map((q) => [q.name, q.acceptedAnswer.text]), plain(FAQ.map((q) => [q.q, q.a])));
});

test("les trois pages : français sur leur adresse même avec l'anglais choisi ; anglais sous une adresse anglaise, captures décrites en anglais", () => {
  const files = { "/fonctionnalites": "pages/fonctionnalites", "/guides": "pages/guides", "/faq": "pages/faq" };
  for (const [path, file] of Object.entries(files)) {
    // Le choix enregistré se lit au montage : il ne change pas la langue de
    // l'adresse française.
    const chosen = makeEnv({ path, deviceLanguage: "en-US", langPref: "en" });
    const fr = chosen.load("lib/landingContent").getLandingContent("fr");
    {
      const { I18nProvider } = chosen.load("contexts/I18nContext");
      const Page = chosen.load(file).default;
      let renderer;
      act(() => { renderer = create(h(I18nProvider, null, h(Page))); });
      const expected = { "/fonctionnalites": fr.features.title, "/guides": fr.guidesPage.title, "/faq": fr.faqPage.title }[path];
      assert.equal(flat(renderer.root.findByType("h1").props.children), expected, path);
      act(() => renderer.unmount());
    }

    // Une adresse anglaise : leur adresse /en/… viendra (lib/publicRoutes.mjs),
    // /en suffit à rendre la page en anglais.
    const env = makeEnv({ path: "/en", deviceLanguage: "fr-BE" });
    const content = env.load("lib/landingContent").getLandingContent("en");
    const { I18nProvider } = env.load("contexts/I18nContext");
    const Page = env.load(file).default;
    let renderer;
    act(() => { renderer = create(h(I18nProvider, null, h(Page))); });
    const title = flat(renderer.root.findByType("h1").props.children);
    const expected = { "/fonctionnalites": content.features.title, "/guides": content.guidesPage.title, "/faq": content.faqPage.title }[path];
    assert.equal(title, expected, path);
    const sources = renderer.root.findAllByType("img").map((i) => i.props.src);
    assert.ok(sources.every((src) => src.startsWith("/site-web/v2/en/")), path);
    if (path === "/fonctionnalites") {
      assert.deepEqual(renderer.root.findAllByType("img").map((i) => i.props.alt).slice(0, 2), plain([content.features.areas.chrono.alt, content.features.areas.chrono.focusAlt]));
    }
    act(() => renderer.unmount());
  }
});

test("l'accueil ne charge ni la feuille des pages vitrines ni celle des guides", () => {
  const home = readFileSync(join(ROOT, "pages/index.js"), "utf8");
  assert.doesNotMatch(home, /Showcase\.module\.css|Guide\.module\.css/);
  for (const page of ["fonctionnalites", "guides", "faq"]) {
    const source = readFileSync(join(ROOT, `pages/${page}.js`), "utf8");
    assert.match(source, /Showcase\.module\.css/, page);
  }
});
