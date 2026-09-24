// Aperçu hors ligne de l'admin (NEXT_PUBLIC_OFFLINE_DEV=true) — données de
// DÉMONSTRATION, inventées, jamais chargées en production (lib/adminApi.js ne
// l'importe qu'en mode hors ligne, à la demande).
//
// Les réponses ont exactement la forme des lectures admin_* (v61, v61_3) et
// des routes /api/admin/*, pour vérifier les écrans sans base. Rien n'est
// écrit : un envoi, une suppression ou une annonce répondent « ok » à vide.

import { AUTOMATIONS } from "./pushAutomations.mjs";
import { supabase } from "./supabaseClient";

const HOUR = 3600e3;
const DAY = 24 * HOUR;
const NOW = Date.now();
const iso = (offsetMs) => new Date(NOW + offsetMs).toISOString();

// Générateur déterministe (mulberry32) : les mêmes membres à chaque rechargement.
function rng(seed) {
  let x = (seed * 2654435761) >>> 0;
  return () => {
    x = (x + 0x6d2b79f5) >>> 0;
    let t = x;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 2 ** 32;
  };
}

const PSEUDOS = [
  "lina", "tom", "sarah.m", "noah_b", "ines", "victor", "emma.l", "yanis", "chloe", "adam.k", "lea_v", "hugo",
  "manon", "rayan", "julie.d", "nathan", "camille", "elias", "zoe", "louis_p", "sofia", "maxime", "clara.b",
  "mehdi", "alice", "theo", "jade", "samuel", "nora", "arthur", "eva_g", "lucas", "mila", "gabriel", "anais",
  "karim", "louise", "jules.r", "amira", "robin", "celia", "martin", "lou", "ilyes", "margaux", "paul",
  "salome", "axel", "ambre", "oscar", "leonie", "sacha", "romane", "ethan", "juliette", "nael", "lisa",
  "quentin", "maelys", "bastien", "une-tres-longue-pseudo-pour-tester-le-retour-a-la-ligne", "offline.test",
];
const FIRST = ["Lina", "Tom", "Sarah", "Noah", "Inès", "Victor", "Emma", "Yanis", "Chloé", "Adam", "Léa", "Hugo"];
const LAST = ["Martin", "Dubois", "Lambert", "Peeters", "Janssens", "Leroy", "Maes", "Claes", "Renard", "Simon"];
const UNIS = [
  "Université catholique de Louvain", "Université libre de Bruxelles", "ICHEC Brussels Management School",
  "Université de Liège", "HEC Liège", "Université de Namur", "EPHEC",
];
const YEARS = ["BAC 1", "BAC 2", "BAC 3", "MASTER 1", "MASTER 2"];

const MEMBERS = PSEUDOS.map((pseudo, index) => {
  const r = rng(index + 11);
  const signedUp = NOW - Math.floor(r() * 130 * DAY) - HOUR;
  const hasProfile = r() > 0.1;
  const studies = hasProfile && r() > 0.2;
  const courses = studies ? Math.floor(r() * 7) : 0;
  const real = r() > 0.55 ? Math.floor(r() * 40) + 1 : 0;
  const lastReal = real ? Math.min(NOW - HOUR, signedUp + Math.floor(r() * (NOW - signedUp))) : null;
  const total = real * (1800 + Math.floor(r() * 5400));
  const d30 = lastReal && NOW - lastReal < 30 * DAY ? Math.floor(total * r() * 0.5) : 0;
  const d7 = lastReal && NOW - lastReal < 7 * DAY ? Math.floor(d30 * r() * 0.6) : 0;
  const firstReal = real ? signedUp + Math.floor(r() * 12 * DAY) : null;
  const windowEnd = signedUp + 7 * DAY;
  const activation = firstReal && firstReal < windowEnd ? "activated"
    : NOW < windowEnd ? "pending" : firstReal ? "late" : "not_activated";
  return {
    user_id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
    pseudo,
    first_name: hasProfile ? FIRST[index % FIRST.length] : null,
    last_name: hasProfile ? LAST[index % LAST.length] : null,
    avatar_url: null,
    university: hasProfile ? UNIS[index % UNIS.length] : null,
    study_year: studies ? YEARS[index % YEARS.length] : null,
    signed_up_at: new Date(signedUp).toISOString(),
    has_profile: hasProfile,
    suspended: index === 7,
    placeholder_email: index % 9 === 4,
    email_confirmed: index % 5 !== 2,
    studies_completed: studies,
    courses_count: courses,
    real_sessions: real,
    real_days: Math.max(0, Math.min(real, Math.ceil(real * 0.7))),
    first_real_session_at: firstReal ? new Date(firstReal).toISOString() : null,
    last_real_session_at: lastReal ? new Date(lastReal).toISOString() : null,
    real_seconds_7d: d7,
    real_seconds_30d: d30,
    real_seconds_total: total,
    activation_status: activation,
    returned_week2: NOW < signedUp + 14 * DAY ? null : Boolean(firstReal && r() > 0.5),
    active_7d: d7 > 0,
    dormant: Boolean(lastReal && NOW - lastReal > 30 * DAY),
  };
});

