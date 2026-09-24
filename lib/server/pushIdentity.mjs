// Compte supprimé → identité effacée chez OneSignal — SERVEUR UNIQUEMENT.
//
// Toute suppression d'un compte (par la personne, par un admin, depuis le
// tableau de bord Supabase, ou par le repli direct du profil) passe par
// « delete from auth.users » : le déclencheur v62 inscrit alors l'identifiant
// dans push_identity_cleanup. Ce module vide cette file : il supprime
// l'utilisateur OneSignal (et TOUS ses abonnements), puis efface la ligne.
// Absent chez OneSignal = déjà propre. Un échec reste en file, compté, et la
// purge quotidienne réessaie.

export const MAX_CLEANUP_ATTEMPTS = 20;

/** Accès à la file, avec le client service role. */
export function createIdentityQueue(db) {
  return {
    async list({ externalId = null, limit = 50 } = {}) {
      let query = db.from("push_identity_cleanup")
        .select("external_id, attempts")
        .lt("attempts", MAX_CLEANUP_ATTEMPTS)
        .order("created_at")
        .limit(limit);
      if (externalId) query = query.eq("external_id", externalId);
      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
    async done(externalId) {
      await db.from("push_identity_cleanup").delete().eq("external_id", externalId);
    },
    async failed(externalId, attempts, code, now) {
      await db.from("push_identity_cleanup")
        .update({ attempts, last_attempt_at: now, last_error: String(code || "failed").slice(0, 200) })
        .eq("external_id", externalId);
    },
  };
}

export async function processIdentityCleanup({ queue, onesignal, externalId = null, limit = 50, now = new Date() }) {
  if (!onesignal?.configured) return { processed: 0, deleted: 0, missing: 0, failed: 0, skipped: "unconfigured" };
  const rows = await queue.list({ externalId, limit });
  const stamp = (now instanceof Date ? now : new Date(now)).toISOString();
  const result = { processed: rows.length, deleted: 0, missing: 0, failed: 0 };
  for (const row of rows) {
    try {
      const outcome = await onesignal.deleteUser(row.external_id);
      if (outcome.missing) result.missing += 1;
      else result.deleted += 1;
      await queue.done(row.external_id);
    } catch (error) {
      result.failed += 1;
      await queue.failed(row.external_id, Number(row.attempts || 0) + 1, error?.code || "failed", stamp);
    }
  }
  return result;
}
