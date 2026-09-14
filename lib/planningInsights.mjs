// Derived from saved objectives/exams only; no estimated revision/readiness score.
export function coursePlanning(courses, objectives, exams, today) {
  return courses.map(course => {
    const upcoming = exams.filter(e => e.course_id === course.id && e.exam_date >= today)
      .sort((a, b) => a.exam_date.localeCompare(b.exam_date));
    const pending = objectives.filter(o => o.course_id === course.id && !o.done);
    return { course, exam: upcoming[0] || null,
      remaining: pending.length,
      overdue: pending.filter(o => o.scheduled_date && o.scheduled_date < today).length };
  }).sort((a, b) => (a.exam?.exam_date || '9999').localeCompare(b.exam?.exam_date || '9999')
    || b.overdue - a.overdue || b.remaining - a.remaining);
}

export function dayWorkload(objectives) {
  const pending = objectives.filter(o => !o.done);
  return { remaining: pending.length, done: objectives.length - pending.length,
    minutes: pending.reduce((sum, o) => sum + Math.max(0, Number(o.target_minutes) || 0), 0) };
}

// Two representative courses at most. Stable ties avoid a repaint when query
// order changes; completion does not remove a course from the month's plan.
export function monthTintCourses(objectives) {
  const counts = new Map();
  for (const objective of objectives) {
    if (objective.course_id) counts.set(objective.course_id, (counts.get(objective.course_id) || 0) + 1);
  }
  return [...counts].sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])))
    .slice(0, 2).map(([id]) => id);
}
