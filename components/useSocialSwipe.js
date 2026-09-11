import { useEffect, useState } from "react";
import { swipeAxis, swipeDestination } from "../lib/socialSwipe.mjs";

export default function useSocialSwipe(router, paths) {
  // The layout first renders an auth skeleton. A callback ref attaches the
  // gestures when the real surface mounts, not only on the initial effect.
  const [surface, setSurface] = useState(null);
  const index = paths.indexOf(router.pathname);
  useEffect(() => {
    if (!surface || index < 0) return undefined;
    const content = surface.querySelector("[data-bt-route-content]");
    if (!content) return undefined;
    const indicator = surface.querySelector("[data-social-indicator]");
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
    let gesture = null;
    let suppressClickUntil = 0;
    let navigating = false;
    let settleTimer;
    const paint = (dx = 0) => {
      if (reduce.matches) return;
      content.style.transform = dx ? `translateX(${dx * .23}px)` : "";
      if (indicator) indicator.style.transform = `translateX(${(index - dx / surface.clientWidth) * 100}%)`;
    };
    const reset = () => {
      gesture = null;
      content.style.transition = reduce.matches ? "none" : "transform 180ms ease-out";
      if (indicator) indicator.style.transition = "transform 180ms ease-out";
      paint();
      clearTimeout(settleTimer);
      settleTimer = setTimeout(() => { content.style.transition = ""; if (indicator) indicator.style.transition = ""; }, 190);
    };
    const blocked = target => {
      if (document.documentElement.classList.contains("bt-chat-fullscreen") || document.querySelector('dialog[open], [aria-modal="true"]')) return true;
      if (target.closest('form, label, input, textarea, select, button, a, video, audio, [contenteditable="true"], [role="slider"], [data-no-swipe]')) return true;
      for (let node = target; node && node !== surface; node = node.parentElement) {
        const style = getComputedStyle(node);
        if (/(auto|scroll)/.test(style.overflowX) && node.scrollWidth > node.clientWidth + 2) return true;
        if (style.touchAction === "none" || style.touchAction === "pan-x") return true;
      }
      return false;
    };
    const start = event => {
      if (event.touches.length !== 1 || navigating || innerWidth >= 1024 || blocked(event.target)) { reset(); return; }
      const touch = event.touches[0];
      // Reserve the edges for browser back/forward navigation.
      if (touch.clientX < 24 || touch.clientX > innerWidth - 24) return;
      gesture = { x: touch.clientX, y: touch.clientY, dx: 0, dy: 0, time: performance.now(), axis: null };
      content.style.transition = "none";
      if (indicator) indicator.style.transition = "none";
    };
    const move = event => {
      if (!gesture) return;
      if (event.touches.length !== 1) { reset(); return; }
      gesture.dx = event.touches[0].clientX - gesture.x;
      gesture.dy = event.touches[0].clientY - gesture.y;
      gesture.axis ||= swipeAxis(gesture.dx, gesture.dy);
      if (gesture.axis === "vertical") { reset(); return; }
      if (gesture.axis !== "horizontal") return;
      if (event.cancelable) event.preventDefault();
      const atEdge = (index === 0 && gesture.dx > 0) || (index === paths.length - 1 && gesture.dx < 0);
      paint(Math.max(-innerWidth * .8, Math.min(innerWidth * .8, gesture.dx)) * (atEdge ? .15 : 1));
    };
    const end = () => {
      if (!gesture) return;
      const next = gesture.axis === "horizontal" ? swipeDestination({ index, count: paths.length, dx: gesture.dx, dy: gesture.dy, elapsed: performance.now() - gesture.time, width: surface.clientWidth }) : index;
      if (gesture.axis === "horizontal") suppressClickUntil = performance.now() + 400;
      reset();
      if (next !== index) {
        navigating = true;
        router.push(paths[next]).catch(() => {}).finally(() => { navigating = false; });
      }
    };
    const click = event => { if (performance.now() < suppressClickUntil) { event.preventDefault(); event.stopPropagation(); } };
    surface.addEventListener("touchstart", start, { passive: true });
    surface.addEventListener("touchmove", move, { passive: false });
    surface.addEventListener("touchend", end);
    surface.addEventListener("touchcancel", reset);
    surface.addEventListener("click", click, true);
    return () => {
      clearTimeout(settleTimer);
      surface.removeEventListener("touchstart", start);
      surface.removeEventListener("touchmove", move);
      surface.removeEventListener("touchend", end);
      surface.removeEventListener("touchcancel", reset);
      surface.removeEventListener("click", click, true);
      content.style.transform = "";
      content.style.transition = "";
    };
  }, [surface, index, paths, router]);
  return setSurface;
}
