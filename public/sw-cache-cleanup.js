// ── Push OneSignal, greffé sur le service worker RACINE ────────────────────
// Auparavant un second service worker vivait sous /push/. Sur iOS, le push
// n'est autorisé qu'en mode standalone et le scope doit couvrir l'app : or le
// start_url est /dashboard, que /push/ ne couvre pas. D'où un abonnement qui
// n'était jamais créé sur iPhone alors qu'il l'était sur macOS Safari, où
// l'exigence de standalone n'existe pas.
//
// L'import est ici plutôt que dans workboxOptions.importScripts, et sous
// try/catch, pour qu'une indisponibilité du CDN OneSignal ne fasse pas échouer
// l'installation du service worker : on perdrait alors le cache hors-ligne de
// TOUS les utilisateurs pour une fonctionnalité secondaire.
try {
  importScripts("https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.sw.js");
} catch (error) {
  console.warn("[sw] OneSignal push unavailable, cache still active.", error);
}

// Remove responses that older service-worker versions cached without varying
// on the Supabase Authorization header. Activation waits for the deletion so
// a newly signed-in account cannot observe an earlier account's responses.
self.addEventListener("activate", (event) => {
  event.waitUntil(Promise.all([
    caches.delete("cross-origin"),
    // Community files used to be public and shared this cache with avatars.
    // Clearing it once prevents a private object from surviving the migration.
    caches.delete("supabase-storage"),
  ]));
});
