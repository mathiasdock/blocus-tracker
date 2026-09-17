import test from "node:test";
import assert from "node:assert/strict";
import {
  buildCourseSpaceView,
  coldStartState,
  courseSpaceErrorKey,
  examDateBounds,
  groupRoomMessages,
  isSharedExamPlanned,
  splitFileName,
  mergeLatestPage,
  mergeOlderPage,
  namesDiffer,
  newMessagesFromOthers,
  pickInitialSpace,
  programLabel,
  universityInitials,
  visibleMemberCount,
} from "../lib/courseSpaces.mjs";

const adv = { id: "c-adv", name: "ADV Strat", color: "#ec4899", archived_at: null };
const macro = { id: "c-macro", name: "Macroéconomie", color: "#3b82f6", archived_at: null };
const stats = { id: "c-stats", name: "Stats", color: "#f59e0b", archived_at: null };
const old = { id: "c-old", name: "Comptabilité", color: "#92400e", archived_at: "2026-01-10T10:00:00Z" };

test("an automatic or confirmed link of an active course becomes a suggestion with that course's identity", () => {
  const view = buildCourseSpaceView({
    courses: [adv, macro],
    links: [
      { course_id: "c-adv", offering_id: "o-adv", offering_title: "Advertising Strategy", status: "auto", confidence: "high" },
      { course_id: "c-macro", offering_id: "o-macro", offering_title: "Macroeconomie", status: "confirmed", confidence: "medium" },
    ],
    summaries: [
      { offering_id: "o-adv", offering_title: "Advertising Strategy", room_id: "r-adv", joined: false, member_count: 12 },
      { offering_id: "o-macro", offering_title: "Macroeconomie", room_id: null, joined: false, member_count: null },
    ],
  });
  assert.deepEqual(view.suggestions.map((entry) => entry.offeringId), ["o-adv", "o-macro"]);
  const [first, second] = view.suggestions;
  assert.equal(first.course.color, "#ec4899");
  assert.equal(first.personalName, "ADV Strat");
  assert.equal(first.memberCount, 12);
  // Same words once accents and case are ignored: no redundant second line.
  assert.equal(second.personalName, null);
  assert.equal(second.roomId, null);
  assert.equal(view.joined.length, 0);
  assert.equal(view.questions.length, 0);
});

test("a joined space leaves the suggestions and keeps the course color only through a real link", () => {
  const view = buildCourseSpaceView({
    courses: [adv],
    links: [{ course_id: "c-adv", offering_id: "o-adv", offering_title: "Advertising Strategy", status: "auto", confidence: "high" }],
    summaries: [
      { offering_id: "o-adv", offering_title: "Advertising Strategy", room_id: "r-adv", joined: true, member_count: 4, last_message_at: "2026-09-16T10:00:00+00:00" },
      { offering_id: "o-law", offering_title: "Droit des médias", room_id: "r-law", joined: true, member_count: 2, last_message_at: "2026-09-17T08:00:00Z" },
      { offering_id: "o-quiet", offering_title: "Anthropologie", room_id: "r-quiet", joined: true, member_count: 3, last_message_at: null },
    ],
  });
  assert.deepEqual(view.joined.map((entry) => entry.offeringId), ["o-law", "o-adv", "o-quiet"]);
  assert.equal(view.suggestions.length, 0);
  assert.equal(view.joined[1].course.id, "c-adv");
  // Joined from search, no personal course: neutral, no invented identity.
  assert.equal(view.joined[0].course, null);
  assert.equal(view.joined[0].memberCount, null);
});

test("uncertain matches become at most two questions, the most likely first, one per course", () => {
  const view = buildCourseSpaceView({
    courses: [adv, macro, stats],
    links: [
      { course_id: "c-adv", offering_id: "o-adv", offering_title: "Advertising Strategy", status: "suggested", confidence: "medium" },
      { course_id: "c-adv", offering_id: "o-adv2", offering_title: "Advertising Strategies II", status: "suggested", confidence: "medium" },
      { course_id: "c-macro", offering_id: "o-macro1", offering_title: "Macroéconomie I", status: "suggested", confidence: "high" },
      { course_id: "c-macro", offering_id: "o-macro2", offering_title: "Macroéconomie II", status: "suggested", confidence: "high" },
      { course_id: "c-stats", offering_id: "o-stats", offering_title: "Statistiques", status: "suggested", confidence: "medium" },
    ],
    summaries: [],
  });
  assert.equal(view.pendingQuestions, 3);
  assert.deepEqual(view.questions.map((question) => [question.course.id, question.offeringId]), [
    ["c-macro", "o-macro1"],
    ["c-adv", "o-adv"],
  ]);
  assert.equal(view.suggestions.length, 0, "a question is not a suggestion until the student says yes");
});

