import { useEffect, useRef, useState } from "react";
import Glyph from "./Glyph";

// Native modal behavior supplies focus containment, inert background and Escape.
// `subheader` (optionnel) : une ligne d'actions qui reste collée sous le titre.
export default function InboxSheet({ open, title, closeLabel, onClose, onAfterClose, className = "", subheader = null, children }) {
  const ref = useRef(null);
  const closeTimer = useRef(null);
  const previousFocus = useRef(null);
  const previousOverflow = useRef("");
  const afterClose = useRef(onAfterClose);
  afterClose.current = onAfterClose;
  const [keepContent, setKeepContent] = useState(open);
  useEffect(() => {
    const dialog = ref.current;
    window.clearTimeout(closeTimer.current);
    const finishClose = () => {
      if (!dialog.open) return;
      dialog.close();
      document.body.style.overflow = previousOverflow.current;
      setKeepContent(false);
      if (previousFocus.current?.isConnected) previousFocus.current.focus();
      afterClose.current?.();
    };
    if (open) {
      setKeepContent(true);
      if (!dialog.open) {
        previousFocus.current = document.activeElement;
        previousOverflow.current = document.body.style.overflow;
        dialog.showModal();
        document.body.style.overflow = "hidden";
      }
      dialog.dataset.motion = "enter";
    } else if (dialog.open) {
      dialog.dataset.motion = "exit";
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) finishClose();
      else closeTimer.current = window.setTimeout(finishClose, 150);
    }
    return () => window.clearTimeout(closeTimer.current);
  }, [open]);
  useEffect(() => () => {
    window.clearTimeout(closeTimer.current);
    if (ref.current?.open) {
      ref.current.close();
      document.body.style.overflow = previousOverflow.current;
      if (previousFocus.current?.isConnected) previousFocus.current.focus();
    }
  }, []);
  return <dialog ref={ref} className={`bt-inbox-sheet ${className}`} aria-label={title}
    onCancel={event => { event.preventDefault(); onClose(); }}
    onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="bt-inbox-sheet-body">
      <header className="sticky top-0 z-10 px-4 py-3" style={{ background: "var(--bt-surface)" }}>
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-bold">{title}</h2>
          <button className="bt-feed-icon-btn" aria-label={closeLabel} onClick={onClose}><Glyph size={18}><path d="m6 6 12 12M6 18 18 6" /></Glyph></button>
        </div>
        {subheader}
      </header>
      {keepContent && children}
    </div>
  </dialog>;
}
