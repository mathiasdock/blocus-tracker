import { useEffect, useRef, useState } from "react";

function normaliseValue(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

function roundForDisplay(value, decimals) {
  if (decimals <= 0) return Math.round(value);
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

/**
 * Count-up for important product metrics. It runs only on mount or when the
 * value changes, so scrolling cannot replay it. Screen readers receive the
 * final value once instead of every animation frame.
 */
export default function AnimatedNumber({
  value,
  duration = 400,
  decimals = 0,
  prefix = "",
  suffix = "",
  format,
  className = "",
  style,
}) {
  const target = normaliseValue(value);
  const [display, setDisplay] = useState(0);
  const displayRef = useRef(0);

  useEffect(() => {
    const from = displayRef.current;
    const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

    if (reduceMotion || duration <= 0 || from === target) {
      displayRef.current = target;
      setDisplay(target);
      return undefined;
    }

    const startedAt = performance.now();
    let frame;

    const tick = (now) => {
      const progress = Math.min(1, (now - startedAt) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      const next = from + (target - from) * eased;
      displayRef.current = next;
      setDisplay(next);
      if (progress < 1) frame = requestAnimationFrame(tick);
      else displayRef.current = target;
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [duration, target]);

  const renderValue = (raw) => {
    const rounded = roundForDisplay(raw, decimals);
    const body = format
      ? format(rounded)
      : decimals > 0
        ? rounded.toFixed(decimals)
        : String(rounded);
    return `${prefix}${body}${suffix}`;
  };

  return (
    <span className={`font-num tabular-nums ${className}`.trim()} style={style} aria-label={renderValue(target)}>
      <span aria-hidden="true">{renderValue(display)}</span>
    </span>
  );
}
