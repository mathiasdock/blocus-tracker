// Garde-fous des envois appliqués par Storage (migrations v81, v83) — les
// chiffres que l'app explique au membre quand un envoi est refusé.
export const MEDIA_UPLOADS_PER_HOUR = 30;
export const MEDIA_BYTES_PER_MEMBER = 100 * 1024 * 1024;
// Plafond de tous les fichiers de Blocus (le Storage gratuit fait 1 Go).
export const MEDIA_BLOCUS_CAP_BYTES = 700 * 1024 * 1024;

// Réponse de media_upload_status() → clé du message à afficher (ou null :
// refus ordinaire, message d'échec habituel).
export function refusalKey(status) {
  if (status === "disabled") return "media.uploadsPaused";
  if (status === "storage_full") return "media.uploadStorageFull";
  if (status === "rate_limited") return "media.uploadRateLimited";
  if (status === "quota_full") return "media.uploadQuotaFull";
  return null;
}
