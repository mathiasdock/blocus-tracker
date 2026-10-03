// Decisions outlive normalized feed rows. Page through compact identities so
// PostgREST's response limit never makes an old hidden UID visible again.
export async function loadHiddenCalendarItems(db, sourceIds) {
  const data = [];
  const size = 500;
  for (let offset = 0; ; offset += size) {
    const page = await db.from('external_calendar_hidden_items').select('source_id,external_uid')
      .in('source_id', sourceIds).order('source_id').order('external_uid').range(offset, offset + size - 1);
    if (page.error) return { data: null, error: page.error };
    data.push(...(page.data || []));
    if ((page.data || []).length < size) return { data, error: null };
  }
}

// Adopt this user's old device choice once. An existing account choice always
// wins, including when two devices perform the first migration concurrently.
export async function loadCalendarVisibility(db, userId, readLegacy) {
  const read = () => db.from('external_calendar_preferences').select('exams,major,normal').eq('user_id', userId).maybeSingle();
  const existing = await read();
  if (existing.error || existing.data) return existing;
  let legacy;
  try { legacy = JSON.parse(readLegacy?.()); } catch { return existing; }
  const keys = ['exams', 'major', 'normal'];
  if (!legacy || !keys.some(key => typeof legacy[key] === 'boolean')) return existing;
  const preferences = Object.fromEntries(keys.map(key => [key, typeof legacy[key] === 'boolean' ? legacy[key] : true]));
  const saved = await db.from('external_calendar_preferences').upsert({ user_id: userId, ...preferences }, { onConflict: 'user_id', ignoreDuplicates: true });
  return saved.error ? { data: null, error: saved.error } : read();
}