const fold = (text) => String(text || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

function segmentOf(m) {
  return {
    all: true,
    active: !m.suspended && m.active_7d,
    no_real_session: !m.suspended && m.real_sessions === 0,
    dormant: !m.suspended && m.dormant,
    incomplete_signup: !m.suspended && (!m.has_profile || !m.studies_completed || m.courses_count === 0),
    placeholder_email: !m.suspended && m.placeholder_email,
    suspended: m.suspended,
  };
}

function members({ p_search, p_segment = "all", p_sort = "signup_desc", p_limit = 50, p_offset = 0 }) {
  const needle = fold(String(p_search || "").trim().replace(/^@+/, ""));
  const searched = MEMBERS.filter((m) => !needle
    || fold(m.pseudo).includes(needle)
    || fold(`${m.first_name || ""} ${m.last_name || ""}`).includes(needle)
    || fold(m.university).includes(needle)
    || m.user_id === needle);
  const counts = Object.fromEntries(Object.keys(segmentOf(MEMBERS[0])).map((key) => [key, searched.filter((m) => segmentOf(m)[key]).length]));
  const picked = searched.filter((m) => segmentOf(m)[p_segment]);
  const by = {
    signup_desc: (a, b) => b.signed_up_at.localeCompare(a.signed_up_at),
    signup_asc: (a, b) => a.signed_up_at.localeCompare(b.signed_up_at),
    last_session_desc: (a, b) => (b.last_real_session_at || "").localeCompare(a.last_real_session_at || ""),
    time_30d_desc: (a, b) => b.real_seconds_30d - a.real_seconds_30d,
    time_total_desc: (a, b) => b.real_seconds_total - a.real_seconds_total,
    pseudo_asc: (a, b) => fold(a.pseudo).localeCompare(fold(b.pseudo)),
  }[p_sort];
  const ordered = [...picked].sort(by);
  const rows = p_limit === null ? ordered.slice(p_offset) : ordered.slice(p_offset, p_offset + p_limit);
  return {
    generated_at: iso(0), segment: p_segment, sort: p_sort, search: needle || null, limit: p_limit, offset: p_offset,
    total: picked.length, counts, rows,
  };
}

function memberDetail({ p_user }) {
  const m = MEMBERS.find((item) => item.user_id === p_user);
  if (!m) return null;
  const r = rng(m.pseudo.length * 7);
  return {
    generated_at: iso(0),
    user_id: m.user_id,
    account: {
      signed_up_at: m.signed_up_at, last_sign_in_at: iso(-Math.floor(r() * 9 * DAY)),
      email_confirmed: m.email_confirmed, placeholder_email: m.placeholder_email,
      has_profile: m.has_profile, is_admin: false, suspended: m.suspended,
    },
    profile: {
      pseudo: m.pseudo, first_name: m.first_name, last_name: m.last_name, avatar_url: null,
      university: m.university, broad_field: m.has_profile ? "Sciences économiques" : null,
      study_field: m.has_profile ? "Ingénieur de gestion" : null, study_year: m.study_year,
      bio: null, lang: "fr", timezone: "Europe/Brussels", referral_code: null, studies_completed: m.studies_completed,
    },
    activation: {
      status: m.activation_status,
      window_ends_at: new Date(new Date(m.signed_up_at).getTime() + 7 * DAY).toISOString(),
      first_real_session_at: m.first_real_session_at,
      hours_to_first_real_session: m.first_real_session_at
        ? (new Date(m.first_real_session_at) - new Date(m.signed_up_at)) / HOUR : null,
      returned_week2: m.returned_week2,
      return_window_ends_at: new Date(new Date(m.signed_up_at).getTime() + 14 * DAY).toISOString(),
    },
    study: {
      real_sessions: m.real_sessions, short_sessions: Math.floor(r() * 4), real_days: m.real_days,
      last_real_session_at: m.last_real_session_at, real_seconds_7d: m.real_seconds_7d,
      real_seconds_30d: m.real_seconds_30d, real_seconds_total: m.real_seconds_total,
      long_sessions_total: m.real_sessions > 30 ? 1 : 0, active_7d: m.active_7d, dormant: m.dormant,
    },
    courses: { total: m.courses_count, active: Math.max(0, m.courses_count - 1), upcoming_exams: Math.floor(r() * 3), objectives_30d: Math.floor(r() * 9) },
    social: { friends: Math.floor(r() * 6), course_rooms: Math.floor(r() * 4), course_room_posts_30d: Math.floor(r() * 3), groups: Math.floor(r() * 2), referrals: 0 },
    level: m.real_sessions ? { level: 1 + Math.floor(m.real_seconds_total / 36000), total_xp: Math.floor(m.real_seconds_total / 60), streak: Math.floor(r() * 5) } : null,
    push: { failures_30d: m.pseudo === "lina" ? 2 : 0, last_failure: m.pseudo === "lina" ? { at: iso(-2 * DAY), reason: "blocked" } : null },
    recent_sessions: Array.from({ length: Math.min(10, m.real_sessions + 1) }, (_, index) => ({
      started_at: iso(-(index + 1) * 1.3 * DAY - index * HOUR),
      duration_seconds: index === 2 ? 420 : 1500 + Math.floor(rng(index + 3)() * 6000),
      real: index !== 2,
    })),
    admin_actions: m.suspended
      ? [{ at: iso(-3 * DAY), action: "member_suspended", reason: "Spam répété dans les salles de cours", actor_pseudo: "mathias", actor_kind: "admin" }]
      : [],
  };
}

function cohorts() {
  const rows = [];
  const weekMs = 7 * DAY;
  const monday = new Date(NOW);
  monday.setUTCHours(12, 0, 0, 0);
  monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7));
  const sizes = [6, 41, 12, 3, 0, 1, 2, 4, 9, 5, 2, 7, 3, 1, 6, 2];
  sizes.forEach((size, index) => {
    const start = new Date(monday.getTime() - (sizes.length - 1 - index) * weekMs);
    const end = start.getTime() - 12 * HOUR + weekMs;
    const actDone = NOW >= end + weekMs;
    const retDone = NOW >= end + 2 * weekMs;
    const activated = Math.round(size * (0.25 + (index % 4) * 0.1));
    const returned = Math.round(activated * 0.5);
    const deleted = index === 1 ? 2 : 0;
    const unknown = index === 3 ? 1 : 0;
    rows.push({
      week_start: start.toISOString().slice(0, 10),
      accounts: size - deleted, deleted, cohort_size: size,
      activation: {
        complete: actDone, complete_at: new Date(end + weekMs).toISOString(),
        activated: actDone && !unknown ? activated : null,
        rate: actDone && !unknown && size >= 5 ? Math.round((activated / size) * 1e4) / 1e4 : null,
      },
      return_week2: {
        complete: retDone, complete_at: new Date(end + 2 * weekMs).toISOString(),
        returned: retDone && !unknown ? returned : null, unknown,
        rate: retDone && !unknown && size >= 5 ? Math.round((returned / size) * 1e4) / 1e4 : null,
      },
    });
  });
  return rows;
}

