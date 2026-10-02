import { useEffect, useState } from 'react';
import Glyph from './Glyph';
import PlanningExamMark from './PlanningExamMark';
import { ACADEMIC_EVENT_TYPES } from '../lib/academicEventClassification.mjs';

function Deadline({ event, calendar, courses, t, lang, onPlan }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [type, setType] = useState(event.user_override || '');
  const [course, setCourse] = useState(event.course_id || '');
  useEffect(() => { setType(event.user_override || ''); }, [event.user_override]);
  useEffect(() => { setCourse(event.course_id || ''); }, [event.course_id]);
  async function save(action) {
    setBusy(true); setError(false);
    try { await action(); } catch { setError(true); } finally { setBusy(false); }
  }
  const instant = event.floating_at || event.due_at || event.starts_at;
  const time = !event.all_day && instant ? new Date(instant).toLocaleTimeString(lang === 'fr' ? 'fr-BE' : 'en-US', { hour: 'numeric', minute: '2-digit' }) : null;
  const possible = event.event_type === 'exam' && !event.confirmedExam;
  return <li className="bt-academic-item" data-exam={event.confirmedExam || undefined} data-major={event.importance === "major" || undefined}>
    <details>
      <summary className="bt-academic-summary">
        <span className="bt-academic-identity">
          {event.confirmedExam ? <PlanningExamMark label={t('plan.examTag')} /> : <span className="bt-academic-kind">{t(possible ? 'academic.possibleExam' : 'academic.deadline')}</span>}
          <strong className="bt-academic-course"><span className="bt-plan-course-mark" style={{ backgroundColor: event.color || 'var(--bt-text-3)' }} aria-hidden="true" />{event.course_name || t('academic.unmapped')}</strong>
          <span className="bt-academic-title">{event.title}</span>
        </span>
        <span className="bt-academic-tail"><span className="bt-academic-time">{time ? `${t(event.event_type === 'exam' ? 'academic.at' : 'academic.due')} ${time}` : t('academic.allDay')}</span><Glyph size={14} className="bt-academic-chevron"><path d="m9 5 7 7-7 7" /></Glyph></span>
      </summary>
      <div className="bt-academic-actions">
        {possible && <button type="button" className="btn-ghost min-h-11 px-3 text-sm" disabled={busy} onClick={() => save(() => calendar.override(event, 'exam'))}>{t('academic.confirm')}</button>}
        <button type="button" className="btn-ghost min-h-11 px-3 text-sm" onClick={() => onPlan(event)}>{t('academic.planWork')}</button>
        {event.external_url && <a className="btn-ghost inline-flex min-h-11 items-center px-3 text-sm" href={event.external_url} target="_blank" rel="noopener noreferrer">{t('academic.openSource')}</a>}
        <form className="bt-academic-edit" onSubmit={e => { e.preventDefault(); save(() => calendar.override(event, type || null)); }}>
          <label>{t('academic.changeType')}<select className="input" value={type} onChange={e => setType(e.target.value)}>
            <option value="">{t('academic.automatic')}</option>
            {ACADEMIC_EVENT_TYPES.map(value => <option key={value} value={value}>{t(`academic.type.${value}`)}</option>)}
          </select></label>
          <button className="btn-ghost min-h-11 px-3 text-sm" disabled={busy}>{t('common.save')}</button>
        </form>
        {event.external_course_key ? <form className="bt-academic-edit" onSubmit={e => { e.preventDefault(); save(() => calendar.mapCourse(event, course)); }}>
          <label>{t('academic.mapCourse')}<select className="input" required value={course} onChange={e => setCourse(e.target.value)}>
            <option value="">{t('academic.chooseCourse')}</option>
            {courses.filter(c => !c.archived_at || c.id === event.course_id).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select></label>
          <button className="btn-ghost min-h-11 px-3 text-sm" disabled={busy || !course}>{t('common.save')}</button>
        </form> : <p className="text-sm">{t('academic.noCourseKey')}</p>}
        {error && <p role="alert" className="text-sm">{t('academic.saveError')}</p>}
      </div>
    </details>
  </li>;
}
export default function AcademicDeadlines({ events = [], calendar, courses, t, lang, onPlan, compact = false, onOpen }) {
  if (!events.length) return null;
  if (compact) return <div className="bt-academic-week">
    <span className="bt-academic-heading">{t('academic.heading')}</span>
    {events.filter(e => e.confirmedExam).slice(0, 1).map(event => <button key={event.key} type="button" className="bt-academic-week-exam" onClick={onOpen}>
      <PlanningExamMark label={t('plan.examTag')} count={events.filter(e => e.confirmedExam).length} />
      <span className="bt-plan-course-mark" style={{ backgroundColor: event.color || "var(--bt-text-3)" }} aria-hidden="true" /><span className="truncate">{event.course_name || event.title}</span>
    </button>)}
    <button type="button" className="bt-academic-week-count" onClick={onOpen}>{t(events.length === 1 ? 'academic.itemOne' : 'academic.itemMany').replace('{n}', events.length)}</button>
  </div>;
  return <section className="bt-academic-section" aria-label={t('academic.heading')}>
    <h3 className="bt-academic-heading">{t('academic.heading')}</h3>
    <ul>{events.map(event => <Deadline key={event.key} {...{ event, calendar, courses, t, lang, onPlan }} />)}</ul>
  </section>;
}
export function AcademicVisibility({ calendar, t, onManage }) {
  return <details className="bt-academic-settings no-print">
    <summary>{t('academic.settings')}</summary>
    <button type="button" className="btn-ghost min-h-11 px-3" onClick={onManage}>{t(calendar.sources.length ? 'uc.manage' : 'uc.connect')}</button>
    <p>{t('academic.visibilityHint')}</p>
    {['exams', 'major', 'normal'].map(key => <label key={key}><input type="checkbox" checked={calendar.visibility[key]} onChange={e => calendar.changeVisibility(key, e.target.checked)} />{t(`academic.visibility.${key}`)}</label>)}
    {calendar.error && <p role="alert">{t('academic.loadError')} <button type="button" onClick={calendar.load} className="btn-ghost min-h-11 px-3">{t('academic.retry')}</button></p>}
  </details>;
}
