import test from "node:test";
import assert from "node:assert/strict";
import { planningSwipeDirection } from "../lib/planningSwipe.mjs";

test("horizontal left and right swipes select adjacent planning periods", () => {
  assert.equal(planningSwipeDirection(-90, 8), "next");
  assert.equal(planningSwipeDirection(90, -8), "previous");
});

test("vertical scrolling, diagonal movement and taps do not change period", () => {
  assert.equal(planningSwipeDirection(8, 100), null);
  assert.equal(planningSwipeDirection(80, 75), null);
  assert.equal(planningSwipeDirection(-30, 2), null);
  assert.equal(planningSwipeDirection(0, 0), null);
});
