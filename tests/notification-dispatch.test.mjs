// Le point d'envoi unique, le rappel du soir, les demandes d'ami et le
// nettoyage OneSignal — avec une base et un OneSignal factices. Aucun envoi
// réel : le faux client ne fait qu'enregistrer ce qu'on lui demande.
import test from "node:test";
import assert from "node:assert/strict";
import { cancelScheduledSend, dispatchNotification, NotifyError } from "../lib/server/notify.mjs";
import { runDailyReminders } from "../lib/server/dailyReminders.mjs";
import { isWebhookAuthorized, notifyFriendRequest } from "../lib/server/friendRequestPush.mjs";
import { processIdentityCleanup } from "../lib/server/pushIdentity.mjs";
import { AUTOMATIONS } from "../lib/pushAutomations.mjs";
import {
  claimPushOwner, clearPushOwner, deviceKey, platformFamily, readPushOwner,
  shouldReassociate, shouldReportPresence, markPresenceReported,
} from "../lib/pushOwner.mjs";

const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const CONTENT = { title: { fr: "Titre", en: "Title" }, body: { fr: "Texte", en: "Text" }, url: "/planning" };
const REUSABLE = new Set(["failed", "unreachable", "cancelled"]);

// Même contrat que la base : notification_audience décide les raisons,
// notification_claim refuse une clé déjà prise par un envoi non échoué.
function fakeStore(rowsByUser = {}, { cap = 3 } = {}) {
  const state = { sends: [], keys: new Map(), audienceCalls: [] };
  const rowFor = (userId) => ({
    user_id: userId, reason: null, lang: "fr", timezone: "Europe/Brussels",
    devices: 1, recent_reminders: 0, recent_social: 0, ...(rowsByUser[userId] || {}),
  });
  return {
    state,
    async audience(args) {
      state.audienceCalls.push(args);
      const ids = args.scope === "all" ? Object.keys(rowsByUser) : args.userIds || [];
      return ids.map(rowFor);
    },
    async settings() { return { remindersWeeklyCap: cap }; },
    async findSendByKey(key) { return state.sends.find((send) => send.idempotency_key === key) || null; },
    async getSend(sendId) { return state.sends.find((send) => send.id === sendId) || null; },
    async createSend(row) {
      if (row.idempotency_key && state.sends.some((send) => send.idempotency_key === row.idempotency_key)) return { conflict: true };
      const created = { id: `send-${state.sends.length + 1}`, ...row };
      state.sends.push(created);
      return { id: created.id };
    },
    async claim(sendId, rows) {
      const out = [];
      for (const row of rows) {
        const key = row.key || `${sendId}:${row.user_id}`;
        const existing = state.keys.get(key);
        if (existing && !REUSABLE.has(existing.status)) continue;
        state.keys.set(key, { sendId, userId: row.user_id, status: "queued" });
        out.push(row.user_id);
      }
      return out;
    },
    async mark(sendId, userIds, status) {
      for (const entry of state.keys.values()) {
        if (entry.sendId !== sendId || (userIds && !userIds.includes(entry.userId))) continue;
        if (entry.status === "queued" || (status === "cancelled" && entry.status === "scheduled")) entry.status = status;
      }
    },
    async finishSend(sendId, patch) { Object.assign(state.sends.find((send) => send.id === sendId), patch); },
  };
}

function fakeOneSignal({ failOn = () => false, noRecipients = false, configured = true } = {}) {
  const calls = [];
  return {
    configured,
    calls,
    cancelled: [],
    async send(args) {
      calls.push(args);
      if (failOn(calls.length)) throw Object.assign(new Error("down"), { code: "onesignal_unavailable" });
      return noRecipients ? { id: null, noRecipients: true } : { id: `os-${calls.length}`, noRecipients: false };
    },
    async cancel(notificationId) { this.cancelled.push(notificationId); return { ok: true }; },
  };
}

