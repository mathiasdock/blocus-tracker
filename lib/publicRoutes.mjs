// Pages publiques indexables, leurs versions linguistiques et le passage du
// site vers l'app — le registre unique des correspondances FR/EN.
//
// Sur une page publique, la langue est celle de l'ADRESSE : jamais celle de
// l'appareil, du compte ou d'un choix enregistré (contexts/I18nContext.js).
// Une adresse anglaise n'existe que si elle figure ici ; un test vérifie
// qu'elle a son fichier pages/en/… et inversement. Les adresses françaises ne
// changent jamais. L'ordre est celui du sitemap.
//
// Adresses anglaises validées, à ajouter ici quand leur page existe :
// /en/features, /en/guides, /en/faq, /en/pomodoro, /en/study-planner,
// /en/study-stats, /en/study-goals, /en/study-app, /en/blocus-belgium,
// /en/legal.
export const PUBLIC_PAGES = Object.freeze([
  Object.freeze({ fr: "/", en: "/en" }),
  Object.freeze({ fr: "/fonctionnalites" }),
  Object.freeze({ fr: "/guides" }),
  Object.freeze({ fr: "/faq" }),
  Object.freeze({ fr: "/pomodoro" }),
  Object.freeze({ fr: "/planning-revision" }),
  Object.freeze({ fr: "/stats-etude" }),
  Object.freeze({ fr: "/objectifs-etude" }),
  Object.freeze({ fr: "/application-etudiant" }),
  Object.freeze({ fr: "/blocus-belgique" }),
  Object.freeze({ fr: "/legal" }),
]);

const BY_PATH = new Map();
for (const page of PUBLIC_PAGES) {
  BY_PATH.set(page.fr, { lang: "fr", page });
  if (page.en) BY_PATH.set(page.en, { lang: "en", page });
}

// Toutes les adresses publiques indexables : les françaises, puis les anglaises.
export const PUBLIC_PAGE_PATHS = Object.freeze([
  ...PUBLIC_PAGES.map((page) => page.fr),
  ...PUBLIC_PAGES.filter((page) => page.en).map((page) => page.en),
]);

