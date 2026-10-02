import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { ACADEMIC_COLUMNS, academicKey, academicVisibility, planningAcademicEvents } from '../lib/planningAcademicEvents.mjs';

export default function useAcademicCalendar(user, courses, exams) {
  const request = useRef(0);
  const invalidate = useCallback(() => { request.current++; }, []);
  const [rows, setRows] = useState([]);
  const [maps, setMaps] = useState([]);
  const [error, setError] = useState(false);
  const [visibility, setVisibility] = useState(() => academicVisibility());
  useEffect(() => {
    setRows([]); setMaps([]); setError(false);
    try { setVisibility(academicVisibility(JSON.parse(localStorage.getItem(`bt_academic_visibility:${user?.id}`)))); }
    catch { setVisibility(academicVisibility()); }
    return invalidate;
  }, [user?.id, invalidate]);
  const load = useCallback(async () => {
    if (!user) return;
    const version = ++request.current;
    try {
      // Source IDs are obtained through owner RLS; secrets are never selected.
      const sources = await supabase.from('external_calendar_sources').select('id').eq('user_id', user.id);
      if (request.current !== version) return;
      if (sources.error) {
        if (['42P01', 'PGRST205'].includes(sources.error.code)) return; // Step 4 migration not applied yet.
        throw sources.error;
      }
      if (!sources.data?.length) { setRows([]); setMaps([]); setError(false); return; }
      const ids = sources.data.map(s => s.id);
      const [events, mappings] = await Promise.all([
        supabase.from('external_academic_events').select(ACADEMIC_COLUMNS).in('source_id', ids).order('event_date').limit(300),
        supabase.from('external_calendar_course_map').select('source_id,external_course_key,local_course_id').eq('user_id', user.id),
      ]);
      if (request.current !== version) return;
      if (events.error || mappings.error) throw events.error || mappings.error;
      setRows(events.data || []); setMaps(mappings.data || []); setError(false);
    } catch { if (request.current === version) setError(true); }
  }, [user]);
  function changeVisibility(key, checked) {
    const next = { ...visibility, [key]: checked }; setVisibility(next);
    try { localStorage.setItem(`bt_academic_visibility:${user.id}`, JSON.stringify(next)); } catch { /* In-memory settings still work. */ }
  }
  async function override(event, type) {
    const { data, error: writeError } = await supabase.from('external_academic_events').update({ user_override: type })
      .eq('source_id', event.source_id).eq('external_uid', event.external_uid).eq('recurrence_id', event.recurrence_id || '')
      .select(ACADEMIC_COLUMNS).single();
    if (writeError || !data) throw new Error('calendar-write-failed');
    setRows(prev => prev.map(row => academicKey(row) === event.key ? data : row));
  }
  async function mapCourse(event, courseId) {
    const { error: writeError } = await supabase.from('external_calendar_course_map').upsert({
      user_id: user.id, source_id: event.source_id, external_course_key: event.external_course_key,
      external_course_label: event.external_course_label, local_course_id: courseId,
    }, { onConflict: 'source_id,external_course_key' });
    if (writeError) throw new Error('calendar-write-failed');
    setMaps(prev => [...prev.filter(m => !(m.source_id === event.source_id && m.external_course_key === event.external_course_key)),
      { source_id: event.source_id, external_course_key: event.external_course_key, local_course_id: courseId }]);
  }
  const byDate = useMemo(() => planningAcademicEvents(rows, maps, courses, exams, visibility), [rows, maps, courses, exams, visibility]);
  return { load, byDate, visibility, changeVisibility, override, mapCourse, error, available: rows.length > 0 };
}
