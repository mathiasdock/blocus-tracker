import { useId } from "react";
import { HUES, artFor, rarityOf, dominantHue, rgba } from "../lib/badgeArt";

// Rendu d'un badge.
//
// Ce fichier ne sait RIEN de ce que récompense un badge : il reçoit un
// identifiant, un état, une taille, et compose. Le dessin vit dans
// lib/badgeArt.js, la donnée dans lib/badges.js. Ajouter une récompense plus
// tard, c'est ajouter une entrée de données et — seulement si l'objet
// n'existe pas déjà — un dessin. Jamais toucher ici.
//
// Le matériau est appliqué une fois pour tout le monde, ce qui garantit que
// les trente et un badges se ressemblent sans être identiques :
//   • dégradé lumière→ombre sur le corps de chaque objet,
//   • éclat blanc et occlusion là où le dessin les demande,
//   • ombre portée courte sous l'objet entier, pour le décoller de la carte.
//
// Verrouillé ≠ autre icône. C'est le MÊME objet, désaturé et adouci : on doit
// reconnaître ce qu'on va gagner avant de l'avoir gagné. Une petite pastille
// de cadenas lève l'ambiguïté à partir de 34 px — en dessous elle ferait une
// tache, et la désaturation suffit.

const LOCK_MIN_SIZE = 34;

// Halo de rareté. Il est DERRIÈRE l'objet et ne le teinte pas : la rareté ne
// doit pas modifier le dessin, sinon on retombe sur « difficile = plus
// sombre », exactement ce qu'on vient d'enlever.
// Les deux paliers du bas n'ont AUCUN halo : si tout brille, plus rien ne
// brille. Le halo commence à « rare » et se voit surtout par contraste avec
// les badges voisins qui n'en ont pas.
const GLOW = { discovery: 0, common: 0, rare: 0.22, epic: 0.42, legendary: 0.58 };

function paintOf(part, uid) {
  const hue = HUES[part.c] || HUES.gold;
  if (part.tone === "spec") return "#FFFFFF";
  if (part.tone === "shade") return "#000000";
  if (part.tone === "grad") return `url(#${uid}-${part.c})`;
  return hue[part.tone] || hue.mid;
}

function opacityOf(part) {
  if (part.o != null) return part.o;
  if (part.tone === "spec") return 0.5;
  if (part.tone === "shade") return 0.14;
  return 1;
}

function Part({ p, uid }) {
  const paint = paintOf(p, uid);
  const opacity = opacityOf(p);
  if (p.t === "stroke") {
    return (
      <path d={p.d} fill="none" stroke={paint} strokeWidth={p.sw || 2.4}
        strokeLinecap="round" strokeLinejoin="round" opacity={opacity} />
    );
  }
  const common = { fill: paint, opacity };
  if (p.t === "circle")  return <circle cx={p.cx} cy={p.cy} r={p.r} {...common} />;
  if (p.t === "ellipse") return <ellipse cx={p.cx} cy={p.cy} rx={p.rx} ry={p.ry} {...common} />;
  if (p.t === "rect")    return <rect x={p.x} y={p.y} width={p.w} height={p.h} rx={p.rx} {...common} />;
  if (p.t === "poly")    return <polygon points={p.points} {...common} />;
  return <path d={p.d} {...common} />;
}

/**
 * Emblème de badge.
 * @param {string}  id      — identifiant (lib/badges.js ou lib/statsInsights.js)
 * @param {boolean} earned  — débloqué ou non
 * @param {number}  size    — côté en px (défaut 48)
 * @param {boolean} animate — brillance, pour un déblocage tout juste obtenu
 */
export default function BadgeIcon({ id, earned = false, size = 48, animate = false }) {
  const uid = useId().replace(/:/g, "");
  const parts = artFor(id);
  const glow = earned ? (GLOW[rarityOf(id)] ?? 0) : 0;
  const hue = HUES[dominantHue(id)].mid;

  // Un dégradé par teinte réellement utilisée en corps d'objet — pas un par
  // pièce : plusieurs pièces d'une même teinte partagent le même éclairage,
  // c'est ce qui les fait appartenir au même objet.
  const gradientHues = [...new Set(parts.filter(p => p.tone === "grad").map(p => p.c))];
  const showLock = !earned && size >= LOCK_MIN_SIZE;
  const lockR = Math.round(size * 0.17);

  return (
    <span
      className={animate && earned ? "badge-shine" : undefined}
      style={{ position: "relative", display: "inline-flex", width: size, height: size, flexShrink: 0 }}
    >
      {glow > 0 && (
        <span aria-hidden="true" style={{
          position: "absolute", inset: "-14%", borderRadius: "50%", pointerEvents: "none",
          background: `radial-gradient(circle at 50% 46%, ${rgba(hue, glow)} 0%, ${rgba(hue, 0)} 68%)`,
        }} />
      )}

      <svg
        width={size} height={size} viewBox="0 0 48 48"
        aria-hidden="true"
        // Acquis : ombre portée courte, l'objet est posé sur la carte.
        // Verrouillé : le même objet, vidé de sa couleur et de sa présence.
        // Les deux filtres vivent dans globals.css — ils dépendent du fond.
        className={`bt-badge-art${earned ? "" : " bt-badge-art--locked"}`}
        style={{ position: "relative", display: "block" }}
      >
        {gradientHues.length > 0 && (
          <defs>
            {gradientHues.map(h => (
              <linearGradient key={h} id={`${uid}-${h}`} x1="0.1" y1="0" x2="0.72" y2="1">
                <stop offset="0%" stopColor={HUES[h].light} />
                <stop offset="52%" stopColor={HUES[h].mid} />
                <stop offset="100%" stopColor={HUES[h].deep} />
              </linearGradient>
            ))}
          </defs>
        )}
        {parts.map((p, i) => <Part key={i} p={p} uid={uid} />)}
      </svg>

      {showLock && (
        <span aria-hidden="true" style={{
          position: "absolute",
          right: `-${Math.round(size * 0.04)}px`,
          bottom: `-${Math.round(size * 0.04)}px`,
          width: lockR * 2, height: lockR * 2, borderRadius: "50%",
          display: "flex", alignItems: "center", justifyContent: "center",
          backgroundColor: "var(--bt-subtle)",
          boxShadow: "inset 0 0 0 1px var(--bt-border)",
          color: "var(--bt-text-3)",
        }}>
          <svg width={Math.round(lockR * 1.15)} height={Math.round(lockR * 1.15)} viewBox="0 0 24 24"
            fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
            <rect x="5" y="10.5" width="14" height="9.5" rx="2.4" />
            <path d="M8.6 10.5V7.8a3.4 3.4 0 0 1 6.8 0v2.7" />
          </svg>
        </span>
      )}
    </span>
  );
}
