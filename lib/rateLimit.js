// Simple in-memory rate limiter (per-key fixed window).
//
// LIMITATION : sur Vercel / déploiement serverless multi-instance,
// chaque instance possède ses propres buckets → un attaquant peut
// contourner la limite en frappant différentes instances.
// Pour une protection robuste en prod : Upstash Redis ou table
// Supabase (voir commentaire en bas).
//
// Suffisant pour bloquer les bruteforces basiques mono-machine.

const buckets = new Map(); // key → { count, resetAt }

/**
 * Vérifie si une clé est dans la limite autorisée.
 *
 * @param {string} key       identifiant (IP, user_id, etc.)
 * @param {number} max       nombre max de requêtes par fenêtre
 * @param {number} windowMs  durée de la fenêtre en ms
 * @returns {{ ok: boolean, remaining: number, resetAt: number }}
 */
export function rateLimit(key, max = 10, windowMs = 60_000) {
  const now = Date.now();
  let bucket = buckets.get(key);

  if (!bucket || bucket.resetAt < now) {
    bucket = { count: 0, resetAt: now + windowMs };
    buckets.set(key, bucket);
  }

  bucket.count += 1;

  // Nettoyage opportuniste : purge les buckets expirés tous les ~100 appels
  if (buckets.size > 500 && Math.random() < 0.01) {
    for (const [k, b] of buckets.entries()) {
      if (b.resetAt < now) buckets.delete(k);
    }
  }

  return {
    ok: bucket.count <= max,
    remaining: Math.max(0, max - bucket.count),
    resetAt: bucket.resetAt,
  };
}

// ----------------------------------------------------------------
//  Pour upgrade Redis/Upstash, remplacer rateLimit par :
//
//  import { Ratelimit } from "@upstash/ratelimit";
//  import { Redis } from "@upstash/redis";
//  const ratelimit = new Ratelimit({
//    redis: Redis.fromEnv(),
//    limiter: Ratelimit.slidingWindow(8, "1 m"),
//  });
//  → const { success } = await ratelimit.limit(key);
//
//  Avec env vars UPSTASH_REDIS_REST_URL et UPSTASH_REDIS_REST_TOKEN.
// ----------------------------------------------------------------
