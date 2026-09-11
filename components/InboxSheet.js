import { useEffect, useRef } from "react";
import Glyph from "./Glyph";

// Native modal behavior supplies focus containment, inert background and Escape.
export default function InboxSheet({ open, title, closeLabel, onClose, children }) {
  const ref = useRef(null);
  useEffect(() => {
    const dialog = ref.current;
    if (!open) { if (dialog.open) dialog.close(); return undefined; }
    const previousFocus = document.activeElement;
    const overflow = document.body.style.overflow;
    dialog.showModal();
    document.body.style.overflow = "hidden";
    return () => {
      dialog.close();
      document.body.style.overflow = overflow;
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, [open]);
  return <dialog ref={ref} className="bt-inbox-sheet" aria-label={title}
    onCancel={event => { event.preventDefault(); onClose(); }}
    onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="bt-inbox-sheet-body">
      <header className="sticky top-0 z-10 flex items-center justify-between gap-3 px-4 py-3" style={{ background: "var(--bt-surface)" }}>
        <h2 className="text-lg font-bold">{title}</h2>
        <button className="bt-feed-icon-btn" aria-label={closeLabel} onClick={onClose}><Glyph size={18}><path d="m6 6 12 12M6 18 18 6" /></Glyph></button>
      </header>
      {open && children}
    </div>
  </dialog>;
}
