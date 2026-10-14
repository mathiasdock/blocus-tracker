// /legal sur la mise en page du site public (components/landing/Legal.module.css) :
// la vraie page rendue côté serveur avec la vraie langue (I18nContext) et le
// vrai contenu (lib/legal.js). Garde-fous : les quatre documents entiers dans
// le HTML, un seul visible, les liens /legal?doc=… de l'app (bandeau cookies,
// inscription, profil, rappel des CGU) toujours sur le bon document, le
// référencement inchangé, un chemin de retour pour un compte connecté.
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

function makeEnv({ query = {}, isReady = false, user = null, langPref = null, pathname = "/legal" } = {}) {
  const store = new Map(langPref ? [["bt_lang_pref", langPref]] : []);
  const noop = () => {};
  const globals = {
    console, Intl,
    localStorage: { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) },
    window: { addEventListener: noop, removeEventListener: noop, matchMedia: () => ({ matches: false }) },
    document: { documentElement: { lang: "fr", classList: { add: noop, remove: noop } } },
    navigator: { language: "en-US", languages: ["en-US"] },
  };
  const cssModule = new Proxy({}, { get: (_, key) => (typeof key === "string" && key !== "__esModule" ? key : undefined) });
  // Un lien Next reçoit ici une adresse objet ({ pathname, query }) : la
  // doublure l'écrit comme le ferait Next.
  const href = (value) => (typeof value === "string" ? value : `${value.pathname}?${new URLSearchParams(value.query)}`);
  const mocks = {
    "contexts/AuthContext": { useAuth: () => ({ user, loading: !user }) },
    "next/router": { useRouter: () => ({ pathname, asPath: pathname, query, isReady }) },
    "next/link": { __esModule: true, default: ({ href: to, children, replace, shallow, scroll, ...rest }) => h("a", { href: href(to), "data-replace": replace ? "1" : undefined, ...rest }, children) },
    "components/landing/PublicHeader": { __esModule: true, default: () => h("header", null, "header") },
    "components/landing/PublicFooter": { __esModule: true, default: () => h("footer", null, "footer") },
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

function render(env) {
  const { I18nProvider } = env.load("contexts/I18nContext");
  return renderToString(h(I18nProvider, null, h(env.load("pages/legal").default)));
}
const decode = (s) => s.replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
const text = (html) => decode(html.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ");
const tags = (html, tag) => [...html.matchAll(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "g"))].map((m) => text(m[1]).trim());
const norm = (s) => s.replace(/\s+/g, " ").trim();
// Valeurs nées dans le bac à sable (autre « realm ») : comparées en clair.
const plain = (value) => JSON.parse(JSON.stringify(value));
const flat = (node) => (typeof node === "string" ? node : Array.isArray(node) ? node.map(flat).join("") : node && typeof node === "object" ? flat(node.children || node.props?.children || []) : "");
// L'article d'un document et s'il est masqué.
const articles = (html) => [...html.matchAll(/<article id="legal-([a-z]+)"[^>]*>/g)].map((m) => ({ id: m[1], hidden: /\shidden=""/.test(m[0]) }));
const current = (html) => [...html.matchAll(/<a [^>]*aria-current="page"[^>]*>([\s\S]*?)<\/a>/g)].map((m) => text(m[1]).trim());
const anchors = (html) => [...html.matchAll(/<a [^>]*href="(#[^"]+)"/g)].map((m) => m[1]);

test("légal : les quatre documents entiers dans le HTML serveur, la confidentialité seule visible", () => {
  const env = makeEnv();
  const { LEGAL_DOCS } = env.load("lib/legal");
  const html = render(env);
  assert.deepEqual(tags(html, "h1"), ["Légal & confidentialité"]);
  assert.deepEqual(tags(html, "h2"), plain(LEGAL_DOCS.map((d) => norm(d.fr.title))));
  assert.equal(tags(html, "h3").length, LEGAL_DOCS.reduce((n, d) => n + d.fr.sections.length, 0));
  assert.deepEqual(articles(html), [
    { id: "privacy", hidden: false }, { id: "terms", hidden: true }, { id: "cookies", hidden: true }, { id: "notice", hidden: true },
  ]);
  // Chaque titre, paragraphe et élément de liste, tel quel.
  const visible = text(html);
  for (const d of LEGAL_DOCS) for (const section of d.fr.sections) {
    for (const chunk of [section.h, ...section.body.flatMap((b) => (typeof b === "string" ? [b] : b.list))]) assert.ok(visible.includes(norm(chunk)), chunk);
  }
  // Les quatre documents se choisissent par de vrais liens ; l'adresse est remplacée, pas empilée.
  const docLinks = [...html.matchAll(/<a href="(\/legal\?doc=[a-z]+)"[^>]*data-replace="1"/g)].map((m) => m[1]);
  assert.deepEqual(docLinks, ["/legal?doc=privacy", "/legal?doc=terms", "/legal?doc=cookies", "/legal?doc=notice"]);
  assert.deepEqual(current(html), ["Confidentialité"]);
  // Sommaire du document ouvert : une ancre par section, chacune présente.
  const privacy = LEGAL_DOCS.find((d) => d.id === "privacy");
  assert.deepEqual(anchors(html), plain(privacy.fr.sections.map((_, i) => `#legal-privacy-${i + 1}`)));
  for (const d of LEGAL_DOCS) d.fr.sections.forEach((_, i) => assert.match(html, new RegExp(`<section id="legal-${d.id}-${i + 1}"`)));
  // Visiteur : le surtitre, aucun lien vers l'app ; le crédit sonore garde son lien externe.
  assert.match(html, />Documents légaux<\/p>/);
  assert.doesNotMatch(html, /href="\/dashboard"/);
  assert.match(html, /<a href="https:\/\/elevenlabs\.io\/sound-effects" target="_blank" rel="noreferrer">ElevenLabs<\/a>/);
  assert.match(visible, /Dernière mise à jour : 27 septembre 2026/);
  // La page n'est plus dans la coquille de l'app.
  assert.doesNotMatch(readFileSync(join(ROOT, "pages/legal.js"), "utf8"), /components\/Layout/);
});

test("légal : /legal?doc=… ouvre le bon document ; une valeur inconnue retombe sur la confidentialité", () => {
  for (const [doc, label] of [["terms", "Conditions (CGU)"], ["cookies", "Cookies & stockage"], ["notice", "Mentions légales"], ["privacy", "Confidentialité"]]) {
    const env = makeEnv({ query: { doc }, isReady: true });
    const { LEGAL_DOCS } = env.load("lib/legal");
    const html = render(env);
    assert.deepEqual(articles(html).filter((a) => !a.hidden).map((a) => a.id), [doc]);
    assert.deepEqual(current(html), [label]);
    assert.deepEqual(anchors(html), plain(LEGAL_DOCS.find((d) => d.id === doc).fr.sections.map((_, i) => `#legal-${doc}-${i + 1}`)));
  }
  for (const query of [{ doc: "inconnu" }, { doc: ["terms", "cookies"] }, {}]) {
    const html = render(makeEnv({ query, isReady: true }));
    assert.deepEqual(articles(html).filter((a) => !a.hidden).map((a) => a.id), ["privacy"]);
  }
  // Avant l'hydratation, le rendu est celui du serveur, quelle que soit l'adresse.
  const early = render(makeEnv({ query: { doc: "terms" }, isReady: false }));
  assert.deepEqual(articles(early).filter((a) => !a.hidden).map((a) => a.id), ["privacy"]);
});

test("légal : un compte connecté retrouve le chemin de l'app, à la place du surtitre", () => {
  const html = render(makeEnv({ user: { id: "11111111-2222-4333-8444-555555555555" } }));
  assert.match(html, /<a href="\/dashboard" class="back">[\s\S]*?Retour à l&#x27;app<\/a>/);
  assert.doesNotMatch(html, /Documents légaux/);
  assert.deepEqual(articles(html).filter((a) => !a.hidden).map((a) => a.id), ["privacy"]);
});

test("légal : français sur son adresse même avec l'anglais choisi ; anglais sous une adresse anglaise, tous les documents", () => {
  // Le choix enregistré se lit après le premier rendu (I18nContext) : rendu
  // vivant. Il ne change pas la langue d'une adresse française.
  const chosen = makeEnv({ langPref: "en" });
  {
    const { I18nProvider } = chosen.load("contexts/I18nContext");
    const Page = chosen.load("pages/legal").default;
    let renderer;
    act(() => { renderer = create(h(I18nProvider, null, h(Page))); });
    assert.deepEqual(renderer.root.findAllByType("h1").map((n) => norm(flat(n.props.children))), ["Légal & confidentialité"]);
    act(() => renderer.unmount());
  }

  // Une adresse anglaise : /en/legal viendra (lib/publicRoutes.mjs), /en
  // suffit à rendre la page en anglais.
  const env = makeEnv({ pathname: "/en" });
  const { LEGAL_DOCS } = env.load("lib/legal");
  const { I18nProvider } = env.load("contexts/I18nContext");
  const Page = env.load("pages/legal").default;
  let renderer;
  act(() => { renderer = create(h(I18nProvider, null, h(Page))); });
  const all = (type) => renderer.root.findAllByType(type).map((n) => norm(flat(n.props.children)));
  assert.deepEqual(all("h1"), ["Legal & privacy"]);
  assert.deepEqual(all("h2"), plain(LEGAL_DOCS.map((d) => norm(d.en.title))));
  assert.deepEqual(plain(all("h3")), plain(LEGAL_DOCS.flatMap((d) => d.en.sections.map((s) => norm(s.h)))));
  assert.deepEqual(renderer.root.findAll((n) => n.props?.["aria-current"] === "page").filter((n) => typeof n.type === "string").map((n) => flat(n.props.children)), ["Privacy"]);
  assert.ok(all("p").includes("Last updated: September 27, 2026"));
  act(() => renderer.unmount());
});

test("légal : référencement inchangé (titre, description, indexation, plan du site)", () => {
  const env = makeEnv();
  const { getSeoForPath, SEO_INDEXABLE_ROUTES } = env.load("lib/seo");
  const seo = getSeoForPath("/legal?doc=cookies");
  assert.equal(seo.title, "Confidentialité, CGU et mentions légales | Blocus Tracker");
  assert.equal(seo.description, "Consulte la politique de confidentialité, les conditions d'utilisation, les informations de stockage local et les mentions légales de Blocus Tracker.");
  assert.equal(seo.canonicalPath, "/legal");
  assert.equal(seo.index, true);
  assert.ok(SEO_INDEXABLE_ROUTES.some((r) => r.path === "/legal"));
});
