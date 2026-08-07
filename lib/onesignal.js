// Client-side OneSignal (Web Push v16) helper.
//
// - Chargement paresseux du SDK (aucun coût tant que l'utilisateur n'active pas).
// - SW confiné au scope "/push/" pour cohabiter avec next-pwa (scope "/").
// - external_id OneSignal = Supabase user.id (mapping via login()).
//
// La permission notification n'est demandée QUE depuis un geste utilisateur
// (voir le réglage "Notifications push" dans pages/profile.js).

const SDK_URL = "https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.page.js";

let initPromise = null;

// L'App ID OneSignal est TOUJOURS un UUID. Une variable d'env remplie avec le
// libellé du champ ("App ID OneSignal") au lieu de sa valeur passe le simple
// test de vérité et laisse init() partir avec un identifiant invalide : aucune
// inscription n'est créée, mais rien ne le signale. On refuse donc tout ce qui
// n'a pas la forme attendue, et l'UI affiche "non configuré".
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function getAppId() {
  const raw = (process.env.NEXT_PUBLIC_ONESIGNAL_APP_ID || "").trim();
  return UUID_RE.test(raw) ? raw : null;
}

export function isPushSupported() {
  return (
    typeof window !== "undefined" &&
    "Notification" in window &&
    "serviceWorker" in navigator &&
    "PushManager" in window
  );
}

export function isIOS() {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  const iOSDevice = /iPad|iPhone|iPod/.test(ua);
  // iPadOS se présente comme un Mac avec écran tactile.
  const iPadOS = navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
  return iOSDevice || iPadOS;
}

export function isStandalone() {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(display-mode: standalone)").matches === true ||
    window.navigator.standalone === true
  );
}

const INIT_TIMEOUT_MS = 8000;

// Initialise OneSignal une seule fois et renvoie l'objet OneSignal prêt.
//
// ⚠️ Le SDK OneSignal est un cible frequente des bloqueurs de pub/trackers
// (uBlock, Brave Shields, ITP Safari...) : le script peut ne JAMAIS charger,
// et window.OneSignalDeferred ne sera alors jamais traité — sans timeout,
// la promesse restait bloquée pour toujours (bouton "Activer" qui tourne
// indéfiniment, sans aucun message). On force donc un délai max, et on
// réinitialise initPromise en cas d'échec pour qu'un nouveau clic relance
// vraiment une tentative (au lieu de rejouer l'échec en cache).
export function initOneSignal() {
  if (typeof window === "undefined") return Promise.resolve(null);
  const appId = getAppId();
  if (!appId) return Promise.resolve(null);
  if (initPromise) return initPromise;

  const loadPromise = new Promise((resolve, reject) => {
    window.OneSignalDeferred = window.OneSignalDeferred || [];
    window.OneSignalDeferred.push(async (OneSignal) => {
      try {
        await OneSignal.init({
          appId,
          serviceWorkerPath: "push/OneSignalSDKWorker.js",
          serviceWorkerParam: { scope: "/push/" },
          allowLocalhostAsSecureOrigin: true,
        });
        resolve(OneSignal);
      } catch (err) {
        // Un double init() est bénin. TOUT le reste est une vraie panne de
        // configuration : la traiter en succès (window.OneSignal existe même
        // après un échec) laissait partir requestPermission() sur un SDK non
        // initialisé, dont la promesse ne se résout jamais → bouton figé.
        const benign = /already initialized|already been initialized/i.test(err?.message || "");
        if (benign && window.OneSignal) resolve(window.OneSignal);
        else reject(err);
      }
    });

    if (!document.querySelector(`script[src="${SDK_URL}"]`)) {
      const s = document.createElement("script");
      s.src = SDK_URL;
      s.async = true;
      s.defer = true;
      s.onerror = () => reject(new Error("OneSignal SDK failed to load"));
      document.head.appendChild(s);
    }
  });

  const timeoutPromise = new Promise((_, reject) => {
    setTimeout(() => reject(new Error("onesignal-timeout")), INIT_TIMEOUT_MS);
  });

  initPromise = Promise.race([loadPromise, timeoutPromise]).catch((err) => {
    initPromise = null; // permet à un prochain appel de vraiment réessayer
    throw err;
  });

  return initPromise;
}

