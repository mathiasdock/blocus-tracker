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
  // Pas de « __esModule » : l'import par défaut reçoit bien la doublure.
  const cssModule = new Proxy({}, { get: (_, key) => (typeof key === "string" && key !== "__esModule" ? key : undefined) });
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

// ── /stats-etude et /objectifs-etude : même gabarit, compositions propres ──
const GUIDES = {
  "/stats-etude": { file: "pages/stats-etude", hero: "guide-stats-overview", ordered: false },
  "/objectifs-etude": { file: "pages/objectifs-etude", hero: "guide-goals-progress", ordered: true },
};

test("stats et objectifs : même H1, mêmes H2/H3 dans le même ordre, même texte et mêmes liens que l'ancien gabarit", () => {
  const env = makeEnv();
  const { SEO_LANDING_PAGES } = env.load("lib/seoLandingPages");
  const Old = env.load("components/SeoLandingPage").default;
  for (const [path, guide] of Object.entries(GUIDES)) {
    const page = SEO_LANDING_PAGES[path];
    const html = render(env, env.load(guide.file).default);
    const before = render(env, Old, { page });
    assert.deepEqual(tags(html, "h1"), [page.h1], path);
    for (const tag of ["h1", "h2", "h3"]) assert.deepEqual(tags(html, tag), tags(before, tag), `${path} ${tag}`);
    assert.deepEqual(links(html), links(before), path);
    const visible = text(html);
    const editorial = [page.eyebrow, page.lead, page.shortAnswer, page.ctaLabel, page.secondaryCtaLabel,
      ...page.proofPoints, ...page.sections.flatMap((s) => [s.title, ...s.body, ...(s.bullets || [])]),
      page.featurePanel.title, ...page.featurePanel.items, ...page.related.flatMap((r) => [r.label, r.text]),
      ...page.faq.flatMap((q) => [q.q, q.a])];
    for (const chunk of editorial) assert.ok(visible.includes(norm(chunk)), `${path} : ${chunk}`);
    for (const shell of ["Inclus", "Créer mon espace", "Lancer le chrono", "Créer un compte", "Réponse courte"]) {
      assert.ok(visible.includes(shell) && text(before).includes(shell), `${path} : ${shell}`);
    }
    assert.doesNotMatch(html, /seo-preview/, path);
  }
});

