import test from "node:test";
import assert from "node:assert/strict";
import { placeMascotCallout } from "../lib/mascotPlacement.mjs";
import { timerExamUrgency } from "../lib/timerExamContext.mjs";

const rect = (left, top, width, height) => ({ left, top, right: left + width, bottom: top + height, width, height });

test("mascot callout stays outside its anchor when there is room", () => {
  const anchor = rect(300, 120, 200, 140);
  const placed = placeMascotCallout(anchor, { width: 220, height: 72 }, { width: 1000, height: 700 });
  assert.equal(placed.x, anchor.right + 10);
});

test("mascot callout avoids nearby controls and stays within a narrow viewport", () => {
  const anchor = rect(12, 120, 296, 70);
  const obstacle = rect(88, 200, 220, 72);
  const placed = placeMascotCallout(anchor, { width: 260, height: 72 },
    { width: 320, height: 640, bottomInset: 84 }, [obstacle]);
  assert.ok(placed.x >= 12 && placed.x + 260 <= 308);
  assert.ok(placed.y >= 12 && placed.y + 72 <= 556);
  assert.equal(placed.y < obstacle.top || placed.y >= obstacle.bottom, true);
});

test("a nearby clear strip wins over a disconnected viewport corner", () => {
  const anchor = rect(24, 172, 340, 100);
  const obstacles = [
    rect(20, 68, 346, 24),
    rect(44, 136, 298, 24),
    rect(44, 172, 298, 100),
    rect(44, 292, 298, 48),
    rect(44, 408, 298, 24),
  ];
  const placed = placeMascotCallout(anchor, { width: 202, height: 68 },
    { width: 390, height: 844, bottomInset: 84 }, obstacles);
  assert.equal(placed.y, 340);
});

test("offscreen source does not leave a floating mascot behind", () => {
  assert.equal(placeMascotCallout(rect(20, -200, 200, 70), { width: 200, height: 70 },
    { width: 390, height: 800 }), null);
  assert.equal(placeMascotCallout(rect(500, 200, 200, 70), { width: 200, height: 70 },
    { width: 390, height: 800 }), null);
});

test("exam urgency changes at tomorrow and the week boundary", () => {
  assert.equal(timerExamUrgency(68), "calm");
  assert.equal(timerExamUrgency(8), "calm");
  assert.equal(timerExamUrgency(7), "week");
  assert.equal(timerExamUrgency(2), "week");
  assert.equal(timerExamUrgency(1), "urgent");
  assert.equal(timerExamUrgency(0), "urgent");
});
