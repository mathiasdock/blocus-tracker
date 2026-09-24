import test from "node:test";
import assert from "node:assert/strict";
import {
  CAP_EXEMPT_KINDS, PUSH_BODY_MAX, PUSH_TITLE_MAX, announcementPushContent, announcementWindowState,
  bilingual, fillVars, friendRequestKey, friendRequestVerdict, friendshipIdFromWebhook, isCappedReminder,
  isQuietHour, localCalendar, nextDailyRun, normalizeCap, nudgeKindFor, parseAdminTarget, planReminders,
  reminderKey, summarizeAudience, validateAnnouncement, validatePushContent, validateSchedule, writtenLanguages,
} from "../lib/notificationRules.mjs";

const EVENING = new Date("2026-09-24T18:00:00Z"); // 20:00 à Bruxelles (heure d'été)
const A = "00000000-0000-4000-8000-00000000000a";
const B = "00000000-0000-4000-8000-00000000000b";
const C = "00000000-0000-4000-8000-00000000000c";
const D = "00000000-0000-4000-8000-00000000000d";
const E = "00000000-0000-4000-8000-00000000000e";

test("English falls back to French, and OneSignal always gets an English text", () => {
  assert.deepEqual(bilingual({ fr: "  Bonjour   à tous ", en: "" }, 60), { fr: "Bonjour à tous", en: "Bonjour à tous" });
  assert.deepEqual(bilingual({ fr: "Salut", en: "Hi" }, 60), { fr: "Salut", en: "Hi" });
  assert.deepEqual(writtenLanguages({ fr: "Salut", en: " " }), ["fr"]);
  assert.deepEqual(writtenLanguages({ fr: "Salut", en: "Hi" }), ["fr", "en"]);
  assert.deepEqual(fillVars({ fr: "{name} t'écrit", en: "" }, { name: "Léa" }), { fr: "Léa t'écrit", en: "Léa t'écrit" });
});

test("admin push content: French required, English complete or absent, internal link only", () => {
  assert.deepEqual(validatePushContent({ titleFr: "", bodyFr: "x" }), { ok: false, error: "title_required" });
  assert.deepEqual(validatePushContent({ titleFr: "T", bodyFr: "B", titleEn: "T", bodyEn: "" }), { ok: false, error: "english_incomplete" });
  assert.deepEqual(validatePushContent({ titleFr: "T", bodyFr: "B", url: "https://evil.example" }), { ok: false, error: "invalid_link" });
  assert.deepEqual(validatePushContent({ titleFr: "T", bodyFr: "B", url: "//evil.example" }), { ok: false, error: "invalid_link" });
  const fr = validatePushContent({ titleFr: "Titre", bodyFr: "Texte", url: "/planning" });
  assert.equal(fr.ok, true);
  assert.deepEqual(fr.content.title, { fr: "Titre", en: "Titre" });
  assert.deepEqual(fr.langs, ["fr"]);
  const both = validatePushContent({ titleFr: "Titre", bodyFr: "Texte", titleEn: "Title", bodyEn: "Text" });
  assert.deepEqual(both.content.body, { fr: "Texte", en: "Text" });
  assert.deepEqual(both.langs, ["fr", "en"]);
  const long = validatePushContent({ titleFr: "x".repeat(200), bodyFr: "y".repeat(400) });
  assert.equal(long.content.title.fr.length, PUSH_TITLE_MAX);
  assert.equal(long.content.body.fr.length, PUSH_BODY_MAX);
});

test("a schedule is now, or between one minute and 90 days", () => {
  const now = Date.parse("2026-09-24T10:00:00Z");
  assert.deepEqual(validateSchedule("", now), { ok: true, sendAfter: null });
  assert.equal(validateSchedule("n'importe quoi", now).error, "invalid_date");
  assert.equal(validateSchedule("2026-09-24T10:00:30Z", now).error, "date_too_soon");
  assert.equal(validateSchedule("2027-01-30T10:00:00Z", now).error, "date_too_far");
  assert.equal(validateSchedule("2026-09-25T08:00:00Z", now).sendAfter, "2026-09-25T08:00:00.000Z");
});

