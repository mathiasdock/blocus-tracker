import test from 'node:test';
import assert from 'node:assert/strict';
import { coursePlanning, dayWorkload } from '../lib/planningInsights.mjs';
import { parseQuickObjective } from '../lib/planningQuickAdd.js';

test('quick add preserves the duration and separates the afternoon start time', () => {
  const parsed = parseQuickObjective('Biologie 45min demain 14h', { courses: [{ id: 'bio', name: 'Biologie' }], baseDateISO: '2026-09-14' });
  assert.equal(parsed.minutes, 45);
  assert.equal(parsed.time, '14:00');
  assert.equal(parsed.dateISO, '2026-09-15');
  assert.equal(parsed.courseId, 'bio');
  assert.equal(parseQuickObjective('Bio 2h tomorrow 14h').minutes, 120);
  assert.equal(parseQuickObjective('Bio 1h30').minutes, 90);
});

test('workload counts remaining tasks, not finished study minutes', () => {
  assert.deepEqual(dayWorkload([{ done: true, target_minutes: 90 }, { done: false, target_minutes: 30 }, { done: false }]), { remaining: 2, done: 1, minutes: 30 });
  assert.deepEqual(dayWorkload([]), { remaining: 0, done: 0, minutes: 0 });
});
test('course priorities use upcoming exams and keep overdue work visible', () => {
  const rows = coursePlanning([{ id: 'a' }, { id: 'b' }, { id: 'c' }], [
    { course_id: 'a', done: false, scheduled_date: '2026-09-01' },
    { course_id: 'b', done: true, scheduled_date: '2026-09-14' },
  ], [{ course_id: 'a', exam_date: '2026-09-01' }, { course_id: 'b', exam_date: '2026-09-14' }], '2026-09-14');
  assert.deepEqual(rows.map(r => r.course.id), ['b', 'a', 'c']);
  assert.equal(rows[0].remaining, 0);
  assert.equal(rows[1].overdue, 1);
  assert.equal(rows[1].exam, null);
});
