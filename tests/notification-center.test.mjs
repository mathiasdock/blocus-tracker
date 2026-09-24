// Centre de notifications : la logique de la cloche (lib/notificationCenter.mjs)
// et un faux serveur qui applique les règles de la migration v64
// (lib/offlineNotifications.mjs — le même que le mode hors ligne). Les vraies
// fonctions SQL ont leur propre suite : supabase/tests/notification_center.sql.
import test from "node:test";
import assert from "node:assert/strict";
import {
  announcementText,
  compareItems,
  dayGroups,
  destinationFor,
  fetchInbox,
  fetchSummary,
  isNotificationKey,
  legacyDismissedKeys,
  mergeItems,
  nextCursor,
  normalizeInbox,
  normalizeItem,
  normalizeSummary,
  seenMaps,
  sendMarkAllRead,
  sendMarkRead,
  sentenceKeyFor,
  splitSentence,
  toMillis,
  withAllRead,
  withItemRead,
} from "../lib/notificationCenter.mjs";
import { offlineNotificationRpc } from "../lib/offlineNotifications.mjs";
import { STRINGS } from "../lib/i18n.js";

const ids = Object.fromEntries(
  ["me", "lea", "tom", "sam", "locked", "blocked", "other", "post", "otherPost", "req", "reqLocked", "reqBlocked",
    "acc", "comment", "commentBlocked", "like", "ann", "annDraft", "annOtherSchool", "group"]
    .map((name, i) => [name, `00000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`]),
);
const T0 = Date.parse("2026-09-24T15:00:00.000Z");
const ago = (minutes, from = T0) => new Date(from - minutes * 60000).toISOString();

function seedDb() {
  const profile = (id, first_name, extra = {}) => ({ id, pseudo: first_name.toLowerCase(), first_name, last_name: null, avatar_url: null, email: `${first_name}@secret.test`, locked: false, ...extra });
  return {
    profiles: [
      profile(ids.me, "Moi", { university: "ICHEC" }), profile(ids.lea, "Léa"), profile(ids.tom, "Tom"), profile(ids.sam, "Sam"),
      profile(ids.locked, "Suspendu", { locked: true }), profile(ids.blocked, "Bloqué"), profile(ids.other, "Autre"),
    ],
    user_blocks: [{ blocker_id: ids.me, blocked_id: ids.blocked }],
    friendships: [
      { id: ids.req, requester: ids.lea, addressee: ids.me, status: "pending", created_at: ago(8) },
      { id: ids.reqLocked, requester: ids.locked, addressee: ids.me, status: "pending", created_at: ago(9) },
      { id: ids.reqBlocked, requester: ids.blocked, addressee: ids.me, status: "pending", created_at: ago(9) },
      { id: ids.acc, requester: ids.me, addressee: ids.tom, status: "accepted", created_at: ago(60 * 24 * 3), accepted_at: ago(20) },
    ],
    private_messages: [
      { id: "m1", sender_id: ids.lea, receiver_id: ids.me, content: "SECRET-1", read: false, created_at: ago(5) },
      { id: "m2", sender_id: ids.lea, receiver_id: ids.me, content: "SECRET-2", read: false, created_at: ago(2) },
      { id: "m3", sender_id: ids.sam, receiver_id: ids.me, content: "SECRET-3", read: true, created_at: ago(60 * 24) },
      { id: "m4", sender_id: ids.blocked, receiver_id: ids.me, content: "SECRET-4", read: false, created_at: ago(1) },
    ],
    posts: [{ id: ids.post, user_id: ids.me, created_at: ago(120) }, { id: ids.otherPost, user_id: ids.lea, created_at: ago(120) }],
    comments: [
      { id: ids.comment, post_id: ids.post, user_id: ids.lea, content: "Bravo   pour\nta session !", created_at: ago(30) },
      { id: ids.commentBlocked, post_id: ids.post, user_id: ids.blocked, content: "non", created_at: ago(30) },
      { id: "c-own", post_id: ids.post, user_id: ids.me, content: "moi", created_at: ago(29) },
      { id: "c-other", post_id: ids.otherPost, user_id: ids.tom, content: "pas pour moi", created_at: ago(29) },
    ],
    likes: [
      { id: ids.like, post_id: ids.post, user_id: ids.tom, emoji: "👍", created_at: ago(40) },
      { id: "l-locked", post_id: ids.post, user_id: ids.locked, emoji: "👍", created_at: ago(40) },
    ],
    app_announcements: [
      { id: ids.ann, title: "Nouveau planning", message: "Texte", title_en: "New planner", message_en: "Text", type: "new", href: "/planning", is_active: true, created_at: ago(180) },
      { id: ids.annDraft, title: "Brouillon", message: "x", type: "info", is_active: false, created_at: ago(60) },
      { id: ids.annOtherSchool, title: "Autre école", message: "x", type: "info", is_active: true, audience: "university", audience_university: "ULB", created_at: ago(60) },
    ],
    course_room_members: [],
    community_messages: [],
    group_members: [{ group_id: ids.group, user_id: ids.me }, { group_id: ids.group, user_id: ids.lea }],
    group_messages: [
      { group_id: ids.group, user_id: ids.lea, content: "g1", created_at: ago(10) },
      { group_id: ids.group, user_id: ids.lea, content: "g2", created_at: ago(1) },
      { group_id: ids.group, user_id: ids.me, content: "g3", created_at: ago(1) },
    ],
  };
}

