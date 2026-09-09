// Emblèmes de badges.
//
// La version précédente tenait les vingt-deux badges dans une seule teinte —
// le vert de marque — et faisait porter la rareté par la seule profondeur.
// Vue en grille, la planche ressemblait à un dégradé : rien ne distinguait
// « série de 30 jours » de « 250 heures », et la récompense n'avait plus l'air
// d'une récompense.
//
// Principes ici :
//   • La COULEUR dit la FAMILLE (temps d'étude, série, organisation, social,
//     heures nocturnes), la FINITION dit la RARETÉ. Deux informations, deux
//     canaux — au lieu d'une seule dimension surchargée.
//   • Les teintes sortent d'une palette fermée de cinq familles, définie une
//     fois dans globals.css et documentée comme exception à la règle « vert
//     uniquement ». Le vert reste la famille du temps d'étude, donc du cœur du
//     produit ; les autres sont des repères, pas une seconde identité.
//   • UNE seule forme — le carré arrondi, déjà le langage du médaillon de
//     niveau. L'emblème EST le conteneur : pas de cadre dans un cadre.
//   • Chaque emblème porte un contour, et c'est lui qui monte d'un cran à
//     chaque palier : filet discret → liseré clair → anneau lumineux.
//   • Glyphes sur une grille 24 partagée, en tracé de 2 comme le reste des
//     icônes — lisibles à 22 px comme à 72 px.
//   • Verrouillé = emplacement vide assumé (surface neutre, glyphe estompé),
//     pas une version délavée de l'acquis : sans couleur, la grille dit d'un
//     coup d'œil ce qui reste à aller chercher.

const TIERS = { starter: 1, progress: 2, rare: 3 };

// Palier fondé sur la difficulté réelle mesurée en base, pas sur l'intuition.
// Famille fondée sur ce que le badge récompense, pas sur son glyphe.
const BADGE_VISUALS = {
  first_session:    { glyph: "spark",    tier: TIERS.starter,  fam: "time" },
  streak_3:         { glyph: "flame",    tier: TIERS.starter,  fam: "streak" },
  streak_7:         { glyph: "flame",    tier: TIERS.progress, fam: "streak" },
  // Palier rare assumé : 8 détenteurs seulement, et surtout la flamme change
  // ainsi de profondeur à chaque cran — sans quoi 7 et 14 étaient identiques.
  streak_14:        { glyph: "flame",    tier: TIERS.rare,     fam: "streak" },
  streak_30:        { glyph: "crown",    tier: TIERS.rare,     fam: "streak" },
  hours_10:         { glyph: "book",     tier: TIERS.starter,  fam: "time" },
  hours_50:         { glyph: "cap",      tier: TIERS.progress, fam: "time" },
  hours_100:        { glyph: "trophy",   tier: TIERS.progress, fam: "time" },
  // Couronne réservée au sommet des séries : la réutiliser ici rendait les
  // deux badges indiscernables. Le gemme clôt l'échelle livre → toque → coupe.
  hours_250:        { glyph: "gem",      tier: TIERS.rare,     fam: "time" },
  marathon_day:     { glyph: "hourglass",tier: TIERS.progress, fam: "time" },
  planner:          { glyph: "calendar", tier: TIERS.starter,  fam: "plan" },
  strategist:       { glyph: "target",   tier: TIERS.progress, fam: "plan" },
  blocus_architect: { glyph: "columns",  tier: TIERS.rare,     fam: "plan" },
  first_exam:       { glyph: "doc",      tier: TIERS.starter,  fam: "plan" },
  first_post:       { glyph: "camera",   tier: TIERS.starter,  fam: "social" },
  influencer:       { glyph: "images",   tier: TIERS.rare,     fam: "social" },
  first_friend:     { glyph: "userPlus", tier: TIERS.starter,  fam: "social" },
  social:           { glyph: "users",    tier: TIERS.rare,     fam: "social" },
  motivator:        { glyph: "heart",    tier: TIERS.rare,     fam: "social" },
  team_spirit:      { glyph: "flag",     tier: TIERS.starter,  fam: "social" },
  community_pillar: { glyph: "globe",    tier: TIERS.rare,     fam: "social" },
  referrer:         { glyph: "share",    tier: TIERS.rare,     fam: "social" },

  // Badges de la page Statistiques (lib/statsInsights.js). Ils avaient leur
  // propre rendu — carre mint plat + icone en trait fin — qui se lisait comme
  // un champ desactive, pas comme une recompense. Meme emblemes, meme langage
  // de rarete et de famille que le profil. Les identifiants sont en camelCase
  // la-bas et en snake_case ici : aucun risque de collision.
  firstHour:        { glyph: "clock",    tier: TIERS.starter,  fam: "time" },
  earlyBird:        { glyph: "sunrise",  tier: TIERS.starter,  fam: "streak" },
  afterMidnight:    { glyph: "moon",     tier: TIERS.starter,  fam: "night" },
  streak7:          { glyph: "flame",    tier: TIERS.progress, fam: "streak" },
  session3h:        { glyph: "bolt",     tier: TIERS.progress, fam: "night" },
  marathonDay:      { glyph: "hourglass",tier: TIERS.progress, fam: "time" },
  hours50:          { glyph: "cap",      tier: TIERS.progress, fam: "time" },
  hours100:         { glyph: "trophy",   tier: TIERS.rare,     fam: "time" },
  goal10:           { glyph: "target",   tier: TIERS.rare,     fam: "plan" },
};

