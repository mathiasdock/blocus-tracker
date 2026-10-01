// Where the mascot coach stands.
//
// A coach is ONE object: the character and its speech bubble, the tail aimed
// at the character. It stands against the surface it talks about — the Study
// Blocks, the exam, the weekly missions — in a place chosen in
// advance for that surface and that screen size. Nothing here searches the
// page for an empty spot: the previous engine scored every heading, paragraph
// and button on screen and could land the character anywhere, including over
// the timer digits. The only collision handling left is the simple kind: flip
// to the other side when the bubble cannot open where it should, keep a safe
// margin, never leave the viewport.
//
// Phones are the exception that was agreed with Mathias (2026-09-30): on the
// Chrono during a session and on the Objectifs card, no free area next to the
// element can hold the character and its bubble. There the bubble may cover a
// secondary caption for its few seconds — never the digits, the blocks, a
// number, a button or a field.

export const COACH_BREAKPOINT = 1024;
const EDGE = 12;
const MIN_BUBBLE = 132;

/** Character size and bubble width for a viewport width. */
export function coachMetrics(width) {
  const mobile = width < COACH_BREAKPOINT;
  return { mobile, size: mobile ? 84 : 100, bubbleMax: mobile ? 252 : 280 };
}

// The drawn Shiba inside its 160-unit square, as fractions of its size: the
// bubble meets the character on its transparent margins, so the two touch.
const ART = { left: 0.22, right: 0.9, top: 0.07, mouth: 0.5 };

// The right edge of the anchor's written lines between two heights: a bubble
// beside a short date line does not have to move for a long exam title above
// it. Falls back to the whole text box when the lines are unknown.
function textRight({ text, lines }, top, bottom) {
  if (!lines) return text ? text.right : null;
  let right = null;
  for (const line of lines) {
    if (line.bottom > top && line.top < bottom) right = Math.max(right ?? line.right, line.right);
  }
  return right;
}

// One entry per anchor kind: where the character stands (its square's
// top-left corner) and on which side its bubble opens. Rects come from the
// page: `anchor` (the element spoken about), `frame` (its card), `text` and
// `lines` (the anchor's own text, whole and line by line), `clear` (values
// the bubble keeps clear of), `spot` (a precise part of the card), `floor`
// (content of the card the character must stand above, when present).
export const COACH_PRESETS = {
  // Timer milestones speak about the blocks the student just filled.
  studyBlocks: {
    // Phone: the column beside the digits is the only free space next to the
    // blocks. The character leans out of the card edge there; its bubble sits
    // over the blocks' caption, between the digits and the blocks.
    mobile: ({ anchor, frame, vw, s }) => ({
      mascot: { x: Math.min(vw - 6, frame.right + 14) - s, y: anchor.top - s - 2 },
      bubble: { side: "left", bottom: anchor.top + 22 },
      enter: { x: 14, y: 0 },
    }),
    // Desktop: half outside the card's right edge, level with the blocks; the
    // bubble fills the card's empty right column above it and, like the
    // character, crosses the card's edge a little (at 1366 px the column
    // beside the digits is narrow).
    desktop: ({ anchor, frame, clear, s }) => ({
      mascot: { x: frame.right - 0.62 * s, y: anchor.bottom - s },
      bubble: { side: "above", right: frame.right + 8, minLeft: (clear ? clear.right : frame.left + frame.width * 0.62) + 14 },
      enter: { x: -14, y: 0 },
    }),
  },
  // Focus is an empty full screen: the coach stands above the session on a
  // phone, beside the blocks on a computer.
  focusBlocks: {
    mobile: ({ frame, vw, s }) => ({
      mascot: { x: vw - 14 - s, y: frame.top - s - 10 },
      bubble: { side: "left" },
      enter: { x: 0, y: 12 },
    }),
    desktop: ({ anchor, s }) => ({
      mascot: { x: anchor.right + 28, y: anchor.bottom - s + 6 },
      bubble: { side: "above", left: anchor.right + 24 },
      enter: { x: 0, y: 12 },
    }),
  },
  // The next exam: the character sits on the Today card's bottom edge, on
  // the empty side of the exam, its bubble beside the exam, never over it.
  // Phone: its feet just past the edge, so the bubble ends above the card's
  // last row (« Ajouter un objectif ») and only meets the exam's last lines.
  // When Today lists its next actions (`floor`), it stands above that list,
  // on the exam's bottom-right corner, never in front of their ▶ buttons.
  // No flip: the exam's text always starts on the left.
  exam: {
    mobile: ({ frame, floor, text, lines, s }) => {
      const y = (floor ? floor.top - 4 : frame.bottom + 5) - s;
      const bubbleBottom = y + ART.top * s + 4;
      const right = textRight({ text, lines }, bubbleBottom - 64, bubbleBottom);
      return {
        mascot: { x: frame.right - 10 - s, y },
        bubble: { side: "above", right: frame.right - 14, minLeft: (right ?? frame.left) + 12, flip: false },
        enter: { x: 0, y: 12 },
      };
    },
    desktop: ({ frame, text, s }) => ({
      mascot: { x: frame.right - 28 - s, y: frame.bottom + 16 - s },
      bubble: { side: "left", minLeft: (text ? text.right : frame.left) + 16 },
      enter: { x: 0, y: 12 },
    }),
  },
  // Weekly missions. Phone: the character stands on the card's top-left
  // corner (over its title), the bubble in the empty middle of the header.
  // Desktop: it leans out of the card's left edge at the weekly challenges,
  // the bubble in the free column of the neighbouring Chrono card.
  mission: {
    mobile: ({ frame }) => ({
      mascot: { x: frame.left - 8, y: frame.top - 32 },
      bubble: { side: "right", top: frame.top - 24, maxRight: frame.right - 88 },
      enter: { x: 0, y: 12 },
    }),
    desktop: ({ frame, spot, s }) => ({
      mascot: { x: frame.left - 0.82 * s, y: (spot || frame).bottom - s },
      bubble: { side: "above", right: frame.left - 8, maxWidth: 200 },
      enter: { x: 14, y: 0 },
    }),
  },
};