const baseSpec = (extra = {}) => ({
  source: "admin", category: "announcement", kind: "admin_message", trigger: "admin:composer",
  target: { type: "users", userIds: [id(1), id(2), id(3), id(4), id(5)] }, content: CONTENT, ...extra,
});

test("only eligible accounts reach OneSignal; every exclusion is counted", async () => {
  const store = fakeStore({
    [id(1)]: {}, [id(2)]: { reason: "suspended" }, [id(3)]: { reason: "category_off" },
    [id(4)]: { reason: "missing", devices: 0 }, [id(5)]: { reason: "general_off" },
  });
  const onesignal = fakeOneSignal();
  const result = await dispatchNotification({ store, onesignal, spec: baseSpec() });
  assert.equal(result.status, "sent");
  assert.deepEqual(onesignal.calls.map((call) => call.externalIds), [[id(1)]]);
  assert.deepEqual(result.summary.excluded, { suspended: 1, category_off: 1, missing: 1, general_off: 1 });
  assert.equal(store.state.sends[0].targeted, 5);
  assert.equal(store.state.sends[0].eligible, 1);
  assert.equal(store.state.sends[0].sent, 1);
});

test("« tous » is a list of accounts from the database, never a OneSignal segment", async () => {
  const store = fakeStore({ [id(1)]: {}, [id(2)]: {}, [id(3)]: { reason: "suspended" } });
  const onesignal = fakeOneSignal();
  await dispatchNotification({ store, onesignal, spec: baseSpec({ target: { type: "all" } }) });
  assert.equal(store.state.audienceCalls[0].scope, "all");
  assert.deepEqual(onesignal.calls[0].externalIds.sort(), [id(1), id(2)]);
  for (const call of onesignal.calls) {
    assert.deepEqual(Object.keys(call).sort(), ["body", "externalIds", "sendAfter", "title", "url"]);
  }
});

test("a dry run writes nothing and sends nothing", async () => {
  const store = fakeStore({ [id(1)]: {}, [id(2)]: { reason: "suspended" } });
  const onesignal = fakeOneSignal();
  const result = await dispatchNotification({ store, onesignal, spec: baseSpec({ target: { type: "all" }, dryRun: true }) });
  assert.equal(result.status, "preview");
  assert.equal(result.summary.eligible, 1);
  assert.equal(store.state.sends.length, 0);
  assert.equal(onesignal.calls.length, 0);
});

test("the same reminder never goes twice to the same person the same day", async () => {
  const store = fakeStore({ [id(1)]: {}, [id(2)]: {} });
  const onesignal = fakeOneSignal();
  const spec = baseSpec({
    source: "automation", category: "reminder", kind: "streak_at_risk", trigger: "cron:push_daily",
    target: { type: "automation", userIds: [id(1), id(2)] },
    recipientKey: (row) => `reminder:2026-09-24:${row.user_id}`,
  });
  await dispatchNotification({ store, onesignal, spec });
  const again = await dispatchNotification({ store, onesignal, spec: { ...spec, kind: "nudge_study" } });
  assert.equal(onesignal.calls.length, 1);
  assert.equal(again.status, "skipped");
  assert.equal(again.summary.excluded.duplicate, 2);
});

test("a failed send is retried by the next run, a delivered one is not", async () => {
  const store = fakeStore({ [id(1)]: {} });
  const spec = baseSpec({
    source: "automation", category: "reminder", kind: "streak_at_risk", trigger: "cron:push_daily",
    target: { type: "automation", userIds: [id(1)] }, recipientKey: (row) => `reminder:2026-09-24:${row.user_id}`,
  });
  const down = await dispatchNotification({ store, onesignal: fakeOneSignal({ failOn: () => true }), spec });
  assert.equal(down.status, "failed");
  assert.equal(store.state.sends[0].error, "onesignal_unavailable");
  const up = fakeOneSignal();
  const retry = await dispatchNotification({ store, onesignal: up, spec });
  assert.equal(retry.status, "sent");
  assert.equal(up.calls.length, 1);
  const third = await dispatchNotification({ store, onesignal: up, spec });
  assert.equal(third.status, "skipped");
  assert.equal(up.calls.length, 1);
});

