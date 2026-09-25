export function planningSwipeDirection(deltaX, deltaY, minDistance = 52) {
  if (Math.abs(deltaX) < minDistance || Math.abs(deltaX) < Math.abs(deltaY) * 1.25) return null;
  return deltaX < 0 ? "next" : "previous";
}
