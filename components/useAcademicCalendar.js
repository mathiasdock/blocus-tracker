import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { calendarRequest } from '../lib/calendarApi';
import { supabase } from '../lib/supabaseClient';
import { ACADEMIC_COLUMNS, academicKey, academicVisibility, planningAcademicEvents } from '../lib/planningAcademicEvents.mjs';

export default function useAcademicCalendar(user, courses, exams) {
  const request = useRef(0);
  const invalidate = useCallback(() => { request.current++; }, []);
  const [rows, setRows] = useState([]);
  const [sources, setSources] = useState([]);
  const [links, setLinks] = useState([]);
  const [maps, setMaps] = useState([]);
  const [error, setError] = useState(false);
  const [visibility, setVisibility] = useState(() => academicVisibility());
  useEffect(() => {
    setRows([]); setMaps([]); setSources([]); setLinks([]); setError(false);
    try { setVisibility(academicVisibility(JSON.parse(localStorage.getItem(`bt_academic_visibility:${user?.id}`)))); }
    catch { setVisibility(academicVisibility()); }
    return invalidate;
  }, [user?.id, invalidate]);
  const load = useCallback(async () => {
    if (!user) return;
    const version = ++request.current;
    try {
      // Source IDs are obtained through owner RLS; secrets are never selected.
      const sources = await supabase.from('external_calendar_sources').select('id,provider,display_name,last_synced_at,last_attempted_at,sync_status,sync_error').eq('user_id', user.id);
      if (request.current !== version) return;
      if (sources.error) {
        if (['42P01', 'PGRST205'].includes(sources.error.code)) return; // Step 4 migration not applied yet.
        throw sources.error;
      }
      setSources(sources.data || []);
      if (!sources.data?.length) { setRows([]); setMaps([]); setLinks([]); setError(false); return; }
      const ids = sources.data.map(s => s.id);
      const [events, mappings, examLinks] = await Promise.all([
        supabase.from('external_academic_events').select(ACADEMIC_COLUMNS).in('source_id', ids).order('event_date').limit(300),
        supabase.from('external_calendar_course_map').select('source_id,external_course_key,external_course_label,local_course_id,ignored').eq('user_id', user.id),
        supabase.from('external_calendar_exam_links').select('source_id,external_uid,recurrence_id,local_exam_id,source_snapshot').eq('user_id', user.id),
      ]);
      if (request.current !== version) return;
      if (events.error || mappings.error || examLinks.error) throw events.error || mappings.error || examLinks.error;
      setRows(events.data || []); setMaps(mappings.data || []); setLinks(examLinks.data || []); setError(false);
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
    setRows(prev => prev.map(row => academicKey(row) === academicKey(event) ? data : row));
  }
  async function mapCourse(event, courseId) {
    const ignored = courseId === "ignore";
    const localId = !courseId || ignored ? null : courseId;
    const { error: writeError } = await supabase.from('external_calendar_course_map').upsert({
      user_id: user.id, source_id: event.source_id, external_course_key: event.external_course_key,
      external_course_label: event.external_course_label, local_course_id: localId, ignored,
    }, { onConflict: 'source_id,external_course_key' });
    if (writeError) throw new Error('calendar-write-failed');
    setMaps(prev => [...prev.filter(m => !(m.source_id === event.source_id && m.external_course_key === event.external_course_key)),
      { source_id: event.source_id, external_course_key: event.external_course_key, local_course_id: localId, ignored }]);
  }
  async function saveMatches(sourceId, decisions) {
    const { error: writeError } = await supabase.from('external_calendar_course_map').upsert(decisions.map(decision => ({
      user_id: user.id, source_id: sourceId, external_course_key: decision.key, external_course_label: decision.label,
      local_course_id: decision.value && decision.value !== 'ignore' ? decision.value : null, ignored: decision.value === 'ignore',
    })), { onConflict: 'source_id,external_course_key' });
    if (writeError) throw new Error('calendar_write_failed');
    await load();
  }
  async function act(body, method) {
    const result = await calendarRequest(body, method);
    await load();
    return result;
  }
  const byDate = useMemo(() => planningAcademicEvents(rows, maps, courses, exams, visibility, links), [rows, maps, courses, exams, visibility, links]);
  return { load, rows, maps, sources, links, act, saveMatches, byDate, visibility, changeVisibility, override, mapCourse, error, available: rows.length > 0 };
}
