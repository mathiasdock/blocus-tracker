import test from "node:test";
import assert from "node:assert/strict";
import { COACH_PRESETS, coachMetrics, placeCoach, planCoach } from "../lib/mascotPlacement.mjs";
import { timerExamUrgency } from "../lib/timerExamContext.mjs";

const rect = (left, top, width, height) => ({ left, top, right: left + width, bottom: top + height, width, height });
const phone = { width: 375, height: 812, topInset: 12, bottomInset: 92 };
const desktop = { width: 1440, height: 900, topInset: 12, bottomInset: 12 };
const place = (kind, rects, viewport, bubble = { width: 220, height: 50 }) =>
  placeCoach(planCoach(kind, rects, viewport), bubble, viewport);

test("every anchor kind has a phone and a desktop placement", () => {
  for (const kind of ["studyBlocks", "focusBlocks", "exam", "mission"]) {
    assert.equal(typeof COACH_PRESETS[kind].mobile, "function", kind);
    assert.equal(typeof COACH_PRESETS[kind].desktop, "function", kind);
  }
  assert.deepEqual(coachMetrics(375), { mobile: true, size: 84, bubbleMax: 252 });
  assert.deepEqual(coachMetrics(1440), { mobile: false, size: 100, bubbleMax: 280 });
});

test("a coach never floats alone: an off-screen anchor hides it", () => {
  assert.equal(planCoach("exam", { anchor: rect(20, -300, 200, 80) }, phone), null);
  assert.equal(planCoach("exam", { anchor: rect(500, 200, 200, 80) }, phone), null);
});

test("desktop Study Blocks: half outside the card edge, bubble above and clear of the digits", () => {
  const frame = rect(268, 28, 749, 460);
  const anchor = rect(423, 265, 440, 38);
  const clear = rect(481, 120, 323, 140);
  const coach = place("studyBlocks", { anchor, frame, clear }, desktop, { width: 181, height: 78 });
  assert.equal(coach.mascot.size, 100);
  assert.ok(coach.mascot.x < frame.right && coach.mascot.x + 100 > frame.right, "straddles the right edge");
  assert.equal(coach.mascot.y + 100, anchor.bottom, "stands level with the blocks");
  assert.equal(coach.side, "above");
  assert.ok(coach.bubble.x >= clear.right + 14, "bubble keeps clear of the digits");
  assert.ok(coach.bubble.y + coach.bubble.height <= coach.mascot.y + 12, "bubble above the character");
  assert.equal(coach.tail.edge, "bottom");
});

test("phone Study Blocks: beside the digits, the bubble stops above the blocks", () => {
  const frame = rect(20, 77, 335, 423);
  const anchor = rect(36, 256, 303, 38);
  const coach = place("studyBlocks", { anchor, frame }, phone, { width: 240, height: 50 });
  assert.equal(coach.mascot.size, 84);
  assert.ok(coach.mascot.x + 84 <= phone.width - 6, "inside the viewport");
  assert.equal(coach.mascot.y + 84, anchor.top - 2, "stands on the blocks' caption line");
  assert.equal(coach.side, "left");
  assert.equal(coach.bubble.y + coach.bubble.height, anchor.top + 22, "ends before the blocks themselves");
  assert.equal(coach.tail.edge, "right");
  assert.ok(coach.bubble.x >= 12);
});

test("the exam bubble never covers the exam's own text", () => {
  const frame = rect(20, 77, 335, 287);
  const anchor = rect(41, 218, 293, 125);
  const text = rect(41, 237, 128, 105);
  const coach = place("exam", { anchor, frame, text }, phone, { width: 150, height: 44 });
  assert.ok(coach.bubble.x >= text.right + 12);
  assert.ok(coach.mascot.y + 84 > frame.bottom, "peeks below the card edge");
});

test("phone exam: a long title does not push the bubble off its short date line", () => {
  const frame = rect(20, 77, 335, 323);
  const anchor = rect(41, 194, 293, 125);
  const lines = [rect(68, 216, 91, 15), rect(41, 241, 290, 24), rect(41, 265, 120, 24), rect(41, 299, 50, 19)];
  const coach = place("exam", { anchor, frame, text: rect(41, 216, 290, 102), lines }, phone, { width: 158, height: 41 });
  assert.ok(coach.bubble.y + coach.bubble.height <= frame.bottom - 64, "ends above the card's last row");
  assert.ok(coach.bubble.y >= 265 + 24, "stays below the title");
  assert.ok(coach.bubble.x >= 91 + 12, "keeps clear of the date line");
  assert.ok(coach.mascot.x > frame.left + frame.width / 2, "never flips over the exam's text");
});

test("phone exam: with Today's next actions listed, the character stands above the list", () => {
  const frame = rect(20, 77, 335, 435);
  const anchor = rect(41, 194, 293, 125);
  const floor = rect(41, 335, 293, 96);
  const lines = [rect(68, 216, 91, 15), rect(41, 241, 128, 24), rect(56, 271, 51, 19), rect(41, 299, 50, 19)];
  const coach = place("exam", { anchor, frame, floor, text: rect(41, 216, 128, 102), lines }, phone, { width: 158, height: 41 });
  assert.ok(coach.mascot.y + 84 <= floor.top + 4, "feet above the list's ▶ buttons");
  assert.ok(coach.bubble.x >= 169 + 12, "the bubble keeps clear of the exam's title");
});

test("flip: a bubble without room on its side opens on the other side", () => {
  // Mission on desktop opens above-left of a character leaning out of the
  // card's left edge; against the viewport's left edge it must mirror.
  const frame = rect(40, 28, 360, 430);
  const spot = rect(60, 283, 320, 110);
  const coach = place("mission", { anchor: frame, frame, spot }, desktop, { width: 200, height: 70 });
  assert.ok(coach.bubble.x >= 12);
  assert.ok(coach.mascot.x + 100 * 0.22 >= 0, "the drawn character stays on screen");
});

test("the whole object moves to stay above the phone tab bar", () => {
  const frame = rect(20, 600, 335, 180);
  const coach = place("exam", { anchor: rect(41, 650, 293, 100), frame, text: rect(41, 650, 120, 100) }, phone, { width: 150, height: 44 });
  assert.ok(coach.mascot.y + 84 <= phone.height - phone.bottomInset);
  assert.ok(coach.bubble.y + coach.bubble.height <= coach.mascot.y + 84);
});

test("the tail stays on the bubble's straight edge", () => {
  const coach = place("focusBlocks", { anchor: rect(24, 389, 327, 22), frame: rect(125, 233, 125, 16) }, phone, { width: 230, height: 50 });
  assert.ok(coach.tail.offset >= 18 && coach.tail.offset <= coach.bubble.height - 18);
});

test("exam urgency changes at tomorrow and the week boundary", () => {
  assert.equal(timerExamUrgency(68), "calm");
  assert.equal(timerExamUrgency(8), "calm");
  assert.equal(timerExamUrgency(7), "week");
  assert.equal(timerExamUrgency(2), "week");
  assert.equal(timerExamUrgency(1), "urgent");
  assert.equal(timerExamUrgency(0), "urgent");
});
