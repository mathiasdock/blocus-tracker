// Explicit account-owned consent, retryable delivery, event-level server dedupe.
export const AUTO_SHARE_KEY = "bt_social_auto_share_v1";
export const TEXT_ONLY_POST_IMAGE = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==";
export const AUTO_SHARE_EVENTS = ["session_completed", "goal_completed", "level_up", "streak", "badge_unlocked"];
export const DEFAULT_AUTO_SHARE = { session_completed: false, goal_completed: false, level_up: false, streak: false, badge_unlocked: false, visibility: "friends" };
const inflight = new Map();
const memory = new Map();
function get(key, fallback) {
  try { return JSON.parse(window.localStorage.getItem(key)) ?? memory.get(key) ?? fallback; }
  catch { return memory.get(key) ?? fallback; }
}
function put(key, value) {
  memory.set(key, value);
  try { window.localStorage.setItem(key, JSON.stringify(value)); } catch {}
}
function normalize(value) {
  return { ...Object.fromEntries(AUTO_SHARE_EVENTS.map(k => [k, value?.[k] === true])), visibility: value?.visibility === "public" ? "public" : "friends" };
}
export function readAutoShare(userId) { return normalize(get(userId ? AUTO_SHARE_KEY + ":" + userId : AUTO_SHARE_KEY, {})); }
export async function loadAutoShare(db, userId) {
  const { data, error } = await db.from("auto_share_settings").select("preferences").eq("user_id", userId).maybeSingle();
  if (error) throw error;
  const prefs = normalize(data?.preferences);
  put(AUTO_SHARE_KEY + ":" + userId, prefs);
  return prefs;
}
export async function writeAutoShare(db, userId, patch) {
  const next = normalize({ ...await loadAutoShare(db, userId), ...patch });
  const { error } = await db.from("auto_share_settings").upsert({ user_id: userId, preferences: next, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
  if (error) throw error;
  put(AUTO_SHARE_KEY + ":" + userId, next);
  return next;
}
export function validActivity(kind, data) {
  if (!data || data.version !== 1 || data.type !== kind) return false;
  if (kind === "session_completed") return Number.isFinite(data.seconds) && data.seconds >= 60 && data.seconds <= 604800;
  if (kind === "level_up") return Number.isInteger(data.level) && data.level > 1 && data.level <= 10000;
  if (kind === "streak") return Number.isInteger(data.days) && data.days > 1 && data.days <= 100000;
  if (kind === "badge_unlocked") return typeof data.badgeId === "string" && data.badgeId.length > 0;
  if (kind === "goal_completed") return typeof data.title === "string" && data.title.trim().length > 0;
  return false;
}
const queueKey = id => "bt_auto_activity_queue:" + id;
function pending(id) { const value = get(queueKey(id), []); return Array.isArray(value) ? value.filter(row => row && typeof row === "object") : []; }
const matches = (a, b) => a.kind === b.kind && a.eventKey === b.eventKey;
function enqueue(id, event) {
  const rows = pending(id);
  if (!rows.some(row => matches(row, event))) put(queueKey(id), [...rows, event]);
}
function remove(id, event) { put(queueKey(id), pending(id).filter(row => !matches(row, event))); }

/** No daily cap: each real event may be shared once, including across devices. */
export async function autoSharePost(db, event) {
  const { userId, kind, activity, eventKey, caption } = event;
  if (!db || !userId || !eventKey || !validActivity(kind, activity)) return false;
  const key = userId + ":" + kind + ":" + eventKey;
  if (inflight.has(key)) return inflight.get(key);
  const run = (async () => {
    let prefs;
    try { prefs = await loadAutoShare(db, userId); }
    catch {
      const cached = readAutoShare(userId);
      if (cached[kind]) enqueue(userId, { ...event, visibility: event.visibility || cached.visibility });
      return false;
    }
    if (!prefs[kind]) { remove(userId, event); return false; }
    const queued = pending(userId).find(row => matches(row, event));
    // Retries may narrow visibility, never broaden the original audience.
    const originalVisibility = queued?.visibility || event.visibility || prefs.visibility;
    const visibility = originalVisibility === "public" && prefs.visibility === "public" ? "public" : "friends";
    enqueue(userId, { ...event, visibility });
    try {
      const { error } = await db.from("posts").insert({
        user_id: userId, image_url: TEXT_ONLY_POST_IMAGE, caption: caption || null,
        visibility, activity, auto_event_key: kind + ":" + eventKey,
      });
      if (error && error.code !== "23505") throw error;
      remove(userId, event);
      if (!error && typeof window !== "undefined" && typeof window.dispatchEvent === "function") window.dispatchEvent(new Event("bt:auto-post-published"));
      return true;
    } catch { return false; }
  })();
  inflight.set(key, run);
  try { return await run; } finally { inflight.delete(key); }
}
export async function flushAutoShare(db, userId) {
  for (const event of pending(userId)) await autoSharePost(db, { ...event, userId });
}
export async function shareSavedSession(db, row, course) {
  if (!row?.id || !Number.isFinite(row.duration_seconds) || row.duration_seconds < 60) return false;
  if (!course && row.course_id) {
    try {
      const result = await db.from("courses").select("name,color").eq("id", row.course_id).maybeSingle();
      course = result.data;
    } catch {}
  }
  return autoSharePost(db, {
    userId: row.user_id, kind: "session_completed", eventKey: row.id,
    activity: { version: 1, type: "session_completed", seconds: row.duration_seconds, courseName: course?.name || "", courseColor: course?.color || "" },
  });
}
