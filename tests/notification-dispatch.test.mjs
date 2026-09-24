// Le point d'envoi unique, le rappel du soir, les demandes d'ami et le
// nettoyage OneSignal — avec une base et un OneSignal factices. Aucun envoi
// réel : le faux client ne fait qu'enregistrer ce qu'on lui demande.
import test from "node:test";
import assert from "node:assert/strict";
import { cancelScheduledSend, dispatchNotification, NotifyError } from "../lib/server/notify.mjs";
import { runDailyReminders } from "../lib/server/dailyReminders.mjs";
import {
  isWebhookAuthorized, notifyFriendAccepted, notifyFriendRequest, notifyPrivateMessage,
} from "../lib/server/socialPush.mjs";
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
function fakeStore(rowsByUser = {}, { cap = 2, history = [] } = {}) {
  // clock : l'heure à laquelle le faux registre date ce qu'il réserve.
  const state = { sends: [], keys: new Map(), audienceCalls: [], clock: new Date() };
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
        const send = state.sends.find((item) => item.id === sendId);
        state.keys.set(key, {
          sendId, userId: row.user_id, status: "queued", kind: send?.kind, category: send?.category,
          createdAt: state.clock.toISOString(), key,
        });
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
    async history({ userIds, since }) {
      const claimed = [...state.keys.values()]
        .filter((entry) => entry.category === "reminder" && ["sent", "scheduled"].includes(entry.status))
        .map((entry) => ({ user_id: entry.userId, kind: entry.kind, created_at: entry.createdAt }));
      return [...history, ...claimed].filter((row) => userIds.includes(row.user_id) && row.created_at >= since);
    },
    async recentRecipientKey({ userId, kind, keyPrefix, since }) {
      return [...state.keys.values()].some((entry) => entry.userId === userId && entry.kind === kind
        && entry.key.startsWith(keyPrefix) && ["queued", "sent", "scheduled"].includes(entry.status) && entry.createdAt >= since);
    },
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
const DAY = 864e5;
const at = (day) => `${day}T10:00:00Z`;
const streakOf = (userId) => ["2026-09-21", "2026-09-22", "2026-09-23"].map((day) => ({ user_id: userId, started_at: at(day), duration_seconds: 1800 }));
const activity = {
  sessions: [
    ...streakOf(id(1)), // série de 3 jours en danger
    ...streakOf(id(2)), // idem, mais a coupé les rappels
    ...streakOf(id(3)), // idem, mais déjà 2 relances cette semaine
    ...streakOf(id(4)), // idem, suspendu
    ...streakOf(id(6)), // idem, à Hong Kong (2 h du matin)
  ],
  // Examen demain : un fait, jamais plafonné (id 5 a aussi 2 relances cette semaine).
  exams: [{ user_id: id(5), name: "Économie", exam_date: "2026-09-25", exam_time: "09:00:00" }],
  newcomers: [],
  frozenDays: new Map(),
  configured: new Set(),
};
const twoNudges = (userId) => [
  { user_id: userId, kind: "reactivation_7d", created_at: new Date(EVENING.getTime() - 3 * DAY).toISOString() },
  { user_id: userId, kind: "streak_at_risk", created_at: new Date(EVENING.getTime() - 5 * DAY).toISOString() },
];
const reminderRows = {
  [id(1)]: {}, [id(2)]: { reason: "category_off" }, [id(3)]: {},
  [id(4)]: { reason: "suspended" }, [id(5)]: {}, [id(6)]: { timezone: "Asia/Hong_Kong" },
};
const eveningStore = () => {
  const store = fakeStore(reminderRows, { history: [...twoNudges(id(3)), ...twoNudges(id(5))] });
  store.state.clock = EVENING;
  return store;
};

test("the evening run respects preferences, suspension, cap, quiet hours — and the exam", async () => {
  const store = eveningStore();
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

test("personalised texts go out, the registry keeps only the templates", async () => {
  const store = eveningStore();
  const onesignal = fakeOneSignal();
  await runDailyReminders({ store, onesignal, loadActivity: async () => activity, automations, now: EVENING });
  const titles = onesignal.calls.map((call) => call.title.fr).sort((a, b) => a.localeCompare(b, "fr"));
  assert.deepEqual(titles, ["Économie demain à 9 h 📚", "Ta série de 3 jours est en danger 🔥"]);
  const examSend = store.state.sends.find((send) => send.kind === "exam_tomorrow");
  assert.equal(examSend.title.fr, "{exams} demain{at} 📚");
  assert.equal(JSON.stringify(store.state.sends).includes("Économie"), false);
});

test("two members, two exams: two texts, still one registry row for the kind", async () => {
  const store = fakeStore({ [id(1)]: {}, [id(2)]: {} });
  store.state.clock = EVENING;
  const onesignal = fakeOneSignal();
  const twoExams = {
    ...activity, sessions: [],
    exams: [
      { user_id: id(1), name: "Droit", exam_date: "2026-09-25", exam_time: null },
      { user_id: id(2), name: "Chimie", exam_date: "2026-09-25", exam_time: "14:30:00" },
    ],
  };
  await runDailyReminders({ store, onesignal, loadActivity: async () => twoExams, automations, now: EVENING });
  assert.deepEqual(onesignal.calls.map((call) => [call.externalIds, call.title.en]).sort(), [
    [[id(1)], "Droit tomorrow 📚"],
    [[id(2)], "Chimie tomorrow at 2:30 pm 📚"],
  ]);
  assert.equal(store.state.sends.filter((send) => send.kind === "exam_tomorrow").length, 1);
});

test("running the evening job twice the same day sends nothing the second time", async () => {
  const store = eveningStore();
  const onesignal = fakeOneSignal();
  await runDailyReminders({ store, onesignal, loadActivity: async () => activity, automations, now: EVENING });
  store.state.clock = new Date("2026-09-24T19:30:00Z");
  const second = await runDailyReminders({
    store, onesignal, loadActivity: async () => activity, automations, now: new Date("2026-09-24T19:30:00Z"),
  });
  assert.equal(onesignal.calls.length, 2);
  assert.equal(second.sent, 0);
  assert.equal(second.skipped.already_sent, 2);
});

test("a reminder switched off in the admin is counted, not sent", async () => {
  const store = eveningStore();
  const onesignal = fakeOneSignal();
  const off = { ...automations, streak_at_risk: { ...automations.streak_at_risk, enabled: false } };
  const summary = await runDailyReminders({ store, onesignal, loadActivity: async () => activity, automations: off, now: EVENING });
  assert.deepEqual(onesignal.calls.flatMap((call) => call.externalIds), [id(5)]);
  assert.equal(summary.excluded.disabled, 2);
});

test("« who would receive tonight » is a dry run that names members, without sending", async () => {
  const store = eveningStore();
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

test("a registry that cannot be read stops the run: never a nudge sent blind", async () => {
  const store = eveningStore();
  store.history = async () => { throw new NotifyError("history_failed"); };
  const onesignal = fakeOneSignal();
  await assert.rejects(runDailyReminders({ store, onesignal, loadActivity: async () => activity, automations, now: EVENING }));
  assert.equal(onesignal.calls.length, 0);
});

// ── Demandes d'ami ─────────────────────────────────────────────────────────
const NOW = new Date("2026-09-24T12:00:00Z");
const friendship = { id: id(90), requester: id(1), addressee: id(2), status: "pending", created_at: "2026-09-24T11:59:00Z" };
const friendDeps = (store, onesignal, extra = {}) => ({
  store, onesignal, automations, now: NOW, friendshipId: friendship.id,
  loadFriendship: async () => friendship,
  loadProfile: async () => ({ pseudo: "lea", first_name: "Léa", locked: false }),
  ...extra,
});

test("a friend request push names the author, but the registry keeps only the template", async () => {
  const store = fakeStore({ [id(2)]: {} });
  const onesignal = fakeOneSignal();
  const result = await notifyFriendRequest(friendDeps(store, onesignal));
  assert.equal(result.status, "sent");
  assert.equal(onesignal.calls[0].title.fr, "Léa veut t'ajouter 👋");
  assert.equal(onesignal.calls[0].title.en, "Léa wants to add you 👋");
  assert.equal(onesignal.calls[0].body.fr, "Tu as reçu une nouvelle demande d'ami.");
  assert.equal(onesignal.calls[0].url, "/messages?tab=relations");
  assert.equal(store.state.sends[0].title.fr, "{name} veut t'ajouter 👋");
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
  const tooMany = await notifyFriendRequest(friendDeps(fakeStore({ [id(2)]: { recent_social: 20 } }), onesignal));
  assert.equal(tooMany.status, "skipped");
  assert.equal(onesignal.calls.length, 0);
});

// ── Demande acceptée ───────────────────────────────────────────────────────
const accepted = { id: id(91), requester: id(1), addressee: id(2), status: "accepted", created_at: "2026-09-20T10:00:00Z", accepted_at: "2026-09-24T11:59:30Z" };
const acceptedDeps = (store, onesignal, extra = {}) => ({
  store, onesignal, automations, now: NOW, friendshipId: accepted.id,
  loadFriendship: async () => accepted,
  loadProfile: async (userId) => (userId === id(2) ? { pseudo: "tom", first_name: "Tom", locked: false } : null),
  ...extra,
});

test("an accepted request notifies the person who sent it — exactly once", async () => {
  const store = fakeStore({ [id(1)]: {} });
  const onesignal = fakeOneSignal();
  const result = await notifyFriendAccepted(acceptedDeps(store, onesignal));
  assert.equal(result.status, "sent");
  assert.deepEqual(onesignal.calls[0].externalIds, [id(1)]);
  assert.equal(onesignal.calls[0].title.fr, "Tom a accepté ta demande 🤝");
  assert.equal(onesignal.calls[0].title.en, "Tom accepted your request 🤝");
  assert.equal(onesignal.calls[0].body.fr, "Vous êtes maintenant amis sur BLOCUS TRACKER.");
  assert.equal(onesignal.calls[0].url, `/messages?profile=${id(2)}`);
  assert.equal(store.state.sends[0].url, "/messages");
  assert.equal(store.state.audienceCalls[0].actorId, id(2));
  // Le même événement relu (nouvel essai réseau, double appel) : jamais deux fois.
  const again = await notifyFriendAccepted(acceptedDeps(store, onesignal, { now: new Date("2026-09-24T12:05:00Z") }));
  assert.equal(again.status, "skipped");
  assert.equal(onesignal.calls.length, 1);
});

test("no accepted push for a request still pending, an old acceptance, a block or a suspended account", async () => {
  const onesignal = fakeOneSignal();
  const pending = await notifyFriendAccepted(acceptedDeps(fakeStore({ [id(1)]: {} }), onesignal, {
    loadFriendship: async () => ({ ...accepted, status: "pending" }),
  }));
  assert.equal(pending.reason, "not_accepted");
  const old = await notifyFriendAccepted(acceptedDeps(fakeStore({ [id(1)]: {} }), onesignal, {
    loadFriendship: async () => ({ ...accepted, accepted_at: "2026-09-23T10:00:00Z" }),
  }));
  assert.equal(old.reason, "stale");
  for (const reason of ["blocked", "category_off", "general_off", "suspended"]) {
    const result = await notifyFriendAccepted(acceptedDeps(fakeStore({ [id(1)]: { reason } }), onesignal));
    assert.equal(result.status, "skipped", reason);
  }
  const suspendedActor = await notifyFriendAccepted(acceptedDeps(fakeStore({ [id(1)]: {} }), onesignal, {
    loadProfile: async () => ({ pseudo: "tom", first_name: "Tom", locked: true }),
  }));
  assert.equal(suspendedActor.reason, "actor_unavailable");
  assert.equal(onesignal.calls.length, 0);
});

// ── Messages privés ────────────────────────────────────────────────────────
const SECRET = "rendez-vous à 14 h, code 4242";
const message = (n, createdAt) => ({ id: id(100 + n), sender_id: id(1), receiver_id: id(2), created_at: createdAt, content: SECRET });
const messageDeps = (store, onesignal, msg, extra = {}) => ({
  store, onesignal, automations, now: new Date(msg.created_at), messageId: msg.id,
  loadMessage: async () => msg,
  loadProfile: async () => ({ pseudo: "lea", first_name: "Léa", locked: false }),
  ...extra,
});
const messageStore = (rows = { [id(2)]: {} }) => fakeStore(rows);

test("a private message notifies the receiver, without its content anywhere", async () => {
  const store = messageStore();
  const onesignal = fakeOneSignal();
  const first = message(1, "2026-09-24T12:00:00Z");
  store.state.clock = new Date(first.created_at);
  const result = await notifyPrivateMessage(messageDeps(store, onesignal, first));
  assert.equal(result.status, "sent");
  assert.deepEqual(onesignal.calls[0].externalIds, [id(2)]);
  assert.equal(onesignal.calls[0].title.fr, "Léa t'a envoyé un message 💬");
  assert.equal(onesignal.calls[0].title.en, "Léa sent you a message 💬");
  assert.equal(onesignal.calls[0].body.en, "Open BLOCUS TRACKER to reply.");
  assert.equal(onesignal.calls[0].url, `/messages?dm=${id(1)}`);
  // Ni le texte, ni le prénom dans le registre ; ni le texte dans la notification.
  assert.equal(JSON.stringify(store.state).includes(SECRET), false);
  assert.equal(JSON.stringify(store.state.sends).includes("Léa"), false);
  assert.equal(JSON.stringify(onesignal.calls).includes(SECRET), false);
  assert.equal(store.state.sends[0].title.fr, "{name} t'a envoyé un message 💬");
  assert.equal(store.state.sends[0].url, "/messages");
});

test("several messages close together ring once; after 10 minutes, again", async () => {
  const store = messageStore();
  const onesignal = fakeOneSignal();
  const send = async (n, time) => {
    const msg = message(n, time);
    store.state.clock = new Date(time);
    return notifyPrivateMessage(messageDeps(store, onesignal, msg));
  };
  assert.equal((await send(1, "2026-09-24T12:00:00Z")).status, "sent");
  assert.equal((await send(2, "2026-09-24T12:01:00Z")).reason, "cooldown");
  assert.equal((await send(3, "2026-09-24T12:08:00Z")).reason, "cooldown");
  assert.equal((await send(4, "2026-09-24T12:11:00Z")).status, "sent");
  assert.equal(onesignal.calls.length, 2);
  // Une autre conversation n'est pas freinée par celle-ci.
  const other = { ...message(5, "2026-09-24T12:11:30Z"), sender_id: id(3) };
  store.state.clock = new Date(other.created_at);
  assert.equal((await notifyPrivateMessage(messageDeps(store, onesignal, other))).status, "sent");
});

test("two messages at the same instant still ring once (anti-duplicate key)", async () => {
  const store = messageStore();
  store.recentRecipientKey = async () => false; // la course : aucun des deux ne voit l'autre
  const onesignal = fakeOneSignal();
  store.state.clock = new Date("2026-09-24T12:00:00Z");
  await notifyPrivateMessage(messageDeps(store, onesignal, message(1, "2026-09-24T12:00:00Z")));
  const twin = await notifyPrivateMessage(messageDeps(store, onesignal, message(2, "2026-09-24T12:00:01Z")));
  assert.equal(twin.status, "skipped");
  assert.equal(onesignal.calls.length, 1);
});

test("no message push with Social off, General off, a suspended account or a block", async () => {
  const onesignal = fakeOneSignal();
  for (const reason of ["category_off", "general_off", "suspended", "blocked"]) {
    const result = await notifyPrivateMessage(messageDeps(messageStore({ [id(2)]: { reason } }), onesignal, message(1, "2026-09-24T12:00:00Z")));
    assert.equal(result.status, "skipped", reason);
  }
  const suspendedSender = await notifyPrivateMessage(messageDeps(messageStore(), onesignal, message(1, "2026-09-24T12:00:00Z"), {
    loadProfile: async () => ({ pseudo: "lea", first_name: "Léa", locked: true }),
  }));
  assert.equal(suspendedSender.reason, "actor_unavailable");
  const toSelf = await notifyPrivateMessage(messageDeps(messageStore(), onesignal, { ...message(1, "2026-09-24T12:00:00Z"), receiver_id: id(1) }));
  assert.equal(toSelf.reason, "invalid");
  const tooMany = await notifyPrivateMessage(messageDeps(messageStore({ [id(2)]: { recent_social: 20 } }), onesignal, message(1, "2026-09-24T12:00:00Z")));
  assert.equal(tooMany.status, "skipped");
  const off = await notifyPrivateMessage(messageDeps(messageStore(), onesignal, message(1, "2026-09-24T12:00:00Z"), {
    automations: { ...automations, private_message: { ...automations.private_message, enabled: false } },
  }));
  assert.equal(off.reason, "disabled");
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
