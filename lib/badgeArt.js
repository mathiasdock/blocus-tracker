import { brand } from "./colorTokens.cjs";

// Direction artistique des badges.
//
// Le système précédent donnait à TOUS les badges la même forme — un carré
// arrondi — et faisait porter la difficulté par la seule profondeur du fond :
// facile = vert clair, difficile = vert foncé. Vus en grille, les vingt-deux
// badges ressemblaient à un nuancier. Rien ne disait qu'« une semaine de
// série » et « 250 heures » étaient deux choses différentes.
//
// Ici, chaque badge est un OBJET : une flamme, une coupe, un cristal, un
// sablier. C'est l'objet qui identifie la récompense, pas la teinte de son
// fond. La rareté redevient ce qu'elle doit être — une nuance, pas le sujet.
//
// ── Architecture ────────────────────────────────────────────
// Quatre choses séparées, pour qu'ajouter un badge plus tard reste trivial :
//   1. la DONNÉE du badge          → lib/badges.js (id, libellé, condition, XP)
//   2. son ÉTAT (acquis/verrouillé) → calculé à l'affichage, passé en prop
//   3. son DESSIN                   → ART ci-dessous, en pièces déclaratives
//   4. sa RARETÉ                    → RARITY ci-dessous, indépendante du dessin
// Le rendu (components/BadgeIcon.jsx) ne connaît que ces quatre entrées.
//
// ── Comment un dessin est écrit ─────────────────────────────
// Pas de SVG écrit à la main badge par badge : chaque objet est une liste de
// pièces géométriques simples (cercle, rectangle, polygone, tracé, trait),
// chacune portant une TEINTE (`c`) et un TON (`tone`). Le matériau — dégradé
// lumière→ombre, éclat blanc, occlusion — est appliqué par le rendu, une
// seule fois, pour tout le monde. C'est ce qui donne le relief sans que
// personne ait à dessiner d'ombres à la main, et ce qui garantit que les
// trente et un badges appartiennent visiblement à la même famille.
//
// tone : "grad"  → dégradé clair→moyen→profond de la teinte (le corps de l'objet)
//        "light" | "mid" | "deep" → aplat
//        "spec"  → éclat blanc (reflet)
//        "shade" → occlusion noire (contact, creux)
// `o` force l'opacité, `sw` l'épaisseur d'un trait.
//
// Grille 48×48 pour tout le monde. Les badges s'affichent de 22 px (admin) à
// 88 px (célébration) : les formes restent donc massives, sans détail sous
// 2 unités — en dessous, tout se referme à petite taille.

// Palette d'illustration. Comme la mascotte, elle ne se re-teinte PAS selon
// le thème : un objet dessiné garde ses couleurs, sinon il cesse d'être un
// objet. Elle ne sert qu'ici et dans aucune surface d'interface.
// Le vert est celui de la marque — la palette forêt, prise à sa source
// (lib/colorTokens.cjs) comme pour la mascotte, jamais recopié en dur.
export const HUES = {
  mint:   { light: brand.border, mid: brand.primary, deep: brand.text },
  ember:  { light: "#FFCF8C", mid: "#F58A2E", deep: "#C0480F" },
  gold:   { light: "#FFE39B", mid: "#F0B23A", deep: "#A96D08" },
  sky:    { light: "#A8D1FF", mid: "#4A83E8", deep: "#204A97" },
  violet: { light: "#D8C0FF", mid: "#9366E4", deep: "#5B31A8" },
  indigo: { light: "#BEC0FF", mid: "#6B6ED6", deep: "#333685" },
  rose:   { light: "#FFC2CE", mid: "#F0708C", deep: "#AF2F4E" },
  paper:  { light: "#FFFFFF", mid: "#F2EDE4", deep: "#C4B8A8" },
  steel:  { light: "#E6EDF1", mid: "#A5B4BD", deep: "#57666F" },
};

