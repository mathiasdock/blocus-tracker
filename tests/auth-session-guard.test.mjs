import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { createAuthStorage } from "../lib/authStorage.mjs";
import {
  BACKOFF_STORAGE_KEY,
  RENEWAL_PENDING_CODE,
  authStorageKeyFor,
  backoffDelayMs,
  createAuthSessionGuard,
} from "../lib/authSessionGuard.mjs";
import { createFakeSupabase, readJwt } from "./fixtures/fakeSupabase.mjs";

const SUPABASE_URL = "http://127.0.0.1:54321";
const ANON = "anon-key";
const KEY = authStorageKeyFor(SUPABASE_URL);
const T0 = Date.parse("2026-09-30T08:00:00Z");
const HOUR = 3600_000;

function memoryStore(initial = {}) {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (key) => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => { data.set(key, String(value)); },
    removeItem: (key) => { data.delete(key); },
  };
}

// Horloge simulée : Date, setTimeout et setInterval avancent à la demande
// (les relances d'auth-js attendent jusqu'à ~25 s).
function useClock(t) {
  t.mock.timers.enable({ apis: ["setTimeout", "setInterval", "Date"], now: T0 });
}

async function flush(times = 12) {
  for (let i = 0; i < times; i += 1) await new Promise((resolve) => setImmediate(resolve));
}

async function advance(t, ms, step = 100) {
  for (let done = 0; done < ms; done += step) {
    t.mock.timers.tick(Math.min(step, ms - done));
    await flush(3);
  }
}

// Laisse tourner le temps simulé jusqu'à ce que la promesse aboutisse.
async function settle(t, promise, { maxMs = 120_000, step = 100 } = {}) {
  const started = Date.now();
  let state = null;
  promise.then((value) => { state = { value }; }, (error) => { state = { error }; });
  await flush();
  while (!state && Date.now() - started < maxMs) {
    t.mock.timers.tick(step);
    await flush(3);
  }
  if (!state) throw new Error(`still pending after ${maxMs} ms of simulated time`);
  if (state.error) throw state.error;
  return { value: state.value, tookMs: Date.now() - started };
}

// Un onglet : le client Supabase de l'app, avec ou sans la garde.
// Verrou partagé entre « onglets », comme navigator.locks : un seul détenteur
// par nom, les autres attendent (ou abandonnent via `signal`).
function fakeLockManager() {
  const queues = new Map();
  let held = 0;
  let maxHeld = 0;
  return {
    get maxHeld() { return maxHeld; },
    request(name, options, callback) {
      const previous = queues.get(name) || Promise.resolve();
      let release;
      const mine = new Promise((resolve) => { release = resolve; });
      queues.set(name, previous.then(() => mine));
      return new Promise((resolve, reject) => {
        let aborted = false;
        options?.signal?.addEventListener("abort", () => {
          aborted = true;
          reject(Object.assign(new Error("aborted"), { name: "AbortError" }));
        });
        previous.then(async () => {
          if (aborted) { release(); return; }
          held += 1;
          maxHeld = Math.max(maxHeld, held);
          try { resolve(await callback({ name })); } catch (error) { reject(error); } finally { held -= 1; release(); }
        });
      });
    },
  };
}

