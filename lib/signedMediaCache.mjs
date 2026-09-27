// Cache des liens signés des médias privés — la logique pure, testable sans
// navigateur (lib/signedMedia.js y branche Supabase et /api/storage/sign).
//
// Un lien signé change à chaque signature : un nouveau lien, c'est une
// nouvelle adresse, donc une photo retéléchargée en entier même si le
// navigateur l'avait déjà. On réutilise donc le même lien tant qu'il lui reste
// au moins 5 min de validité, et deux demandes simultanées pour le même
// fichier ne font qu'une signature.
export const REUSE_MARGIN_MS = 5 * 60 * 1000;
export const DEFAULT_TTL_S = 60 * 60;

export function createSignedMediaCache({ now = () => Date.now() } = {}) {
  const entries = new Map();  // "bucket:ref" → { url, expiresAt }
  const inflight = new Map(); // "bucket:ref" → Promise<string>
  const key = (bucket, ref) => `${bucket}:${ref}`;

  function get(bucket, ref) {
    const hit = entries.get(key(bucket, ref));
    return hit && hit.expiresAt - now() > REUSE_MARGIN_MS ? hit.url : null;
  }

  function remember(bucket, ref, url, ttlSeconds = DEFAULT_TTL_S) {
    if (!url) return;
    entries.set(key(bucket, ref), { url, expiresAt: now() + Math.max(60, Number(ttlSeconds) || DEFAULT_TTL_S) * 1000 });
  }

  function forget() {
    entries.clear();
    inflight.clear();
  }

  // `sign(bucket, ref)` → { signedUrl, expiresIn } ; appelé seulement si
  // aucun lien encore valable n'est en cache.
  async function resolve(bucket, ref, sign) {
    const hit = get(bucket, ref);
    if (hit) return hit;
    const k = key(bucket, ref);
    if (inflight.has(k)) return inflight.get(k);
    const run = (async () => {
      const body = await sign(bucket, ref);
      if (!body?.signedUrl) throw new Error("signing_failed");
      remember(bucket, ref, body.signedUrl, body.expiresIn);
      return body.signedUrl;
    })();
    inflight.set(k, run);
    try {
      return await run;
    } finally {
      inflight.delete(k);
    }
  }

  return { get, remember, forget, resolve };
}