// Un « appareil » : son propre appel réseau, la même base, la même horloge.
function device(db, uid, clock) {
  return (name, params) => Promise.resolve(offlineNotificationRpc(db, name, params, uid, clock.now));
}

const PERSONAL = new Set(["friend_request", "friend_accepted", "private_message", "comment", "reaction"]);

test("the bell lists exactly the member's own notifications, hidden actors excluded", async () => {
  const db = seedDb();
  const inbox = await fetchInbox(device(db, ids.me, { now: T0 }));
  assert.deepEqual(inbox.items.map((item) => item.key).sort(), [
    `announcement:${ids.ann}`, `comment:${ids.comment}`, `friend_accepted:${ids.acc}`, `friend_request:${ids.req}`,
    `private_message:${ids.lea}`, `private_message:${ids.sam}`, `reaction:${ids.like}`,
  ].sort());
  // Nouveau d'abord.
  assert.equal(inbox.items[0].key, `private_message:${ids.lea}`);
  assert.equal(inbox.hasMore, false);
});

test("unread: everything new is unread, a conversation already read in Messages is not", async () => {
  const db = seedDb();
  const inbox = await fetchInbox(device(db, ids.me, { now: T0 }));
  assert.equal(inbox.unread, 6);
  assert.equal(inbox.items.find((item) => item.key === `private_message:${ids.sam}`).read, true);
  const lea = inbox.items.find((item) => item.key === `private_message:${ids.lea}`);
  assert.equal(lea.read, false);
  assert.equal(lea.count, 2);
});

test("private message: grouped per sender, never the text, never an e-mail", async () => {
  const db = seedDb();
  const { data } = offlineNotificationRpc(db, "notification_inbox", { p_limit: 20 }, ids.me, T0);
  const raw = JSON.stringify(data);
  assert.ok(!raw.includes("SECRET"), "a message text reached the bell");
  const inbox = normalizeInbox({ ...data, items: data.items.map((item) => (item.actor ? { ...item, actor: { ...item.actor, email: "x@y.z" } } : item)) });
  assert.ok(inbox.items.every((item) => !item.actor || !("email" in item.actor)), "an e-mail survived normalisation");
});

test("mark as read lowers the counter at once, and the server keeps it", async () => {
  const db = seedDb();
  const clock = { now: T0 };
  const phone = device(db, ids.me, clock);
  let state = await fetchInbox(phone);
  const key = `comment:${ids.comment}`;
  state = withItemRead(state, key);
  assert.equal(state.unread, 5);
  assert.equal(state.items.find((item) => item.key === key).read, true);
  assert.equal(withItemRead(state, key), state, "reading twice changes nothing");
  assert.equal(await sendMarkRead(phone, key), true);
  assert.equal((await fetchInbox(phone)).unread, 5);
});

