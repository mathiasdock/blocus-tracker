import { academicKey, academicTitle, isAcademicHidden, matchingLocalExam } from './planningAcademicEvents.mjs';
import { resolveAcademicEventClassification } from './academicEventClassification.mjs';

export function externalCourses(rows, maps, sourceId) {
  const found = new Map();
  for (const row of rows) {
    if (row.source_id !== sourceId || !row.external_course_key) continue;
    if (!found.has(row.external_course_key)) found.set(row.external_course_key, {
      key: row.external_course_key, label: row.external_course_label || row.external_course_key,
      mapping: maps.find(m => m.source_id === sourceId && m.external_course_key === row.external_course_key),
    });
  }
  return [...found.values()].sort((a, b) => a.label.localeCompare(b.label));
}
export function calendarReview(rows, maps, links, sourceId, hidden = []) {
  const visible = rows.filter(row => row.source_id === sourceId && !isAcademicHidden(row, hidden) && !maps.some(m => m.source_id === sourceId && m.external_course_key === row.external_course_key && m.ignored));
  const counts = { exams: 0, major: 0, small: 0, other: 0 };
  const attention = [];
  for (const row of visible) {
    const resolved = resolveAcademicEventClassification(row);
    const group = resolved.event_type === 'exam' ? 'exams' : resolved.importance === 'major' ? 'major'
      : ['quiz', 'assignment'].includes(resolved.event_type) ? 'small' : 'other';
    counts[group]++;
    const link = links.find(l => academicKey(l) === academicKey(row));
    // A converted exam asks again only if its source moved. An event already
    // marked as an exam is decided: it is never a candidate again.
    if (link ? sourceChanged(row, link.source_snapshot) : resolved.event_type === 'exam' && row.user_override !== 'exam') attention.push({ ...row, ...resolved, link });
  }
  return { total: visible.length, counts, attention };
}
export function sourceChanged(row, snapshot = {}) {
  if (row.raw_title !== snapshot.raw_title || row.event_date !== snapshot.event_date || !!row.all_day !== !!snapshot.all_day) return true;
  const instant = value => value ? new Date(value).toISOString() : null;
  return instant(row.starts_at) !== instant(snapshot.starts_at) || instant(row.due_at) !== instant(snapshot.due_at)
    || (row.floating_at || '').slice(0, 19) !== (snapshot.floating_at || '').slice(0, 19);
}
export function calendarExamPrefill(row, maps) {
  const instant = row.floating_at || row.due_at || row.starts_at;
  const d = instant ? new Date(instant) : null;
  const courseId = maps.find(m => m.source_id === row.source_id && m.external_course_key === row.external_course_key)?.local_course_id || '';
  // A matched course already carries the identity: drop Canvas's "[ADV 3001]"
  // suffix from the name. Unmatched, the suffix is the only course clue left.
  return { name: courseId ? academicTitle(row) : row.raw_title, courseId,
    date: row.all_day || !d ? row.event_date : `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`,
    time: row.all_day || !d ? '' : `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`, location: '' };
}

/**
 * Exam decisions for one source, ready for a single review list.
 * - likely: effective exam/high (explicit exam words, or marked as exam);
 * - possible: exam/medium (numbered tests, a bare "Final") — never preselected;
 * - duplicates: on the same day as one of the student's exams for the same
 *   course (or, without a course, under the same name) — that exam already
 *   exists, so it is neither likely nor possible and can never be selected:
 *   a bulk confirmation cannot create a second exam;
 * - changed: already converted, but the source event moved since.
 * Quizzes never appear: the classifier vetoes them before this point; nor do
 * events already marked as exams or converted (linked) ones.
 * `needsReview` counts what still asks for a decision (never the duplicates).
 */
export function examReviewGroups(rows, maps, links, sourceId, hidden = [], exams = []) {
  const review = calendarReview(rows, maps, links, sourceId, hidden);
  const likely = [], possible = [], duplicates = [], changed = [];
  for (const row of review.attention) {
    if (row.link) { changed.push(row); continue; }
    const prefill = calendarExamPrefill(row, maps);
    const duplicate = matchingLocalExam(exams, { courseId: prefill.courseId, date: prefill.date, name: academicTitle(row), rawName: row.raw_title });
    // An exam the student already has is never a candidate again: it waits
    // apart, to be linked to that exam or kept as a deadline.
    (duplicate ? duplicates : row.confidence === 'high' ? likely : possible).push({ ...row, key: academicKey(row), prefill, duplicate });
  }
  const byDate = (a, b) => a.prefill.date.localeCompare(b.prefill.date) || a.prefill.name.localeCompare(b.prefill.name);
  likely.sort(byDate); possible.sort(byDate); duplicates.sort(byDate);
  return { total: review.total, counts: review.counts, likely, possible, duplicates, changed,
    preselected: likely.map(item => item.key),
    needsReview: likely.length + possible.length + changed.length };
}

/**
 * The confirmation form that links an import to an exam the student already
 * has. The server links an exact existing exam instead of inserting one
 * (same course, date, time and name), so sending that exam's own fields
 * creates the source link without a second exam. A legacy course date has no
 * exam row to link: null.
 */
export function examLinkForm(exam) {
  if (!exam || exam.source === 'course' || exam.source === 'imported' || !exam.name) return null;
  return { name: exam.name, courseId: exam.course_id || '', date: exam.exam_date,
    time: exam.exam_time ? String(exam.exam_time).slice(0, 5) : '', location: exam.location || '' };
}
