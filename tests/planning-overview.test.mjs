import test from 'node:test';
import assert from 'node:assert/strict';
import { examReviewGroups, calendarExamPrefill, examLinkForm } from '../lib/calendarReview.mjs';
import { courseOverview } from '../lib/planningInsights.mjs';
import { confirmedImportedExams, splitAcademicEvents, academicKey } from '../lib/planningAcademicEvents.mjs';
import { classifyAcademicEvent } from '../lib/academicEventClassification.mjs';

const row = (uid, title, date, extra = {}) => {
  const raw_title = `${title} [ADV 3001]`;
  return { source_id: 's', external_uid: uid, recurrence_id: '', raw_title, event_date: date, all_day: true, status: 'active',
    external_course_key: '42', external_course_label: 'ADV 3001', user_override: null,
    ...classifyAcademicEvent({ raw_title, external_course_label: 'ADV 3001' }), ...extra };
};
const maps = [{ source_id: 's', external_course_key: '42', local_course_id: 'adv' }];
const keyOf = uid => academicKey({ source_id: 's', external_uid: uid, recurrence_id: '' });

test('exam review: likely exams preselected, possible ones never, quizzes absent', () => {
  const rows = [row('a', 'Final Exam', '2026-12-08'), row('b', 'Midterm', '2026-11-02'), row('c', 'Test 1', '2026-10-07'),
    row('d', 'Quiz 3', '2026-10-09'), row('e', 'Final Exam Quiz', '2026-10-10'), row('f', 'Final', '2026-12-15')];
  const groups = examReviewGroups(rows, maps, [], 's', [], []);
  assert.deepEqual(groups.likely.map(item => item.external_uid), ['b', 'a'], 'sorted by date');
  assert.deepEqual(groups.possible.map(item => item.external_uid), ['c', 'f']);
  assert.deepEqual([...groups.preselected].sort(), [keyOf('a'), keyOf('b')].sort());
  assert.ok(![...groups.likely, ...groups.possible].some(item => item.event_type === 'quiz'), 'the quiz veto holds, even « Final Exam Quiz »');
  assert.ok(!groups.preselected.includes(keyOf('c')) && !groups.preselected.includes(keyOf('f')), 'an ambiguous test is never preselected');
});

test('exam review never preselects a probable duplicate of an existing exam', () => {
  const rows = [row('a', 'Exam 1', '2026-10-05'), row('b', 'Midterm', '2026-11-02')];
  const exams = [{ id: 'local', course_id: 'adv', name: 'Advertising — written exam', exam_date: '2026-10-05' }];
  const groups = examReviewGroups(rows, maps, [], 's', [], exams);
  assert.deepEqual(groups.likely.map(item => item.external_uid), ['b'], 'the exam the student already has is not a likely exam');
  assert.equal(groups.duplicates.find(item => item.external_uid === 'a').duplicate.id, 'local', 'same course, same day: set apart with the existing exam');
  assert.deepEqual(groups.preselected, [keyOf('b')]);
  // Without a matched course, only the same name on the same day counts.
  const unmatched = examReviewGroups(rows, [], [], 's', [], [{ id: 'other', course_id: 'adv', name: 'Exam 1 [ADV 3001]', exam_date: '2026-10-05' }]);
  assert.equal(unmatched.duplicates.find(item => item.external_uid === 'a').duplicate.id, 'other');
  assert.ok(!unmatched.likely.some(item => item.external_uid === 'a'));
});

test('exam review leaves converted exams alone unless the source changed them', () => {
  const rows = [row('a', 'Final Exam', '2026-12-08'), row('b', 'Midterm', '2026-11-03')];
  const snapshot = r => ({ raw_title: r.raw_title, event_date: r.event_date, starts_at: null, due_at: null, floating_at: null, all_day: true });
  const links = [
    { source_id: 's', external_uid: 'a', recurrence_id: '', local_exam_id: 'x', source_snapshot: snapshot(rows[0]) },
    { source_id: 's', external_uid: 'b', recurrence_id: '', local_exam_id: 'y', source_snapshot: { ...snapshot(rows[1]), event_date: '2026-11-02' } },
  ];
  const groups = examReviewGroups(rows, maps, links, 's', [], []);
  assert.equal(groups.likely.length + groups.possible.length, 0, 'nothing left to add: both are linked');
  assert.deepEqual(groups.changed.map(item => item.external_uid), ['b'], 'only the moved one asks for attention');
  assert.deepEqual(groups.preselected, []);
});

test('exam prefill drops the Canvas course suffix only when the course is matched', () => {
  const event = row('a', 'Final Exam', '2026-12-08');
  assert.equal(calendarExamPrefill(event, maps).name, 'Final Exam');
  assert.equal(calendarExamPrefill(event, maps).courseId, 'adv');
  assert.equal(calendarExamPrefill(event, []).name, 'Final Exam [ADV 3001]', 'unmatched: the suffix is the only course clue');
});

