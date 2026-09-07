// ─────────────────────────────────────────────────────────────────────────
// Moteur de consentement — état source de vérité pour tout ce qui est
// OPTIONNEL sur l'appareil de la personne (services tiers, mesure, marketing).
//
// PRINCIPE : refus par défaut, PARTOUT.
// On ne devine pas le pays du visiteur (une géoloc IP côté client est à la
// fois peu fiable et, ironiquement, un traitement de plus). Le comportement
// strict — RGPD/ePrivacy — s'applique donc à tout le monde ; un Californien
// est protégé au moins autant qu'un Belge, sans complexité état par état.
//
// CE QUI N'EST PAS ICI (et n'a pas à l'être) :
//   Le stockage strictement nécessaire — jeton de session Supabase, chrono en
//   cours, thème, langue, cache hors-ligne de la PWA. Il sert exclusivement à
//   fournir le service demandé, ne suit personne, et fonctionne donc sans
//   consentement. Le désactiver reviendrait à casser l'app, pas à protéger.
//
// CE QUI EST ICI :
//   functional → services tiers de confort. Aujourd'hui : UNIQUEMENT le SDK
//                web-push OneSignal (États-Unis). Refusé = le SDK n'est jamais
//                chargé et aucun identifiant d'appareil n'est créé.
//   analytics  → mesure d'audience. AUCUN outil installé à ce jour. La
//                catégorie existe pour qu'un futur outil ne puisse pas partir
//                sans accord, et pour que le refus soit déjà enregistré.
//   marketing  → publicité / ciblage. AUCUN outil installé à ce jour, et rien
//                n'est vendu ni partagé à des fins publicitaires. La catégorie
//                porte aussi le refus « Do Not Sell or Share » américain.
// ─────────────────────────────────────────────────────────────────────────

import { CONSENT_VERSION } from "./legalVersions";

export const CONSENT_STORAGE_KEY = "bt_consent_v1";

// Ordre d'affichage dans le panneau de réglages.
export const CONSENT_CATEGORIES = ["functional", "analytics", "marketing"];

export const DENY_ALL = Object.freeze({
  functional: false,
  analytics: false,
  marketing: false,
});

export const ALLOW_ALL = Object.freeze({
  functional: true,
  analytics: true,
  marketing: true,
});

/**
 * Le navigateur envoie-t-il un signal Global Privacy Control ?
 * Reconnu par la Californie (CCPA/CPRA) comme un refus valable de la vente et
 * du partage. On l'honore mondialement : c'est plus simple et plus protecteur.
 */
export function hasGlobalPrivacyControl() {
  if (typeof navigator === "undefined") return false;
  return navigator.globalPrivacyControl === true;
}

function normalizeCategories(raw) {
  const out = { ...DENY_ALL };
  if (raw && typeof raw === "object") {
    for (const key of CONSENT_CATEGORIES) {
      if (raw[key] === true) out[key] = true;
    }
  }
  return out;
}

/**
 * Un GPC actif écrase toujours mesure et marketing, même si un choix contraire
 * traîne en mémoire : le signal du navigateur est une demande explicite, il ne
 * peut pas être contredit par un « accepter tout » cliqué la semaine d'avant.
 */
function applyGpc(categories, gpc) {
  if (!gpc) return categories;
  return { ...categories, analytics: false, marketing: false };
}

/** Décision par défaut, avant tout choix : tout ce qui est optionnel est refusé. */
export function defaultConsent() {
  const gpc = hasGlobalPrivacyControl();
  return {
    version: CONSENT_VERSION,
    categories: applyGpc({ ...DENY_ALL }, gpc),
    decidedAt: null,
    source: null,
    gpc,
  };
}

/**
 * Lit la décision enregistrée. Renvoie TOUJOURS un état exploitable :
 * `decidedAt === null` signifie « personne n'a encore choisi » — c'est ce qui
 * déclenche l'affichage du bandeau, et non l'absence de clé.
 */
export function readConsent() {
  const fallback = defaultConsent();
  if (typeof window === "undefined") return fallback;

  let stored = null;
  try {
    stored = JSON.parse(window.localStorage.getItem(CONSENT_STORAGE_KEY) || "null");
  } catch (_) {
    stored = null;
  }
  if (!stored || typeof stored !== "object") return fallback;

  // Modèle de consentement modifié depuis : l'ancien choix ne couvre pas les
  // nouvelles catégories, on redemande plutôt que de supposer.
  if (stored.version !== CONSENT_VERSION) return fallback;

  const gpc = hasGlobalPrivacyControl();
  return {
    version: CONSENT_VERSION,
    categories: applyGpc(normalizeCategories(stored.categories), gpc),
    decidedAt: typeof stored.decidedAt === "string" ? stored.decidedAt : null,
    source: typeof stored.source === "string" ? stored.source : null,
    gpc,
  };
}

/**
 * Enregistre une décision. `source` sert à retracer d'où elle vient
 * ("banner" | "settings" | "push-opt-in" | "gpc") — utile en cas de question,
 * et sans aucune donnée personnelle supplémentaire.
 */
export function writeConsent(categories, source = "banner") {
  const gpc = hasGlobalPrivacyControl();
  const record = {
    version: CONSENT_VERSION,
    categories: applyGpc(normalizeCategories(categories), gpc),
    decidedAt: new Date().toISOString(),
    source,
    gpc,
  };
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(CONSENT_STORAGE_KEY, JSON.stringify(record));
    } catch (_) {
      // Navigation privée / stockage plein : on continue avec l'état en
      // mémoire. Le bandeau reviendra au prochain chargement, ce qui est le
      // comportement sûr — jamais l'inverse.
    }
    try {
      window.dispatchEvent(new CustomEvent("bt:consent-change", { detail: record }));
    } catch (_) {}
  }
  return record;
}

/** Efface la décision : le bandeau réapparaîtra au prochain rendu. */
export function clearConsent() {
  if (typeof window === "undefined") return;
  try { window.localStorage.removeItem(CONSENT_STORAGE_KEY); } catch (_) {}
  try {
    window.dispatchEvent(new CustomEvent("bt:consent-change", { detail: defaultConsent() }));
  } catch (_) {}
}

/**
 * Le garde-fou appelé par le code non-UI (lib/onesignal.js par exemple).
 * Volontairement synchrone et sans React : il doit pouvoir dire non depuis
 * n'importe où, y compris avant le montage de l'arbre de composants.
 */
export function hasConsent(category) {
  if (category === "necessary") return true;
  return readConsent().categories[category] === true;
}
