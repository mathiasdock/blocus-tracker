import { SEO_LANDING_PAGES, SEO_LANDING_PATHS } from "./seoLandingPages";
import { brand } from "./colorTokens.cjs";
import { COOKIE_POLICY_VERSION, PRIVACY_VERSION, TERMS_VERSION } from "./legalVersions";
import { PUBLIC_PAGES, equivalentPath, pageAlternates, publicHref, publicPageLang } from "./publicRoutes.mjs";

const PRODUCTION_SITE_URL = "https://www.blocus-tracker.com";
const configuredSiteUrl = normalizeSiteUrl(process.env.NEXT_PUBLIC_SITE_URL || PRODUCTION_SITE_URL);

export const SITE_URL =
  process.env.VERCEL_ENV === "production" && /^https?:\/\/localhost(?::\d+)?$/i.test(configuredSiteUrl)
    ? PRODUCTION_SITE_URL
    : configuredSiteUrl;

export const SITE_NAME = "Blocus Tracker";
export const SITE_AUTHOR = "Mathias Dock";
export const DEFAULT_LOCALE = "fr_BE";
export const BRAND_COLOR = brand.primary;
export const SEO_IMAGE_PATH = "/seo-preview.png?v=forest-20260927";

// Source unique pour les FAQ visibles et leur JSON-LD. Garder les deux
// synchronises evite de promettre aux moteurs un contenu absent de la page.
// FAQ : la page /faq. HOME_FAQ : les trois questions de l'accueil.
export const FAQ = [
  {
    q: "Qu'est-ce que Blocus Tracker, concrètement ?",
    a: "Blocus Tracker est une application d'étude qui réunit un chrono, un mode Focus, un planning de révision, des objectifs, des statistiques, un historique, des amis et des espaces de cours. L'idée est de passer de « je dois étudier » à un plan clair, puis de voir ce que tu as réellement accompli.",
  },
  {
    q: "Blocus Tracker est-il gratuit ?",
    a: "Oui. Le chrono est testable gratuitement, sans carte bancaire. Tu peux ensuite créer un compte gratuit pour synchroniser tes sessions et conserver ton planning, tes statistiques, tes badges et ta progression.",
  },
  {
    q: "Faut-il un compte pour essayer l'application ?",
    a: "Non. Le mode découverte permet de lancer le chrono immédiatement. Les autres espaces restent visibles pour comprendre leur rôle, mais un compte est nécessaire pour enregistrer durablement tes données et utiliser les fonctions sociales.",
  },
  {
    q: "Quelle est la différence avec un simple minuteur Pomodoro ?",
    a: "Un minuteur mesure une session. Blocus Tracker relie cette session à une matière, un objectif et un planning, puis la transforme en statistiques, en historique, en XP et en progression. Tu peux utiliser le Pomodoro ou travailler en session libre.",
  },
  {
    q: "Que peut-on organiser dans le planning de révision ?",
    a: "Tu peux planifier des objectifs par jour, ajouter tes examens avec un compte à rebours, reporter une tâche, lancer le chrono depuis un objectif et exporter ton calendrier vers Apple Calendar, Google Calendar ou Outlook.",
  },
  {
    q: "Comment fonctionnent les fonctions sociales ?",
    a: "Avec un compte, tu peux ajouter des amis, suivre les sessions qu'ils choisissent de partager, échanger en privé et créer des groupes d'étude. Les espaces de cours te relient aux étudiants de ton établissement qui suivent les mêmes cours, pour poser une question, partager un fichier ou une date d'examen.",
  },
  {
    q: "Est-ce que Blocus Tracker fonctionne sur téléphone ?",
    a: "Oui. Le site est responsive et peut être installé sur l'écran d'accueil comme une application web. Le chrono, le mode Focus, le planning, les statistiques et les fonctions sociales restent accessibles sur mobile.",
  },
  {
    q: "Est-ce adapté au blocus en Belgique et aux périodes d'examens ?",
    a: "Oui. Blocus Tracker a été pensé autour du blocus et des examens, avec des objectifs quotidiens, des échéances J-X, des sessions mesurées et des espaces de cours par établissement. La méthode fonctionne aussi pour les étudiants en France, en Suisse et ailleurs.",
  },
  {
    q: "Mes données d'étude sont-elles publiques ?",
    a: "Non par défaut. Tes sessions, ton planning détaillé et tes statistiques personnelles restent liés à ton compte. Les fonctions de partage sont séparées et servent uniquement aux contenus ou informations que tu choisis de rendre visibles.",
  },
];