const ACTIVATION = () => ({
  generated_at: iso(0),
  definitions: {
    timezone: "Europe/Brussels", real_session_seconds: 600, activation_hours: 168, return_window_hours: [168, 336],
    active_window_hours: 168, usage_window_hours: 720, min_cohort_size: 5, long_session_seconds: 28800,
  },
  funnel: {
    accounts: 104, profile_created: 92, studies_completed: 71, course_added: 83, real_session: 38, real_days_2: 27, real_days_5: 19,
    activation: { eligible: 98, activated: 36, rate: 0.3673 },
    return_week2: { eligible: 95, returned: 17, rate: 0.1789 },
  },
  cohorts: cohorts(),
  deletions: { total: 9, in_cohorts: 2, without_signup_week: 7, excluded: 0 },
  feature_usage: {
    active_30d: 14, planning: 6, friends: 8, course_rooms: 2,
    planning_rate: 0.4286, friends_rate: 0.5714, course_rooms_rate: 0.1429,
  },
});

const TODAY = () => ({
  generated_at: iso(0), timezone: "Europe/Brussels", real_session_seconds: 600,
  window: { previous_start: iso(-14 * DAY), current_start: iso(-7 * DAY), end: iso(0) },
  members: { accounts: 104, suspended: 1 },
  active_members: { current: 7, previous: 5 },
  new_accounts: { current: 4, previous: 6 },
  study_seconds: { current: 101340, previous: 76020, long_sessions_current: 1, long_session_seconds_current: 33120 },
  latest_complete_cohort: { week_start: cohorts().at(-3).week_start, cohort_size: 2, activated: 1, activation_rate: null, small: true },
  queue: { open_reports: 1, new_feedback: 2, push_failures_7d: 3, push_failure_members_7d: 1 },
  jobs: [
    { job: "purge_posts", last_started_at: iso(-9 * HOUR), last_finished_at: iso(-9 * HOUR + 4000), last_status: "ok", overdue: false },
    { job: "push_daily", last_started_at: null, last_finished_at: null, last_status: null, overdue: false },
  ],
});

