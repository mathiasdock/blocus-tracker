import test from "node:test";
import assert from "node:assert/strict";
import { swipeAxis, swipeDestination } from "../lib/socialSwipe.mjs";

const destination = overrides => swipeDestination({ index: 1, count: 3, dx: -120, dy: 5, elapsed: 400, width: 390, ...overrides });

test("small touches and mostly vertical drags remain native", () => {
  assert.equal(swipeAxis(4, 8), null);
  assert.equal(swipeAxis(25, 90), "vertical");
  assert.equal(swipeAxis(80, 70), "vertical");
  assert.equal(destination({ dx: 25, dy: 90 }), 1);
});
test("left/right gestures navigate exactly one adjacent tab", () => {
  assert.equal(destination({}), 2);
  assert.equal(destination({ dx: 120 }), 0);
  assert.equal(destination({ dx: -800 }), 2);
});
test("short flicks commit, hesitant short drags do not", () => {
  assert.equal(destination({ dx: -45, elapsed: 70 }), 2);
  assert.equal(destination({ dx: -45, elapsed: 500 }), 1);
  assert.equal(destination({ dx: -20, elapsed: 1 }), 1);
});
test("first/last tabs never wrap", () => {
  assert.equal(destination({ index: 0, dx: 150 }), 0);
  assert.equal(destination({ index: 2, dx: -150 }), 2);
});
test("distance threshold adapts to phone and tablet widths", () => {
  assert.equal(destination({ width: 320, dx: -72 }), 2);
  assert.equal(destination({ width: 820, dx: -90 }), 1);
  assert.equal(destination({ width: 820, dx: -110 }), 2);
});
