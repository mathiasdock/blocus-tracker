// Préférences vie privée rattachées au COMPTE (et non à l'appareil).
//
// Deux endroits, deux rôles, volontairement :
//   • localStorage (lib/consent.js) → le choix cookies/traceurs. Il doit
//     fonctionner AVANT toute connexion, donc il ne peut pas vivre en base.
//   • table user_privacy_settings → ce qui doit suivre la personne d'un
//     appareil à l'autre et servir de preuve : acceptation des CGU, version
//     des documents, préférences de notifications. C'est aussi ce que le
//     serveur lit avant d'envoyer un push (pages/api/push/daily.js).
//
// TOLÉRANCE AUX MIGRATIONS NON PASSÉES
// Les migrations SQL de ce projet sont exécutées à la main. Le code déployé
// peut donc précéder la table de plusieurs heures. Chaque fonction renvoie
// alors `{ unavailable: true }` sans lever : l'app garde son comportement
// d'avant, personne ne voit d'erreur, et tout se met en place à l'exécution
// de la migration.

const MISSING_RELATION_CODES = new Set([
  "42P01",   // undefined_table (Postgres)
  "PGRST205", // PostgREST : table absente du cache de schéma
  "PGRST202",
  "PGRST204", // colonne absente du cache de schéma
]);

export const PRIVACY_COLUMNS = [
  "user_id",
  "terms_version",
  "terms_accepted_at",
  "privacy_version",
  "privacy_acknowledged_at",
  "push_reminders",
  "push_announcements",
  "consent_version",
  "consent_categories",
  "consent_updated_at",
].join(",");

export const DEFAULT_PRIVACY_SETTINGS = Object.freeze({
  terms_version: null,
  terms_accepted_at: null,
  privacy_version: null,
  privacy_acknowledged_at: null,
  push_reminders: true,
  push_announcements: true,
  consent_version: null,
  consent_categories: null,
  consent_updated_at: null,
});

function isMissingSchema(error) {
  if (!error) return false;
  if (MISSING_RELATION_CODES.has(error.code)) return true;
  return /user_privacy_settings/i.test(error.message || "");
}

/**
 * Lit la ligne de la personne connectée.
 * @returns {Promise<{ settings: object|null, unavailable: boolean }>}
 */
export async function loadPrivacySettings(supabase, userId) {
  if (!supabase || !userId) return { settings: null, unavailable: false };
  try {
    const { data, error } = await supabase
      .from("user_privacy_settings")
      .select(PRIVACY_COLUMNS)
      .eq("user_id", userId)
      .maybeSingle();
    if (error) return { settings: null, unavailable: isMissingSchema(error) };
    return { settings: data ? { ...DEFAULT_PRIVACY_SETTINGS, ...data } : null, unavailable: false };
  } catch (_) {
    return { settings: null, unavailable: true };
  }
}

/**
 * Crée ou met à jour la ligne. Un `upsert` plutôt qu'un `update` : la ligne
 * n'existe pas forcément (compte antérieur à la migration, ou créé pendant
 * que le trigger n'était pas encore en place).
 */
export async function savePrivacySettings(supabase, userId, patch) {
  if (!supabase || !userId || !patch) return { ok: false, unavailable: false };
  try {
    const { error } = await supabase
      .from("user_privacy_settings")
      .upsert({ user_id: userId, ...patch, updated_at: new Date().toISOString() },
        { onConflict: "user_id" });
    if (error) return { ok: false, unavailable: isMissingSchema(error), error };
    return { ok: true, unavailable: false };
  } catch (_) {
    return { ok: false, unavailable: true };
  }
}

/** Trace l'acceptation des CGU + la version de la politique alors affichée. */
export function recordLegalAcceptance(supabase, userId, { termsVersion, privacyVersion }) {
  const now = new Date().toISOString();
  return savePrivacySettings(supabase, userId, {
    terms_version: termsVersion,
    terms_accepted_at: now,
    privacy_version: privacyVersion,
    privacy_acknowledged_at: now,
  });
}

/** Recopie le choix cookies/traceurs sur le compte, pour qu'il suive l'appareil. */
export function recordConsentChoice(supabase, userId, consent) {
  if (!consent?.decidedAt) return Promise.resolve({ ok: false, unavailable: false });
  return savePrivacySettings(supabase, userId, {
    consent_version: consent.version,
    consent_categories: consent.categories,
    consent_updated_at: consent.decidedAt,
  });
}
