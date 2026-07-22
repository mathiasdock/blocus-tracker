// Flamme de série — une seule flamme vivante, TOUJOURS en mouvement, partagée
// partout où la série apparait (stats, classement, landing, celebration).
//
// Monochrome `currentColor` par defaut : elle herite la couleur de son contexte
// (blanche sur une puce ambre, ambre en ligne dans le classement, attenuee dans
// une ligne d'insight) → aucun souci de contraste, on ne change QUE le mouvement.
// Pour les emplacements ex-emoji (landing, celebration), passer une couleur
// chaude via `style={{ color: "#F59E0B" }}`.
//
// Le vacillement continu (.bt-flame-body → bt-flame-flick) reprend le langage de
// la flamme de la mascotte (bt-m-flick). Statique sous prefers-reduced-motion.

import { memo } from "react";

// Path de flamme classique, deja utilise dans l'app (identique a la mascotte).
const FLAME_D =
  "M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z";

function Flame({ size = 16, className = "", style, title }) {
  return (
    <svg
      className={`bt-flame ${className}`}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      role={title ? "img" : undefined}
      aria-label={title || undefined}
      aria-hidden={title ? undefined : true}
      style={style}
    >
      <path className="bt-flame-body" d={FLAME_D} fill="currentColor" />
    </svg>
  );
}

export default memo(Flame);