// Tirage fixé au maximum (5 s, 10 s, 20 s…) pour des tests reproductibles.
function makeTab(server, backing, { guarded = true, wrapSignOut = true, random = () => 1, locks = null } = {}) {
  const authStorage = createAuthStorage({ getBackingStore: () => backing });
  const guard = guarded
    ? createAuthSessionGuard({
        supabaseUrl: SUPABASE_URL,
        anonKey: ANON,
        sessionStore: authStorage,
        baseFetch: server.fetch,
        sharedStore: () => backing,
        wallNow: () => Date.now(),
        monoNow: () => Date.now() - T0,
        random,
        locks: () => locks,
      })
    : null;
  const client = createClient(SUPABASE_URL, ANON, {
    auth: {
      storage: guard ? guard.storage : authStorage,
      persistSession: true,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: { fetch: guard ? guard.fetch : server.fetch },
  });
  if (guard && wrapSignOut) {
    const signOut = client.auth.signOut.bind(client.auth);
    client.auth.signOut = (options) => guard.whileSigningOut(() => signOut(options));
  }
  const events = [];
  client.auth.onAuthStateChange((event) => events.push(event));
  return { client, guard, events };
}

function storedSession(backing) {
  const raw = backing.getItem(KEY);
  return raw ? JSON.parse(raw) : null;
}

async function query(t, tab) {
  const { value } = await settle(t, tab.client.from("courses").select("id"));
  return value;
}

// --- Horloge du téléphone ----------------------------------------------------

test("téléphone en avance d'1 h : un seul renouvellement au lieu d'un par requête", async (t) => {
  const results = {};
  for (const guarded of [false, true]) {
    useClock(t);
    // Serveur 1 h derrière le téléphone = téléphone 1 h en avance.
    const server = createFakeSupabase({ now: () => Date.now() - HOUR });
    const backing = memoryStore({ [KEY]: JSON.stringify(server.issueSession()) });
    const tab = makeTab(server, backing, { guarded });
    for (let i = 0; i < 5; i += 1) {
      const { error } = await query(t, tab);
      assert.equal(error, null);
    }
    results[guarded ? "after" : "before"] = server.counts.refresh;
    t.mock.timers.reset();
  }
  assert.ok(results.before >= 5, `avant : ${results.before} renouvellements`);
  assert.equal(results.after, 1);
});

test("téléphone en retard d'1 h : renouvelé avant l'expiration réelle, aucun « JWT expired »", async (t) => {
  const results = {};
  for (const guarded of [false, true]) {
    useClock(t);
    const server = createFakeSupabase({ now: () => Date.now() + HOUR });
    const backing = memoryStore();
    const tab = makeTab(server, backing, { guarded });
    await settle(t, tab.client.auth.signInWithPassword({ email: "u1@example.test", password: "secret" }));
    t.mock.timers.tick(HOUR + 10_000); // le jeton a expiré côté serveur
    await flush();
    const first = await query(t, tab);
    const second = await query(t, tab);
    results[guarded ? "after" : "before"] = { rest401: server.counts.rest401, refresh: server.counts.refresh, first, second };
    t.mock.timers.reset();
  }
  assert.equal(results.before.rest401, 2, "avant : le jeton expiré est encore envoyé");
  assert.equal(results.before.refresh, 0);
  assert.equal(results.after.rest401, 0);
  assert.equal(results.after.refresh, 1);
  assert.equal(results.after.first.error, null);
});

test("téléphone en retard d'1 h, session enregistrée avant ce correctif : un seul « JWT expired » puis renouvellement", async (t) => {
  const results = {};
  for (const guarded of [false, true]) {
    useClock(t);
    const server = createFakeSupabase({ now: () => Date.now() + HOUR });
    // Échéance à l'heure du serveur, comme l'écrivait l'ancien code.
    const backing = memoryStore({ [KEY]: JSON.stringify(server.issueSession()) });
    const tab = makeTab(server, backing, { guarded });
    await settle(t, tab.client.auth.getSession());
    t.mock.timers.tick(HOUR + 10_000);
    await flush();
    const answers = [];
    for (let i = 0; i < 3; i += 1) answers.push((await query(t, tab)).error?.code ?? "ok");
    results[guarded ? "after" : "before"] = { answers, refresh: server.counts.refresh };
    t.mock.timers.reset();
  }
  assert.deepEqual(results.before.answers, ["PGRST303", "PGRST303", "PGRST303"]);
  assert.equal(results.before.refresh, 0);
  assert.deepEqual(results.after.answers, ["PGRST303", "ok", "ok"]);
  assert.equal(results.after.refresh, 1);
});

test("connexion par pseudo (setSession) sur un téléphone en retard d'1 h : pas de jeton expiré envoyé", async (t) => {
  const results = {};
  for (const guarded of [false, true]) {
    useClock(t);
    const server = createFakeSupabase({ now: () => Date.now() + HOUR });
    const tab = makeTab(server, memoryStore(), { guarded });
    const issued = server.issueSession();
    const { value } = await settle(t, tab.client.auth.setSession({
      access_token: issued.access_token,
      refresh_token: issued.refresh_token,
    }));
    assert.equal(value.error, null);
    t.mock.timers.tick(HOUR + 10_000);
    await flush();
    const answers = [];
    for (let i = 0; i < 2; i += 1) answers.push((await query(t, tab)).error?.code ?? "ok");
    results[guarded ? "after" : "before"] = { answers, refresh: server.counts.refresh };
    t.mock.timers.reset();
  }
  assert.deepEqual(results.before.answers, ["PGRST303", "PGRST303"]);
  assert.deepEqual(results.after.answers, ["ok", "ok"]);
  assert.equal(results.after.refresh, 1);
});

// --- Refus « trop de demandes » ------------------------------------------------

test("429 au renouvellement : session gardée, requêtes en échec propre, reprise seule", async (t) => {
  const results = {};
  for (const guarded of [false, true]) {
    useClock(t);
    const server = createFakeSupabase({ bucket: { capacity: 30, refillPerSecond: 0 } });
    const backing = memoryStore({ [KEY]: JSON.stringify(server.issueSession()) });
    const tab = makeTab(server, backing, { guarded });
    await settle(t, tab.client.auth.getSession());
    t.mock.timers.tick(HOUR + 10_000);
    server.setBucketTokens(0);
    const during = await query(t, tab);
    const snapshot = {
      error: during.error?.code ?? null,
      signedOut: tab.events.includes("SIGNED_OUT"),
      stored: !!storedSession(backing),
      networkRefresh: server.counts.refresh,
      restAnon: server.counts.restAnon,
    };
    // Le seau se remplit : sans rien faire, la requête suivante repasse.
    server.setBucketTokens(30);
    t.mock.timers.tick(61_000);
    await flush();
    const later = await query(t, tab);
    results[guarded ? "after" : "before"] = {
      ...snapshot,
      laterError: later.error?.code ?? null,
      laterAuthorized: server.counts.restAuth,
      laterAnon: server.counts.restAnon,
      storedLater: !!storedSession(backing),
    };
    t.mock.timers.reset();
  }
  // Avant : déconnecté au premier refus, requêtes parties en anonyme.
  assert.equal(results.before.signedOut, true);
  assert.equal(results.before.stored, false);
  assert.equal(results.before.networkRefresh, 1);
  assert.equal(results.before.restAnon, 1);
  assert.equal(results.before.storedLater, false);
  assert.equal(results.before.laterAnon, 2);
  // Après : session gardée, échec propre sans requête anonyme, peu d'essais.
  assert.equal(results.after.signedOut, false);
  assert.equal(results.after.stored, true);
  assert.equal(results.after.error, RENEWAL_PENDING_CODE);
  assert.equal(results.after.restAnon, 0);
  assert.ok(results.after.networkRefresh <= 3, `${results.after.networkRefresh} essais réseau en ~25 s`);
  assert.equal(results.after.laterError, null);
  assert.equal(results.after.laterAuthorized, 1);
  assert.equal(results.after.laterAnon, 0);
  assert.equal(results.after.storedLater, true);
});

test("429 alors que le jeton est encore valide : l'app continue sans attendre ni réessayer", async (t) => {
  useClock(t);
  const server = createFakeSupabase({ bucket: { capacity: 30, refillPerSecond: 0 } });
  const session = server.issueSession();
  const backing = memoryStore({ [KEY]: JSON.stringify(session) });
  const tab = makeTab(server, backing);
  await settle(t, tab.client.auth.getSession());
  t.mock.timers.tick(HOUR - 80_000); // 80 s restantes : auth-js veut renouveler
  server.setBucketTokens(0);
  const { value, tookMs } = await settle(t, tab.client.auth.getSession());
  assert.equal(value.data.session.access_token, session.access_token);
  assert.ok(tookMs < 1000, `${tookMs} ms`);
  assert.equal(server.counts.refresh, 1);
  assert.equal(tab.events.includes("SIGNED_OUT"), false);
  // Pendant l'attente : le jeton courant sert, aucune nouvelle tentative.
  for (let i = 0; i < 3; i += 1) assert.equal((await query(t, tab)).error, null);
  assert.equal(server.counts.refresh, 1);
  assert.equal(server.counts.restAuth, 3);
  // Fin de l'attente, seau rempli : renouvellement normal avant l'expiration.
  server.setBucketTokens(30);
  t.mock.timers.tick(20_000);
  await flush();
  assert.equal((await query(t, tab)).error, null);
  assert.equal(server.counts.refreshOk, 1);
  assert.equal(server.counts.rest401, 0);
  assert.notEqual(storedSession(backing).access_token, session.access_token);
});

test("attente partagée entre onglets, tirée entre 50 et 100 %, plafonnée à 60 s", () => {
  assert.equal(backoffDelayMs(1, () => 0), 2500);
  assert.equal(backoffDelayMs(1, () => 1), 5000);
  assert.equal(backoffDelayMs(2, () => 1), 10_000);
  assert.equal(backoffDelayMs(4, () => 0.5), 30_000);
  assert.equal(backoffDelayMs(6, () => 1), 60_000);
  assert.equal(backoffDelayMs(12, () => 0), 30_000);
});

test("429 vu par un onglet : les autres n'envoient rien pendant l'attente", async (t) => {
  useClock(t);
  const server = createFakeSupabase({ bucket: { capacity: 30, refillPerSecond: 0 } });
  const backing = memoryStore({ [KEY]: JSON.stringify(server.issueSession()) });
  const tabA = makeTab(server, backing);
  const tabB = makeTab(server, backing);
  await settle(t, tabA.client.auth.getSession());
  await settle(t, tabB.client.auth.getSession());
  t.mock.timers.tick(HOUR + 10_000);
  server.setBucketTokens(0);
  await settle(t, tabA.client.auth.refreshSession(), { maxMs: 1000 }).catch(() => {});
  assert.ok(JSON.parse(backing.getItem(BACKOFF_STORAGE_KEY)).until > Date.now());
  const before = server.counts.refresh;
  await query(t, tabB); // ~25 s de relances locales d'auth-js
  assert.ok(server.counts.refresh - before <= 2, `${server.counts.refresh - before} essais réseau`);
});

test("attente effacée par un autre onglet après un succès : cet onglet ne patiente plus", async (t) => {
  useClock(t);
  const server = createFakeSupabase({ bucket: { capacity: 30, refillPerSecond: 0 } });
  const backing = memoryStore({ [KEY]: JSON.stringify(server.issueSession()) });
  const tab = makeTab(server, backing);
  await settle(t, tab.client.auth.getSession());
  t.mock.timers.tick(HOUR - 80_000);
  server.setBucketTokens(0);
  await settle(t, tab.client.auth.getSession());
  assert.equal(tab.guard.backoffActive(), true);
  backing.removeItem(BACKOFF_STORAGE_KEY); // ce que fait le succès d'un autre onglet
  assert.equal(tab.guard.backoffActive(), false);
});

test("erreur définitive au renouvellement (session révoquée) : déconnexion, comme avant", async (t) => {
  useClock(t);
  const server = createFakeSupabase();
  const session = server.issueSession();
  const backing = memoryStore({ [KEY]: JSON.stringify(session) });
  const tab = makeTab(server, backing);
  await settle(t, tab.client.auth.getSession());
  t.mock.timers.tick(HOUR + 10_000);
  server.revokeSession(readJwt(session.access_token).session_id);
  const { value } = await settle(t, tab.client.auth.getSession());
  assert.equal(value.data.session, null);
  assert.equal(tab.events.includes("SIGNED_OUT"), true);
  assert.equal(storedSession(backing), null);
  assert.equal(server.counts.refreshInvalid, 1);
});

test("plusieurs onglets : l'ancien jeton de renouvellement n'est jamais renvoyé", async (t) => {
  const results = {};
  for (const guarded of [false, true]) {
    useClock(t);
    const server = createFakeSupabase();
    const backing = memoryStore({ [KEY]: JSON.stringify(server.issueSession()) });
    const tabA = makeTab(server, backing, { guarded });
    const tabB = makeTab(server, backing, { guarded });
    await settle(t, tabA.client.auth.getSession());
    await settle(t, tabB.client.auth.getSession());
    t.mock.timers.tick(HOUR + 10_000);
    // Supabase répond 503 à B tant que `unavailable` est vrai ; A passe entre-temps.
    let unavailable = true;
    server.setIntercept(({ path, search }) => (
      unavailable && path === "/auth/v1/token" && search.get("grant_type") === "refresh_token"
        ? { status: 503, body: { message: "upstream unavailable" } }
        : null
    ));
    const pendingB = tabB.client.auth.getSession();
    await advance(t, 1000);
    unavailable = false;
    const a = await settle(t, tabA.client.auth.getSession(), { maxMs: 60_000 });
    unavailable = true;
    await advance(t, 9000);
    unavailable = false;
    const b = await settle(t, pendingB, { maxMs: 60_000 });
    await flush();
    results[guarded ? "after" : "before"] = {
      counts: { ...server.counts },
      aToken: a.value.data.session?.access_token,
      bToken: b.value.data.session?.access_token,
      stored: storedSession(backing)?.access_token,
      signedOut: tabA.events.includes("SIGNED_OUT") || tabB.events.includes("SIGNED_OUT"),
    };
    t.mock.timers.reset();
  }
  // Avant : B renvoie l'ancien jeton plus de 10 s après la rotation par A ;
  // Supabase révoque toute la session et les deux onglets sont déconnectés.
  assert.equal(results.before.counts.refreshAlreadyUsed, 1);
  assert.equal(results.before.signedOut, true);
  assert.equal(results.before.stored, undefined);
  // Après : une seule rotation, B reprend la session de A.
  assert.equal(results.after.counts.refreshAlreadyUsed, 0);
  assert.equal(results.after.counts.refreshReuse, 0);
  assert.equal(results.after.counts.refreshOk, 1);
  assert.equal(results.after.signedOut, false);
  assert.ok(results.after.stored);
  assert.equal(results.after.bToken, results.after.stored);
});

test("une nouvelle connexion n'est jamais remplacée par la session déjà stockée", async (t) => {
  useClock(t);
  // Téléphone en avance d'1 h : setSession renouvelle aussitôt le jeton reçu.
  const server = createFakeSupabase({ now: () => Date.now() - HOUR });
  server.users.set("u2", { id: "u2", email: "u2@example.test", password: "secret" });
  const backing = memoryStore({ [KEY]: JSON.stringify(server.issueSession("u1")) });
  const tab = makeTab(server, backing);
  await settle(t, tab.client.auth.getSession());
  const other = server.issueSession("u2");
  const { value } = await settle(t, tab.client.auth.setSession({
    access_token: other.access_token,
    refresh_token: other.refresh_token,
  }));
  assert.equal(value.error, null);
  assert.equal(value.data.session.user.id, "u2");
  assert.equal(readJwt(storedSession(backing).access_token).sub, "u2");
});

test("verrou entre onglets : une seule demande réseau à la fois, l'autre onglet reprend le résultat", async (t) => {
  useClock(t);
  const server = createFakeSupabase();
  const backing = memoryStore({ [KEY]: JSON.stringify(server.issueSession()) });
  const locks = fakeLockManager();
  const tabA = makeTab(server, backing, { locks });
  const tabB = makeTab(server, backing, { locks });
  await settle(t, tabA.client.auth.getSession());
  await settle(t, tabB.client.auth.getSession());
  t.mock.timers.tick(HOUR + 10_000);
  const [a, b] = await Promise.all([
    settle(t, tabA.client.auth.getSession()),
    settle(t, tabB.client.auth.getSession()),
  ]);
  assert.equal(locks.maxHeld, 1);
  assert.equal(server.counts.refresh, 1);
  assert.equal(server.counts.refreshReuse, 0);
  assert.equal(a.value.data.session.access_token, b.value.data.session.access_token);
});

test("verrou indisponible (erreur de sécurité) : le renouvellement se fait sans verrou, comme avant", async (t) => {
  useClock(t);
  const server = createFakeSupabase();
  const backing = memoryStore({ [KEY]: JSON.stringify(server.issueSession()) });
  const locks = { request() { throw Object.assign(new Error("denied"), { name: "SecurityError" }); } };
  const tab = makeTab(server, backing, { locks });
  await settle(t, tab.client.auth.getSession());
  t.mock.timers.tick(HOUR + 10_000);
  const { value } = await settle(t, tab.client.auth.getSession());
  assert.ok(value.data.session);
  assert.equal(server.counts.refreshOk, 1);
});

test("« pas maintenant » avec une session enregistrée sans expires_in : pas de déconnexion", async (t) => {
  useClock(t);
  const server = createFakeSupabase({ bucket: { capacity: 30, refillPerSecond: 0 } });
  const session = { ...server.issueSession(), expires_in: 0 };
  const backing = memoryStore({ [KEY]: JSON.stringify(session) });
  const tab = makeTab(server, backing);
  await settle(t, tab.client.auth.getSession());
  t.mock.timers.tick(HOUR - 80_000);
  server.setBucketTokens(0);
  const { value } = await settle(t, tab.client.auth.getSession());
  assert.equal(value.data.session?.access_token, session.access_token);
  assert.equal(tab.events.includes("SIGNED_OUT"), false);
});

// --- Déconnexion demandée ----------------------------------------------------

test("déconnexion pendant une attente : la session est oubliée tout de suite", async (t) => {
  const results = {};
  for (const wrapSignOut of [false, true]) {
    useClock(t);
    const server = createFakeSupabase({ bucket: { capacity: 30, refillPerSecond: 0 } });
    const backing = memoryStore({ [KEY]: JSON.stringify(server.issueSession()) });
    const tab = makeTab(server, backing, { wrapSignOut });
    await settle(t, tab.client.auth.getSession());
    t.mock.timers.tick(HOUR + 10_000);
    server.setBucketTokens(0);
    await query(t, tab);
    const refreshBefore = server.counts.refresh;
    const { value, tookMs } = await settle(t, tab.client.auth.signOut({ scope: "local" }));
    results[wrapSignOut ? "after" : "without"] = {
      error: value.error?.name ?? null,
      tookMs,
      stored: !!storedSession(backing),
      signedOut: tab.events.includes("SIGNED_OUT"),
      extraRefresh: server.counts.refresh - refreshBefore,
    };
    t.mock.timers.reset();
  }
  // Sans l'enveloppe de signOut, la déconnexion échouerait pendant l'attente.
  assert.equal(results.without.stored, true);
  assert.equal(results.without.error, "AuthRetryableFetchError");
  assert.equal(results.after.error, null);
  assert.equal(results.after.stored, false);
  assert.equal(results.after.signedOut, true);
  assert.equal(results.after.extraRefresh, 0);
  assert.ok(results.after.tookMs < 1000, `${results.after.tookMs} ms`);
});

// --- Réseau coupé ------------------------------------------------------------

test("réseau coupé puis rétabli : session gardée, pas de requête anonyme, un renouvellement", async (t) => {
  useClock(t);
  const server = createFakeSupabase();
  const backing = memoryStore({ [KEY]: JSON.stringify(server.issueSession()) });
  const tab = makeTab(server, backing);
  await settle(t, tab.client.auth.getSession());
  t.mock.timers.tick(HOUR + 10_000);
  server.setOffline(true);
  const offline = await query(t, tab);
  assert.equal(offline.error.code, RENEWAL_PENDING_CODE);
  assert.equal(tab.events.includes("SIGNED_OUT"), false);
  assert.ok(storedSession(backing));
  // Relances rapides d'auth-js inchangées ; aucune attente enregistrée.
  assert.equal(backing.getItem(BACKOFF_STORAGE_KEY), null);
  server.setOffline(false);
  const online = await query(t, tab);
  assert.equal(online.error, null);
  assert.equal(server.counts.refreshOk, 1);
  assert.equal(server.counts.restAnon, 0);
});

// --- Retour du serveur « JWT expired » -------------------------------------

test("« JWT expired » sur un jeton tout juste reçu : pas de boucle de renouvellement", async (t) => {
  useClock(t);
  const server = createFakeSupabase();
  server.setIntercept(({ path }) => (path.startsWith("/rest/v1/")
    ? { status: 401, body: { code: "PGRST303", message: "JWT expired", details: null, hint: null } }
    : null));
  const tab = makeTab(server, memoryStore());
  await settle(t, tab.client.auth.signInWithPassword({ email: "u1@example.test", password: "secret" }));
  for (let i = 0; i < 3; i += 1) await query(t, tab);
  assert.equal(server.counts.refresh, 0, "jeton reçu il y a moins d'une minute : pas cru");
  t.mock.timers.tick(61_000);
  await flush();
  for (let i = 0; i < 4; i += 1) await query(t, tab);
  assert.equal(server.counts.refresh, 1, "un seul renouvellement, puis le nouveau jeton n'est pas remis en cause");
});

// --- Horloge : mesures pures -------------------------------------------------

function clockGuard(server, clocks) {
  const backing = memoryStore();
  const guard = createAuthSessionGuard({
    supabaseUrl: SUPABASE_URL,
    anonKey: ANON,
    sessionStore: createAuthStorage({ getBackingStore: () => backing }),
    baseFetch: server.fetch,
    wallNow: () => clocks.wall,
    monoNow: () => clocks.mono,
  });
  return { guard, backing };
}

async function passwordLogin(guard) {
  const response = await guard.fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "u1@example.test", password: "secret" }),
  });
  const session = await response.json();
  guard.storage.setItem(KEY, JSON.stringify(session));
  return session;
}

