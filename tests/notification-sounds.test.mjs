import test from "node:test";
import assert from "node:assert/strict";
import { createNotificationSoundTracker } from "../lib/notificationSounds.mjs";

const item = (kind, atMs, extra = {}) => ({ key: `${kind}:a`, kind, atMs, read: false, ...extra });

test("initial unread notifications are a silent baseline", () => {
  const tracker = createNotificationSoundTracker();
  assert.equal(tracker.observe([item("friend_request", 100)]), false);
  assert.equal(tracker.observe([item("friend_request", 100)]), false);
});

test("received requests and acceptances can each sound once", () => {
  const tracker = createNotificationSoundTracker(); tracker.observe([]);
  const request = item("friend_request", 100), accepted = item("friend_accepted", 200);
  assert.equal(tracker.observe([request]), true);
  assert.equal(tracker.observe([request]), false);
  assert.equal(tracker.observe([accepted, request]), true);
  assert.equal(tracker.observe([accepted, request]), false);
});

test("minor reactions and informational announcements are always silent", () => {
  const tracker = createNotificationSoundTracker(); tracker.observe([]);
  assert.equal(tracker.observe([item("reaction", 100), item("announcement", 200, { announcement: { type: "info" } })]), false);
  assert.equal(tracker.observe([item("announcement", 300, { announcement: { type: "important" } })]), true);
});

test("Realtime DM and grouped inbox DM have the same dedup identity", () => {
  const tracker = createNotificationSoundTracker(); tracker.observe([]);
  const created_at = "2026-10-06T12:00:00.123456+00:00";
  const dm = item("private_message", Date.parse("2026-10-06T12:00:00.123Z"), { key: "private_message:sender" });
  assert.equal(tracker.noteMessage({ sender_id: "sender", created_at }), true);
  assert.equal(tracker.noteMessage({ sender_id: "sender", created_at }), false);
  assert.equal(tracker.observe([dm]), false);
  assert.equal(tracker.observe([{ ...dm, atMs: dm.atMs + 1000 }]), true);
});

test("DM first seen by polling is not sounded again by Realtime", () => {
  const tracker = createNotificationSoundTracker(); tracker.observe([]);
  const created_at = "2026-10-06T12:00:00Z";
  assert.equal(tracker.observe([item("private_message", Date.parse(created_at), { key: "private_message:sender" })]), true);
  assert.equal(tracker.noteMessage({ sender_id: "sender", created_at }), false);
});

test("older entries resurfacing from pagination never replay", () => {
  const tracker = createNotificationSoundTracker(); tracker.observe([item("reaction", 200)]);
  assert.equal(tracker.observe([item("friend_accepted", 100)]), false);
  assert.equal(tracker.observe([item("friend_request", 300)]), true);
});

test("read notifications and observations consumed while silent cannot replay", () => {
  const tracker = createNotificationSoundTracker(); tracker.observe([]);
  assert.equal(tracker.observe([item("friend_request", 100, { read: true })]), false);
  assert.equal(tracker.observe([item("friend_request", 100)]), false);
  tracker.noteMessage({ sender_id: "sender", created_at: "2026-10-06T12:00:00Z" });
  assert.equal(tracker.observe([item("private_message", Date.parse("2026-10-06T12:00:00Z"), { key: "private_message:sender" })]), false);
});

test("tracker is bounded and malformed Realtime payloads are silent", () => {
  const tracker = createNotificationSoundTracker(); tracker.observe([]);
  for (let n = 1; n <= 400; n++) tracker.observe([item("reaction", n, { key: `reaction:${n}` })]);
  assert.equal(tracker.observe([item("friend_request", 1)]), false);
  assert.equal(tracker.noteMessage(null), false);
  assert.equal(tracker.noteMessage({ sender_id: "sender", created_at: "invalid" }), false);
});