test("stats : les vrais graphiques en panorama, puis deux cartes réelles à côté de la liste des données", () => {
  const env = makeEnv();
  const { SEO_LANDING_PAGES } = env.load("lib/seoLandingPages");
  const { SHOTS } = env.load("lib/siteShots.cjs");
  const page = SEO_LANDING_PAGES["/stats-etude"];
  const html = render(env, env.load("pages/stats-etude").default);
  const imgs = [...html.matchAll(/<img [^>]*>/g)].map((m) => ({ src: m[0].match(/src="([^"]+)"/)[1], alt: decode(m[0].match(/alt="([^"]+)"/)[1]), eager: /loading="eager"/.test(m[0]) }));
  assert.deepEqual(imgs.map((i) => i.src), [
    "/site-web/v2/fr/guide-stats-overview-1200.webp",
    "/site-web/v2/fr/guide-stats-records-900.webp",
    "/site-web/v2/fr/guide-stats-regularity-1200.webp",
  ]);
  // Seule la capture du haut est chargée tout de suite.
  assert.deepEqual(imgs.map((i) => i.eager), [true, false, false]);
  const alts = [page.productShot.alt, ...page.sections[0].figures.map((f) => f.alt)].map((a) => a.replace(/ :/g, " :"));
  assert.deepEqual(imgs.map((i) => i.alt), alts);
  assert.match(html, /<source media="\(max-width: 639px\)" srcSet="\/site-web\/v2\/fr\/guide-stats-overview-mobile-600\.webp 600w/);
  assert.match(html, /<source media="\(max-width: 639px\)" srcSet="\/site-web\/v2\/fr\/guide-stats-regularity-mobile-600\.webp 600w/);
  // Les données à suivre : une liste à filets, pas d'étapes numérotées.
  assert.equal((html.match(/<ol[\s>]/g) || []).length, 0);
  const ul = html.match(/<ul role="list" class="bullets">([\s\S]*?)<\/ul>/);
  assert.ok(ul, "liste des données");
  assert.deepEqual(tags(ul[1], "li"), plain(page.sections[0].bullets).map(norm));
  // La première section, illustrée, précède les autres et garde son titre.
  assert.ok(html.indexOf(page.sections[0].title) < html.indexOf("guide-stats-records") && html.indexOf("guide-stats-regularity") < html.indexOf(page.sections[1].title));
  for (const name of ["guide-stats-overview", "guide-stats-overview-mobile", "guide-stats-records", "guide-stats-regularity", "guide-stats-regularity-mobile"]) {
    for (const lang of ["fr", "en"]) for (const width of SHOTS[name].widths) {
      assert.ok(existsSync(join(ROOT, "public/site-web/v2", lang, `${name}-${width}.webp`)), `${lang}/${name}-${width}`);
    }
  }
});

test("objectifs : la progression réelle dans le panneau, la méthode pour écrire un objectif en étapes numérotées", () => {
  const env = makeEnv();
  const { SEO_LANDING_PAGES } = env.load("lib/seoLandingPages");
  const { SHOTS } = env.load("lib/siteShots.cjs");
  const page = SEO_LANDING_PAGES["/objectifs-etude"];
  const html = render(env, env.load("pages/objectifs-etude").default);
  const img = html.match(/<img [^>]*>/g);
  assert.equal(img.length, 1);
  assert.match(img[0], /src="\/site-web\/v2\/fr\/guide-goals-progress-1200\.webp"/);
  assert.match(img[0], /loading="eager"/);
  assert.equal(decode(img[0].match(/alt="([^"]+)"/)[1]), page.productShot.alt.replace(/ :/g, " :"));
  assert.match(html, /<source media="\(max-width: 639px\)" srcSet="\/site-web\/v2\/fr\/guide-goals-progress-mobile-600\.webp 600w/);
  assert.match(html, /class="[^"]*layoutPanel/);
  const ol = html.match(/<ol[^>]*>([\s\S]*?)<\/ol>/);
  assert.ok(ol, "liste numérotée");
  assert.deepEqual(tags(ol[1], "li"), plain(page.sections[0].bullets).map(norm));
  for (const name of ["guide-goals-progress", "guide-goals-progress-mobile"]) {
    for (const lang of ["fr", "en"]) for (const width of SHOTS[name].widths) {
      assert.ok(existsSync(join(ROOT, "public/site-web/v2", lang, `${name}-${width}.webp`)), `${lang}/${name}-${width}`);
    }
  }
});

test("stats et objectifs : meta, canonical et JSON-LD inchangés, FAQ visible = FAQ du JSON-LD", () => {
  const env = makeEnv();
  const { getSeoForPath, structuredDataForPath } = env.load("lib/seo");
  const { SEO_LANDING_PAGES } = env.load("lib/seoLandingPages");
  const expected = {
    "/stats-etude": "Statistiques d'étude | Suivre son temps de révision",
    "/objectifs-etude": "Objectifs d'étude | Fixer des objectifs de révision réalistes",
  };
  for (const [path, guide] of Object.entries(GUIDES)) {
    const page = SEO_LANDING_PAGES[path];
    const seo = getSeoForPath(path);
    assert.equal(seo.title, expected[path]);
    assert.equal(seo.canonicalUrl, `https://www.blocus-tracker.com${path}`);
    assert.match(seo.robots, /^index, follow/);
    const nodes = JSON.parse(JSON.stringify(structuredDataForPath(path)));
    assert.deepEqual(nodes.map((n) => n["@type"]), ["Organization", "WebSite", "WebPage", "Article", "FAQPage", "BreadcrumbList"]);
    const article = nodes.find((n) => n["@type"] === "Article");
    assert.equal(article.headline, page.h1);
    assert.match(article.image, /\/seo-preview\.png/);
    assert.ok(!JSON.stringify(nodes).includes("guide-"), `${path} : aucune capture dans le JSON-LD`);
    const faq = nodes.find((n) => n["@type"] === "FAQPage");
    assert.deepEqual(faq.mainEntity.map((q) => [q.name, q.acceptedAnswer.text]), plain(page.faq.map((q) => [q.q, q.a])));
    const visible = text(render(env, env.load(guide.file).default));
    for (const q of faq.mainEntity) assert.ok(visible.includes(norm(q.name)) && visible.includes(norm(q.acceptedAnswer.text)), q.name);
  }
});

test("stats et objectifs : anglais sur choix manuel, captures et textes alternatifs anglais", () => {
  for (const [path, guide] of Object.entries(GUIDES)) {
    const env = makeEnv({ deviceLanguage: "fr-BE", langPref: "en" });
    const { SEO_LANDING_PAGES_EN } = env.load("lib/seoLandingPagesEn");
    const { I18nProvider } = env.load("contexts/I18nContext");
    const Page = env.load(guide.file).default;
    let renderer;
    act(() => { renderer = create(h(I18nProvider, null, h(Page))); });
    const root = renderer.root;
    const enPage = SEO_LANDING_PAGES_EN[path];
    assert.equal(flat(root.findByType("h1").props.children), enPage.h1, path);
    const all = flat(renderer.toJSON());
    for (const chunk of [enPage.shortAnswer, ...enPage.sections[0].bullets, "Short answer", "Start the timer"]) assert.ok(all.includes(chunk), `${path} : ${chunk}`);
    const imgs = root.findAllByType("img");
    assert.equal(imgs[0].props.alt, enPage.productShot.alt, path);
    assert.match(imgs[0].props.src, new RegExp(`/site-web/v2/en/${guide.hero}-1200\\.webp`));
    if (path === "/stats-etude") assert.deepEqual(imgs.slice(1).map((i) => i.props.alt), plain(enPage.sections[0].figures.map((f) => f.alt)));
    assert.equal(root.findAllByType("ol").length, guide.ordered ? 1 : 0, path);
    act(() => renderer.unmount());
  }
});

test("ancien gabarit : « Créer mon espace » reste lisible en thème sombre, et identique en clair", () => {
  const source = readFileSync(join(ROOT, "components/SeoLandingPage.js"), "utf8");
  const pill = source.match(/<Link href="\/signup" className="[^"]*bg-white[^"]*" style=\{\{ color: "var\((--bt-[a-z-]+)\)" \}\}>/);
  assert.ok(pill, "bouton blanc de l'encadré");
  const token = pill[1];
  const css = readFileSync(join(ROOT, "styles/colors.css"), "utf8");
  const values = [...css.matchAll(new RegExp(`${token}:\\s*(#[0-9A-Fa-f]{6})`, "g"))].map((m) => m[1].toUpperCase());
  assert.equal(values.length, 1, `${token} : une seule valeur, aucun remplacement en sombre`);
  assert.equal(values[0], "#2D6A4F", "même vert qu'avant en thème clair");
  const lum = (hex) => { const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
  assert.ok((1.05) / (lum(values[0]) + 0.05) >= 4.5, "contraste ≥ 4,5:1 sur blanc");
});

// ── /application-etudiant et /blocus-belgique : les deux derniers guides ──
const LAST = {
  "/application-etudiant": { file: "pages/application-etudiant", title: "Application pour étudier | Chrono, planning et stats étudiant" },
  "/blocus-belgique": { file: "pages/blocus-belgique", title: "Blocus étudiant en Belgique : définition, planning et conseils" },
};
const imgsOf = (html) => [...html.matchAll(/<img [^>]*>/g)].map((m) => ({
  src: m[0].match(/src="([^"]+)"/)[1],
  alt: decode(m[0].match(/alt="([^"]+)"/)[1]),
  eager: /loading="eager"/.test(m[0]),
}));
const typeset = (s) => s.replace(/ ([?!:;»])/g, " $1").replace(/« /g, "« ");

test("application et blocus : même H1, mêmes H2/H3 dans le même ordre, même texte et mêmes liens que l'ancien gabarit", () => {
  const env = makeEnv();
  const { SEO_LANDING_PAGES } = env.load("lib/seoLandingPages");
  const Old = env.load("components/SeoLandingPage").default;
  for (const [path, guide] of Object.entries(LAST)) {
    const page = SEO_LANDING_PAGES[path];
    const html = render(env, env.load(guide.file).default);
    const before = render(env, Old, { page });
    assert.deepEqual(tags(html, "h1"), [page.h1], path);
    for (const tag of ["h1", "h2", "h3"]) assert.deepEqual(tags(html, tag), tags(before, tag), `${path} ${tag}`);
    // Les mêmes liens, autant de fois chacun — sources comprises.
    assert.deepEqual(links(html), links(before), path);
    const visible = text(html);
    const editorial = [page.eyebrow, page.lead, page.shortAnswer, page.ctaLabel, page.secondaryCtaLabel,
      ...page.proofPoints, ...page.sections.flatMap((s) => [s.title, ...s.body, ...(s.bullets || [])]),
      page.featurePanel.title, ...page.featurePanel.items, ...page.related.flatMap((r) => [r.label, r.text]),
      ...page.faq.flatMap((q) => [q.q, q.a]), ...(page.byline ? [page.byline] : []),
      ...(page.sources || []).map((source) => source.label)];
    for (const chunk of editorial) assert.ok(visible.includes(norm(chunk)), `${path} : ${chunk}`);
    for (const shell of ["Inclus", "Créer mon espace", "Lancer le chrono", "Créer un compte", "Réponse courte"]) {
      assert.ok(visible.includes(shell) && text(before).includes(shell), `${path} : ${shell}`);
    }
    assert.doesNotMatch(html, /seo-preview/, path);
  }
});

test("application : le vrai Chrono sur ordinateur et téléphone, puis une vraie capture par élément de l'encadré", () => {
  const env = makeEnv();
  const { SEO_LANDING_PAGES } = env.load("lib/seoLandingPages");
  const { SHOTS } = env.load("lib/siteShots.cjs");
  const page = SEO_LANDING_PAGES["/application-etudiant"];
  const html = render(env, env.load("pages/application-etudiant").default);
  const imgs = imgsOf(html);
  assert.deepEqual(imgs.map((i) => i.src), [
    "/site-web/v2/fr/chrono-desktop-1600.webp",
    "/site-web/v2/fr/chrono-mobile-900.webp",
    "/site-web/v2/fr/guide-app-focus-900.webp",
    "/site-web/v2/fr/guide-planning-month-1200.webp",
    "/site-web/v2/fr/guide-stats-overview-1200.webp",
    "/site-web/v2/fr/guide-app-spaces-900.webp",
  ]);
  // Seul l'écran de l'ordinateur, en haut, est chargé tout de suite.
  assert.deepEqual(imgs.map((i) => i.eager), [true, false, false, false, false, false]);
  const shots = page.featurePanel.shots;
  assert.deepEqual(imgs.map((i) => i.alt), [page.productShot.alt, page.productShot.phoneAlt, ...shots.map((s) => s.alt)].map(typeset));
  assert.match(html, /class="[^"]*layoutDevices/);
  // Sous 1024 px, les écrans du téléphone, un par élément.
  const sources = [...html.matchAll(/<source media="([^"]+)" srcSet="([^ ]+) 600w/g)].map((m) => [m[1], m[2]]);
  assert.deepEqual(sources, plain(shots.map((s) => ["(max-width: 1023px)", `/site-web/v2/fr/${s.mobile}-600.webp`])));
  // L'encadré devient la galerie, après les sections : chaque élément sous sa capture, dans l'ordre.
  assert.doesNotMatch(html, /<aside/);
  assert.deepEqual(tags(html, "figcaption"), plain(page.featurePanel.items).map(norm));
  assert.ok(html.indexOf(page.sections[2].title) < html.indexOf('id="guide-panel-title"'));
  assert.match(html, /<section class="container gallery" aria-labelledby="guide-panel-title">/);
  assert.match(html, /class="container body spread"/);
  // Les cinq critères : une liste à filets.
  const ul = html.match(/<ul role="list" class="bullets">([\s\S]*?)<\/ul>/);
  assert.deepEqual(tags(ul[1], "li"), plain(page.sections[0].bullets).map(norm));
  // Deux voisines d'une rangée ont le même rapport, à 7/5 près (même hauteur à toute largeur).
  const ratio = (name) => SHOTS[name].crop[2] / SHOTS[name].crop[3];
  assert.ok(Math.abs(ratio("guide-planning-month") / ratio("guide-app-focus") - 1.4) < 0.001);
  assert.ok(Math.abs(ratio("guide-stats-overview") / ratio("guide-app-spaces") - 1.4) < 0.001);
  const phones = shots.map((s) => ratio(s.mobile));
  assert.ok(phones.every((r) => r === phones[0]), "écrans du téléphone au même format");
  for (const name of [page.productShot.name, page.productShot.phone, ...shots.flatMap((s) => [s.name, s.mobile])]) {
    for (const lang of ["fr", "en"]) for (const width of SHOTS[name].widths) {
      assert.ok(existsSync(join(ROOT, "public/site-web/v2", lang, `${name}-${width}.webp`)), `${lang}/${name}-${width}`);
    }
  }
});

