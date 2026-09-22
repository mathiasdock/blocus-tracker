// Planning's read model only. No backfill, name inference or write-on-read.
// A course date has no event name/time/location. Keep that absence explicit.
export function validExamDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function normalizePlanningExams(courses = [], rows = []) {
  const courseDates = new Map(courses.filter(c => c.id && validExamDate(c.exam_date))
    .map(c => [c.id, c.exam_date]));
  const represented = new Set();
  const seenIds = new Set();
  const result = [];
  for (const exam of rows) {
    if (!exam.id || seenIds.has(exam.id) || !validExamDate(exam.exam_date)) continue;
    seenIds.add(exam.id);
    const key = `${exam.course_id}:${exam.exam_date}`;
    represented.add(key);
    result.push({ ...exam, source: "exam",
      legacy_course_id: courseDates.get(exam.course_id) === exam.exam_date ? exam.course_id : null });
  }
  for (const [courseId, date] of courseDates) {
    if (represented.has(`${courseId}:${date}`)) continue;
    result.push({ id: `course-date:${courseId}:${date}`, course_id: courseId,
      exam_date: date, name: null, exam_time: null, location: null,
      source: "course", legacy_course_id: courseId });
  }
  // Distinct structured rows are never collapsed by title/date: two exams
  // for the same course/day are legitimate. Only the legacy date is shadowed.
  return result.sort((a, b) => a.exam_date.localeCompare(b.exam_date)
    || (a.exam_time || "99").localeCompare(b.exam_time || "99")
    || String(a.id).localeCompare(String(b.id)));
}

// A course's next exam is a single product fact. Structured upcoming events
// take precedence; the legacy course date is used only when no such event
// exists. The normalized read model already removes exact-date duplicates.
export function nextExamForCourse(exams = [], courseId, today) {
  if (!courseId || !validExamDate(today)) return null;
  const upcoming = exams.filter(exam => exam.course_id === courseId
    && validExamDate(exam.exam_date) && exam.exam_date >= today)
    .sort((a, b) => a.exam_date.localeCompare(b.exam_date)
      || (a.exam_time || "99").localeCompare(b.exam_time || "99")
      || String(a.id).localeCompare(String(b.id)));
  return upcoming.find(exam => exam.source !== "course")
    || upcoming.find(exam => exam.source === "course")
    || null;
}

// For a global "next exam" summary, use the same course-level truth while
// retaining structured exams that do not belong to a course.
export function relevantUpcomingExams(exams = [], today) {
  if (!validExamDate(today)) return [];
  const courseIds = new Set(exams.filter(exam => exam.course_id).map(exam => exam.course_id));
  return [
    ...[...courseIds].map(id => nextExamForCourse(exams, id, today)).filter(Boolean),
    ...exams.filter(exam => !exam.course_id && exam.source !== "course"
      && validExamDate(exam.exam_date) && exam.exam_date >= today),
  ].sort((a, b) => a.exam_date.localeCompare(b.exam_date)
    || (a.exam_time || "99").localeCompare(b.exam_time || "99")
    || String(a.id).localeCompare(String(b.id)));
}

export async function updateLegacyExamDate(client, userId, exam, date) {
  if (date !== null && !validExamDate(date)) throw new Error("Invalid exam date");
  // Compare-and-set: never erase a newer course date edited in another tab.
  const result = await client.from("courses").update({ exam_date: date })
    .eq("id", exam.legacy_course_id).eq("user_id", userId).eq("exam_date", exam.exam_date)
    .select("id,exam_date");
  if (result.error) throw result.error;
  if (!result.data?.length) throw new Error("Course date changed; reload before retrying");
  return result.data[0];
}

export async function deletePlanningExam(client, userId, exam, normalized) {
  // Deleting the last event also clears its matching legacy date, otherwise
  // the fallback would reappear. Clear first: a failed delete leaves the
  // structured event visible/retryable, never silently lost in the UI.
  const hasOther = normalized.some(other => other.id !== exam.id && other.source === "exam"
    && other.course_id === exam.course_id && other.exam_date === exam.exam_date);
  if (exam.legacy_course_id && !hasOther) await updateLegacyExamDate(client, userId, exam, null);
  if (exam.source === "course") return;
  const result = await client.from("exams").delete().eq("id", exam.id).eq("user_id", userId).select("id");
  if (result.error) throw result.error;
  if (!result.data?.length) throw new Error("Exam changed; reload before retrying");
}
