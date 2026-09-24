// Registre des appareils abonnés — côté navigateur.
//
// L'appareil déclare lui-même son état pour le compte connecté
// (push_device_report, v62) : actif après une activation réussie ou au
// démarrage, détaché à la déconnexion ou au retrait du consentement. C'est ce
// qui permet à l'admin d'estimer, AVANT un envoi, combien de membres sont
// vraiment joignables. Aucune donnée OneSignal ici : l'identifiant de
// l'appareil est tiré au hasard par nous (lib/pushOwner.mjs).
//
// Ne lève jamais : un registre indisponible ne doit ni bloquer une activation
// ni retarder une déconnexion.
import { supabase } from "./supabaseClient";
import { deviceKey, platformFamily } from "./pushOwner.mjs";

const TIMEOUT_MS = 2500;

function randomUUID() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  // Repli (anciens navigateurs) : RFC 4122 v4 à partir de getRandomValues.
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function standalone() {
  try {
    return window.matchMedia?.("(display-mode: standalone)").matches === true || window.navigator.standalone === true;
  } catch (_) {
    return false;
  }
}

/** status : "active" | "detached". Renvoie true si la base a enregistré. */
export async function reportPushDevice(status) {
  if (typeof window === "undefined") return false;
  try {
    const key = deviceKey(window.localStorage, randomUUID);
    const call = supabase.rpc("push_device_report", {
      p_device_key: key,
      p_status: status,
      p_platform: platformFamily({
        userAgent: navigator.userAgent,
        platform: navigator.platform,
        maxTouchPoints: navigator.maxTouchPoints || 0,
      }),
      p_standalone: standalone(),
    });
    const result = await Promise.race([
      call.then((r) => r),
      new Promise((resolve) => setTimeout(() => resolve({ error: "timeout" }), TIMEOUT_MS)),
    ]);
    return !result?.error;
  } catch (_) {
    return false;
  }
}
