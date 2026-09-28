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
