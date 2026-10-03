import test from "node:test";
import assert from "node:assert/strict";
import { CHAT_GAP_MS, bubblePosition, buildChatThread, chatFullTime, chatTimeLabel, seenReceiptId } from "../lib/chatThread.mjs";

// Heures locales : le test ne dépend pas du fuseau de la machine.
const at = (y, mo, d, h, mi) => new Date(y, mo - 1, d, h, mi).toISOString();
const msg = (id, sender, created_at) => ({ id, sender_id: sender, created_at });

test("one time label per exchange, consecutive messages of one person in one run", () => {
  const items = buildChatThread([
    msg("a", "me", at(2026, 10, 2, 14, 0)),
    msg("b", "me", at(2026, 10, 2, 14, 1)),
    msg("c", "tom", at(2026, 10, 2, 14, 5)),
    msg("d", "tom", at(2026, 10, 2, 14, 29)),
    // 31 minutes later: a new exchange, even from the same person.
    msg("e", "tom", at(2026, 10, 2, 15, 0)),
  ], { viewerId: "me" });
  assert.deepEqual(items.map((item) => (item.type === "time" ? "time" : `${item.authorId}:${item.messages.map((m) => m.id).join("")}`)),
    ["time", "me:ab", "tom:cd", "time", "tom:e"]);
  assert.equal(items[1].mine, true);
  assert.equal(items[2].mine, false);
  assert.equal(items[0].at, items[1].messages[0].created_at);
});

test("a new day starts a new exchange even after a short silence", () => {
  const items = buildChatThread([
    msg("a", "tom", at(2026, 10, 1, 23, 55)),
    msg("b", "tom", at(2026, 10, 2, 0, 5)),
  ], { viewerId: "me" });
  assert.deepEqual(items.map((item) => item.type), ["time", "run", "time", "run"]);
  assert.ok(CHAT_GAP_MS > 10 * 60 * 1000);
});

test("messages are ordered by time, whatever the timestamp spelling", () => {
  const items = buildChatThread([
    msg("late", "me", "2026-10-02T12:00:00+00:00"),
    msg("early", "me", "2026-10-02T11:59:00Z"),
  ], { viewerId: "me" });
  assert.deepEqual(items[1].messages.map((m) => m.id), ["early", "late"]);
});

test("group messages use their own author column", () => {
  const items = buildChatThread([
    { id: "a", user_id: "lina", created_at: at(2026, 10, 2, 9, 0) },
    { id: "b", user_id: "tom", created_at: at(2026, 10, 2, 9, 1) },
  ], { viewerId: "me", authorOf: (m) => m.user_id });
  assert.deepEqual(items.filter((item) => item.type === "run").map((run) => run.authorId), ["lina", "tom"]);
  assert.deepEqual(buildChatThread([]), []);
});

test("« Vu » only under my own last message, once the other person opened it", () => {
  const sent = (id, sender, minute, read) => ({ ...msg(id, sender, at(2026, 10, 2, 14, minute)), read });
  assert.equal(seenReceiptId([sent("a", "tom", 0, true), sent("b", "me", 1, true)], "me"), "b");
  assert.equal(seenReceiptId([sent("a", "tom", 0, true), sent("b", "me", 1, false)], "me"), null, "not opened yet");
  assert.equal(seenReceiptId([sent("a", "me", 0, true), sent("b", "tom", 1, false)], "me"), null, "their reply already says it");
  // A new message of mine, not opened yet: the older « Vu » does not stay.
  assert.equal(seenReceiptId([sent("a", "me", 0, true), sent("b", "me", 1, false)], "me"), null);
  // Order comes from the time, not from the array.
  assert.equal(seenReceiptId([sent("b", "me", 1, true), sent("a", "tom", 0, true)], "me"), "b");
  assert.equal(seenReceiptId([], "me"), null);
  assert.equal(seenReceiptId([sent("a", "me", 0, true)], null), null);
});

test("bubbles joined in a run get their position", () => {
  assert.equal(bubblePosition(0, 1), "single");
  assert.deepEqual([0, 1, 2].map((i) => bubblePosition(i, 3)), ["first", "middle", "last"]);
  assert.deepEqual([0, 1].map((i) => bubblePosition(i, 2)), ["first", "last"]);
});

test("time labels read like a messaging app, in French and English", () => {
  const now = new Date(2026, 9, 2, 16, 0); // jeudi 2 octobre 2026
  const fr = (value) => chatTimeLabel(value, { lang: "fr", now, yesterday: "Hier" });
  const en = (value) => chatTimeLabel(value, { lang: "en", now, yesterday: "Yesterday" });
  assert.equal(fr(at(2026, 10, 2, 14, 32)), "14:32");
  assert.equal(fr(at(2026, 10, 1, 9, 5)), "Hier 09:05");
  assert.equal(en(at(2026, 10, 1, 9, 5)), "Yesterday 09:05");
  assert.equal(fr(at(2026, 9, 27, 21, 17)), "Dim. 21:17");
  assert.equal(en(at(2026, 9, 27, 21, 17)), "Sun 21:17");
  assert.equal(fr(at(2026, 5, 27, 14, 3)), "27 mai, 14:03");
  assert.equal(en(at(2026, 5, 27, 14, 3)), "27 May, 14:03");
  assert.equal(fr(at(2025, 12, 3, 9, 5)), "3 déc. 2025, 09:05");
  assert.equal(en(at(2025, 12, 3, 9, 5)), "3 Dec 2025, 09:05");
  // Horloge de l'appareil un peu en retard : jamais « demain ».
  assert.equal(fr(at(2026, 10, 2, 16, 3)), "16:03");
  assert.equal(fr("not a date"), "");
});

test("the full date is spelled out for the hover hint", () => {
  assert.equal(chatFullTime(at(2026, 9, 27, 21, 17), "fr"), "Dimanche 27 septembre 2026 à 21:17");
  assert.equal(chatFullTime(at(2026, 9, 27, 21, 17), "en"), "Sunday, 27 September 2026 at 21:17");
});
