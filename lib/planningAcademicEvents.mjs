import { resolveAcademicEventClassification } from './academicEventClassification.mjs';

export const ACADEMIC_COLUMNS = 'source_id,external_uid,recurrence_id,raw_title,external_url,starts_at,due_at,event_date,floating_at,all_day,external_course_key,external_course_label,status,automatic_type,automatic_confidence,automatic_importance,user_override';
export const DEFAULT_ACADEMIC_VISIBILITY = { exams: true, major: true, normal: true };
export const academicKey = event => JSON.stringify([event.source_id, event.external_uid, event.recurrence_id || '']);
export function academicDate(event) {
  if (event.all_day || event.floating_at) return (event.floating_at || event.event_date).slice(0, 10);
  const instant = event.due_at || event.starts_at;
  if (!instant) return event.event_date;
  const d = new Date(instant);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
export function safeAcademicUrl(value) {
  try { const url = new URL(value); return ['https:', 'http:'].includes(url.protocol) ? url.href : null; } catch { return null; }
}
export function academicVisibility(value) {
  return Object.fromEntries(Object.entries(DEFAULT_ACADEMIC_VISIBILITY).map(([key, fallback]) => [key, typeof value?.[key] === 'boolean' ? value[key] : fallback]));
}
const normalizedTitle = value => String(value || '').normalize('NFKC').trim().toLocaleLowerCase().replace(/\s+/g, ' ');
export function planningAcademicEvents(rows, maps, courses, exams, visibility = DEFAULT_ACADEMIC_VISIBILITY) {
  const byDate = {};
  for (const row of rows) {
    if (row.status !== 'active') continue;
    const classification = resolveAcademicEventClassification(row);
    const group = classification.event_type === 'exam' ? 'exams' : classification.importance === 'major' ? 'major' : 'normal';
    if (!visibility[group]) continue;
    const map = maps.find(m => m.source_id === row.source_id && m.external_course_key === row.external_course_key);
    const course = courses.find(c => c.id === map?.local_course_id);
    const date = academicDate(row);
    const suffix = row.external_course_label ? ` [${row.external_course_label}]` : '';
    const title = suffix && row.raw_title.endsWith(suffix) ? row.raw_title.slice(0, -suffix.length) : row.raw_title;
    const event = { ...row, ...classification, key: academicKey(row), date, title, course_id: course?.id || null,
      course_name: course?.name || row.external_course_label || null, color: course?.color || null,
      external_url: safeAcademicUrl(row.external_url), confirmedExam: classification.exam_proposal_eligible };
    // Only an exact course/date/title match represents an existing local exam.
    // Never hide a different exam merely because it shares a course and day.
    if (event.confirmedExam && course && exams.some(ex => ex.course_id === course.id && ex.exam_date === date
      && normalizedTitle(ex.name) === normalizedTitle(title))) continue;
    (byDate[date] ||= []).push(event);
  }
  for (const events of Object.values(byDate)) events.sort((a, b) => Number(b.confirmedExam) - Number(a.confirmedExam)
    || Number(b.importance === 'major') - Number(a.importance === 'major')
    || (a.due_at || a.starts_at || '').localeCompare(b.due_at || b.starts_at || '') || a.title.localeCompare(b.title));
  return byDate;
}
export function academicSummary(events = []) {
  return { exams: events.filter(e => e.confirmedExam), deadlines: events.filter(e => !e.confirmedExam).length };
}
