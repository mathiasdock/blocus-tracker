import { CalendarError, calendarError, fetchCalendarFeed, validateFeedUrl } from "./calendarFeed.mjs";
import { parseCalendar } from "./calendarParser.mjs";
import { classifyAcademicEvent } from "../academicEventClassification.mjs";

export const SOURCE_COLUMNS = "id,provider,display_name,last_synced_at,last_attempted_at,sync_status,sync_error,created_at,updated_at";

export async function syncCalendar(admin, userId, sourceId, fetchFeed = fetchCalendarFeed) {
  const lease = await admin.rpc("begin_external_calendar_sync", { p_user_id: userId, p_source_id: sourceId });
  if (lease.error) {
    if (lease.error.code === "42501") throw new CalendarError("calendar_account_suspended", 403);
    if (lease.error.code === "P0002") throw new CalendarError("calendar_not_found", 404);
    if (lease.error.code === "P0001") throw new CalendarError("calendar_sync_cooldown", 429);
    throw new CalendarError("calendar_sync_failed", 502);
  }
  const { token, provider, feed_url: feedUrl, ...validators } = lease.data;
  const identity = { p_user_id: userId, p_source_id: sourceId, p_token: token };
  try {
    const response = await fetchFeed(feedUrl, validators);
    if (response.notModified && !validators.etag && !validators.last_modified) throw new CalendarError("calendar_fetch_failed", 502);
    const events = response.notModified ? null : parseCalendar(response.text, { provider, feedUrl })
      .map(event => ({ ...event, ...classifyAcademicEvent(event) }));
    const result = await admin.rpc("finish_external_calendar_sync", {
      ...identity, p_events: events, p_etag: response.etag || null, p_last_modified: response.last_modified || null,
    });
    if (result.error?.message === "calendar_event_limit") throw new CalendarError("calendar_event_limit", 422);
    if (result.error) throw new CalendarError("calendar_sync_failed", 502);
    return { event_count: result.data, not_modified: !!response.notModified };
  } catch (error) {
    const safe = calendarError(error);
    // The lease token prevents a late failure overwriting a newer sync. A DB
    // outage can leave 'syncing'; the persistent five-minute lease expires.
    await admin.rpc("finish_external_calendar_sync", { ...identity, p_events: null, p_error: safe.code }).catch(() => {});
    throw safe;
  }
}

export function createCalendarHandler({ authenticate, setHeaders, rateLimit, getIp, fetchFeed }) {
  return async (req, res) => {
    setHeaders(res);
    if (!["GET", "POST", "DELETE"].includes(req.method)) return res.status(405).json({ error: "method_not_allowed" });
    if (!rateLimit(`calendar:${getIp(req)}`, 30, 60_000).ok) return res.status(429).json({ error: "too_many_requests" });
    try {
      const { admin, userClient, userId } = await authenticate(req);
      if (req.method === "GET") {
        const result = await userClient.from("external_calendar_sources").select(SOURCE_COLUMNS).eq("user_id", userId).order("created_at");
        if (result.error) throw new CalendarError("calendar_read_failed", 502);
        return res.status(200).json({ sources: result.data });
      }
      if (!String(req.headers["content-type"] || "").toLowerCase().includes("application/json")) throw new CalendarError("unsupported_media_type", 415);
      const body = req.body || {};
      if (req.method === "POST" && body.action === "connect") {
        const { provider, display_name: name } = body;
        if (!["canvas", "moodle", "brightspace", "ical"].includes(provider) || typeof name !== "string" || !name.trim() || name.length > 120) throw new CalendarError("invalid_calendar_source");
        const url = validateFeedUrl(body.feed_url);
        const result = await admin.rpc("connect_external_calendar", { p_user_id: userId, p_provider: provider, p_display_name: name.trim(), p_feed_url: url.href });
        if (result.error?.code === "42501") throw new CalendarError("calendar_account_suspended", 403);
        if (result.error) throw new CalendarError(result.error.code === "P0001" ? "calendar_source_limit" : "calendar_connect_failed", result.error.code === "P0001" ? 409 : 502);
        return res.status(201).json({ id: result.data });
      }
      if (typeof body.source_id !== "string" || !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(body.source_id)) throw new CalendarError("invalid_calendar_source");
      if (req.method === "DELETE") {
        const result = await userClient.from("external_calendar_sources").delete().eq("id", body.source_id).eq("user_id", userId).select("id");
        if (result.error) throw new CalendarError("calendar_disconnect_failed", 502);
        if (!result.data?.length) throw new CalendarError("calendar_not_found", 404);
        return res.status(200).json({ disconnected: true });
      }
      if (body.action !== "sync") throw new CalendarError("invalid_calendar_action");
      const result = await syncCalendar(admin, userId, body.source_id, fetchFeed);
      return res.status(200).json(result);
    } catch (error) {
      const safe = calendarError(error);
      // Never log request bodies, raw exceptions, or upstream URLs.
      return res.status(safe.status).json({ error: safe.code });
    }
  };
}