// ── Les objets ──────────────────────────────────────────────
// A recognizable motif for each canonical badge. Related motifs build on
// one another (flames, books, calendars); historical Stats aliases remain
// available but never create a separate badge catalogue or earning rules.
export const ART = {
  // Première session — l'étoile, la récompense la plus universelle.
  star: [
    { t: "poly", points: "24,6 28.7,18.53 42.07,19.13 31.61,27.47 35.17,40.37 24,33 12.83,40.37 16.39,27.47 5.93,19.13 19.3,18.53", c: "gold", tone: "grad" },
    { t: "poly", points: "24,12.4 26.8,19.9 34.8,20.3 28.5,25.3 30.7,33 24,28.6 17.3,33 19.5,25.3 13.2,20.3 21.2,19.9", c: "gold", tone: "light", o: 0.5 },
  ],

  // Séries — la flamme a besoin de son décroché latéral : un contour
  // symétrique se lit comme une goutte d'eau, pas comme du feu.
  flame: [
    { t: "path", d: "M24 5.2c1.4 5.4 4.6 8.8 7.6 11.6 3.4 3.2 5.6 6.6 5.6 10.8a13.2 13.2 0 0 1-26.4 0c0-2.2.8-4.4 2.2-5.8a4.9 4.9 0 0 0 9.8 0c0-2.6-1-4-2-5.8-2-4-.6-7.8 3.2-10.8Z", c: "ember", tone: "grad" },
    { t: "path", d: "M24 23.6c1.2 2.8 3.6 4.4 3.6 7.2a5.6 5.6 0 0 1-11.2 0c0-2.4 1.6-3.8 2.8-5.4 1 1.6 2.8 1.6 3.4 0 .3-.8.8-1.4 1.4-1.8Z", c: "gold", tone: "grad" },
    { t: "ellipse", cx: 17.4, cy: 28.6, rx: 1.9, ry: 3.6, c: "paper", tone: "spec", o: 0.3 },
  ],

  // Série de 30 jours — le sommet de la famille assiduité.
  crown: [
    { t: "poly", points: "6,33 5.4,14 15,21.6 24,8.4 33,21.6 42.6,14 42,33", c: "gold", tone: "grad" },
    { t: "rect", x: 6, y: 31.6, w: 36, h: 8.4, rx: 2.6, c: "gold", tone: "deep" },
    { t: "circle", cx: 5.4, cy: 11.6, r: 3, c: "rose", tone: "grad" },
    { t: "circle", cx: 24, cy: 6, r: 3.4, c: "mint", tone: "grad" },
    { t: "circle", cx: 42.6, cy: 11.6, r: 3, c: "sky", tone: "grad" },
    { t: "circle", cx: 24, cy: 35.8, r: 2.6, c: "rose", tone: "grad" },
  ],

  // 10 heures — on commence par ouvrir un livre.
  book: [
    { t: "rect", x: 7.5, y: 7, w: 33, h: 34, rx: 3.6, c: "sky", tone: "grad" },
    { t: "rect", x: 13, y: 7, w: 27.5, h: 34, rx: 3, c: "paper", tone: "grad" },
    { t: "rect", x: 13, y: 7, w: 3.4, h: 34, c: "sky", tone: "deep", o: 0.3 },
    { t: "path", d: "M30.6 7h6.6v13.4l-3.3-2.8-3.3 2.8Z", c: "rose", tone: "grad" },
    { t: "rect", x: 19.4, y: 25, w: 13, h: 2.2, rx: 1.1, c: "steel", tone: "mid", o: 0.55 },
    { t: "rect", x: 19.4, y: 30.4, w: 8.6, h: 2.2, rx: 1.1, c: "steel", tone: "mid", o: 0.55 },
  ],

  // 50 heures — la toque : l'étude qui commence à peser.
  cap: [
    { t: "poly", points: "24,7.6 45,17.6 24,27.6 3,17.6", c: "indigo", tone: "grad" },
    { t: "path", d: "M13.4 22.6v8.8c0 3.2 4.8 5.8 10.6 5.8s10.6-2.6 10.6-5.8v-8.8L24 27.8Z", c: "indigo", tone: "deep" },
    { t: "poly", points: "24,9.8 39.6,17.3 24,24.8 8.4,17.3", c: "indigo", tone: "light", o: 0.28 },
    { t: "rect", x: 39.6, y: 18.6, w: 1.9, h: 9.4, rx: 0.95, c: "gold", tone: "mid" },
    { t: "circle", cx: 40.5, cy: 30.4, r: 3.1, c: "gold", tone: "grad" },
  ],

  // 100 heures — la coupe.
  trophy: [
    { t: "stroke", d: "M14 11.5H8.4v3.2a7.4 7.4 0 0 0 6.4 7.2M34 11.5h5.6v3.2a7.4 7.4 0 0 1-6.4 7.2", c: "gold", tone: "deep", sw: 2.6 },
    { t: "path", d: "M14 6.6h20v13.6a10 10 0 0 1-20 0Z", c: "gold", tone: "grad" },
    { t: "rect", x: 21.2, y: 29.6, w: 5.6, h: 6, c: "gold", tone: "deep" },
    { t: "rect", x: 13.4, y: 35, w: 21.2, h: 6, rx: 2, c: "steel", tone: "grad" },
    { t: "ellipse", cx: 19.4, cy: 14.4, rx: 2, ry: 5.2, c: "paper", tone: "spec", o: 0.32 },
  ],

  // 250 heures — le cristal. Les facettes font le relief toutes seules :
  // aucune ombre peinte, uniquement trois plans de lumière différente.
  gem: [
    { t: "poly", points: "14,9 34,9 44,20 24,41 4,20", c: "violet", tone: "grad" },
    { t: "poly", points: "14,9 34,9 38.5,20 9.5,20", c: "violet", tone: "light", o: 0.62 },
    { t: "poly", points: "38.5,20 44,20 24,41", c: "violet", tone: "deep", o: 0.55 },
    { t: "poly", points: "4,20 9.5,20 24,41", c: "violet", tone: "deep", o: 0.22 },
  ],

  // Journée marathon — la médaille d'endurance.
  medal: [
    { t: "poly", points: "13.6,4 22,4 27,20.6 19,22.6", c: "sky", tone: "grad" },
    { t: "poly", points: "34.4,4 26,4 21,20.6 29,22.6", c: "rose", tone: "grad" },
    { t: "circle", cx: 24, cy: 30, r: 12.6, c: "gold", tone: "grad" },
    { t: "circle", cx: 24, cy: 30, r: 8.8, c: "gold", tone: "light", o: 0.55 },
    { t: "poly", points: "24,24.6 25.35,28.14 29.14,28.33 26.19,30.71 27.17,34.37 24,32.3 20.83,34.37 21.81,30.71 18.86,28.33 22.65,28.14", c: "gold", tone: "deep" },
  ],

  // Planificateur — le calendrier coché.
  calendar: [
    { t: "rect", x: 6, y: 9, w: 36, h: 33, rx: 4.6, c: "paper", tone: "grad" },
    { t: "path", d: "M6 13.6A4.6 4.6 0 0 1 10.6 9h26.8A4.6 4.6 0 0 1 42 13.6V19H6Z", c: "sky", tone: "grad" },
    { t: "rect", x: 12.6, y: 4.6, w: 4.2, h: 8.4, rx: 2.1, c: "sky", tone: "deep" },
    { t: "rect", x: 31.2, y: 4.6, w: 4.2, h: 8.4, rx: 2.1, c: "sky", tone: "deep" },
    { t: "stroke", d: "M16.4 30.6 21.6 35.8 32.6 24.6", c: "mint", tone: "mid", sw: 4 },
  ],

  // Stratège — la cible.
  target: [
    { t: "circle", cx: 24, cy: 24, r: 18, c: "ember", tone: "grad" },
    { t: "circle", cx: 24, cy: 24, r: 12.6, c: "paper", tone: "mid" },
    { t: "circle", cx: 24, cy: 24, r: 7.6, c: "ember", tone: "mid" },
    { t: "circle", cx: 24, cy: 24, r: 3.2, c: "paper", tone: "light" },
    { t: "stroke", d: "M11.4 14.8A17 17 0 0 1 22.6 7.2", c: "paper", tone: "spec", sw: 2.6, o: 0.42 },
  ],

  // Architecte du blocus — le fronton. Un plan tenu jusqu'au bout, c'est
  // une construction, pas une case cochée.
  pillars: [
    { t: "poly", points: "24,5 44,15 4,15", c: "gold", tone: "grad" },
    { t: "rect", x: 4.6, y: 15, w: 38.8, h: 3.4, rx: 1.1, c: "steel", tone: "light" },
    { t: "rect", x: 9.6, y: 18.4, w: 5.6, h: 17, c: "steel", tone: "grad" },
    { t: "rect", x: 21.2, y: 18.4, w: 5.6, h: 17, c: "steel", tone: "grad" },
    { t: "rect", x: 32.8, y: 18.4, w: 5.6, h: 17, c: "steel", tone: "grad" },
    { t: "rect", x: 4.6, y: 35.4, w: 38.8, h: 5.2, rx: 1.7, c: "steel", tone: "deep" },
  ],

  // Premier examen — la copie rendue.
  paper: [
    { t: "path", d: "M10 6h18l10 10v26H10Z", c: "paper", tone: "grad" },
    { t: "poly", points: "28,6 38,16 28,16", c: "steel", tone: "mid", o: 0.5 },
    { t: "rect", x: 16, y: 22.6, w: 16, h: 2.4, rx: 1.2, c: "sky", tone: "mid", o: 0.55 },
    { t: "rect", x: 16, y: 28, w: 10.6, h: 2.4, rx: 1.2, c: "sky", tone: "mid", o: 0.55 },
    { t: "stroke", d: "M16.6 35.4 19.8 38.6 26.6 31.6", c: "mint", tone: "mid", sw: 3.2 },
  ],

  // Premier partage — l'appareil photo.
  camera: [
    { t: "path", d: "M17 13.6l2.6-4.6h8.8l2.6 4.6Z", c: "steel", tone: "deep" },
    { t: "rect", x: 4, y: 12.6, w: 40, h: 26.4, rx: 6, c: "steel", tone: "grad" },
    { t: "circle", cx: 24, cy: 25.8, r: 9.6, c: "sky", tone: "deep" },
    { t: "circle", cx: 24, cy: 25.8, r: 6.4, c: "sky", tone: "grad" },
    { t: "circle", cx: 21.4, cy: 23.2, r: 2.2, c: "paper", tone: "spec", o: 0.65 },
    { t: "circle", cx: 37.4, cy: 18.4, r: 2, c: "gold", tone: "mid" },
  ],

  // Voix du blocus — le porte-voix.
  megaphone: [
    { t: "stroke", d: "M35.6 17.4a11 11 0 0 1 0 13.2M40.6 12.6a18 18 0 0 1 0 22.8", c: "mint", tone: "mid", sw: 2.8 },
    { t: "path", d: "M7 19h7l17-9.6v28.2L14 28h-7Z", c: "gold", tone: "grad" },
    { t: "rect", x: 3, y: 18.6, w: 6.4, h: 10.8, rx: 2.2, c: "steel", tone: "grad" },
    { t: "path", d: "M13.6 28h5.4l-1.4 9.4a2.7 2.7 0 0 1-5.2 0Z", c: "steel", tone: "deep" },
  ],

  // Premier ami — quelqu'un qui rejoint.
  personAdd: [
    { t: "circle", cx: 18.6, cy: 16, r: 7.6, c: "violet", tone: "grad" },
    { t: "path", d: "M4.6 39.4a14 14 0 0 1 28 0Z", c: "violet", tone: "mid" },
    { t: "circle", cx: 37.4, cy: 31.4, r: 8.6, c: "mint", tone: "grad" },
    { t: "stroke", d: "M37.4 26.9v9M32.9 31.4h9", c: "paper", tone: "light", sw: 2.8 },
  ],

  // Sociable — le groupe.
  people: [
    { t: "circle", cx: 11.6, cy: 18.6, r: 6, c: "sky", tone: "grad" },
    { t: "path", d: "M1.4 38.4a10.4 10.4 0 0 1 20.8 0Z", c: "sky", tone: "mid" },
    { t: "circle", cx: 36.4, cy: 18.6, r: 6, c: "mint", tone: "grad" },
    { t: "path", d: "M26 38.4a10.4 10.4 0 0 1 20.8 0Z", c: "mint", tone: "mid" },
    { t: "circle", cx: 24, cy: 15.4, r: 7.6, c: "violet", tone: "grad" },
    { t: "path", d: "M10.8 40.6a13.2 13.2 0 0 1 26.4 0Z", c: "violet", tone: "grad" },
  ],

  // Esprit d'équipe — le fanion.
  flag: [
    { t: "rect", x: 9, y: 5, w: 3.6, h: 38, rx: 1.8, c: "steel", tone: "grad" },
    { t: "path", d: "M12.6 7h25.4l-5.2 8.4 5.2 8.4H12.6Z", c: "mint", tone: "grad" },
    { t: "path", d: "M12.6 7h25.4l-5.2 8.4H12.6Z", c: "mint", tone: "light", o: 0.4 },
  ],

  // Ambassadeur — le cadeau qu'on transmet.
  gift: [
    { t: "path", d: "M24 12.4c-2.2-4.2-5.2-6.8-8.6-5.8-3 .9-3.2 5.1.4 5.8Zm0 0c2.2-4.2 5.2-6.8 8.6-5.8 3 .9 3.2 5.1-.4 5.8Z", c: "gold", tone: "mid" },
    { t: "rect", x: 6.4, y: 18.6, w: 35.2, h: 22.4, rx: 3.6, c: "rose", tone: "grad" },
    { t: "rect", x: 4, y: 12.2, w: 40, h: 8, rx: 2.6, c: "rose", tone: "light" },
    { t: "rect", x: 20.6, y: 12.2, w: 6.8, h: 28.8, c: "gold", tone: "grad" },
  ],

  // Première heure — le chronomètre.
  stopwatch: [
    { t: "rect", x: 20, y: 3, w: 8, h: 5.4, rx: 2, c: "steel", tone: "deep" },
    { t: "circle", cx: 24, cy: 27, r: 17, c: "steel", tone: "grad" },
    { t: "circle", cx: 24, cy: 27, r: 13, c: "paper", tone: "light" },
    { t: "stroke", d: "M24 18.6V27l5.8 3.8", c: "ember", tone: "mid", sw: 2.8 },
    { t: "circle", cx: 24, cy: 27, r: 1.9, c: "ember", tone: "deep" },
    { t: "stroke", d: "M12.8 18.4a15 15 0 0 1 6.6-5", c: "paper", tone: "spec", sw: 2.4, o: 0.4 },
  ],

  // Lève-tôt — le soleil qui passe l'horizon. Un disque entier dirait
  // « journée », pas « avant 7 h ».
  sunrise: [
    { t: "circle", cx: 24, cy: 26, r: 10, c: "gold", tone: "grad" },
    { t: "stroke", d: "M24 8v4.4M10 12.6l3.1 3.1M38 12.6l-3.1 3.1M4 26h4.4M39.6 26H44", c: "ember", tone: "mid", sw: 3 },
    { t: "rect", x: 4, y: 31, w: 40, h: 4, rx: 2, c: "sky", tone: "grad" },
    { t: "rect", x: 9.4, y: 38.4, w: 29.2, h: 3.4, rx: 1.7, c: "sky", tone: "light" },
  ],

  // Après minuit — le croissant.
  moon: [
    { t: "path", d: "M41.2 26.8A17.2 17.2 0 1 1 21.2 6.8a13.6 13.6 0 0 0 20 20Z", c: "indigo", tone: "grad" },
    { t: "circle", cx: 11.4, cy: 11.4, r: 2.2, c: "gold", tone: "light" },
    { t: "circle", cx: 38.6, cy: 38.6, r: 1.8, c: "gold", tone: "light" },
    { t: "circle", cx: 41.4, cy: 13.4, r: 1.4, c: "gold", tone: "mid" },
  ],

  // Session de 3 h — l'éclair. Il penche et se décroche : un chevron
  // symétrique ne se lit pas comme de l'énergie.
  bolt: [
    { t: "poly", points: "26.8,5.2 9.6,26.8 20.8,26.8 19.2,43.6 36.4,21.6 25.2,21.6", c: "gold", tone: "grad" },
    { t: "poly", points: "26.8,5.2 9.6,26.8 20.8,26.8", c: "gold", tone: "light", o: 0.42 },
  ],
};

