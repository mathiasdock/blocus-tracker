import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import * as planning from '../lib/planningAcademicEvents.mjs';
import * as classification from '../lib/academicEventClassification.mjs';
import { loadHiddenCalendarItems, loadCalendarVisibility } from '../lib/calendarPreferences.mjs';
const require = createRequire(import.meta.url);
const React = require('react');
const { act, create } = require('react-test-renderer');
const { transformSync } = require('@babel/core');
const { code } = transformSync(readFileSync(new URL('../components/AcademicDeadlines.js', import.meta.url), 'utf8'), {
  babelrc: false, configFile: false,
  presets: [[require.resolve('next/dist/compiled/babel/preset-react'), { runtime: 'automatic' }]],
  plugins: [require.resolve('@babel/plugin-transform-modules-commonjs')],
});
const module = { exports: {} };
vm.runInNewContext(code, { module, exports: module.exports, require: name => {
  if (name.endsWith('planningAcademicEvents.mjs')) return planning;
  if (name.endsWith('academicEventClassification.mjs')) return classification;
  if (name === './Glyph' || name === './PlanningExamMark') return { __esModule: true, default: props => React.createElement('span', props) };
  return require(name);
}, Date });
function mount() {
  const calls = [];
  const event = { key: 's/1', source_id: 's', external_uid: '1', title: 'Test 1', date: new Date().toLocaleDateString('en-CA'),
    all_day: true, course_name: 'Advertising', course_id: 'course', event_type: 'exam', confirmedExam: false, user_override: null,
    external_url: 'https://canvas.example.edu/courses/1', external_course_key: 'c' };
  const calendar = { sources: [{ id: 's', display_name: 'Canvas' }],
    override: async (event, type) => calls.push(['override', type]), hide: async event => calls.push(['hide', event.external_uid]),
    mapCourse: async (event, course) => calls.push(['course', course]) };
  let renderer;
  act(() => { renderer = create(React.createElement(module.exports.default, {
    events: [event], calendar, courses: [{ id: 'course', name: 'Advertising' }], t: key => key, lang: 'en', onPlan: event => calls.push(['plan', event.external_uid]),
  }), { createNodeMock: () => ({ open: false, querySelector: () => ({ focus() {} }) }) }); });
  const button = label => renderer.root.findAllByType('button').find(b => b.children.includes(label));
  return { renderer, calls, button };
}
test('default event detail has no forms; editors appear only after choosing a secondary action', async () => {
  const { renderer, button, calls } = mount();
  assert.equal(renderer.root.findAllByType('select').length, 0);
  assert.equal(renderer.root.findByProps({ className: 'bt-academic-title' }).children[0], 'Test 1');
  assert.ok(JSON.stringify(renderer.toJSON()).includes('academic.dueToday'));
  assert.equal(renderer.root.findByType('li').props['data-exam'], undefined);
  await act(async () => button('academic.planWork').props.onClick());
  assert.deepEqual(calls, [['plan', '1']]);
  act(() => button('academic.changeType').props.onClick());
  assert.equal(renderer.root.findAllByType('select').length, 1);
  act(() => button('common.cancel').props.onClick());
  assert.equal(renderer.root.findAllByType('select').length, 0);
  await act(async () => button('uc.keepDeadline').props.onClick());
  await act(async () => button('uc.confirmExam').props.onClick());
  await act(async () => button('academic.hide').props.onClick());
  assert.deepEqual(calls.slice(1), [['override', 'other'], ['override', 'exam'], ['hide', '1']]);
  act(() => renderer.unmount());
});
test('all hidden decisions load beyond the API row limit; failed pages never return partial decisions', async () => {
  const rows = Array.from({ length: 1100 }, (_, i) => ({ source_id: 's', external_uid: String(i) }));
  const requests = [];
  let fail = false;
  const db = { from() { return { select() { return this; }, in() { return this; }, order() { return this; },
    range(from, to) { requests.push([from, to]); return Promise.resolve(fail && from === 500 ? { error: 'offline' } : { data: rows.slice(from, to + 1) }); } }; } };
  assert.equal((await loadHiddenCalendarItems(db, ['s'])).data.length, 1100);
  assert.deepEqual(requests, [[0, 499], [500, 999], [1000, 1499]]);
  fail = true;
  assert.deepEqual(await loadHiddenCalendarItems(db, ['s']), { error: 'offline', data: null });
});

test('legacy device visibility migrates once and never replaces existing account preferences', async () => {
  let saved = null, writes = 0;
  const db = { from() { return { select() { return this; }, eq() { return this; }, maybeSingle() { return Promise.resolve({ data: saved, error: null }); },
    upsert(row, options) { assert.equal(options.ignoreDuplicates, true); writes++; saved ||= row; return Promise.resolve({ error: null }); } }; } };
  const first = await loadCalendarVisibility(db, 'owner', () => '{"exams":false,"normal":false}');
  assert.equal(first.data.exams, false); assert.equal(first.data.major, true); assert.equal(first.data.user_id, 'owner');
  await loadCalendarVisibility(db, 'owner', () => '{"exams":true}');
  assert.equal(writes, 1); assert.equal(saved.exams, false);
});
