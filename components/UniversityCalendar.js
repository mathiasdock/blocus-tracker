import { useEffect, useRef, useState } from 'react';
import DetailSheet from './DetailSheet';
import { externalCourses, calendarReview, calendarExamPrefill } from '../lib/calendarReview.mjs';
import { academicKey, hiddenAcademicKey, academicTitle } from '../lib/planningAcademicEvents.mjs';
import { ACADEMIC_EVENT_TYPES } from '../lib/academicEventClassification.mjs';

const providers = ['canvas', 'moodle', 'brightspace', 'ical'];
const providerName = (provider, t) => provider === 'ical' ? t('uc.otherProvider') : ({ canvas: 'Canvas', moodle: 'Moodle', brightspace: 'Brightspace' })[provider];
function failure(code, t) {
  if (['invalid_calendar_url','unsafe_calendar_host'].includes(code)) return t('uc.errorUrl');
  if (code === 'invalid_calendar_feed') return t('uc.errorFeed');
  if (['calendar_too_large','calendar_event_limit'].includes(code)) return t('uc.errorLimit');
  if (['calendar_sync_cooldown','too_many_requests'].includes(code)) return t('uc.errorCooldown');
  if (code === 'calendar_source_limit') return t('uc.errorSources');
  if (code === 'calendar_account_suspended' || code === 'calendar_action_denied') return t('uc.errorDenied');
  if (code === 'calendar_fetch_failed') return t('uc.errorFetch');
  return t('uc.errorGeneric');
}

