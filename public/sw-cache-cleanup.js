// Le push OneSignal est greffé sur ce service worker RACINE, mais son import
// vit désormais dans next.config.js (workboxOptions.importScripts) : il doit
// figurer littéralement dans sw.js, que OneSignal désigne comme son worker.
//
// Laisse la page réclamer l'activation immédiate d'un worker en attente.
// next-pwa active déjà d'office, mais sur une PWA iOS restée longtemps ouverte
// un worker peut stagner en "waiting" — et c'est l'ancien qui sert alors.
self.addEventListener("message", (event) => {
  if (event?.data?.type === "SKIP_WAITING") self.skipWaiting();
});

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
