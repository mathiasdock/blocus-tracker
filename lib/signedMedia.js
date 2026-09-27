// Liens signés des médias privés (DM, groupes, salons, publications), mis en
// cache pour toute la durée de l'onglet (logique : lib/signedMediaCache.mjs).
//
// Avant, chaque ouverture de page resignait tout (liens de 5 min) : revenir
// sur une conversation retéléchargeait ses images. Maintenant
// /api/storage/sign signe pour 1 h et on réutilise le même lien tant qu'il lui
// reste au moins 5 min : même adresse, image servie par le cache du
// navigateur, zéro octet re-téléchargé.
import { supabase } from "./supabaseClient";
import { createSignedMediaCache } from "./signedMediaCache.mjs";

const cache = createSignedMediaCache();

export function cachedSignedUrl(bucket, ref) {
  return cache.get(bucket, ref);
}

// Au changement de compte : les liens de l'autre compte ne survivent pas.
export function forgetSignedMedia() {
  cache.forget();
}

async function signWithApi(bucket, ref) {
  const { data } = await supabase.auth.getSession();
  const token = data?.session?.access_token;
  if (!token) throw new Error("signing_unavailable");
  const response = await fetch("/api/storage/sign", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ bucket, ref }),
  });
  if (!response.ok) throw new Error("signing_failed");
  return response.json();
}

// Signe (ou réutilise) le lien d'un fichier privé.
export function signStorageRef(bucket, ref) {
  return cache.resolve(bucket, ref, signWithApi);
}
