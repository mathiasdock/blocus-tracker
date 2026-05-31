// OneSignal service worker (Web Push v16).
//
// ⚠️ Confiné au scope "/push/" pour NE PAS entrer en conflit avec le service
//    worker de next-pwa qui occupe le scope racine "/". Les deux SW coexistent :
//    next-pwa gère le cache/offline (scope "/"), celui-ci gère le push (scope "/push/").
//
// Fichier STATIQUE — non régénéré par le build next-pwa.
importScripts("https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.sw.js");
