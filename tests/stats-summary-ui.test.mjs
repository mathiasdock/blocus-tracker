import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { translate } from "../lib/i18n.js";
import { formatStudyTime } from "../lib/format.js";
import { computeInsights } from "../lib/statsInsights.mjs";

const require = createRequire(import.meta.url);
const React = require("react");
const { act, create } = require("react-test-renderer");
const { transformSync } = require("@babel/core");
const styles = new Proxy({}, { get: (_, key) => key === "__esModule" ? false : String(key) });
const Archived = () => null;

function compile(file, lang) {
  const module = { exports: {} };
  const { code } = transformSync(readFileSync(new URL(`../components/stats/${file}.js`, import.meta.url), "utf8"), {
    filename: `${file}.js`, babelrc: false, configFile: false,
    presets: [[require.resolve("next/babel"), { "preset-react": { runtime: "automatic" } }]],
    plugins: [require.resolve("@babel/plugin-transform-modules-commonjs")],
  });
  const mocks = {
    "../../contexts/I18nContext": { useI18n: () => ({ lang, t: key => translate(lang, key) }) },
    "../../lib/format": { formatStudyTime },
    "../Glyph": ({ children }) => React.createElement("svg", { "aria-hidden": true }, children),
    "./ArchivedCourses": Archived,
    "./StudySummary.module.css": styles,
  };
  vm.runInNewContext(code, { module, exports: module.exports, require: id => id in mocks ? mocks[id] : require(id) });
  return module.exports.default;
}

const sessions = [
  { started_at: "2026-10-05T13:00:00", duration_seconds: 3600 },
  { started_at: "2026-10-06T14:00:00", duration_seconds: 5400 },
  { started_at: "2026-10-07T08:00:00", duration_seconds: 1800 },
];
const insights = computeInsights(sessions);
const text = node => typeof node === "string" || typeof node === "number" ? String(node)
  : (node?.children || []).map(text).join(" ");

for (const lang of ["fr", "en"]) {
  test(`records lead with the longest session and retain every exact summary (${lang})`, () => {
    const History = compile("StudyHistory", lang);
    let page;
    act(() => { page = create(React.createElement(History, { insights, allTimeSecs: 10800 })); });
    const main = page.root.findByProps({ className: "mainRecord" });
    assert.equal(main.findByType("dt").children.filter(child => typeof child === "string").join(""), translate(lang, "stats.perfLongest"));
    assert.ok(text(page.toJSON()).includes(translate(lang, "stats.perfLongest")));
    assert.equal(main.findByType("dd").children.join(""), formatStudyTime(insights.longestSessionSecs));
    const periods = page.root.findAllByProps({ className: "periodRecord" });
    assert.equal(periods.length, 3);
    const values = [insights.bestDaySecs, insights.bestWeekSecs, insights.bestMonthSecs];
    const labels = ["stats.recordDay", "stats.recordWeek", "stats.recordMonth"];
    const accessibleLabels = ["stats.perfBestDay", "stats.recBestWeek", "stats.recBestMonth"];
    periods.forEach((period, i) => {
      assert.equal(period.findByType("dt").children.join(""), translate(lang, labels[i]));
      assert.equal(period.findByType("dt").props["aria-label"], translate(lang, accessibleLabels[i]));
      assert.equal(period.findByType("dd").children.join(""), formatStudyTime(values[i]));
    });
    const total = page.root.findByProps({ className: "totalRecord" });
    assert.equal(total.findByType("dt").children.join(""), translate(lang, "stats.recTotal"));
    assert.equal(total.findByType("dd").children.join(""), formatStudyTime(10800));
    act(() => page.unmount());
  });

  test(`habits emphasize the real dominant period, preserving shares and all four facts (${lang})`, () => {
    const Habits = compile("StudyHabits", lang);
    let page;
    act(() => { page = create(React.createElement(Habits, { insights })); });
    assert.equal(page.root.findByProps({ className: "dominantPeriod" }).children.join(""), translate(lang, "stats.slotAfternoon"));
    const rows = page.root.findAllByType("li");
    assert.equal(rows.length, 4);
    assert.equal(rows.filter(row => row.props["data-dominant"]).length, 1);
    ["morning", "afternoon", "evening", "night"].forEach((slot, i) => {
      const track = rows[i].findByProps({ className: "slotTrack" });
      assert.equal(track.props["aria-hidden"], "true");
      const share = insights.timeOfDay[slot] / Object.values(insights.timeOfDay).reduce((a, b) => a + b, 0);
      assert.equal(track.findByProps({ className: "slotFill" }).props.style.inlineSize, share > 0 ? `max(2px, ${share * 100}%)` : 0);
      assert.equal(rows[i].findByProps({ className: "font-num slotShare" }).children.join(""), `${insights.timeOfDayPct[slot]}%`);
    });
    const facts = page.root.findAllByProps({ className: "habitFact" });
    assert.equal(facts.length, 4);
    ["stats.habitTopDay", "stats.habitTopHour", "stats.habitAvgSession", "stats.habitAvgStart"].forEach((key, i) => {
      assert.equal(facts[i].findByType("dt").children.join(""), translate(lang, key));
    });
    assert.equal(facts[2].findByType("dd").children.join(""), formatStudyTime(insights.avgSessionSecs));
    act(() => page.unmount());
  });
}