// Traductions anglaises, affichées sur les adresses /en (lib/publicRoutes.mjs)
// avec leur JSON-LD anglais : HOME_FAQ_EN sur /en, FAQ_EN sur /en/faq. Une
// adresse française montre toujours le français.
export const FAQ_EN = [
  {
    q: "What is Blocus Tracker, exactly?",
    a: "Blocus Tracker is a study app that brings together a timer, a Focus mode, a revision planner, goals, stats, history, friends and course spaces. The idea is to go from “I have to study” to a clear plan, then see what you actually got done.",
  },
  {
    q: "Is Blocus Tracker free?",
    a: "Yes. The timer is free to try, no credit card. You can then create a free account to sync your sessions and keep your planning, stats, badges and progress.",
  },
  {
    q: "Do I need an account to try the app?",
    a: "No. Discovery mode lets you start the timer right away. The other spaces stay visible so you can understand their role, but an account is needed to save your data long-term and use the social features.",
  },
  {
    q: "What's the difference with a plain Pomodoro timer?",
    a: "A timer measures a session. Blocus Tracker links that session to a subject, a goal and a plan, then turns it into stats, history, XP and progress. You can use Pomodoro or work in an open session.",
  },
  {
    q: "What can you organize in the revision planner?",
    a: "You can plan goals per day, add your exams with a countdown, postpone a task, start the timer from a goal and export your calendar to Apple Calendar, Google Calendar or Outlook.",
  },
  {
    q: "How do the social features work?",
    a: "With an account, you can add friends, follow the sessions they choose to share, chat privately and create study groups. Course spaces connect you with the students at your school who take the same courses, to ask a question, share a file or an exam date.",
  },
  {
    q: "Does Blocus Tracker work on a phone?",
    a: "Yes. The site is responsive and can be installed on your home screen like a web app. The timer, Focus mode, planning, stats and social features all stay available on mobile.",
  },
  {
    q: "Is it suited to exam season in Belgium and beyond?",
    a: "Yes. Blocus Tracker was built around intensive study periods and exams, with daily goals, D-X deadlines, measured sessions and course spaces for each school. The method also works for students in France, Switzerland and elsewhere.",
  },
  {
    q: "Is my study data public?",
    a: "Not by default. Your sessions, detailed planning and personal stats stay tied to your account. The sharing features are separate and only cover the content or info you choose to make visible.",
  },
];

export const HOME_FAQ = [
  {
    q: "C'est vraiment gratuit ?",
    a: "Oui. Blocus Tracker est gratuit, sans carte bancaire. Tu peux tester le chrono sans compte, puis créer un compte gratuit pour garder tes sessions et ta progression.",
  },
  {
    q: "Faut-il créer un compte ?",
    a: "Pas pour essayer : le chrono se lance sans compte. Le compte sert à garder ton planning, tes statistiques et ta série, et à retrouver tes amis.",
  },
  {
    q: "Ça marche sur téléphone ?",
    a: "Oui. Blocus Tracker s'utilise dans le navigateur et s'installe sur l'écran d'accueil comme une application, sans passer par un store.",
  },
];

export const HOME_FAQ_EN = [
  {
    q: "Is it really free?",
    a: "Yes. Blocus Tracker is free, no credit card. You can try the timer without an account, then create a free account to keep your sessions and your progress.",
  },
  {
    q: "Do I need an account?",
    a: "Not to try it: the timer starts without an account. An account keeps your planning, your stats and your streak, and connects you with your friends.",
  },
  {
    q: "Does it work on a phone?",
    a: "Yes. Blocus Tracker runs in the browser and installs on your home screen like an app, no app store needed.",
  },
];