// Variants carry the accomplishment, not a halo. All use the same 48-unit
// object grid and satin material; tier finishes are composed by BadgeIcon.
const flameCore = { t: "path", d: "M25 25c3 3 5 5 5 8a6 6 0 0 1-12 0c0-3 3-5 4-8l1 4Z", c: "gold", tone: "light" };
const bookSpine = (x, y, w, hue) => [
  { t: "rect", x, y, w, h: 8, rx: 2, c: hue, tone: "grad" },
  { t: "rect", x: x + 4, y: y + 2, w: w - 5, h: 4, rx: 1, c: "paper", tone: "mid" },
  { t: "rect", x: x + 1.5, y: y + 1.5, w: 2, h: 5, rx: 1, c: hue, tone: "deep" },
];

Object.assign(ART, {
  flameWeek: [
    { t: "path", d: "M26 4c1 7 9 10 9 17 4-2 4-5 3-8 6 7 5 13 3 18-3 8-9 12-17 12S9 38 7 31c-2-6 0-11 5-15 0 5 2 8 5 7 5-2-1-11 9-19Z", c: "ember", tone: "grad" },
    flameCore,
  ],
  flameFortnight: [
    { t: "path", d: "M25 3c0 6 9 11 9 18 5-3 5-8 4-11 7 6 9 14 6 22-3 8-10 12-20 12S7 39 5 31c-2-7 1-14 6-18-1 6 1 9 4 9 4 0 4-5 3-9 0-4 3-8 7-10Z", c: "ember", tone: "grad" },
    { t: "path", d: "M25 15c2 7 8 10 8 17a10 10 0 0 1-20 0c0-3 2-6 4-8 1 3 3 5 5 3 3-3 0-7 3-12Z", c: "gold", tone: "grad" },
    { t: "path", d: "M24 29c2 3 4 5 4 7a4 4 0 0 1-8 0c0-2 2-5 4-7Z", c: "paper", tone: "light", o: 0.9 },
  ],
  flameLegend: [
    { t: "path", d: "M24 2c3 7 11 10 10 18 5-3 6-8 5-12 8 8 10 17 6 25-4 8-11 11-21 11S6 39 3 32c-3-8 0-15 5-21 0 6 1 10 5 10 5 0 4-5 3-10 3 2 4 4 4 7 4-3 0-9 4-16Z", c: "ember", tone: "grad" },
    { t: "path", d: "M25 12c2 8 10 13 10 20a11 11 0 0 1-22 0c0-5 3-9 5-11-1 6 2 7 4 5 3-3-1-8 3-14Z", c: "gold", tone: "grad" },
    { t: "path", d: "M24 26c1 5 6 7 6 11a6 6 0 0 1-12 0c0-4 3-7 6-11Z", c: "paper", tone: "light" },
    { t: "stroke", d: "m6 6 2 3M41 3l-1 3", c: "gold", tone: "mid", sw: 2 },
  ],
  bookPair: [
    ...bookSpine(6, 32, 36, "indigo"),
    ...bookSpine(9, 23, 30, "sky"),
    { t: "path", d: "M10 10c5-3 9-3 14 0 5-3 9-3 14 0v13c-5-3-9-3-14 0-5-3-9-3-14 0Z", c: "paper", tone: "grad" },
    { t: "stroke", d: "M24 10v13M14 14h6M28 14h6M14 18h6M28 18h6", c: "steel", tone: "mid", sw: 1.5 },
  ],
  bookStack: [
    ...bookSpine(5, 33, 38, "indigo"),
    ...bookSpine(8, 24, 32, "sky"),
    ...bookSpine(5, 15, 35, "mint"),
    { t: "path", d: "M27 15V6h8v15l-4-3Z", c: "gold", tone: "grad" },
    { t: "stroke", d: "M9 8h10", c: "steel", tone: "mid", sw: 2 },
  ],
  folio: [
    { t: "path", d: "M4 11c7-4 13-4 20 1 7-5 13-5 20-1v29c-7-4-13-4-20 1-7-5-13-5-20-1Z", c: "indigo", tone: "grad" },
    { t: "path", d: "M7 8c6-3 11-2 17 2 6-4 11-5 17-2v27c-6-3-11-2-17 2-6-4-11-5-17-2Z", c: "paper", tone: "grad" },
    { t: "stroke", d: "M24 10v27M11 15l8 1M11 21l8 1M11 27l8 1M29 16l8-1M29 22l8-1M29 28l8-1", c: "steel", tone: "mid", sw: 1.5 },
    { t: "path", d: "M28 8h6v14l-3-3-3 3Z", c: "gold", tone: "grad" },
  ],
  calendarDays: [
    ...ART.calendar.slice(0, 4),
    ...[16, 24, 32].flatMap(cx => [25, 33].map(cy => ({ t: "circle", cx, cy, r: 2.5, c: "mint", tone: "mid" }))),
  ],
  calendarStack: [
    { t: "rect", x: 5, y: 6, w: 32, h: 31, rx: 3, c: "indigo", tone: "deep" },
    { t: "rect", x: 9, y: 10, w: 32, h: 31, rx: 3, c: "sky", tone: "mid" },
    { t: "rect", x: 13, y: 14, w: 31, h: 30, rx: 3, c: "paper", tone: "grad" },
    { t: "rect", x: 13, y: 14, w: 31, h: 7, rx: 2, c: "indigo", tone: "grad" },
    { t: "stroke", d: "m20 32 5 5 11-11", c: "mint", tone: "deep", sw: 3 },
  ],
  metronome: [
    { t: "path", d: "M18 5h12l10 36H8Z", c: "indigo", tone: "grad" },
    { t: "path", d: "M20 9h8l6 26H14Z", c: "paper", tone: "grad" },
    { t: "stroke", d: "M24 14v15M19 16h3M19 21h3M19 26h3", c: "steel", tone: "deep", sw: 1.5 },
    { t: "stroke", d: "m24 33 9-19", c: "gold", tone: "deep", sw: 2.5 },
    { t: "rect", x: 29, y: 14, w: 6, h: 6, rx: 1, c: "gold", tone: "grad" },
    { t: "rect", x: 8, y: 39, w: 32, h: 4, rx: 1, c: "steel", tone: "deep" },
  ],
  ironCalendar: [
    { t: "rect", x: 5, y: 9, w: 38, h: 34, rx: 4, c: "steel", tone: "grad" },
    { t: "rect", x: 9, y: 18, w: 30, h: 20, rx: 2, c: "paper", tone: "mid" },
    { t: "stroke", d: "M14 5v9M34 5v9", c: "steel", tone: "deep", sw: 4 },
    ...[15, 24, 33].flatMap(cx => [24, 32].map(cy => ({ t: "rect", x: cx - 2, y: cy - 2, w: 4, h: 4, rx: 1, c: "mint", tone: "deep" }))),
    { t: "poly", points: "34,31 43,31 43,40 38.5,44 34,40", c: "gold", tone: "grad" },
  ],
  planPages: [
    { t: "rect", x: 6, y: 5, w: 28, h: 34, rx: 3, c: "sky", tone: "deep" },
    { t: "rect", x: 11, y: 9, w: 30, h: 34, rx: 3, c: "paper", tone: "grad" },
    ...[18, 27, 36].flatMap(y => [
      { t: "stroke", d: `m16 ${y} 2 2 4-4`, c: "mint", tone: "deep", sw: 2 },
      { t: "stroke", d: `M27 ${y}h8`, c: "steel", tone: "mid", sw: 2 },
    ]),
  ],
  examSeal: [
    ...ART.paper.slice(0, 4),
    { t: "circle", cx: 31, cy: 34, r: 10, c: "gold", tone: "grad" },
    { t: "circle", cx: 31, cy: 34, r: 7, c: "gold", tone: "light" },
    { t: "stroke", d: "m27 34 3 3 6-7", c: "gold", tone: "deep", sw: 2.5 },
  ],
  courseFan: [
    { t: "poly", points: "4,15 15,8 31,32 20,40", c: "rose", tone: "grad" },
    { t: "poly", points: "12,7 24,4 33,34 21,38", c: "mint", tone: "grad" },
    { t: "poly", points: "25,5 37,8 30,38 18,35", c: "sky", tone: "grad" },
    { t: "poly", points: "35,11 44,18 25,42 16,35", c: "indigo", tone: "grad" },
    { t: "circle", cx: 23, cy: 35, r: 3, c: "gold", tone: "grad" },
  ],
  pairedBooks: [
    { t: "rect", x: 3, y: 13, w: 19, h: 28, rx: 3, c: "sky", tone: "grad" },
    { t: "rect", x: 26, y: 13, w: 19, h: 28, rx: 3, c: "mint", tone: "grad" },
    { t: "rect", x: 7, y: 16, w: 11, h: 20, rx: 1, c: "paper", tone: "mid" },
    { t: "rect", x: 30, y: 16, w: 11, h: 20, rx: 1, c: "paper", tone: "mid" },
    { t: "circle", cx: 12, cy: 7, r: 4, c: "sky", tone: "grad" },
    { t: "circle", cx: 36, cy: 7, r: 4, c: "mint", tone: "grad" },
    { t: "stroke", d: "M18 27h12", c: "gold", tone: "deep", sw: 3 },
  ],
});

