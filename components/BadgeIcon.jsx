import { useId } from "react";
import { HUES, artFor, rarityOf } from "../lib/badgeArt";
import styles from "./BadgeVisuals.module.css";

// Rendu d'un badge.
//
// Ce fichier ne sait RIEN de ce que récompense un badge : il reçoit un
// identifiant, un état, une taille, et compose. Le dessin vit dans
// lib/badgeArt.js, la donnée dans lib/badges.js. Ajouter une récompense plus
// tard, c'est ajouter une entrée de données et — seulement si l'objet
// n'existe pas déjà — un dessin. Jamais toucher ici.
//
// Le matériau est appliqué une fois pour tout le monde, ce qui garantit que
// les trente badges se ressemblent sans être identiques :
//   • dégradé lumière→ombre sur le corps de chaque objet,
//   • éclat blanc et occlusion là où le dessin les demande,
//   • ombre portée courte sous l'objet entier, pour le décoller de la carte.
//
// Locked keeps the same geometry and tier finish, in three neutral material
// tones, not an almost-transparent silhouette. A small unframed lock is
// visible from 34 px; the parent also exposes the state in its text/label.

const LOCK_MIN_SIZE = 34;

function paintOf(part, uid, earned) {
  const hue = HUES[part.c] || HUES.gold;
  if (!earned) {
    if (part.tone === "grad") return `url(#${uid}-locked)`;
    return `var(--badge-muted-${["deep", "shade"].includes(part.tone) ? "deep" : ["light", "spec"].includes(part.tone) ? "light" : "mid"})`;
  }
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

function Part({ p, uid, earned }) {
  const paint = paintOf(p, uid, earned);
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

// A finish is part of the collectible, never a coloured tile or a glow.
// The open mounting leaves the object's silhouette in charge. Details are
// omitted at tiny metadata sizes, where only the motif remains readable.
function Finish({ rarity, earned }) {
  if (rarity === "discovery") return null;
  const metal = earned ? (rarity === "common" || rarity === "rare" ? "var(--badge-mount)" : "var(--badge-gilt)") : "var(--badge-muted-deep)";
  return <g data-badge-finish={rarity} fill="none" stroke={metal} strokeLinecap="round" strokeLinejoin="round">
    {rarity === "common" ? <path d="M27 57h10" strokeWidth="1.5" /> : <>
      <path d="M12 48c3 7 10 11 20 11s17-4 20-11" strokeWidth="1.5" />
      {rarity !== "rare" && <>
        <path d="M11 46 8 39M14 51l-7-3M19 55l-7 1M53 46l3-7M50 51l7-3M45 55l7 1" strokeWidth="2.4" />
      </>}
      {rarity === "legendary" && <>
        <path d="M9 40c-3-7-3-15 0-22M55 40c3-7 3-15 0-22M7 32l-3-5M7 25l4-5M57 32l3-5M57 25l-4-5" strokeWidth="1.6" />
        <path d="m32 57 3 3-3 3-3-3Z" fill={metal} stroke="none" />
      </>}
    </>}
  </g>;
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
  const rarity = rarityOf(id);
  const compact = size < LOCK_MIN_SIZE;

  // Un dégradé par teinte réellement utilisée en corps d'objet — pas un par
  // pièce : plusieurs pièces d'une même teinte partagent le même éclairage,
  // c'est ce qui les fait appartenir au même objet.
  const gradientHues = [...new Set(parts.filter(p => p.tone === "grad").map(p => p.c))];
  const showLock = !earned && size >= LOCK_MIN_SIZE;
  return (
    <span
      className={`${styles.icon}${animate && earned ? " badge-shine" : ""}`}
      data-badge-id={id} data-rarity={rarity} data-earned={earned}
      style={{ width: size, height: size,
        "--badge-mount-light": HUES.steel.deep, "--badge-mount-dark": HUES.steel.mid,
        "--badge-gilt-light": HUES.gold.deep, "--badge-gilt-dark": HUES.gold.mid,
      }}
    >
      <svg
        width={size} height={size} viewBox={compact ? "0 0 48 48" : "0 0 64 64"}
        aria-hidden="true" focusable="false" className={styles.object}
      >
          <defs>
            {earned ? gradientHues.map(h => (
              <linearGradient key={h} id={`${uid}-${h}`} x1="0.1" y1="0" x2="0.72" y2="1">
                <stop offset="0%" stopColor={HUES[h].light} />
                <stop offset="65%" stopColor={HUES[h].mid} />
                <stop offset="100%" stopColor={HUES[h].deep} />
              </linearGradient>
            )) : <linearGradient id={`${uid}-locked`} x1="0" y1="0" x2="0.7" y2="1">
              <stop offset="0%" stopColor="var(--badge-muted-light)" />
              <stop offset="65%" stopColor="var(--badge-muted-mid)" />
              <stop offset="100%" stopColor="var(--badge-muted-deep)" />
            </linearGradient>}
          </defs>
        <g transform={compact ? undefined : "translate(8 5)"}>
          {parts.map((p, i) => <Part key={i} p={p} uid={uid} earned={earned} />)}
        </g>
        {!compact && <Finish rarity={rarity} earned={earned} />}
      </svg>

      {showLock && (
        <span aria-hidden="true" className={styles.lock}>
          <svg width={Math.max(12, Math.round(size * 0.15))} height={Math.max(12, Math.round(size * 0.15))} viewBox="0 0 24 24"
            fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
            <rect x="5" y="10.5" width="14" height="9.5" rx="2.4" />
            <path d="M8.6 10.5V7.8a3.4 3.4 0 0 1 6.8 0v2.7" />
          </svg>
        </span>
      )}
    </span>
  );
}