const SITEMAP_RHYTHM = {
  "/": { changefreq: "weekly", priority: "1.0" },
  "/fonctionnalites": { changefreq: "monthly", priority: "0.8" },
  "/guides": { changefreq: "monthly", priority: "0.8" },
  "/faq": { changefreq: "monthly", priority: "0.7" },
  "/legal": { changefreq: "monthly", priority: "0.3" },
};

// Date réelle de la dernière modification de fond d'une page (texte,
// captures, documents) — jamais la date du jour. Une refonte qui garde le
// contenu ne la change pas. Un guide reprend la date qu'il déclare lui-même
// (dateModified, affichée et dans son JSON-LD) ; /legal suit la version de ses
// documents ; une traduction partage la date de sa page.
const GUIDES_PUBLISHED = "2026-07-06";
const PAGE_CONTENT_DATES = {
  "/": "2026-09-29",
  "/fonctionnalites": "2026-10-14",
  "/guides": "2026-10-14",
  "/faq": "2026-09-27",
};

function contentDateFor(frPath) {
  const landing = SEO_LANDING_PAGES[frPath];
  if (landing) return landing.dateModified || GUIDES_PUBLISHED;
  if (frPath === "/legal") return [TERMS_VERSION, PRIVACY_VERSION, COOKIE_POLICY_VERSION].sort().pop();
  return PAGE_CONTENT_DATES[frPath];
}

function sitemapEntry(path, frPath) {
  const landing = SEO_LANDING_PAGES[frPath];
  const rhythm = landing ? { changefreq: landing.changefreq, priority: landing.priority } : SITEMAP_RHYTHM[frPath];
  return { path, ...rhythm, lastmod: contentDateFor(frPath) };
}

// Les pages françaises dans l'ordre du registre, puis les anglaises qui
// existent (lib/publicRoutes.mjs).
export const SEO_INDEXABLE_ROUTES = [
  ...PUBLIC_PAGES.map((page) => sitemapEntry(page.fr, page.fr)),
  ...PUBLIC_PAGES.filter((page) => page.en).map((page) => sitemapEntry(page.en, page.fr)),
];

const INDEX_ROBOTS = "index, follow, max-snippet:-1, max-image-preview:large, max-video-preview:-1";
const NOINDEX_ROBOTS = "noindex, nofollow, noarchive";

const LANDING_PAGE_SEO = Object.fromEntries(
  SEO_LANDING_PATHS.map((path) => [
    path,
    {
      title: SEO_LANDING_PAGES[path].title,
      description: SEO_LANDING_PAGES[path].description,
      type: "article",
      index: true,
    },
  ])
);