// Tracés sur une grille 24×24, contour uniquement — même langage que les
// icônes de navigation. Rien de rempli : à 22 px, le remplissage empâte.
const GLYPHS = {
  spark: <path d="M12 3.2 13.9 9.4 20.3 11.3 13.9 13.2 12 19.6 10.1 13.2 3.7 11.3 10.1 9.4Z" />,
  // La flamme a besoin de son décroché latéral : un contour symétrique et
  // arrondi se lit comme une goutte d'eau, pas comme du feu.
  flame: <path d="M12 2.6c.7 2.7 2.3 4.4 3.8 5.8 1.7 1.6 2.8 3.3 2.8 5.4a6.6 6.6 0 0 1-13.2 0c0-1.1.4-2.2 1.1-2.9a2.45 2.45 0 0 0 4.9 0c0-1.3-.5-2-1-2.9-1-2-.3-3.9 1.6-5.4Z" />,
  // Sans les perles sur les pointes, la silhouette se lit comme une montagne.
  crown: <>
    <path d="M3.8 9 7.5 12.4 12 6l4.5 6.4L20.2 9l-1.3 8.4H5.1Z" />
    <path d="M5.4 20.4h13.2" />
    <circle cx="3.8" cy="7.4" r="1.15" fill="currentColor" stroke="none" />
    <circle cx="12" cy="4.2" r="1.15" fill="currentColor" stroke="none" />
    <circle cx="20.2" cy="7.4" r="1.15" fill="currentColor" stroke="none" />
  </>,
  gem: <>
    <path d="M7.6 3.8h8.8l4 5.3L12 20.2 3.6 9.1Z" />
    <path d="M3.6 9.1h16.8" />
    <path d="M9.4 9.1 12 3.8l2.6 5.3M9.4 9.1 12 20.2l2.6-11.1" />
  </>,
  book: <>
    <path d="M4 5.2h5.2A2.8 2.8 0 0 1 12 8v10.8a2.4 2.4 0 0 0-2.4-2.4H4Z" />
    <path d="M20 5.2h-5.2A2.8 2.8 0 0 0 12 8v10.8a2.4 2.4 0 0 1 2.4-2.4H20Z" />
  </>,
  cap: <>
    <path d="M12 4.4 21.2 9 12 13.6 2.8 9Z" />
    <path d="M6.8 11.1v4.6c0 1.7 2.3 3 5.2 3s5.2-1.3 5.2-3v-4.6" />
  </>,
  trophy: <>
    <path d="M7.4 4.4h9.2v5.2a4.6 4.6 0 0 1-9.2 0Z" />
    <path d="M7.4 6.2H4.6v1.4a3 3 0 0 0 2.8 3M16.6 6.2h2.8v1.4a3 3 0 0 1-2.8 3" />
    <path d="M12 14.2v3.2M8.6 19.6h6.8" />
  </>,
  hourglass: <>
    <path d="M6.6 4h10.8M6.6 20h10.8" />
    <path d="M7.6 4c0 4 4.4 5.4 4.4 8s-4.4 4-4.4 8M16.4 4c0 4-4.4 5.4-4.4 8s4.4 4 4.4 8" />
  </>,
  calendar: <>
    <rect x="3.6" y="5.4" width="16.8" height="15" rx="2.6" />
    <path d="M3.6 10h16.8M8.4 3.2v4.2M15.6 3.2v4.2" />
    <path d="M8.6 14.4 11 16.8l4.4-4.4" />
  </>,
  target: <>
    <circle cx="12" cy="12" r="8.2" />
    <circle cx="12" cy="12" r="4.2" />
    <circle cx="12" cy="12" r="0.9" fill="currentColor" stroke="none" />
  </>,
  columns: <>
    <path d="M4.6 19.4V13M11.4 19.4V8.4M18.2 19.4V4.6" />
    <path d="M2.4 19.4h19.2" />
  </>,
  doc: <>
    <path d="M6 3.6h7.6L18.6 8.6v11.8H6Z" />
    <path d="M13.4 3.6v5.2h5.2" />
    <path d="M9 13h6.2M9 16.4h6.2" />
  </>,
  camera: <>
    <rect x="3.2" y="7" width="17.6" height="13.2" rx="3" />
    <circle cx="12" cy="13.6" r="3.6" />
    <path d="M8.6 7 10 4.2h4L15.4 7" />
  </>,
  images: <>
    <rect x="7.4" y="3.6" width="13" height="13" rx="2.6" />
    <path d="M16.6 20.4H6.2a2.6 2.6 0 0 1-2.6-2.6V7.4" />
    <path d="M7.4 12.6 11 9.4l5.4 4.6" />
  </>,
  userPlus: <>
    <circle cx="10" cy="8.2" r="3.8" />
    <path d="M3.4 20a6.6 6.6 0 0 1 13.2 0" />
    <path d="M18.6 6.6v5.2M21.2 9.2H16" />
  </>,
  users: <>
    <circle cx="9.2" cy="8.2" r="3.6" />
    <path d="M2.8 19.8a6.4 6.4 0 0 1 12.8 0" />
    <path d="M16 4.9a3.6 3.6 0 0 1 0 6.9M17.4 14.2a6.4 6.4 0 0 1 3.8 5.6" />
  </>,
  heart: <path d="M12 20.2 4.9 13a4.4 4.4 0 0 1 6.2-6.2l.9.9.9-.9A4.4 4.4 0 0 1 19.1 13Z" />,
  flag: <>
    <path d="M5.4 20.4V4.2" />
    <path d="M5.4 5.2h11.8l-2.4 4 2.4 4H5.4" />
  </>,
  globe: <>
    <circle cx="12" cy="12" r="8.4" />
    <path d="M3.6 12h16.8" />
    <path d="M12 3.6a13 13 0 0 1 0 16.8 13 13 0 0 1 0-16.8Z" />
  </>,
  share: <>
    <circle cx="17.6" cy="5.8" r="2.8" />
    <circle cx="6.4" cy="12" r="2.8" />
    <circle cx="17.6" cy="18.2" r="2.8" />
    <path d="M8.9 10.6 15.1 7.2M8.9 13.4l6.2 3.4" />
  </>,
  clock: <>
    <circle cx="12" cy="12" r="8.4" />
    <path d="M12 6.8V12l3.4 2" />
  </>,
  // L'eclair penche et se decroche : un chevron symetrique ne se lit pas
  // comme de l'energie.
  bolt: <path d="M13.4 2.6 4.8 13.4h5.6l-.8 8 8.6-10.8h-5.6Z" />,
  moon: <path d="M20.6 13.4A8.6 8.6 0 1 1 10.6 3.4a6.8 6.8 0 0 0 10 10Z" />,
  // Soleil coupe par l'horizon : un disque complet dirait « journee », pas
  // « avant 7 h ».
  sunrise: <>
    <path d="M6.6 15.4a5.4 5.4 0 0 1 10.8 0" />
    <path d="M2.8 15.4h2.2M19 15.4h2.2M12 4.2v2.4M6.1 6.9 7.7 8.5M17.9 6.9 16.3 8.5" />
    <path d="M3.4 19.4h17.2" />
  </>,
};
// La rareté se lit à la FINITION, la famille à la TEINTE.
//
//   starter  — fond teinté, glyphe coloré, filet discret. L'objet est posé.
//   progress — plein dégradé, glyphe blanc, liseré clair à l'intérieur.
//              L'objet est massif.
//   rare     — fond profond, glyphe lumineux, anneau de la couleur pleine et
//              halo porté. L'objet éclaire.
//
// Chaque palier ajoute un cran de contour : c'est le contour, pas la
// saturation, qui porte la hiérarchie — il reste lisible à 22 px, là où une
// nuance de fond disparaît.
function tierStyle(tier, fam) {
  const c = s => `var(--bt-fam-${fam}${s})`;
  if (tier === TIERS.rare) {
    return {
      style: {
        background: `linear-gradient(158deg, ${c("")} -35%, ${c("-deep")} 68%)`,
        color: c("-glow"),
        border: `1.5px solid ${c("")}`,
        boxShadow: `0 3px 14px -3px ${c("-ring")}`,
      },
    };
  }
  if (tier === TIERS.progress) {
    return {
      style: {
        // `-mid` et non `-ink` : -ink s'éclaircit en mode sombre (c'est un
        // ton de TEXTE sur teinte), et le dégradé passait alors menthe pâle
        // sous un glyphe blanc. -mid ne dépend pas du thème.
        background: `linear-gradient(158deg, ${c("")} 0%, ${c("-mid")} 118%)`,
        color: "#FFFFFF",
        border: "1.5px solid rgba(255,255,255,0.30)",
        boxShadow: `0 3px 12px -3px ${c("-ring")}`,
      },
    };
  }
  return {
    style: {
      background: c("-soft"),
      color: c("-ink"),
      border: `1.5px solid ${c("-ring")}`,
    },
  };
}

const LOCKED = { className: "bt-badge-locked", style: {} };

/**
 * Emblème de badge.
 * @param {string}  id      — identifiant (lib/badges.js)
 * @param {boolean} earned  — débloqué ou non
 * @param {number}  size    — côté en px (défaut 36)
 * @param {boolean} animate — brillance, pour un déblocage tout juste obtenu
 */
export default function BadgeIcon({ id, earned = false, size = 36, animate = false }) {
  const v = BADGE_VISUALS[id] || { glyph: "spark", tier: TIERS.starter, fam: "time" };
  const s = earned ? tierStyle(v.tier, v.fam || "time") : LOCKED;
  const glyphSize = Math.round(size * 0.56);

  return (
    <span
      className={`${s.className || ""}${animate && earned ? " badge-shine" : ""}`.trim()}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: size,
        height: size,
        borderRadius: Math.max(6, Math.round(size * 0.3)),
        flexShrink: 0,
        boxSizing: "border-box",
        transition: "transform 0.15s ease, box-shadow 0.15s ease",
        ...s.style,
      }}
    >
      <svg
        width={glyphSize}
        height={glyphSize}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        {GLYPHS[v.glyph] || GLYPHS.spark}
      </svg>
    </span>
  );
}
