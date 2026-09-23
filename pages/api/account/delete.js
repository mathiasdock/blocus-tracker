// Suppression de compte — chemin complet (base + fichiers).
//
// POURQUOI CETTE ROUTE EXISTE
// L'app appelait directement le RPC `self_delete_user()`. Il supprime bien la
// ligne auth.users, et toutes les tables partent en cascade — mais Supabase
// Storage ne fait PAS partie de cette cascade. Avatars, photos du feed, pièces
// jointes de messages privés, de groupes et de communautés restaient donc en
// ligne, orphelins, après un « Supprimer mon compte ». Une photo de quelqu'un
// qui a demandé l'effacement de son compte ne peut pas survivre à sa demande.
//
// ORDRE DES OPÉRATIONS
//   1. Vérifier le jeton — on ne supprime QUE le compte de l'appelant. Aucun
//      identifiant n'est accepté depuis le corps de la requête : l'identité
//      vient exclusivement du jeton, il n'y a donc rien à falsifier.
//   2. Effacer les fichiers. Tous les chemins d'upload commencent par
//      `<user.id>/` (voir safeStoragePath dans lib/security.js) : lister ce
//      préfixe suffit à retrouver l'intégralité des fichiers d'une personne.
//   3. Supprimer le compte via le RPC existant, exécuté AVEC LE JETON DE LA
//      PERSONNE. On ne recrée pas un chemin de suppression privilégié : la
//      règle « on ne peut supprimer que soi-même » reste appliquée par la base.
//
// Un échec à l'étape 2 ne bloque JAMAIS l'étape 3 : le droit à l'effacement
// prime sur la propreté du ménage. Ce qui n'a pas pu être supprimé est
// renvoyé dans `storage.failed` et reste rattrapable par l'outil admin
// (/api/admin/storage-cleanup, catégories orphelines).
import { createClient } from "@supabase/supabase-js";
import { getBearerToken, getClientIp, setBaseSecurityHeaders } from "../../../lib/apiSecurity";
import { rateLimit } from "../../../lib/rateLimit";
import { countRemoved, purgeUserFiles } from "../../../lib/server/userFiles";

export const config = { api: { bodyParser: false } };

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

export default async function handler(req, res) {
  setBaseSecurityHeaders(res);

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  if (!rateLimit(`account-delete:${getClientIp(req)}`, 5, 60_000).ok) {
    return res.status(429).json({ error: "Too many requests" });
  }

  const token = getBearerToken(req);
  if (!token) return res.status(401).json({ error: "Unauthorized" });

  if (!SUPABASE_URL || !ANON_KEY || !SERVICE_ROLE_KEY) {
    return res.status(500).json({ error: "Server misconfigured" });
  }

  // Client porteur du jeton : il sert à la fois à identifier la personne et,
  // plus bas, à exécuter la suppression sous SON identité.
  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  const { data: userData, error: userError } = await userClient.auth.getUser(token);
  const userId = userData?.user?.id;
  if (userError || !userId) return res.status(401).json({ error: "Unauthorized" });

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  let storage = { removed: {}, failed: [{ reason: "purge-crashed" }] };
  try {
    storage = await purgeUserFiles(admin, userId);
  } catch (err) {
    console.error("account/delete storage purge failed", { code: err?.statusCode || null });
  }

  const { error: rpcError } = await userClient.rpc("self_delete_user");
  if (rpcError) {
    console.error("account/delete rpc failed", { code: rpcError.code || "unknown" });
    return res.status(500).json({ error: "Deletion failed", storage });
  }

  console.info("account/delete completed", {
    user: `${userId.slice(0, 8)}...`,
    files: countRemoved(storage),
    failed: storage.failed.length,
  });

  return res.status(200).json({ ok: true, storage });
}