export const PAGE_SEO = {
  "/": {
    title: "Blocus Tracker | Chrono, planning et stats pour étudiants",
    description:
      "Blocus Tracker aide les étudiants à chronométrer leurs sessions, organiser leurs révisions, suivre leurs stats et rester motivés avec leurs amis.",
    index: true,
  },
  // Pages anglaises (lib/publicRoutes.mjs) : leur langue vient de l'adresse,
  // leur locale la déclare aux réseaux sociaux.
  "/en": {
    title: "Blocus Tracker | Study timer, planner and stats for students",
    description:
      "Blocus Tracker helps students time their study sessions, organize their revision, track their stats and stay motivated with their friends.",
    index: true,
    locale: "en_US",
  },
  "/en/features": {
    title: "Features: study timer, planner, stats | Blocus Tracker",
    description:
      "Timer and Focus mode, exam planner, stats, XP and badges, friends and course spaces: everything Blocus Tracker does for your revision.",
    index: true,
    locale: "en_US",
  },
  "/en/guides": {
    title: "Study guides to revise better | Blocus Tracker",
    description:
      "The Pomodoro method, revision planning, goals, study stats and the blocus: practical guides to organize your revision.",
    index: true,
    locale: "en_US",
  },
  "/en/faq": {
    title: "Frequently asked questions | Blocus Tracker",
    description:
      "Price, account, planning, social features, phone and personal data: answers to frequently asked questions about Blocus Tracker.",
    index: true,
    locale: "en_US",
  },
  "/en/legal": {
    title: "Privacy, terms and legal notice | Blocus Tracker",
    description:
      "Read Blocus Tracker's privacy policy, terms of service, local storage information and legal notice.",
    index: true,
    locale: "en_US",
  },
  "/fonctionnalites": {
    title: "Fonctionnalités : chrono, planning, stats | Blocus Tracker",
    description:
      "Chrono et mode Focus, planning d'examens, statistiques, XP et badges, amis et espaces de cours : tout ce que fait Blocus Tracker pour tes révisions.",
    index: true,
  },
  "/guides": {
    title: "Guides pour mieux réviser | Blocus Tracker",
    description:
      "Méthode Pomodoro, planning de révision, objectifs, statistiques d'étude et blocus : des guides concrets pour organiser tes révisions.",
    index: true,
  },
  "/faq": {
    title: "Questions fréquentes | Blocus Tracker",
    description:
      "Prix, compte, planning, fonctions sociales, téléphone et données personnelles : les réponses aux questions fréquentes sur Blocus Tracker.",
    index: true,
  },
  ...LANDING_PAGE_SEO,
  "/dashboard": {
    title: "Chrono d'étude gratuit | Blocus Tracker",
    description:
      "Teste le chrono d'étude Blocus Tracker en mode découverte, puis crée un compte pour sauvegarder tes sessions, ton XP et ta progression.",
    canonicalPath: "/",
    index: false,
  },
  "/legal": {
    title: "Confidentialité, CGU et mentions légales | Blocus Tracker",
    description:
      "Consulte la politique de confidentialité, les conditions d'utilisation, les informations de stockage local et les mentions légales de Blocus Tracker.",
    index: true,
  },
  "/login": {
    title: "Connexion | Blocus Tracker",
    description: "Connecte-toi à ton compte Blocus Tracker pour retrouver ton chrono, tes stats et tes données d'étude.",
    index: false,
  },
  "/signup": {
    title: "Créer un compte étudiant | Blocus Tracker",
    description: "Crée ton compte Blocus Tracker pour sauvegarder tes sessions d'étude et suivre ta progression.",
    index: false,
  },
  "/forgot-password": {
    title: "Mot de passe oublié | Blocus Tracker",
    description: "Demande un lien de réinitialisation sécurisé pour ton compte Blocus Tracker.",
    index: false,
  },
  "/reset-password": {
    title: "Nouveau mot de passe | Blocus Tracker",
    description: "Choisis un nouveau mot de passe pour sécuriser ton compte Blocus Tracker.",
    index: false,
  },
  "/onboarding": {
    title: "Premiers réglages | Blocus Tracker",
    description: "Configure tes matières et ton profil d'étude dans Blocus Tracker.",
    index: false,
  },
  "/planning": {
    title: "Planning de révision | Blocus Tracker",
    description: "Organise tes objectifs, examens et blocs d'étude dans ton planning Blocus Tracker.",
    index: false,
  },
  "/stats": {
    title: "Statistiques d'étude | Blocus Tracker",
    description: "Analyse ton temps d'étude, tes séries, tes objectifs et tes classements dans Blocus Tracker.",
    index: false,
  },
  "/historique": {
    title: "Historique des sessions | Blocus Tracker",
    description: "Retrouve l'historique privé de tes sessions d'étude enregistrées dans Blocus Tracker.",
    index: false,
  },
  "/feed": {
    title: "Activité sociale étudiante | Blocus Tracker",
    description: "Suis l'activité d'étude de tes amis et partage tes progrès dans Blocus Tracker.",
    index: false,
  },
  "/messages": {
    title: "Social — Amis, messages et groupes | Blocus Tracker",
    description: "Amis, messages et groupes d'étude : retrouve toute ta vie sociale étudiante au même endroit sur Blocus Tracker.",
    index: false,
  },
  "/communautes": {
    title: "Communautés · espaces de cours | Blocus Tracker",
    description: "Retrouve les étudiants de ton établissement qui suivent les mêmes cours que toi et échange avec eux dans Blocus Tracker.",
    index: false,
  },
  "/friends": {
    title: "Amis | Blocus Tracker",
    description: "Gère tes amis et relations d'étude dans Blocus Tracker.",
    index: false,
  },
  "/profile": {
    title: "Profil étudiant | Blocus Tracker",
    description: "Gère ton profil, tes préférences, tes badges, ton XP et tes données de compte Blocus Tracker.",
    index: false,
  },
  "/feedback": {
    title: "Suggestions produit | Blocus Tracker",
    description: "Envoie une suggestion ou un signalement à l'équipe Blocus Tracker.",
    index: false,
  },
  "/admin": {
    title: "Administration | Blocus Tracker",
    description: "Outil d'administration privé de Blocus Tracker.",
    index: false,
  },
  "/404": {
    title: "Page introuvable | Blocus Tracker",
    description: "La page demandée n'existe pas ou n'est plus disponible sur Blocus Tracker.",
    index: false,
  },
};