test("admin targets are accounts, never a OneSignal segment", () => {
  assert.deepEqual(parseAdminTarget({ type: "all" }), { ok: true, target: { type: "all" } });
  assert.deepEqual(parseAdminTarget({ type: "university", university: "  ICHEC  " }), { ok: true, target: { type: "university", university: "ICHEC" } });
  assert.equal(parseAdminTarget({ type: "university" }).error, "invalid_target");
  assert.deepEqual(parseAdminTarget({ type: "users", userIds: [A, A, "../admin", B] }).target.userIds, [A, B]);
  assert.equal(parseAdminTarget({ type: "users", userIds: ["x"] }).error, "empty_target");
  assert.equal(parseAdminTarget({ type: "segment", segment: "Total Subscriptions" }).error, "invalid_target");
});

test("each member's day and hour come from their own time zone", () => {
  const brussels = localCalendar(EVENING, "Europe/Brussels");
  assert.equal(brussels.today, "2026-09-24");
  assert.equal(brussels.tomorrow, "2026-09-25");
  assert.equal(brussels.hour, 20);
  const newYork = localCalendar(EVENING, "America/New_York");
  assert.equal(newYork.today, "2026-09-24");
  assert.equal(newYork.hour, 14);
  const hongKong = localCalendar(EVENING, "Asia/Hong_Kong");
  assert.equal(hongKong.today, "2026-09-25");
  assert.equal(hongKong.hour, 2);
  assert.equal(isQuietHour(hongKong.hour), true);
  assert.equal(isQuietHour(brussels.hour), false);
  // Fuseau inconnu : Bruxelles, jamais une erreur.
  assert.equal(localCalendar(EVENING, "Mars/Olympus").timeZone, "Europe/Brussels");
  // Changement d'heure : le calendrier suit les dates, pas des blocs de 24 h.
  assert.equal(localCalendar(new Date("2026-10-25T18:00:00Z"), "Europe/Brussels").yesterday, "2026-10-24");
});

test("the evening plan gives one reminder per member, by priority", () => {
  const members = new Map([
    [A, { timezone: "Europe/Brussels" }], // examen demain (même s'il a étudié aujourd'hui)
    [B, { timezone: "Europe/Brussels" }], // a étudié aujourd'hui → rien
    [C, { timezone: "Europe/Brussels" }], // a étudié hier → série en danger
    [D, { timezone: "Europe/Brussels" }], // il y a 3 jours → relance douce
    [E, { timezone: "Europe/Brussels" }], // nouveau, jamais reparti → relance des nouveaux
  ]);
  const sessions = [
    { user_id: A, started_at: "2026-09-24T09:00:00Z" },
    { user_id: B, started_at: "2026-09-24T09:00:00Z" },
    { user_id: C, started_at: "2026-09-23T20:00:00Z" },
    { user_id: D, started_at: "2026-09-21T10:00:00Z" },
  ];
  const exams = [{ user_id: A, exam_date: "2026-09-25" }];
  const { entries, skipped } = planReminders({ now: EVENING, members, sessions, exams, newcomerIds: [E] });
  const byUser = Object.fromEntries(entries.map((entry) => [entry.userId, entry.kind]));
  assert.deepEqual(byUser, {
    [A]: "exam_tomorrow",
    [C]: "streak_at_risk",
    [D]: nudgeKindFor("2026-09-24"),
    [E]: "comeback_day3",
  });
  assert.equal(skipped.studied_today, 1);
  assert.equal(entries.every((entry) => entry.localDate === "2026-09-24"), true);
});