test("a double click on « Envoyer » sends once (send-level key)", async () => {
  const store = fakeStore({ [id(1)]: {} });
  const onesignal = fakeOneSignal();
  const spec = baseSpec({ target: { type: "users", userIds: [id(1)] }, idempotencyKey: "admin-request-1" });
  await dispatchNotification({ store, onesignal, spec });
  const second = await dispatchNotification({ store, onesignal, spec });
  assert.equal(second.duplicate, true);
  assert.equal(onesignal.calls.length, 1);
});

test("no subscribed device: recorded as unreachable, never as sent", async () => {
  const store = fakeStore({ [id(1)]: { devices: 0 } });
  const result = await dispatchNotification({
    store, onesignal: fakeOneSignal({ noRecipients: true }), spec: baseSpec({ target: { type: "users", userIds: [id(1)] } }),
  });
  assert.equal(result.status, "skipped");
  assert.equal(result.counts.unreachable, 1);
  assert.equal(store.state.sends[0].excluded.unreachable, 1);
  assert.equal(store.state.sends[0].sent, 0);
});

test("large sends go in batches of 2 000; one failed batch makes a partial send", async () => {
  const rows = Object.fromEntries(Array.from({ length: 2001 }, (_, i) => [id(i + 1), {}]));
  const store = fakeStore(rows);
  const onesignal = fakeOneSignal({ failOn: (n) => n === 2 });
  const result = await dispatchNotification({ store, onesignal, spec: baseSpec({ target: { type: "all" } }) });
  assert.deepEqual(onesignal.calls.map((call) => call.externalIds.length), [2000, 1]);
  assert.equal(result.status, "partial");
  assert.deepEqual([result.counts.sent, result.counts.failed], [2000, 1]);
});

test("without OneSignal configured, nothing is recorded as sent", async () => {
  const store = fakeStore({ [id(1)]: {} });
  await assert.rejects(
    dispatchNotification({ store, onesignal: fakeOneSignal({ configured: false }), spec: baseSpec() }),
    (error) => error instanceof NotifyError && error.code === "onesignal_unconfigured",
  );
  assert.equal(store.state.sends.length, 0);
});

test("an admin send with nobody eligible still leaves a trace", async () => {
  const store = fakeStore({ [id(1)]: { reason: "category_off" } });
  const onesignal = fakeOneSignal();
  const result = await dispatchNotification({
    store, onesignal, spec: baseSpec({ target: { type: "users", userIds: [id(1)] }, recordEmpty: true }),
  });
  assert.equal(result.status, "skipped");
  assert.equal(store.state.sends[0].status, "skipped");
  assert.equal(onesignal.calls.length, 0);
});

test("a scheduled send can be cancelled, a sent one cannot", async () => {
  const store = fakeStore({ [id(1)]: {} });
  const onesignal = fakeOneSignal();
  const scheduled = await dispatchNotification({
    store, onesignal, spec: baseSpec({ target: { type: "users", userIds: [id(1)] }, sendAfter: "2026-10-01T08:00:00.000Z" }),
  });
  assert.equal(scheduled.status, "scheduled");
  await cancelScheduledSend({ store, onesignal, sendId: scheduled.sendId });
  assert.deepEqual(onesignal.cancelled, ["os-1"]);
  assert.equal(store.state.sends[0].status, "cancelled");
  await assert.rejects(cancelScheduledSend({ store, onesignal, sendId: scheduled.sendId }), (error) => error.code === "not_cancellable");
});

