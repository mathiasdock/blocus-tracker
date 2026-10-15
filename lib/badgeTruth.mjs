// Badge truth — one source, every screen.
//
// A badge is earned when the SERVER says so: `award_badges_for_user` applies
// the rules (in the student's own time zone, with streak freezes and neutral
// days outside a blocus) and writes `user_badges`. Profile used to recompute
// the same rules in JavaScript and add the result to the server's list — with
// UTC days, without blocus periods — so the profile announced "13 sur 22"
// while the Badges page, reading the server only, said "10/22". DESIGN.md:
// one identity, one earning rule.
//
// Every screen that shows "which badges do I have" goes through here: the
// union of what `sync_my_badges` just returned and what `user_badges` already
// stores, restricted to the badges the app actually knows, in catalogue order.
// Nothing on the client may ADD a badge to that list.

/**
 * @param {object}   input
 * @param {string[]} input.synced   ids returned by the `sync_my_badges` RPC
 * @param {string[]} input.stored   ids read from `user_badges`
 * @param {string[]} input.catalog  ids of lib/badges.js, in display order
 */
export function canonicalBadgeIds({ synced = [], stored = [], catalog = [] } = {}) {
  const owned = new Set([...(Array.isArray(synced) ? synced : []), ...(Array.isArray(stored) ? stored : [])]);
  // A retired or unknown id stays in the database but never counts: otherwise
  // "11 sur 10" becomes possible, and two screens with different catalogues
  // would disagree again.
  return catalog.filter((id) => owned.has(id));
}

/**
 * Reads the canonical list, with when each stored badge was earned (a badge
 * earned before a rule was tightened shows the rule of its time —
 * lib/badgeRules.mjs). Both sources must answer successfully. The sync RPC
 * returns ALL persisted ids (v84), but no dates; a table snapshot taken in
 * parallel can precede a new award. Only in that case, read the dates again.
 * Returns null for an incomplete read; callers retain their reliable snapshot.
 */
export async function fetchCanonicalBadges(supabase, userId, catalog) {
  if (!supabase || !userId) return null;
  const [syncRes, rowsRes] = await Promise.all([
    // `.then(r => r)` before `.catch`: the supabase-js query builder exposes
    // `then` but not `catch` (see pages/badges.js history).
    supabase.rpc("sync_my_badges").then((r) => r).catch(() => ({ data: null })),
    supabase.from("user_badges").select("badge_id, earned_at").eq("user_id", userId)
      .then((r) => r).catch(() => ({ data: null })),
  ]);
  const synced = !syncRes?.error && Array.isArray(syncRes?.data) && syncRes.data.every(id => typeof id === "string") ? syncRes.data : null;
  let rows = !rowsRes?.error && Array.isArray(rowsRes?.data) ? rowsRes.data : null;
  if (!synced || !rows) return null;
  const missing = () => synced.some(id => catalog.includes(id) && !rows.some(row => row?.badge_id === id));
  if (missing()) {
    const refreshed = await supabase.from("user_badges").select("badge_id, earned_at").eq("user_id", userId)
      .then(r => r).catch(() => ({ data: null }));
    if (refreshed?.error || !Array.isArray(refreshed?.data)) return null;
    rows = refreshed.data;
  }
  if (missing() || rows.some(row => !row || typeof row.badge_id !== "string"
    || (catalog.includes(row.badge_id) && !Number.isFinite(Date.parse(row.earned_at))))) return null;
  const ids = canonicalBadgeIds({ synced, stored: rows.map((row) => row.badge_id), catalog });
  const earnedAt = {};
  (rows || []).forEach((row) => { if (row.earned_at) earnedAt[row.badge_id] = row.earned_at; });
  return { ids, earnedAt };
}

/** The canonical list of ids only (Profile, level fallback). */
export async function fetchCanonicalBadgeIds(supabase, userId, catalog) {
  const result = await fetchCanonicalBadges(supabase, userId, catalog);
  return result ? result.ids : null;
}