function presentedRemainingMs(guard, clocks) {
  return JSON.parse(guard.storage.getItem(KEY)).expires_at * 1000 - clocks.wall;
}

test("horloge : un décalage fixe du téléphone ne change rien au temps restant", async () => {
  for (const offset of [-HOUR, 0, HOUR]) {
    const clocks = { wall: T0 + offset, mono: 1000 };
    const server = createFakeSupabase({ now: () => T0 + (clocks.wall - T0 - offset) });
    const { guard } = clockGuard(server, clocks);
    await passwordLogin(guard);
    clocks.wall += 600_000;
    clocks.mono += 600_000;
    const remaining = presentedRemainingMs(guard, clocks);
    assert.ok(Math.abs(remaining - 3_000_000) <= 1000, `décalage ${offset} : ${remaining} ms`);
  }
});

test("horloge : iPhone endormi 2 h (performance.now arrêté) : jeton vu comme expiré", async () => {
  const clocks = { wall: T0, mono: 1000 };
  const server = createFakeSupabase({ now: () => clocks.wall });
  const { guard } = clockGuard(server, clocks);
  await passwordLogin(guard);
  clocks.wall += 2 * HOUR; // l'heure civile avance pendant le sommeil
  clocks.mono += 60_000; // pas l'horloge monotone
  assert.ok(presentedRemainingMs(guard, clocks) < 0);
});

