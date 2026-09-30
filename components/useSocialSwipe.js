import { useEffect, useState } from "react";
import { swipeAxis, swipeDestination } from "../lib/socialSwipe.mjs";

const SETTLE_EASING = "cubic-bezier(0.23, 1, 0.32, 1)";
const FOLLOW_FACTOR = 0.5;

export default function useSocialSwipe(router, paths) {
  // The layout first renders an auth skeleton. A callback ref attaches the
  // gestures when the real surface mounts, not only on the initial effect.
  const [surface, setSurface] = useState(null);
  const index = paths.indexOf(router.pathname);
  useEffect(() => {
    if (!surface || index < 0) return undefined;
    paths.forEach((path, pathIndex) => {
      if (pathIndex !== index) router.prefetch(path).catch(() => {});
    });
    const content = surface.querySelector("[data-bt-route-content]");
    if (!content) return undefined;
    const indicator = surface.querySelector("[data-social-indicator]");
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
    let gesture = null;
    let suppressClickUntil = 0;
    let navigating = false;
    let settleTimer;
    let paintFrame;
    let pendingDx = 0;
    const clearPaintFrame = () => {
      cancelAnimationFrame(paintFrame);
      paintFrame = undefined;
    };
    const paint = (dx = 0) => {
      if (reduce.matches) return;
      content.style.transform = dx ? `translate3d(${dx * FOLLOW_FACTOR}px, 0, 0)` : "";
      if (indicator) indicator.style.transform = `translate3d(${(index - dx / gesture.width) * 100}%, 0, 0)`;
    };
    const schedulePaint = dx => {
      pendingDx = dx;
      if (paintFrame !== undefined) return;
      paintFrame = requestAnimationFrame(() => {
        paintFrame = undefined;
        paint(pendingDx);
      });
    };
    const reset = () => {
      gesture = null;
      clearPaintFrame();
      content.style.transition = reduce.matches ? "none" : `transform 220ms ${SETTLE_EASING}`;
      content.style.transform = "";
      if (indicator) {
        indicator.style.transition = reduce.matches ? "none" : `transform 220ms ${SETTLE_EASING}`;
        indicator.style.transform = `translate3d(${index * 100}%, 0, 0)`;
      }
      clearTimeout(settleTimer);
      settleTimer = setTimeout(() => {
        content.style.transition = "";
        content.style.willChange = "";
        if (indicator) indicator.style.transition = "";
      }, 230);
    };
    const blocked = target => {
      if (document.documentElement.classList.contains("bt-chat-fullscreen") || document.querySelector('dialog[open], [aria-modal="true"]')) return true;
      // Buttons, links and conversation rows remain swipeable: a horizontal
      // drag is distinguished from a tap, whose click is preserved below.
      if (target.closest('input, textarea, select, option, video, audio, [contenteditable="true"], [role="slider"], [data-no-swipe]')) return true;
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
      if (touch.clientX < 16 || touch.clientX > innerWidth - 16) return;
      const now = performance.now();
      gesture = {
        x: touch.clientX,
        y: touch.clientY,
        dx: 0,
        dy: 0,
        time: now,
        lastX: touch.clientX,
        lastTime: now,
        velocity: 0,
        width: Math.max(1, surface.clientWidth),
        axis: null,
      };
      content.style.transition = "none";
      content.style.willChange = reduce.matches ? "" : "transform";
      if (indicator) indicator.style.transition = "none";
    };
    const move = event => {
      if (!gesture) return;
      if (event.touches.length !== 1) { reset(); return; }
      const touch = event.touches[0];
      const now = performance.now();
      gesture.dx = touch.clientX - gesture.x;
      gesture.dy = touch.clientY - gesture.y;
      const sampleDuration = now - gesture.lastTime;
      if (sampleDuration > 0) {
        const sampleVelocity = (touch.clientX - gesture.lastX) / sampleDuration;
        gesture.velocity = gesture.velocity * .35 + sampleVelocity * .65;
      }
      gesture.lastX = touch.clientX;
      gesture.lastTime = now;
      gesture.axis ||= swipeAxis(gesture.dx, gesture.dy);
      if (gesture.axis === "vertical") { reset(); return; }
      if (gesture.axis !== "horizontal") return;
      if (event.cancelable) event.preventDefault();
      const atEdge = (index === 0 && gesture.dx > 0) || (index === paths.length - 1 && gesture.dx < 0);
      const clampedDx = Math.max(-gesture.width, Math.min(gesture.width, gesture.dx));
      schedulePaint(clampedDx * (atEdge ? .14 : 1));
    };
    const end = () => {
      if (!gesture) return;
      const completedGesture = gesture;
      const next = completedGesture.axis === "horizontal" ? swipeDestination({
        index,
        count: paths.length,
        dx: completedGesture.dx,
        dy: completedGesture.dy,
        elapsed: performance.now() - completedGesture.time,
        width: completedGesture.width,
        velocity: completedGesture.velocity,
      }) : index;
      if (gesture.axis === "horizontal") suppressClickUntil = performance.now() + 400;
      if (next !== index) {
        clearPaintFrame();
        gesture = null;
        document.documentElement.dataset.btSocialSwipe = String(Math.sign(next - index));
        content.style.transition = "";
        content.style.transform = "";
        content.style.willChange = "";
        if (indicator) {
          // Restore the stylesheet transition that was disabled while tracking
          // the finger, so the indicator completes its trip without a jump.
          indicator.style.transition = "";
          indicator.style.transform = `translate3d(${next * 100}%, 0, 0)`;
        }
        navigating = true;
        router.push(paths[next]).catch(() => {}).finally(() => { navigating = false; });
      } else reset();
    };
    const click = event => { if (performance.now() < suppressClickUntil) { event.preventDefault(); event.stopPropagation(); } };
    surface.addEventListener("touchstart", start, { passive: true });
    surface.addEventListener("touchmove", move, { passive: false });
    surface.addEventListener("touchend", end);
    surface.addEventListener("touchcancel", reset);
    surface.addEventListener("click", click, true);
    return () => {
      clearTimeout(settleTimer);
      clearPaintFrame();
      surface.removeEventListener("touchstart", start);
      surface.removeEventListener("touchmove", move);
      surface.removeEventListener("touchend", end);
      surface.removeEventListener("touchcancel", reset);
      surface.removeEventListener("click", click, true);
      content.style.transform = "";
      content.style.transition = "";
      content.style.willChange = "";
    };
  }, [surface, index, paths, router]);
  return setSurface;
}