// Associe l'abonnement push à l'utilisateur Supabase connecté.
export async function loginUser(userId) {
  if (!userId) return;
  let OneSignal;
  try {
    OneSignal = await initOneSignal();
  } catch (err) {
    console.error("OneSignal init error:", err);
    return;
  }
  if (!OneSignal) return;
  try {
    await OneSignal.login(String(userId));
  } catch (err) {
    console.error("OneSignal login error:", err);
  }
}

export async function logoutUser() {
  if (typeof window === "undefined" || !window.OneSignal) return;
  try {
    await window.OneSignal.logout();
  } catch (_) {}
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function currentPermission() {
  return typeof Notification !== "undefined" ? Notification.permission : "default";
}

// L'inscription OneSignal n'est pas immédiate après optIn() : l'id remonte via
// le serveur. On laisse quelques secondes avant de conclure à un échec.
const SUBSCRIPTION_TIMEOUT_MS = 6000;
const OPT_IN_TIMEOUT_MS = 3000;
// L'invite système attend une vraie décision humaine : ce garde-fou n'est là
// que pour le cas où elle ne s'affiche jamais.
const PERMISSION_TIMEOUT_MS = 30000;

async function waitForSubscriptionId(OneSignal) {
  const deadline = Date.now() + SUBSCRIPTION_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const id = OneSignal?.User?.PushSubscription?.id;
    if (id) return id;
    await sleep(300);
  }
  return null;
}

// requestPermission() du SDK peut ne JAMAIS se résoudre quand la configuration
// OneSignal ne correspond pas à l'origine — c'est ce qui faisait tourner le
// bouton à l'infini. On déclenche l'invite sans dépendre de sa promesse, et on
// surveille Notification.permission, seule source de vérité du navigateur.
async function requestPermissionBounded(OneSignal) {
  if (currentPermission() !== "default") return currentPermission();

  OneSignal.Notifications.requestPermission().catch(() => {});

  const deadline = Date.now() + PERMISSION_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (currentPermission() !== "default") return currentPermission();
    await sleep(250);
  }
  return null; // l'invite ne s'est jamais affichée
}

// Demande la permission (geste utilisateur requis) puis opt-in.
// Renvoie { ok, permission, reason }.
//   "blocked"         → le SDK n'a jamais chargé (bloqueur de pub/trackers).
//   "no-subscription" → permission accordée MAIS OneSignal n'a créé aucune
//                       inscription : App ID invalide, origine non déclarée
//                       dans le dashboard OneSignal, ou service worker refusé.
//                       C'est le cas qui, sans ce contrôle, se faisait passer
//                       pour un succès — l'iPhone affichait "activé" et ne
//                       recevait jamais rien.
//   "timeout"         → l'invite système ne s'est jamais affichée.
//
// Chaque étape est bornée : le bouton ne doit JAMAIS tourner indéfiniment.
export async function enablePush() {
  let OneSignal;
  try {
    OneSignal = await initOneSignal();
  } catch (err) {
    const message = err?.message || "";
    // OneSignal n'autorise l'App ID que sur l'origine déclarée dans son
    // dashboard : "Can only be used on: https://…". Une PWA installée depuis
    // une autre adresse (apex sans www, ancienne URL .vercel.app) échoue ici.
    const origin = message.match(/can only be used on:\s*(\S+)/i)?.[1];
    if (origin) return { ok: false, reason: "origin", origin };
    const blocked = message === "onesignal-timeout" || /failed to load/i.test(message);
    return { ok: false, reason: blocked ? "blocked" : "error" };
  }
  if (!OneSignal) return { ok: false, reason: "unconfigured" };
  try {
    const permission = await requestPermissionBounded(OneSignal);
    if (permission === null) {
      console.error("OneSignal: the permission prompt never appeared.");
      return { ok: false, permission: "default", reason: "timeout" };
    }
    if (permission !== "granted") return { ok: false, permission };

    // optIn() peut lui aussi rester en suspens : on ne bloque pas dessus, la
    // présence d'un id d'inscription reste le seul verdict qui compte.
    await Promise.race([
      OneSignal.User.PushSubscription.optIn().catch(() => {}),
      sleep(OPT_IN_TIMEOUT_MS),
    ]);

    const subscriptionId = await waitForSubscriptionId(OneSignal);
    if (!subscriptionId) {
      console.error("OneSignal: permission granted but no subscription was created.");
      return { ok: false, permission, reason: "no-subscription" };
    }
    return { ok: true, permission, subscriptionId };
  } catch (err) {
    console.error("OneSignal enablePush error:", err);
    return { ok: false, reason: "error" };
  }
}