const SYSTEM = () => ({
  generated_at: iso(0),
  jobs: [
    {
      job: "purge_posts", overdue: false,
      runs: [0, 1, 2].map((d) => ({
        started_at: iso(-9 * HOUR - d * DAY), finished_at: iso(-9 * HOUR - d * DAY + 3800),
        status: "ok", details: { posts: 3 - d, files: 2 - Math.min(d, 2), more: false },
      })),
    },
    { job: "push_daily", overdue: false, runs: [] },
  ],
  push_failures: {
    failures_7d: 3, members_7d: 1, failures_30d: 5, last_at: iso(-2 * DAY),
    by_reason: [{ reason: "blocked", count: 4 }, { reason: "sdk_error", count: 1 }],
  },
  functions: {
    since: iso(-80 * DAY),
    rows: [
      { name: "get_gamification_levels", calls: 12480, mean_ms: 1810.4, max_ms: 7702.1, flag: "near_timeout" },
      { name: "admin_members", calls: 212, mean_ms: 640.2, max_ms: 1422.9, flag: "slow" },
      { name: "admin_today", calls: 180, mean_ms: 142.7, max_ms: 388.5, flag: null },
      { name: "course_space_summaries", calls: 3301, mean_ms: 38.1, max_ms: 910.4, flag: null },
    ],
  },
  anomalies: {
    long_sessions: 12, long_sessions_members: 8, long_sessions_7d: 1, long_sessions_excess_seconds: 151200,
    over_12h_sessions: 4, short_sessions: 57, short_sessions_seconds: 11020, overlapping_pairs: 3,
    overlapping_members: 2, sessions_before_signup: 1, accounts_without_profile: 12,
    accounts_without_profile_with_data: 3, placeholder_emails: 7, deletions_without_week: 7,
  },
});

const AUDIT = [
  { action: "member_suspended", target: MEMBERS[7], reason: "Spam répété dans les salles de cours", at: -3 * DAY },
  { action: "push_sent", reason: null, at: -4 * DAY, details: { scope: "all", title: "Bonne session d'examens", recipients: 148 } },
  { action: "report_context_viewed", target: MEMBERS[1], reason: null, at: -5 * DAY },
  { action: "announcement_created", reason: null, at: -6 * DAY, details: { title: "Nouveau : les salles de cours" } },
  { action: "feedback_status_changed", reason: null, at: -6 * DAY - HOUR, details: { from: "new", to: "done" } },
  { action: "account_deleted", reason: "Demande du membre par email", at: -12 * DAY },
].map((row, index) => ({
  id: 100 - index,
  at: iso(row.at),
  action: row.action,
  actor_kind: "admin",
  actor_pseudo: "mathias",
  target_user_id: row.target?.user_id || (row.action === "account_deleted" ? "00000000-0000-4000-8000-999999999999" : null),
  target_pseudo: row.target?.pseudo || null,
  target_type: row.target ? "user" : null,
  target_id: null,
  reason: row.reason,
  details: row.details || {},
}));

function auditPage({ p_limit = 50, p_offset = 0, p_action = null }) {
  const rows = AUDIT.filter((row) => !p_action || row.action === p_action);
  return {
    total: rows.length,
    actions: [...new Set(AUDIT.map((row) => row.action))].sort(),
    rows: rows.slice(p_offset, p_offset + p_limit),
  };
}

