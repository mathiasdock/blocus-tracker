import { useEffect, useMemo, useRef, useState } from 'react';
import DetailSheet from './DetailSheet';
import Glyph from './Glyph';
import PlanMenu from './planning/PlanMenu';
import { externalCourses, calendarExamPrefill, examReviewGroups, examLinkForm } from '../lib/calendarReview.mjs';
import { calendarRequest } from '../lib/calendarApi';
import { academicKey, hiddenAcademicKey, academicTitle, matchingLocalExam } from '../lib/planningAcademicEvents.mjs';

// University calendar, reached from the Planning « … » menu. One connected
// source reads as a status (« Canvas — Connected · Synced today 08:12 »)
// followed by quiet rows: matches, review, hidden items, then visibility.
// Disconnect stays last, in the danger ink, behind a confirmation. Adding a
// calendar is the primary action only when none is connected.
const providers = ['canvas', 'moodle', 'brightspace', 'ical'];
const MAX_SOURCES = 3;
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
const localeOf = lang => (lang === 'fr' ? 'fr-BE' : 'en-GB');
const ymd = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
function syncLabel(value, t, lang) {
  if (!value) return t('uc.never');
  const d = new Date(value);
  const time = d.toLocaleTimeString(localeOf(lang), { hour: '2-digit', minute: '2-digit' });
  const today = new Date();
  const yesterday = new Date(); yesterday.setDate(today.getDate() - 1);
  if (ymd(d) === ymd(today)) return t('uc.syncedToday').replace('{time}', time);
  if (ymd(d) === ymd(yesterday)) return t('uc.syncedYesterday').replace('{time}', time);
  return t('uc.syncedOn').replace('{date}', d.toLocaleDateString(localeOf(lang), { day: 'numeric', month: 'short' })).replace('{time}', time);
}
function dayLabel(date, lang) {
  return new Date(`${date}T12:00:00`).toLocaleDateString(localeOf(lang), { weekday: 'short', day: 'numeric', month: 'short' });
}

const Chevron = () => <Glyph size={16} className="uc-chevron"><path d="m9 18 6-6-6-6" /></Glyph>;
const IconBack = () => <Glyph size={16}><path d="m15 18-6-6 6-6" /></Glyph>;
const IconMore = () => <Glyph size={18}><circle cx="5" cy="12" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /></Glyph>;

// Same control as Profile's settings switches.
function Switch({ checked, onChange, label, disabled }) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label} disabled={disabled}
      onClick={() => onChange(!checked)}
      className="relative h-6 w-10 shrink-0 rounded-full transition-colors bt-press disabled:opacity-40"
      style={{ backgroundColor: checked ? 'var(--bt-action)' : 'var(--bt-border)' }}>
      <span className="absolute left-1 top-1 h-4 w-4 rounded-full bg-white transition-transform"
        style={{ transform: checked ? 'translateX(16px)' : 'translateX(0)', boxShadow: '0 1px 3px rgba(0,0,0,0.18)' }} />
    </button>
  );
}

function Matches({ rows, courses, onSave, busy, t }) {
  const [values, setValues] = useState(() => Object.fromEntries(rows.map(row => [row.key, row.mapping?.ignored ? 'ignore' : row.mapping?.local_course_id || ''])));
  return (
    <form onSubmit={e => { e.preventDefault(); onSave(rows.map(row => ({ ...row, value: values[row.key] || '' }))); }} className="uc-stack">
      <div>
        <h4 className="uc-title">{t('uc.matchTitle')}</h4>
        <p className="uc-muted">{t('uc.matchHint')}</p>
      </div>
      {rows.length ? (
        <ul className="uc-match-list">
          {rows.map(row => (
            <li key={row.key}>
              <label className="uc-match-row">
                <span className="uc-match-label">{row.label}</span>
                <select className="input" value={values[row.key] || ''} onChange={e => setValues(v => ({ ...v, [row.key]: e.target.value }))}>
                  <option value="">{t('uc.unmapped')}</option>
                  <option value="ignore">{t('uc.ignore')}</option>
                  {courses.filter(c => !c.archived_at || c.id === values[row.key]).map(course => <option key={course.id} value={course.id}>{course.name}</option>)}
                </select>
              </label>
            </li>
          ))}
        </ul>
      ) : <p className="uc-muted">{t('uc.noKeys')}</p>}
      <div className="uc-footer"><button className="btn-primary min-h-11 px-4" disabled={busy}>{t('uc.saveContinue')}</button></div>
    </form>
  );
}