function Matches({ rows, courses, onSave, busy, t }) {
  const [values, setValues] = useState(() => Object.fromEntries(rows.map(row => [row.key, row.mapping?.ignored ? 'ignore' : row.mapping?.local_course_id || ''])));
  return <form onSubmit={e => { e.preventDefault(); onSave(rows.map(row => ({ ...row, value: values[row.key] || '' }))); }} className="uc-stack">
    <h4>{t('uc.matchTitle')}</h4><p>{t('uc.matchHint')}</p>
    {rows.length ? rows.map(row => <label key={row.key} className="uc-field">{row.label}
      <select className="input" value={values[row.key] || ''} onChange={e => setValues(v => ({ ...v, [row.key]: e.target.value }))}>
        <option value="">{t('uc.unmapped')}</option><option value="ignore">{t('uc.ignore')}</option>
        {courses.filter(c => !c.archived_at || c.id === values[row.key]).map(course => <option key={course.id} value={course.id}>{course.name}</option>)}
      </select></label>) : <p>{t('uc.noKeys')}</p>}
    <button className="btn-primary min-h-11 px-4" disabled={busy}>{t('uc.saveContinue')}</button>
  </form>;
}
function ExamConfirmation({ row, maps, courses, busy, t, onSave, onCancel }) {
  const [form, setForm] = useState(() => calendarExamPrefill(row, maps));
  const field = key => ({ value: form[key], onChange: e => setForm(f => ({ ...f, [key]: e.target.value })) });
  return <form className="uc-stack uc-exam-form" onSubmit={e => { e.preventDefault(); onSave(form); }}>
    <h4>{t('uc.confirmExam')}</h4><p>{t('uc.examRule')}</p>
    <label className="uc-field">{t('uc.examName')}<input className="input" required maxLength={160} {...field('name')} /></label>
    <label className="uc-field">{t('academic.mapCourse')}<select className="input" {...field('courseId')}><option value="">{t('uc.unmapped')}</option>{courses.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
    <div className="uc-date-time"><label className="uc-field">{t('uc.examDate')}<input className="input" required type="date" {...field('date')} /></label>
      <label className="uc-field">{t('uc.examTime')}<input className="input" type="time" {...field('time')} /></label></div>
    <label className="uc-field">{t('uc.examLocation')}<input className="input" maxLength={160} {...field('location')} /></label>
    <div className="uc-buttons"><button className="btn-primary min-h-11 px-3" disabled={busy}>{t('uc.createExam')}</button><button type="button" className="btn-ghost min-h-11 px-3" onClick={onCancel} disabled={busy}>{t('common.cancel')}</button></div>
  </form>;
}
function ReviewItem({ row, calendar, courses, exams, busy, t, run, refresh, onOpenExam }) {
  const [confirm, setConfirm] = useState(false);
  const [type, setType] = useState(row.event_type);
  const local = exams.find(e => e.id === row.link?.local_exam_id);
  const identity = { source_id: row.source_id, external_uid: row.external_uid, recurrence_id: row.recurrence_id || '' };
  return <li className="uc-review-item">
    <strong>{row.raw_title}</strong><p>{row.event_date} · {t(row.link ? 'uc.sourceChanged' : row.confidence === 'high' ? 'uc.likelyExam' : 'academic.possibleExam')}</p>
    {row.link ? <><p>{t('uc.localKept')} {local?.exam_date}</p><div className="uc-buttons">
      <button className="btn-ghost min-h-11 px-3" disabled={busy} onClick={() => run(() => calendar.act({ action: 'acknowledge_exam', ...identity }))}>{t('uc.keepLocal')}</button>
      {local && <button className="btn-ghost min-h-11 px-3" onClick={() => onOpenExam(local)}>{t('uc.openLocal')}</button>}
    </div></> : confirm ? <ExamConfirmation {...{ row, courses, busy, t }} maps={calendar.maps} onCancel={() => setConfirm(false)} onSave={form => run(async () => {
      await calendar.act({ action: 'confirm_exam', ...identity, exam: form }); await refresh();
    }, 'uc.examCreated')} /> : <>
      <div className="uc-buttons"><button className="btn-ghost min-h-11 px-3" disabled={busy} onClick={() => setConfirm(true)}>{t('uc.confirmExam')}</button>
        <button className="btn-ghost min-h-11 px-3" disabled={busy} onClick={() => run(() => calendar.override(row, 'other'))}>{t('uc.keepDeadline')}</button></div>
      <details><summary>{t('academic.changeType')}</summary><form className="uc-buttons" onSubmit={e => { e.preventDefault(); run(() => calendar.override(row, type)); }}>
        <select className="input" aria-label={t('academic.changeType')} value={type} onChange={e => setType(e.target.value)}>{ACADEMIC_EVENT_TYPES.map(value => <option key={value} value={value}>{t(`academic.type.${value}`)}</option>)}</select>
        <button className="btn-ghost min-h-11 px-3" disabled={busy}>{t('common.save')}</button></form></details>
    </>}
  </li>;
}

export default function UniversityCalendar({ calendar, courses, exams, t, lang, onClose, refresh, onOpenExam }) {
  const [step, setStep] = useState(calendar.sources.length ? 'sources' : 'connect');
  const [sourceId, setSourceId] = useState(calendar.sources[0]?.id || '');
  const [provider, setProvider] = useState('canvas');
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [disconnectId, setDisconnectId] = useState('');
  const secret = useRef(null);
  const root = useRef(null);
  useEffect(() => {
    const previous = document.activeElement;
    const dialog = root.current.closest('[role=dialog]');
    dialog.querySelector('button')?.focus();
    const trap = event => {
      if (event.key !== 'Tab') return;
      const nodes = [...dialog.querySelectorAll('button,input,select,a[href],summary')].filter(el => !el.disabled && el.getClientRects().length);
      const first = nodes[0], last = nodes[nodes.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    dialog.addEventListener('keydown', trap);
    return () => { dialog.removeEventListener('keydown', trap); previous?.focus(); };
  }, []);
  async function run(action, message) {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError(''); setStatus('');
    try { await action(); if (message) setStatus(t(message)); }
    catch (e) { setError(failure(e.message, t)); }
    finally { lock.current = false; setBusy(false); }
  }
  const source = calendar.sources.find(s => s.id === sourceId);
  const matching = externalCourses(calendar.rows, calendar.maps, sourceId);
  const review = calendarReview(calendar.rows, calendar.maps, calendar.links, sourceId, calendar.hidden);
  const close = () => { if (!lock.current) onClose(); };
  return <DetailSheet open title={t('academic.settings')} closeLabel={t('common.close')} onClose={close}>
    <div ref={root} className="uc-panel" aria-busy={busy}>
      {step !== 'sources' && <button className="btn-ghost min-h-11 px-3" disabled={busy} onClick={() => { setStep('sources'); setError(''); }}>{t('uc.back')}</button>}
      {error && <p role="alert" className="uc-message">{error}</p>}{status && <p role="status" className="uc-message">{status}</p>}
      {busy && <p role="status">{t('uc.working')}</p>}
      {step === 'sources' && <div className="uc-stack">
        {!calendar.sources.length && <p>{t('uc.intro')}</p>}
        {calendar.sources.map(s => {
          const pending = externalCourses(calendar.rows, calendar.maps, s.id).filter(c => !c.mapping).length;
          return <section key={s.id} className="uc-source"><h4>{s.display_name}</h4><p>{providerName(s.provider, t)} · {t('uc.connected')}</p>
            <p>{t('uc.lastSync')} {s.last_synced_at ? new Date(s.last_synced_at).toLocaleString(lang === 'fr' ? 'fr-BE' : 'en-US', { dateStyle: 'medium', timeStyle: 'short' }) : t('uc.never')}</p>
            {s.sync_status === 'error' && <p>{failure(s.sync_error, t)}</p>}
            {pending > 0 && <p>{t('uc.needsMatching').replace('{n}', pending)}</p>}
            <div className="uc-buttons"><button className="btn-ghost min-h-11 px-3" disabled={busy} onClick={() => run(() => calendar.act({ action: 'sync', source_id: s.id }), 'uc.synced')}>{t('uc.sync')}</button>
              <button className="btn-ghost min-h-11 px-3" disabled={busy} onClick={() => { setSourceId(s.id); setStep('matches'); }}>{t('uc.manageMatches')}</button>
              <button className="btn-ghost min-h-11 px-3" disabled={busy} onClick={() => { setSourceId(s.id); setStep('review'); }}>{t('uc.review')}</button>
              <button className="min-h-11 px-3 text-sm underline" disabled={busy} onClick={() => setDisconnectId(s.id)}>{t('uc.disconnect')}</button></div>
            {disconnectId === s.id && <div className="uc-stack uc-message"><p>{t('uc.disconnectHint')}</p><div className="uc-buttons">
              <button className="btn-primary min-h-11 px-3" disabled={busy} onClick={() => run(async () => { await calendar.act({ source_id: s.id }, 'DELETE'); setDisconnectId(''); await refresh(); }, 'uc.disconnected')}>{t('uc.confirmDisconnect')}</button>
              <button className="btn-ghost min-h-11 px-3" disabled={busy} onClick={() => setDisconnectId('')}>{t('common.cancel')}</button></div></div>}
          </section>;
        })}
        <section className="uc-visibility">
          <h4>{t('uc.visibility')}</h4><p>{t('academic.visibilityHint')}</p>
          {['exams', 'major', 'normal'].map(key => <label key={key}>{t(`academic.visibility.${key}`)}
            <input type="checkbox" role="switch" disabled={busy} checked={calendar.visibility[key]} onChange={e => { const checked = e.target.checked; run(() => calendar.changeVisibility(key, checked)); }} />
          </label>)}
        </section>
        <button type="button" className="btn-ghost min-h-11 px-3 self-start" disabled={busy} onClick={() => setStep('hidden')}>{t('uc.hidden')} · {calendar.hidden.length}</button>
        <button className="btn-primary min-h-11 px-4 self-start" disabled={busy || calendar.sources.length >= 3} onClick={() => setStep('connect')}>{t('uc.connect')}</button>
      </div>}
      {step === 'hidden' && <section className="uc-stack">
        <h4>{t('uc.hidden')}</h4><p>{t('academic.hideHint')}</p>
        {!calendar.hidden.length ? <p>{t('uc.noHidden')}</p> : <ul>{calendar.hidden.map(item => {
          const row = calendar.rows.find(row => hiddenAcademicKey(row) === hiddenAcademicKey(item));
          const source = calendar.sources.find(source => source.id === item.source_id);
          const mapping = row && calendar.maps.find(map => map.source_id === row.source_id && map.external_course_key === row.external_course_key);
          const course = courses.find(course => course.id === mapping?.local_course_id);
          return <li className="uc-hidden-item" key={hiddenAcademicKey(item)}><div>
            <strong>{row ? academicTitle(row) : t('uc.hiddenUnavailable')}</strong>
            <p>{[course?.name || row?.external_course_label, row?.event_date, source?.display_name].filter(Boolean).join(' · ')}</p>
          </div><button type="button" className="btn-ghost min-h-11 px-3" disabled={busy} onClick={() => run(() => calendar.hide(item, false), 'uc.restored')}>{t('uc.restore')}</button></li>;
        })}</ul>}
      </section>}
      {step === 'connect' && <form className="uc-stack" autoComplete="off" onSubmit={e => { e.preventDefault(); const feed = secret.current.value.trim(); secret.current.value = ''; run(async () => {
        const result = await calendar.act({ action: 'connect', provider, display_name: providerName(provider, t), feed_url: feed }); setSourceId(result.id); setStep('matches');
      }); }}>
        <label className="uc-field">{t('uc.provider')}<select className="input" value={provider} onChange={e => setProvider(e.target.value)}>{providers.map(p => <option value={p} key={p}>{providerName(p, t)}</option>)}</select></label>
        <p>{t(provider === 'canvas' ? 'uc.canvasInstructions' : 'uc.otherInstructions')}</p>
        <label className="uc-field">{t('uc.privateUrl')}<input ref={secret} type="password" autoComplete="off" spellCheck={false} required maxLength={4096} className="input" /></label>
        <p>{t('uc.secretHint')}</p><button className="btn-primary min-h-11 px-4" disabled={busy}>{t('uc.validate')}</button>
      </form>}
      {step === 'matches' && source && <Matches key={source.id} rows={matching} {...{ courses, busy, t }} onSave={decisions => run(async () => {
        if (decisions.length) await calendar.saveMatches(source.id, decisions); setStep('review');
      })} />}
      {step === 'review' && source && <div className="uc-stack"><h4>{t('uc.found').replace('{n}', review.total)}</h4>
        <ul className="uc-summary">{Object.entries(review.counts).map(([key, count]) => <li key={key}>{count} {t(`uc.count.${key}`)}</li>)}</ul>
        <p>{t('uc.reviewHint')}</p>{review.attention.length ? <ul>{review.attention.map(row => <ReviewItem key={academicKey(row)} {...{ row, calendar, courses, exams, busy, t, run, refresh, onOpenExam }} />)}</ul> : <p>{t('uc.noAttention')}</p>}
        <button className="btn-primary min-h-11 px-4" disabled={busy} onClick={close}>{t('uc.done')}</button>
      </div>}
    </div>
  </DetailSheet>;
}
