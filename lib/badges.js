import { rarityOf } from "./badgeArt";

// 30 badges couvrant toutes les dimensions de l'app.
// labelKey / descKey renvoient à des clés de lib/i18n.js.
//
// Les RÈGLES d'obtention vivent sur le serveur, et seulement là :
// public.badge_ids_for_user (supabase/migration_v84_badges_progression.sql),
// sur les sources canoniques (série officielle, jours étudiés, session_days).
// Le client n'en recalcule aucune — il lit user_badges (lib/badgeTruth.mjs).
// Un badge gagné n'est jamais retiré ; une règle durcie garde ses anciens
// détenteurs, et leur fiche dit la règle de l'époque (lib/badgeRules.mjs).
//
// ── Ce qu'un badge vaut ─────────────────────────────────────
// Tous valaient 50 XP, de « Première session » (94 % des comptes l'ont) à
// « 250 heures » (personne). Un palier qui récompense la même chose quel que
// soit l'effort ne récompense rien : il informe juste qu'il s'est passé
// quelque chose.
//
// Le montant suit maintenant le PALIER du badge (lib/badgeArt.js), qui suit
// l'EFFORT réel — pas le taux d'obtention observé. La nuance compte : rejoindre
// un groupe ne concerne que 6 % des comptes, mais ça prend trente secondes.
// Payer la rareté plutôt que l'effort reviendrait à payer 300 XP un clic et
// 125 XP trois jours de série.
//
// Le plancher est à 50 XP — la valeur d'avant. Le total d'un compte est
// RECALCULÉ à chaque affichage à partir de ses badges : baisser un montant
// reprendrait rétroactivement du XP déjà acquis et ferait redescendre des gens
// de niveau. Les badges ne peuvent que monter. Même table côté serveur :
// public.gamification_badge_xp.
export const BADGE_TIER_XP = {
  discovery: 50,    // un premier geste : une session, un ami, un examen
  common: 125,      // un premier vrai jalon : 10 h, 5 jours, 10 objectifs
  rare: 300,        // un engagement tenu : 50 h, une semaine, 15 jours étudiés
  epic: 600,        // rare et mérité : 100 h, deux semaines, 50 jours
  legendary: 1200,  // le sommet : 250 h, 30 jours, un mois de fer
};

/** XP d'un badge, d'après son palier. Repli sur le plancher historique. */
export function badgeXP(id) {
  return BADGE_TIER_XP[rarityOf(id)] ?? BADGE_TIER_XP.discovery;
}

/** XP total d'une collection de badges. */
export function totalBadgeXP(ids) {
  return (ids || []).reduce((sum, id) => sum + badgeXP(id), 0);
}

const BADGE_DEFS = [
  { id: "first_session",    icon: "⭐", labelKey: "badge.first_session",    descKey: "badge.first_session.desc" },
  { id: "streak_3",         icon: "🔥", labelKey: "badge.streak_3",          descKey: "badge.streak_3.desc" },
  { id: "streak_7",         icon: "⚡", labelKey: "badge.streak_7",          descKey: "badge.streak_7.desc" },
  { id: "streak_14",        icon: "🌊", labelKey: "badge.streak_14",         descKey: "badge.streak_14.desc" },
  { id: "streak_30",        icon: "💫", labelKey: "badge.streak_30",         descKey: "badge.streak_30.desc" },
  { id: "hours_10",         icon: "📚", labelKey: "badge.hours_10",          descKey: "badge.hours_10.desc" },
  { id: "hours_50",         icon: "🎓", labelKey: "badge.hours_50",          descKey: "badge.hours_50.desc" },
  { id: "hours_100",        icon: "🏆", labelKey: "badge.hours_100",         descKey: "badge.hours_100.desc" },
  { id: "hours_250",        icon: "🌟", labelKey: "badge.hours_250",         descKey: "badge.hours_250.desc" },
  { id: "marathon_day",     icon: "🏃", labelKey: "badge.marathon_day",      descKey: "badge.marathon_day.desc" },
  { id: "steamroller",      icon: "⚡", labelKey: "badge.steamroller",       descKey: "badge.steamroller.desc" },
  { id: "in_the_zone",      icon: "🎯", labelKey: "badge.in_the_zone",       descKey: "badge.in_the_zone.desc" },
  { id: "early_bird",       icon: "🌅", labelKey: "badge.early_bird",        descKey: "badge.early_bird.desc" },
  { id: "regular",          icon: "📖", labelKey: "badge.regular",           descKey: "badge.regular.desc" },
  { id: "relentless",       icon: "💎", labelKey: "badge.relentless",        descKey: "badge.relentless.desc" },
  { id: "metronome",        icon: "⏱", labelKey: "badge.metronome",         descKey: "badge.metronome.desc" },
  { id: "iron_month",       icon: "👑", labelKey: "badge.iron_month",        descKey: "badge.iron_month.desc" },
  { id: "planner",          icon: "📅", labelKey: "badge.planner",           descKey: "badge.planner.desc" },
  { id: "strategist",       icon: "🎯", labelKey: "badge.strategist",        descKey: "badge.strategist.desc" },
  { id: "blocus_architect", icon: "🏛", labelKey: "badge.blocus_architect",  descKey: "badge.blocus_architect.desc" },
  { id: "first_exam",       icon: "📝", labelKey: "badge.first_exam",        descKey: "badge.first_exam.desc" },
  { id: "exam_ready",       icon: "📝", labelKey: "badge.exam_ready",        descKey: "badge.exam_ready.desc" },
  { id: "all_rounder",      icon: "🎓", labelKey: "badge.all_rounder",       descKey: "badge.all_rounder.desc" },
  { id: "first_post",       icon: "📸", labelKey: "badge.first_post",        descKey: "badge.first_post.desc" },
  { id: "influencer",       icon: "🎬", labelKey: "badge.influencer",        descKey: "badge.influencer.desc" },
  { id: "first_friend",     icon: "🤝", labelKey: "badge.first_friend",      descKey: "badge.first_friend.desc" },
  { id: "social",           icon: "👥", labelKey: "badge.social",            descKey: "badge.social.desc" },
  { id: "team_spirit",      icon: "👊", labelKey: "badge.team_spirit",       descKey: "badge.team_spirit.desc" },
  { id: "study_buddy",      icon: "👥", labelKey: "badge.study_buddy",       descKey: "badge.study_buddy.desc" },
  { id: "referrer",         icon: "🤝", labelKey: "badge.referrer",          descKey: "badge.referrer.desc" },
];

// `xp` est dérivé, jamais écrit à la main : la fiche de badge l'affiche
// (« Récompense : +300 XP ») et il DOIT être le même nombre que celui qui
// entre dans le total. Deux valeurs séparées finiraient par diverger.
export const BADGES = BADGE_DEFS.map(b => ({ ...b, xp: badgeXP(b.id) }));
