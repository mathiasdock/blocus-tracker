import { memo, useId } from "react";

// Emblème de série — le premier objet visuel propre à Blocus Tracker.
//
// La série est le cœur motivationnel de l'app et elle s'affichait partout en
// pastille de 13 px : le chiffre le plus chargé de sens était le plus petit
// élément de l'écran. Ici il devient un vrai objet, assez grand pour déborder
// de sa carte.
//
// Ce n'est pas une décoration : la flamme accompagne le chiffre, elle ne le
// remplace pas — le nombre reste du texte, lisible et sélectionnable, et
// l'emblème est `aria-hidden`.
//
// Silhouette reprise de components/Flame (même tracé que la mascotte) : un
// deuxième dessin de flamme dans la même app aurait fait deux marques.
const FLAME_D =
  "M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z";

/**
 * @param {number}  days   série en cours — 0 rend un état DORMANT, pas une
 *                         flamme éteinte : on ne célèbre pas zéro.
 * @param {number}  size   côté en px
 */
function StreakEmblem({ days = 0, size = 128, className = "" }) {
  const uid = useId().replace(/:/g, "");
  const alive = days > 0;

  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 100 100"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        {/* Dégradé chaud : l'ambre est la couleur des séries et des
            récompenses dans le système, jamais celle d'une action. */}
        <linearGradient id={`bt-se-g-${uid}`} x1="0" y1="1" x2="0.35" y2="0">
          <stop offset="0%" stopColor="#D97706" />
          <stop offset="45%" stopColor="#F59E0B" />
          <stop offset="100%" stopColor="#FCD34D" />
        </linearGradient>
        {/* Halo : c'est lui qui donne la profondeur, pas une ombre portée —
            une flamme éclaire, elle ne projette pas. */}
        <radialGradient id={`bt-se-h-${uid}`} cx="50%" cy="58%" r="50%">
          <stop offset="0%" stopColor="#F59E0B" stopOpacity="0.34" />
          <stop offset="55%" stopColor="#F59E0B" stopOpacity="0.10" />
          <stop offset="100%" stopColor="#F59E0B" stopOpacity="0" />
        </radialGradient>
      </defs>

      {alive && <circle cx="50" cy="52" r="48" fill={`url(#bt-se-h-${uid})`} />}

      {/* Deux flammes superposées : une large en retrait qui fait le corps,
          une plus petite et plus claire qui fait le cœur. Une seule forme
          aplatie aurait donné un pictogramme, pas un objet. */}
      <g transform="translate(50 52) scale(3.05) translate(-12 -12)">
        <path
          className="bt-flame-body"
          d={FLAME_D}
          fill={alive ? `url(#bt-se-g-${uid})` : "var(--bt-text-4)"}
          opacity={alive ? 1 : 0.34}
        />
      </g>
      <g transform="translate(50 58) scale(1.72) translate(-12 -12)">
        <path
          className="bt-flame-body"
          d={FLAME_D}
          fill={alive ? "#FEF3C7" : "var(--bt-text-4)"}
          opacity={alive ? 0.75 : 0.18}
        />
      </g>
    </svg>
  );
}

export default memo(StreakEmblem);
