// Complete session reads for historical statistics. PostgREST caps a response
// at 1,000 rows; asking for all rows once silently truncates long-lived accounts.
// Keep a total order, including identical start timestamps, across page boundaries.
export async function fetchStudySessions(client, userIds, {
  columns = "course_id, duration_seconds, started_at",
  fromISO = null,
} = {}) {
  const pageSize = 500;
  const rows = [];
  for (let offset = 0; ; offset += pageSize) {
    let query = client.from("sessions").select(columns);
    query = Array.isArray(userIds) ? query.in("user_id", userIds) : query.eq("user_id", userIds);
    if (fromISO) query = query.gte("started_at", fromISO);
    const { data, error } = await query
      .order("started_at", { ascending: true })
      .order("id", { ascending: true })
      .range(offset, offset + pageSize - 1);
    // Never publish a partial history as a successful result.
    if (error) return { data: null, error };
    rows.push(...(data || []));
    if (!data || data.length < pageSize) return { data: rows, error: null };
  }
}
