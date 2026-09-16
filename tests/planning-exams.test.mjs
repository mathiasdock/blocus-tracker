import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizePlanningExams, validExamDate, deletePlanningExam, updateLegacyExamDate } from '../lib/planningExams.mjs';

const course = { id: 'pink', name: 'Marketing', exam_date: '2026-09-20' };
const exam = { id: 'exam-1', course_id: 'pink', name: 'Exam 2', exam_date: course.exam_date, exam_time: '14:00' };
test('legacy date is visible without inventing event metadata, including archived courses', () => {
  const rows = normalizePlanningExams([{ ...course, archived_at: '2026-01-01' }]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].source, 'course');
  assert.equal(rows[0].name, null);
  assert.equal(rows[0].exam_time, null);
  assert.equal(rows[0].exam_date, course.exam_date);
});
test('structured event wins exact course+date overlap, retaining its identity and time', () => {
  const rows = normalizePlanningExams([course], [exam, exam]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].id, exam.id);
  assert.equal(rows[0].name, exam.name);
  assert.equal(rows[0].legacy_course_id, course.id);
});
test('two real exams same course/day are not collapsed; legacy adds no third event', () => {
  const second = { ...exam, id: 'exam-2', exam_time: '09:00' };
  assert.deepEqual(normalizePlanningExams([course], [exam, second]).map(e => e.id), ['exam-2', 'exam-1']);
});
test('different known dates and unassigned events survive; no fuzzy title dedupe', () => {
  const rows = normalizePlanningExams([course], [{ ...exam, exam_date: '2026-09-21' }, { ...exam, id: 'unassigned', course_id: null }]);
  assert.equal(rows.length, 3);
  assert.equal(rows.filter(e => e.source === 'course').length, 1);
});
test('invalid dates are not normalized into invented dates; input is immutable', () => {
  for (const date of [null, '', '2026-02-30', '2026-13-01', '2026-9-1', '2026-01-01T00:00:00Z']) assert.equal(validExamDate(date), false);
  assert.equal(validExamDate('2028-02-29'), true);
  const frozen = Object.freeze({ ...exam });
  assert.equal(normalizePlanningExams([{ id: 'bad', exam_date: '2026-02-30' }], [frozen]).length, 1);
  assert.equal(frozen.source, undefined);
});

function fakeClient(responses = []) {
  const calls = [];
  return { calls, from(table) {
    const call = { table, filters: [] }; calls.push(call);
    const query = {
      update(values) { call.update = values; return query; },
      delete() { call.delete = true; return query; },
      eq(...args) { call.filters.push(args); return query; },
      select() { return Promise.resolve(responses.shift() || { data: [{ id: 'ok' }], error: null }); },
    };
    return query;
  } };
}
test('delete last overlapping exam clears matching legacy date before deleting, user scoped', async () => {
  const rows = normalizePlanningExams([course], [exam]);
  const client = fakeClient();
  await deletePlanningExam(client, 'owner', rows[0], rows);
  assert.deepEqual(client.calls.map(c => c.table), ['courses', 'exams']);
  assert.deepEqual(client.calls[0].update, { exam_date: null });
  assert.deepEqual(client.calls[0].filters, [['id', course.id], ['user_id', 'owner'], ['exam_date', course.exam_date]]);
});
test('another same-day event retains legacy date; course-only delete never sends synthetic ID to exams', async () => {
  const rows = normalizePlanningExams([course], [exam, { ...exam, id: 'second' }]);
  const client = fakeClient();
  await deletePlanningExam(client, 'owner', rows[0], rows);
  assert.deepEqual(client.calls.map(c => c.table), ['exams']);
  const fallback = normalizePlanningExams([course]);
  const other = fakeClient();
  await deletePlanningExam(other, 'owner', fallback[0], fallback);
  assert.deepEqual(other.calls.map(c => c.table), ['courses']);
});
test('failed/concurrent legacy update cannot erase newer date or continue delete', async () => {
  const rows = normalizePlanningExams([course], [exam]);
  const client = fakeClient([{ data: [], error: null }]);
  await assert.rejects(deletePlanningExam(client, 'owner', rows[0], rows));
  assert.equal(client.calls.length, 1);
  const broken = fakeClient([{ data: null, error: new Error('offline') }]);
  await assert.rejects(updateLegacyExamDate(broken, 'owner', rows[0], '2026-09-25'));
});
test('failed structured deletion is reported after legacy clear; event remains the read fallback', async () => {
  const rows = normalizePlanningExams([course], [exam]);
  const client = fakeClient([{ data: [{ id: course.id }], error: null }, { data: null, error: new Error('offline') }]);
  await assert.rejects(deletePlanningExam(client, 'owner', rows[0], rows));
  assert.equal(normalizePlanningExams([{ ...course, exam_date: null }], [exam]).length, 1);
});