test("horloge : heure du téléphone reculée d'1 h pendant l'utilisation : pas de validité prolongée", async () => {
  const clocks = { wall: T0, mono: 1000 };
  const server = createFakeSupabase({ now: () => T0 + clocks.mono });
  const { guard } = clockGuard(server, clocks);
  await passwordLogin(guard);
  clocks.wall += 600_000 - HOUR; // 10 min passent, mais l'heure recule d'1 h
  clocks.mono += 600_000;
  const remaining = presentedRemainingMs(guard, clocks);
  assert.ok(Math.abs(remaining - 3_000_000) <= 1000, `${remaining} ms`);
});

test("horloge : heure avancée d'1 h pendant l'utilisation : renouvellement anticipé (sens prudent)", async () => {
  const clocks = { wall: T0, mono: 1000 };
  const server = createFakeSupabase({ now: () => T0 + clocks.mono });
  const { guard } = clockGuard(server, clocks);
  await passwordLogin(guard);
  clocks.wall += HOUR;
  clocks.mono += 60_000;
  assert.ok(presentedRemainingMs(guard, clocks) <= 0);
});

// --- Câblage -------------------------------------------------------------------

test("clé de session identique à celle de supabase-js", () => {
  for (const url of [SUPABASE_URL, "https://xtpsavwwhkeiwfkidwcu.supabase.co", "http://localhost"]) {
    const client = createClient(url, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
    assert.equal(authStorageKeyFor(url), client.auth.storageKey);
  }
});

test("câblage : le client du navigateur passe par la garde", () => {
  const source = readFileSync(new URL("../lib/supabaseClient.js", import.meta.url), "utf8");
  assert.match(source, /createAuthSessionGuard\(\{/);
  assert.match(source, /sessionStore: authStorage,/);
  assert.match(source, /storage: sessionGuard \? sessionGuard\.storage : authStorage,/);
  assert.match(source, /global: \{ fetch: sessionGuard\.fetch \}/);
  assert.match(source, /realSupabase\.auth\.signOut = \(options\) => sessionGuard\.whileSigningOut\(\(\) => signOut\(options\)\)/);
});