function normalizeSiteUrl(value) {
  const raw = String(value || PRODUCTION_SITE_URL).trim();
  const withProtocol = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    const url = new URL(withProtocol);
    return url.origin.replace(/\/+$/, "");
  } catch {
    return PRODUCTION_SITE_URL;
  }
}

export function absoluteUrl(path = "/") {
  if (/^https?:\/\//i.test(path)) return path;
  const cleanPath = path.startsWith("/") ? path : `/${path}`;
  return `${SITE_URL}${cleanPath}`;
}

export function seoImageUrl() {
  return absoluteUrl(SEO_IMAGE_PATH);
}

export function getSeoForPath(pathname = "/") {
  const path = pathname.split("?")[0] || "/";
  // Toutes les pages /admin/* partagent la même fiche (privée, non indexée).
  const page = PAGE_SEO[path] || (path.startsWith("/admin/") ? PAGE_SEO["/admin"] : null) || {
    title: `${SITE_NAME} | Application d'étude`,
    description:
      "Blocus Tracker aide les étudiants à organiser, mesurer et partager leurs sessions d'étude.",
    index: false,
  };
  const canonicalPath = page.canonicalPath || path;
  const indexable = page.index === true;
  const english = publicPageLang(canonicalPath) === "en";
  return {
    ...page,
    path,
    canonicalPath,
    canonicalUrl: absoluteUrl(canonicalPath),
    image: page.image || seoImageUrl(),
    imageAlt: english ? IMAGE_ALT.en : IMAGE_ALT.fr,
    robots: page.robots || (indexable ? INDEX_ROBOTS : NOINDEX_ROBOTS),
    locale: page.locale || DEFAULT_LOCALE,
    type: page.type || "website",
    // hreflang : seulement quand les deux versions existent (lib/publicRoutes.mjs).
    alternates: indexable ? pageAlternates(canonicalPath) : null,
  };
}

const IMAGE_ALT = {
  fr: "Blocus Tracker, application d'étude pour étudiants",
  en: "Blocus Tracker, a study app for students",
};

// Langue du CONTENU d'une page indexable : celle de son adresse
// (lib/publicRoutes.mjs), jamais celle de l'appareil — titre, description,
// JSON-LD et texte restent ainsi dans la même langue. null pour les pages de
// l'app (non indexées) : elles suivent la langue de l'utilisateur.
export function contentLangForPath(pathname = "/") {
  return publicPageLang(pathname);
}

export function breadcrumbForPath(pathname = "/") {
  const seo = getSeoForPath(pathname);
  const english = publicPageLang(seo.canonicalPath) === "en";
  const items = [
    {
      "@type": "ListItem",
      position: 1,
      name: english ? "Home" : "Accueil",
      item: absoluteUrl(english ? PUBLIC_PAGES[0].en : "/"),
    },
  ];

  if (seo.canonicalPath !== "/" && seo.canonicalPath !== PUBLIC_PAGES[0].en) {
    items.push({
      "@type": "ListItem",
      position: 2,
      name: seo.title.replace(` | ${SITE_NAME}`, ""),
      item: seo.canonicalUrl,
    });
  }

  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items,
  };
}