// ── Registre des notifications (v62) ────────────────────────────────────
const AUTHOR = { author_id: "offline-user-mathias", author_pseudo: "mathias" };
const TXT = (fr, en) => ({ fr, en: en || fr });
const SENDS = [
  { id: "10000000-0000-4000-8000-000000000001", created_at: iso(-2 * HOUR), source: "automation", category: "reminder", kind: "streak_at_risk", trigger: "cron:push_daily", target_type: "automation", target_label: null, title: TXT("Ta série de {days} jours est en danger 🔥", "Your {days}-day streak is at risk 🔥"), body: TXT("Même une petite session peut suffire pour la continuer.", "Even a short session can keep it going."), url: "/dashboard", langs: ["fr", "en"], status: "sent", targeted: 14, excluded: { category_off: 1, frequency: 2, duplicate: 0 }, eligible: 11, sent: 11, failed: 0, onesignal_batches: 1, delivery: { successful: 13, failed: 1, errored: 0, remaining: 0, fetched_at: iso(-HOUR) } },
  { id: "10000000-0000-4000-8000-000000000002", created_at: iso(-2 * HOUR), source: "automation", category: "reminder", kind: "exam_tomorrow", trigger: "cron:push_daily", target_type: "automation", target_label: null, title: TXT("{exams} demain{at} 📚", "{exams} tomorrow{at} 📚"), body: TXT("Une dernière révision aujourd'hui et tu seras prêt.", "One last review today and you'll be ready."), url: "/planning", langs: ["fr", "en"], status: "sent", targeted: 6, excluded: { unreachable: 2 }, eligible: 6, sent: 4, failed: 0, onesignal_batches: 1, delivery: null },
  { id: "10000000-0000-4000-8000-000000000003", created_at: iso(-7 * HOUR), source: "social", category: "social", kind: "friend_request", trigger: "friendship", target_type: "event", target_label: null, title: TXT("{name} veut t'ajouter 👋", "{name} wants to add you 👋"), body: TXT("Tu as reçu une nouvelle demande d'ami.", "You have a new friend request."), url: "/messages?tab=relations", langs: ["fr", "en"], status: "sent", targeted: 1, excluded: {}, eligible: 1, sent: 1, failed: 0, onesignal_batches: 1, delivery: null },
  { id: "10000000-0000-4000-8000-000000000008", created_at: iso(-50 * 60_000), source: "social", category: "social", kind: "private_message", trigger: "private_message", target_type: "event", target_label: null, title: TXT("{name} t'a envoyé un message 💬", "{name} sent you a message 💬"), body: TXT("Ouvre BLOCUS TRACKER pour répondre.", "Open BLOCUS TRACKER to reply."), url: "/messages", langs: ["fr", "en"], status: "sent", targeted: 1, excluded: {}, eligible: 1, sent: 1, failed: 0, onesignal_batches: 1, delivery: null },
  { id: "10000000-0000-4000-8000-000000000009", created_at: iso(-5 * HOUR), source: "social", category: "social", kind: "friend_accepted", trigger: "friendship_accepted", target_type: "event", target_label: null, title: TXT("{name} a accepté ta demande 🤝", "{name} accepted your request 🤝"), body: TXT("Vous êtes maintenant amis sur BLOCUS TRACKER.", "You're now friends on BLOCUS TRACKER."), url: "/messages", langs: ["fr", "en"], status: "sent", targeted: 1, excluded: {}, eligible: 1, sent: 1, failed: 0, onesignal_batches: 1, delivery: null },
  { id: "10000000-0000-4000-8000-000000000004", created_at: iso(-26 * HOUR), source: "admin", ...AUTHOR, category: "announcement", kind: "admin_message", trigger: "admin:composer", target_type: "all", target_label: null, title: TXT("Bonne session d'examens", "Good luck with your exams"), body: TXT("Les salles de cours de ton établissement sont ouvertes.", "Your school's course rooms are open."), url: "/communautes", langs: ["fr", "en"], status: "sent", targeted: 212, excluded: { general_off: 3, category_off: 9, suspended: 1 }, eligible: 199, sent: 199, failed: 0, onesignal_batches: 1, delivery: null },
  { id: "10000000-0000-4000-8000-000000000005", created_at: iso(-30 * HOUR), source: "admin", ...AUTHOR, category: "announcement", kind: "admin_message", trigger: "admin:composer", target_type: "university", target_label: "ICHEC Brussels Management School", title: TXT("Semaine de blocus", "Study week"), body: TXT("Les salles de l'ICHEC ouvrent à 8 h toute la semaine."), url: null, langs: ["fr"], scheduled_for: iso(2 * DAY), status: "scheduled", targeted: 23, excluded: { category_off: 1 }, eligible: 22, sent: 22, failed: 0, onesignal_batches: 1, delivery: null },
  { id: "10000000-0000-4000-8000-000000000006", created_at: iso(-3 * DAY), source: "admin", ...AUTHOR, category: "test", kind: "admin_test", trigger: "admin:test", target_type: "self", target_label: null, title: TXT("Test"), body: TXT("Est-ce que ça arrive ?"), url: null, langs: ["fr"], status: "sent", targeted: 1, excluded: {}, eligible: 1, sent: 1, failed: 0, onesignal_batches: 1, delivery: null },
  { id: "10000000-0000-4000-8000-000000000007", created_at: iso(-4 * DAY), source: "automation", category: "reminder", kind: "reactivation_7d", trigger: "cron:push_daily", target_type: "automation", target_label: null, title: TXT("On reprend le rythme ? 👋", "Ready to get back into it? 👋"), body: TXT("Une petite session suffit pour repartir.", "A short session is all it takes to restart."), url: "/dashboard", langs: ["fr", "en"], status: "partial", targeted: 2400, excluded: { frequency: 3 }, eligible: 2397, sent: 2000, failed: 397, onesignal_batches: 1, error: "onesignal_unavailable", delivery: null },
];
const SEND_ANNOUNCEMENT = { "10000000-0000-4000-8000-000000000004": null };

