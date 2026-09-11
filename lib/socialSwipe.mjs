export function swipeAxis(dx, dy) {
  if (Math.max(Math.abs(dx), Math.abs(dy)) < 12) return null;
  return Math.abs(dx) > Math.abs(dy) * 1.4 ? "horizontal" : "vertical";
}

export function swipeDestination({ index, count, dx, dy, elapsed, width }) {
  if (swipeAxis(dx, dy) !== "horizontal") return index;
  const distance = Math.abs(dx);
  const committed = distance >= Math.min(100, width * .22) || (distance >= 38 && distance / Math.max(1, elapsed) > .45);
  if (!committed) return index;
  return Math.max(0, Math.min(count - 1, index + (dx < 0 ? 1 : -1)));
}
