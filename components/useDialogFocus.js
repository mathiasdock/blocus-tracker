import { useEffect, useRef } from "react";

const FOCUSABLE_SELECTOR =
  "button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex='-1'])";

/**
 * Comportement clavier d'une boîte de dialogue : Échap ferme, le focus entre
 * dedans à l'ouverture, Tab y tourne en boucle, et il revient à l'élément qui
 * l'a ouverte à la fermeture. La page derrière ne défile plus.
 *
 * Sans ça, une modale s'ouvre et le focus reste DERRIÈRE elle : au clavier on
 * continue de parcourir la page masquée, et à la fermeture on se retrouve en
 * haut du document au lieu du bouton qu'on venait d'actionner.
 *
 * Extrait du comportement déjà écrit dans `CourseChecklistModal`, qui garde
 * pour l'instant sa copie — la faire basculer touche le Planning et le Chrono,
 * ce qui n'est pas le périmètre de cette passe.
 *
 * @param {boolean} open
 * @param {() => void} onClose
 * @returns {import('react').RefObject<HTMLElement>} ref à poser sur le dialogue
 */
export default function useDialogFocus(open, onClose) {
  const dialogRef = useRef(null);
  const openerRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    openerRef.current = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialogRef.current?.focus({ preventScroll: true });

    function onKeyDown(event) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab" || !dialogRef.current) return;
      const focusable = Array.from(dialogRef.current.querySelectorAll(FOCUSABLE_SELECTOR));
      if (!focusable.length) {
        event.preventDefault();
        dialogRef.current.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      const focusIsOutside = !dialogRef.current.contains(active);
      if (event.shiftKey && (active === first || active === dialogRef.current || focusIsOutside)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (active === last || active === dialogRef.current || focusIsOutside)) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      openerRef.current?.focus?.({ preventScroll: true });
    };
  }, [open, onClose]);

  return dialogRef;
}
