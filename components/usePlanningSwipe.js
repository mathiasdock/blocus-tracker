import { useEffect, useRef, useState } from "react";
import { planningSwipeDirection } from "../lib/planningSwipe.mjs";

const BLOCKED_TARGET = "input, textarea, select, [contenteditable], [role='slider'], [data-no-planning-swipe]";

function hasHorizontalScroller(target, root) {
  for (let node = target; node && node !== root; node = node.parentElement) {
    if (node.scrollWidth <= node.clientWidth + 2) continue;
    const overflow = getComputedStyle(node).overflowX;
    if (overflow === "auto" || overflow === "scroll") return true;
  }
  return false;
}

function canStart(target, root) {
  return target instanceof Element
    && !target.closest(BLOCKED_TARGET)
    && !hasHorizontalScroller(target, root);
}

export default function usePlanningSwipe(onPrevious, onNext) {
  const [root, setRoot] = useState(null);
  const actionsRef = useRef({ onPrevious, onNext });
  const suppressClickUntilRef = useRef(0);
  actionsRef.current = { onPrevious, onNext };

  useEffect(() => {
    if (!root) return undefined;
    let touchStart = null;
    let mouseStart = null;
    let wheelDistance = 0;
    let lastWheelTime = 0;
    let wheelTriggered = false;

    function navigate(direction, suppressClick = true) {
      if (!direction) return;
      if (suppressClick) suppressClickUntilRef.current = Date.now() + 450;
      if (direction === "next") actionsRef.current.onNext();
      else actionsRef.current.onPrevious();
    }

    function onTouchStart(event) {
      touchStart = null;
      if (event.touches.length !== 1 || !canStart(event.target, root)) return;
      const touch = event.touches[0];
      // Leave edge gestures to the browser's back/forward navigation.
      if (touch.clientX < 20 || touch.clientX > window.innerWidth - 20) return;
      touchStart = { x: touch.clientX, y: touch.clientY, axis: null };
    }
    function onTouchMove(event) {
      if (!touchStart || event.touches.length !== 1) return;
      const touch = event.touches[0];
      const dx = touch.clientX - touchStart.x;
      const dy = touch.clientY - touchStart.y;
      if (!touchStart.axis && Math.max(Math.abs(dx), Math.abs(dy)) > 12) {
        touchStart.axis = Math.abs(dx) > Math.abs(dy) * 1.25 ? "horizontal" : "vertical";
      }
      if (touchStart.axis === "horizontal" && event.cancelable) event.preventDefault();
    }
    function onTouchEnd(event) {
      if (!touchStart || event.changedTouches.length !== 1) { touchStart = null; return; }
      const touch = event.changedTouches[0];
      if (touchStart.axis === "horizontal") {
        navigate(planningSwipeDirection(touch.clientX - touchStart.x, touch.clientY - touchStart.y));
      }
      touchStart = null;
    }
    function onTouchCancel() { touchStart = null; }
    function onMouseDown(event) {
      if (event.button !== 0 || !canStart(event.target, root)) return;
      mouseStart = { x: event.clientX, y: event.clientY };
    }
    function onMouseUp(event) {
      if (!mouseStart) return;
      navigate(planningSwipeDirection(event.clientX - mouseStart.x, event.clientY - mouseStart.y));
      mouseStart = null;
    }
    function onWheel(event) {
      if (event.ctrlKey || event.metaKey || event.shiftKey || !canStart(event.target, root)) return;
      if (Math.abs(event.deltaX) <= Math.abs(event.deltaY) * 1.25) return;
      if (event.cancelable) event.preventDefault();
      const now = Date.now();
      if (now - lastWheelTime > 220) {
        wheelDistance = 0;
        wheelTriggered = false;
      }
      lastWheelTime = now;
      if (wheelTriggered) return;
      if (wheelDistance && Math.sign(event.deltaX) !== Math.sign(wheelDistance)) wheelDistance = 0;
      wheelDistance += event.deltaX * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? window.innerWidth : 1);
      if (Math.abs(wheelDistance) < 70) return;
      navigate(wheelDistance > 0 ? "next" : "previous", false);
      wheelDistance = 0;
      wheelTriggered = true;
    }

    root.addEventListener("touchstart", onTouchStart, { passive: true });
    root.addEventListener("touchmove", onTouchMove, { passive: false });
    root.addEventListener("touchend", onTouchEnd, { passive: true });
    root.addEventListener("touchcancel", onTouchCancel, { passive: true });
    root.addEventListener("mousedown", onMouseDown);
    window.addEventListener("mouseup", onMouseUp);
    root.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      root.removeEventListener("touchstart", onTouchStart);
      root.removeEventListener("touchmove", onTouchMove);
      root.removeEventListener("touchend", onTouchEnd);
      root.removeEventListener("touchcancel", onTouchCancel);
      root.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("mouseup", onMouseUp);
      root.removeEventListener("wheel", onWheel);
    };
  }, [root]);

  function onClickCapture(event) {
    if (Date.now() < suppressClickUntilRef.current) {
      event.preventDefault();
      event.stopPropagation();
    }
  }

  return { ref: setRoot, onClickCapture };
}
