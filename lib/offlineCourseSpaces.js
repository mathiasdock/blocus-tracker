import { normalizeStudyName } from "./studySpaces.mjs";

// Development fixture only (NEXT_PUBLIC_OFFLINE_DEV). Nothing here is ever
// written to Supabase, and the page labels it "Local demo data".
//
// It reproduces the server contract of supabase/migrations/
// 20260917061842_course_spaces.sql closely enough to exercise every product
// state: an automatic match under another name, an uncertain match to
// confirm, a long title, a space with no room yet, a joined room with
// history, an empty joined room, a room kept after the course was archived,
// a room joined from search, and the two default spaces of the profile (the
// institution and its program). `?demo=empty` shows the student with courses,
// no course match and no joined course space — the default spaces stay, which
// is exactly what they are for.
const FIXTURE_VERSION = 2;
const DAY = 864e5;

const OFFERINGS = [
  { id: "offline-offering-macro", title: "Macroéconomie" },
  { id: "offline-offering-adv", title: "Advertising Strategy" },
  { id: "offline-offering-adv2", title: "Advertising Strategies II" },
  { id: "offline-offering-media", title: "Droit européen des médias et de la communication numérique" },
  { id: "offline-offering-methodo", title: "Méthodologie de la recherche" },
  { id: "offline-offering-bio", title: "Biologie cellulaire" },
  { id: "offline-offering-compta", title: "Comptabilité générale" },
  { id: "offline-offering-stats", title: "Statistiques descriptives" },
  { id: "offline-offering-finance", title: "Finance d'entreprise" },
];

const DEMO_COURSES = [
  { id: "offline-course-demo-macro", name: "Macro", color: "#3b82f6" },
  { id: "offline-course-demo-adv", name: "ADV Strat", color: "#ec4899" },
  { id: "offline-course-demo-media", name: "Droit européen des médias et de la communication numérique", color: "#9f1239" },
];

function iso(offsetMs) {
  return new Date(Date.now() + offsetMs).toISOString();
}

function error(message) {
  return { data: null, error: { message } };
}

export function isEmptyCourseSpacesDemo() {
  try {
    return typeof window !== "undefined" && new URLSearchParams(window.location.search).get("demo") === "empty";
  } catch {
    return false;
  }
}