// ── Rappel du soir ─────────────────────────────────────────────────────────
const automations = Object.fromEntries(AUTOMATIONS.map((a) => [a.key, { enabled: true, title: a.title, body: a.body, url: a.url }]));
const EVENING = new Date("2026-09-24T18:00:00Z");
const activity = {
  sessions: [
    { user_id: id(1), started_at: "2026-09-23T18:00:00Z" }, // hier → série en danger
    { user_id: id(2), started_at: "2026-09-23T18:00:00Z" }, // hier, mais a coupé les rappels
    { user_id: id(3), started_at: "2026-09-23T18:00:00Z" }, // hier, mais plafond atteint
    { user_id: id(4), started_at: "2026-09-23T18:00:00Z" }, // hier, suspendu
    { user_id: id(6), started_at: "2026-09-23T18:00:00Z" }, // hier, Hong Kong (2 h du matin)
  ],
  exams: [{ user_id: id(5), exam_date: "2026-09-25" }], // examen demain, plafond atteint mais exempté
  newcomerIds: [],
};
const reminderRows = {
  [id(1)]: {}, [id(2)]: { reason: "category_off" }, [id(3)]: { recent_reminders: 3 },
  [id(4)]: { reason: "suspended" }, [id(5)]: { recent_reminders: 5 }, [id(6)]: { timezone: "Asia/Hong_Kong" },
};

test("the evening run respects preferences, suspension, cap, quiet hours — and the exam", async () => {
  const store = fakeStore(reminderRows);
  const onesignal = fakeOneSignal();
  const summary = await runDailyReminders({ store, onesignal, loadActivity: async () => activity, automations, now: EVENING });
  const sentTo = onesignal.calls.flatMap((call) => call.externalIds).sort();
  assert.deepEqual(sentTo, [id(1), id(5)]);
  assert.equal(summary.sent, 2);
  assert.equal(summary.excluded.category_off, 1);
  assert.equal(summary.excluded.suspended, 1);
  assert.equal(summary.excluded.frequency, 1);
  assert.equal(summary.skipped.quiet_hours, 1);
  assert.equal(summary.kinds.exam_tomorrow.sent, 1);
  assert.equal(summary.kinds.streak_at_risk.sent, 1);
});

test("running the evening job twice the same day sends nothing the second time", async () => {
  const store = fakeStore(reminderRows);
  const onesignal = fakeOneSignal();
  await runDailyReminders({ store, onesignal, loadActivity: async () => activity, automations, now: EVENING });
  const second = await runDailyReminders({
    store, onesignal, loadActivity: async () => activity, automations, now: new Date("2026-09-24T19:30:00Z"),
  });
  assert.equal(onesignal.calls.length, 2);
  assert.equal(second.sent, 0);
  assert.equal(second.excluded.duplicate, 2);
});

test("a reminder switched off in the admin is counted, not sent", async () => {
  const store = fakeStore(reminderRows);
  const onesignal = fakeOneSignal();
  const off = { ...automations, streak_at_risk: { ...automations.streak_at_risk, enabled: false } };
  const summary = await runDailyReminders({ store, onesignal, loadActivity: async () => activity, automations: off, now: EVENING });
  assert.deepEqual(onesignal.calls.flatMap((call) => call.externalIds), [id(5)]);
  // Les deux relances « série en danger » prévues (dont une déjà plafonnée).
  assert.equal(summary.excluded.disabled, 2);
});

test("« who would receive today » is a dry run that names members, without sending", async () => {
  const store = fakeStore(reminderRows);
  const onesignal = fakeOneSignal();
  const summary = await runDailyReminders({
    store, onesignal, loadActivity: async () => activity, automations, now: EVENING, dryRun: true,
    lookupPseudos: async (ids) => new Map(ids.map((userId) => [userId, `pseudo-${userId.slice(-2)}`])),
  });
  assert.equal(onesignal.calls.length, 0);
  assert.equal(store.state.sends.length, 0);
  assert.deepEqual(summary.members.streak_at_risk, { total: 1, pseudos: ["pseudo-01"] });
  assert.deepEqual(summary.members.exam_tomorrow, { total: 1, pseudos: ["pseudo-05"] });
});

