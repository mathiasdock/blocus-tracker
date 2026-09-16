import test from 'node:test';
import assert from 'node:assert/strict';
import { coursePlanning, dayWorkload, dayLoad, loadSegments, loadRatio, objectiveMinutes,
  FALLBACK_OBJECTIVE_MINUTES, LOAD_FULL_MINUTES, LOAD_MIN_RATIO } from '../lib/planningInsights.mjs';
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

test('planned duration decides the workload, not the number of tasks', () => {
  // The exact case the count-based ranking got wrong: one long session must
  // outweigh several short ones from another course.
  const load = dayLoad([
    { course_id: 'marketing', target_minutes: 20 },
    { course_id: 'marketing', target_minutes: 20 },
    { course_id: 'finance', target_minutes: 240 },
  ]);
  assert.equal(load.minutes, 280);
  assert.equal(load.dominantCourseId, 'finance');
  assert.equal(load.courses[0].minutes, 240);
  assert.ok(load.courses[0].share > 0.85);
});

test('completed work stays in the plan and stays measurable apart', () => {
  const load = dayLoad([
    { course_id: 'a', target_minutes: 60, done: true },
    { course_id: 'a', target_minutes: 30 },
  ]);
  assert.equal(load.minutes, 90, 'ticking a box must not shrink the day');
  assert.equal(load.doneMinutes, 60);
  assert.equal(load.pendingMinutes, 30);
  assert.equal(load.doneCount, 1);
});

test('an objective without a usable duration still counts, at a documented rate', () => {
  assert.equal(objectiveMinutes({ target_minutes: 0 }), FALLBACK_OBJECTIVE_MINUTES);
  assert.equal(objectiveMinutes({}), FALLBACK_OBJECTIVE_MINUTES);
  assert.equal(objectiveMinutes({ target_minutes: '45' }), 45);
  const load = dayLoad([{ course_id: 'a' }, { course_id: 'a', target_minutes: 15 }]);
  assert.equal(load.minutes, FALLBACK_OBJECTIVE_MINUTES + 15);
  assert.equal(load.estimated, 1);
});

test('work without a course weighs without borrowing a course identity', () => {
  const load = dayLoad([
    { course_id: null, target_minutes: 180 },
    { course_id: 'a', target_minutes: 30 },
  ]);
  assert.equal(load.minutes, 210);
  assert.equal(load.hasUnassigned, true);
  assert.equal(load.courses[0].id, null, 'unassigned work is the biggest share');
  assert.equal(load.dominantCourseId, null, 'so no course tints that day');
});

test('a named course outranks unassigned work on an equal share', () => {
  const load = dayLoad([{ course_id: null, target_minutes: 60 }, { course_id: 'a', target_minutes: 60 }]);
  assert.equal(load.courses[0].id, 'a');
  assert.equal(load.dominantCourseId, 'a');
});

test('the day is drawn identically whatever order the rows arrive in', () => {
  const rows = [
    { course_id: 'b', target_minutes: 60 }, { course_id: 'a', target_minutes: 60 },
    { course_id: 'c', target_minutes: 30 }, { course_id: null, target_minutes: 60 },
  ];
  const ids = load => load.courses.map(entry => entry.id);
  assert.deepEqual(ids(dayLoad(rows)), ids(dayLoad([...rows].reverse())));
  assert.deepEqual(ids(dayLoad(rows)), ['a', 'b', null, 'c']);
});

test('extra courses are grouped, never dropped and never a rainbow', () => {
  const load = dayLoad([
    { course_id: 'a', target_minutes: 240 }, { course_id: 'b', target_minutes: 60 },
    { course_id: 'c', target_minutes: 30 }, { course_id: 'd', target_minutes: 30 },
  ]);
  const two = loadSegments(load, 2);
  assert.equal(two.length, 3);
  assert.equal(two[2].rest, 2, 'the two remaining courses are named by count');
  assert.equal(Math.round(two.reduce((sum, s) => sum + s.share, 0) * 1000), 1000);
  const three = loadSegments(load, 3);
  assert.equal(three.length, 4);
  assert.equal(three[3].rest, 1);
  assert.deepEqual(loadSegments(dayLoad([]), 2), []);
});

test('the band shares one absolute scale, with a floor for real but small days', () => {
  assert.equal(loadRatio(0), 0, 'an empty day has no band at all');
  assert.equal(loadRatio(LOAD_FULL_MINUTES), 1);
  assert.equal(loadRatio(LOAD_FULL_MINUTES * 2), 1, 'a very long day stays full, never overflows');
  assert.equal(loadRatio(240), 0.5);
  assert.equal(loadRatio(15), LOAD_MIN_RATIO, 'a short day stays visible');
  assert.ok(loadRatio(120) > loadRatio(60), 'above the floor the scale stays truthful');
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
