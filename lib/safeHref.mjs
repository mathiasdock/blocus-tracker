// Lien interne sûr : un chemin de l'app (« /planning »), jamais une autre
// origine (« //site.com », « https://… »), jamais une route technique.
// Module .mjs : partagé par le navigateur, les routes serveur et les tests
// Node (lib/security.js le réexporte pour le code existant).
export function isSafeInternalHref(href) {
  const value = String(href || "").trim();
  if (!value) return true;
  if (!value.startsWith("/") || value.startsWith("//")) return false;
  if (/[\r\n]/.test(value)) return false;
  if (/^\/(?:api|_next)\b/i.test(value)) return false;
  return true;
}
