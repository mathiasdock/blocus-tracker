// Rangement de la collection de badges.
//
// Vingt-deux objets posés en une seule grille se lisent comme un inventaire :
// on voit combien il en manque, jamais lesquels ni pourquoi. Groupés par
// THÈME, ils répondent à la question qu'on se pose vraiment devant une
// collection incomplète — « qu'est-ce que je néglige ? ».
//
// Le thème plutôt que le palier : le palier dit ce qu'un badge vaut, et le
// halo le porte déjà sur l'objet lui-même. Ranger par palier alignerait les
// cinq badges à 50 XP côte à côte, ce qui n'apprend rien sur quoi faire
// ensuite.
//
// L'ordre à l'intérieur d'un thème suit l'effort croissant : la progression
// se lit de gauche à droite, et le prochain objectif est le premier verrouillé.
export const BADGE_GROUPS = [
  { id: "study", labelKey: "badgeGroup.study",
    ids: ["first_session", "hours_10", "marathon_day", "hours_50", "hours_100", "hours_250"] },
  { id: "streak", labelKey: "badgeGroup.streak",
    ids: ["streak_3", "streak_7", "streak_14", "streak_30"] },
  { id: "planning", labelKey: "badgeGroup.planning",
    ids: ["first_exam", "planner", "strategist", "blocus_architect"] },
  { id: "social", labelKey: "badgeGroup.social",
    ids: ["first_friend", "first_post", "motivator", "influencer", "social"] },
  { id: "community", labelKey: "badgeGroup.community",
    ids: ["team_spirit", "community_pillar", "referrer"] },
];

/** Groupes remplis avec les définitions de badges, dans l'ordre déclaré.
 *  Tout badge absent d'un groupe atterrit dans un dernier groupe « Autres » :
 *  un badge ajouté au catalogue et oublié ici doit rester visible, pas
 *  disparaître silencieusement de la collection. */
export function groupBadges(badges) {
  const byId = Object.fromEntries(badges.map(b => [b.id, b]));
  const placed = new Set();
  const groups = BADGE_GROUPS.map(g => {
    const items = g.ids.map(id => byId[id]).filter(Boolean);
    items.forEach(b => placed.add(b.id));
    return { ...g, items };
  }).filter(g => g.items.length > 0);

  const rest = badges.filter(b => !placed.has(b.id));
  if (rest.length) groups.push({ id: "other", labelKey: "badgeGroup.other", items: rest });
  return groups;
}
