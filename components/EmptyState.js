// Petit set d'illustrations "trait unique" pour les états vides + un wrapper
// réutilisable. Cohérent avec le langage d'icônes déjà utilisé partout dans
// l'app (stroke fin, coins arrondis). La couleur vient de currentColor =
// var(--bt-accent) posée par le wrapper → dark-mode safe, aucune nouvelle
// couleur. Les aplats utilisent currentColor à faible opacité (lisibles clair
// + sombre).

import MascotCoach from "./MascotCoach";

const S = { fill: "none", stroke: "currentColor", strokeWidth: 2.4, strokeLinecap: "round", strokeLinejoin: "round" };
const DOT = { fill: "currentColor", stroke: "none" };
const TINT = { fill: "currentColor", stroke: "none", opacity: 0.1 };

// Chaque illustration est dessinée dans un viewBox 0 0 96 96, contenu ~centré.
export const emptyIllustrations = {
  // Salon / conversations : deux bulles de discussion.
  messages: (
    <svg viewBox="0 0 96 96" width="100%" height="100%" aria-hidden="true">
      <path {...TINT} d="M20 28h34a8 8 0 0 1 8 8v12a8 8 0 0 1-8 8H36l-10 8v-8h-6a8 8 0 0 1-8-8V36a8 8 0 0 1 8-8z" />
      <path {...S} d="M20 28h34a8 8 0 0 1 8 8v12a8 8 0 0 1-8 8H36l-10 8v-8h-6a8 8 0 0 1-8-8V36a8 8 0 0 1 8-8z" />
      <path {...S} d="M62 40h8a8 8 0 0 1 8 8v10a8 8 0 0 1-8 8v7l-8-7h-8" opacity="0.55" />
      <circle cx="30" cy="42" r="1.9" {...DOT} />
      <circle cx="37" cy="42" r="1.9" {...DOT} />
      <circle cx="44" cy="42" r="1.9" {...DOT} />
    </svg>
  ),
  // Amis / social : deux silhouettes.
  friends: (
    <svg viewBox="0 0 96 96" width="100%" height="100%" aria-hidden="true">
      <circle cx="37" cy="34" r="11" {...TINT} />
      <circle cx="37" cy="34" r="11" {...S} />
      <path {...S} d="M18 68a19 19 0 0 1 38 0" />
      <circle cx="63" cy="38" r="9" {...S} opacity="0.55" />
      <path {...S} d="M60 66a16 16 0 0 1 20-3" opacity="0.55" />
    </svg>
  ),
  // Classement : podium 2-1-3 + étincelle sur la marche haute.
  leaderboard: (
    <svg viewBox="0 0 96 96" width="100%" height="100%" aria-hidden="true">
      <rect x="39" y="40" width="20" height="36" rx="3" {...TINT} />
      <rect x="39" y="40" width="20" height="36" rx="3" {...S} />
      <rect x="17" y="52" width="20" height="24" rx="3" {...S} opacity="0.7" />
      <rect x="61" y="58" width="20" height="18" rx="3" {...S} opacity="0.7" />
      <path {...S} d="M49 20l2.4 6.2 6.6.4-5.1 4.2 1.7 6.4L49 34l-5.6 3.6 1.7-6.4-5.1-4.2 6.6-.4z" />
    </svg>
  ),
  // Feed : cadre photo avec soleil + montagnes.
  feed: (
    <svg viewBox="0 0 96 96" width="100%" height="100%" aria-hidden="true">
      <rect x="18" y="26" width="60" height="44" rx="10" {...TINT} />
      <rect x="18" y="26" width="60" height="44" rx="10" {...S} />
      <circle cx="34" cy="40" r="4.5" {...S} />
      <path {...S} d="M24 68l16-15 9 8 8-9 17 16" />
    </svg>
  ),
  // Questions : bulle avec un point d'interrogation.
  questions: (
    <svg viewBox="0 0 96 96" width="100%" height="100%" aria-hidden="true">
      <path {...TINT} d="M22 26h44a9 9 0 0 1 9 9v18a9 9 0 0 1-9 9H44l-13 10v-10h-9a9 9 0 0 1-9-9V35a9 9 0 0 1 9-9z" />
      <path {...S} d="M22 26h44a9 9 0 0 1 9 9v18a9 9 0 0 1-9 9H44l-13 10v-10h-9a9 9 0 0 1-9-9V35a9 9 0 0 1 9-9z" />
      <path {...S} d="M40 40a8 8 0 1 1 10.5 7.6c-1.9.7-2.5 1.9-2.5 3.6" />
      <circle cx="48" cy="57" r="1.9" {...DOT} />
    </svg>
  ),
  // Ressources : document avec coin plié + lignes de texte.
  resources: (
    <svg viewBox="0 0 96 96" width="100%" height="100%" aria-hidden="true">
      <path {...TINT} d="M30 16h22l18 18v42a4 4 0 0 1-4 4H30a4 4 0 0 1-4-4V20a4 4 0 0 1 4-4z" />
      <path {...S} d="M30 16h22l18 18v42a4 4 0 0 1-4 4H30a4 4 0 0 1-4-4V20a4 4 0 0 1 4-4z" />
      <path {...S} d="M52 16v18h18" />
      <path {...S} d="M35 48h26M35 57h26M35 66h17" />
    </svg>
  ),
  // Examens : calendrier avec une coche.
  exams: (
    <svg viewBox="0 0 96 96" width="100%" height="100%" aria-hidden="true">
      <rect x="18" y="24" width="60" height="52" rx="9" {...TINT} />
      <rect x="18" y="24" width="60" height="52" rx="9" {...S} />
      <path {...S} d="M18 40h60" />
      <path {...S} d="M33 18v10M63 18v10" />
      <path {...S} d="M39 57l6 6 12-13" />
    </svg>
  ),
  // Fallback générique : étincelle.
  generic: (
    <svg viewBox="0 0 96 96" width="100%" height="100%" aria-hidden="true">
      <path {...TINT} d="M48 20l4.5 16.5L69 41l-16.5 4.5L48 62l-4.5-16.5L27 41l16.5-4.5z" />
      <path {...S} d="M48 20l4.5 16.5L69 41l-16.5 4.5L48 62l-4.5-16.5L27 41l16.5-4.5z" />
      <path {...S} d="M70 60l1.8 5.2L77 67l-5.2 1.8L70 74l-1.8-5.2L63 67l5.2-1.8z" opacity="0.6" />
    </svg>
  ),
};

/**
 * État vide réutilisable : illustration verte + titre + sous-titre + action
 * optionnelle. Pour les cas sur mesure (avec CTA/suggestions), importer plutôt
 * `emptyIllustrations` directement.
 */
export default function EmptyState({
  illustration = "generic",
  title,
  subtitle,
  action,
  size = 88,
  className = "",
  coachMessage,
  coachId,
  streak = 0,
}) {
  return (
    <div className={`flex flex-col items-center justify-center text-center py-12 px-6 ${className}`}>
      {coachMessage ? (
        <MascotCoach
          id={coachId || `empty-${illustration}`}
          message={coachMessage}
          streak={streak}
          persistence="session"
          className="mb-4 w-full max-w-sm"
        />
      ) : (
        <div style={{ width: size, height: size, color: "var(--bt-accent)" }} className="mb-4">
          {emptyIllustrations[illustration] || emptyIllustrations.generic}
        </div>
      )}
      {title && <p className="text-sm font-semibold mb-1" style={{ color: "var(--bt-text-2)" }}>{title}</p>}
      {subtitle && <p className="text-xs max-w-xs mx-auto leading-relaxed" style={{ color: "var(--bt-text-3)" }}>{subtitle}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
