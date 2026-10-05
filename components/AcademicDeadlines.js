import { useRef, useState } from 'react';
import Glyph from './Glyph';
import PlanningExamMark from './PlanningExamMark';
import PlanPopover from './planning/PlanPopover';
import { MenuList } from './planning/PlanMenu';
import { ACADEMIC_EVENT_TYPES } from '../lib/academicEventClassification.mjs';
import { calendarExamPrefill, examLinkForm } from '../lib/calendarReview.mjs';
import { matchingLocalExam } from '../lib/planningAcademicEvents.mjs';

// What the university imposes, as quiet rows: the title, then course · type ·
// when it is due. Nothing to administer by default. A row opens a small
// popover (a bottom sheet on a phone) whose single primary action is « Plan
// work »; source, type, course and hiding live behind its « … ». The list
// itself never moves when actions open.
const PROVIDERS = { canvas: 'Canvas', moodle: 'Moodle', brightspace: 'Brightspace' };
const localeOf = lang => (lang === 'fr' ? 'fr-BE' : 'en-GB');

export function academicDueLabel(event, t, lang, { withDate = false } = {}) {
  const locale = localeOf(lang);
  const instant = event.floating_at || event.due_at || event.starts_at;
  const time = !event.all_day && instant ? new Date(instant).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' }) : null;
  const today = new Date().toLocaleDateString('en-CA');
  const day = new Date(`${event.date}T12:00:00`).toLocaleDateString(locale, { weekday: 'short', day: 'numeric', month: 'short' });
  if (withDate) return time ? `${day} · ${time}` : day;
  if (time) return `${t(event.confirmedExam ? 'academic.at' : 'academic.due')} ${time}`;
  return event.date === today ? t('academic.dueToday') : t('academic.dueDate').replace('{date}', day);
}

export function academicTypeLabel(event, t) {
  if (event.event_type === 'exam' && !event.confirmedExam) return t('academic.possibleExam');
  return t(`academic.type.${event.event_type}`);
}

function CourseDot({ event }) {
  return <span className={`bt-plan-course-mark${event.color ? '' : ' bt-plan-course-mark--unassigned'}`}
    style={event.color ? { backgroundColor: event.color } : undefined} aria-hidden="true" />;
}

const IconMore = () => <Glyph size={18}><circle cx="5" cy="12" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /></Glyph>;
const IconBack = () => <Glyph size={16}><path d="m15 18-6-6 6-6" /></Glyph>;
const IconExternal = () => <Glyph size={16}><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" /></Glyph>;

