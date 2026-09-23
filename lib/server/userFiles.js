// Fichiers d'un membre dans Supabase Storage — serveur uniquement.
//
// Supabase Storage ne fait PAS partie des suppressions en cascade de la base :
// supprimer un compte (ou retirer un avatar) sans effacer les fichiers les
// laisse en ligne, orphelins. Tous les chemins d'upload commencent par
// `<user.id>/` (voir safeStoragePath dans lib/security.js) : lister ce préfixe
// suffit à retrouver l'intégralité des fichiers d'une personne.
//
// Utilisé par /api/account/delete (suppression par la personne) et par les
// routes /api/admin/members/* (suppression ou retrait d'avatar par un admin).

// Tous les buckets où un utilisateur peut déposer un fichier.
export const USER_BUCKETS = ["avatars", "posts", "dm", "group", "community"];

const LIST_PAGE = 100;
const MAX_FILES_PER_BUCKET = 2000;

/**
 * Liste récursivement les fichiers sous `prefix`. L'API Storage ne descend pas
 * d'elle-même dans les sous-dossiers : les pièces jointes de groupe vivent en
 * `<uid>/<groupId>/…`, elles seraient invisibles sans cette descente.
 */
export async function listAllFiles(admin, bucket, prefix, depth = 0) {
  if (depth > 3) return [];
  const files = [];
  for (let offset = 0; offset < MAX_FILES_PER_BUCKET; offset += LIST_PAGE) {
    const { data, error } = await admin.storage
      .from(bucket)
      .list(prefix, { limit: LIST_PAGE, offset });
    if (error) throw new Error(`list-failed:${bucket}`);
    if (!data?.length) break;

    for (const entry of data) {
      const path = `${prefix}/${entry.name}`;
      // Un dossier n'a pas de métadonnées ; un fichier en a toujours.
      if (entry.id === null || !entry.metadata) {
        files.push(...await listAllFiles(admin, bucket, path, depth + 1));
      } else {
        files.push(path);
      }
    }
    if (data.length < LIST_PAGE) break;
  }
  return files;
}

/**
 * Efface les fichiers de `userId` dans `buckets`. Ne lève jamais : renvoie
 * { removed: { bucket: n }, failed: [{ bucket, reason, count? }] } pour que
 * l'appelant décide si un échec partiel doit bloquer la suite.
 */
export async function purgeUserFiles(admin, userId, buckets = USER_BUCKETS) {
  const removed = {};
  const failed = [];

  for (const bucket of buckets) {
    let paths = [];
    try {
      paths = await listAllFiles(admin, bucket, userId);
    } catch (_) {
      failed.push({ bucket, reason: "list-failed" });
      continue;
    }
    if (!paths.length) { removed[bucket] = 0; continue; }

    // remove() plafonne par appel : on découpe.
    let count = 0;
    for (let i = 0; i < paths.length; i += 100) {
      const chunk = paths.slice(i, i + 100);
      const { error } = await admin.storage.from(bucket).remove(chunk);
      if (error) failed.push({ bucket, reason: "remove-failed", count: chunk.length });
      else count += chunk.length;
    }
    removed[bucket] = count;
  }

  return { removed, failed };
}

export function countRemoved(storage) {
  return Object.values(storage?.removed || {}).reduce((sum, n) => sum + n, 0);
}
