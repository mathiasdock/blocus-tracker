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
 * Reads the canonical list. Returns `null` when neither source answered, so a
 * failed read never looks like a lost collection: callers keep what they had.
 */
export async function fetchCanonicalBadgeIds(supabase, userId, catalog) {
  if (!supabase || !userId) return null;
  const [syncRes, rowsRes] = await Promise.all([
    // `.then(r => r)` before `.catch`: the supabase-js query builder exposes
    // `then` but not `catch` (see pages/badges.js history).
    supabase.rpc("sync_my_badges").then((r) => r).catch(() => ({ data: null })),
    supabase.from("user_badges").select("badge_id").eq("user_id", userId)
      .then((r) => r).catch(() => ({ data: null })),
  ]);
  const synced = Array.isArray(syncRes?.data) ? syncRes.data : null;
  const stored = Array.isArray(rowsRes?.data) ? rowsRes.data.map((row) => row.badge_id) : null;
  if (!synced && !stored) return null;
  return canonicalBadgeIds({ synced: synced || [], stored: stored || [], catalog });
}
