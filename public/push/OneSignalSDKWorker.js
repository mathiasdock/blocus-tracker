// ⚠️ HÉRITÉ — plus utilisé depuis que le push est porté par le service worker
//    RACINE (voir public/sw-cache-cleanup.js et lib/onesignal.js).
//
//    Le scope "/push/" ne couvrait pas le start_url "/dashboard" : iOS n'ouvre
//    le push qu'en mode standalone, avec un scope couvrant l'app, et refusait
//    donc de créer l'abonnement sur iPhone — alors que macOS Safari, sans cette
//    exigence, fonctionnait. lib/onesignal.js désenregistre les anciens workers
//    /push/ pour éviter les abonnements en double.
//
//    Conservé pour permettre un retour arrière immédiat : il suffit de remettre
//    serviceWorkerPath / serviceWorkerParam sur "push/…" et "/push/".
importScripts("https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.sw.js");
