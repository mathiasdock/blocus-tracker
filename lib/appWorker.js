// Le service worker de l'app — un seul, et un seul endroit qui l'enregistre.
//
// POURQUOI CE FICHIER EXISTE. Deux bibliothèques enregistraient le même fichier
// `/sw.js`, au même scope, sous deux adresses différentes :
//
//   - next-pwa, à chaque lancement : `/sw.js`
//   - OneSignal, à chaque initialisation : `/sw.js?appId=…&sdkVersion=…`
//
// Pour un navigateur, une adresse différente — même d'un seul paramètre — est un
// NOUVEAU worker : il le réinstalle, c'est-à-dire qu'il retélécharge les ~150
// fichiers précachés (plusieurs Mo), puis change de contrôleur. OneSignal compare
// l'adresse du worker actif à la sienne (« SW href changing ») et réenregistre
// dès qu'elles diffèrent ; next-pwa réenregistrait la sienne au lancement
// suivant. Les deux se renversaient à l'infini.
//
// Conséquences, toutes observées :
//   - activer les notifications attendait la fin d'une installation complète,
//     dépassait le délai, et l'app accusait un « bloqueur de pub » inexistant ;
//   - après une réinstallation de la PWA (cache vide), l'échec était quasi
//     systématique ; sinon il dépendait du réseau — « des fois ça marche » ;
//   - chaque renversement changeait de contrôleur, et AppVersionRefresh
//     rechargeait la page : c'est la boucle de la page profil, et un
//     rechargement pouvait couper l'activation en plein milieu.
//
// LA RÈGLE. On n'enregistre `/sw.js` que s'il n'y a AUCUN worker de l'app. S'il
// y en a un — avec ou sans les paramètres de OneSignal —, on le laisse tel quel
// et on demande seulement une vérification de mise à jour, qui refait la
// requête à SA propre adresse : un déploiement se propage toujours, mais
// l'adresse ne bascule plus jamais d'elle-même. OneSignal la réécrit une seule
// fois par appareil, à la première activation, puis tout reste stable.
//
// `register: false` dans next.config.js est la moitié indispensable de cette
// règle : sans lui, next-pwa rétablirait `/sw.js` à chaque lancement.

export const APP_WORKER_PATH = "/sw.js";

// Partagé avec AppVersionRefresh (pages/_app.js) : présent dans la session, il
// empêche le rechargement automatique sur changement de contrôleur.
export const SW_RELOADED_KEY = "bt_sw_reloaded";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function available() {
  return typeof navigator !== "undefined" && "serviceWorker" in navigator;
}

/**
 * Enregistre le worker de l'app s'il n'existe pas encore ; sinon, se contente de
 * vérifier s'il y a une mise à jour. Ne remplace jamais un worker existant.
 */
export async function ensureAppWorker() {
  if (process.env.NODE_ENV !== "production" || !available()) return null;
  try {
    const registration = await navigator.serviceWorker.getRegistration("/");
    const worker = registration && (registration.active || registration.waiting || registration.installing);
    if (worker && new URL(worker.scriptURL).pathname === APP_WORKER_PATH) {
      registration.update().catch(() => {});
      return registration;
    }
    return await navigator.serviceWorker.register(APP_WORKER_PATH, { scope: "/" });
  } catch (_) {
    return null;
  }
}

/**
 * Attend qu'un worker soit ACTIF pour cette page, dans la limite donnée.
 *
 * OneSignal s'appuie sur le worker actif pour créer l'abonnement. S'il n'y en a
 * pas encore — premier lancement après une installation, précache en cours —,
 * il attend la fin de l'installation entière : c'est là que l'activation
 * dépassait son délai. On attend donc ici, explicitement, avec un motif d'échec
 * qui dit la vérité (« l'app termine son installation »).
 */
export async function waitForActiveWorker(timeoutMs) {
  // En développement next-pwa est désactivé : il n'y aura jamais de worker, et
  // attendre ne ferait qu'échouer au bout du délai.
  if (process.env.NODE_ENV !== "production") return true;
  if (!available()) return false;
  try {
    const registration = await navigator.serviceWorker.getRegistration("/");
    if (registration?.active) return true;
    if (!registration) await ensureAppWorker();
  } catch (_) {}
  return Promise.race([
    navigator.serviceWorker.ready.then(() => true, () => false),
    sleep(timeoutMs).then(() => false),
  ]);
}

/**
 * Empêche AppVersionRefresh de recharger la page pour le reste de la session.
 *
 * À appeler avant une opération qui change volontairement de contrôleur — la
 * première activation des notifications, où OneSignal réécrit l'adresse du
 * worker. Recharger à ce moment-là coupait l'activation avant qu'elle ne soit
 * enregistrée.
 */
export function suppressVersionReload() {
  try { sessionStorage.setItem(SW_RELOADED_KEY, "1"); } catch (_) {}
}
