import { classifyAcademicEvent } from './academicEventClassification.mjs';
import { academicKey } from './planningAcademicEvents.mjs';

// Synthetic rehearsal only. Never accepts/fetches/stores a real calendar URL.
export async function offlineCalendarRequest(body, method) {
  if (process.env.NODE_ENV !== 'development' || process.env.NEXT_PUBLIC_OFFLINE_DEV !== 'true') throw new Error('calendar_sync_failed');
  const db = JSON.parse(localStorage.getItem('bt_offline_db_v3'));
  const user_id = 'offline-user-mathias';
  db.external_calendar_sources ||= []; db.external_academic_events ||= [];
  db.external_calendar_exam_links ||= []; db.external_calendar_course_map ||= [];
  let result = {};
  const source = db.external_calendar_sources.find(s => s.id === body.source_id && s.user_id === user_id);
  if (body.action === 'connect') {
    if (body.feed_url !== 'https://canvas.example.edu/calendar.ics') throw new Error('invalid_calendar_feed');
    if (db.external_calendar_sources.length >= 3) throw new Error('calendar_source_limit');
    const id = crypto.randomUUID();
    db.external_calendar_sources.push({ id, user_id, provider: body.provider, display_name: body.display_name,
      last_synced_at: new Date().toISOString(), sync_status: 'success', demo_syncs: 0 });
    const date = new Date().toLocaleDateString('en-CA');
    db.external_academic_events.push(...['Final Exam', 'Test 1', 'Group Assignment', 'Quiz 4', 'Essay', ...Array.from({ length: 5 }, (_, i) => `Quiz ${i+5}`)].map((name, i) => {
      const raw_title = `${name} [${i % 2 ? 'MAR 4156' : 'ADV 3001'}]`;
      return { id: crypto.randomUUID(), source_id: id, external_uid: `fixture-${i}`, recurrence_id: '', raw_title,
        external_course_key: i % 2 ? 'canvas:course:99' : 'canvas:course:42', external_course_label: i % 2 ? 'MAR 4156' : 'ADV 3001',
        event_date: date, all_day: true, status: 'active', user_override: null, ...classifyAcademicEvent({ raw_title }) };
    }));
    result = { id, event_count: 10 };
  } else {
    if (!source) throw new Error('calendar_not_found');
    if (method === 'DELETE') {
      for (const table of ['external_academic_events','external_calendar_course_map','external_calendar_exam_links','external_calendar_hidden_items']) db[table] = db[table].filter(row => row.source_id !== source.id);
      db.external_calendar_sources = db.external_calendar_sources.filter(s => s.id !== source.id);
      result = { disconnected: true };
    } else if (body.action === 'sync') {
      source.demo_syncs = (source.demo_syncs || 0) + 1;
      if (source.demo_syncs === 2) db.external_academic_events.push({ id: crypto.randomUUID(), source_id: source.id, external_uid: 'new-course', recurrence_id: '',
        raw_title: 'Presentation [ECO 2000]', external_course_key: 'canvas:course:100', external_course_label: 'ECO 2000', event_date: new Date().toLocaleDateString('en-CA'),
        all_day: true, status: 'active', ...classifyAcademicEvent({ raw_title: 'Presentation' }) });
      if (source.demo_syncs === 3) {
        const event = db.external_academic_events.find(e => e.source_id === source.id && e.external_uid === 'fixture-0');
        const d = new Date(`${event.event_date}T12:00:00`); d.setDate(d.getDate()+1); event.event_date = d.toLocaleDateString('en-CA');
      }
      source.last_synced_at = new Date().toISOString(); source.sync_status = 'success';
      result = { event_count: db.external_academic_events.filter(e => e.source_id === source.id).length };
    } else {
      const event = db.external_academic_events.find(e => academicKey(e) === academicKey(body));
      if (!event) throw new Error('calendar_event_not_found');
      const snapshot = Object.fromEntries(['raw_title','event_date','starts_at','due_at','floating_at','all_day'].map(k => [k, event[k] ?? null]));
      let link = db.external_calendar_exam_links.find(l => academicKey(l) === academicKey(body));
      if (body.action === 'acknowledge_exam') { if (link) link.source_snapshot = snapshot; }
      else if (!link) {
        const form = body.exam; const id = crypto.randomUUID();
        db.exams.push({ id, user_id, name: form.name, course_id: form.courseId || null, exam_date: form.date, exam_time: form.time || null, location: form.location || null });
        link = { source_id: event.source_id, external_uid: event.external_uid, recurrence_id: event.recurrence_id, user_id, local_exam_id: id, source_snapshot: snapshot };
        db.external_calendar_exam_links.push(link); event.user_override = 'exam';
      }
      result = { exam_id: link?.local_exam_id };
    }
  }
  localStorage.setItem('bt_offline_db_v3', JSON.stringify(db));
  return result;
}
