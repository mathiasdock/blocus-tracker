// Explicit account-owned consent, retryable delivery, event-level server dedupe.
//
// What may become a social event is decided in lib/activityFeed.mjs and applied
// HERE, at publishing time — never at display time, so an event already shared
// keeps rendering as what it was when it was shared.
import {
  GOAL_REPEAT_WINDOW_MS, goalAlreadyShared, isSharableSession, validActivity,
} from "./activityFeed.mjs";

export { validActivity };

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
    // A recurring objective is a real accomplishment every week, but socially
    // it is the same sentence: it is announced once per window. A failed
    // lookup publishes — silence must never be the fallback.
    if (kind === "goal_completed") {
      try {
        const since = new Date(Date.now() - GOAL_REPEAT_WINDOW_MS).toISOString();
        const { data } = await db.from("posts").select("created_at, activity")
          .eq("user_id", userId).gte("created_at", since).limit(60);
        if (goalAlreadyShared(data || [], activity.title)) { remove(userId, event); return false; }
      } catch {}
    }
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
/**
 * A finished session becomes a social event only above the signal threshold
 * (20 minutes, lib/activityFeed.mjs). A shorter one still counts everywhere it
 * should — Stats, streak, XP, history — it simply does not tell anyone.
 */
export async function shareSavedSession(db, row, course) {
  if (!row?.id || !isSharableSession(row.duration_seconds)) return false;
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