test('course overview: next exam, what is planned before it, overdue work and this week’s deadlines', () => {
  const courses = [{ id: 'a', name: 'Alpha' }, { id: 'b', name: 'Beta' }, { id: 'c', name: 'Gamma' }, { id: 'd', name: 'Delta' }];
  const objectives = [
    { course_id: 'a', done: false, scheduled_date: '2026-10-06', target_minutes: 60 },
    { course_id: 'a', done: false, scheduled_date: '2026-10-09', target_minutes: 30 },
    { course_id: 'a', done: false, scheduled_date: '2026-10-20' },
    { course_id: 'a', done: false, scheduled_date: '2026-10-01', target_minutes: 45 },
    { course_id: 'b', done: true, scheduled_date: '2026-10-06', target_minutes: 45 },
    { course_id: 'd', done: false, scheduled_date: '2026-10-12' },
  ];
  const exams = [{ id: 'x', course_id: 'a', exam_date: '2026-10-09' }, { id: 'y', course_id: 'b', exam_date: '2026-10-07' }];
  const byDate = {
    '2026-10-10': [{ course_id: 'c', date: '2026-10-10', confirmedExam: false }],
    '2026-10-13': [{ course_id: 'c', date: '2026-10-13', confirmedExam: false }],
  };
  const rows = courseOverview(courses, objectives, exams, byDate, '2026-10-06');
  assert.deepEqual(rows.map(r => r.course.id), ['b', 'a', 'c', 'd'], 'soonest exam first, then deadlines, then planned work');
  assert.deepEqual([rows[0].examDays, rows[0].remaining], [1, 0], 'Beta: exam tomorrow, nothing planned before it');
  const alpha = rows[1];
  assert.deepEqual([alpha.examDays, alpha.remaining, alpha.plannedMinutes, alpha.overdue, alpha.upcoming], [3, 2, 90, 1, 3],
    'two objectives (1h30) before the exam; the one after it is not counted before it; one overdue');
  assert.equal(rows[2].deadlinesThisWeek, 1, 'only the deadline inside the next seven days');
  assert.equal(rows[3].exam, null);
});

test('imported events the student marked as exams count as exams in the overview', () => {
  const events = [
    { key: 'k1', title: 'Midterm', course_id: 'c', date: '2026-10-14', all_day: true, confirmedExam: true, event_type: 'exam', importance: 'critical' },
    { key: 'k5', title: 'Oral', course_id: 'c', date: '2026-10-15', all_day: false, floating_at: '2026-10-15T09:30:00', confirmedExam: true, event_type: 'exam', importance: 'critical' },
    { key: 'k2', title: 'Test 1', date: '2026-10-08', event_type: 'exam', confirmedExam: false, importance: 'normal' },
    { key: 'k3', title: 'Group Project', date: '2026-10-08', event_type: 'project', confirmedExam: false, importance: 'major' },
    { key: 'k4', title: 'Quiz 2', date: '2026-10-08', event_type: 'quiz', confirmedExam: false, importance: 'normal' },
  ];
  const split = splitAcademicEvents(events);
  assert.deepEqual(split.important.map(e => e.key), ['k1', 'k5', 'k2', 'k3'], 'exams, exam candidates and major work come first');
  assert.deepEqual(split.secondary.map(e => e.key), ['k4']);
  const exams = confirmedImportedExams({ '2026-10-14': [events[0]], '2026-10-15': [events[1]], '2026-10-08': events.slice(2) });
  assert.deepEqual(exams.map(e => [e.id, e.name, e.course_id, e.exam_date, e.exam_time, e.source]), [
    ['imported:k1', 'Midterm', 'c', '2026-10-14', null, 'imported'],
    ['imported:k5', 'Oral', 'c', '2026-10-15', '09:30', 'imported'],
  ], 'an unconfirmed candidate is never an exam');
});

test('events already marked as exams are never candidates again, and only real decisions count as « to review »', () => {
  const rows = [row('a', 'Final Exam', '2026-12-08', { user_override: 'exam' }), row('b', 'Midterm', '2026-11-02'),
    row('c', 'Test 1', '2026-10-07'), row('d', 'Exam 1', '2026-10-05')];
  const exams = [{ id: 'local', source: 'exam', course_id: 'adv', name: 'Advertising — written exam', exam_date: '2026-10-05' }];
  const groups = examReviewGroups(rows, maps, [], 's', [], exams);
  assert.ok(![...groups.likely, ...groups.possible].some(item => item.external_uid === 'a'), 'marked as exam: decided');
  assert.equal(groups.duplicates.find(item => item.external_uid === 'd').duplicate.id, 'local');
  assert.ok(![...groups.likely, ...groups.possible].some(item => item.external_uid === 'd'), 'already an exam: neither likely nor possible');
  assert.equal(groups.needsReview, 2, 'Midterm and Test 1 ask for a decision; the duplicate does not');
});

test('linking to an existing exam sends that exam’s own fields; a legacy course date cannot be linked', () => {
  assert.deepEqual(examLinkForm({ source: 'exam', name: 'Finance', course_id: 'fin', exam_date: '2026-10-19', exam_time: '09:00:00', location: null }),
    { name: 'Finance', courseId: 'fin', date: '2026-10-19', time: '09:00', location: '' });
  assert.equal(examLinkForm({ source: 'course', name: null, course_id: 'fin', exam_date: '2026-10-19' }), null);
  assert.equal(examLinkForm({ source: 'imported', name: 'Midterm', exam_date: '2026-10-19' }), null);
  assert.equal(examLinkForm(null), null);
});
