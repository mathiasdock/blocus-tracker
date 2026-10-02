import test from 'node:test';
import assert from 'node:assert/strict';
import { academicDate, academicKey, academicSummary, academicVisibility, planningAcademicEvents, safeAcademicUrl, ACADEMIC_COLUMNS } from '../lib/planningAcademicEvents.mjs';
import { classifyAcademicEvent } from '../lib/academicEventClassification.mjs';
const course = { id: 'local', name: 'Principles of Advertising', color: '#5544aa' };
const mapping = { source_id: 'canvas', external_course_key: 'course_42', local_course_id: course.id };
function row(title, patch = {}) { return { source_id: 'canvas', external_uid: title, recurrence_id: '', raw_title: title,
  event_date: '2026-10-02', all_day: true, status: 'active', external_course_key: 'course_42', external_course_label: 'ADV 3001',
  ...classifyAcademicEvent({ raw_title: title }), ...patch }; }
function events(rows, maps = [mapping], courses = [course], exams = [], visibility) { return Object.values(planningAcademicEvents(rows, maps, courses, exams, visibility)).flat(); }
test('mapped events use local identity without renaming or mutating courses', () => {
  const value = events([row('Final Exam [ADV 3001]')])[0];
  assert.equal(value.title, 'Final Exam'); assert.equal(value.course_name, course.name); assert.equal(value.color, course.color);
  assert.equal(value.confirmedExam, true); assert.equal(course.name, 'Principles of Advertising');
});
test('unmapped course stays neutral, including stale mappings and identical keys on other sources', () => {
  for (const maps of [[], [{ ...mapping, source_id: 'other' }], [{ ...mapping, local_course_id: 'deleted' }]]) {
    const event = events([row('Quiz 4')], maps)[0];
    assert.equal(event.course_name, 'ADV 3001'); assert.equal(event.color, null); assert.equal(event.course_id, null);
  }
});
test('possible exam stays a deadline until explicitly confirmed; override is resolved independently of mapping', () => {
  const before = events([row('Test 1')], []);
  assert.equal(before[0].confirmedExam, false); assert.equal(academicSummary(before).deadlines, 1);
  const after = events([row('Test 1', { user_override: 'exam' })], []);
  assert.equal(after[0].confirmedExam, true); assert.equal(after[0].course_id, null);
  assert.equal(events([row('Final Exam', { user_override: 'quiz' })])[0].confirmedExam, false);
});
test('dense day summarizes one exam and nine deadlines without losing detail', () => {
  const rows = [row('Final Exam'), row('Group Assignment'), ...Array.from({ length: 8 }, (_, i) => row(`Quiz ${i}`))];
  const result = events(rows); assert.equal(result.length, 10); assert.equal(academicSummary(result).exams.length, 1);
  assert.equal(academicSummary(result).deadlines, 9); assert.equal(result[0].title, 'Final Exam'); assert.equal(result[1].importance, 'major');
});
test('visibility filters display only, with normal events enabled but aggregated by default', () => {
  const rows = [row('Test 1'), row('Final Exam'), row('Group Assignment'), row('Quiz 1')];
  const snapshot = structuredClone(rows);
  assert.equal(events(rows, undefined, undefined, undefined, { exams: false, major: true, normal: false }).length, 1);
  assert.equal(events(rows, undefined, undefined, undefined, { exams: true, major: false, normal: false }).length, 2);
  assert.deepEqual(rows, snapshot); assert.equal(academicVisibility().normal, true);
  assert.deepEqual(academicVisibility({ exams: false, major: 'bad' }), { exams: false, major: true, normal: true });
});
test('exact local exam deduplication preserves different exams and does not dedupe possible exams', () => {
  const local = { course_id: course.id, exam_date: '2026-10-02', name: 'Final Exam' };
  assert.equal(events([row('Final Exam [ADV 3001]')], undefined, undefined, [local]).length, 0);
  assert.equal(events([row('Midterm')], undefined, undefined, [local]).length, 1);
  assert.equal(events([row('Final Exam')], [], undefined, [local]).length, 1);
  assert.equal(events([row('Test 1')], undefined, undefined, [{ ...local, name: 'Test 1' }]).length, 1);
});
test('all-day and floating dates retain their calendar day while instants follow the device timezone', () => {
  assert.equal(academicDate(row('Quiz', { starts_at: '2026-10-01T23:00:00Z' })), '2026-10-02');
  assert.equal(academicDate(row('Quiz', { all_day: false, floating_at: '2026-10-03T23:59:00' })), '2026-10-03');
  const prior = process.env.TZ; process.env.TZ = 'America/New_York';
  try { assert.equal(academicDate(row('Quiz', { all_day: false, due_at: '2026-10-03T02:00:00Z' })), '2026-10-02'); }
  finally { if (prior === undefined) delete process.env.TZ; else process.env.TZ = prior; }
});
test('same UID on different sources or recurrence instances has distinct identity', () => {
  const a = row('Quiz'); assert.notEqual(academicKey(a), academicKey({ ...a, source_id: 'moodle' }));
  assert.notEqual(academicKey(a), academicKey({ ...a, recurrence_id: '20261003' }));
});
test('removed events never display and unsafe URLs never become source links', () => {
  assert.equal(events([row('Quiz', { status: 'cancelled' })]).length, 0);
  for (const url of ['javascript:alert(1)', 'data:text/html,hi', '//example.org', null]) assert.equal(safeAcademicUrl(url), null);
  assert.equal(safeAcademicUrl('https://canvas.example.edu/courses/42'), 'https://canvas.example.edu/courses/42');
  assert.ok(!ACADEMIC_COLUMNS.includes('feed')); assert.ok(!ACADEMIC_COLUMNS.includes('description'));
});
