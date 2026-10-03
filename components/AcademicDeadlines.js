import { useEffect, useRef, useState } from 'react';
import Glyph from './Glyph';
import PlanningExamMark from './PlanningExamMark';
import { ACADEMIC_EVENT_TYPES } from '../lib/academicEventClassification.mjs';
import { academicCourseGroups } from '../lib/planningAcademicEvents.mjs';

function Deadline({ event, calendar, courses, t, lang, onPlan, grouped }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [editing, setEditing] = useState(null);
  const [type, setType] = useState(event.user_override || '');
  const [course, setCourse] = useState(event.course_id || '');
  const menu = useRef(null);
  const editor = useRef(null);
  useEffect(() => { setType(event.user_override || ''); }, [event.user_override]);
  useEffect(() => { setCourse(event.course_id || ''); }, [event.course_id]);
  useEffect(() => { if (editing) editor.current?.querySelector('select')?.focus(); }, [editing]);
  async function save(action) {
    if (busy) return;
    setBusy(true); setError(false);
    try { await action(); setEditing(null); } catch { setError(true); } finally { setBusy(false); }
  }
  function edit(kind) { menu.current.open = false; setEditing(kind); }
  const instant = event.floating_at || event.due_at || event.starts_at;
  const locale = lang === 'fr' ? 'fr-BE' : 'en-US';
  const time = !event.all_day && instant ? new Date(instant).toLocaleTimeString(locale, { hour: 'numeric', minute: '2-digit' }) : null;
  const date = new Date(`${event.date}T12:00:00`).toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' });
  const today = new Date().toLocaleDateString('en-CA');
  const due = time ? `${t(event.confirmedExam ? 'academic.at' : 'academic.due')} ${time}`
    : event.date === today ? t('academic.dueToday') : t('academic.dueDate').replace('{date}', date);
  const possible = event.event_type === 'exam' && !event.confirmedExam;
  const source = calendar.sources.find(s => s.id === event.source_id);
  const courseName = event.course_name || t('academic.unmapped');
  return <li className="bt-academic-item" data-exam={event.confirmedExam || undefined}>
    <details onToggle={e => { if (!e.currentTarget.open) { setEditing(null); if (menu.current) menu.current.open = false; } }}>
      <summary className="bt-academic-summary">
        <span className="bt-academic-identity">
          <strong className="bt-academic-title">{event.title}</strong>
          <span className="bt-academic-meta">
            {!grouped && <span className="bt-academic-course"><span className="bt-plan-course-mark" style={{ backgroundColor: event.color || 'var(--bt-text-3)' }} aria-hidden="true" />{courseName}</span>}
            {event.confirmedExam ? <PlanningExamMark label={t('plan.examTag')} /> : <span>{t(possible ? 'academic.possibleExam' : `academic.type.${event.event_type}`)}</span>}
            <span>{due}</span>
          </span>
        </span>
        <Glyph size={14} className="bt-academic-chevron"><path d="m9 5 7 7-7 7" /></Glyph>
      </summary>
      <div className="bt-academic-detail">
        <p className="bt-academic-source">{date} · {t('academic.source')}: {source?.display_name || source?.provider || t('academic.settings')}</p>
        <div className="bt-academic-actions">
          <button type="button" className="btn-primary min-h-11 px-3 text-sm" onClick={() => onPlan(event)}>{t('academic.planWork')}</button>
          <details ref={menu} className="bt-academic-overflow" onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); e.currentTarget.open = false; e.currentTarget.querySelector('summary').focus(); } }}>
            <summary aria-label={t('academic.moreActions')}><Glyph size={18}><circle cx="5" cy="12" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /></Glyph></summary>
            <div className="bt-academic-menu">
              {event.external_url && <a href={event.external_url} target="_blank" rel="noopener noreferrer">{t('academic.openSource')}</a>}
              <button type="button" disabled={busy} onClick={() => edit('type')}>{t('academic.changeType')}</button>
              <button type="button" disabled={busy} onClick={() => edit('course')}>{t('academic.changeCourse')}</button>
              <button type="button" disabled={busy} onClick={() => save(() => calendar.hide(event))}>{t('academic.hide')}</button>
              <p>{t('academic.hideHint')}</p>
            </div>
          </details>
        </div>
        {possible && <div className="bt-academic-decisions">
          <button type="button" className="btn-ghost min-h-11 px-3 text-sm" disabled={busy} onClick={() => save(() => calendar.override(event, 'exam'))}>{t('uc.confirmExam')}</button>
          <button type="button" className="btn-ghost min-h-11 px-3 text-sm" disabled={busy} onClick={() => save(() => calendar.override(event, 'other'))}>{t('uc.keepDeadline')}</button>
        </div>}
        {editing && <div ref={editor}>
          {editing === 'type' ? <form className="bt-academic-edit" onSubmit={e => { e.preventDefault(); save(() => calendar.override(event, type || null)); }}>
            <label>{t('academic.changeType')}<select className="input" value={type} onChange={e => setType(e.target.value)}>
              <option value="">{t('academic.automatic')}</option>
              {ACADEMIC_EVENT_TYPES.map(value => <option key={value} value={value}>{t(`academic.type.${value}`)}</option>)}
            </select></label>
            <button className="btn-ghost min-h-11 px-3 text-sm" disabled={busy}>{t('common.save')}</button>
          </form> : event.external_course_key ? <form className="bt-academic-edit" onSubmit={e => { e.preventDefault(); save(() => calendar.mapCourse(event, course)); }}>
            <label>{t('academic.changeCourse')}<select className="input" value={course} onChange={e => setCourse(e.target.value)}>
              <option value="">{t('uc.unmapped')}</option>
              {courses.filter(c => !c.archived_at || c.id === event.course_id).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select></label>
            <button className="btn-ghost min-h-11 px-3 text-sm" disabled={busy}>{t('common.save')}</button>
          </form> : <p className="text-sm">{t('academic.noCourseKey')}</p>}
          <button className="btn-ghost min-h-11 px-3 text-sm" type="button" disabled={busy} onClick={() => { setEditing(null); menu.current?.querySelector('summary')?.focus(); }}>{t('common.cancel')}</button>
        </div>}
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
      <span className="bt-plan-course-mark" style={{ backgroundColor: event.color || 'var(--bt-text-3)' }} aria-hidden="true" /><span className="truncate">{event.course_name || event.title}</span>
    </button>)}
    <button type="button" className="bt-academic-week-count" onClick={onOpen}>{t(events.length === 1 ? 'academic.itemOne' : 'academic.itemMany').replace('{n}', events.length)}</button>
  </div>;
  return <section className="bt-academic-section" aria-label={t('academic.heading')}>
    <h3 className="bt-academic-heading">{t('academic.heading')}</h3>
    {academicCourseGroups(events).map(group => {
      const grouped = !!group.courseId && group.events.length > 1;
      const first = group.events[0];
      return <div className="bt-academic-group" key={group.key} role="group" aria-label={grouped ? first.course_name : undefined}>
        {grouped && <h4 className="bt-academic-group-name"><span className="bt-plan-course-mark" style={{ backgroundColor: first.color || 'var(--bt-text-3)' }} aria-hidden="true" />{first.course_name}</h4>}
        <ul>{group.events.map(event => <Deadline key={event.key} {...{ event, calendar, courses, t, lang, onPlan, grouped }} />)}</ul>
      </div>;
    })}
  </section>;
}
export function AcademicVisibility({ calendar, t, onManage }) {
  return <details className="bt-academic-settings no-print">
    <summary>{t('academic.settings')}</summary>
    <button type="button" className="btn-ghost min-h-11 px-3" onClick={onManage}>{t(calendar.sources.length ? 'uc.manage' : 'uc.connect')}</button>
    {calendar.error && <p role="alert">{t('academic.loadError')} <button type="button" onClick={calendar.load} className="btn-ghost min-h-11 px-3">{t('academic.retry')}</button></p>}
  </details>;
}