test("a course already linked is never asked about, and archived courses stay silent", () => {
  const view = buildCourseSpaceView({
    courses: [adv, old],
    links: [
      { course_id: "c-adv", offering_id: "o-adv", offering_title: "Advertising Strategy", status: "confirmed", confidence: "medium" },
      { course_id: "c-adv", offering_id: "o-other", offering_title: "Advertising Law", status: "suggested", confidence: "medium" },
      { course_id: "c-old", offering_id: "o-compta", offering_title: "Comptabilité", status: "auto", confidence: "high" },
      { course_id: "c-old", offering_id: "o-compta2", offering_title: "Comptabilité II", status: "suggested", confidence: "medium" },
    ],
    summaries: [{ offering_id: "o-compta", offering_title: "Comptabilité", room_id: "r-compta", joined: true, member_count: 5 }],
  });
  assert.equal(view.questions.length, 0);
  assert.deepEqual(view.suggestions.map((entry) => entry.offeringId), ["o-adv"]);
  // Membership survives archiving; the archived course no longer lends its color.
  assert.equal(view.joined.length, 1);
  assert.equal(view.joined[0].course, null);
  assert.equal(view.activeCourseCount, 1);
});

test("two personal courses linked to one offering give one row, deterministically", () => {
  const second = { id: "c-adv-b", name: "Advertising", color: "#22c55e", archived_at: null };
  const view = buildCourseSpaceView({
    courses: [adv, second],
    links: [
      { course_id: "c-adv", offering_id: "o-adv", offering_title: "Advertising Strategy", status: "auto", confidence: "high" },
      { course_id: "c-adv-b", offering_id: "o-adv", offering_title: "Advertising Strategy", status: "confirmed", confidence: "medium" },
    ],
  });
  assert.equal(view.suggestions.length, 1);
  assert.equal(view.suggestions[0].course.id, "c-adv", "ADV Strat sorts before Advertising");
});

test("member counts under three are never shown", () => {
  assert.equal(visibleMemberCount(null), null);
  assert.equal(visibleMemberCount(1), null);
  assert.equal(visibleMemberCount(2), null);
  assert.equal(visibleMemberCount(3), 3);
  assert.equal(visibleMemberCount("41"), 41);
});

test("names differ only when the words differ", () => {
  assert.equal(namesDiffer("advertising  strategy", "Advertising Strategy"), false);
  assert.equal(namesDiffer("Macroéconomie", "Macroeconomie"), false);
  assert.equal(namesDiffer("ADV Strat", "Advertising Strategy"), true);
  assert.equal(namesDiffer("", "Advertising Strategy"), false);
});

test("the empty sentence tells the truth about why the list is empty", () => {
  const empty = buildCourseSpaceView({});
  assert.equal(coldStartState({ hasInstitution: false, view: empty }), "noInstitution");
  assert.equal(coldStartState({ hasInstitution: true, view: empty }), "noCourses");
  const courses = buildCourseSpaceView({ courses: [adv] });
  assert.equal(coldStartState({ hasInstitution: true, view: courses }), "noMatches");
  const joined = buildCourseSpaceView({ summaries: [{ offering_id: "o", offering_title: "X", room_id: "r", joined: true }] });
  assert.equal(coldStartState({ hasInstitution: true, view: joined }), null);
});

