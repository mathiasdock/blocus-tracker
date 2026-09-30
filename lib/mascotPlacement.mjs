const GAP = 10;
const EDGE = 12;

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

function overlap(a, b) {
  return Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left))
    * Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
}

/** Place an event callout near its source without reserving a layout row.
 * Outside positions win; a compact in-panel/floating position is a last resort
 * on narrow screens. Visible text and controls are treated as obstacles. */
export function placeMascotCallout(anchor, popup, viewport, obstacles = []) {
  if (!anchor || anchor.bottom <= 0 || anchor.top >= viewport.height
    || anchor.right <= 0 || anchor.left >= viewport.width) return null;
  const maxX = viewport.width - popup.width - EDGE;
  const maxY = viewport.height - popup.height - (viewport.bottomInset || EDGE);
  if (maxX < EDGE || maxY < EDGE) return null;

  const midY = clamp(anchor.top + (anchor.height - popup.height) / 2, EDGE, maxY);
  const endX = clamp(anchor.right - popup.width, EDGE, maxX);
  const startX = clamp(anchor.left, EDGE, maxX);
  const candidates = [
    { x: anchor.right + GAP, y: midY, cost: 0 },
    { x: anchor.left - popup.width - GAP, y: midY, cost: 2 },
    { x: endX, y: anchor.bottom + GAP, cost: 8 },
    { x: startX, y: anchor.bottom + GAP, cost: 10 },
    { x: endX, y: anchor.top - popup.height - GAP, cost: 12 },
    { x: startX, y: anchor.top - popup.height - GAP, cost: 14 },
    { x: endX, y: anchor.top - popup.height * 2 - GAP, cost: 18 },
    { x: startX, y: anchor.top - popup.height * 2 - GAP, cost: 20 },
    { x: endX, y: anchor.bottom + popup.height + GAP, cost: 22 },
    { x: startX, y: anchor.bottom + popup.height + GAP, cost: 24 },
    { x: endX, y: clamp(anchor.bottom - popup.height - 12, EDGE, maxY), cost: 35 },
    { x: startX, y: clamp(anchor.bottom - popup.height - 12, EDGE, maxY), cost: 37 },
    { x: maxX, y: maxY, cost: 55 },
    { x: EDGE, y: maxY, cost: 57 },
  ];

  // A dense mobile card may have no room at the four cardinal positions.
  // Try the nearest natural line breaks before retreating to a viewport edge.
  const nearbyEdges = obstacles
    .filter((rect) => Math.abs(rect.bottom - anchor.bottom) <= popup.height * 2 + 120
      || Math.abs(rect.top - anchor.top) <= popup.height * 2 + 120)
    .sort((a, b) => Math.abs(a.bottom - anchor.bottom) - Math.abs(b.bottom - anchor.bottom))
    .slice(0, 8);
  for (const rect of nearbyEdges) {
    for (const y of [rect.bottom, rect.top - popup.height]) {
      const cost = 16 + Math.abs(y - anchor.bottom) / 8;
      candidates.push({ x: endX, y, cost }, { x: startX, y, cost: cost + 2 });
    }
  }

  return candidates
    .filter(({ x, y }) => x >= EDGE && x <= maxX && y >= EDGE && y <= maxY)
    .map(({ x, y, cost }) => {
      const rect = { left: x, top: y, right: x + popup.width, bottom: y + popup.height };
      const covered = obstacles.reduce((sum, obstacle) => sum + overlap(rect, obstacle) * (obstacle.weight || 1), 0);
      return { x, y, score: cost + overlap(rect, anchor) / 12 + covered / 24 };
    })
    .sort((a, b) => a.score - b.score)[0] || null;
}