test("sync: read on the phone is read on the computer, and mark-all works across devices", async () => {
  const db = seedDb();
  const clock = { now: T0 };
  const phone = device(db, ids.me, clock);
  const laptop = device(db, ids.me, clock);

  await sendMarkRead(phone, `friend_request:${ids.req}`);
  clock.now += 1000;
  const onLaptop = await fetchInbox(laptop);
  assert.equal(onLaptop.items.find((item) => item.key === `friend_request:${ids.req}`).read, true);
  assert.equal(onLaptop.unread, 5);

  await sendMarkAllRead(laptop);
  clock.now += 1000;
  const summary = await fetchSummary(phone);
  assert.equal(summary.bell, 0);
  assert.equal((await fetchInbox(phone)).items.every((item) => item.read), true);
});

test("a new notification after mark-all is unread; a new message relights its conversation", async () => {
  const db = seedDb();
  const clock = { now: T0 };
  const phone = device(db, ids.me, clock);
  await sendMarkAllRead(phone);

  clock.now = T0 + 60000;
  db.likes.push({ id: "00000000-0000-4000-8000-0000000000aa", post_id: ids.post, user_id: ids.lea, emoji: "👍", created_at: new Date(clock.now).toISOString() });
  db.private_messages.push({ id: "m5", sender_id: ids.lea, receiver_id: ids.me, content: "SECRET-5", read: false, created_at: new Date(clock.now).toISOString() });
  const inbox = await fetchInbox(phone);
  assert.equal(inbox.unread, 2);
  assert.equal(inbox.items.find((item) => item.key === `private_message:${ids.lea}`).read, false);
  assert.equal((await fetchSummary(phone)).bell, 2);
});

test("mark all as read clears every row and the counter, optimistically", () => {
  const state = normalizeInbox({
    unread: 2, has_more: false,
    items: [
      { key: `comment:${ids.comment}`, kind: "comment", at: ago(1), read: false, target: ids.post, actor: { id: ids.lea } },
      { key: `reaction:${ids.like}`, kind: "reaction", at: ago(2), read: false, target: ids.post, actor: { id: ids.tom } },
    ],
  });
  const cleared = withAllRead(state);
  assert.equal(cleared.unread, 0);
  assert.ok(cleared.items.every((item) => item.read));
  assert.equal(withAllRead(cleared), cleared);
});

test("another member sees none of it and cannot touch it", async () => {
  const db = seedDb();
  const stranger = device(db, ids.other, { now: T0 });
  const inbox = await fetchInbox(stranger);
  assert.equal(inbox.items.filter((item) => PERSONAL.has(item.kind)).length, 0);
  assert.equal(await sendMarkRead(stranger, `comment:${ids.comment}`), false);
  assert.equal((db.notification_reads || []).length, 0);
  assert.equal(await sendMarkRead(stranger, "comment:../../etc"), false, "an invalid key never reaches the server");
  const refused = offlineNotificationRpc(db, "notification_mark_read", { p_key: "comment:../../etc" }, ids.other, T0);
  assert.equal(refused.error?.code, "22023", "and the server refuses it too");
});

test("empty state: nothing to show is an empty, well-formed inbox", async () => {
  const db = { profiles: [{ id: ids.other, pseudo: "autre" }] };
  const inbox = await fetchInbox(device(db, ids.other, { now: T0 }));
  assert.deepEqual(inbox, { items: [], unread: 0, hasMore: false });
  assert.deepEqual(dayGroups(inbox.items), []);
  assert.deepEqual(normalizeInbox(null), { items: [], unread: 0, hasMore: false });
});

test("pagination: pages follow each other without overlap", async () => {
  const db = seedDb();
  const phone = (name, params) => Promise.resolve(offlineNotificationRpc(db, name, { ...params, p_limit: 3 }, ids.me, T0));
  const first = await fetchInbox(phone);
  assert.equal(first.items.length, 3);
  assert.equal(first.hasMore, true);
  const second = await fetchInbox(phone, nextCursor(first.items));
  assert.ok(second.items.every((item) => !first.items.some((seen) => seen.key === item.key)));
  assert.ok(second.items[0].atMs <= first.items[2].atMs);
  const merged = mergeItems(first.items, second.items);
  assert.equal(merged.length, first.items.length + second.items.length);
  assert.deepEqual([...merged].sort(compareItems), merged);
});