function pathOnly(value) {
  return String(value || "").split(/[?#]/)[0] || "/";
}

// "fr" ou "en" pour une page publique indexable, null pour tout le reste.
export function publicPageLang(pathname) {
  return BY_PATH.get(pathOnly(pathname))?.lang || null;
}

// Les deux versions d'une page — seulement quand les deux existent vraiment.
export function pageAlternates(pathname) {
  const page = BY_PATH.get(pathOnly(pathname))?.page;
  return page?.en ? { fr: page.fr, en: page.en } : null;
}

// La même page dans `lang`, ou null si cette version n'existe pas.
export function equivalentPath(pathname, lang) {
  const page = BY_PATH.get(pathOnly(pathname))?.page;
  return page?.[lang] || null;
}

// ── Passage du site vers l'app ───────────────────────────────────────────
// Pages par lesquelles on entre dans l'app : connexion, inscription, mot de
// passe, retour de Google et premiers réglages.
export const ENTRY_PATHS = Object.freeze([
  "/login",
  "/signup",
  "/forgot-password",
  "/reset-password",
  "/auth/google-callback",
  "/onboarding",
]);

export function isEntryPath(pathname) {
  return ENTRY_PATHS.includes(pathOnly(pathname));
}

// Une page anglaise passe sa langue à la connexion et à l'inscription
// (/signup?lang=en). Une page française ne passe rien : celui qui s'inscrit
// depuis une page française garde la langue de son app (choix manuel, sinon
// appareil) — un téléphone en anglais reste en anglais.
export const LANG_PARAM = "lang";
const HANDOFF_PATHS = ["/login", "/signup"];

// La langue de ce parcours vit le temps de l'onglet (stockage de session),
// sur les pages d'entrée seulement : elle survit au retour de Google et aux
// premiers réglages, puis s'efface dès qu'on arrive dans l'app ou qu'on
// revient sur le site. Ce n'est jamais un choix enregistré (bt_lang_pref).
export const JOURNEY_KEY = "bt_lang_journey";

export function langFromParam(value) {
  const lang = Array.isArray(value) ? value[0] : value;
  return lang === "fr" || lang === "en" ? lang : null;
}

export function readJourney(storage) {
  try {
    return langFromParam(storage?.getItem(JOURNEY_KEY));
  } catch {
    return null;
  }
}

export function rememberJourney(storage, lang) {
  try {
    if (langFromParam(lang)) storage?.setItem(JOURNEY_KEY, lang);
  } catch {}
}

export function forgetJourney(storage) {
  try {
    storage?.removeItem(JOURNEY_KEY);
  } catch {}
}

// Langue affichée :
//   1. page publique : la langue de son adresse, toujours ;
//   2. page d'entrée : la langue du parcours commencé sur une page anglaise,
//      s'il y en a un dans cet onglet ;
//   3. partout ailleurs (l'app) : le choix manuel, sinon l'appareil (appLang).
export function displayLang({ pathname, journeyLang = null, appLang }) {
  return publicPageLang(pathname) || (isEntryPath(pathname) && langFromParam(journeyLang)) || appLang;
}

function splitHref(href) {
  const hashAt = href.indexOf("#");
  const hash = hashAt >= 0 ? href.slice(hashAt) : "";
  const rest = hashAt >= 0 ? href.slice(0, hashAt) : href;
  const queryAt = rest.indexOf("?");
  return {
    path: queryAt >= 0 ? rest.slice(0, queryAt) : rest,
    search: queryAt >= 0 ? rest.slice(queryAt + 1) : "",
    hash,
  };
}

// La chaîne de paramètres `search`, avec `key=value` en dernier (remplacé
// s'il y était). Sans URLSearchParams : ce module tourne aussi hors navigateur.
function withParam(search, key, value) {
  const kept = search.split("&").filter((part) => part && part.split("=")[0] !== key);
  return [...kept, `${key}=${encodeURIComponent(value)}`].join("&");
}

// Lien posé sur une page publique de langue `lang` :
//   - vers une autre page publique : sa version dans la même langue, quand
//     elle existe (sinon l'adresse française, le temps de la traduire) ;
//   - vers la connexion ou l'inscription depuis une page anglaise : la langue
//     de la page l'accompagne ;
//   - tout le reste (dont /dashboard, l'app) : inchangé.
export function publicHref(href, lang) {
  if (lang !== "en" || typeof href !== "string" || !href.startsWith("/") || href.startsWith("//")) return href;
  const { path, search, hash } = splitHref(href);
  if (HANDOFF_PATHS.includes(path)) return `${path}?${withParam(search, LANG_PARAM, "en")}${hash}`;
  const entry = BY_PATH.get(path);
  if (entry?.lang === "fr" && entry.page.en) return `${entry.page.en}${search ? `?${search}` : ""}${hash}`;
  return href;
}

// Adresse du sélecteur de langue : la même page dans l'autre langue, sinon
// l'accueil de l'autre langue. Ne garde que les paramètres prévus — campagne,
// parrainage, document légal — et l'ancre ; jamais rien d'autre.
const KEPT_PARAMS = ["campaign", "ref", "doc"];
const SAFE_VALUE = /^[A-Za-z0-9_-]{1,64}$/;
const SAFE_HASH = /^#[A-Za-z0-9_-]{1,80}$/;

export function languageSwitchHref({ pathname, query = {}, hash = "" }, targetLang) {
  const twin = equivalentPath(pathname, targetLang);
  const base = twin || PUBLIC_PAGES[0][targetLang];
  const params = [];
  for (const key of KEPT_PARAMS) {
    // Le document légal et l'ancre ne valent que sur la même page.
    if (key === "doc" && !twin) continue;
    const value = Array.isArray(query[key]) ? query[key][0] : query[key];
    if (typeof value === "string" && SAFE_VALUE.test(value)) params.push(`${key}=${value}`);
  }
  return `${base}${params.length ? `?${params.join("&")}` : ""}${twin && SAFE_HASH.test(hash) ? hash : ""}`;
}
