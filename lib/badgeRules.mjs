// Badges durcis en v84 — ce qu'on dit à ceux qui les ont gagnés AVANT.
//
// Un badge gagné n'est jamais retiré (supabase/migration_v84). Mais la fiche
// d'un badge affiche sa règle ; montrer « 5 jours de suite » à quelqu'un qui
// l'a obtenu avec 3 lui attribuerait un exploit qu'il n'a pas fait. Un badge
// obtenu avant la bascule affiche donc la règle de l'époque, puis celle
// d'aujourd'hui, en une phrase.
//
// L'instant est celui de la migration v84 en production, écrit en commentaire
// de public.badge_ids_for_user : « Badge rules v84 in force since
// 2026-09-27T21:09:47.207512Z » (arrondi ici à la milliseconde inférieure).
// Les attributions rétroactives (v84b, 21:10:07) et toutes les suivantes
// portent un instant postérieur : elles suivent la nouvelle règle.
export const BADGE_RULES_V84_FROM = "2026-09-27T21:09:47.207Z";

export const LEGACY_DESC_KEYS = Object.freeze({
  streak_3: "badge.streak_3.descLegacy",
  marathon_day: "badge.marathon_day.descLegacy",
  planner: "badge.planner.descLegacy",
  strategist: "badge.strategist.descLegacy",
  blocus_architect: "badge.blocus_architect.descLegacy",
  referrer: "badge.referrer.descLegacy",
});

/** Obtenu selon une règle d'avant la v84 ? Sans date connue : non. */
export function earnedUnderLegacyRule(id, earnedAt, rulesFrom = BADGE_RULES_V84_FROM) {
  if (!LEGACY_DESC_KEYS[id] || !earnedAt) return false;
  const at = Date.parse(earnedAt);
  const from = Date.parse(rulesFrom);
  return Number.isFinite(at) && Number.isFinite(from) && at < from;
}

/** Clé i18n de la phrase à afficher sous un badge. */
export function badgeDescKey(badge, { earned = false, earnedAt = null } = {}) {
  if (earned && earnedUnderLegacyRule(badge.id, earnedAt)) return LEGACY_DESC_KEYS[badge.id];
  return badge.descKey;
}