test("empty accounts do not invent records or habits; archived-course actions remain accessible", () => {
  const History = compile("StudyHistory", "en"), Habits = compile("StudyHabits", "en");
  const empty = computeInsights([]);
  let history, habits;
  act(() => {
    history = create(React.createElement(History, { insights: empty, allTimeSecs: 0 }));
    habits = create(React.createElement(Habits, { insights: empty }));
  });
  assert.equal(history.toJSON(), null); assert.equal(habits.toJSON(), null);
  const archived = [{ id: "archived-course", name: "Accounting", secs: 120 }];
  const restore = () => {}, remove = () => {};
  act(() => history.update(React.createElement(History, { insights: empty, archived, archivedBusyId: "archived-course", onRestoreCourse: restore, onDeleteCourse: remove })));
  assert.equal(history.root.findAllByType("h2").length, 0);
  const button = history.root.findByType("button");
  assert.equal(button.props["aria-expanded"], false);
  act(() => button.props.onClick());
  assert.equal(history.root.findByType("button").props["aria-expanded"], true);
  const child = history.root.findByType(Archived);
  assert.equal(child.props.rows, archived); assert.equal(child.props.busyId, "archived-course");
  assert.equal(child.props.onRestore, restore); assert.equal(child.props.onDelete, remove);
  act(() => { history.unmount(); habits.unmount(); });
});

test("sub-minute records, unknown average starts and large totals remain truthful", () => {
  const History = compile("StudyHistory", "fr"), Habits = compile("StudyHabits", "fr");
  const sparse = computeInsights([{ started_at: "2026-10-05T00:00:00", duration_seconds: 7 }]);
  let history, habits;
  act(() => {
    history = create(React.createElement(History, { insights: sparse, allTimeSecs: 1000 * 3600 }));
    habits = create(React.createElement(Habits, { insights: { ...sparse, avgStartMinutes: null } }));
  });
  assert.equal(history.root.findByProps({ className: "mainRecord" }).findByType("dd").children.join(""), formatStudyTime(7));
  assert.ok(text(history.toJSON()).includes(formatStudyTime(1000 * 3600)));
  assert.equal(habits.root.findAllByProps({ className: "habitFact" })[3].findByType("dd").children.join(""), "—");
  act(() => { history.unmount(); habits.unmount(); });
});

test("no studied time does not claim a dominant period", () => {
  const Habits = compile("StudyHabits", "en");
  const zero = computeInsights([{ started_at: "2026-10-05T00:00:00", duration_seconds: 0 }]);
  let page;
  act(() => { page = create(React.createElement(Habits, { insights: zero })); });
  if (zero.hasData) {
    assert.equal(page.root.findByProps({ className: "dominantPeriod" }).children.join(""), "—");
    assert.ok(page.root.findAllByType("li").every(row => !row.props["data-dominant"]));
  } else {
    assert.equal(page.toJSON(), null);
  }
  act(() => page.unmount());
});

test("summary metrics stay unboxed; backgrounds belong only to the distribution bars", () => {
  const css = readFileSync(new URL("../components/stats/StudySummary.module.css", import.meta.url), "utf8");
  for (const block of css.matchAll(/([^{}]+)\{([^{}]+)\}/g)) {
    if (/background\s*:/.test(block[2])) assert.match(block[1], /slot(?:Track|Fill)/);
    assert.doesNotMatch(block[2], /box-shadow\s*:/);
  }
});
