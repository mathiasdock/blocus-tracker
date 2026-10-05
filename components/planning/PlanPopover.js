import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

// One floating surface for every secondary action of the Planning: the « … »
// menus, « + Ajouter », an imported deadline's actions. On a computer it is a
// small popover anchored to what opened it; on a phone the same content rises
// as a bottom sheet with large rows. It never pushes the page around: it is
// rendered outside the layout (portal), so opening it moves nothing below.
//
// Escape closes it (and only it — never the day sheet underneath), Tab stays
// inside, a click outside closes it, and focus returns to the trigger.
const SHEET_QUERY = "(max-width: 639px)";
const FOCUSABLE = 'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
// Open surfaces, innermost last: Escape belongs to the one on top.
const OPEN_SURFACES = [];

export function useSheetMode() {
  const [sheet, setSheet] = useState(false);
  useEffect(() => {
    const query = window.matchMedia(SHEET_QUERY);
    const update = () => setSheet(query.matches);
    update();
    query.addEventListener?.("change", update);
    return () => query.removeEventListener?.("change", update);
  }, []);
  return sheet;
}

export default function PlanPopover({
  open, anchorRef, onClose, label, children,
  align = "end", width = 320, role = "dialog", className = "", initialFocusRef,
}) {
  const sheet = useSheetMode();
  const panelRef = useRef(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  // A click elsewhere already chose where focus goes; never pull it back.
  const restoreFocus = useRef(true);
  const [position, setPosition] = useState(null);
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  // Anchored placement: below the trigger, above it when the window is too
  // short, always inside the viewport. It follows scrolling instead of
  // floating away; if its trigger leaves the screen, it closes.
  useLayoutEffect(() => {
    if (!open || sheet || !mounted) return undefined;
    let frame = 0;
    const place = () => {
      const anchor = anchorRef?.current;
      const panel = panelRef.current;
      if (!anchor || !panel) return;
      const a = anchor.getBoundingClientRect();
      if (a.bottom < 0 || a.top > window.innerHeight) { closeRef.current?.(); return; }
      const margin = 8;
      const w = panel.offsetWidth;
      const h = panel.offsetHeight;
      let left = align === "end" ? a.right - w : a.left;
      left = Math.min(Math.max(margin, left), window.innerWidth - w - margin);
      let top = a.bottom + 6;
      let vertical = "top";
      if (top + h > window.innerHeight - margin && a.top - h - 6 >= margin) {
        top = a.top - h - 6;
        vertical = "bottom";
      }
      top = Math.max(margin, Math.min(top, window.innerHeight - h - margin));
      setPosition({ top, left, origin: `${align === "end" ? "right" : "left"} ${vertical}` });
    };
    place();
    const schedule = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(place); };
    window.addEventListener("scroll", schedule, true);
    window.addEventListener("resize", schedule);
    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(schedule) : null;
    if (observer && panelRef.current) observer.observe(panelRef.current);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule, true);
      window.removeEventListener("resize", schedule);
      observer?.disconnect();
    };
  }, [open, sheet, mounted, align, anchorRef]);

  // Focus goes back to the trigger on close…
  const focused = useRef(false);
  useEffect(() => {
    if (!open || !mounted) return undefined;
    restoreFocus.current = true;
    focused.current = false;
    const previous = document.activeElement;
    const anchor = anchorRef?.current;
    return () => {
      if (!restoreFocus.current) return;
      const back = anchor && document.contains(anchor) ? anchor : previous;
      back?.focus?.({ preventScroll: true });
    };
  }, [open, mounted]); // eslint-disable-line react-hooks/exhaustive-deps

  // …and moves in once the surface is really visible: a popover is hidden
  // until it has been placed, and a hidden element cannot take focus.
  useEffect(() => {
    if (!open || !mounted || focused.current || (!sheet && !position)) return;
    const panel = panelRef.current;
    const target = initialFocusRef?.current || panel?.querySelector(FOCUSABLE) || panel;
    target?.focus?.({ preventScroll: true });
    focused.current = true;
  }, [open, mounted, sheet, position, initialFocusRef]);

  // Escape closes the topmost floating surface only — never the day sheet or
  // dialog underneath, even when focus has not moved into it yet.
  useEffect(() => {
    if (!open) return undefined;
    const entry = {};
    OPEN_SURFACES.push(entry);
    const onKey = (event) => {
      if (event.key !== "Escape" || OPEN_SURFACES[OPEN_SURFACES.length - 1] !== entry) return;
      event.preventDefault();
      event.stopPropagation();
      closeRef.current?.();
    };
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      OPEN_SURFACES.splice(OPEN_SURFACES.indexOf(entry), 1);
    };
  }, [open]);

  // A press outside closes the popover; the trigger toggles it itself.
  useEffect(() => {
    if (!open || sheet) return undefined;
    const onPointer = (event) => {
      if (panelRef.current?.contains(event.target) || anchorRef?.current?.contains(event.target)) return;
      restoreFocus.current = false;
      closeRef.current?.();
    };
    document.addEventListener("pointerdown", onPointer, true);
    return () => document.removeEventListener("pointerdown", onPointer, true);
  }, [open, sheet, anchorRef]);

  function onKeyDown(event) {
    if (event.key !== "Tab") return;
    // Tab never escapes into the page behind (or the day sheet underneath).
    event.stopPropagation();
    const nodes = [...(panelRef.current?.querySelectorAll(FOCUSABLE) || [])].filter(el => el.getClientRects().length);
    if (!nodes.length) { event.preventDefault(); return; }
    const first = nodes[0];
    const last = nodes[nodes.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }

  if (!open || !mounted) return null;
  if (sheet) {
    return createPortal(
      <div className="bt-plan-sheet-root">
        <div className="bt-plan-sheet-backdrop" onClick={() => closeRef.current?.()} aria-hidden="true" />
        <div ref={panelRef} role={role} aria-modal={role === "dialog" ? "true" : undefined} aria-label={label}
          tabIndex={-1} className={`bt-plan-sheet ${className}`} onKeyDown={onKeyDown}>
          <span className="bt-plan-sheet-handle" aria-hidden="true" />
          {children}
        </div>
      </div>,
      document.body,
    );
  }
  return createPortal(
    <div ref={panelRef} role={role} aria-label={label} tabIndex={-1}
      className={`bt-plan-popover ${className}`} onKeyDown={onKeyDown}
      style={{
        top: position ? position.top : -9999,
        left: position ? position.left : -9999,
        width,
        transformOrigin: position?.origin,
        visibility: position ? "visible" : "hidden",
      }}>
      {children}
    </div>,
    document.body,
  );
}
