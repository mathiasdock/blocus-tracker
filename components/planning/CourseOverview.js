import { useEffect, useState } from "react";
import DetailSheet from "../DetailSheet";
import Glyph from "../Glyph";
import PlanningExamMark from "../PlanningExamMark";
import AcademicDeadlines from "../AcademicDeadlines";
import { courseOverview } from "../../lib/planningInsights.mjs";
import { formatMinutesShort } from "../../lib/format";

// « Par cours » answers one question: where does each course stand before
// its next milestone? One consistent line per course — the exam countdown
// and what is planned before it, or this week's deadlines — and, on a click,
// that course's context: exams, objectives, work to reschedule, deadlines.
// It reads the student's own objectives and exams; it is not a task list of
// its own (the old revision checklist stays on the Timer's course card).
const localeOf = lang => (lang === "en" ? "en-GB" : "fr-BE");
const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
function addDays(day, n) { const d = new Date(`${day}T12:00:00`); d.setDate(d.getDate() + n); return iso(d); }
const shortDate = (day, lang) => new Date(`${day}T12:00:00`).toLocaleDateString(localeOf(lang), { weekday: "short", day: "numeric", month: "short" });
const count = (t, one, many, n) => t(n === 1 ? one : many).replace("{n}", n);

export function examCountdownLabel(days, date, t, lang) {
  if (days <= 0) return t("course.examToday");
  if (days === 1) return t("course.examTomorrow");
  if (days < 14) return t("course.examInDays").replace("{n}", days);
  return t("course.examOn").replace("{date}", new Date(`${date}T12:00:00`).toLocaleDateString(localeOf(lang), { day: "numeric", month: "short" }));
}

// Two facts at most on the first line; overdue work gets its own line.
export function courseStatus(row, t, lang) {
  const facts = [];
  let attention = false;
  if (row.exam) {
    facts.push(examCountdownLabel(row.examDays, row.exam.exam_date, t, lang));
    if (row.remaining) facts.push(count(t, "plan.remainingOne", "plan.remainingMany", row.remaining));
    else { facts.push(t("plan.nothingPlanned")); attention = row.examDays <= 7; }
  } else if (row.deadlinesThisWeek) {
    facts.push(count(t, "course.deadlinesWeekOne", "course.deadlinesWeekMany", row.deadlinesThisWeek));
    if (row.upcoming) facts.push(count(t, "course.plannedOne", "course.plannedMany", row.upcoming));
  } else {
    facts.push(row.upcoming ? count(t, "course.plannedOne", "course.plannedMany", row.upcoming) : t("plan.nothingPlanned"));
  }
  return { line: facts.join(" · "), overdue: row.overdue ? t("plan.toReschedule").replace("{n}", row.overdue) : null, attention };
}

const IconBack = () => <Glyph size={16}><path d="m15 18-6-6 6-6" /></Glyph>;
const IconChevron = () => <Glyph size={14}><path d="m9 18 6-6-6-6" /></Glyph>;
const IconPlay = () => <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><polygon points="5 3 19 12 5 21 5 3" /></svg>;