test("click → destination, for every kind", () => {
  const item = (kind, extra = {}) => normalizeItem({ key: `${kind}:${ids.req}`, kind, at: ago(1), target: ids.lea, actor: { id: ids.lea }, ...extra });
  assert.equal(destinationFor(item("friend_request")), "/messages?tab=relations");
  assert.equal(destinationFor(item("friend_accepted")), `/messages?profile=${ids.lea}`);
  assert.equal(destinationFor(item("private_message")), `/messages?dm=${ids.lea}`);
  assert.equal(destinationFor(item("comment", { target: ids.post })), `/feed?post=${ids.post}`);
  assert.equal(destinationFor(item("reaction", { target: ids.post })), `/feed?post=${ids.post}`);
  const ann = (href) => normalizeItem({ key: `announcement:${ids.ann}`, kind: "announcement", at: ago(1), announcement: { title: "A", href } });
  assert.equal(destinationFor(ann("/planning")), "/planning");
});

test("deleted or invalid destination: nearest page, or nowhere — never a crash", async () => {
  const noTarget = (kind) => normalizeItem({ key: `${kind}:${ids.req}`, kind, at: ago(1), target: "not-a-uuid" });
  assert.equal(destinationFor(noTarget("friend_accepted")), "/messages");
  assert.equal(destinationFor(noTarget("private_message")), "/messages");
  assert.equal(destinationFor(noTarget("comment")), "/feed");
  const ann = (href) => normalizeItem({ key: `announcement:${ids.ann}`, kind: "announcement", at: ago(1), announcement: { title: "A", href } });
  for (const unsafe of ["https://evil.test", "//evil.test", "/api/admin", "javascript:alert(1)", "", null]) {
    assert.equal(destinationFor(ann(unsafe)), null, `announcement href ${unsafe} must lead nowhere`);
  }
  assert.equal(destinationFor(null), null);

  // Le commentaire disparaît (supprimé) : la ligne disparaît, sa lecture est refusée.
  const db = seedDb();
  const phone = device(db, ids.me, { now: T0 });
  db.comments = db.comments.filter((comment) => comment.id !== ids.comment);
  const inbox = await fetchInbox(phone);
  assert.ok(!inbox.items.some((item) => item.key === `comment:${ids.comment}`));
  assert.equal(await sendMarkRead(phone, `comment:${ids.comment}`), false);
});

test("friend request, accepted request, message, comment, reaction: the right sentence", () => {
  const fr = STRINGS.fr;
  const en = STRINGS.en;
  const cases = [
    ["friend_request", 0, "Léa veut t’ajouter", "Léa wants to add you"],
    ["friend_accepted", 0, "Léa a accepté ta demande", "Léa accepted your request"],
    ["private_message", 1, "Léa t’a envoyé un message", "Léa sent you a message"],
    ["private_message", 3, "Léa t’a envoyé 3 messages", "Léa sent you 3 messages"],
    ["comment", 0, "Léa a commenté ta publication", "Léa commented on your post"],
    ["reaction", 0, "Léa a réagi à ta publication", "Léa reacted to your post"],
  ];
  for (const [kind, count, frText, enText] of cases) {
    const key = sentenceKeyFor({ kind, count });
    const render = (table) => splitSentence(table[key], "Léa", count).map((part) => part.text).join("");
    assert.equal(render(fr), frText);
    assert.equal(render(en), enText);
    const strong = splitSentence(fr[key], "Léa", count).filter((part) => part.strong);
    assert.deepEqual(strong.map((part) => part.text), ["Léa"], "only the name is emphasised");
  }
});

test("announcement: its own language when written, French otherwise; unsafe links dropped", () => {
  const item = normalizeItem({
    key: `announcement:${ids.ann}`, kind: "announcement", at: ago(1),
    announcement: { title: "Titre", message: "Texte", title_en: "Title", message_en: null, type: "weird", href: "https://x.test" },
  });
  assert.deepEqual(announcementText(item, "en"), { title: "Title", body: "Texte" });
  assert.deepEqual(announcementText(item, "fr"), { title: "Titre", body: "Texte" });
  assert.equal(item.announcement.type, "info");
  assert.equal(item.announcement.href, null);
  assert.equal(normalizeItem({ key: `announcement:${ids.ann}`, kind: "announcement", at: ago(1), announcement: {} }), null);
});