export function prepareOfflineCourseSpaces(db, userId) {
  if (db.course_spaces_fixture === FIXTURE_VERSION) return db;
  db.course_spaces_fixture = FIXTURE_VERSION;
  db.courses ||= [];
  DEMO_COURSES.forEach((course, index) => {
    if (!db.courses.some((row) => row.id === course.id)) {
      db.courses.push({ ...course, user_id: userId, exam_date: null, archived_at: null, created_at: iso(-(20 + index) * DAY) });
    }
  });
  db.course_offerings_demo = OFFERINGS;
  db.course_links = [
    { course_id: "offline-course-demo-macro", offering_id: "offline-offering-macro", user_id: userId, status: "auto", confidence: "high", rule: "abbreviation" },
    { course_id: "offline-course-demo-media", offering_id: "offline-offering-media", user_id: userId, status: "auto", confidence: "high", rule: "exact" },
    { course_id: "offline-course-methodo", offering_id: "offline-offering-methodo", user_id: userId, status: "auto", confidence: "high", rule: "longer_title" },
    { course_id: "offline-course-bio", offering_id: "offline-offering-bio", user_id: userId, status: "confirmed", confidence: "medium", rule: "longer_title" },
    { course_id: "offline-course-compta", offering_id: "offline-offering-compta", user_id: userId, status: "auto", confidence: "high", rule: "longer_title" },
  ];
  db.course_candidates_demo = [
    { course_id: "offline-course-demo-adv", offering_id: "offline-offering-adv", confidence: "medium", rule: "abbreviation" },
    { course_id: "offline-course-demo-adv", offering_id: "offline-offering-adv2", confidence: "medium", rule: "abbreviation" },
  ];
  const demo = (i) => `offline-demo-${i}`;
  db.course_rooms = [
    { id: "offline-room-macro", kind: "course", offering_id: "offline-offering-macro", created_at: iso(-9 * DAY) },
    { id: "offline-room-methodo", kind: "course", offering_id: "offline-offering-methodo", created_at: iso(-2 * DAY) },
    { id: "offline-room-compta", kind: "course", offering_id: "offline-offering-compta", created_at: iso(-60 * DAY) },
    { id: "offline-room-stats", kind: "course", offering_id: "offline-offering-stats", created_at: iso(-5 * DAY) },
    { id: "offline-room-media", kind: "course", offering_id: "offline-offering-media", created_at: iso(-12 * DAY) },
    { id: "offline-room-adv", kind: "course", offering_id: "offline-offering-adv", created_at: iso(-3 * DAY) },
    // The two default spaces of the offline profile (UCLouvain, Médecine as a
    // free-text program): the page is never empty, even before a match.
    { id: "offline-room-university", kind: "university", offering_id: null, institution_id: INSTITUTION, title: "Université catholique de Louvain", created_at: iso(-120 * DAY) },
    { id: "offline-room-program", kind: "program", offering_id: null, institution_id: INSTITUTION, program_key: "medecine", title: "Médecine", created_at: iso(-118 * DAY) },
  ];
  const members = {
    "offline-room-university": [userId, "offline-user-lina", "offline-user-tom", ...Array.from({ length: 14 }, (unused, i) => demo(i))],
    "offline-room-program": [userId, demo(1), demo(4), demo(7), demo(9), demo(12)],
    "offline-room-macro": [userId, demo(0), demo(1), demo(2), demo(3), demo(4), demo(5), "offline-user-lina"],
    "offline-room-methodo": [userId, demo(6)],
    "offline-room-compta": [userId, demo(7), demo(8), demo(9)],
    "offline-room-stats": [userId, demo(10)],
    "offline-room-media": [demo(0), demo(2), demo(4), demo(6), demo(8), demo(10), demo(11), demo(12), demo(13), demo(1), demo(3), demo(5), demo(7), demo(9)],
    "offline-room-adv": [demo(11), demo(12)],
  };
  db.course_room_members = Object.entries(members).flatMap(([roomId, ids]) => ids.map((id, index) => ({
    id: `${roomId}:${id}`, room_id: roomId, user_id: id, joined_at: iso(-(8 - Math.min(index, 7)) * DAY),
  })));
  const message = (id, roomId, author, minutesAgo, content, extra = {}) => ({
    id, room_id: roomId, community: null, user_id: author, content, content_type: "discussion", parent_id: null,
    attachment_url: null, attachment_type: null, attachment_name: null, exam_date: null, hidden_at: null,
    created_at: iso(-minutesAgo * 60000), ...extra,
  });
  const examDay = new Date(Date.now() + 38 * DAY).toISOString().slice(0, 10);
  db.community_messages = (db.community_messages || []).filter((row) => !String(row.id).startsWith("offline-room-message-"));
  db.community_messages.push(
    message("offline-room-message-1", "offline-room-macro", demo(0), 60 * 26, "Quelqu’un a compris le multiplicateur keynésien du chapitre 4 ? Je bloque sur l’exercice 3."),
    message("offline-room-message-2", "offline-room-macro", demo(1), 60 * 25 + 40, "Oui : pense à la propension marginale à consommer. Si c = 0,8, le multiplicateur vaut 1 / (1 − 0,8) = 5."),
    message("offline-room-message-3", "offline-room-macro", demo(1), 60 * 25 + 38, "Le corrigé du TP 3 le montre bien, page 12."),
    message("offline-room-message-4", "offline-room-macro", userId, 60 * 25, "Merci, c’est beaucoup plus clair."),
    message("offline-room-message-5", "offline-room-macro", demo(2), 95, "La date de l’examen est tombée sur le portail :", { exam_date: examDay }),
    message("offline-room-message-6", "offline-room-macro", demo(2), 94, "Écrit, chapitres 1 à 7. Les exercices du TP comptent."),
    message("offline-room-message-7", "offline-room-macro", "offline-user-lina", 30, "Je mets en ligne ma synthèse des chapitres 5 et 6.", { attachment_url: "community:offline-user-lina/offline-room-macro/synthese.pdf", attachment_type: "file", attachment_name: "Synthese-macro-ch5-6.pdf" }),
    message("offline-room-message-8", "offline-room-macro", demo(3), 12, "Top, merci Lina ! Quelqu’un révise à la bibliothèque des sciences cet après-midi ?"),
    message("offline-room-message-9", "offline-room-compta", demo(7), 60 * 24 * 40, "Pour la clôture : n’oubliez pas les écritures de régularisation."),
    message("offline-room-message-10", "offline-room-stats", demo(10), 60 * 24 * 2, "Quelqu’un a les slides du cours sur la variance ?"),
    message("offline-room-message-11", "offline-room-university", demo(5), 60 * 20, "La bibliothèque des sciences reste ouverte jusqu’à 22 h pendant le blocus."),
    message("offline-room-message-12", "offline-room-university", demo(9), 60 * 6, "Quelqu’un sait où sont affichés les horaires d’examens cette année ?"),
    message("offline-room-message-13", "offline-room-program", demo(4), 60 * 30, "Les stages de deuxième quadrimestre sont publiés sur le portail."),
  );
  db.user_blocks ||= [];
  db.course_message_reports ||= [];
  db.course_room_optouts ||= [];
  return db;
}