// The popover's content. Exported on its own so it can be exercised without a
// portal. Views: root → more → type | course, and confirm.
//
// Marking an event as an exam has ONE meaning everywhere: it becomes the
// student's exam. « Mark as exam », « Add to my exams » and choosing the Exam
// type all lead to the same confirmation, which creates the exam — or links an
// exam the student already has that day — through the server conversion
// (idempotent, never a second exam). Nothing changes a label alone any more.
export function AcademicActions({ event, calendar, courses = [], exams = [], t, lang, onPlan, onClose, onExamsChanged }) {
  const [view, setView] = useState('root');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const source = calendar.sources?.find(s => s.id === event.source_id);
  const provider = PROVIDERS[source?.provider] || null;
  const possible = event.event_type === 'exam' && !event.confirmedExam;
  // Marked as an exam by the earlier label-only confirmation: not an exam of
  // the student's yet. It is offered the same conversion.
  const labelOnly = event.confirmedExam;
  const prefill = calendarExamPrefill(event, calendar.maps || []);
  const existing = matchingLocalExam(exams, { courseId: prefill.courseId, date: prefill.date, name: event.title, rawName: event.raw_title });
  const linkForm = examLinkForm(existing);
  const courseLabel = courses.find(c => c.id === prefill.courseId)?.name || event.course_name || t('academic.unmapped');
  const examDay = new Date(`${prefill.date}T12:00:00`).toLocaleDateString(localeOf(lang), { weekday: 'short', day: 'numeric', month: 'short' });
  async function save(action) {
    if (busy) return;
    setBusy(true); setError(false);
    try { await action(); onClose?.(); }
    catch { setError(true); setBusy(false); }
  }
  const convert = form => save(async () => {
    await calendar.act({ action: 'confirm_exam', source_id: event.source_id, external_uid: event.external_uid,
      recurrence_id: event.recurrence_id || '', exam: form });
    await onExamsChanged?.();
  });
  const back = (title, to) => (
    <div className="bt-academic-pop-head">
      <button type="button" className="bt-plan-icon-action" onClick={() => setView(to)} aria-label={t('common.back')}><IconBack /></button>
      <p className="bt-academic-pop-heading">{title}</p>
    </div>
  );
  return (
    <div className="bt-academic-pop" aria-busy={busy}>
      {view === 'root' && <>
        <p className="bt-academic-pop-title">{event.title}</p>
        <p className="bt-academic-pop-meta"><CourseDot event={event} />{[event.course_name || t('academic.unmapped'), academicTypeLabel(event, t)].join(' · ')}</p>
        <p className="bt-academic-pop-meta">{[academicDueLabel(event, t, lang, { withDate: true }), provider && t('academic.fromSource').replace('{name}', provider)].filter(Boolean).join(' · ')}</p>
        {possible && (
          <div className="bt-academic-pop-decision">
            <p>{t('academic.possibleExamQuestion')}</p>
            <div className="bt-academic-pop-row">
              <button type="button" className="bt-plan-action bt-plan-action--outline" disabled={busy} onClick={() => setView('confirm')}>{t('academic.markExam')}</button>
              <button type="button" className="bt-plan-action bt-plan-action--quiet" disabled={busy} onClick={() => save(() => calendar.override(event, 'other'))}>{t('uc.keepDeadline')}</button>
            </div>
          </div>
        )}
        {labelOnly && (
          <div className="bt-academic-pop-decision">
            <p>{t('academic.notInExams')}</p>
            <div className="bt-academic-pop-row">
              <button type="button" className="bt-plan-action bt-plan-action--outline" disabled={busy} onClick={() => setView('confirm')}>{t('uc.createExam')}</button>
            </div>
          </div>
        )}
        <div className="bt-academic-pop-row bt-academic-pop-actions">
          <button type="button" className="btn-primary min-h-11 flex-1 px-4" disabled={busy} onClick={() => { onClose?.(); onPlan?.(event); }}>{t('academic.planWork')}</button>
          <button type="button" className="bt-plan-icon-action" aria-label={t('academic.moreActions')} disabled={busy} onClick={() => setView('more')}><IconMore /></button>
        </div>
      </>}
      {view === 'confirm' && <>
        {back(t('academic.confirmTitle'), 'root')}
        <div className="bt-academic-confirm">
          <p className="bt-academic-pop-title">{existing ? existing.name || courseLabel : prefill.name}</p>
          <p className="bt-academic-pop-meta"><CourseDot event={event} />{courseLabel}</p>
          <p className="bt-academic-pop-meta">{[examDay, prefill.time].filter(Boolean).join(' · ')}</p>
          <p className={`bt-academic-pop-note${existing ? ' bt-academic-pop-note--warn' : ''}`}>
            {existing ? t('uc.alreadyExam').replace('{name}', existing.name || courseLabel) : t('academic.confirmHint')}
          </p>
          <div className="bt-academic-pop-row">
            {!existing && <button type="button" className="btn-primary min-h-11 flex-1 px-4" disabled={busy} onClick={() => convert(prefill)}>{t('uc.createExam')}</button>}
            {existing && linkForm && <button type="button" className="btn-primary min-h-11 flex-1 px-4" disabled={busy} onClick={() => convert(linkForm)}>{t('academic.linkToExam')}</button>}
            <button type="button" className="bt-plan-action bt-plan-action--quiet" disabled={busy} onClick={() => setView('root')}>{t('common.cancel')}</button>
          </div>
        </div>
      </>}
      {view === 'more' && <>
        {back(event.title, 'root')}
        <MenuList label={t('academic.moreActions')} onDone={() => {}} items={[
          event.external_url && { key: 'open', label: provider ? t('academic.openIn').replace('{name}', provider) : t('academic.openSource'), icon: <IconExternal />, keepOpen: true,
            onSelect: () => { window.open(event.external_url, '_blank', 'noopener,noreferrer'); onClose?.(); } },
          { key: 'type', label: t('academic.changeType'), hint: academicTypeLabel(event, t), keepOpen: true, onSelect: () => setView('type') },
          { key: 'course', label: t('academic.changeCourse'), hint: event.course_name || t('academic.unmapped'), keepOpen: true, onSelect: () => setView('course') },
          { key: 'hide', label: t('academic.hide'), description: t('academic.hideHint'), separated: true, keepOpen: true, disabled: busy,
            onSelect: () => save(() => calendar.hide(event)) },
        ]} />
      </>}
      {view === 'type' && <>
        {back(t('academic.changeType'), 'more')}
        <MenuList label={t('academic.changeType')} onDone={() => {}} items={[
          { key: 'auto', label: t('academic.automatic'), checked: !event.user_override, keepOpen: true, disabled: busy, onSelect: () => save(() => calendar.override(event, null)) },
          // « Exam » is the same conversion as « Mark as exam », never a label.
          ...ACADEMIC_EVENT_TYPES.map(type => ({ key: type, label: t(`academic.type.${type}`), checked: event.user_override === type, keepOpen: true, disabled: busy,
            onSelect: () => (type === 'exam' ? setView('confirm') : save(() => calendar.override(event, type))) })),
        ]} />
      </>}
      {view === 'course' && <>
        {back(t('academic.changeCourse'), 'more')}
        {event.external_course_key
          ? <MenuList label={t('academic.changeCourse')} onDone={() => {}} items={[
            ...courses.filter(c => !c.archived_at || c.id === event.course_id).map(c => ({ key: c.id, label: c.name, checked: event.course_id === c.id, keepOpen: true, disabled: busy,
              icon: <span className="bt-plan-course-mark" style={{ backgroundColor: c.color }} />, onSelect: () => save(() => calendar.mapCourse(event, c.id)) })),
            { key: 'none', label: t('uc.unmapped'), checked: !event.course_id, separated: true, keepOpen: true, disabled: busy, onSelect: () => save(() => calendar.mapCourse(event, '')) },
          ]} />
          : <p className="bt-academic-pop-note">{t('academic.noCourseKey')}</p>}
        <p className="bt-academic-pop-note">{t('academic.courseMatchHint')}</p>
      </>}
      {error && <p role="alert" className="bt-academic-pop-error">{t('academic.saveError')}</p>}
    </div>
  );
}

