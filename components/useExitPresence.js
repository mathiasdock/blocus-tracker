import { useEffect, useState } from "react";

// Keep a transient surface mounted only long enough for a short exit. Reduced
// motion closes immediately; callers still own their content and close action.
export default function useExitPresence(open, duration = 150) {
  const [present, setPresent] = useState(open);
  const [exiting, setExiting] = useState(false);

  useEffect(() => {
    if (open) {
      setPresent(true);
      setExiting(false);
      return undefined;
    }
    if (!present) return undefined;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setPresent(false);
      setExiting(false);
      return undefined;
    }
    setExiting(true);
    const timeout = window.setTimeout(() => {
      setPresent(false);
      setExiting(false);
    }, duration);
    return () => window.clearTimeout(timeout);
  }, [open, present, duration]);

  // Opening is visible in the same render, including when it interrupts an
  // exit; the effect only keeps the mounted state for the later close.
  return { present: open || present, exiting: !open && exiting };
}
