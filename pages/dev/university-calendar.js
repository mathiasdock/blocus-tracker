import Head from 'next/head';
import { useState } from 'react';
import { supabase, isOfflineDev } from '../../lib/supabaseClient';
import { COURSE_COLORS } from '../../lib/courseColors';
import { classifyAcademicEvent } from '../../lib/academicEventClassification.mjs';

export function getServerSideProps() {
  return process.env.NODE_ENV === 'development' && process.env.NEXT_PUBLIC_OFFLINE_DEV === 'true'
    ? { props: {} } : { notFound: true };
}
export default function UniversityCalendarFixture() {
  const [empty, setEmpty] = useState(false);
  const [dense, setDense] = useState(false);
  const [dark, setDark] = useState(false);
  const [lang, setLang] = useState('en');
  async function open() {
    if (!isOfflineDev) return;
    await supabase.auth.signInWithPassword();
    await supabase.from('courses').select('*');
    const db = JSON.parse(localStorage.getItem('bt_offline_db_v3'));
    const user_id = 'offline-user-mathias';
    const date = offset => { const d = new Date(); d.setDate(d.getDate() + offset); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
    db.courses = ['Principles of Advertising', 'International Marketing'].map((name, i) => ({ id: `academic-course-${i}`, user_id, name, color: COURSE_COLORS[i ? 9 : 12], created_at: new Date().toISOString() }));
    db.objectives = [{ id: 'academic-study-1', user_id, course_id: db.courses[0].id, title: 'Review campaign strategy', target_minutes: 45, scheduled_date: date(0), done: false },
      { id: 'academic-study-2', user_id, course_id: db.courses[1].id, title: 'Practice case study', target_minutes: 60, scheduled_date: date(0), done: false }];
    db.exams = [];
    db.external_calendar_sources = [{ id: 'fixture-calendar', user_id, provider: 'canvas', display_name: 'University' }];
    db.external_calendar_course_map = [{ id: 'fixture-map', user_id, source_id: 'fixture-calendar', external_course_key: 'course_42', local_course_id: db.courses[0].id }];
    let counter = 0;
    const event = (title, offset, mapped = true) => {
      const raw_title = title + (mapped ? ' [ADV 3001]' : ' [MKT 2100]');
      const row = { id: `fixture-${counter}`, source_id: 'fixture-calendar', external_uid: `fixture-${counter++}`, recurrence_id: '', raw_title,
        event_date: date(offset), floating_at: `${date(offset)}T23:59:00`, all_day: title === 'Final Exam', status: 'active',
        external_course_key: mapped ? 'course_42' : 'course_99', external_course_label: mapped ? 'ADV 3001' : 'MKT 2100',
        external_url: 'https://canvas.example.edu/courses/42/assignments/123', user_override: null };
      return { ...row, ...classifyAcademicEvent(row) };
    };
    db.external_academic_events = [event('Final Exam', 0), event('Group Assignment', 0), event('Quiz 4', 0), event('Essay', 0, false), event('Test 1', 1, false), event('Presentation', 2)];
    if (dense) {
      for (let i = 0; i < 6; i++) db.external_academic_events.push(event(`Quiz ${i + 5}`, 0, false));
      for (let day = 3; day <= 28; day++) for (let i = 0; i < 3; i++) db.external_academic_events.push(event(i === 0 && day % 7 === 0 ? 'Midterm' : `Assignment ${day}-${i + 1}`, day, i % 2 === 0));
    }
    if (empty) { db.external_calendar_sources = []; db.external_academic_events = []; db.external_calendar_course_map = []; }
    db.external_calendar_exam_links = [];
    sessionStorage.setItem('bt_legal_notice_snoozed', '1');
    localStorage.setItem('bt_offline_db_v3', JSON.stringify(db));
    localStorage.removeItem(`bt_academic_visibility:${user_id}`);
    localStorage.setItem('bt_theme', dark ? 'dark' : 'light');
    localStorage.setItem('bt_lang_pref', lang);
    window.location.assign('/planning');
  }
  return <main className="p-6 space-y-4"><Head><title>University calendar — offline fixture</title><meta name="robots" content="noindex" /></Head>
    <h1>University calendar · local fixtures</h1><p>Replaces only this origin’s offline demo data. No production connection.</p>
    <label className="block"><input type="checkbox" checked={empty} onChange={e => setEmpty(e.target.checked)} /> Start disconnected (connection flow)</label>
    <p>Connection rehearsal URL: https://canvas.example.edu/calendar.ics. Sync 1 repeats, sync 2 adds a course, sync 3 changes an exam date.</p>
    <label className="block"><input type="checkbox" checked={dense} onChange={e => setDense(e.target.checked)} /> Dense semester (10 items today)</label>
    <label className="block"><input type="checkbox" checked={dark} onChange={e => setDark(e.target.checked)} /> Dark mode</label>
    <label className="block">Language <select value={lang} onChange={e => setLang(e.target.value)}><option>en</option><option>fr</option></select></label>
    <button className="btn-primary min-h-11 px-4" onClick={open}>Open offline Planning</button>
  </main>;
}