test("normalisation refuses malformed rows and keeps exact server timestamps", () => {
  assert.equal(normalizeItem({ key: `comment:${ids.comment}`, kind: "reaction", at: ago(1) }), null, "kind must match key");
  assert.equal(normalizeItem({ key: "comment:123", kind: "comment", at: ago(1) }), null);
  assert.equal(normalizeItem({ key: `comment:${ids.comment}`, kind: "comment", at: "hier" }), null);
  assert.equal(normalizeItem({ key: `xp:${ids.comment}`, kind: "xp", at: ago(1) }), null, "no XP, badge or mission rows");
  const micro = "2026-09-24T14:58:00.123456+00:00";
  const item = normalizeItem({ key: `comment:${ids.comment}`, kind: "comment", at: micro, excerpt: "  hello  " });
  assert.equal(item.at, micro, "the cursor keeps the microseconds");
  assert.equal(item.atMs, Date.parse("2026-09-24T14:58:00.123Z"));
  assert.equal(item.excerpt, "hello");
  assert.equal(normalizeItem({ key: `reaction:${ids.like}`, kind: "reaction", at: ago(1), excerpt: "x" }).excerpt, null);
  assert.ok(Number.isNaN(toMillis(null)));
  assert.ok(isNotificationKey(`announcement:${ids.ann}`));
  assert.ok(!isNotificationKey(`announcement:${ids.ann} `));
});

test("Aujourd'hui / Plus tôt follow the local calendar day", () => {
  const now = new Date(2026, 8, 24, 10, 0, 0);
  const at = (d) => d.toISOString();
  const rows = [
    normalizeItem({ key: `comment:${ids.comment}`, kind: "comment", at: at(new Date(2026, 8, 24, 0, 5)) }),
    normalizeItem({ key: `reaction:${ids.like}`, kind: "reaction", at: at(new Date(2026, 8, 23, 23, 55)) }),
  ];
  const groups = dayGroups(rows, now);
  assert.deepEqual(groups.map((group) => [group.id, group.items.length]), [["today", 1], ["earlier", 1]]);
  assert.deepEqual(dayGroups([rows[1]], now).map((group) => group.id), ["earlier"]);
});

test("navigation counters come from one read, with the device's last-seen dates", async () => {
  const db = seedDb();
  const phone = device(db, ids.me, { now: T0 });
  const { rooms, groups } = seenMaps([
    [`group_${ids.group}`, ago(5)],
    ["group_not-a-uuid", ago(5)],
    [`room_${ids.post}`, "pas une date"],
    ["feed", ago(5)],
  ]);
  assert.deepEqual(rooms, {});
  assert.deepEqual(Object.keys(groups), [ids.group]);
  const summary = await fetchSummary(phone, { feedSince: null, rooms, groups });
  assert.equal(summary.bell, 6);
  assert.equal(summary.messages, 3, "raw unread messages, as before");
  assert.equal(summary.friends, 3, "raw pending requests, as before");
  assert.equal(summary.feed, null);
  assert.deepEqual(summary.groups, [{ id: ids.group, unread: 1, seen: true }]);
  assert.equal(normalizeSummary(null), null);
});

test("the old per-device dismissals become account reads (announcements only)", () => {
  assert.deepEqual(legacyDismissedKeys(JSON.stringify(["referral-links-v1", ids.ann, ids.ann])), [`announcement:${ids.ann}`]);
  assert.deepEqual(legacyDismissedKeys("{broken"), []);
  assert.deepEqual(legacyDismissedKeys(null), []);
});

test("every text the bell shows exists in French and in English", () => {
  const keys = [
    "notif.title", "notif.empty", "notif.emptyHint", "notif.someone", "notif.friendRequest", "notif.friendAccepted",
    "notif.message", "notif.messages", "notif.commentedPost", "notif.reactedPost", "notif.markAllRead",
    "notif.unreadOne", "notif.unreadMany", "notif.unread", "notif.earlier", "notif.loadMore", "notif.loading",
    "notif.loadError", "notif.retry", "common.today", "common.close", "nav.notifications",
  ];
  for (const lang of ["fr", "en"]) {
    for (const key of keys) assert.ok(STRINGS[lang][key], `${lang}:${key} is missing`);
    for (const key of ["notif.friendRequest", "notif.friendAccepted", "notif.message", "notif.messages", "notif.commentedPost", "notif.reactedPost"]) {
      assert.ok(STRINGS[lang][key].includes("{name}"), `${lang}:${key} must place the name`);
    }
    assert.ok(!("notif.productReferral" in STRINGS[lang]), "the hard-coded referral announcement is gone");
  }
});
