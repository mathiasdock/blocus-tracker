import { useEffect } from "react";
import Glyph from "./Glyph";

// Feuille de détail — poignée et bord bas sur téléphone, carte centrée au-delà.
//
// C'est elle qui permet à une page de ne plus tout déballer d'un coup SANS
// rien enterrer : une rangée, un titre, le contenu entier, rien de tronqué.
// L'en-tête reste collé en haut — sur une longue liste, on doit pouvoir
// refermer sans remonter.
//
// Sortie de pages/profile.js le jour où le chrono en a eu besoin lui aussi.
// Recopier ce composant aurait donné deux feuilles qui divergent au premier
// ajustement de rayon ou de hauteur maximale — l'app a déjà payé ce prix avec
// trois composants d'icônes recopiés à la main.
export default function DetailSheet({ open, title, closeLabel, onClose, children }) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <>
      <div className="fixed inset-0 z-40" style={{ backgroundColor: "rgba(0,0,0,0.48)", backdropFilter: "blur(4px)" }} onClick={onClose} />
      <div className="fixed z-50 bottom-0 inset-x-0 sm:inset-0 sm:flex sm:items-center sm:justify-center" onClick={onClose}>
        <div role="dialog" aria-modal="true" aria-label={title}
          className="rounded-t-[28px] sm:rounded-[24px] sm:max-w-md w-full sm:mx-4"
          style={{ backgroundColor: "var(--bt-surface)", maxHeight: "90vh", overflowY: "auto", boxShadow: "var(--bt-elev-3)" }}
          onClick={e => e.stopPropagation()}>
          <div className="flex justify-center pt-3 pb-1 sm:hidden">
            <div className="w-10 h-1 rounded-full" style={{ backgroundColor: "var(--bt-border)" }} />
          </div>
          <div className="sticky top-0 z-10 flex items-center justify-between gap-3 px-5 pb-3 pt-3 sm:pt-5"
            style={{ backgroundColor: "var(--bt-surface)" }}>
            <h3 className="bt-section-title truncate">{title}</h3>
            <button onClick={onClose} aria-label={closeLabel}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-colors"
              style={{ color: "var(--bt-text-3)", backgroundColor: "var(--bt-subtle)" }}>
              <Glyph size={17}><path d="m17.4 6.6-10.8 10.8M6.6 6.6l10.8 10.8" /></Glyph>
            </button>
          </div>
          <div className="pb-5">{children}</div>
        </div>
      </div>
    </>
  );
}