function AcademicRow({ event, calendar, courses, exams, t, lang, onPlan, onExamsChanged, withDate, hideCourse }) {
  const [open, setOpen] = useState(false);
  const anchor = useRef(null);
  return (
    <li className="bt-academic-item" data-exam={event.confirmedExam ? '1' : undefined}
      data-major={event.importance === 'major' || (event.event_type === 'exam' && !event.confirmedExam) ? '1' : undefined}>
      <button ref={anchor} type="button" className="bt-academic-row" aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(value => !value)}>
        <span className="bt-academic-identity">
          {event.confirmedExam && <PlanningExamMark label={t('plan.examTag')} />}
          <span className="bt-academic-title">{event.title}</span>
          <span className="bt-academic-meta">
            {!hideCourse && <span className="bt-academic-course"><CourseDot event={event} />{event.course_name || t('academic.unmapped')}</span>}
            {!event.confirmedExam && <span>{academicTypeLabel(event, t)}</span>}
            <span className="bt-academic-due">{academicDueLabel(event, t, lang, { withDate })}</span>
          </span>
        </span>
      </button>
      <PlanPopover open={open} anchorRef={anchor} onClose={() => setOpen(false)} label={event.title} align="start" width={320}>
        <AcademicActions event={event} calendar={calendar} courses={courses} exams={exams} t={t} lang={lang} onPlan={onPlan}
          onExamsChanged={onExamsChanged} onClose={() => setOpen(false)} />
      </PlanPopover>
    </li>
  );
}

export default function AcademicDeadlines({ events = [], calendar, courses, exams = [], t, lang, onPlan, onExamsChanged, heading, withDate = false, hideCourse = false, limit = 0, className = '' }) {
  const [expanded, setExpanded] = useState(false);
  if (!events.length) return null;
  const shown = limit && !expanded ? events.slice(0, limit) : events;
  const hidden = events.length - shown.length;
  return (
    <section className={`bt-academic-section ${className}`} aria-label={heading || t('academic.heading')}>
      {heading !== null && <h3 className="bt-plan-section-label">{heading || t('academic.heading')}</h3>}
      <ul className="bt-academic-list">
        {shown.map(event => <AcademicRow key={event.key} {...{ event, calendar, courses, exams, t, lang, onPlan, onExamsChanged, withDate, hideCourse }} />)}
      </ul>
      {hidden > 0 && (
        <button type="button" className="bt-plan-more-link" onClick={() => setExpanded(true)}>
          {t(hidden === 1 ? 'academic.showMoreOne' : 'academic.showMoreMany').replace('{n}', hidden)}
        </button>
      )}
    </section>
  );
}