test("the stream reads oldest to newest, grouped by author within five minutes, split by day", () => {
  const items = groupRoomMessages([
    { id: "m4", user_id: "me", created_at: "2026-09-16T09:20:00.000Z" },
    { id: "m1", user_id: "lina", created_at: "2026-09-16T09:00:00.000000+00:00" },
    { id: "m2", user_id: "lina", created_at: "2026-09-16T09:04:00.000Z" },
    { id: "m3", user_id: "lina", created_at: "2026-09-16T09:10:00.000Z" },
    { id: "m5", user_id: "me", created_at: "2026-09-18T09:21:00.000Z" },
  ], "me");
  assert.deepEqual(items.map((item) => item.type === "day" ? item.type : item.messages.map((message) => message.id).join("+")), [
    "day", "m1+m2", "m3", "m4", "day", "m5",
  ]);
  assert.equal(items[1].mine, false);
  assert.equal(items[3].mine, true);
});

test("a poll keeps older history, drops what the server removed, and never hides a gap", () => {
  const at = (minute) => `2026-09-16T09:${String(minute).padStart(2, "0")}:00.000Z`;
  const current = [1, 2, 3, 4].map((minute) => ({ id: `m${minute}`, created_at: at(minute) }));
  // Short page = whole room: m2 was deleted.
  const complete = mergeLatestPage(current, [current[0], current[2], current[3]], 40);
  assert.deepEqual(complete.messages.map((message) => message.id), ["m1", "m3", "m4"]);
  assert.equal(complete.complete, true);
  // Full page overlapping what is loaded: older messages stay.
  const overlapping = mergeLatestPage(current, [current[2], current[3], { id: "m5", created_at: at(5) }], 3);
  assert.deepEqual(overlapping.messages.map((message) => message.id), ["m1", "m2", "m3", "m4", "m5"]);
  assert.equal(overlapping.reset, false);
  // Full page entirely newer than anything loaded: replace, history reloads on demand.
  const gap = mergeLatestPage(current, [6, 7, 8].map((minute) => ({ id: `m${minute}`, created_at: at(minute) })), 3);
  assert.deepEqual(gap.messages.map((message) => message.id), ["m6", "m7", "m8"]);
  assert.equal(gap.reset, true);
  assert.deepEqual(mergeOlderPage(current.slice(2), current.slice(0, 3)).map((message) => message.id), ["m1", "m2", "m3", "m4"]);
});

test("only new messages from other students are announced", () => {
  const before = [{ id: "a", user_id: "me", created_at: "2026-09-16T09:00:00Z" }];
  const after = [...before,
    { id: "b", user_id: "lina", created_at: "2026-09-16T09:01:00Z" },
    { id: "c", user_id: "me", created_at: "2026-09-16T09:02:00Z" }];
  assert.equal(newMessagesFromOthers(before, after, "me"), 1);
  assert.equal(newMessagesFromOthers([], after, "me"), 1);
});

test("shared exam dates stay inside the server window", () => {
  const bounds = examDateBounds(new Date(2026, 8, 17, 23, 50));
  assert.equal(bounds.min, "2026-09-17");
  assert.equal(bounds.max, "2028-09-15");
});

test("server refusals map to translated sentences, never raw text", () => {
  assert.equal(courseSpaceErrorKey({ message: "Rate limit exceeded" }), "courseSpaces.error.rate");
  assert.equal(courseSpaceErrorKey({ message: "Rate limit exceeded" }, "report"), "courseSpaces.error.reportRate");
  assert.equal(courseSpaceErrorKey(new Error("Join this course space to post")), "courseSpaces.error.notMember");
  assert.equal(courseSpaceErrorKey({ message: "Course space not available" }), "courseSpaces.error.unavailable");
  assert.equal(courseSpaceErrorKey({ message: "fetch failed" }), "courseSpaces.error.generic");
});

test("a shared exam date counts as planned only on the same day and the same personal course", () => {
  const exams = [
    { exam_date: "2026-12-18", course_id: "c-media", name: "Examen · Droit des médias" },
    { exam_date: "2027-01-12", course_id: null, name: "Examen · Anthropologie" },
  ];
  assert.equal(isSharedExamPlanned(exams, { examDate: "2026-12-18", courseId: "c-media" }), true);
  assert.equal(isSharedExamPlanned(exams, { examDate: "2026-12-18", courseId: "c-other" }), false);
  assert.equal(isSharedExamPlanned(exams, { examDate: "2026-12-19", courseId: "c-media" }), false);
  // Without a linked course, the name Blocus gave it is the identity.
  assert.equal(isSharedExamPlanned(exams, { examDate: "2027-01-12", name: "Examen · Anthropologie" }), true);
  assert.equal(isSharedExamPlanned(exams, { examDate: "2027-01-12", name: "Examen · Sociologie" }), false);
});