test("a session late at night counts for the member's own day, and quiet hours hold", () => {
  // 23:30 à Bruxelles le 23 = 21:30 UTC : c'est bien « hier » pour elle.
  const members = new Map([[A, { timezone: "Europe/Brussels" }], [B, { timezone: "Asia/Hong_Kong" }]]);
  const sessions = [
    { user_id: A, started_at: "2026-09-23T21:30:00Z" },
    { user_id: B, started_at: "2026-09-24T01:00:00Z" },
  ];
  const { entries, skipped } = planReminders({ now: EVENING, members, sessions, exams: [], newcomerIds: [] });
  assert.deepEqual(entries.map((entry) => [entry.userId, entry.kind]), [[A, "streak_at_risk"]]);
  // À Hong Kong il est 2 h du matin : pas de rappel.
  assert.equal(skipped.quiet_hours, 1);
});

test("more than three days without studying: no reminder (no harassment)", () => {
  const members = new Map([[A, { timezone: "Europe/Brussels" }]]);
  const { entries, skipped } = planReminders({
    now: EVENING, members, sessions: [{ user_id: A, started_at: "2026-09-19T10:00:00Z" }], exams: [], newcomerIds: [],
  });
  assert.equal(entries.length, 0);
  assert.equal(skipped.inactive, 1);
});

test("the weekly cap stops nudges but never an exam reminder", () => {
  assert.deepEqual([...CAP_EXEMPT_KINDS], ["exam_tomorrow"]);
  assert.equal(isCappedReminder("streak_at_risk", 3, 3), true);
  assert.equal(isCappedReminder("streak_at_risk", 2, 3), false);
  assert.equal(isCappedReminder("exam_tomorrow", 9, 3), false);
  assert.equal(normalizeCap("4"), 4);
  assert.equal(normalizeCap(0), null);
  assert.equal(normalizeCap(8), null);
});

test("anti-duplicate keys: one reminder per member and local day, one friend push per pair and day", () => {
  assert.equal(reminderKey(A, "2026-09-24"), reminderKey(A, "2026-09-24"));
  assert.notEqual(reminderKey(A, "2026-09-24"), reminderKey(A, "2026-09-25"));
  assert.notEqual(reminderKey(A, "2026-09-24"), reminderKey(B, "2026-09-24"));
  const now = new Date("2026-09-24T12:00:00Z");
  assert.equal(friendRequestKey(A, B, now), `friend_request:${A}:${B}:2026-09-24`);
  assert.notEqual(friendRequestKey(A, B, now), friendRequestKey(B, A, now));
});

test("a friend request is notified only when pending, fresh and between two people", () => {
  const now = Date.parse("2026-09-24T12:00:00Z");
  const fresh = { requester: A, addressee: B, status: "pending", created_at: "2026-09-24T11:55:00Z" };
  assert.deepEqual(friendRequestVerdict(fresh, now), { ok: true });
  assert.equal(friendRequestVerdict(null, now).reason, "not_found");
  assert.equal(friendRequestVerdict({ ...fresh, status: "accepted" }, now).reason, "not_pending");
  assert.equal(friendRequestVerdict({ ...fresh, created_at: "2026-09-24T10:00:00Z" }, now).reason, "stale");
  assert.equal(friendRequestVerdict({ ...fresh, addressee: A }, now).reason, "invalid");
  // Le webhook ne fournit qu'un identifiant ; tout le reste est relu en base.
  assert.equal(friendshipIdFromWebhook({ type: "friend_request", friendship_id: A }), A);
  assert.equal(friendshipIdFromWebhook({ type: "INSERT", table: "friendships", record: { id: B, requester: C } }), B);
  assert.equal(friendshipIdFromWebhook({ type: "INSERT", table: "posts", record: { id: B } }), null);
  assert.equal(friendshipIdFromWebhook({ friendship_id: "'; drop table" }), null);
});