// ── Demandes d'ami ─────────────────────────────────────────────────────────
const NOW = new Date("2026-09-24T12:00:00Z");
const friendship = { id: id(90), requester: id(1), addressee: id(2), status: "pending", created_at: "2026-09-24T11:59:00Z" };
const friendDeps = (store, onesignal, extra = {}) => ({
  store, onesignal, automations, now: NOW, friendshipId: friendship.id,
  loadFriendship: async () => friendship,
  loadProfile: async () => ({ pseudo: "lea", first_name: "Léa", last_name: null, locked: false }),
  nameOf: (profile) => profile.first_name || profile.pseudo,
  ...extra,
});

test("a friend request push names the author, but the registry keeps only the template", async () => {
  const store = fakeStore({ [id(2)]: {} });
  const onesignal = fakeOneSignal();
  const result = await notifyFriendRequest(friendDeps(store, onesignal));
  assert.equal(result.status, "sent");
  assert.equal(onesignal.calls[0].body.fr, "Léa t'a envoyé une demande d'ami");
  assert.equal(onesignal.calls[0].body.en, "Léa sent you a friend request");
  assert.equal(store.state.sends[0].body.fr, "{name} t'a envoyé une demande d'ami");
  assert.equal(store.state.audienceCalls[0].actorId, id(1));
  // Supprimer puis refaire la demande le même jour ne relance pas de notification.
  const again = await notifyFriendRequest(friendDeps(store, onesignal));
  assert.equal(again.status, "skipped");
  assert.equal(onesignal.calls.length, 1);
});

test("no friend request push when blocked, opted out of social, stale, or from a suspended author", async () => {
  for (const reason of ["blocked", "category_off", "general_off", "suspended"]) {
    const onesignal = fakeOneSignal();
    const result = await notifyFriendRequest(friendDeps(fakeStore({ [id(2)]: { reason } }), onesignal));
    assert.equal(onesignal.calls.length, 0, reason);
    assert.equal(result.status, "skipped", reason);
  }
  const onesignal = fakeOneSignal();
  const stale = await notifyFriendRequest(friendDeps(fakeStore({ [id(2)]: {} }), onesignal, {
    loadFriendship: async () => ({ ...friendship, created_at: "2026-09-24T09:00:00Z" }),
  }));
  assert.equal(stale.reason, "stale");
  const suspended = await notifyFriendRequest(friendDeps(fakeStore({ [id(2)]: {} }), onesignal, {
    loadProfile: async () => ({ pseudo: "x", locked: true }),
  }));
  assert.equal(suspended.reason, "requester_unavailable");
  const tooMany = await notifyFriendRequest(friendDeps(fakeStore({ [id(2)]: { recent_social: 10 } }), onesignal));
  assert.equal(tooMany.status, "skipped");
  assert.equal(onesignal.calls.length, 0);
});

test("the webhook needs a strong secret: the old weak one no longer opens the route", async () => {
  const strong = "a".repeat(64);
  const vault = async (secret) => secret === strong;
  assert.equal(await isWebhookAuthorized({ header: strong, verifyVaultSecret: vault }), true);
  assert.equal(await isWebhookAuthorized({ header: "b".repeat(64), verifyVaultSecret: vault }), false);
  assert.equal(await isWebhookAuthorized({ header: "Weak12345678", envSecret: "Weak12345678", verifyVaultSecret: vault }), false);
  assert.equal(await isWebhookAuthorized({ header: "", verifyVaultSecret: vault }), false);
  const envStrong = "c".repeat(40);
  assert.equal(await isWebhookAuthorized({ header: envStrong, envSecret: envStrong, verifyVaultSecret: vault }), true);
  assert.equal(await isWebhookAuthorized({ header: strong, verifyVaultSecret: async () => { throw new Error("db down"); } }), false);
});

