// Pourquoi Storage a-t-il refusé un envoi ? Trois garde-fous côté serveur
// (migration v81, règles : lib/mediaUploadRules.mjs) : l'interrupteur
// d'urgence des envois, le rythme (30 envois par heure) et le volume
// (100 Mo par membre). La base est interrogée une seule fois, et seulement
// APRÈS un refus — jamais avant chaque envoi.
import { supabase } from "./supabaseClient";
import { refusalKey } from "./mediaUploadRules.mjs";

export { refusalKey };

export async function mediaUploadStatus() {
  try {
    const { data, error } = await supabase.rpc("media_upload_status");
    return error ? null : data;
  } catch {
    return null;
  }
}

// Texte à montrer après un envoi refusé : la raison si c'est un garde-fou,
// sinon le message d'échec habituel.
export async function uploadRefusalText(t, error) {
  const key = refusalKey(await mediaUploadStatus());
  if (key) return t(key);
  return `${t("common.uploadFailed")} ${error?.message || ""}`.trim();
}
