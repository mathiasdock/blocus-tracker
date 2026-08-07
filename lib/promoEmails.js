// Consentement aux emails promotionnels — voir migration_v38.
//
// Opt-in STRICT : la colonne est à false par défaut, personne n'est inscrit
// tant qu'il n'a pas coché. L'email donné à l'inscription sert à créer le
// compte et à recevoir les emails transactionnels ; le RGPD ne considère pas
// que ça vaut consentement marketing, d'où ce réglage distinct.
//
// Lecture via la RPC `get_my_promo_emails` et non un SELECT : la colonne n'est
// volontairement pas lisible par `authenticated` (la policy profiles_read est
// USING (TRUE), un SELECT accordé serait lisible sur la ligne de tout le
// monde). Voir l'en-tête de la migration.
//
// Dégradation : tant que la migration v38 n'est pas exécutée, la RPC et la
// colonne n'existent pas → { supported: false }, et le réglage est masqué.
// Aucune erreur visible, comportement d'avant conservé.

/** Consentement de l'utilisateur courant. → { supported, optedIn } */
export async function fetchPromoConsent(supabase) {
  const { data, error } = await supabase.rpc("get_my_promo_emails");
  if (error) return { supported: false, optedIn: false };
  return { supported: true, optedIn: data === true };
}

/**
 * Écrit le consentement. L'horodatage (`promo_emails_at`, la preuve à produire
 * en cas de contrôle) est posé par un trigger côté base — on ne l'envoie pas
 * d'ici, et le client n'a pas le droit de l'écrire.
 * → { ok }
 */
export async function setPromoConsent(supabase, userId, optedIn) {
  if (!userId) return { ok: false };
  const { error } = await supabase
    .from("profiles")
    .update({ promo_emails: optedIn === true })
    .eq("id", userId);
  return { ok: !error };
}
