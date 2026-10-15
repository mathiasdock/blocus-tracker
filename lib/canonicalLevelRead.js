// Shared transport only: the legacy calculator keeps its existing fallback.
// Never let a failed/degraded fallback enter the canonical-only cache.
const TTL = 3 * 60 * 1000;
let clients = new WeakMap();
const validTotal = value => ["number", "string"].includes(typeof value) && String(value).trim() !== ""
  && Number.isInteger(Number(value)) && Number(value) >= 0;

export function clearCanonicalLevelCache() { clients = new WeakMap(); }

export async function readCanonicalLevelRows(client, ids, { selfUserId, force = false } = {}) {
  let entries = clients.get(client);
  if (!entries) { entries = new Map(); clients.set(client, entries); }
  const key = JSON.stringify([[...ids].sort(), selfUserId || null]);
  const previous = entries.get(key);
  if (!force && previous?.data && Date.now() - previous.ts < TTL) return previous.data;
  if (!force && previous?.pending) return previous.pending;
  const entry = {};
  entries.set(key, entry);
  const pending = (async () => {
    const response = await client.rpc("get_gamification_levels", { p_user_ids: ids });
    if (response?.error || !Array.isArray(response?.data)
      || !response.data.every(row => row && typeof row.user_id === "string" && validTotal(row.total_xp))
      || !ids.every(id => response.data.some(row => row.user_id === id))) {
      throw new Error("Canonical progression unavailable");
    }
    if (entries.get(key) === entry) { entry.data = response.data; entry.ts = Date.now(); }
    return response.data;
  })();
  entry.pending = pending;
  try { return await pending; }
  finally {
    if (entries.get(key) === entry) {
      delete entry.pending;
      if (!entry.data) entries.delete(key);
    }
  }
}