function ExamConfirmation({ row, maps, courses, busy, t, onSave, onCancel }) {
  const [form, setForm] = useState(() => row.prefill || calendarExamPrefill(row, maps));
  const field = key => ({ value: form[key], onChange: e => setForm(f => ({ ...f, [key]: e.target.value })) });
  return (
    <form className="uc-stack" onSubmit={e => { e.preventDefault(); onSave(form); }}>
      <div>
        <h4 className="uc-title">{t('uc.editExam')}</h4>
        <p className="uc-muted">{t('uc.examRule')}</p>
      </div>
      <label className="uc-field">{t('uc.examName')}<input className="input" required maxLength={160} {...field('name')} /></label>
      <label className="uc-field">{t('academic.mapCourse')}<select className="input" {...field('courseId')}><option value="">{t('uc.unmapped')}</option>{courses.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
      <div className="uc-date-time">
        <label className="uc-field">{t('uc.examDate')}<input className="input" required type="date" {...field('date')} /></label>
        <label className="uc-field">{t('uc.examTime')}<input className="input" type="time" {...field('time')} /></label>
      </div>
      <label className="uc-field">{t('uc.examLocation')}<input className="input" maxLength={160} {...field('location')} /></label>
      <div className="uc-footer">
        <button className="btn-primary min-h-11 px-4" disabled={busy}>{t('uc.createExam')}</button>
        <button type="button" className="bt-plan-action bt-plan-action--quiet" onClick={onCancel} disabled={busy}>{t('common.cancel')}</button>
      </div>
    </form>
  );
}

// First-import convenience: every exam candidate in one list, likely exams
// preselected, possible ones (tests, a bare « Final ») left to the student.
// Exams the student already has wait apart, unselectable, to be linked. One
// primary action adds the selection through the same server conversion as a
// single confirmation — idempotent, linked, never duplicating a linked exam.
export function ExamReview({ calendar, courses, exams, source, t, lang, busy, setWorking, setStatus, setError, refresh, onOpenExam, onDone }) {
  const groups = useMemo(() => examReviewGroups(calendar.rows, calendar.maps, calendar.links, source.id, calendar.hidden, exams),
    [calendar.rows, calendar.maps, calendar.links, calendar.hidden, source.id, exams]);
  const [selected, setSelected] = useState(() => new Set(groups.preselected));
  const seen = useRef(new Set([...groups.likely, ...groups.possible].map(item => item.key)));
  const [editing, setEditing] = useState(null);
  const [progress, setProgress] = useState(null);
  // Candidates that appear later (after a sync) get the same default, once.
  useEffect(() => {
    const fresh = [...groups.likely, ...groups.possible].filter(item => !seen.current.has(item.key));
    if (!fresh.length) return;
    fresh.forEach(item => seen.current.add(item.key));
    setSelected(previous => new Set([...previous, ...fresh.filter(item => groups.preselected.includes(item.key)).map(item => item.key)]));
  }, [groups]);

  const candidates = [...groups.likely, ...groups.possible];
  const chosen = candidates.filter(item => selected.has(item.key));
  const courseName = id => courses.find(c => c.id === id)?.name;
  const toggle = key => setSelected(previous => { const next = new Set(previous); next.has(key) ? next.delete(key) : next.add(key); return next; });

  async function confirmSelected() {
    if (busy || !chosen.length) return;
    setWorking(true); setError(''); setStatus('');
    const knownExams = [...exams];
    let added = 0;
    let failed = null;
    for (const item of chosen) {
      setProgress({ done: added, total: chosen.length });
      try {
        // Earlier selections can have created this same course/day exam.
        const existing = matchingLocalExam(knownExams, { ...item.prefill, rawName: item.raw_title });
        const form = examLinkForm(existing) || item.prefill;
        const result = await calendarRequest({ action: 'confirm_exam', source_id: item.source_id, external_uid: item.external_uid,
          recurrence_id: item.recurrence_id || '', exam: form });
        if (!existing) knownExams.push({ id: result.exam_id, name: form.name, course_id: form.courseId,
          exam_date: form.date, exam_time: form.time, location: form.location });
        added += 1;
      } catch (error) { failed = error; break; }
    }
    setProgress(null);
    try { await calendar.load(); await refresh(); } catch { /* the next open reloads */ }
    setSelected(previous => new Set([...previous].filter(key => !chosen.slice(0, added).some(item => item.key === key))));
    if (added) setStatus(t(added === 1 ? 'uc.examsAddedOne' : 'uc.examsAddedMany').replace('{n}', added));
    if (failed) setError(`${failure(failed.message, t)} ${t('uc.examsRemaining').replace('{n}', chosen.length - added)}`);
    setWorking(false);
  }

  if (editing) {
    const row = candidates.find(item => item.key === editing);
    if (row) {
      return <ExamConfirmation row={row} maps={calendar.maps} courses={courses} busy={busy} t={t} onCancel={() => setEditing(null)}
        onSave={async form => {
          setWorking(true); setError(''); setStatus('');
          try {
            const existing = matchingLocalExam(exams, form);
            await calendarRequest({ action: 'confirm_exam', source_id: row.source_id, external_uid: row.external_uid, recurrence_id: row.recurrence_id || '',
              exam: examLinkForm(existing) || form });
            await calendar.load(); await refresh();
            setStatus(t('uc.examCreated')); setEditing(null);
          } catch (error) { setError(failure(error.message, t)); }
          finally { setWorking(false); }
        }} />;
    }
  }

  // Link an import to the exam the student already has (same course and day):
  // the server links that exact exam instead of creating one.
  async function linkExisting(item, form) {
    setWorking(true); setError(''); setStatus('');
    try {
      await calendarRequest({ action: 'confirm_exam', source_id: item.source_id, external_uid: item.external_uid, recurrence_id: item.recurrence_id || '', exam: form });
      await calendar.load(); await refresh();
      setStatus(t('uc.examLinked'));
    } catch (error) { setError(failure(error.message, t)); }
    finally { setWorking(false); }
  }

  const renderItem = item => {
    const course = courseName(item.prefill.courseId) || item.external_course_label || t('academic.unmapped');
    const when = [dayLabel(item.prefill.date, lang), item.prefill.time].filter(Boolean).join(' · ');
    const linkForm = item.duplicate && examLinkForm(item.duplicate);
    return (
      <li key={item.key} className="uc-candidate" data-duplicate={item.duplicate ? '1' : undefined}>
        <label className="uc-candidate-check">
          <input type="checkbox" className="bt-task-check h-4 w-4" checked={!item.duplicate && selected.has(item.key)}
            disabled={busy || !!item.duplicate} onChange={() => toggle(item.key)} />
          <span className="uc-candidate-text">
            <span className="uc-candidate-title">{academicTitle(item)}</span>
            <span className="uc-candidate-meta">{course} · {when}</span>
            {item.duplicate && <span className="uc-candidate-note">{t('uc.alreadyExam').replace('{name}', item.duplicate.name || course)}</span>}
          </span>
        </label>
        <PlanMenu label={t('uc.examActions')} ariaLabel={t('uc.examActions')} triggerClassName="bt-plan-icon-action" width={260} items={[
          item.duplicate
            ? linkForm && { key: 'link', label: t('academic.linkToExam'), description: t('uc.linkHint'), onSelect: () => linkExisting(item, linkForm) }
            : { key: 'edit', label: t('uc.editExam'), onSelect: () => setEditing(item.key) },
          { key: 'deadline', label: t('uc.notExam'), description: t('uc.notExamHint'), onSelect: async () => {
            setWorking(true); setError('');
            try { await calendar.override(item, 'other'); setSelected(previous => { const next = new Set(previous); next.delete(item.key); return next; }); }
            catch { setError(t('academic.saveError')); }
            finally { setWorking(false); }
          } },
        ]}><IconMore /></PlanMenu>
      </li>
    );
  };
  const groupToggle = items => {
    const keys = items.map(item => item.key);
    if (!keys.length) return null;
    const all = keys.every(key => selected.has(key));
    return <button type="button" className="uc-link" disabled={busy}
      onClick={() => setSelected(previous => { const next = new Set(previous); keys.forEach(key => (all ? next.delete(key) : next.add(key))); return next; })}>
      {t(all ? 'uc.clearSelection' : 'uc.selectAll')}
    </button>;
  };

  return (
    <div className="uc-stack">
      <div>
        <h4 className="uc-title">{t('uc.reviewTitle')}</h4>
        <p className="uc-muted">{t('uc.reviewSummary').replace('{n}', groups.total).replace('{provider}', providerName(source.provider, t))}</p>
      </div>
      {!candidates.length && !groups.changed.length && <p className="uc-muted">{t('uc.noAttention')}</p>}
      {groups.likely.length > 0 && (
        <section className="uc-review-group" aria-labelledby="uc-likely">
          <div className="uc-review-head"><h5 id="uc-likely">{t('uc.likelyExams')}</h5>{groupToggle(groups.likely)}</div>
          <ul>{groups.likely.map(renderItem)}</ul>
        </section>
      )}
      {groups.possible.length > 0 && (
        <section className="uc-review-group" aria-labelledby="uc-possible">
          <div className="uc-review-head"><h5 id="uc-possible">{t('uc.possibleExams')}</h5></div>
          <p className="uc-muted">{t('uc.possibleHint')}</p>
          <ul>{groups.possible.map(renderItem)}</ul>
        </section>
      )}
      {groups.duplicates.length > 0 && (
        <section className="uc-review-group" aria-labelledby="uc-duplicates">
          <div className="uc-review-head"><h5 id="uc-duplicates">{t('uc.alreadyInExams')}</h5></div>
          <p className="uc-muted">{t('uc.alreadyInExamsHint')}</p>
          <ul>{groups.duplicates.map(renderItem)}</ul>
        </section>
      )}
      {groups.changed.length > 0 && (
        <section className="uc-review-group" aria-labelledby="uc-changed">
          <div className="uc-review-head"><h5 id="uc-changed">{t('uc.changedTitle').replace('{provider}', providerName(source.provider, t))}</h5></div>
          <ul>{groups.changed.map(row => {
            const local = exams.find(e => e.id === row.link?.local_exam_id);
            const identity = { source_id: row.source_id, external_uid: row.external_uid, recurrence_id: row.recurrence_id || '' };
            return (
              <li key={academicKey(row)} className="uc-candidate uc-candidate--changed">
                <span className="uc-candidate-text">
                  <span className="uc-candidate-title">{academicTitle(row)}</span>
                  <span className="uc-candidate-meta">{t('uc.changedMeta').replace('{source}', dayLabel(row.event_date, lang)).replace('{local}', local ? dayLabel(local.exam_date, lang) : '—')}</span>
                </span>
                <span className="uc-candidate-actions">
                  <button type="button" className="bt-plan-action bt-plan-action--quiet" disabled={busy} onClick={async () => {
                    setWorking(true); setError('');
                    try { await calendar.act({ action: 'acknowledge_exam', ...identity }); }
                    catch (error) { setError(failure(error.message, t)); }
                    finally { setWorking(false); }
                  }}>{t('uc.keepLocal')}</button>
                  {local && <button type="button" className="bt-plan-action bt-plan-action--outline" onClick={() => onOpenExam(local)}>{t('uc.openLocal')}</button>}
                </span>
              </li>
            );
          })}</ul>
        </section>
      )}
      {progress && <p role="status" className="uc-muted">{t('uc.addingProgress').replace('{done}', progress.done + 1).replace('{total}', progress.total)}</p>}
      {candidates.length > 0 && (
        <div className="uc-footer uc-footer--sticky">
          <button type="button" className="btn-primary min-h-11 px-4" disabled={busy || !chosen.length} onClick={confirmSelected}>
            {t((lang === 'fr' ? chosen.length <= 1 : chosen.length === 1) ? 'uc.addSelectedOne' : 'uc.addSelectedMany').replace('{n}', chosen.length)}
          </button>
          <button type="button" className="bt-plan-action bt-plan-action--quiet" disabled={busy} onClick={onDone}>{t('uc.notNow')}</button>
          <p className="uc-footnote">{t('uc.reviewFootnote')}</p>
        </div>
      )}
      {!candidates.length && <div className="uc-footer"><button type="button" className="btn-primary min-h-11 px-4" onClick={onDone}>{t('uc.done')}</button></div>}
    </div>
  );
}

export default function UniversityCalendar({ calendar, courses, exams, t, lang, onClose, refresh, onOpenExam, initialStep }) {
  const [step, setStep] = useState(initialStep || (calendar.sources.length ? 'sources' : 'connect'));
  const [sourceId, setSourceId] = useState(calendar.sources[0]?.id || '');
  const [provider, setProvider] = useState('canvas');
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [disconnectId, setDisconnectId] = useState('');
  const [syncingId, setSyncingId] = useState('');
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
  // The review runs several requests in a row: closing mid-way is refused,
  // exactly like the single actions guarded by `run`.
  const setWorking = value => { lock.current = value; setBusy(value); };
  const go = next => { setStep(next); setError(''); setStatus(''); };
  const source = calendar.sources.find(s => s.id === sourceId);
  const matching = externalCourses(calendar.rows, calendar.maps, sourceId);
  const close = () => { if (!lock.current) onClose(); };
  const title = step === 'sources' || !calendar.sources.length ? t('academic.settings') : providerName(source?.provider, t) || t('academic.settings');
  return (
    <DetailSheet open title={title} closeLabel={t('common.close')} onClose={close}>
      <div ref={root} className="uc-panel" aria-busy={busy}>
        {step !== 'sources' && calendar.sources.length > 0 && (
          <button type="button" className="uc-back" disabled={busy} onClick={() => go('sources')}><IconBack />{t('academic.settings')}</button>
        )}
        {error && <p role="alert" className="uc-message uc-message--error">{error}</p>}
        {status && <p role="status" className="uc-message">{status}</p>}

        {step === 'sources' && (
          <div className="uc-stack">
            {calendar.sources.map(s => {
              const courseKeys = externalCourses(calendar.rows, calendar.maps, s.id);
              const pending = courseKeys.filter(c => !c.mapping).length;
              const attention = examReviewGroups(calendar.rows, calendar.maps, calendar.links, s.id, calendar.hidden, exams).needsReview;
              const name = providerName(s.provider, t);
              const syncing = syncingId === s.id;
              return (
                <section key={s.id} className="uc-source" aria-label={name}>
                  <div className="uc-source-head">
                    <div className="min-w-0">
                      <p className="uc-source-name">{s.display_name && s.display_name !== name ? s.display_name : name}</p>
                      <p className="uc-source-status">
                        <span className={`uc-status-dot${s.sync_status === 'error' ? ' uc-status-dot--error' : ''}`} aria-hidden="true" />
                        {t('uc.connected')} · {syncLabel(s.last_synced_at, t, lang)}
                      </p>
                    </div>
                    <button type="button" className="bt-plan-action bt-plan-action--outline" disabled={busy}
                      onClick={() => { setSourceId(s.id); setSyncingId(s.id); run(() => calendar.act({ action: 'sync', source_id: s.id }), 'uc.synced').finally(() => setSyncingId('')); }}>
                      {syncing ? t('uc.syncing') : t('uc.sync')}
                    </button>
                  </div>
                  {s.sync_status === 'error' && <p className="uc-source-warning">{failure(s.sync_error, t)}</p>}
                  <ul className="uc-rows">
                    <li><button type="button" className="uc-row" disabled={busy} onClick={() => { setSourceId(s.id); go('matches'); }}>
                      <span>{t('uc.manageMatches')}</span>
                      <span className={`uc-row-hint${pending ? ' uc-row-hint--attention' : ''}`}>{pending ? t('uc.needsMatching').replace('{n}', pending) : t('uc.matchedCount').replace('{n}', courseKeys.length - pending)}</span>
                      <Chevron />
                    </button></li>
                    <li><button type="button" className="uc-row" disabled={busy} onClick={() => { setSourceId(s.id); go('review'); }}>
                      <span>{t('uc.review')}</span>
                      <span className={`uc-row-hint${attention ? ' uc-row-hint--attention' : ''}`}>{attention ? t('uc.toReview').replace('{n}', attention) : t('uc.nothingToReview')}</span>
                      <Chevron />
                    </button></li>
                    <li><button type="button" className="uc-row" disabled={busy} onClick={() => go('hidden')}>
                      <span>{t('uc.hidden')}</span>
                      <span className="uc-row-hint">{calendar.hidden.filter(item => item.source_id === s.id).length}</span>
                      <Chevron />
                    </button></li>
                  </ul>
                  {disconnectId === s.id ? (
                    <div className="uc-confirm" role="group" aria-label={t('uc.confirmDisconnect')}>
                      <p>{t('uc.disconnectHint')}</p>
                      <div className="uc-footer">
                        <button type="button" className="bt-plan-action bt-plan-action--danger-solid" disabled={busy}
                          onClick={() => run(async () => { await calendar.act({ source_id: s.id }, 'DELETE'); setDisconnectId(''); await refresh(); }, 'uc.disconnected')}>
                          {t('uc.disconnectNamed').replace('{name}', name)}
                        </button>
                        <button type="button" className="bt-plan-action bt-plan-action--quiet" disabled={busy} onClick={() => setDisconnectId('')}>{t('common.cancel')}</button>
                      </div>
                    </div>
                  ) : (
                    <button type="button" className="uc-danger-link" disabled={busy} onClick={() => setDisconnectId(s.id)}>{t('uc.disconnectNamed').replace('{name}', name)}</button>
                  )}
                </section>
              );
            })}
            {calendar.sources.length > 0 && (
              <section className="uc-visibility" aria-labelledby="uc-visibility-title">
                <h4 id="uc-visibility-title" className="uc-subtitle">{t('uc.visibility')}</h4>
                <ul>
                  {['exams', 'major', 'normal'].map(key => (
                    <li key={key} className="uc-switch-row">
                      <span>{t(`academic.visibility.${key}`)}</span>
                      <Switch label={t(`academic.visibility.${key}`)} disabled={busy} checked={calendar.visibility[key]}
                        onChange={checked => run(() => calendar.changeVisibility(key, checked))} />
                    </li>
                  ))}
                </ul>
                <p className="uc-muted">{t('academic.visibilityHint')}</p>
              </section>
            )}
            {!calendar.sources.length && <p className="uc-muted">{t('uc.intro')}</p>}
            {calendar.sources.length > 0 && calendar.sources.length < MAX_SOURCES && (
              <button type="button" className="uc-add-link" disabled={busy} onClick={() => go('connect')}>+ {t('uc.addAnother')}</button>
            )}
          </div>
        )}

        {step === 'hidden' && (
          <section className="uc-stack">
            <div>
              <h4 className="uc-title">{t('uc.hidden')}</h4>
              <p className="uc-muted">{t('academic.hideHint')}</p>
            </div>
            {!calendar.hidden.length ? <p className="uc-muted">{t('uc.noHidden')}</p> : (
              <ul className="uc-hidden-list">{calendar.hidden.map(item => {
                const row = calendar.rows.find(r => hiddenAcademicKey(r) === hiddenAcademicKey(item));
                const owner = calendar.sources.find(s => s.id === item.source_id);
                const mapping = row && calendar.maps.find(map => map.source_id === row.source_id && map.external_course_key === row.external_course_key);
                const course = courses.find(c => c.id === mapping?.local_course_id);
                return (
                  <li className="uc-hidden-item" key={hiddenAcademicKey(item)}>
                    <div>
                      <strong>{row ? academicTitle(row) : t('uc.hiddenUnavailable')}</strong>
                      <p>{[course?.name || row?.external_course_label, row?.event_date && dayLabel(row.event_date, lang), owner && providerName(owner.provider, t)].filter(Boolean).join(' · ')}</p>
                    </div>
                    <button type="button" className="bt-plan-action bt-plan-action--outline" disabled={busy} onClick={() => run(() => calendar.hide(item, false), 'uc.restored')}>{t('uc.restore')}</button>
                  </li>
                );
              })}</ul>
            )}
          </section>
        )}

        {step === 'connect' && (
          <form className="uc-stack" autoComplete="off" onSubmit={e => {
            e.preventDefault();
            const feed = secret.current.value.trim();
            secret.current.value = '';
            run(async () => {
              const result = await calendar.act({ action: 'connect', provider, display_name: providerName(provider, t), feed_url: feed });
              setSourceId(result.id); setStep('matches');
            });
          }}>
            <div>
              <h4 className="uc-title">{t(calendar.sources.length ? 'uc.addAnother' : 'uc.connect')}</h4>
              <p className="uc-muted">{t('uc.intro')}</p>
            </div>
            <label className="uc-field">{t('uc.provider')}<select className="input" value={provider} onChange={e => setProvider(e.target.value)}>{providers.map(p => <option value={p} key={p}>{providerName(p, t)}</option>)}</select></label>
            <p className="uc-muted">{t(provider === 'canvas' ? 'uc.canvasInstructions' : 'uc.otherInstructions')}</p>
            <label className="uc-field">{t('uc.privateUrl')}<input ref={secret} type="password" autoComplete="off" spellCheck={false} required maxLength={4096} className="input" /></label>
            <p className="uc-muted">{t('uc.secretHint')}</p>
            <div className="uc-footer"><button className="btn-primary min-h-11 px-4" disabled={busy}>{t('uc.validate')}</button></div>
          </form>
        )}

        {step === 'matches' && source && <Matches key={source.id} rows={matching} {...{ courses, busy, t }} onSave={decisions => run(async () => {
          if (decisions.length) await calendar.saveMatches(source.id, decisions);
          setStep('review');
        })} />}

        {step === 'review' && source && (
          <ExamReview {...{ calendar, courses, exams, source, t, lang, busy, setWorking, setStatus, setError, refresh, onOpenExam }}
            onDone={close} />
        )}
        {busy && <p className="sr-only" role="status">{t('uc.working')}</p>}
      </div>
    </DetailSheet>
  );
}