// ── Suppression de compte → OneSignal ─────────────────────────────────────
function fakeQueue(rows) {
  const state = { rows: rows.map((row) => ({ attempts: 0, ...row })), done: [], failed: [] };
  return {
    state,
    async list({ externalId }) { return state.rows.filter((row) => !externalId || row.external_id === externalId); },
    async done(externalId) { state.done.push(externalId); state.rows = state.rows.filter((row) => row.external_id !== externalId); },
    async failed(externalId, attempts, code) { state.failed.push({ externalId, attempts, code }); },
  };
}

test("a deleted account is erased at OneSignal; a failure stays queued for the next run", async () => {
  const queue = fakeQueue([{ external_id: id(1) }, { external_id: id(2) }, { external_id: id(3) }]);
  const onesignal = {
    configured: true,
    async deleteUser(externalId) {
      if (externalId === id(2)) return { deleted: false, missing: true };
      if (externalId === id(3)) throw Object.assign(new Error("down"), { code: "onesignal_unavailable" });
      return { deleted: true, missing: false };
    },
  };
  const result = await processIdentityCleanup({ queue, onesignal });
  assert.deepEqual(result, { processed: 3, deleted: 1, missing: 1, failed: 1 });
  assert.deepEqual(queue.state.done, [id(1), id(2)]);
  assert.deepEqual(queue.state.failed, [{ externalId: id(3), attempts: 1, code: "onesignal_unavailable" }]);
  const idle = await processIdentityCleanup({ queue, onesignal: { configured: false } });
  assert.equal(idle.skipped, "unconfigured");
});

// ── Appareil partagé, déconnexion ─────────────────────────────────────────
function memoryStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => map.set(key, String(value)),
    removeItem: (key) => map.delete(key),
    dump: () => Object.fromEntries(map),
  };
}

test("only the account that turned notifications on is re-linked on this device", () => {
  const storage = memoryStorage();
  claimPushOwner(storage, id(1));
  assert.equal(shouldReassociate({ storage, userId: id(1), functionalConsent: true }), true);
  // Après la déconnexion de 1, quelqu'un d'autre se connecte sur le même appareil.
  assert.equal(shouldReassociate({ storage, userId: id(2), functionalConsent: true }), false);
  // Sans consentement, jamais.
  assert.equal(shouldReassociate({ storage, userId: id(1), functionalConsent: false }), false);
  clearPushOwner(storage);
  assert.equal(shouldReassociate({ storage, userId: id(1), functionalConsent: true }), false);
});

test("the old device flag is taken over once, by the signed-in account", () => {
  const storage = memoryStorage({ bt_push_enabled: "1" });
  assert.deepEqual(readPushOwner(storage, id(1)), { owner: null, mine: true, legacy: true });
  claimPushOwner(storage, id(1));
  assert.deepEqual(storage.dump(), { bt_push_owner: id(1) });
  assert.equal(readPushOwner(storage, id(2)).mine, false);
});

test("the device key is ours, random and stable; the platform is only a family", () => {
  const storage = memoryStorage();
  let n = 0;
  const make = () => id(++n);
  const first = deviceKey(storage, make);
  assert.equal(deviceKey(storage, make), first);
  assert.equal(platformFamily({ userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)" }), "ios");
  assert.equal(platformFamily({ userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", platform: "MacIntel", maxTouchPoints: 5 }), "ios");
  assert.equal(platformFamily({ userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", platform: "MacIntel" }), "macos");
  assert.equal(platformFamily({ userAgent: "Mozilla/5.0 (Linux; Android 14)" }), "android");
  assert.equal(platformFamily({ userAgent: "Mozilla/5.0 (Windows NT 10.0)" }), "windows");
  assert.equal(shouldReportPresence(storage, id(1), 1_000), true);
  markPresenceReported(storage, id(1), 1_000);
  assert.equal(shouldReportPresence(storage, id(1), 2_000), false);
  assert.equal(shouldReportPresence(storage, id(1), 1_000 + 13 * 3600e3), true);
});