test("blocus : un article — définition à côté de l'introduction, date et auteur, étapes, journée sur un fil, sources en note", () => {
  const env = makeEnv();
  const { SEO_LANDING_PAGES } = env.load("lib/seoLandingPages");
  const page = SEO_LANDING_PAGES["/blocus-belgique"];
  const html = render(env, env.load("pages/blocus-belgique").default);
  assert.match(html, /class="[^"]*layoutArticle/);
  // Date et auteur juste sous l'introduction, comme dans le JSON-LD.
  assert.ok(html.indexOf(`<p class="byline">${page.byline}</p>`) > html.indexOf(typeset(page.lead).replace(/'/g, "&#x27;")));
  // Une seule capture, dans la dernière section : le vrai Planning (téléphone à part).
  const imgs = imgsOf(html);
  assert.deepEqual(imgs.map((i) => [i.src, i.eager]), [["/site-web/v2/fr/guide-planning-month-1200.webp", false]]);
  assert.equal(imgs[0].alt, typeset(page.sections[6].figure.alt));
  assert.match(html, /<source media="\(max-width: 639px\)" srcSet="\/site-web\/v2\/fr\/guide-app-planning-mobile-600\.webp 600w/);
  assert.ok(html.indexOf(page.sections[6].title) < html.indexOf("guide-planning-month-1200"));
  // Préparer son planning : des étapes numérotées.
  const ol = html.match(/<ol[^>]*>([\s\S]*?)<\/ol>/);
  assert.deepEqual(tags(ol[1], "li"), plain(page.sections[2].bullets).map(norm));
  assert.equal((html.match(/<ol[\s>]/g) || []).length, 1);
  // La journée : les moments sur un fil, l'étiquette en gras, le texte inchangé.
  const day = html.match(/<ul role="list" class="timeline">([\s\S]*?)<\/ul>/);
  assert.deepEqual(tags(day[1], "li"), plain(page.sections[3].bullets).map(norm));
  assert.ok(day[1].includes("<strong class=\"momentLabel\">Le matin :</strong> la matière"));
  // Trois sessions : un paragraphe chacune, le mois en tête.
  const periods = [...html.matchAll(/<p class="period">([\s\S]*?)<\/p>/g)].map((m) => m[1]);
  assert.equal(periods.length, 3);
  assert.deepEqual(periods.map((p) => norm(text(p))), plain(page.sections[5].body).map(norm));
  assert.deepEqual(periods.map((p) => p.match(/<strong class="periodLabel display">([^<]+)<\/strong>/)[1]), ["Janvier :", "Juin :", "Août-septembre :"]);
  // Les fonctions de l'app pendant le blocus : nommées, à filets.
  const terms = html.match(/<ul role="list" class="terms">([\s\S]*?)<\/ul>/);
  assert.deepEqual(tags(terms[1], "li"), plain(page.sections[6].bullets).map(norm));
  // L'encadré reste à côté de l'article.
  assert.match(html, /<aside class="aside" aria-labelledby="guide-panel-title">/);
  // Les sources après l'appel final, dans l'ordre, ouvertes dans un nouvel onglet.
  assert.ok(html.indexOf('id="guide-final-title"') < html.indexOf('id="guide-sources-title"'));
  assert.match(html, /<h2 id="guide-sources-title" class="sourcesTitle">Sources utiles<\/h2>/);
  const sources = [...html.matchAll(/<a href="(https:[^"]+)" target="_blank" rel="noopener noreferrer" class="sourceLink">/g)].map((m) => m[1]);
  assert.deepEqual(sources, plain(page.sources.map((s) => s.href)));
  assert.match(html, /class="container finalWrap finalBeforeSources"/);
});

test("application et blocus : meta, canonical et JSON-LD inchangés, FAQ visible = FAQ du JSON-LD", () => {
  const env = makeEnv();
  const { getSeoForPath, structuredDataForPath } = env.load("lib/seo");
  const { SEO_LANDING_PAGES } = env.load("lib/seoLandingPages");
  for (const [path, guide] of Object.entries(LAST)) {
    const page = SEO_LANDING_PAGES[path];
    const seo = getSeoForPath(path);
    assert.equal(seo.title, guide.title);
    assert.equal(seo.canonicalUrl, `https://www.blocus-tracker.com${path}`);
    assert.match(seo.robots, /^index, follow/);
    const nodes = JSON.parse(JSON.stringify(structuredDataForPath(path)));
    assert.deepEqual(nodes.map((n) => n["@type"]), ["Organization", "WebSite", "WebPage", "Article", "FAQPage", "BreadcrumbList"]);
    const article = nodes.find((n) => n["@type"] === "Article");
    assert.equal(article.headline, page.h1);
    if (page.dateModified) assert.equal(article.dateModified, page.dateModified);
    assert.ok(!/guide-|chrono-desktop|chrono-mobile/.test(JSON.stringify(nodes)), `${path} : aucune capture dans le JSON-LD`);
    const faq = nodes.find((n) => n["@type"] === "FAQPage");
    assert.deepEqual(faq.mainEntity.map((q) => [q.name, q.acceptedAnswer.text]), plain(page.faq.map((q) => [q.q, q.a])));
    const visible = text(render(env, env.load(guide.file).default));
    for (const q of faq.mainEntity) assert.ok(visible.includes(norm(q.name)) && visible.includes(norm(q.acceptedAnswer.text)), q.name);
  }
});

test("application et blocus : anglais sur choix manuel, captures, étiquettes et sources anglaises", () => {
  for (const path of Object.keys(LAST)) {
    const env = makeEnv({ deviceLanguage: "fr-BE", langPref: "en" });
    const { SEO_LANDING_PAGES_EN } = env.load("lib/seoLandingPagesEn");
    const { I18nProvider } = env.load("contexts/I18nContext");
    const Page = env.load(LAST[path].file).default;
    let renderer;
    act(() => { renderer = create(h(I18nProvider, null, h(Page))); });
    const root = renderer.root;
    const enPage = SEO_LANDING_PAGES_EN[path];
    assert.equal(flat(root.findByType("h1").props.children), enPage.h1, path);
    const all = flat(renderer.toJSON());
    for (const chunk of [enPage.shortAnswer, ...enPage.sections.flatMap((s) => s.bullets || []), enPage.featurePanel.title, "Short answer", "Start the timer"]) {
      assert.ok(all.includes(chunk), `${path} : ${chunk}`);
    }
    const imgs = root.findAllByType("img");
    if (path === "/application-etudiant") {
      assert.deepEqual(imgs.map((i) => i.props.alt), plain([enPage.productShot.alt, enPage.productShot.phoneAlt, ...enPage.featurePanel.shots.map((s) => s.alt)]));
      assert.ok(imgs.every((i) => i.props.src.startsWith("/site-web/v2/en/")), path);
      assert.deepEqual(root.findAllByType("figcaption").map((f) => flat(f.props.children)), plain(enPage.featurePanel.items));
    } else {
      assert.deepEqual(imgs.map((i) => [i.props.alt, i.props.src]), [[enPage.sections[6].figure.alt, "/site-web/v2/en/guide-planning-month-1200.webp"]]);
      assert.ok(all.includes(enPage.byline), "byline");
      assert.equal(flat(root.find((n) => n.props.id === "guide-sources-title").props.children), "Useful sources");
      assert.deepEqual(root.findAll((n) => n.type === "a" && n.props.target === "_blank").map((a) => flat(a.props.children)), plain(enPage.sources.map((s) => s.label)));
      // Les étiquettes anglaises (« Morning: ») et la forme des listes viennent de la version française.
      const labels = root.findAll((n) => n.type === "strong").map((n) => flat(n.props.children));
      assert.deepEqual(labels.slice(0, 5), ["Morning:", "Lunch:", "Afternoon:", "Late afternoon:", "Evening:"]);
      assert.equal(root.findAllByType("ol").length, 1);
    }
    act(() => renderer.unmount());
  }
});
