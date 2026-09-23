// Palette de couleurs pour les cours. Chaque teinte est espacée d'au moins
// ~15° sur le cercle chromatique (les anciennes indigo/violet/purple
// n'étaient qu'à quelques degrés l'une de l'autre et se confondaient) ; les
// 3 dernières (marron, ardoise, bordeaux) sortent du camaïeu vif pour ajouter
// de vraies options supplémentaires sans recréer un cluster proche d'une
// couleur déjà utilisée.
export const COURSE_COLORS = [
  "#ef4444", // rouge
  "#f97316", // orange
  "#f59e0b", // ambre
  "#eab308", // jaune
  "#84cc16", // citron vert
  "#4cbb17", // vert prairie
  "#22c55e", // vert
  "#10b981", // émeraude
  "#14b8a6", // sarcelle
  "#06b6d4", // cyan
  "#0ea5e9", // bleu ciel
  "#3b82f6", // bleu
  "#6366f1", // indigo
  "#a855f7", // violet
  "#d946ef", // fuchsia
  "#ec4899", // rose
  "#f43f5e", // rose foncé
  "#92400e", // marron
  "#64748b", // ardoise
  "#9f1239", // bordeaux
];

// Order in which the setup hands colours out on its own. The palette above
// runs by hue, so taking it in order gave six courses six neighbouring warm
// tones (red, orange, amber, yellow…) that could not be told apart on a
// calendar. Here each next course lands far from the previous ones; the
// picker still shows the palette in hue order.
export const COURSE_COLOR_SEQUENCE = [
  "#ef4444", // rouge
  "#3b82f6", // bleu
  "#f59e0b", // ambre
  "#a855f7", // violet
  "#14b8a6", // sarcelle
  "#ec4899", // rose
  "#84cc16", // citron vert
  "#6366f1", // indigo
  "#f97316", // orange
  "#06b6d4", // cyan
  "#d946ef", // fuchsia
  "#22c55e", // vert
  "#eab308", // jaune
  "#0ea5e9", // bleu ciel
  "#f43f5e", // rose foncé
  "#10b981", // émeraude
  "#92400e", // marron
  "#64748b", // ardoise
  "#4cbb17", // vert prairie
  "#9f1239", // bordeaux
];