test("audience counts come from reasons, reachability from known devices", () => {
  const summary = summarizeAudience([
    { user_id: A, reason: null, devices: 2 },
    { user_id: B, reason: null, devices: 0 },
    { user_id: C, reason: "suspended", devices: 1 },
    { user_id: D, reason: "category_off", devices: 1 },
    { user_id: E, reason: "category_off", devices: 0 },
  ]);
  assert.deepEqual(summary, {
    targeted: 5, excluded: { suspended: 1, category_off: 2 }, eligible: 2, reachable: 1, devices: 2,
  });
});

test("the next evening run is today at 18:00 UTC, or tomorrow once passed", () => {
  assert.equal(nextDailyRun(new Date("2026-09-24T10:00:00Z")), "2026-09-24T18:00:00.000Z");
  assert.equal(nextDailyRun(new Date("2026-09-24T18:00:00Z")), "2026-09-25T18:00:00.000Z");
});

test("announcements: French required, optional English, coherent dates and target", () => {
  const now = Date.parse("2026-09-24T10:00:00Z");
  assert.equal(validateAnnouncement({ titleFr: "", messageFr: "x" }, now).error, "title_required");
  assert.equal(validateAnnouncement({ titleFr: "T", messageFr: "M", titleEn: "T" }, now).error, "english_incomplete");
  assert.equal(validateAnnouncement({ titleFr: "T", messageFr: "M", href: "https://x.y" }, now).error, "invalid_link");
  assert.equal(validateAnnouncement({ titleFr: "T", messageFr: "M", startsAt: "2026-10-02", endsAt: "2026-10-01" }, now).error, "end_before_start");
  assert.equal(validateAnnouncement({ titleFr: "T", messageFr: "M", endsAt: "2026-09-01" }, now).error, "end_before_start");
  assert.equal(validateAnnouncement({ titleFr: "T", messageFr: "M", audience: "university" }, now).error, "invalid_target");
  const ok = validateAnnouncement({
    titleFr: "Nouveau", messageFr: "Les salles", titleEn: "New", messageEn: "Rooms",
    type: "new", href: "/communautes", endsAt: "2026-10-01T00:00:00Z", audience: "university", university: "ICHEC",
  }, now);
  assert.equal(ok.ok, true);
  assert.deepEqual(
    { title_en: ok.row.title_en, audience: ok.row.audience, audience_university: ok.row.audience_university, starts_at: ok.row.starts_at },
    { title_en: "New", audience: "university", audience_university: "ICHEC", starts_at: null },
  );
  // Sans dates ni cible : exactement comme les annonces d'avant.
  const plain = validateAnnouncement({ titleFr: "T", messageFr: "M" }, now);
  assert.deepEqual([plain.row.starts_at, plain.row.ends_at, plain.row.audience, plain.row.title_en], [null, null, "all", null]);
});

test("an announcement pushed keeps its languages and fits a notification", () => {
  const content = announcementPushContent({
    title: "Nouveauté", message: "mot ".repeat(80), title_en: null, message_en: null, href: "/planning",
  });
  assert.deepEqual(content.title, { fr: "Nouveauté", en: "Nouveauté" });
  assert.ok(content.body.fr.length <= PUSH_BODY_MAX);
  assert.ok(content.body.fr.endsWith("…"));
  assert.deepEqual(content.langs, ["fr"]);
  assert.equal(content.url, "/planning");
  const en = announcementPushContent({ title: "A", message: "B", title_en: "C", message_en: "D", href: "//evil" });
  assert.deepEqual([en.title.en, en.body.en, en.url], ["C", "D", null]);
});

test("an announcement's state follows its dates", () => {
  const now = Date.parse("2026-09-24T10:00:00Z");
  assert.equal(announcementWindowState({ is_active: false }, now), "inactive");
  assert.equal(announcementWindowState({ is_active: true }, now), "live");
  assert.equal(announcementWindowState({ is_active: true, starts_at: "2026-09-30T00:00:00Z" }, now), "scheduled");
  assert.equal(announcementWindowState({ is_active: true, ends_at: "2026-09-20T00:00:00Z" }, now), "expired");
});
