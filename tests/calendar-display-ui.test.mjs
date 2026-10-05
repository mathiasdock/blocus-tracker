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
// Compile a component file for react-test-renderer. Portals cannot render
// there, so the floating surface is replaced by its open/closed contract.
function compile(path, modules) {
  const { code } = transformSync(readFileSync(new URL(path, import.meta.url), 'utf8'), {
    babelrc: false, configFile: false,
    presets: [[require.resolve('next/dist/compiled/babel/preset-react'), { runtime: 'automatic' }]],
    plugins: [require.resolve('@babel/plugin-transform-modules-commonjs')],
  });
  const module = { exports: {} };
  vm.runInNewContext(code, { module, exports: module.exports, require: name => modules[name] || require(name), Date, window: { open() {} } });
  return module.exports;
}
const stub = props => React.createElement('span', props);
const PlanPopover = { __esModule: true, default: ({ open, children }) => (open ? React.createElement('div', { 'data-popover': '1' }, children) : null) };
const PlanMenu = compile('../components/planning/PlanMenu.js', { '../Glyph': { __esModule: true, default: stub }, './PlanPopover': PlanPopover });
const deadlines = compile('../components/AcademicDeadlines.js', {
  '../lib/planningAcademicEvents.mjs': planning, '../lib/academicEventClassification.mjs': classification,
  './Glyph': { __esModule: true, default: stub }, './PlanningExamMark': { __esModule: true, default: stub },
  './planning/PlanPopover': PlanPopover, './planning/PlanMenu': PlanMenu,
});
const today = new Date().toLocaleDateString('en-CA');
const possibleExam = () => ({ key: 's/1', source_id: 's', external_uid: '1', title: 'Test 1', date: today,
  all_day: true, course_name: 'Advertising', course_id: 'course', color: '#3b82f6', event_type: 'exam', confirmedExam: false,
  user_override: null, external_url: 'https://canvas.example.edu/courses/1', external_course_key: 'c' });
function fakeCalendar(calls) {
  return { sources: [{ id: 's', provider: 'canvas', display_name: 'Canvas' }],
    override: async (event, type) => calls.push(['override', type]), hide: async event => calls.push(['hide', event.external_uid]),
    mapCourse: async (event, course) => calls.push(['course', course]) };
}
const textOf = node => (typeof node === 'string' ? node : (node.children || []).map(textOf).join(' '));
const label = (node, text) => node.findAllByType('button').find(b => textOf(b).includes(text) || b.props['aria-label'] === text);
function actions(event = possibleExam()) {
  const calls = [];
  let renderer;
  act(() => { renderer = create(React.createElement(deadlines.AcademicActions, {
    event, calendar: fakeCalendar(calls), courses: [{ id: 'course', name: 'Advertising', color: '#3b82f6' }, { id: 'other', name: 'Finance', color: '#14b8a6' }],
    t: key => key, lang: 'en', onPlan: e => calls.push(['plan', e.external_uid]), onClose: () => calls.push(['close']),
  })); });
  return { renderer, calls, button: text => label(renderer.root, text) };
}

test('an imported deadline is a quiet row: title, course, type, due — no form, nothing to administer', () => {
  const calls = [];
  let renderer;
  act(() => { renderer = create(React.createElement(deadlines.default, {
    events: [possibleExam()], calendar: fakeCalendar(calls), courses: [], t: key => key, lang: 'en', onPlan: () => {},
  })); });
  const json = JSON.stringify(renderer.toJSON());
  assert.ok(json.includes('Test 1') && json.includes('Advertising') && json.includes('academic.possibleExam') && json.includes('academic.dueToday'));
  assert.equal(renderer.root.findAllByType('select').length, 0);
  assert.equal(renderer.root.findAllByType('input').length, 0);
  const row = renderer.root.findByProps({ className: 'bt-academic-row' });
  assert.equal(row.props['aria-expanded'], false);
  assert.equal(renderer.root.findAllByProps({ 'data-popover': '1' }).length, 0, 'actions stay closed until asked for');
  act(() => row.props.onClick());
  assert.equal(renderer.root.findAllByProps({ 'data-popover': '1' }).length, 1);
  assert.equal(calls.length, 0, 'opening never writes');
  act(() => renderer.unmount());
});

test('the popover has one primary action, Plan work; a possible exam asks a yes/no question', async () => {
  const { button, calls, renderer } = actions();
  assert.equal(button('academic.planWork').props.className.includes('btn-primary'), true);
  assert.equal(renderer.root.findAllByProps({ className: 'btn-primary min-h-11 flex-1 px-4' }).length, 1);
  await act(async () => button('academic.planWork').props.onClick());
  assert.deepEqual(calls, [['close'], ['plan', '1']]);
  const decide = actions();
  await act(async () => decide.button('academic.markExam').props.onClick());
  assert.deepEqual(decide.calls, [['override', 'exam'], ['close']]);
  const keep = actions();
  await act(async () => keep.button('uc.keepDeadline').props.onClick());
  assert.deepEqual(keep.calls, [['override', 'other'], ['close']]);
});

test('secondary actions live behind « … »: source, type, course and hide — menus, never forms', async () => {
  const { button, calls, renderer } = actions();
  act(() => button('academic.moreActions').props.onClick());
  const items = renderer.root.findAll(node => node.props.role === 'menuitem' || node.props.role === 'menuitemcheckbox');
  assert.deepEqual(items.map(item => textOf(item).match(/academic\.[a-zA-Z]+/)?.[0]), ['academic.openIn', 'academic.changeType', 'academic.changeCourse', 'academic.hide']);
  act(() => button('academic.changeType').props.onClick());
  assert.equal(renderer.root.findAllByType('select').length, 0);
  const auto = renderer.root.findAll(node => node.props.role === 'menuitemcheckbox' && textOf(node).includes('academic.automatic'))[0];
  assert.equal(auto.props['aria-checked'], true, 'no override = automatic is the checked option');
  await act(async () => label(renderer.root, 'academic.type.quiz').props.onClick());
  assert.deepEqual(calls, [['override', 'quiz'], ['close']]);

  const course = actions();
  act(() => course.button('academic.moreActions').props.onClick());
  act(() => course.button('academic.changeCourse').props.onClick());
  await act(async () => course.button('Finance').props.onClick());
  assert.deepEqual(course.calls, [['course', 'other'], ['close']]);

  const hide = actions();
  act(() => hide.button('academic.moreActions').props.onClick());
  await act(async () => hide.button('academic.hide').props.onClick());
  assert.deepEqual(hide.calls, [['hide', '1'], ['close']]);
});

test('a failed save keeps the popover open with an error, and nothing closes', async () => {
  const event = possibleExam();
  let renderer;
  const calls = [];
  act(() => { renderer = create(React.createElement(deadlines.AcademicActions, {
    event, calendar: { ...fakeCalendar(calls), override: async () => { throw new Error('offline'); } }, courses: [], t: key => key, lang: 'en',
    onPlan: () => {}, onClose: () => calls.push(['close']),
  })); });
  await act(async () => label(renderer.root, 'academic.markExam').props.onClick());
  assert.equal(calls.length, 0);
  assert.equal(renderer.root.findAllByProps({ role: 'alert' }).length, 1);
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