const clamp = (value, min, max) => Math.min(Math.max(value, min), Math.max(min, max));

function visible(rect, viewport) {
  return rect && rect.bottom > 0 && rect.top < viewport.height && rect.right > 0 && rect.left < viewport.width;
}

// The horizontal room the bubble has on its side of the character.
function bubbleSlot(spec, mascot, s, viewport, metrics) {
  const maxWidth = Math.min(metrics.bubbleMax, spec.maxWidth || Infinity);
  if (spec.side === "left") {
    const right = mascot.x + ART.left * s - 2;
    return { right, width: Math.min(maxWidth, right - Math.max(EDGE, spec.minLeft ?? EDGE)) };
  }
  if (spec.side === "right") {
    const left = mascot.x + ART.right * s + 2;
    return { left, width: Math.min(maxWidth, Math.min(viewport.width - EDGE, spec.maxRight ?? Infinity) - left) };
  }
  // above
  if (spec.left !== undefined) {
    return { left: spec.left, width: Math.min(maxWidth, viewport.width - EDGE - spec.left) };
  }
  const right = Math.min(viewport.width - EDGE, spec.right ?? mascot.x + s);
  return { right, width: Math.min(maxWidth, right - Math.max(EDGE, spec.minLeft ?? EDGE)) };
}

function mirror(layout, frame, s) {
  const flipX = (x, width) => frame.left + frame.right - (x + width);
  const bubble = { ...layout.bubble };
  if (bubble.side === "left" || bubble.side === "right") bubble.side = bubble.side === "left" ? "right" : "left";
  if (bubble.right !== undefined || bubble.left !== undefined) {
    const { left, right } = bubble;
    bubble.left = right !== undefined ? frame.left + frame.right - right : undefined;
    bubble.right = left !== undefined ? frame.left + frame.right - left : undefined;
  }
  delete bubble.minLeft;
  delete bubble.maxRight;
  return { ...layout, mascot: { ...layout.mascot, x: flipX(layout.mascot.x, s) }, bubble, enter: { ...layout.enter, x: -layout.enter.x } };
}

