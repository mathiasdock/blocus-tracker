import test from "node:test";
import assert from "node:assert/strict";
import { exchangeLocalDate, exchangeState, validateExchange } from "../lib/exchange.mjs";

const exchange = {
  exchange_university: "UCF",
  exchange_start_date: "2026-08-20",
  exchange_end_date: "2026-12-15",
};

test("exchange includes both boundary dates and expires without deleting home university", () => {
  assert.equal(exchangeState(exchange, new Date("2026-08-19T12:00:00Z")), "upcoming");
  assert.equal(exchangeState(exchange, new Date("2026-08-20T12:00:00Z")), "active");
  assert.equal(exchangeState(exchange, new Date("2026-12-15T12:00:00Z")), "active");
  assert.equal(exchangeState(exchange, new Date("2026-12-16T12:00:00Z")), "ended");
  assert.equal(exchangeState({ ...exchange, exchange_university: null }), "none");
});

test("exchange day follows the student's timezone around midnight", () => {
  const instant = new Date("2026-08-20T02:00:00Z");
  assert.equal(exchangeLocalDate(instant, "America/New_York"), "2026-08-19");
  assert.equal(exchangeState(exchange, instant, "America/New_York"), "upcoming");
  assert.equal(exchangeState(exchange, instant, "Europe/Brussels"), "active");
  assert.equal(exchangeLocalDate(instant, "invalid/zone"), "2026-08-20");
});

test("exchange requires a distinct host and a valid ordered date range", () => {
  assert.equal(validateExchange({ home: "ICHEC", host: "UCF", start: "2026-08-20", end: "2026-12-15" }), null);
  assert.equal(validateExchange({ home: "ICHEC", host: "ICHEC", start: "2026-08-20", end: "2026-12-15" }), "same");
  assert.equal(validateExchange({ home: "ICHEC", host: "UCF", start: "2026-12-15", end: "2026-08-20" }), "order");
  assert.equal(validateExchange({ home: "ICHEC", host: "", start: "2026-08-20", end: "2026-12-15" }), "host");
});
