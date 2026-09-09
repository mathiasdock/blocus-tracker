import { rarityOf } from "./badgeArt";

// 22 badges couvrant toutes les dimensions de l'app.
// labelKey / descKey renvoient à des clés de lib/i18n.js.
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
// de niveau. Les badges ne peuvent que monter.
export const BADGE_TIER_XP = {
  discovery: 50,    // un premier geste : une session, un ami, un examen
  common: 125,      // un premier vrai jalon : 10 h, 3 jours, 10 objectifs
  rare: 300,        // un engagement tenu : 50 h, une semaine, 25 objectifs
  epic: 600,        // rare et mérité : 100 h, deux semaines, 20 amis
  legendary: 1200,  // le sommet : 250 h, 30 jours, 75 objectifs
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
  { id: "planner",          icon: "📅", labelKey: "badge.planner",           descKey: "badge.planner.desc" },
  { id: "strategist",       icon: "🎯", labelKey: "badge.strategist",        descKey: "badge.strategist.desc" },
  { id: "blocus_architect", icon: "🏛", labelKey: "badge.blocus_architect",  descKey: "badge.blocus_architect.desc" },
  { id: "first_exam",       icon: "📝", labelKey: "badge.first_exam",        descKey: "badge.first_exam.desc" },
  { id: "first_post",       icon: "📸", labelKey: "badge.first_post",        descKey: "badge.first_post.desc" },
  { id: "influencer",       icon: "🎬", labelKey: "badge.influencer",        descKey: "badge.influencer.desc" },
  { id: "first_friend",     icon: "🤝", labelKey: "badge.first_friend",      descKey: "badge.first_friend.desc" },
  { id: "social",           icon: "👥", labelKey: "badge.social",            descKey: "badge.social.desc" },
  { id: "motivator",        icon: "💬", labelKey: "badge.motivator",         descKey: "badge.motivator.desc" },
  { id: "team_spirit",      icon: "👊", labelKey: "badge.team_spirit",       descKey: "badge.team_spirit.desc" },
  { id: "community_pillar", icon: "🌍", labelKey: "badge.community_pillar",  descKey: "badge.community_pillar.desc" },
  { id: "referrer",         icon: "🤝", labelKey: "badge.referrer",          descKey: "badge.referrer.desc" },
];

// `xp` est dérivé, jamais écrit à la main : la fiche de badge l'affiche
// (« Récompense : +300 XP ») et il DOIT être le même nombre que celui qui
// entre dans le total. Deux valeurs séparées finiraient par diverger.
export const BADGES = BADGE_DEFS.map(b => ({ ...b, xp: badgeXP(b.id) }));

export function computeEarnedBadgeIds({
  streak,
  totalHours,
  maxDailyHours,
  sessionCount,
  examCount,
  objectiveCount,
  completedObjCount,
  friendCount,
  postCount,
  reactionsCount,
  groupMemberCount,
  communityMsgCount,
  referralCount,
}) {
  const ids = [];
  if (sessionCount >= 1)        ids.push("first_session");
  if (streak >= 3)              ids.push("streak_3");
  if (streak >= 7)              ids.push("streak_7");
  if (streak >= 14)             ids.push("streak_14");
  if (streak >= 30)             ids.push("streak_30");
  if (totalHours >= 10)         ids.push("hours_10");
  if (totalHours >= 50)         ids.push("hours_50");
  if (totalHours >= 100)        ids.push("hours_100");
  if (totalHours >= 250)        ids.push("hours_250");
  if (maxDailyHours >= 6)       ids.push("marathon_day");
  if (objectiveCount >= 10)     ids.push("planner");
  if (completedObjCount >= 25)  ids.push("strategist");
  if (completedObjCount >= 75)  ids.push("blocus_architect");
  if (examCount >= 1)           ids.push("first_exam");
  if (postCount >= 1)           ids.push("first_post");
  if (postCount >= 10)          ids.push("influencer");
  if (friendCount >= 1)         ids.push("first_friend");
  if (friendCount >= 20)        ids.push("social");
  if (reactionsCount >= 25)     ids.push("motivator");
  if (groupMemberCount >= 1)    ids.push("team_spirit");
  // 50 messages était hors d'échelle : le record tous utilisateurs confondus
  // est de 2. Les autres badges non débloqués sont, eux, correctement calibrés
  // (176 h sur 250, 64 objectifs sur 75, série de 22 sur 30) — on n'y touche pas.
  if (communityMsgCount >= 10)  ids.push("community_pillar");
  if (referralCount >= 5)       ids.push("referrer");
  return ids;
}