/**
 * The preset for this anchor kind and screen size, before the bubble is
 * measured: where the character stands and how wide its bubble may be.
 * Returns null when the anchor is off screen — a coach never floats alone.
 */
export function planCoach(kind, rects, viewport) {
  const presets = COACH_PRESETS[kind];
  if (!presets || !visible(rects.anchor, viewport)) return null;
  const metrics = coachMetrics(viewport.width);
  const s = metrics.size;
  const frame = rects.frame || rects.anchor;
  const preset = presets[metrics.mobile ? "mobile" : "desktop"];
  let layout = preset({ ...rects, frame, vw: viewport.width, vh: viewport.height, s });
  let slot = bubbleSlot(layout.bubble, layout.mascot, s, viewport, metrics);
  // Flip: the bubble opens on the other side when its own side is too narrow.
  if (slot.width < MIN_BUBBLE && layout.bubble.flip !== false) {
    const flipped = mirror(layout, frame, s);
    const other = bubbleSlot(flipped.bubble, flipped.mascot, s, viewport, metrics);
    if (other.width > slot.width) { layout = flipped; slot = other; }
  }
  // Safe margin: the square may reach into the gutter (its margins are
  // empty), the drawn character never leaves the viewport.
  const mascot = {
    x: clamp(layout.mascot.x, -ART.left * s + 4, viewport.width - ART.right * s - 4),
    y: layout.mascot.y,
    size: s,
  };
  if (mascot.x !== layout.mascot.x) slot = bubbleSlot(layout.bubble, mascot, s, viewport, metrics);
  return { kind, mobile: metrics.mobile, mascot, bubble: layout.bubble, maxWidth: Math.max(MIN_BUBBLE, Math.floor(slot.width)), slot, enter: layout.enter };
}

/**
 * Final positions once the bubble's size is known: the bubble box, where its
 * tail meets its edge, and the vertical correction that keeps the whole
 * object on screen (above the mobile tab bar).
 */
export function placeCoach(plan, size, viewport) {
  if (!plan) return null;
  const { mascot, bubble: spec, slot } = plan;
  const s = mascot.size;
  const w = Math.min(size.width, plan.maxWidth);
  const h = size.height;
  let x;
  let y;
  if (spec.side === "left" || spec.side === "right") {
    x = spec.side === "left" ? slot.right - w : slot.left;
    if (spec.bottom !== undefined) y = spec.bottom - h;
    else if (spec.top !== undefined) y = spec.top;
    else y = mascot.y + ART.mouth * s - h / 2;
  } else {
    x = slot.left !== undefined ? slot.left : slot.right - w;
    y = mascot.y + ART.top * s + 4 - h;
  }
  x = clamp(x, EDGE, viewport.width - EDGE - w);

  // Keep the object on screen by moving it whole, bubble and character.
  const top = Math.min(y, mascot.y + ART.top * s);
  const bottom = Math.max(y + h, mascot.y + s);
  const floor = viewport.height - (viewport.bottomInset ?? EDGE);
  const ceiling = viewport.topInset ?? EDGE;
  let shift = 0;
  if (bottom > floor) shift = floor - bottom;
  if (top + shift < ceiling) shift = ceiling - top;

  const bubbleBox = { x: Math.round(x), y: Math.round(y + shift), width: Math.round(w), height: Math.round(h) };
  const mascotBox = { x: Math.round(mascot.x), y: Math.round(mascot.y + shift), size: s };
  // The tail aims at the character's mouth (side bubbles) or head (above).
  const tail = spec.side === "above"
    ? { edge: "bottom", offset: Math.round(clamp(mascotBox.x + s / 2 - bubbleBox.x, 22, w - 22)) }
    : { edge: spec.side === "left" ? "right" : "left", offset: Math.round(clamp(mascotBox.y + ART.mouth * s - bubbleBox.y, 18, h - 18)) };
  return { kind: plan.kind, mobile: plan.mobile, side: spec.side, bubble: bubbleBox, mascot: mascotBox, tail, enter: plan.enter };
}