function notificationSends({ p_source, p_from, p_author, p_limit = 20, p_offset = 0 }) {
  const from = p_from ? new Date(p_from).getTime() : null;
  const rows = SENDS.filter((row) => (!p_source || row.source === p_source)
    && (!from || new Date(row.created_at).getTime() >= from)
    && (!p_author || row.author_id === p_author));
  return {
    rows: rows.slice(p_offset, p_offset + p_limit).map((row) => ({ announcement_id: SEND_ANNOUNCEMENT[row.id] ?? null, scheduled_for: null, error: null, ...row })),
    total: rows.length,
    authors: [{ id: AUTHOR.author_id, pseudo: AUTHOR.author_pseudo }],
    generated_at: iso(0),
  };
}

function memberNotifications({ p_user }) {
  const m = MEMBERS.find((row) => row.user_id === p_user) || MEMBERS[0];
  const quiet = m.pseudo === "tom";
  return {
    user_id: m.user_id,
    exists: true,
    suspended: Boolean(m.suspended),
    prefs: { push_enabled: !quiet, push_reminders: true, push_social: m.pseudo !== "lina", push_announcements: true, updated_at: iso(-5 * DAY), recorded: true },
    devices: m.pseudo === "lina" ? [] : [
      { platform: "ios", standalone: true, status: "active", created_at: iso(-20 * DAY), last_seen_at: iso(-3 * HOUR), detached_at: null },
      { platform: "macos", standalone: false, status: "detached", created_at: iso(-40 * DAY), last_seen_at: iso(-9 * DAY), detached_at: iso(-9 * DAY) },
    ],
    last_diagnostic: m.pseudo === "lina" ? { at: iso(-2 * DAY), reason: "blocked" } : null,
    recent: [
      { at: iso(-2 * HOUR), category: "reminder", kind: "streak_at_risk", status: "sent", source: "automation", title: TXT("Ta série de {days} jours est en danger 🔥") },
      { at: iso(-26 * HOUR), category: "announcement", kind: "admin_message", status: "sent", source: "admin", title: TXT("Bonne session d'examens") },
      { at: iso(-4 * DAY), category: "reminder", kind: "reactivation_7d", status: "failed", source: "automation", title: TXT("On reprend le rythme ? 👋") },
    ],
    generated_at: iso(0),
  };
}

const READS = {
  admin_today: TODAY,
  admin_members: members,
  admin_member_detail: memberDetail,
  admin_activation: ACTIVATION,
  admin_system: SYSTEM,
  admin_audit_page: auditPage,
  admin_notification_sends: notificationSends,
  admin_member_notifications: memberNotifications,
};

export async function offlineAdminRpc(name, params = {}) {
  const read = READS[name];
  // Signalements des espaces de cours : déjà simulés par le client hors ligne.
  if (!read) {
    const { data, error } = await supabase.rpc(name, params);
    return { data, error: error ? "failed" : null };
  }
  await new Promise((resolve) => setTimeout(resolve, 180));
  const data = read(params);
  return data ? { data, error: null } : { data: null, error: "failed" };
}

const PUSH = () => ({
  configured: true,
  app: { total: 212, messageable: 148 },
  universities: UNIS.map((name, index) => ({ name, members: 3 + ((index * 5) % 11) })).sort((a, b) => a.name.localeCompare(b.name, "fr")),
});

// « Qui recevra » : mêmes champs que la route, chiffres inventés mais cohérents.
function offlineAudience(target) {
  if (target?.type === "university") {
    const index = Math.max(0, UNIS.indexOf(target.university));
    const targeted = 3 + ((index * 5) % 11);
    return { targeted, excluded: { category_off: 1 }, eligible: targeted - 1, reachable: Math.max(0, targeted - 4), devices: Math.max(0, targeted - 3) };
  }
  if (target?.type === "users") {
    const n = (target.userIds || []).length;
    return { targeted: n, excluded: {}, eligible: n, reachable: Math.max(0, n - 1), devices: Math.max(0, n - 1) };
  }
  return { targeted: 212, excluded: { general_off: 3, category_off: 9, suspended: 1 }, eligible: 199, reachable: 131, devices: 148 };
}

