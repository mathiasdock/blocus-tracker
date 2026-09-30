import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { GoTrueClient } from "@supabase/auth-js";
import { createAuthStorage, WRITE_RETRY_MS } from "../lib/authStorage.mjs";

// localStorage that works normally.
function memoryStore(initial = {}) {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (key) => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => { data.set(key, String(value)); },
    removeItem: (key) => { data.delete(key); },
  };
}

// What the iPhone did on 2026-09-29: writes are accepted without error, but
// reads keep returning the old value.
function frozenStore(initial = {}) {
  const store = memoryStore(initial);
  let writes = 0;
  return {
    ...store,
    get writes() { return writes; },
    setItem: () => { writes += 1; },
    removeItem: () => { writes += 1; },
  };
}

test("session : localStorage qui fonctionne, rien ne change", () => {
  const backing = memoryStore({ k: "old" });
  const storage = createAuthStorage({ getBackingStore: () => backing });
  assert.equal(storage.getItem("k"), "old");
  storage.setItem("k", "new");
  assert.equal(backing.getItem("k"), "new");
  assert.equal(storage.getItem("k"), "new");
  storage.removeItem("k");
  assert.equal(backing.getItem("k"), null);
  assert.equal(storage.getItem("k"), null);
  assert.equal(storage.getItem("absent"), null);
});

test("session : une écriture perdue par le stockage est relue quand même", () => {
  let clock = 1_000;
  const backing = frozenStore({ k: "old" });
  const storage = createAuthStorage({ getBackingStore: () => backing, now: () => clock });
  storage.setItem("k", "new");
  assert.equal(backing.getItem("k"), "old", "le stockage a bien perdu l'écriture");
  assert.equal(storage.getItem("k"), "new");
  storage.setItem("k", "newer");
  assert.equal(storage.getItem("k"), "newer");
  // Une déconnexion aussi reste faite, même si le stockage l'ignore.
  storage.removeItem("k");
  assert.equal(storage.getItem("k"), null);
});

test("session : l'écriture perdue est retentée, au plus toutes les 5 s", () => {
  let clock = 1_000;
  const backing = frozenStore({ k: "old" });
  const storage = createAuthStorage({ getBackingStore: () => backing, now: () => clock });
  storage.setItem("k", "new");
  assert.equal(backing.writes, 1);
  for (let i = 0; i < 50; i += 1) storage.getItem("k");
  assert.equal(backing.writes, 1, "pas de nouvelle écriture avant le délai");
  clock += WRITE_RETRY_MS;
  storage.getItem("k");
  storage.getItem("k");
  assert.equal(backing.writes, 2, "une seule nouvelle tentative");
});

test("session : la valeur écrite par un autre onglet fait foi", () => {
  const backing = memoryStore({ k: "old" });
  const storage = createAuthStorage({ getBackingStore: () => backing });
  storage.setItem("k", "mine");
  backing.setItem("k", "other-tab");
  assert.equal(storage.getItem("k"), "other-tab");
  // Déconnexion faite dans un autre onglet.
  storage.setItem("k", "mine-again");
  backing.removeItem("k");
  assert.equal(storage.getItem("k"), null);
});

test("session : l'événement « storage » d'un autre onglet est toujours suivi", () => {
  const backing = frozenStore({ k: "old" });
  const storage = createAuthStorage({ getBackingStore: () => backing });
  storage.setItem("k", "mine");
  assert.equal(storage.getItem("k"), "mine");
  storage.forget("k");
  assert.equal(storage.getItem("k"), "old");
  storage.setItem("k", "mine");
  storage.forget(null);
  assert.equal(storage.getItem("k"), "old");
});

test("session : stockage bloqué ou plein, la session reste utilisable dans la page", () => {
  const blocked = createAuthStorage({ getBackingStore: () => { throw new Error("SecurityError"); } });
  assert.equal(blocked.getItem("k"), null);
  blocked.setItem("k", "v");
  assert.equal(blocked.getItem("k"), "v");

  const full = memoryStore({ k: "old" });
  full.setItem = () => { throw new Error("QuotaExceededError"); };
  const storage = createAuthStorage({ getBackingStore: () => full });
  assert.doesNotThrow(() => storage.setItem("k", "new"));
  assert.equal(storage.getItem("k"), "new");
});

// --- Avec le vrai client Auth de supabase-js ---------------------------------

