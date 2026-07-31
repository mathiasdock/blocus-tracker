// Illustration du menu Partager d'iOS, avec « Sur l'écran d'accueil » mis en
// évidence — la ligne que les gens ne trouvent pas.
//
// Pourquoi une illustration et pas une capture d'écran :
//   • elle est TRADUITE (un iPhone en français affiche « Sur l'écran d'accueil »,
//     pas « Add to Home Screen » — une capture anglaise perdrait les francophones,
//     qui sont le public de l'app) ;
//   • elle pèse ~2 Ko au lieu de plusieurs centaines, et reste nette sur tous
//     les écrans (pas de flou sur les écrans à haute densité) ;
//   • elle suit le thème clair/sombre via les tokens ;
//   • elle ne montre pas les applications personnelles présentes dans une vraie
//     capture (Pinterest, Amazon…), qui sont du bruit.
//
// Pour remplacer par une vraie capture : déposer le fichier dans `public/` et
// échanger ce composant par une <img> — le reste de la mise en page ne bouge pas.

import { useI18n } from "../contexts/I18nContext";

export default function PwaHomeScreenVisual() {
  const { t } = useI18n();

  return (
    <div
      className="rounded-2xl overflow-hidden select-none"
      style={{ backgroundColor: "var(--bt-subtle)", border: "1px solid var(--bt-border)" }}
      role="img"
      aria-label={t("pwa.visualAlt")}
    >
      {/* Barre de titre : le site en cours de partage */}
      <div className="flex items-center gap-2.5 px-3 py-2.5"
        style={{ borderBottom: "1px solid var(--bt-border)" }}>
        <span className="w-7 h-7 rounded-lg shrink-0 flex items-center justify-center"
          style={{ backgroundColor: "#14B885" }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#fff"
            strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="12" cy="13" r="8" /><path d="M12 9v4l2.5 2" /><path d="M9 2h6" />
          </svg>
        </span>
        <span className="text-[11px] font-semibold truncate" style={{ color: "var(--bt-text-2)" }}>
          blocus-tracker.com
        </span>
      </div>

      {/* Quelques lignes grisées : le contexte du menu, volontairement illisible */}
      <div className="px-3 pt-2.5 space-y-2" aria-hidden="true">
        {[62, 48].map((w, i) => (
          <div key={i} className="flex items-center gap-2.5">
            <span className="w-4 h-4 rounded shrink-0" style={{ backgroundColor: "var(--bt-border)" }} />
            <span className="h-2 rounded-full" style={{ width: `${w}%`, backgroundColor: "var(--bt-border)" }} />
          </div>
        ))}
      </div>

      {/* LA ligne qui compte — encadrée en vert de marque */}
      <div className="mx-2 my-2.5 rounded-xl px-2.5 py-2.5 flex items-center gap-2.5"
        style={{ backgroundColor: "var(--bt-accent-bg)", border: "2px solid #14B885" }}>
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#0E8F68"
          strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0" aria-hidden="true">
          <rect x="3" y="3" width="18" height="18" rx="3" />
          <line x1="12" y1="8" x2="12" y2="16" /><line x1="8" y1="12" x2="16" y2="12" />
        </svg>
        <span className="text-[12px] font-bold leading-tight" style={{ color: "#0E8F68" }}>
          {t("pwa.visualRow")}
        </span>
      </div>

      <div className="px-3 pb-2.5 space-y-2" aria-hidden="true">
        <div className="flex items-center gap-2.5">
          <span className="w-4 h-4 rounded shrink-0" style={{ backgroundColor: "var(--bt-border)" }} />
          <span className="h-2 rounded-full" style={{ width: "40%", backgroundColor: "var(--bt-border)" }} />
        </div>
      </div>
    </div>
  );
}
