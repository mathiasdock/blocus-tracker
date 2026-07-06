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

// Initialise OneSignal une seule fois et renvoie l'objet OneSignal prêt.
export function initOneSignal() {
  if (typeof window === "undefined") return Promise.resolve(null);
  const appId = process.env.NEXT_PUBLIC_ONESIGNAL_APP_ID;
  if (!appId) return Promise.resolve(null);
  if (initPromise) return initPromise;

  initPromise = new Promise((resolve, reject) => {
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
        // init() relancé → on considère "déjà initialisé" comme un succès.
        if (window.OneSignal) resolve(window.OneSignal);
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

  return initPromise;
}

// Associe l'abonnement push à l'utilisateur Supabase connecté.
export async function loginUser(userId) {
  if (!userId) return;
  const OneSignal = await initOneSignal();
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

// Demande la permission (geste utilisateur requis) puis opt-in.
// Renvoie { ok, permission, reason }.
export async function enablePush() {
  const OneSignal = await initOneSignal();
  if (!OneSignal) return { ok: false, reason: "unconfigured" };
  try {
    await OneSignal.Notifications.requestPermission();
    try {
      await OneSignal.User.PushSubscription.optIn();
    } catch (_) {}
    const granted =
      typeof Notification !== "undefined" && Notification.permission === "granted";
    return {
      ok: granted,
      permission: typeof Notification !== "undefined" ? Notification.permission : "default",
    };
  } catch (err) {
    console.error("OneSignal enablePush error:", err);
    return { ok: false, reason: "error" };
  }
}
