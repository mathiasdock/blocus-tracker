import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_FOCUS_PREFERENCES, normalizeFocusPreferences, loadFocusPreferences, equipFocusEnvironment, syncFocusUnlock } from "../lib/focusPreferences.mjs";

test("focus preferences accept server rows and keep a saved permanent unlock", () => {
  assert.deepEqual(normalizeFocusPreferences([{ equipped_id: "gradient-wave", highest_level: 5 }]), { environmentId: "gradient-wave", highestLevel: 5 });
  assert.deepEqual(normalizeFocusPreferences({ equipped_id: "forest", highest_level: 12 }), { environmentId: "forest", highestLevel: 12 });
  assert.deepEqual(normalizeFocusPreferences({ equipped_id: "gradient-wave", highest_level: 4 }), { environmentId: "forest", highestLevel: 4 });
  assert.deepEqual(normalizeFocusPreferences({ equipped_id: "reserved-20", highest_level: 30 }), { environmentId: "forest", highestLevel: 30 });
  for (const highest_level of [null, 0, -1, 31, 1.5, "bad"]) assert.deepEqual(normalizeFocusPreferences({ equipped_id: "gradient-wave", highest_level }), DEFAULT_FOCUS_PREFERENCES);
});

test("client reads one own-only RPC and binds equip to the initiating owner", async () => {
  const calls = [];
  const client = { rpc: async (...args) => {
    calls.push(args);
    return { data: [{ equipped_id: args[1]?.p_environment_id || "forest", highest_level: 5 }], error: null };
  } };
  assert.equal((await loadFocusPreferences(client)).environmentId, "forest");
  assert.equal((await equipFocusEnvironment(client, "gradient-wave", "a")).environmentId, "gradient-wave");
  assert.deepEqual(calls, [["get_my_focus_environment"], ["equip_focus_environment", { p_environment_id: "gradient-wave", p_expected_user_id: "a" }]]);
});

test("equip requires an explicit owner before invoking the mutation", async () => {
  const client = { rpc: () => { throw Error("must not call"); } };
  assert.equal((await equipFocusEnvironment(client, "forest")).error, "focus_auth_required");
});

test("a session change after the pre-check cannot mutate the next account", async () => {
  let owner = "a";
  const saved = { a: "forest", b: "forest" };
  const client = { auth: { getSession: async () => ({ data: { session: { user: { id: owner } } }, error: null }) },
    rpc: async (_name, params) => {
      owner = "b";
      if (params.p_expected_user_id !== owner) return { error: { code: "42501", hint: "focus_auth_required" } };
      saved[owner] = params.p_environment_id;
      return { data: [{ equipped_id: saved[owner], highest_level: 5 }], error: null };
    } };
  assert.equal((await equipFocusEnvironment(client, "gradient-wave", "a")).error, "focus_auth_required");
  assert.deepEqual(saved, { a: "forest", b: "forest" });
  assert.equal((await equipFocusEnvironment(client, "gradient-wave", "b")).ok, true);
  assert.deepEqual(saved, { a: "forest", b: "gradient-wave" });
});

test("future and malformed IDs never invoke the equip RPC", async () => {
  const client = { rpc: () => { throw Error("must not call"); } };
  for (const id of ["reserved-12", "reserved-20", "forest ", "__proto__", "unknown", null]) {
    const result = await equipFocusEnvironment(client, id);
    assert.equal(result.ok, false); assert.equal(result.error, "focus_invalid");
  }
});

test("missing optional migration safely uses Forest and no local eligibility", async () => {
  for (const code of ["PGRST202", "PGRST205", "42883", "42P01"]) {
    const result = await loadFocusPreferences({ rpc: async () => ({ error: { code, message: "private diagnostic" } }) });
    assert.deepEqual(result, { ok: false, ...DEFAULT_FOCUS_PREFERENCES, error: "focus_unavailable" });
  }
  for (const data of [null, [], {}, { equipped_id: "forest", highest_level: 99 }]) {
    assert.equal((await loadFocusPreferences({ rpc: async () => ({ data, error: null }) })).error, "focus_unavailable");
  }
});

test("server errors and network exceptions become fixed client codes", async () => {
  for (const [hint, expected] of [["focus_locked", "focus_locked"], ["focus_invalid", "focus_invalid"], ["suspended", "focus_suspended"], ["focus_auth_required", "focus_auth_required"]]) {
    const result = await equipFocusEnvironment({ rpc: async () => ({ error: { code: "42501", hint, message: "private diagnostic" } }) }, "gradient-wave", "a");
    assert.equal(result.error, expected);
    assert.ok(!JSON.stringify(result).includes("private"));
  }
  const client = { rpc: () => { throw Error("private network details"); } };
  assert.equal((await loadFocusPreferences(client)).error, "focus_load_failed");
  assert.equal((await equipFocusEnvironment(client, "forest", "a")).error, "focus_save_failed");
});

test("unlock sync uses canonical RPC data, deduplicates levels and retries failures", async () => {
  const calls = []; let failing = true;
  const client = { auth: { getSession: async () => ({ data: { session: { user: { id: "a" } } }, error: null }) },
    rpc: async (...args) => { calls.push(args); return failing ? { error: { code: "PGRST202" } } : { data: [{ equipped_id: "forest", highest_level: 5 }], error: null }; } };
  assert.equal(await syncFocusUnlock(client, "a", 4), false); assert.equal(calls.length, 0);
  assert.equal(await syncFocusUnlock(client, "a", 5), false);
  failing = false;
  const [first, second] = await Promise.all([syncFocusUnlock(client, "a", 5), syncFocusUnlock(client, "a", 5)]);
  assert.equal(first, true); assert.equal(second, true); assert.equal(calls.length, 2);
  assert.equal(await syncFocusUnlock(client, "a", 5), true); assert.equal(calls.length, 2);
  assert.deepEqual(calls[0], ["get_my_focus_environment"]);
  assert.equal((await loadFocusPreferences(client, "a")).environmentId, "forest", "sync never auto-equips");
  assert.equal(calls.length, 2);
});

test("unlock sync rejects stale account callbacks and never grants the supplied level", async () => {
  let calls = 0;
  const client = { auth: { getSession: async () => ({ data: { session: { user: { id: "b" } } }, error: null }) },
    rpc: async () => { calls += 1; return { data: [{ equipped_id: "forest", highest_level: 1 }], error: null }; } };
  assert.equal(await syncFocusUnlock(client, "a", 5), false); assert.equal(calls, 0);
  assert.equal(await syncFocusUnlock(client, "b", 5), false); assert.equal(calls, 1);
  assert.equal((await loadFocusPreferences(client, "b")).highestLevel, 1);
});

test("a session change during a request cannot seed another account's cache", async () => {
  let owner = "a"; let calls = 0;
  const client = { auth: { getSession: async () => ({ data: { session: { user: { id: owner } } }, error: null }) },
    rpc: async () => { calls += 1; if (calls === 1) { owner = "b"; return { data: [{ equipped_id: "gradient-wave", highest_level: 20 }], error: null }; }
      return { data: [{ equipped_id: "forest", highest_level: 1 }], error: null }; } };
  assert.equal((await loadFocusPreferences(client, "a")).error, "focus_auth_required");
  owner = "a";
  const result = await loadFocusPreferences(client, "a");
  assert.equal(result.environmentId, "forest"); assert.equal(result.highestLevel, 1); assert.equal(calls, 2);
});