// ── Quel objet pour quel badge ──────────────────────────────
// Les identifiants du profil sont en snake_case (lib/badges.js), ceux des
// Statistiques en camelCase (lib/statsInsights.js) : aucun risque de
// collision, une seule table pour les deux.
export const BADGE_ART = {
  first_session:    "star",
  streak_3:         "flame",
  streak_7:         "flameWeek",
  streak_14:        "flameFortnight",
  streak_30:        "flameLegend",
  hours_10:         "book",
  hours_50:         "bookPair",
  hours_100:        "bookStack",
  hours_250:        "folio",
  marathon_day:     "medal",
  planner:          "calendar",
  strategist:       "planPages",
  blocus_architect: "pillars",
  first_exam:       "paper",
  first_post:       "camera",
  influencer:       "megaphone",
  first_friend:     "personAdd",
  social:           "people",
  team_spirit:      "flag",
  referrer:         "gift",
  // v84 — objets existants, repris dans leur famille.
  steamroller:      "bolt",
  in_the_zone:      "target",
  early_bird:       "sunrise",
  regular:          "calendarDays",
  relentless:       "calendarStack",
  metronome:        "metronome",
  iron_month:       "ironCalendar",
  exam_ready:       "examSeal",
  all_rounder:      "courseFan",
  study_buddy:      "pairedBooks",

  firstHour:        "stopwatch",
  earlyBird:        "sunrise",
  afterMidnight:    "moon",
  streak7:          "flame",
  session3h:        "bolt",
  marathonDay:      "medal",
  hours50:          "cap",
  hours100:         "trophy",
  goal10:           "target",
};