function CourseDetail({ row, objectives, exams, localExams, academic, courses, today, t, lang, openDay, toggle, launchTimer, planWork, onPlanAcademic, onExamsChanged }) {
  const course = row.course;
  const upcomingExams = exams.filter(e => e.course_id === course.id && e.exam_date >= today);
  const pending = objectives.filter(o => o.course_id === course.id && !o.done);
  const byWhen = (a, b) => a.scheduled_date.localeCompare(b.scheduled_date) || (a.scheduled_time || "99").localeCompare(b.scheduled_time || "99");
  const upcoming = pending.filter(o => o.scheduled_date >= today).sort(byWhen);
  const overdue = pending.filter(o => o.scheduled_date < today).sort(byWhen);
  const horizon = addDays(today, 13);
  const deadlines = Object.values(academic.byDate || {}).flat()
    .filter(e => e.course_id === course.id && !e.confirmedExam && e.date >= today && e.date <= horizon)
    .sort((a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title));
  const exam = row.exam;
  const todayObjective = upcoming.find(o => o.scheduled_date === today);
  const start = () => (todayObjective ? launchTimer(course.id, todayObjective.target_minutes, todayObjective.title) : launchTimer(course.id));
  const plan = () => planWork({ title: "", courseId: course.id });
  const planned = exam
    ? row.remaining
      ? t("course.beforeExamFacts").replace("{facts}", [count(t, "plan.objectiveCountOne", "plan.objectiveCountMany", row.remaining),
        row.plannedMinutes > 0 && formatMinutesShort(row.plannedMinutes * 60)].filter(Boolean).join(" · "))
      : t("course.nothingBeforeExam")
    : upcoming.length ? count(t, "course.plannedOne", "course.plannedMany", upcoming.length) : t("course.nothingYet");
  const line = o => (
    <li key={o.id} className="bt-course-line">
      <label className="bt-course-check"><input type="checkbox" className="bt-task-check h-4 w-4" checked={o.done} onChange={() => toggle(o)} aria-label={o.title || course.name} /></label>
      <button type="button" className="bt-course-line-body" onClick={() => openDay(o.scheduled_date)}>
        <span className="bt-course-line-title">{o.title || course.name}</span>
        <span className="bt-course-line-meta">{[shortDate(o.scheduled_date, lang), o.scheduled_time?.slice(0, 5), o.target_minutes > 0 && formatMinutesShort(o.target_minutes * 60)].filter(Boolean).join(" · ")}</span>
      </button>
    </li>
  );
  return (
    <div className="bt-course-detail">
      {upcomingExams.length > 0 ? upcomingExams.slice(0, 2).map(item => (
        <button type="button" key={item.id} className="bt-course-exam" onClick={() => openDay(item.exam_date)}>
          <PlanningExamMark label={t("plan.examTag")} />
          <strong>{item.name || course.name}</strong>
          <span>{[examCountdownLabel(Math.round((Date.parse(`${item.exam_date}T12:00:00Z`) - Date.parse(`${today}T12:00:00Z`)) / 864e5), item.exam_date, t, lang), shortDate(item.exam_date, lang), item.exam_time?.slice(0, 5), item.location].filter(Boolean).join(" · ")}</span>
        </button>
      )) : <p className="bt-course-muted">{t("course.noExam")}</p>}
      <p className="bt-course-facts" data-attention={exam && !row.remaining && row.examDays <= 7 ? "1" : undefined}>{planned}</p>
      {/* The course's state picks the primary action: work already planned →
          study now (today's objective when there is one); nothing planned →
          plan it first. */}
      <div className="bt-course-actions">
        {upcoming.length > 0 ? <>
          <button type="button" className="btn-primary min-h-11 px-4" onClick={start}><IconPlay />{t("plan.startStudying")}</button>
          <button type="button" className="bt-plan-action bt-plan-action--outline" onClick={plan}>{t("course.planRevision")}</button>
        </> : <>
          <button type="button" className="btn-primary min-h-11 px-4" onClick={plan}>{t("course.planRevision")}</button>
          <button type="button" className="bt-plan-action bt-plan-action--quiet" onClick={start}><IconPlay />{t("plan.startStudying")}</button>
        </>}
      </div>
      {upcoming.length > 0 && (
        <section className="bt-course-section">
          <h3 className="bt-plan-section-label">{t("academic.studyPlan")}</h3>
          <ul>{upcoming.slice(0, 6).map(line)}</ul>
          {upcoming.length > 6 && <p className="bt-course-muted">{count(t, "plan.moreObjectivesOne", "plan.moreObjectivesMany", upcoming.length - 6)}</p>}
        </section>
      )}
      {overdue.length > 0 && (
        <section className="bt-course-section">
          <h3 className="bt-plan-section-label">{t("course.toRescheduleTitle")}</h3>
          <ul>{overdue.slice(0, 6).map(line)}</ul>
        </section>
      )}
      <AcademicDeadlines events={deadlines} calendar={academic} courses={courses} exams={localExams} onExamsChanged={onExamsChanged} t={t} lang={lang} onPlan={onPlanAcademic}
        heading={t("course.dueSoon")} withDate hideCourse limit={5} className="bt-course-section" />
    </div>
  );
}

export default function CourseOverview({ courses, objectives, exams, localExams = [], academic, today, t, lang, openDay, toggle, launchTimer, planWork, onPlanAcademic, onExamsChanged, className = "" }) {
  const [selectedId, setSelectedId] = useState(null);
  const [inline, setInline] = useState(false);
  useEffect(() => {
    const query = window.matchMedia("(min-width: 1280px)");
    const update = () => setInline(query.matches);
    update();
    query.addEventListener?.("change", update);
    return () => query.removeEventListener?.("change", update);
  }, []);
  if (!courses.length) return null;
  const rows = courseOverview(courses, objectives, exams, academic.byDate, today);
  const selected = rows.find(row => row.course.id === selectedId) || null;
  const detail = selected && <CourseDetail row={selected} {...{ objectives, exams, localExams, academic, courses, today, t, lang, openDay, toggle, launchTimer, planWork, onPlanAcademic, onExamsChanged }} />;

  if (inline && selected) {
    return (
      <section className={`bt-course-overview card ${className}`} aria-label={selected.course.name}>
        <button type="button" className="bt-course-back" onClick={() => setSelectedId(null)}><IconBack />{t("course.allCourses")}</button>
        <h2 className="bt-course-name"><span className="bt-plan-course-mark" style={{ backgroundColor: selected.course.color }} aria-hidden="true" />{selected.course.name}</h2>
        {detail}
      </section>
    );
  }
  return (
    <section className={`bt-course-overview card ${className}`} aria-labelledby="bt-course-overview-title">
      <h2 id="bt-course-overview-title" className="bt-plan-section-label">{t("course.overviewTitle")}</h2>
      <ul className="bt-course-list">
        {rows.map(row => {
          const status = courseStatus(row, t, lang);
          return (
            <li key={row.course.id}>
              <button type="button" className="bt-course-row" onClick={() => setSelectedId(row.course.id)} aria-haspopup={inline ? undefined : "dialog"}>
                <span className="bt-course-row-main">
                  <span className="bt-course-row-name"><span className="bt-plan-course-mark" style={{ backgroundColor: row.course.color }} aria-hidden="true" />{row.course.name}</span>
                  <span className="bt-course-row-status" data-attention={status.attention ? "1" : undefined}>{status.line}</span>
                  {status.overdue && <span className="bt-course-row-status">{status.overdue}</span>}
                </span>
                <span className="bt-course-row-chevron" aria-hidden="true"><IconChevron /></span>
              </button>
            </li>
          );
        })}
      </ul>
      {!inline && selected && (
        <DetailSheet open title={selected.course.name} closeLabel={t("common.close")} onClose={() => setSelectedId(null)}>
          <div className="bt-course-sheet">{detail}</div>
        </DetailSheet>
      )}
    </section>
  );
}