const STORAGE_KEY = "sb-test-auth-token";

function jwt(payload) {
  const part = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${part({ alg: "HS256", typ: "JWT" })}.${part(payload)}.signature`;
}

function sessionFor(refreshToken, { expired = false } = {}) {
  const now = Math.floor(Date.now() / 1000);
  const iat = expired ? now - 7200 : now;
  const user = { id: "u1", aud: "authenticated", role: "authenticated", email: "u1@example.test" };
  return {
    access_token: jwt({ sub: "u1", role: "authenticated", iat, exp: iat + 3600, session_id: "s1" }),
    token_type: "bearer",
    expires_in: 3600,
    expires_at: iat + 3600,
    refresh_token: refreshToken,
    user,
  };
}

// GoTrue réduit à /token et /logout : compte les renouvellements.
function authServer() {
  const calls = { refresh: 0, logout: 0 };
  let next = 1;
  const fetch = async (url, init = {}) => {
    const path = new URL(url).pathname;
    if (path.endsWith("/token")) {
      calls.refresh += 1;
      JSON.parse(init.body);
      next += 1;
      return new Response(JSON.stringify(sessionFor(`rt-${next}`)), {
        status: 200, headers: { "Content-Type": "application/json" },
      });
    }
    if (path.endsWith("/logout")) {
      calls.logout += 1;
      return new Response(null, { status: 204 });
    }
    return new Response(JSON.stringify({ message: "not found" }), { status: 404 });
  };
  return { calls, fetch };
}

function authClient(storage, fetch) {
  return new GoTrueClient({
    url: "http://auth.test/auth/v1",
    headers: { apikey: "anon" },
    storageKey: STORAGE_KEY,
    storage,
    persistSession: true,
    autoRefreshToken: false,
    detectSessionInUrl: false,
    fetch,
  });
}

test("supabase-js : un stockage qui perd ses écritures renouvelle le jeton à chaque lecture", async () => {
  // Reproduit la cause de la rafale du 2026-09-29, sans la correction.
  const backing = frozenStore({ [STORAGE_KEY]: JSON.stringify(sessionFor("rt-1", { expired: true })) });
  const server = authServer();
  const client = authClient(backing, server.fetch);
  for (let i = 0; i < 5; i += 1) {
    const { data } = await client.getSession();
    assert.ok(data.session?.access_token);
  }
  assert.equal(server.calls.refresh, 5);
});

test("supabase-js : avec createAuthStorage, un seul renouvellement puis la session tient", async () => {
  const backing = frozenStore({ [STORAGE_KEY]: JSON.stringify(sessionFor("rt-1", { expired: true })) });
  const server = authServer();
  const client = authClient(createAuthStorage({ getBackingStore: () => backing }), server.fetch);
  const tokens = new Set();
  for (let i = 0; i < 5; i += 1) {
    const { data } = await client.getSession();
    tokens.add(data.session.access_token);
  }
  assert.equal(server.calls.refresh, 1);
  assert.equal(tokens.size, 1);

  // La déconnexion tient aussi, alors que le stockage l'ignore.
  await client.signOut({ scope: "local" });
  const { data } = await client.getSession();
  assert.equal(data.session, null);
  assert.equal(server.calls.refresh, 1);
});

test("supabase-js : stockage normal, un seul renouvellement avec ou sans createAuthStorage", async () => {
  for (const wrap of [false, true]) {
    const backing = memoryStore({ [STORAGE_KEY]: JSON.stringify(sessionFor("rt-1", { expired: true })) });
    const server = authServer();
    const storage = wrap ? createAuthStorage({ getBackingStore: () => backing }) : backing;
    const client = authClient(storage, server.fetch);
    for (let i = 0; i < 5; i += 1) await client.getSession();
    assert.equal(server.calls.refresh, 1);
    assert.equal(JSON.parse(backing.getItem(STORAGE_KEY)).refresh_token, "rt-2");
  }
});

test("câblage : le client Supabase du navigateur utilise createAuthStorage", () => {
  const source = readFileSync(new URL("../lib/supabaseClient.js", import.meta.url), "utf8");
  assert.match(source, /createAuthStorage\(\{ getBackingStore: \(\) => window\.localStorage \}\)/);
  assert.match(source, /window\.addEventListener\("storage", \(event\) => authStorage\.forget\(event\.key\)\)/);
  assert.match(source, /storage: authStorage,/);
});
