// Only these implemented renderer IDs can be persisted. Future catalogue entries
// and browser storage cannot grant eligibility; both RPCs validate in the DB.
const REQUIRED_LEVEL = Object.freeze({ forest: 1, "gradient-wave": 5, zenitho: 12, "glass-fold": 20 });
export const DEFAULT_FOCUS_PREFERENCES = Object.freeze({ environmentId: "forest", highestLevel: 1 });
const READ_TTL_MS = 10_000;
const accountReads = new WeakMap();
const unlockSyncs = new WeakMap();

function accountsFor(store, client) {
  if (!store.has(client)) store.set(client, new Map());
  return store.get(client);
}

function remember(client, userId, result) {
  if (!userId || !result.ok) return;
  const accounts = accountsFor(accountReads, client);
  accounts.set(userId, { result, at: Date.now() });
  // Only server answers live here, for bounded request deduplication. Nothing
  // survives reload, and no browser claim is used to grant an unlock.
  if (accounts.size > 32) accounts.delete(accounts.keys().next().value);
}

export function normalizeFocusPreferences(data) {
  const row = Array.isArray(data) ? data[0] : data;
  const level = Number(row?.highest_level);
  if (!Number.isInteger(level) || level < 1 || level > 30) return { ...DEFAULT_FOCUS_PREFERENCES };
  const id = row?.equipped_id;
  return {
    environmentId: Object.hasOwn(REQUIRED_LEVEL, id) && level >= REQUIRED_LEVEL[id] ? id : "forest",
    highestLevel: level,
  };
}

function errorCode(error, operation) {
  if (["PGRST202", "PGRST205", "42883", "42P01"].includes(error?.code)) return "focus_unavailable";
  if (error?.hint === "focus_unavailable") return "focus_unavailable";
  if (error?.hint === "suspended") return "focus_suspended";
  if (error?.hint === "focus_locked") return "focus_locked";
  if (error?.hint === "focus_auth_required" || error?.status === 401) return "focus_auth_required";
  if (error?.hint === "focus_invalid" || error?.code === "22023") return "focus_invalid";
  return operation === "equip" ? "focus_save_failed" : "focus_load_failed";
}

async function request(client, operation, id, expectedUserId) {
  if (operation === "equip" && !Object.hasOwn(REQUIRED_LEVEL, id)) {
    return { ok: false, ...DEFAULT_FOCUS_PREFERENCES, error: "focus_invalid" };
  }
  try {
    const { data, error } = operation === "equip"
      ? await client.rpc("equip_focus_environment", { p_environment_id: id, p_expected_user_id: expectedUserId })
      : await client.rpc("get_my_focus_environment");
    if (error) return { ok: false, ...DEFAULT_FOCUS_PREFERENCES, error: errorCode(error, operation) };
    const row = Array.isArray(data) ? data[0] : data;
    if (!row || !Number.isInteger(Number(row.highest_level)) || Number(row.highest_level) < 1 || Number(row.highest_level) > 30) {
      return { ok: false, ...DEFAULT_FOCUS_PREFERENCES, error: "focus_unavailable" };
    }
    return { ok: true, ...normalizeFocusPreferences(row), error: null };
  } catch (error) {
    return { ok: false, ...DEFAULT_FOCUS_PREFERENCES, error: errorCode(error, operation) };
  }
}

export function loadFocusPreferences(client, userId = null, { force = false } = {}) {
  if (!userId) return request(client, "load");
  const accounts = accountsFor(accountReads, client);
  const previous = accounts.get(userId);
  if (!force && previous?.result && Date.now() - previous.at < READ_TTL_MS) return Promise.resolve(previous.result);
  if (previous?.pending) return previous.pending;
  const entry = {};
  const pending = (async () => {
    if (client.auth?.getSession && !await sessionStillOwns(client, userId)) return { ok: false, ...DEFAULT_FOCUS_PREFERENCES, error: "focus_auth_required" };
    const result = await request(client, "load");
    if (client.auth?.getSession && !await sessionStillOwns(client, userId)) return { ok: false, ...DEFAULT_FOCUS_PREFERENCES, error: "focus_auth_required" };
    return result;
  })().then(result => {
    if (accounts.get(userId) === entry) {
      if (result.ok) remember(client, userId, result);
      else accounts.delete(userId);
    }
    return result;
  });
  entry.pending = pending;
  accounts.set(userId, entry);
  return pending;
}

export async function equipFocusEnvironment(client, id, userId = null) {
  if (!Object.hasOwn(REQUIRED_LEVEL, id)) return { ok: false, ...DEFAULT_FOCUS_PREFERENCES, error: "focus_invalid" };
  if (!userId || client.auth?.getSession && !await sessionStillOwns(client, userId)) return { ok: false, ...DEFAULT_FOCUS_PREFERENCES, error: "focus_auth_required" };
  // The RPC also checks this owner against auth.uid(): the shared client's
  // bearer token can change after this pre-check and before the fetch starts.
  const result = await request(client, "equip", id, userId);
  if (userId && client.auth?.getSession && !await sessionStillOwns(client, userId)) return { ok: false, ...DEFAULT_FOCUS_PREFERENCES, error: "focus_auth_required" };
  if (result.ok) remember(client, userId, result);
  return result;
}

async function sessionStillOwns(client, userId) {
  if (!client.auth?.getSession) return true;
  try {
    const { data, error } = await client.auth.getSession();
    return !error && data?.session?.user?.id === userId;
  } catch { return false; }
}

// Call from the existing canonical level watcher, including its initial
// baseline. Eligibility is still recalculated by the RPC; currentLevel only
// decides whether a sync might be needed. Failed writes remain retryable.
export function syncFocusUnlock(client, userId, currentLevel) {
  if (!userId || !Number.isInteger(currentLevel) || currentLevel < 5 || currentLevel > 30) return Promise.resolve(false);
  const syncs = accountsFor(unlockSyncs, client);
  const snapshot = accountsFor(accountReads, client).get(userId)?.result;
  const prior = syncs.get(userId);
  if (Math.max(snapshot?.highestLevel || 0, prior?.level || 0) >= currentLevel) return Promise.resolve(true);
  if (prior?.pending) return prior.pending;
  const entry = { level: prior?.level || 0 };
  const pending = (async () => {
    if (!await sessionStillOwns(client, userId)) return false;
    const result = await loadFocusPreferences(client, userId, { force: true });
    if (!result.ok || !await sessionStillOwns(client, userId)) return false;
    entry.level = result.highestLevel;
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("bt:focus-environment-changed", { detail: { userId } }));
    }
    return result.highestLevel >= currentLevel;
  })().finally(() => { entry.pending = null; });
  entry.pending = pending;
  syncs.set(userId, entry);
  if (syncs.size > 32) syncs.delete(syncs.keys().next().value);
  return pending;
}