const AUTOMATION_STATUS = () => ({
  cap: 2,
  capRange: [1, 2],
  capUpdatedAt: iso(-10 * DAY),
  lastRun: {
    started_at: iso(-2 * HOUR), finished_at: iso(-2 * HOUR + 4000), status: "ok",
    details: {
      date: iso(-2 * HOUR).slice(0, 10), cap: 2, evaluated: 41, planned: 20, eligible: 17, sent: 15, failed: 0,
      skipped: { nothing: 19, quiet_hours: 1, already_sent: 1 },
      excluded: { category_off: 1, frequency: 2, unreachable: 2 },
      kinds: {},
    },
  },
  nextRunAt: new Date(Date.UTC(new Date(NOW).getUTCFullYear(), new Date(NOW).getUTCMonth(), new Date(NOW).getUTCDate() + (new Date(NOW).getUTCHours() >= 18 ? 1 : 0), 18)).toISOString(),
  stats: {
    streak_at_risk: { sends30d: 24, sent30d: 61, failed30d: 0, lastSentAt: iso(-2 * HOUR), sent7d: 18, failed7d: 0 },
    exam_tomorrow: { sends30d: 9, sent30d: 17, failed30d: 0, lastSentAt: iso(-2 * HOUR), sent7d: 6, failed7d: 0 },
    exam_in_7_days: { sends30d: 5, sent30d: 8, failed30d: 0, lastSentAt: iso(-26 * HOUR), sent7d: 3, failed7d: 0 },
    first_activation_start: { sends30d: 4, sent30d: 5, failed30d: 0, lastSentAt: iso(-3 * DAY), sent7d: 2, failed7d: 0 },
    reactivation_7d: { sends30d: 12, sent30d: 2030, failed30d: 397, lastSentAt: iso(-4 * DAY), sent7d: 2000, failed7d: 397 },
    friend_request: { sends30d: 3, sent30d: 3, failed30d: 0, lastSentAt: iso(-7 * HOUR), sent7d: 1, failed7d: 0 },
    friend_accepted: { sends30d: 2, sent30d: 2, failed30d: 0, lastSentAt: iso(-5 * HOUR), sent7d: 1, failed7d: 0 },
    private_message: { sends30d: 9, sent30d: 9, failed30d: 0, lastSentAt: iso(-50 * 60_000), sent7d: 4, failed7d: 0 },
  },
  statsAvailable: true,
});

const DRY_RUN = () => ({
  date: iso(0).slice(0, 10), dryRun: true, cap: 2, evaluated: 41, planned: 19, eligible: 16, sent: 0, failed: 0,
  skipped: { nothing: 21, quiet_hours: 1, already_sent: 0 },
  excluded: { category_off: 1, frequency: 2 },
  kinds: {},
  members: {
    exam_tomorrow: { total: 4, pseudos: ["chloe", "ines", "nathan", "zoe"] },
    streak_at_risk: { total: 6, pseudos: ["adam.k", "camille", "elias", "hugo", "lea_v", "lina"] },
    exam_in_7_days: { total: 2, pseudos: ["noah_b", "sarah.m"] },
    first_activation_start: { total: 1, pseudos: ["yanis"] },
    reactivation_7d: { total: 3, pseudos: ["manon", "rayan", "victor"] },
  },
});

const EGRESS = () => ({
  generatedAt: iso(0),
  limits: { rowLimit: 5000, maxFilesPerBucket: 2000, storagePageSize: 100 },
  scan: { warnings: [], referenceScanComplete: {} },
  posts: { active: 14, expired: 38, activeWithImage: 6, expiredWithImage: 2, scanned: 52, complete: true },
  buckets: {
    posts: { count: 21, totalBytes: 6_200_000, averageBytes: 295_000, p90Bytes: 610_000, orphanCount: 2, recent24h: 1 },
    avatars: { count: 88, totalBytes: 9_100_000, averageBytes: 103_000, p90Bytes: 240_000, orphanCount: 4, recent24h: 2 },
    dm: { count: 12, totalBytes: 2_300_000, averageBytes: 191_000, p90Bytes: 400_000, orphanCount: null, recent24h: 0 },
    community: { count: 5, totalBytes: 840_000, averageBytes: 168_000, p90Bytes: 300_000, orphanCount: 0, recent24h: 0 },
    group: { count: 0, totalBytes: 0, averageBytes: 0, p90Bytes: 0, orphanCount: 0, recent24h: 0 },
  },
  heavy: {
    over500Kb: 3, over1Mb: 1,
    top: [
      { bucket: "posts", path: "offline-user-lina/1726990000000.jpg", sizeBytes: 1_320_000, status: "orphan" },
      { bucket: "avatars", path: "offline-user-tom/avatar-1726000000000.webp", sizeBytes: 640_000, status: "referenced" },
    ],
  },
});

