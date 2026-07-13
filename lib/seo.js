import { SEO_LANDING_PAGES, SEO_LANDING_PATHS } from "./seoLandingPages";

const PRODUCTION_SITE_URL = "https://www.blocus-tracker.com";
const configuredSiteUrl = normalizeSiteUrl(process.env.NEXT_PUBLIC_SITE_URL || PRODUCTION_SITE_URL);

export const SITE_URL =
  process.env.VERCEL_ENV === "production" && /^https?:\/\/localhost(?::\d+)?$/i.test(configuredSiteUrl)
    ? PRODUCTION_SITE_URL
    : configuredSiteUrl;

export const SITE_NAME = "Blocus Tracker";
export const SITE_AUTHOR = "Mathias Dock";
export const DEFAULT_LOCALE = "fr_BE";
export const BRAND_COLOR = "#14B885";
export const SEO_IMAGE_PATH = "/seo-preview.png";

// Source unique pour la FAQ visible de l'accueil et son JSON-LD. Garder les
// deux synchronises evite de promettre aux moteurs un contenu absent de la page.
export const HOME_FAQ = [
  {
    q: "Qu'est-ce que Blocus Tracker, concrètement ?",
    a: "Blocus Tracker est une application d'étude qui réunit un chrono, un mode Focus, un planning de révision, des objectifs, des statistiques, un historique et des espaces sociaux. L'idée est de passer de « je dois étudier » à un plan clair, puis de voir ce que tu as réellement accompli.",
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
    a: "Avec un compte, tu peux ajouter des amis, suivre leur activité d'étude, échanger en privé, créer des groupes et rejoindre la communauté de ton école pour poser des questions, partager des ressources et suivre les examens utiles.",
  },
  {
    q: "Est-ce que Blocus Tracker fonctionne sur téléphone ?",
    a: "Oui. Le site est responsive et peut être installé sur l'écran d'accueil comme une application web. Le chrono, le mode Focus, le planning, les statistiques et les fonctions sociales restent accessibles sur mobile.",
  },
  {
    q: "Est-ce adapté au blocus en Belgique et aux périodes d'examens ?",
    a: "Oui. Blocus Tracker a été pensé autour du blocus et des examens, avec des objectifs quotidiens, des échéances J-X, des sessions mesurées et des communautés d'écoles. La méthode fonctionne aussi pour les étudiants en France, en Suisse et ailleurs.",
  },
  {
    q: "Mes données d'étude sont-elles publiques ?",
    a: "Non par défaut. Tes sessions, ton planning détaillé et tes statistiques personnelles restent liés à ton compte. Les fonctions de partage sont séparées et servent uniquement aux contenus ou informations que tu choisis de rendre visibles.",
  },
];

export const SEO_INDEXABLE_ROUTES = [
  {
    path: "/",
    changefreq: "weekly",
    priority: "1.0",
  },
  ...SEO_LANDING_PATHS.map((path) => ({
    path,
    changefreq: SEO_LANDING_PAGES[path].changefreq,
    priority: SEO_LANDING_PAGES[path].priority,
  })),
  {
    path: "/legal",
    changefreq: "monthly",
    priority: "0.3",
  },
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
    title: "Communautés étudiantes | Blocus Tracker",
    description: "Rejoins les discussions, questions et ressources de ta communauté étudiante dans Blocus Tracker.",
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
    description: "Cockpit d'administration privé de Blocus Tracker.",
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
  const page = PAGE_SEO[path] || {
    title: `${SITE_NAME} | Application d'étude`,
    description:
      "Blocus Tracker aide les étudiants à organiser, mesurer et partager leurs sessions d'étude.",
    index: false,
  };
  const canonicalPath = page.canonicalPath || path;
  const indexable = page.index === true;
  return {
    ...page,
    path,
    canonicalPath,
    canonicalUrl: absoluteUrl(canonicalPath),
    image: page.image || seoImageUrl(),
    robots: page.robots || (indexable ? INDEX_ROBOTS : NOINDEX_ROBOTS),
    locale: page.locale || DEFAULT_LOCALE,
    type: page.type || "website",
  };
}

export function breadcrumbForPath(pathname = "/") {
  const seo = getSeoForPath(pathname);
  const items = [
    {
      "@type": "ListItem",
      position: 1,
      name: "Accueil",
      item: absoluteUrl("/"),
    },
  ];

  if (seo.canonicalPath !== "/") {
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
    {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: HOME_FAQ.map((item) => ({
        "@type": "Question",
        name: item.q,
        acceptedAnswer: {
          "@type": "Answer",
          text: item.a,
        },
      })),
    },
  ];
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
    datePublished: "2026-07-06",
    dateModified: "2026-07-06",
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

  const faq = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: page.faq.map((item) => ({
      "@type": "Question",
      name: item.q,
      acceptedAnswer: {
        "@type": "Answer",
        text: item.a,
      },
    })),
  };

  return [article, faq];
}

export function structuredDataForPath(pathname = "/") {
  const seo = getSeoForPath(pathname);
  if (seo.index !== true) return [];
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
    breadcrumbForPath(seo.canonicalPath),
  ];
}
