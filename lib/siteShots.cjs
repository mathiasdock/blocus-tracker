// Captures du site public (accueil, /fonctionnalites) : un étudiant de démo,
// jamais un compte admin, thème clair, en français et en anglais.
//
// Une entrée = une image publiée. `from` est la capture brute (fenêtre de
// 1440 × 900 px sur ordinateur à 2x, 390 × 844 px sur téléphone à 3x),
// `crop` le recadrage en px CSS [x, y, largeur, hauteur], `radius` un détourage
// à coins arrondis (px CSS, transparent au-delà), `widths` les largeurs
// exportées en WebP. scripts/generate-site-shots.cjs produit les
// fichiers ; les pages lisent les dimensions ici pour réserver la place de
// chaque image (aucun décalage de mise en page au chargement).
const SHOTS = {
  "chrono-desktop": { from: "chrono-desktop", scale: 2, crop: [0, 0, 1440, 900], widths: [1100, 1600, 2200] },
  "chrono-mobile": { from: "chrono-mobile", scale: 3, crop: [0, 0, 390, 844], widths: [600, 900] },
  // La carte « Aujourd'hui / Prochain examen » du Planning, détourée : ses coins
  // (22 px) deviennent transparents, elle se pose sur n'importe quel fond.
  "planning-card": { from: "planning-week-mobile", scale: 3, crop: [20, 77, 350, 347], radius: 22, widths: [600, 900] },
  "focus-tile": { from: "focus-desktop", scale: 2, crop: [380, 140, 680, 520], widths: [700, 1300] },
  "planning-desktop": { from: "planning-week-desktop", scale: 2, crop: [0, 0, 1440, 900], widths: [1100, 1600] },
  "planning-mobile": { from: "planning-week-mobile", scale: 3, crop: [0, 0, 390, 844], widths: [600, 900] },
  "stats-desktop": { from: "stats-desktop", scale: 2, crop: [0, 0, 1440, 900], widths: [1100, 1600] },
  "progression-mobile": { from: "progression-mobile", scale: 3, crop: [0, 0, 390, 844], widths: [600, 900] },
  "social-desktop": { from: "social-desktop", scale: 2, crop: [0, 0, 1440, 900], widths: [1100, 1600] },
  "spaces-desktop": { from: "communautes-desktop", scale: 2, crop: [0, 0, 1440, 900], widths: [1100, 1600] },
  "spaces-mobile": { from: "communautes-mobile", scale: 3, crop: [0, 0, 390, 844], widths: [600, 900] },
  // Guide /planning-revision : le Planning d'après sa refonte (2026-10-04), vue
  // Mois par défaut — Aujourd'hui et le prochain examen, le mois avec ses
  // examens, « Par cours » — sans la barre latérale de l'app. Sur téléphone, le
  // haut de l'écran jusqu'à la semaine de l'examen (la barre d'onglets du bas
  // en reste dehors). Capture « planning » du script, prise le 2026-10-12.
  "guide-planning-month": { from: "planning-desktop", scale: 2, crop: [252, 12, 1168, 814], widths: [800, 1200, 1800] },
  "guide-planning-month-mobile": { from: "planning-mobile", scale: 3, crop: [0, 64, 390, 636], widths: [600, 900] },
  // Guide /stats-etude : l'écran Stats réel (avec Records et Habitudes, en prod
  // le 2026-10-12), pages entières « stats-full » du script. En panorama :
  // objectif du jour, temps d'étude, répartition par cours. Puis la régularité
  // et les records, qui illustrent la liste des données à suivre.
  "guide-stats-overview": { from: "stats-full-desktop", scale: 2, crop: [252, 12, 1168, 604], widths: [800, 1200, 1800] },
  "guide-stats-overview-mobile": { from: "stats-full-mobile", scale: 3, crop: [0, 64, 390, 600], widths: [600, 900] },
  "guide-stats-regularity": { from: "stats-full-desktop", scale: 2, crop: [252, 615, 1168, 297], widths: [800, 1200, 1800] },
  // Téléphone : la carte jusqu'à la grille, sans la légende (sa hauteur change
  // entre le français et l'anglais).
  "guide-stats-regularity-mobile": { from: "stats-full-mobile", scale: 3, crop: [8, 843, 374, 320], widths: [600, 900] },
  "guide-stats-records": { from: "stats-full-desktop", scale: 2, crop: [830, 908, 590, 399], widths: [600, 900] },
  // Guide /objectifs-etude : la page Progression réelle, page entière
  // « progression-full ». Niveau et XP, missions du jour et défis de la
  // semaine, paliers ; sur téléphone, la carte des missions et des défis.
  "guide-goals-progress": { from: "progression-full-desktop", scale: 2, crop: [372, 66, 928, 869], widths: [800, 1200, 1800] },
  "guide-goals-progress-mobile": { from: "progression-full-mobile", scale: 3, crop: [8, 600, 374, 447], widths: [600, 900] },
  // Guide /application-etudiant : une vraie capture par fonction de l'encadré
  // « Ce que Blocus Tracker regroupe » (captures du 2026-10-12, bulle de la
  // mascotte fermée). Sur ordinateur, deux rangées 5/7 puis 7/5 avec la vue
  // Mois et les Stats ci-dessus : le mode Focus a le rapport largeur/hauteur de
  // la vue Mois divisé par 1,4 (7/5), l'espace de cours celui des Stats, pour
  // que deux voisines aient toujours la même hauteur. L'espace de cours : la
  // conversation, avec la date d'examen partagée par une étudiante.
  "guide-app-focus": { from: "focus-desktop", scale: 2, crop: [351, 89, 738, 720], widths: [600, 900] },
  "guide-app-spaces": { from: "communautes-desktop", scale: 2, crop: [636, 0, 804, 582], widths: [600, 900] },
  // Sous 1024 px, les mêmes fonctions sur téléphone, toutes au même format (le
  // Planning sert aussi à /blocus-belgique, sous 640 px).
  // L'espace de cours s'arrête juste avant le message suivant : en anglais,
  // plus bas d'une ligne, la carte de la date d'examen perd son filet du bas.
  "guide-app-focus-mobile": { from: "focus-mobile", scale: 3, crop: [0, 192, 390, 441], widths: [600, 900] },
  "guide-app-planning-mobile": { from: "planning-mobile", scale: 3, crop: [0, 64, 390, 441], widths: [600, 900] },
  "guide-app-stats-mobile": { from: "stats-full-mobile", scale: 3, crop: [0, 64, 390, 441], widths: [600, 900] },
  "guide-app-spaces-mobile": { from: "communautes-mobile", scale: 3, crop: [0, 0, 390, 441], widths: [600, 900] },
};

const SHOT_LANGS = ["fr", "en"];

function shotHeight(name, width) {
  const [, , w, h] = SHOTS[name].crop;
  return Math.round((width * h) / w);
}

function shotPath(lang, name, width) {
  return `/site-web/v2/${lang === "en" ? "en" : "fr"}/${name}-${width}.webp`;
}

// Attributs d'une image : src (largeur médiane), srcset, et les dimensions
// intrinsèques qui fixent le rapport largeur/hauteur avant le chargement.
function shotImage(lang, name) {
  const shot = SHOTS[name];
  if (!shot) throw new Error(`Unknown site shot: ${name}`);
  const width = shot.widths[Math.min(1, shot.widths.length - 1)];
  return {
    src: shotPath(lang, name, width),
    srcSet: shot.widths.map((w) => `${shotPath(lang, name, w)} ${w}w`).join(", "),
    width,
    height: shotHeight(name, width),
  };
}

module.exports = { SHOTS, SHOT_LANGS, shotHeight, shotPath, shotImage };
