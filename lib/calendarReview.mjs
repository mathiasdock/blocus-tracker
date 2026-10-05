import { academicKey, academicTitle, isAcademicHidden } from './planningAcademicEvents.mjs';
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
    if (link ? sourceChanged(row, link.source_snapshot) : resolved.event_type === 'exam') attention.push({ ...row, ...resolved, link });
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

const sameName = (a, b) => String(a || '').normalize('NFKC').trim().toLocaleLowerCase().replace(/\s+/g, ' ')
  === String(b || '').normalize('NFKC').trim().toLocaleLowerCase().replace(/\s+/g, ' ');

/**
 * Exam decisions for one source, ready for a single review list.
 * - likely: effective exam/high (explicit exam words, or marked as exam);
 * - possible: exam/medium (numbered tests, a bare "Final") — never preselected;
 * - changed: already converted, but the source event moved since.
 * Quizzes never appear: the classifier vetoes them before this point.
 * A candidate that lands on the same day as one of the student's exams for
 * the same course (or, without a course, under the same name) is flagged as a
 * probable duplicate and left unselected, so a bulk confirmation can never
 * silently create a second exam. Converted (linked) events are not candidates.
 */
export function examReviewGroups(rows, maps, links, sourceId, hidden = [], exams = []) {
  const review = calendarReview(rows, maps, links, sourceId, hidden);
  const likely = [], possible = [], changed = [];
  for (const row of review.attention) {
    if (row.link) { changed.push(row); continue; }
    const prefill = calendarExamPrefill(row, maps);
    const duplicate = exams.find(exam => exam.exam_date === prefill.date
      && (prefill.courseId ? exam.course_id === prefill.courseId : sameName(exam.name, prefill.name))) || null;
    (row.confidence === 'high' ? likely : possible).push({ ...row, key: academicKey(row), prefill, duplicate });
  }
  const byDate = (a, b) => a.prefill.date.localeCompare(b.prefill.date) || a.prefill.name.localeCompare(b.prefill.name);
  likely.sort(byDate); possible.sort(byDate);
  return { total: review.total, counts: review.counts, likely, possible, changed,
    preselected: likely.filter(item => !item.duplicate).map(item => item.key) };
}
