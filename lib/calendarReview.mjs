import { academicKey, isAcademicHidden } from './planningAcademicEvents.mjs';
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
  return { name: row.raw_title, courseId: maps.find(m => m.source_id === row.source_id && m.external_course_key === row.external_course_key)?.local_course_id || '',
    date: row.all_day || !d ? row.event_date : `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`,
    time: row.all_day || !d ? '' : `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`, location: '' };
}