// ── Rareté ──────────────────────────────────────────────────
// Canonical effort tiers, unchanged: they also govern XP. The renderer gives
// them progressively more worked finishes; it never infers a new tier from
// artwork or from observed ownership rates.
export const RARITIES = ["discovery", "common", "rare", "epic", "legendary"];

// ── Paliers ─────────────────────────────────────────────────
// Le palier dit l'EFFORT que demande le badge, pas sa rareté observée. Les
// deux se ressemblent souvent, mais pas toujours : « rejoindre un groupe » ne
// concerne que 6 % des comptes alors que ça prend trente secondes, et
// « 6 heures en une journée » en concerne la moitié alors que c'est une vraie
// journée de blocus. Indexer le palier sur le taux d'obtention aurait décoré
// le clic et banalisé l'effort.
//
// Deux paliers ont été ajoutés (« discovery » en bas, « legendary » en haut)
// le jour où les badges ont cessé de valoir tous 50 XP : trois marches ne
// suffisaient pas à écarter « ma première session » de « 250 heures ».
// Le palier sert deux choses à la fois — la finition (components/BadgeIcon.jsx)
// et le montant (lib/badges.js). Un seul endroit à changer.
export const BADGE_RARITY = {
  // Un premier geste — quelques secondes, quelques minutes.
  first_session: "discovery",
  first_friend: "discovery",
  first_exam: "discovery",
  first_post: "discovery",
  team_spirit: "discovery",

  // Un premier vrai jalon.
  hours_10: "common",
  marathon_day: "common",
  streak_3: "common",
  planner: "common",
  study_buddy: "common",

  // Un engagement tenu dans la durée.
  hours_50: "rare",
  streak_7: "rare",
  strategist: "rare",
  influencer: "rare",
  steamroller: "rare",
  regular: "rare",
  in_the_zone: "rare",
  exam_ready: "rare",
  all_rounder: "rare",
  early_bird: "rare",

  // Rare et mérité.
  hours_100: "epic",
  streak_14: "epic",
  social: "epic",
  referrer: "epic",
  metronome: "epic",
  relentless: "epic",

  // Le sommet.
  hours_250: "legendary",
  streak_30: "legendary",
  blocus_architect: "legendary",
  iron_month: "legendary",

  // Emblèmes des constats de stats (lib/statsInsights.js) : purement
  // visuels, ils ne rapportent aucun XP.
  firstHour: "discovery",
  earlyBird: "discovery",
  afterMidnight: "discovery",
  goal10: "common",
  marathonDay: "common",
  streak7: "rare",
  session3h: "rare",
  hours50: "rare",
  hours100: "epic",
};

/** Pièces du dessin d'un badge, avec repli explicite plutôt que page blanche. */
export function artFor(id) {
  return ART[BADGE_ART[id]] || ART.star;
}

/** "discovery" | "common" | "rare" | "epic" | "legendary" */
export function rarityOf(id) {
  return BADGE_RARITY[id] || "common";
}

/** Teinte dominante d'un badge — celle de sa première pièce. Sert au halo. */
export function dominantHue(id) {
  const parts = artFor(id);
  const first = parts.find(p => p.tone === "grad") || parts[0];
  return HUES[first?.c] ? first.c : "gold";
}

/** `#RRGGBB` → `rgba(r,g,b,a)`. Les tokens sont en hexadécimal ; les halos
 *  ont besoin d'alpha, et color-mix n'est pas garanti sur tous les Safari
 *  encore en service. */
export function rgba(hex, alpha) {
  const h = hex.replace("#", "");
  const n = parseInt(h.length === 3 ? h.split("").map(c => c + c).join("") : h, 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}
