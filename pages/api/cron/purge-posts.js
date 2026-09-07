// Expiration réelle des photos du feed, à 24 heures.
//
// POURQUOI CETTE ROUTE EXISTE
// « Les photos disparaissent après 24 h » n'était vrai qu'à l'écran : le feed
// filtrait sur `created_at`, mais la ligne et le fichier image restaient en
// place indéfiniment. Une donnée annoncée comme éphémère et conservée à vie
// n'est pas éphémère — et la politique de confidentialité ne peut pas
// l'affirmer tant que rien ne l'exécute.
//
// CE QUI EST SUPPRIMÉ
//   Le FICHIER image dans le bucket `posts`, PUIS la ligne `posts` en entier —
//   et avec elle, en cascade, ses likes et ses commentaires. Il ne reste
//   strictement rien : ni photo, ni légende, ni auteur, ni horodatage.
//
//   Une version antérieure se contentait de vider `image_url` et `caption` en
//   gardant la ligne, pour préserver le comptage des badges. Mais cette ligne
//   contenait encore `user_id` et `created_at` : « ce compte a publié à cette
//   heure précise ». C'est une donnée personnelle, pas une statistique — la
//   garder tout en la décrivant comme anonyme aurait été faux.
//
//   Ce qui survit est un COMPTEUR AGRÉGÉ (`user_activity_totals`, migration
//   v46) : deux entiers par compte, sans date ni contenu, alimentés à la
//   création et jamais décrémentés. Les badges `first_post`, `influencer` et
//   `motivator` s'appuient dessus, donc la suppression ne peut ni faire
//   baisser un niveau ni retirer un badge.
//
// ORDRE : le fichier d'abord, la ligne ensuite. L'inverse perdrait le chemin
// du fichier et le laisserait orphelin pour toujours.
//
// FRÉQUENCE — pourquoi quotidienne et pas horaire
// Le plan Vercel Hobby plafonne à 2 tâches cron, déclenchables une fois par
// jour seulement. Le seuil de suppression reste 24 h ; c'est le PASSAGE qui
// est quotidien, donc un fichier vit au plus 48 h après sa publication. La
// politique de confidentialité le dit exactement dans ces termes : ne passe à
// `17 * * * *` dans vercel.json que si le plan le permet, et corrige la phrase
// de lib/legal.js en même temps.
//
// Auth : secret cron (Vercel injecte "Authorization: Bearer <CRON_SECRET>").
// Mode test : ?dry=1 → compte ce qui serait supprimé, sans rien toucher.
import { createClient } from "@supabase/supabase-js";
import { getClientIp, setBaseSecurityHeaders, timingSafeEqualText } from "../../../lib/apiSecurity";
import { rateLimit } from "../../../lib/rateLimit";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const CRON_SECRET = process.env.CRON_SECRET;

const EXPIRY_MS = 24 * 60 * 60 * 1000;
const BATCH = 500;

function authorized(req) {
  if (!CRON_SECRET) return false;
  const bearer = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  const hdr = req.headers["x-cron-secret"];
  const header = Array.isArray(hdr) ? hdr[0] : hdr || "";
  return [bearer, header].some((s) => s && timingSafeEqualText(s, CRON_SECRET));
}

/**
 * Retrouve le chemin de stockage à partir de l'URL publique enregistrée.
 * Même logique que pages/api/admin/storage-cleanup.js — volontairement
 * dupliquée ici plutôt qu'extraite : cette route doit rester lisible seule,
 * et un changement de format d'URL doit casser bruyamment aux deux endroits.
 */
function storagePath(imageUrl) {
  if (typeof imageUrl !== "string" || !imageUrl || imageUrl.startsWith("data:")) return null;
  if (imageUrl.startsWith("posts:")) return imageUrl.slice(6).replace(/^\/+/, "") || null;
  try {
    const marker = "/storage/v1/object/public/posts/";
    const index = new URL(imageUrl).pathname.indexOf(marker);
    if (index < 0) return null;
    const path = decodeURIComponent(new URL(imageUrl).pathname.slice(index + marker.length));
    if (!path || path.includes("..") || path.includes("\\")) return null;
    return path;
  } catch {
    return null;
  }
}

export default async function handler(req, res) {
  setBaseSecurityHeaders(res);
  if (req.method !== "GET" && req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  if (!rateLimit(`purge-posts:${getClientIp(req)}`, 20, 60_000).ok) {
    return res.status(429).json({ error: "Too many requests" });
  }
  if (!authorized(req)) return res.status(401).json({ error: "Unauthorized" });
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    return res.status(500).json({ error: "Server misconfigured" });
  }

  const dry = req.query.dry === "1" || req.query.dry === "true";
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const cutoff = new Date(Date.now() - EXPIRY_MS).toISOString();

  try {
    // Pas de filtre sur image_url : une publication dont le fichier a déjà
    // disparu (nettoyage manuel, upload échoué) doit être supprimée elle aussi.
    const { data: expired, error } = await admin
      .from("posts")
      .select("id, image_url")
      .lt("created_at", cutoff)
      .limit(BATCH);
    if (error) throw error;

    const rows = expired || [];
    const paths = rows.map((row) => storagePath(row.image_url)).filter(Boolean);
    const ids = rows.map((row) => row.id);

    if (dry) {
      return res.status(200).json({ dry: true, posts: ids.length, files: paths.length, cutoff });
    }
    if (!ids.length) return res.status(200).json({ ok: true, posts: 0, files: 0, cutoff });

    // Le fichier d'abord : une ligne supprimée avant son fichier laisserait
    // une image orpheline dont plus rien ne donne le chemin.
    let filesRemoved = 0;
    for (let i = 0; i < paths.length; i += 100) {
      const chunk = paths.slice(i, i + 100);
      const { error: removeError } = await admin.storage.from("posts").remove(chunk);
      if (removeError) {
        console.warn("cron/purge-posts remove failed", { count: chunk.length, code: removeError.statusCode || null });
      } else {
        filesRemoved += chunk.length;
      }
    }

    // Puis la ligne elle-même. La cascade emporte likes et commentaires ;
    // les compteurs agrégés ont déjà mis les badges à l'abri.
    const { error: deleteError } = await admin
      .from("posts")
      .delete()
      .in("id", ids);
    if (deleteError) throw deleteError;

    console.info("cron/purge-posts done", { posts: ids.length, files: filesRemoved, more: ids.length === BATCH });
    return res.status(200).json({
      ok: true,
      posts: ids.length,
      files: filesRemoved,
      // Lot plafonné : le prochain passage prendra la suite.
      more: ids.length === BATCH,
      cutoff,
    });
  } catch (err) {
    console.error("cron/purge-posts error:", err?.message || err);
    return res.status(500).json({ error: "Purge failed" });
  }
}