const CLEANUP = () => ({
  generatedAt: iso(0),
  candidates: [
    { id: "c1", bucket: "posts", path: "offline-user-lina/1726990000000.jpg", sizeBytes: 1_320_000, category: "posts_orphan", reasonKey: "", safeDelete: true },
    { id: "c2", bucket: "avatars", path: "offline-user-noah/avatar-old.webp", sizeBytes: 120_000, category: "avatar_orphan", reasonKey: "", safeDelete: true },
    { id: "c3", bucket: "dm", path: "offline-conv/attachment.png", sizeBytes: 90_000, category: "dm_manual_only", reasonKey: "", safeDelete: false },
  ],
  summary: { candidateCount: 3, safeCount: 2, blockedCount: 1, previewSizeBytes: 1_530_000, safeSizeBytes: 1_440_000, dmPreviewCount: 1 },
  warnings: [],
  limits: { rowLimit: 5000, maxFilesPerBucket: 2000, maxDeleteIds: 100 },
});

export async function offlineAdminApi(path, { method = "GET", body } = {}) {
  await new Promise((resolve) => setTimeout(resolve, 220));
  if (path === "/api/admin/push") {
    if (method === "GET") return { data: PUSH(), error: null };
    if (method === "DELETE") return { data: { ok: true }, error: null };
    const action = body?.action;
    if (action === "preview") return { data: { audience: offlineAudience(body.target) }, error: null };
    if (action === "test") return { data: { ok: true, status: "sent", reachable: true }, error: null };
    if (action === "delivery") return { data: { delivery: { successful: 11, failed: 1, errored: 0, remaining: 0, fetched_at: iso(0) } }, error: null };
    const audience = action === "announcement" ? offlineAudience({ type: "all" }) : offlineAudience(body?.target);
    return {
      data: {
        ok: true,
        status: body?.sendAfter ? "scheduled" : "sent",
        sendId: "10000000-0000-4000-8000-0000000000ff",
        audience,
        counts: { claimed: audience.eligible, duplicates: 0, sent: audience.eligible, failed: 0, unreachable: 0 },
      },
      error: null,
    };
  }
  if (path === "/api/admin/push-automations") {
    if (method === "PUT") return { data: { ok: true }, error: null };
    if (method === "POST") return { data: { preview: DRY_RUN() }, error: null };
    return {
      data: {
        automations: AUTOMATIONS.map((a) => ({
          key: a.key, category: a.category, schedule: a.schedule, nature: a.nature, priority: a.priority ?? null,
          fixedUrl: Boolean(a.linkParam), label: a.label, trigger: a.trigger, vars: a.vars,
          defaults: { title: a.title, body: a.body, url: a.url },
          current: { enabled: true, title: a.title, body: a.body, url: a.url },
        })),
        status: AUTOMATION_STATUS(),
      },
      error: null,
    };
  }
  if (/^\/api\/admin\/members\/[^/]+\/notifications$/.test(path)) {
    const lina = path.includes(MEMBERS.find((m) => m.pseudo === "lina")?.user_id || "none");
    return {
      data: lina
        ? { checked: true, found: true, reachable: false, subscriptions: [{ type: "SafariPush", enabled: false, lastActive: iso(-12 * DAY) }], checkedAt: iso(0) }
        : { checked: true, found: true, reachable: true, subscriptions: [{ type: "SafariPush", enabled: true, lastActive: iso(-3 * HOUR) }, { type: "ChromePush", enabled: false, lastActive: iso(-9 * DAY) }], checkedAt: iso(0) },
      error: null,
    };
  }
  if (path === "/api/admin/egress-guard") return { data: EGRESS(), error: null };
  if (path === "/api/admin/storage-cleanup") {
    if (method === "POST") return { data: { deletedCount: (body?.ids || []).length, deletedBytes: 1_440_000, skippedCount: 0, errors: [], deleted: [] }, error: null };
    return { data: CLEANUP(), error: null };
  }
  return { data: null, error: "failed" };
}