const INSTITUTION = "UCL";

const activeCourseIds = (db, userId) => new Set((db.courses || []).filter((row) => row.user_id === userId && !row.archived_at).map((row) => row.id));
const offeringById = (db) => new Map((db.course_offerings_demo || []).map((row) => [row.id, row]));
const roomOf = (db, offeringId) => (db.course_rooms || []).find((row) => row.offering_id === offeringId);
const isMember = (db, roomId, userId) => (db.course_room_members || []).some((row) => row.room_id === roomId && row.user_id === userId);
const memberCount = (db, roomId) => (db.course_room_members || []).filter((row) => row.room_id === roomId).length;

// community_messages RLS, reproduced for the fixture's own reads.
export function offlineCourseMessageVisible(db, userId, row) {
  if (!row.room_id) return row.user_id === userId;
  if (row.user_id === userId) return true;
  if (!isMember(db, row.room_id, userId) || row.hidden_at) return false;
  if ((db.user_blocks || []).some((block) => block.blocker_id === userId && block.blocked_id === row.user_id)) return false;
  return !(db.course_message_reports || []).some((report) => report.message_id === row.id && report.reporter_id === userId);
}

function summary(db, userId, offering, withActivity) {
  const room = roomOf(db, offering.id);
  const joined = !!room && isMember(db, room.id, userId);
  const count = room ? memberCount(db, room.id) : 0;
  const last = joined && withActivity
    ? (db.community_messages || []).filter((row) => row.room_id === room.id && !row.hidden_at).map((row) => row.created_at).sort().pop() || null
    : null;
  return { offering_id: offering.id, offering_title: offering.title, room_id: room?.id || null, joined, member_count: count >= 3 ? count : null, last_message_at: last };
}

