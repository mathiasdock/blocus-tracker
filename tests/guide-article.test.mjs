// /planning-revision sur le gabarit éditorial des guides (pilote de la refonte
// du site public) : la page réelle (pages/planning-revision.js, GuideArticle)
// rendue côté serveur avec la vraie langue (I18nContext) et le vrai contenu
// (lib/seoLandingPages*.js). Garde-fous : texte, titres, liens et JSON-LD
// identiques à l'ancien gabarit — seule la mise en page change.
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
const PATH = "/planning-revision";

function makeEnv({ deviceLanguage = "en-US", langPref = null } = {}) {
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
  // mascotte sont des doublures (leur rendu est testé ailleurs).
  const cssModule = new Proxy({}, { get: (_, key) => (typeof key === "string" ? key : undefined) });
  const mocks = {
    "contexts/AuthContext": { useAuth: () => ({ user: null, loading: true }) },
    "next/router": { useRouter: () => ({ pathname: PATH, asPath: PATH }) },
    "next/link": { __esModule: true, default: ({ href, children, ...rest }) => h("a", { href, ...rest }, children) },
    "next/image": { __esModule: true, default: (props) => h("img", { src: props.src, alt: props.alt }) },
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
  return { load: (path) => load(resolveFile(join(ROOT, path))) };
}

// Rendu serveur tel que _app le monte : la langue, puis la page.
function render(env, Page, props = {}) {
  const { I18nProvider } = env.load("contexts/I18nContext");
  return renderToString(h(I18nProvider, null, h(Page, props)));
}
const decode = (s) => s.replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
const text = (html) => decode(html.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ");
const tags = (html, tag) => [...html.matchAll(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "g"))].map((m) => text(m[1]).trim());
const links = (html) => [...html.matchAll(/<a [^>]*href="([^"]+)"/g)].map((m) => m[1]).sort();
const norm = (s) => s.replace(/\s+/g, " ").trim();
// Les données viennent d'un autre contexte vm : on les recopie avant de comparer.
const plain = (value) => JSON.parse(JSON.stringify(value));
// Texte d'un arbre react-test-renderer (toJSON) ou d'enfants React.
const flat = (node) => (typeof node === "string" ? node : Array.isArray(node) ? node.map(flat).join("") : node && typeof node === "object" ? flat(node.children || node.props?.children || []) : "");

test("pilote : même H1, mêmes H2/H3 dans le même ordre, même texte et mêmes liens que l'ancien gabarit", () => {
  const env = makeEnv();
  const { SEO_LANDING_PAGES } = env.load("lib/seoLandingPages");
  const page = SEO_LANDING_PAGES[PATH];
  const Pilot = env.load("pages/planning-revision").default;
  const Old = env.load("components/SeoLandingPage").default;
  const html = render(env, Pilot);
  const before = render(env, Old, { page });

  assert.deepEqual(tags(html, "h1"), [page.h1]);
  assert.deepEqual(tags(html, "h1"), tags(before, "h1"));
  assert.deepEqual(tags(html, "h2"), tags(before, "h2"));
  assert.deepEqual(tags(html, "h3"), tags(before, "h3"));
  assert.deepEqual(tags(html, "h2"), [
    "Réponse courte", ...page.sections.map((s) => s.title), page.featurePanel.title,
    "Continuer intelligemment", "Questions fréquentes", "Passe de l'intention à une vraie session.",
  ].map(norm));

  // Tout le texte éditorial, mot pour mot (espaces insécables comprises).
  const visible = text(html);
  const editorial = [page.eyebrow, page.lead, page.shortAnswer, page.ctaLabel, page.secondaryCtaLabel,
    ...page.proofPoints, ...page.sections.flatMap((s) => [s.title, ...s.body, ...(s.bullets || [])]),
    page.featurePanel.title, ...page.featurePanel.items, ...page.related.flatMap((r) => [r.label, r.text]),
    ...page.faq.flatMap((q) => [q.q, q.a])];
  for (const chunk of editorial) assert.ok(visible.includes(norm(chunk)), chunk);
  // Les chaînes de la coquille aussi : rien ne disparaît par rapport à l'ancien gabarit.
  for (const shell of ["Inclus", "Créer mon espace", "Lancer le chrono", "Créer un compte",
    "Ces guides sont liés entre eux", "Des réponses directes pour t'aider", "Tu peux tester le chrono tout de suite."]) {
    assert.ok(visible.includes(shell) && text(before).includes(shell), shell);
  }

  // Les mêmes liens, autant de fois chacun.
  assert.deepEqual(links(html), links(before));
  assert.deepEqual(links(html), ["/blocus-belgique", "/dashboard", "/dashboard", "/objectifs-etude", "/pomodoro", "/signup", "/signup", "/stats-etude"]);
  assert.match(html, /<a href="\/dashboard"[^>]*>Lancer le chrono<\/a>/);
});

test("pilote : la méthode en 5 étapes est une liste numérotée, dans l'ordre", () => {
  const env = makeEnv();
  const { SEO_LANDING_PAGES } = env.load("lib/seoLandingPages");
  const page = SEO_LANDING_PAGES[PATH];
  const html = render(env, env.load("pages/planning-revision").default);
  const ol = html.match(/<ol[^>]*>([\s\S]*?)<\/ol>/);
  assert.ok(ol, "liste numérotée");
  assert.deepEqual(tags(ol[1], "li"), plain(page.sections[0].bullets).map(norm));
  assert.equal((html.match(/<ol[\s>]/g) || []).length, 1);
});

test("pilote : la vraie capture du Planning remplace l'illustration commune, téléphone à part", () => {
  const env = makeEnv();
  const { SEO_LANDING_PAGES } = env.load("lib/seoLandingPages");
  const { SHOTS } = env.load("lib/siteShots.cjs");
  const page = SEO_LANDING_PAGES[PATH];
  const html = render(env, env.load("pages/planning-revision").default);
  assert.doesNotMatch(html, /seo-preview/);
  assert.match(html, /<source media="\(max-width: 639px\)" srcSet="\/site-web\/v2\/fr\/guide-planning-month-mobile-600\.webp 600w/);
  const img = html.match(/<img [^>]*>/)[0];
  assert.match(img, /src="\/site-web\/v2\/fr\/guide-planning-month-1200\.webp"/);
  assert.match(img, /loading="eager"/);
  assert.match(img, /width="1200" height="836"/);
  assert.equal(decode(img.match(/alt="([^"]+)"/)[1]), page.productShot.alt.replace(/ :/g, "\u00A0:"));
  // Les deux captures existent en français et en anglais, à chaque largeur déclarée.
  for (const name of [page.productShot.name, page.productShot.mobile]) {
    for (const lang of ["fr", "en"]) {
      for (const width of SHOTS[name].widths) {
        assert.ok(existsSync(join(ROOT, "public/site-web/v2", lang, `${name}-${width}.webp`)), `${lang}/${name}-${width}`);
      }
    }
  }
});

test("pilote : JSON-LD et meta inchangés — Article, FAQ visible = FAQ du JSON-LD, image de partage", () => {
  const env = makeEnv();
  const { getSeoForPath, structuredDataForPath } = env.load("lib/seo");
  const { SEO_LANDING_PAGES } = env.load("lib/seoLandingPages");
  const page = SEO_LANDING_PAGES[PATH];
  const seo = getSeoForPath(PATH);
  assert.equal(seo.title, "Planning de révision efficace | Méthode et outil étudiant");
  assert.equal(seo.canonicalUrl, "https://www.blocus-tracker.com/planning-revision");
  assert.match(seo.robots, /^index, follow/);
  const nodes = JSON.parse(JSON.stringify(structuredDataForPath(PATH)));
  assert.deepEqual(nodes.map((n) => n["@type"]), ["Organization", "WebSite", "WebPage", "Article", "FAQPage", "BreadcrumbList"]);
  const article = nodes.find((n) => n["@type"] === "Article");
  assert.equal(article.headline, page.h1);
  assert.match(article.image, /\/seo-preview\.png/);
  assert.ok(!JSON.stringify(nodes).includes("guide-planning-month"), "la capture n'entre pas dans le JSON-LD");
  const faq = nodes.find((n) => n["@type"] === "FAQPage");
  assert.deepEqual(faq.mainEntity.map((q) => [q.name, q.acceptedAnswer.text]), plain(page.faq.map((q) => [q.q, q.a])));
  const visible = text(render(env, env.load("pages/planning-revision").default));
  for (const q of faq.mainEntity) assert.ok(visible.includes(norm(q.name)) && visible.includes(norm(q.acceptedAnswer.text)), q.name);
});

test("pilote : typographie française à l'affichage seulement — le contenu et le JSON-LD gardent leurs espaces", () => {
  const env = makeEnv();
  const { SEO_LANDING_PAGES } = env.load("lib/seoLandingPages");
  const page = SEO_LANDING_PAGES[PATH];
  const html = render(env, env.load("pages/planning-revision").default);
  assert.ok(html.includes("Faut-il planifier chaque heure de la journée\u00A0?"));
  assert.ok(html.includes("«\u00A0réviser droit\u00A0»"));
  assert.ok(page.faq[1].q.endsWith("journée ?"), "donnée source inchangée");
});

test("pilote : français sous un navigateur anglais, anglais sur choix manuel", () => {
  const fr = makeEnv({ deviceLanguage: "en-US" });
  const frHtml = render(fr, fr.load("pages/planning-revision").default);
  assert.match(frHtml, /<h1[^>]*>Créer un planning de révision qui tient vraiment<\/h1>/);
  assert.doesNotMatch(text(frHtml), /Build a revision plan|Short answer/);

  // Le choix manuel est lu au montage (I18nContext) : rendu client.
  const en = makeEnv({ deviceLanguage: "fr-BE", langPref: "en" });
  const { SEO_LANDING_PAGES_EN } = en.load("lib/seoLandingPagesEn");
  const { I18nProvider } = en.load("contexts/I18nContext");
  const Page = en.load("pages/planning-revision").default;
  let renderer;
  act(() => { renderer = create(h(I18nProvider, null, h(Page))); });
  const root = renderer.root;
  const enPage = SEO_LANDING_PAGES_EN[PATH];
  const all = flat(renderer.toJSON());
  assert.equal(flat(root.findByType("h1").props.children), enPage.h1);
  for (const chunk of [enPage.shortAnswer, ...enPage.sections[0].bullets, "Short answer", "Keep going, smartly", "Start the timer"]) {
    assert.ok(all.includes(chunk), chunk);
  }
  assert.equal(root.findAllByType("ol").length, 1);
  const img = root.findByType("img");
  assert.equal(img.props.alt, enPage.productShot.alt);
  assert.match(img.props.src, /\/site-web\/v2\/en\/guide-planning-month-1200\.webp/);
  assert.match(root.findByType("source").props.srcSet, /\/en\/guide-planning-month-mobile-600\.webp/);
  act(() => renderer.unmount());
});
