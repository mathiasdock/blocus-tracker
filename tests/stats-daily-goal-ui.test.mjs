import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { translate } from "../lib/i18n.js";
import { formatStudyTime, formatMinutesShort } from "../lib/format.js";
import { dailyStudyGoalSeconds } from "../lib/dailyStudyGoal.mjs";

const require = createRequire(import.meta.url);
const React = require("react");
const { act, create } = require("react-test-renderer");
const { transformSync } = require("@babel/core");
const Mascot = () => null;

function compile(path, lang, extra = {}) {
  const module = { exports: {} };
  const source = readFileSync(new URL(path, import.meta.url), "utf8");
  const { code } = transformSync(source, {
    filename: path, babelrc: false, configFile: false,
    presets: [[require.resolve("next/babel"), { "preset-react": { runtime: "automatic" } }]],
    plugins: [require.resolve("@babel/plugin-transform-modules-commonjs")],
  });
  const mocks = {
    "../AnimatedNumber": ({ value, format }) => React.createElement("span", null, format ? format(value) : value),
    "../Flame": () => null,
    "../Mascot": Mascot,
    "../../contexts/I18nContext": { useI18n: () => ({ lang, t: key => translate(lang, key) }) },
    "../../lib/format": { formatStudyTime, formatMinutesShort },
    "./StatsHero.module.css": new Proxy({}, { get: (_, key) => key === "__esModule" ? false : String(key) }),
    ...extra,
  };
  vm.runInNewContext(code, { module, exports: module.exports, require: id => id in mocks ? mocks[id] : require(id),
    window: { matchMedia: () => ({ matches: true }) }, setTimeout, clearTimeout });
  return module.exports.default;
}
const text = node => typeof node === "string" || typeof node === "number" ? String(node)
  : (node?.children || []).map(text).join(" ");

for (const lang of ["fr", "en"]) {
  test(`hero, mascot and messages follow the exact dynamic target (${lang})`, () => {
    const Hero = compile("../components/stats/StatsHero.js", lang);
    const goalSecs = dailyStudyGoalSeconds([{ scheduled_date: "2026-10-05", target_minutes: 60 }], "2026-10-05");
    let renderer;
    const render = todaySecs => {
      act(() => {
        const element = React.createElement(Hero, { todaySecs, goalSecs, weekSecs: todaySecs, streak: 1 });
        if (renderer) renderer.update(element); else renderer = create(element);
      });
      return renderer.root.findByProps({ role: "progressbar" });
    };
    assert.equal(render(1800).props["aria-valuenow"], 50);
    assert.equal(renderer.root.findByType(Mascot).props.mood, "focused");
    assert.ok(text(renderer.toJSON()).includes(formatStudyTime(goalSecs)));
    assert.ok(text(renderer.toJSON()).includes(translate(lang, "stats.heroStateHalfway").replace("{time}", formatStudyTime(1800))));
    assert.equal(render(3599).props["aria-valuenow"], 99);
    assert.equal(renderer.root.findByType(Mascot).props.mood, "happy");
    assert.equal(render(3600).props["aria-valuenow"], 100);
    assert.equal(renderer.root.findByType(Mascot).props.mood, "proud");
    assert.ok(text(renderer.toJSON()).includes(translate(lang, "stats.heroGoalReached")));
    assert.equal(render(5400).props["aria-valuenow"], 100);
    assert.ok(text(renderer.toJSON()).includes(translate(lang, "stats.heroStateBeyond").replace("{time}", formatStudyTime(1800))));
    assert.equal(renderer.root.findByProps({ className: "walker" }).props.style["--p"], "100%");
    act(() => renderer.unmount());
  });
}

test("historical chart has no target line, invented goal-met color or goal-inflated scale", () => {
  const chartNames = ["BarChart", "Bar", "XAxis", "YAxis", "Cell", "CartesianGrid", "ResponsiveContainer", "ReferenceLine"];
  const recharts = Object.fromEntries(chartNames.map(name => [name, props => React.createElement(name, props, props.children)]));
  const Chart = compile("../components/stats/StudyTimeChart.js", "en", {
    recharts, "../FilterMenu": () => null, "../../lib/statsPeriod": { bucketLongLabel: b => b.iso },
  });
  let renderer;
  act(() => { renderer = create(React.createElement(Chart, {
    series: [{ iso: "2026-10-05", label: "Mon", secs: 60, count: 1, gran: "day" }],
    periodLabel: "This week", period: "7", periodOptions: [], onPeriodChange: () => {},
  })); });
  assert.equal(renderer.root.findAllByType("ReferenceLine").length, 0);
  assert.equal(renderer.root.findByType("Cell").props.fill, "var(--bt-data-study)");
  assert.ok(renderer.root.findByType("YAxis").props.domain[1] < 120);
  assert.ok(!text(renderer.toJSON()).includes("Goal"));
  act(() => renderer.unmount());
});