export function homeStructuredData() {
  return [
    {
      "@context": "https://schema.org",
      "@type": "Organization",
      "@id": absoluteUrl("/#organization"),
      name: SITE_NAME,
      url: absoluteUrl("/"),
      logo: absoluteUrl("/icon-512x512.png"),
      founder: {
        "@type": "Person",
        name: SITE_AUTHOR,
      },
    },
    {
      "@context": "https://schema.org",
      "@type": "WebSite",
      "@id": absoluteUrl("/#website"),
      name: SITE_NAME,
      url: absoluteUrl("/"),
      inLanguage: "fr-BE",
      publisher: {
        "@id": absoluteUrl("/#organization"),
      },
    },
    {
      "@context": "https://schema.org",
      "@type": "SoftwareApplication",
      "@id": absoluteUrl("/#software"),
      name: SITE_NAME,
      applicationCategory: "EducationalApplication",
      operatingSystem: "Web",
      url: absoluteUrl("/"),
      image: seoImageUrl(),
      description:
        "Application web pour chronométrer ses sessions d'étude, organiser ses révisions, suivre ses statistiques et rester motivé avec d'autres étudiants.",
      creator: {
        "@type": "Person",
        name: SITE_AUTHOR,
      },
      offers: {
        "@type": "Offer",
        price: "0",
        priceCurrency: "EUR",
      },
    },
    faqPageNode(HOME_FAQ),
  ];
}

function faqPageNode(items) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map((item) => ({
      "@type": "Question",
      name: item.q,
      acceptedAnswer: {
        "@type": "Answer",
        text: item.a,
      },
    })),
  };
}

function guidesListNode(seo) {
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    "@id": `${seo.canonicalUrl}#guides`,
    name: "Guides Blocus Tracker",
    itemListElement: SEO_LANDING_PATHS.map((path, index) => ({
      "@type": "ListItem",
      position: index + 1,
      url: absoluteUrl(path),
      name: SEO_LANDING_PAGES[path].h1,
    })),
  };
}

// Titres anglais des guides, tels qu'affichés sur /en/guides (h1 de
// lib/seoLandingPagesEn.js — un test vérifie qu'ils restent identiques).
// Recopiés ici pour ne pas charger les textes anglais des guides avec le
// code commun de toutes les pages.
const GUIDE_TITLES_EN = {
  "/pomodoro": "Free Pomodoro timer for studying",
  "/planning-revision": "Build a revision plan that actually holds up",
  "/stats-etude": "The study stats that actually help",
  "/objectifs-etude": "Set study goals you can actually keep",
  "/application-etudiant": "An app to study with, not just one more app",
  "/blocus-belgique": "The student blocus in Belgium: how to prepare for it",
};

// La même liste sur /en/guides : titres anglais, et l'adresse de chaque guide
// telle que la page la donne (française tant qu'il n'est pas traduit).
function englishGuidesListNode(seo) {
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    "@id": `${seo.canonicalUrl}#guides`,
    name: "Blocus Tracker guides",
    itemListElement: SEO_LANDING_PATHS.map((path, index) => ({
      "@type": "ListItem",
      position: index + 1,
      url: absoluteUrl(publicHref(path, "en")),
      name: GUIDE_TITLES_EN[path],
    })),
  };
}