test("file names split so only the middle can give way", () => {
  const five = splitFileName("Macro-chapitre-5-resume.pdf");
  const six = splitFileName("Macro-chapitre-6-resume.pdf");
  assert.equal(five.head + five.tail, "Macro-chapitre-5-resume.pdf");
  assert.equal(five.tail, "5-resume.pdf");
  assert.notEqual(five.tail, six.tail, "the distinguishing number stays in the visible end");
  assert.deepEqual(splitFileName("plan.pdf"), { head: "plan", tail: ".pdf" });
  assert.equal(splitFileName("notes").head + splitFileName("notes").tail, "notes");
});

const defaultRows = [
  { room_id: "r-prog", kind: "program", title: "Business & Management", institution_id: "ICHEC", institution_name: "ICHEC Brussels Management School", joined: true, member_count: 7, last_message_at: "2026-09-17T08:00:00Z" },
  { room_id: "r-uni", kind: "university", title: "ICHEC Brussels Management School", institution_id: "ICHEC", institution_name: "ICHEC Brussels Management School", joined: true, member_count: 41, last_message_at: "2026-09-16T08:00:00Z" },
];

test("the profile's two default spaces come first, institution before program", () => {
  const view = buildCourseSpaceView({ courses: [adv], links: [], summaries: [], defaults: defaultRows });
  assert.deepEqual(view.defaults.map((entry) => entry.kind), ["university", "program"]);
  const [university, program] = view.defaults;
  assert.equal(university.id, "room:r-uni");
  assert.equal(university.roomId, "r-uni");
  assert.equal(university.institutionId, "ICHEC");
  assert.equal(university.memberCount, 41);
  assert.equal(program.course, null, "a default space never borrows a course color");
  assert.equal(view.joined.length, 0, "default spaces are not course spaces");
  assert.equal(view.suggestions.length, 0);
});

test("the desktop opens a joined course space, otherwise the institution", () => {
  const joinedCourse = buildCourseSpaceView({
    courses: [adv],
    links: [{ course_id: "c-adv", offering_id: "o-adv", offering_title: "Advertising Strategy", status: "auto", confidence: "high" }],
    summaries: [{ offering_id: "o-adv", offering_title: "Advertising Strategy", room_id: "r-adv", joined: true, member_count: 5, last_message_at: "2026-09-17T09:00:00Z" }],
    defaults: defaultRows,
  });
  assert.equal(pickInitialSpace(joinedCourse).roomId, "r-adv");
  const noCourseRoom = buildCourseSpaceView({ courses: [adv], defaults: defaultRows });
  assert.equal(pickInitialSpace(noCourseRoom).id, "room:r-uni");
  const programOnly = buildCourseSpaceView({ defaults: [defaultRows[0]] });
  assert.equal(pickInitialSpace(programOnly).id, "room:r-prog");
  const suggestionOnly = buildCourseSpaceView({
    courses: [adv],
    links: [{ course_id: "c-adv", offering_id: "o-adv", offering_title: "Advertising Strategy", status: "auto", confidence: "high" }],
  });
  assert.equal(pickInitialSpace(suggestionOnly).offeringId, "o-adv");
  assert.equal(pickInitialSpace(buildCourseSpaceView({})), null);
});

test("an institution without a logo falls back to its initials, never a pictogram", () => {
  assert.equal(universityInitials("Université catholique de Louvain"), "UC");
  assert.equal(universityInitials("ICHEC"), "IC");
  assert.equal(universityInitials("HEC Paris"), "HP");
  assert.equal(universityInitials(""), "?");
});

test("a program space shows the taxonomy name in the reader's language, free text untouched", () => {
  assert.equal(programLabel("Business & Management", "fr"), "Gestion & management");
  assert.equal(programLabel("Business & Management", "en"), "Business & Management");
  assert.equal(programLabel("Kinésithérapie du sport", "fr"), "Kinésithérapie du sport");
  assert.equal(programLabel("", "fr"), "");
});
