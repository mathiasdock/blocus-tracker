import { supabase, isOfflineDev } from './supabaseClient';

export async function calendarRequest(body, method = 'POST') {
  // Offline fixtures stay entirely local; this module never sends their auth to production.
  if (isOfflineDev) {
    const { offlineCalendarRequest } = await import('./offlineCalendarFlow');
    return offlineCalendarRequest(body, method);
  }
  try {
    const { data } = await supabase.auth.getSession();
    if (!data?.session?.access_token) throw new Error('unauthorized');
    const response = await fetch('/api/calendars', { method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${data.session.access_token}` }, body: JSON.stringify(body) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'calendar_sync_failed');
    return result;
  } catch (error) {
    // Only known server codes can reach UI; never stringify a failed request or URL.
    const code = /^(calendar_[a-z_]+|invalid_calendar_[a-z_]+|unsafe_calendar_host|too_many_requests|unauthorized|unsupported_calendar_encoding)$/.test(error.message) ? error.message : 'calendar_sync_failed';
    throw new Error(code);
  }
}