export function offlineCourseSpacesRpc(db, name, params, userId) {
  const offerings = offeringById(db);
  const empty = isEmptyCourseSpacesDemo();

  if (name === "resolve_my_course_links") {
    if (empty) return { data: [], error: null };
    const active = activeCourseIds(db, userId);
    const links = (db.course_links || []).filter((row) => row.user_id === userId);
    const settled = new Set(links.filter((row) => row.status === "auto" || row.status === "confirmed").map((row) => row.course_id));
    const rows = links
      .filter((row) => (row.status === "auto" || row.status === "confirmed") && active.has(row.course_id))
      .map((row) => ({ course_id: row.course_id, offering_id: row.offering_id, offering_title: offerings.get(row.offering_id)?.title, status: row.status, confidence: row.confidence, rule: row.rule }));
    for (const candidate of db.course_candidates_demo || []) {
      const rejected = links.some((row) => row.course_id === candidate.course_id && row.offering_id === candidate.offering_id && row.status === "rejected");
      if (rejected || settled.has(candidate.course_id) || !active.has(candidate.course_id)) continue;
      rows.push({ ...candidate, offering_title: offerings.get(candidate.offering_id)?.title, status: "suggested" });
    }
    return { data: rows, error: null };
  }

  if (name === "confirm_course_link" || name === "reject_course_link") {
    const status = name === "confirm_course_link" ? "confirmed" : "rejected";
    db.course_links = (db.course_links || []).filter((row) => !(row.course_id === params.p_course_id && row.offering_id === params.p_offering_id));
    db.course_links.push({ course_id: params.p_course_id, offering_id: params.p_offering_id, user_id: userId, status, confidence: "medium", rule: "student" });
    return { data: null, error: null };
  }

  if (name === "course_space_summaries") {
    if (empty) return { data: [], error: null };
    const wanted = new Set(params.p_offering_ids || []);
    (db.course_room_members || []).filter((row) => row.user_id === userId).forEach((row) => {
      const room = (db.course_rooms || []).find((item) => item.id === row.room_id);
      if (room) wanted.add(room.offering_id);
    });
    return { data: [...wanted].map((id) => offerings.get(id)).filter(Boolean).map((offering) => summary(db, userId, offering, true)), error: null };
  }

  if (name === "search_course_spaces") {
    const needle = normalizeStudyName(String(params.p_query || "").slice(0, 120));
    if (needle.length < 2) return { data: [], error: null };
    const rows = [...offerings.values()]
      .filter((offering) => normalizeStudyName(offering.title).includes(needle))
      .map((offering) => summary(db, userId, offering, false))
      .map(({ last_message_at: _ignored, ...row }) => row)
      .sort((a, b) => Number(b.joined) - Number(a.joined) || (b.member_count || 0) - (a.member_count || 0) || a.offering_title.localeCompare(b.offering_title))
      .slice(0, 20);
    return { data: rows, error: null };
  }

  if (name === "ensure_my_default_rooms") {
    const rooms = (db.course_rooms || []).filter((row) => row.kind === "university" || row.kind === "program");
    return { data: rooms.map((room) => {
      const joined = isMember(db, room.id, userId);
      const count = memberCount(db, room.id);
      const last = joined
        ? (db.community_messages || []).filter((row) => row.room_id === room.id && !row.hidden_at).map((row) => row.created_at).sort().pop() || null
        : null;
      return {
        room_id: room.id, kind: room.kind, title: room.title, institution_id: room.institution_id,
        institution_name: "Université catholique de Louvain",
        joined, member_count: count >= 3 ? count : null, last_message_at: last,
      };
    }).sort((a, b) => Number(a.kind === "program") - Number(b.kind === "program")), error: null };
  }

  if (name === "join_default_room") {
    const room = (db.course_rooms || []).find((row) => row.id === params.p_room_id);
    if (!room || (room.kind !== "university" && room.kind !== "program")) return error("Course space not available");
    db.course_room_optouts = (db.course_room_optouts || []).filter((row) => !(row.user_id === userId && row.room_id === room.id));
    if (!isMember(db, room.id, userId)) {
      db.course_room_members.push({ id: `${room.id}:${userId}`, room_id: room.id, user_id: userId, joined_at: new Date().toISOString() });
    }
    return { data: null, error: null };
  }

  if (name === "join_course_room") {
    if (!offerings.has(params.p_offering_id)) return error("Course space not available");
    let room = roomOf(db, params.p_offering_id);
    if (!room) {
      room = { id: `offline-room-${Date.now()}`, kind: "course", offering_id: params.p_offering_id, created_at: new Date().toISOString() };
      db.course_rooms.push(room);
    }
    if (!isMember(db, room.id, userId)) {
      if ((db.course_room_members || []).filter((row) => row.user_id === userId).length >= 40) return error("Too many course spaces");
      db.course_room_members.push({ id: `${room.id}:${userId}`, room_id: room.id, user_id: userId, joined_at: new Date().toISOString() });
    }
    return { data: room.id, error: null };
  }

  if (name === "leave_course_room") {
    db.course_room_members = (db.course_room_members || []).filter((row) => !(row.room_id === params.p_room_id && row.user_id === userId));
    const room = (db.course_rooms || []).find((row) => row.id === params.p_room_id);
    if (room && (room.kind === "university" || room.kind === "program")) {
      db.course_room_optouts ||= [];
      if (!db.course_room_optouts.some((row) => row.user_id === userId && row.room_id === room.id)) {
        db.course_room_optouts.push({ user_id: userId, room_id: room.id, created_at: new Date().toISOString() });
      }
    }
    return { data: null, error: null };
  }

  if (name === "post_course_room_message") {
    const roomId = params.p_room_id;
    const text = String(params.p_content || "").trim() || null;
    if (!isMember(db, roomId, userId)) return error("Join this course space to post");
    if (!text && !params.p_attachment_url && !params.p_exam_date) return error("Empty message");
    if (text && text.length > 1000) return error("Message too long");
    if (params.p_attachment_url && !String(params.p_attachment_url).startsWith(`community:${userId}/${roomId}/`)) return error("Invalid attachment");
    const mine = (db.community_messages || []).filter((row) => row.user_id === userId && row.room_id);
    if (mine.filter((row) => Date.now() - Date.parse(row.created_at) < 30000).length >= 6) return error("Rate limit exceeded");
    if (text && mine.some((row) => row.room_id === roomId && row.content === text && Date.now() - Date.parse(row.created_at) < 120000)) return error("Duplicate message");
    const row = {
      id: `offline-room-message-${Date.now()}`, room_id: roomId, community: null, user_id: userId, content: text,
      content_type: "discussion", parent_id: null, attachment_url: params.p_attachment_url || null,
      attachment_type: params.p_attachment_url ? params.p_attachment_type : null, attachment_name: params.p_attachment_url ? params.p_attachment_name : null,
      exam_date: params.p_exam_date || null, hidden_at: null, created_at: new Date().toISOString(),
    };
    db.community_messages.push(row);
    return { data: row, error: null };
  }

  if (name === "report_course_message") {
    const target = (db.community_messages || []).find((row) => row.id === params.p_message_id);
    if (!target?.room_id || !isMember(db, target.room_id, userId)) return error("Message not available");
    if (target.user_id === userId) return error("Cannot report your own message");
    if (!db.course_message_reports.some((row) => row.message_id === target.id && row.reporter_id === userId)) {
      db.course_message_reports.push({ message_id: target.id, reporter_id: userId, reason: params.p_reason, created_at: new Date().toISOString(), resolved_at: null });
    }
    return { data: null, error: null };
  }

  if (name === "admin_course_reports") {
    const open = (db.course_message_reports || []).filter((row) => !row.resolved_at);
    const byMessage = new Map();
    open.forEach((report) => byMessage.set(report.message_id, [...(byMessage.get(report.message_id) || []), report]));
    const rows = [...byMessage.entries()].map(([messageId, reports]) => {
      const target = (db.community_messages || []).find((row) => row.id === messageId);
      if (!target) return null;
      const room = (db.course_rooms || []).find((row) => row.id === target.room_id);
      const author = (db.profiles || []).find((row) => row.id === target.user_id);
      return {
        message_id: messageId, room_title: offerings.get(room?.offering_id)?.title || "", institution_id: "UCL",
        author_id: target.user_id, author_pseudo: author?.pseudo || null, content: target.content, attachment_name: target.attachment_name,
        exam_date: target.exam_date, created_at: target.created_at, hidden: !!target.hidden_at, reports: reports.length,
        reasons: [...new Set(reports.map((report) => report.reason))], last_reported_at: reports.map((report) => report.created_at).sort().pop(),
      };
    }).filter(Boolean);
    return { data: rows, error: null };
  }

  if (name === "admin_resolve_course_report") {
    if (params.p_remove) {
      db.community_messages = (db.community_messages || []).filter((row) => row.id !== params.p_message_id);
      db.course_message_reports = (db.course_message_reports || []).filter((row) => row.message_id !== params.p_message_id);
    } else {
      db.course_message_reports = (db.course_message_reports || []).map((row) => row.message_id === params.p_message_id ? { ...row, resolved_at: new Date().toISOString() } : row);
      db.community_messages = (db.community_messages || []).map((row) => row.id === params.p_message_id ? { ...row, hidden_at: null } : row);
    }
    return { data: null, error: null };
  }

  return null;
}
