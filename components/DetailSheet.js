import { useEffect, useRef } from "react";
import Glyph from "./Glyph";
import useExitPresence from "./useExitPresence";
import styles from "./DetailSheet.module.css";

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
export default function DetailSheet({ open, title, closeLabel, onClose, onAfterClose, children }) {
  const last = useRef(null);
  const dialogRef = useRef(null);
  const closeRef = useRef(null);
  const callbacks = useRef({ open, onClose, onAfterClose });
  callbacks.current = { open, onClose, onAfterClose };
  const wasOpen = useRef(false);
  const { present, exiting } = useExitPresence(open);
  if (open) last.current = { title, closeLabel, children };

  // Keep the native modal (and its inert background) through the existing
  // exit. Capture the node itself: its ref is already cleared on unmount.
  useEffect(() => {
    if (!present) {
      if (wasOpen.current) {
        wasOpen.current = false;
        callbacks.current.onAfterClose?.();
      }
      return undefined;
    }
    const dialog = dialogRef.current;
    const previous = document.activeElement;
    wasOpen.current = true;
    dialog.showModal();
    closeRef.current?.focus({ preventScroll: true });
    return () => {
      // Do not steal focus from a different native modal on a handoff.
      // React may already have removed the focused subtree before passive
      // cleanup, leaving body focused. Restore in that case as well.
      const ownedFocus = dialog.contains(document.activeElement) || document.activeElement === document.body;
      if (dialog.open) dialog.close();
      if (ownedFocus && previous?.isConnected) previous.focus({ preventScroll: true });
    };
  }, [present]);

  function requestClose() {
    // Repeated Escape/clicks during the exit are ignored. A consumer may
    // refuse to close while busy, so do not latch an unacknowledged request.
    if (callbacks.current.open) callbacks.current.onClose?.();
  }

  function onKeyDown(event) {
    if (event.key !== "Tab" || event.defaultPrevented || event.target.closest("dialog") !== dialogRef.current) return;
    const nodes = [...dialogRef.current.querySelectorAll(
      'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], summary, [tabindex]:not([tabindex="-1"])'
    )].filter(node => !node.disabled && node.tabIndex >= 0 && node.getClientRects().length && getComputedStyle(node).visibility !== "hidden" && !node.closest('[inert], [aria-hidden="true"]'));
    const first = nodes[0], last = nodes[nodes.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault(); last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault(); first.focus();
    }
  }

  if (!present || !last.current) return null;
  ({ title, closeLabel, children } = last.current);
  return (
    <dialog ref={dialogRef} className={styles.modal} aria-label={title} aria-modal="true"
      onKeyDown={onKeyDown}
      onCancel={event => { if (event.target === event.currentTarget) { event.preventDefault(); requestClose(); } }}
      onClick={event => { if (event.target === event.currentTarget) requestClose(); }}>
      <div className="bt-motion-backdrop fixed inset-0 z-40" aria-hidden="true" data-motion={exiting ? "exit" : "enter"} style={{ backgroundColor: "rgba(0,0,0,0.48)", backdropFilter: "blur(4px)" }} onClick={requestClose} />
      <div className="fixed z-50 bottom-0 inset-x-0 sm:inset-0 sm:flex sm:items-center sm:justify-center" onClick={requestClose}>
        <div
          className="bt-motion-panel rounded-t-[28px] sm:rounded-[24px] sm:max-w-md w-full sm:mx-4" data-motion={exiting ? "exit" : "enter"}
          style={{ backgroundColor: "var(--bt-surface)", maxHeight: "90vh", overflowY: "auto", boxShadow: "var(--bt-elev-3)" }}
          onClick={e => e.stopPropagation()}>
          <div className="flex justify-center pt-3 pb-1 sm:hidden">
            <div className="w-10 h-1 rounded-full" style={{ backgroundColor: "var(--bt-border)" }} />
          </div>
          <div className="sticky top-0 z-10 flex items-center justify-between gap-3 px-5 pb-3 pt-3 sm:pt-5"
            style={{ backgroundColor: "var(--bt-surface)" }}>
            <h3 className="bt-section-title truncate">{title}</h3>
            <button ref={closeRef} type="button" onClick={requestClose} aria-label={closeLabel}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-colors"
              style={{ color: "var(--bt-text-3)", backgroundColor: "var(--bt-subtle)" }}>
              <Glyph size={17}><path d="m17.4 6.6-10.8 10.8M6.6 6.6l10.8 10.8" /></Glyph>
            </button>
          </div>
          <div className="pb-5">{children}</div>
        </div>
      </div>
    </dialog>
  );
}
