// Écran de chargement de marque — wordmark "blocus·tracker" + une rangée de
// Blocus Blocks (la signature du chrono) qui se remplissent en vague, et une
// phrase courte. Remplace les "Chargement…" nus.
//
// Variantes :
//   fullScreen → gate global (auth) : pleine hauteur sur le fond de l'app ;
//   défaut     → bloc de page (ex. cockpit admin pendant le chargement) ;
//   compact    → états internes (cartes, modales, pagination) : blocs + texte.
//
// Tokens uniquement (fond --bt-bg, textes --bt-text-*) → dark mode gratuit.
// Une seule animation (les blocs, keyframes bt-load-fill dans globals.css),
// coupée par prefers-reduced-motion (rendu statique : premiers blocs remplis).

import { useI18n } from "../contexts/I18nContext";

function Blocks({ small = false }) {
  return (
    <div className="flex items-center justify-center gap-[5px]" aria-hidden="true">
      {Array.from({ length: 5 }, (_, i) => (
        <span
          key={i}
          className="bt-load-block"
          style={{
            width: small ? 16 : 24,
            height: small ? 7 : 10,
            borderRadius: 4,
            animationDelay: `${i * 0.16}s`,
          }}
        />
      ))}
    </div>
  );
}

export default function LoadingScreen({ message, fullScreen = false, compact = false }) {
  const { t } = useI18n();
  const msg = message || t("loading.preparing");

  if (compact) {
    return (
      <div role="status" aria-live="polite" className="flex flex-col items-center justify-center gap-3 py-8">
        <Blocks small />
        <p className="text-xs" style={{ color: "var(--bt-text-3)" }}>{msg}</p>
      </div>
    );
  }

  return (
    <div
      role="status"
      aria-live="polite"
      className={`flex items-center justify-center ${fullScreen ? "min-h-[100dvh]" : "min-h-[55vh]"}`}
      style={fullScreen ? { backgroundColor: "var(--bt-bg)" } : undefined}
    >
      <div className="bt-rise flex flex-col items-center gap-5 px-6 text-center">
        <p className="font-display text-2xl font-bold tracking-tight" style={{ color: "var(--bt-text-1)" }}>
          blocus<span style={{ color: "#14B885" }}>·</span>tracker
        </p>
        <Blocks />
        <p className="text-sm" style={{ color: "var(--bt-text-3)" }}>{msg}</p>
      </div>
    </div>
  );
}