function landingStructuredData(page, seo) {
  const article = {
    "@context": "https://schema.org",
    "@type": "Article",
    "@id": `${seo.canonicalUrl}#article`,
    headline: page.h1,
    description: page.description,
    image: seo.image,
    inLanguage: "fr-BE",
    datePublished: GUIDES_PUBLISHED,
    // Une page révisée déclare sa date, affichée aussi sur la page (byline).
    dateModified: page.dateModified || GUIDES_PUBLISHED,
    author: {
      "@type": "Person",
      name: SITE_AUTHOR,
    },
    publisher: {
      "@id": absoluteUrl("/#organization"),
    },
    mainEntityOfPage: {
      "@id": `${seo.canonicalUrl}#webpage`,
    },
    about: page.eyebrow,
  };

  return [article, faqPageNode(page.faq)];
}

// Accueil anglais : la même application, décrite en anglais, avec les trois
// questions affichées sur la page. Identifiant propre, pour ne pas donner deux
// descriptions au nœud de l'accueil français.
function englishHomeNodes() {
  return [
    {
      "@context": "https://schema.org",
      "@type": "SoftwareApplication",
      "@id": absoluteUrl(`${PUBLIC_PAGES[0].en}#software`),
      name: SITE_NAME,
      applicationCategory: "EducationalApplication",
      operatingSystem: "Web",
      url: absoluteUrl(PUBLIC_PAGES[0].en),
      image: seoImageUrl(),
      inLanguage: "en",
      description:
        "Web app to time your study sessions, organize your revision, track your stats and stay motivated with other students.",
      creator: {
        "@type": "Person",
        name: SITE_AUTHOR,
      },
      offers: {
        "@type": "Offer",
        price: "0",
        priceCurrency: "EUR",
      },
    },
    faqPageNode(HOME_FAQ_EN),
  ];
}

// Une page anglaise : l'organisation (sans langue), sa page en anglais et son
// fil d'Ariane anglais. Le nœud WebSite, déclaré en français sur les pages
// françaises, n'est que référencé.
function englishStructuredData(seo) {
  const organization = homeStructuredData().find((node) => node["@type"] === "Organization");
  const webPage = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    "@id": `${seo.canonicalUrl}#webpage`,
    url: seo.canonicalUrl,
    name: seo.title,
    description: seo.description,
    inLanguage: "en",
    isPartOf: {
      "@id": absoluteUrl("/#website"),
    },
  };
  // Mêmes nœuds que la page française, en anglais : la FAQ affichée, la liste
  // des guides affichée.
  const frPath = equivalentPath(seo.canonicalPath, "fr");
  return [
    organization,
    ...(frPath === "/" ? englishHomeNodes() : []),
    webPage,
    ...(frPath === "/faq" ? [faqPageNode(FAQ_EN)] : []),
    ...(frPath === "/guides" ? [englishGuidesListNode(seo)] : []),
    breadcrumbForPath(seo.canonicalPath),
  ];
}

export function structuredDataForPath(pathname = "/") {
  const seo = getSeoForPath(pathname);
  if (seo.index !== true) return [];
  if (publicPageLang(seo.canonicalPath) === "en") return englishStructuredData(seo);
  const homeNodes = homeStructuredData();
  const siteNodes = homeNodes.filter((node) => node["@type"] === "Organization" || node["@type"] === "WebSite");
  const landingPage = SEO_LANDING_PAGES[seo.canonicalPath];

  const webPage = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    "@id": `${seo.canonicalUrl}#webpage`,
    url: seo.canonicalUrl,
    name: seo.title,
    description: seo.description,
    inLanguage: "fr-BE",
    isPartOf: {
      "@id": absoluteUrl("/#website"),
    },
  };

  return [
    ...(seo.canonicalPath === "/" ? homeNodes : siteNodes),
    webPage,
    ...(landingPage ? landingStructuredData(landingPage, seo) : []),
    ...(seo.canonicalPath === "/faq" ? [faqPageNode(FAQ)] : []),
    ...(seo.canonicalPath === "/guides" ? [guidesListNode(seo)] : []),
    breadcrumbForPath(seo.canonicalPath),
  ];
}
