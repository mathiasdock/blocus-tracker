import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dailyStudyGoalSeconds, fetchDailyObjectives } from "../lib/dailyStudyGoal.mjs";

const today = "2026-10-05";
const planned = (minutes, extra = {}) => ({ scheduled_date: today, target_minutes: minutes, ...extra });

for (const [label, rows, seconds] of [
  ["one planned hour", [planned(60)], 3600],
  ["two hours plus three hours", [planned(120), planned(180)], 18000],
  ["only untimed objectives", [planned(null), planned(undefined)], 7200],
  ["one hour plus an untimed objective", [planned(60), planned(null)], 3600],
  ["no objectives", [], 7200],
  ["completed work remains in today's target", [planned(60, { done: true }), planned(30)], 5400],
  ["other days do not change today's target", [planned(60), planned(180, { scheduled_date: "2026-10-06" })], 3600],
  ["invalid durations do not invent time", [null, planned(0), planned(-15), planned(NaN), planned(Infinity), planned("bad"), planned(true)], 7200],
  ["numeric data stays exact, without quarter-hour rounding", [planned("7"), planned(18)], 1500],
]) {
  test(label, () => assert.equal(dailyStudyGoalSeconds(rows, today), seconds));
}

test("an unspecified day cannot pick up undated objectives", () => {
  assert.equal(dailyStudyGoalSeconds([{ target_minutes: 60 }]), 7200);
});

test("shared read is scoped to the account and exact local planning date, including done objectives", async () => {
  const calls = [];
  const result = { data: [planned(60, { done: true })], error: null };
  const query = {
    select(columns) { calls.push(["select", columns]); return this; },
    eq(column, value) { calls.push(["eq", column, value]); return this; },
    order(column) { calls.push(["order", column]); return Promise.resolve(result); },
  };
  const client = { from(table) { calls.push(["from", table]); return query; } };
  assert.equal(await fetchDailyObjectives(client, "member", today), result);
  assert.deepEqual(calls, [["from", "objectives"], ["select", "*"], ["eq", "user_id", "member"],
    ["eq", "scheduled_date", today], ["order", "done"]]);
  calls.length = 0;
  result.error = { message: "Unavailable" };
  assert.equal((await fetchDailyObjectives(client, "member", today, "scheduled_date, target_minutes")).error, result.error,
    "a failed read is not silently presented as an empty plan");
});

test("Stats and Timer wire all daily progress to the same source, not the session target", () => {
  const stats = readFileSync(new URL("../pages/stats.js", import.meta.url), "utf8");
  const timer = readFileSync(new URL("../pages/dashboard.js", import.meta.url), "utf8");
  for (const source of [stats, timer]) {
    assert.match(source, /dailyStudyGoalSeconds\(todayObjectives, todayDate\)/);
    assert.match(source, /fetchDailyObjectives\(supabase, user.id, todayDate/);
    assert.match(source, /goalSecs=\{dailyGoalSecs\}/);
    assert.doesNotMatch(source, /DAILY_GOAL_SECS/);
  }
  assert.match(timer, /totalToday \+ todayPart\) \/ dailyGoalSecs/);
  assert.match(timer, /totalToday < dailyGoalSecs && totalToday \+ elapsed >= dailyGoalSecs/);
  assert.doesNotMatch(timer, /cached \? Promise.resolve\(\{ data: cached.objectives/);
  assert.match(stats, /objectivesRes.error\) \{ setLoadFailed\(true\)/);
});
