const OFFLINE_USER_ID = "offline-user-mathias";
const DB_KEY = "bt_offline_db_v2";
const SESSION_KEY = "bt_offline_session_v1";

const today = new Date();
const iso = (daysOffset = 0) => {
  const d = new Date(today);
  d.setDate(d.getDate() + daysOffset);
  return d.toISOString();
};
const dateOnly = (daysOffset = 0) => iso(daysOffset).slice(0, 10);

const offlineUser = {
  id: OFFLINE_USER_ID,
  email: "mathias@offline.local",
  app_metadata: {},
  user_metadata: { pseudo: "mathias" },
  aud: "authenticated",
  role: "authenticated",
};

// Petit générateur pseudo-aléatoire déterministe (mulberry32) : la démo
// offline est riche mais STABLE d'un reseed à l'autre — pratique pour
// verifier le cockpit admin sans que les chiffres sautent à chaque fois.
function makeRng(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Cohorte de démo : ~16 membres repartis sur plusieurs universités, avec
// des dates d'inscription étalées, pour alimenter les graphiques admin.
const DEMO_UNIS = [
  "Université catholique de Louvain", "Universite de Liege",
  "Université libre de Bruxelles", "KU Leuven", "UGent",
  "Université de Namur", "ICHEC Brussels Management School",
  "HEC Liège", "Vrije Universiteit Brussel", "EPHEC",
];
const DEMO_FIELDS = ["Médecine", "Droit", "Ingénierie", "Économie", "Psychologie", "Sciences", "Gestion", "Informatique"];
const DEMO_YEARS = ["BAC 1", "BAC 2", "BAC 3", "Master 1", "Master 2"];
const DEMO_NAMES = [
  ["Emma", "Laurent"], ["Noah", "Dubois"], ["Léa", "Lambert"], ["Louis", "Simon"],
  ["Chloé", "Denis"], ["Gabriel", "Leroy"], ["Jade", "Moreau"], ["Adam", "Fontaine"],
  ["Zoé", "Renard"], ["Lucas", "Girard"], ["Mila", "Bonnet"], ["Hugo", "Henry"],
  ["Alice", "Rousseau"], ["Nathan", "Blanc"],
];

function buildDemoData(rng) {
  const profiles = [];
  const sessions = [];
  const posts = [];
  const messages = [];
  const badges = [];
  const now = Date.now();
  const dayMs = 864e5;

  DEMO_NAMES.forEach(([first, last], i) => {
    const id = `offline-demo-${i}`;
    // Inscriptions étalées sur ~45 jours (les plus récents en premier).
    const signupDay = Math.floor(rng() * 45);
    const createdAt = new Date(now - signupDay * dayMs).toISOString();
    const uni = DEMO_UNIS[Math.floor(rng() * DEMO_UNIS.length)];
    // ~20 % des membres n'ont jamais étudié (utile pour le taux d'activation).
    const isActive = rng() > 0.2;
    const onlineNow = isActive && rng() > 0.8;
    profiles.push({
      id,
      pseudo: first.toLowerCase() + (i + 1),
      email: `${first.toLowerCase()}@demo.local`,
      first_name: first,
      last_name: last,
      university: uni,
      study_field: DEMO_FIELDS[Math.floor(rng() * DEMO_FIELDS.length)],
      study_year: DEMO_YEARS[Math.floor(rng() * DEMO_YEARS.length)],
      bio: "",
      avatar_url: null,
      is_admin: false,
      locked: false,
      planning_public: true,
      lang: "fr",
      timezone: "Europe/Paris",
      bonus_xp: 0,
      referral_code: first.toUpperCase() + (i + 1),
      studying_since: onlineNow ? new Date(now - Math.floor(rng() * 40) * 60000).toISOString() : null,
      created_at: createdAt,
    });

    if (!isActive) return;
    // Sessions étalées entre l'inscription et aujourd'hui.
    const sessionCount = 3 + Math.floor(rng() * 25);
    for (let s = 0; s < sessionCount; s++) {
      const dayAgo = Math.floor(rng() * Math.min(signupDay + 1, 30));
      const startedAt = new Date(now - dayAgo * dayMs - Math.floor(rng() * 12) * 3600000).toISOString();
      sessions.push({
        id: `offline-demo-sess-${i}-${s}`,
        user_id: id,
        course_id: null,
        duration_seconds: (15 + Math.floor(rng() * 150)) * 60,
        note: null,
        started_at: startedAt,
        ended_at: startedAt,
        created_at: startedAt,
      });
    }
    // Quelques posts / messages / badges pour les flux et graphiques.
    if (rng() > 0.6) {
      const at = new Date(now - Math.floor(rng() * 20) * dayMs).toISOString();
      posts.push({ id: `offline-demo-post-${i}`, user_id: id, caption: "Séance de révision 📚", image_url: null, created_at: at });
    }
    if (rng() > 0.5) {
      const at = new Date(now - Math.floor(rng() * 14) * dayMs).toISOString();
      messages.push({ id: `offline-demo-dm-${i}`, sender_id: id, receiver_id: OFFLINE_USER_ID, content: "Salut !", read: rng() > 0.5, created_at: at });
    }
    ["first_session", "streak_3", "hours_10"].forEach((badgeId, bi) => {
      if (rng() > 0.55) {
        const at = new Date(now - Math.floor(rng() * 25) * dayMs).toISOString();
        badges.push({ id: `offline-demo-badge-${i}-${bi}`, user_id: id, badge_id: badgeId, earned_at: at });
      }
    });
  });

  return { profiles, sessions, posts, messages, badges };
}

function makeSeedDb() {
  const course1 = "offline-course-methodo";
  const course2 = "offline-course-bio";
  const otherUser = "offline-user-lina";
  const db = {
    profiles: [
      {
        id: OFFLINE_USER_ID,
        pseudo: "mathias",
        email: "mathias@offline.local",
        first_name: "Mathias",
        last_name: "Dock",
        university: "Université catholique de Louvain",
        study_field: "Médecine",
        study_year: "BAC 2",
        bio: "Mode offline local pour continuer a coder.",
        avatar_url: null,
        is_admin: true,
        planning_public: true,
        lang: "fr",
        timezone: "Europe/Paris",
        bonus_xp: 0,
        referral_code: "MATHIAS",
        studying_since: null,
        created_at: iso(-30),
      },
      {
        id: otherUser,
        pseudo: "lina",
        email: "lina@offline.local",
        first_name: "Lina",
        last_name: "Martin",
        university: "Universite de Liege",
        study_field: "Droit",
        study_year: "BAC 1",
        bio: "Compte de test offline.",
        avatar_url: null,
        is_admin: false,
        planning_public: true,
        lang: "fr",
        timezone: "Europe/Paris",
        bonus_xp: 0,
        referral_code: "LINA",
        studying_since: null,
        created_at: iso(-24),
      },
    ],
    courses: [
      {
        id: course1,
        user_id: OFFLINE_USER_ID,
        name: "Methodologie",
        color: "#14b8a6",
        exam_date: dateOnly(34),
        created_at: iso(-14),
      },
      {
        id: course2,
        user_id: OFFLINE_USER_ID,
        name: "Biologie",
        color: "#6366f1",
        exam_date: dateOnly(39),
        created_at: iso(-10),
      },
    ],
    sessions: [
      {
        id: "offline-session-1",
        user_id: OFFLINE_USER_ID,
        course_id: course1,
        duration_seconds: 3600,
        note: "Revision chapitres 1-2",
        started_at: iso(0),
        ended_at: iso(0),
        created_at: iso(0),
      },
      {
        id: "offline-session-2",
        user_id: OFFLINE_USER_ID,
        course_id: course2,
        duration_seconds: 2700,
        note: "QCM",
        started_at: iso(-1),
        ended_at: iso(-1),
        created_at: iso(-1),
      },
    ],
    objectives: [
      {
        id: "offline-objective-1",
        user_id: OFFLINE_USER_ID,
        course_id: course1,
        title: "Relire les fiches",
        scheduled_date: dateOnly(0),
        done: false,
        created_at: iso(-2),
      },
      {
        id: "offline-objective-2",
        user_id: OFFLINE_USER_ID,
        course_id: course2,
        title: "Finir les exercices",
        scheduled_date: dateOnly(1),
        done: false,
        created_at: iso(-1),
      },
    ],
    exams: [
      {
        id: "offline-exam-1",
        user_id: OFFLINE_USER_ID,
        course_id: course1,
        title: "Examen methodologie",
        exam_date: dateOnly(34),
        created_at: iso(-7),
      },
    ],
    course_checklist_items: [
      {
        id: "offline-check-1",
        user_id: OFFLINE_USER_ID,
        course_id: course1,
        title: "Plan du cours",
        is_done: true,
        created_at: iso(-4),
      },
      {
        id: "offline-check-2",
        user_id: OFFLINE_USER_ID,
        course_id: course1,
        title: "Exercices types",
        is_done: false,
        created_at: iso(-3),
      },
    ],
    friendships: [
      {
        id: "offline-friendship-1",
        requester: otherUser,
        addressee: OFFLINE_USER_ID,
        status: "pending",
        created_at: iso(-1),
      },
    ],
    posts: [
      {
        id: "offline-post-1",
        user_id: otherUser,
        caption: "Session test dans le feed offline.",
        image_url: null,
        created_at: iso(-1),
      },
    ],
    likes: [],
    comments: [],
    private_messages: [
      {
        id: "offline-dm-1",
        sender_id: otherUser,
        receiver_id: OFFLINE_USER_ID,
        content: "Le mode offline marche ?",
        read: false,
        created_at: iso(-1),
      },
    ],
    study_groups: [
      {
        id: "offline-group-1",
        name: "Groupe offline",
        description: "Espace de test local",
        photo_url: null,
        created_by: OFFLINE_USER_ID,
        created_at: iso(-5),
      },
    ],
    group_members: [
      {
        id: "offline-member-1",
        group_id: "offline-group-1",
        user_id: OFFLINE_USER_ID,
        role: "admin",
        joined_at: iso(-5),
        created_at: iso(-5),
      },
    ],
    group_messages: [],
    group_chrono_sessions: [],
    group_chrono_members: [],
    community_messages: [],
    app_feedback: [],
    app_announcements: [
      {
        id: "offline-ann-1",
        title: "Mode offline actif",
        message: "Ces donnees sont locales et servent uniquement au dev.",
        type: "info",
        href: "/dashboard",
        is_active: true,
        created_at: iso(-1),
      },
    ],
    deleted_accounts: [],
    user_badges: [],
    referrals: [],
  };

  // Injecte la cohorte de démo (déterministe) pour alimenter le cockpit admin.
  const demo = buildDemoData(makeRng(20260705));
  db.profiles.push(...demo.profiles);
  db.sessions.push(...demo.sessions);
  db.posts.push(...demo.posts);
  db.private_messages.push(...demo.messages);
  db.user_badges.push(...demo.badges);
  return db;
}

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function newId(prefix) {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function storageAvailable() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

let memoryDb = makeSeedDb();
let listeners = new Set();

function readDb() {
  if (!storageAvailable()) return memoryDb;
  try {
    const raw = localStorage.getItem(DB_KEY);
    if (raw) {
      const db = JSON.parse(raw);
      db.user_badges = (db.user_badges || []).map((badge) => ({
        ...badge,
        earned_at: badge.earned_at || badge.created_at || new Date().toISOString(),
      }));
      return db;
    }
    const seed = makeSeedDb();
    localStorage.setItem(DB_KEY, JSON.stringify(seed));
    return seed;
  } catch {
    return memoryDb;
  }
}

function writeDb(db) {
  memoryDb = db;
  if (storageAvailable()) {
    try {
      localStorage.setItem(DB_KEY, JSON.stringify(db));
    } catch {}
  }
}

function getSession() {
  if (!storageAvailable()) return { user: offlineUser, access_token: "offline-token" };
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return null;
}

function setSession(session) {
  if (storageAvailable()) {
    try {
      localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    } catch {}
  }
  listeners.forEach((cb) => cb("SIGNED_IN", session));
}

function clearSession() {
  if (storageAvailable()) {
    try {
      localStorage.removeItem(SESSION_KEY);
    } catch {}
  }
  listeners.forEach((cb) => cb("SIGNED_OUT", null));
}

function valueFor(row, key) {
  return key.split(".").reduce((obj, part) => obj?.[part], row);
}

function matchesFilter(row, filter) {
  const actual = valueFor(row, filter.column);
  if (filter.op === "eq") return actual === filter.value;
  if (filter.op === "neq") return actual !== filter.value;
  if (filter.op === "in") return (filter.values || []).includes(actual);
  if (filter.op === "ilike") {
    const needle = String(filter.value || "").replaceAll("%", "").toLowerCase();
    return String(actual || "").toLowerCase().includes(needle);
  }
  if (filter.op === "gt") return actual > filter.value;
  if (filter.op === "gte") return actual >= filter.value;
  if (filter.op === "lt") return actual < filter.value;
  if (filter.op === "lte") return actual <= filter.value;
  return true;
}

function matchesOr(row, expression) {
  if (!expression) return true;
  return expression.split(",").some((part) => {
    const [column, op, ...rest] = part.split(".");
    const value = rest.join(".");
    return matchesFilter(row, { column, op, value });
  });
}

function projectRows(rows, columns) {
  if (!columns || columns === "*" || columns.includes("(")) return rows;
  const keys = columns.split(",").map((k) => k.trim()).filter(Boolean);
  return rows.map((row) => Object.fromEntries(keys.map((key) => [key, row[key]])));
}

class OfflineQuery {
  constructor(table) {
    this.table = table;
    this.filters = [];
    this.orExpression = null;
    this.orders = [];
    this.limitCount = null;
    this.rangeFrom = null;
    this.rangeTo = null;
    this.selectColumns = "*";
    this.selectOptions = {};
    this.mode = "select";
    this.payload = null;
    this.singleMode = false;
    this.maybeSingleMode = false;
  }

  select(columns = "*", options = {}) {
    this.selectColumns = columns;
    this.selectOptions = options || {};
    return this;
  }

  insert(payload) {
    this.mode = "insert";
    this.payload = payload;
    return this;
  }

  update(payload) {
    this.mode = "update";
    this.payload = payload;
    return this;
  }

  delete() {
    this.mode = "delete";
    return this;
  }

  upsert(payload) {
    this.mode = "upsert";
    this.payload = payload;
    return this;
  }

  eq(column, value) { this.filters.push({ op: "eq", column, value }); return this; }
  neq(column, value) { this.filters.push({ op: "neq", column, value }); return this; }
  gt(column, value) { this.filters.push({ op: "gt", column, value }); return this; }
  gte(column, value) { this.filters.push({ op: "gte", column, value }); return this; }
  lt(column, value) { this.filters.push({ op: "lt", column, value }); return this; }
  lte(column, value) { this.filters.push({ op: "lte", column, value }); return this; }
  ilike(column, value) { this.filters.push({ op: "ilike", column, value }); return this; }
  in(column, values) { this.filters.push({ op: "in", column, values: values || [] }); return this; }
  or(expression) { this.orExpression = expression; return this; }
  order(column, options = {}) { this.orders.push({ column, ascending: options.ascending !== false }); return this; }
  limit(count) { this.limitCount = count; return this; }
  range(from, to) { this.rangeFrom = from; this.rangeTo = to; return this; }
  single() { this.singleMode = true; return this; }
  maybeSingle() { this.maybeSingleMode = true; return this; }

  then(resolve, reject) {
    return this.execute().then(resolve, reject);
  }

  catch(reject) {
    return this.execute().catch(reject);
  }

  getRows(db) {
    return [...(db[this.table] || [])].filter((row) =>
      this.filters.every((filter) => matchesFilter(row, filter)) && matchesOr(row, this.orExpression)
    );
  }

  async execute() {
    const db = readDb();
    if (!db[this.table]) db[this.table] = [];
    let rows = [];

    if (this.mode === "insert") {
      const payloads = Array.isArray(this.payload) ? this.payload : [this.payload];
      rows = payloads.map((item) => ({
        id: item.id || newId(this.table),
        created_at: item.created_at || new Date().toISOString(),
        ...item,
      }));
      db[this.table].push(...rows);
      writeDb(db);
    } else if (this.mode === "upsert") {
      const payloads = Array.isArray(this.payload) ? this.payload : [this.payload];
      rows = payloads.map((item) => {
        const next = {
          id: item.id || newId(this.table),
          created_at: item.created_at || new Date().toISOString(),
          ...item,
        };
        const index = db[this.table].findIndex((row) => row.id === next.id);
        if (index >= 0) db[this.table][index] = { ...db[this.table][index], ...next };
        else db[this.table].push(next);
        return next;
      });
      writeDb(db);
    } else if (this.mode === "update") {
      rows = this.getRows(db);
      const ids = new Set(rows.map((row) => row.id));
      db[this.table] = db[this.table].map((row) =>
        ids.has(row.id) ? { ...row, ...this.payload, updated_at: new Date().toISOString() } : row
      );
      rows = db[this.table].filter((row) => ids.has(row.id));
      writeDb(db);
    } else if (this.mode === "delete") {
      rows = this.getRows(db);
      const ids = new Set(rows.map((row) => row.id));
      db[this.table] = db[this.table].filter((row) => !ids.has(row.id));
      writeDb(db);
    } else {
      rows = this.getRows(db);
    }

    for (const item of this.orders) {
      rows.sort((a, b) => {
        const av = valueFor(a, item.column);
        const bv = valueFor(b, item.column);
        if (av === bv) return 0;
        return (av > bv ? 1 : -1) * (item.ascending ? 1 : -1);
      });
    }

    const count = rows.length;
    if (this.rangeFrom != null && this.rangeTo != null) rows = rows.slice(this.rangeFrom, this.rangeTo + 1);
    if (this.limitCount != null) rows = rows.slice(0, this.limitCount);

    let data = this.selectOptions.head ? null : projectRows(clone(rows), this.selectColumns);
    if (this.singleMode || this.maybeSingleMode) data = data?.[0] || null;

    return { data, error: null, count, status: 200, statusText: "OK" };
  }
}

function computeReferralStats() {
  const db = readDb();
  const profile = (db.profiles || []).find((item) => item.id === OFFLINE_USER_ID);
  const referrals = (db.referrals || []).filter((item) => item.referrer_id === OFFLINE_USER_ID);

  return {
    ok: true,
    code: profile?.referral_code || "MATHIAS",
    count: referrals.length,
    list: referrals.map((referral) => {
      const referredProfile = (db.profiles || []).find((item) => item.id === referral.referred_id);
      return {
        pseudo: referredProfile?.pseudo || "student",
        avatar_url: referredProfile?.avatar_url || null,
        created_at: referral.created_at,
        xp_awarded: referral.xp_awarded || 300,
      };
    }),
  };
}

function leaderboard() {
  const db = readDb();
  const totals = {};
  for (const session of db.sessions || []) {
    totals[session.user_id] = (totals[session.user_id] || 0) + (session.duration_seconds || 0);
  }
  return Object.entries(totals)
    .map(([user_id, total_seconds], index) => ({ user_id, total_seconds, rank: index + 1 }))
    .sort((a, b) => b.total_seconds - a.total_seconds);
}

// Réplique JS de get_leaderboard_v2 (migration v27) pour la préview offline —
// mêmes paramètres, mêmes règles (métriques time/streak/regularity, portée
// all/friends, filtres école/filière/année, période day/week/month).
function leaderboardV2(params) {
  const db = readDb();
  const period = params.p_period || "week";
  const metric = params.p_metric || "time";
  const scope  = params.p_scope  || "all";
  const nDays  = period === "day" ? 1 : period === "month" ? 30 : 7;

  const dayStr = (offset) => {
    const d = new Date(); d.setDate(d.getDate() - offset);
    return d.toISOString().slice(0, 10);
  };
  const since = dayStr(nDays - 1);
  const today = dayStr(0);
  const yesterday = dayStr(1);

  const friendSet = new Set([OFFLINE_USER_ID]);
  for (const f of db.friendships || []) {
    if (f.status !== "accepted") continue;
    if (f.requester === OFFLINE_USER_ID) friendSet.add(f.addressee);
    if (f.addressee === OFFLINE_USER_ID) friendSet.add(f.requester);
  }

  const rows = (db.profiles || [])
    .filter(p => !params.p_university  || p.university  === params.p_university)
    .filter(p => !params.p_study_field || p.study_field === params.p_study_field)
    .filter(p => !params.p_study_year  || p.study_year  === params.p_study_year)
    .filter(p => scope !== "friends" || friendSet.has(p.id))
    .map(p => {
      const sess = (db.sessions || []).filter(s => s.user_id === p.id);
      const inPeriod = sess.filter(s => (s.started_at || "").slice(0, 10) >= since);
      const days = new Set(sess.map(s => (s.started_at || "").slice(0, 10)));
      let streak = 0;
      if (days.has(today) || days.has(yesterday)) {
        let i = days.has(today) ? 0 : 1;
        while (days.has(dayStr(i))) { streak++; i++; }
      }
      return {
        user_id: p.id,
        pseudo: p.pseudo, first_name: p.first_name, last_name: p.last_name,
        avatar_url: p.avatar_url,
        total_seconds: inPeriod.reduce((a, s) => a + (s.duration_seconds || 0), 0),
        alltime_seconds: sess.reduce((a, s) => a + (s.duration_seconds || 0), 0),
        streak_days: streak,
        active_days: new Set(inPeriod.map(s => (s.started_at || "").slice(0, 10))).size,
      };
    })
    .filter(r => scope === "friends" || (metric === "streak" ? r.streak_days > 0 : r.total_seconds > 0));

  const key = metric === "streak" ? "streak_days" : metric === "regularity" ? "active_days" : "total_seconds";
  rows.sort((a, b) => (b[key] - a[key]) || (b.total_seconds - a.total_seconds));
  return rows.slice(0, 50);
}

export const offlineSupabase = {
  __offline: true,
  from(table) {
    return new OfflineQuery(table);
  },
  rpc(name, params = {}) {
    if (name === "get_my_referral_stats") return Promise.resolve({ data: computeReferralStats(), error: null });
    if (name === "get_public_leaderboard") return Promise.resolve({ data: leaderboard(), error: null });
    if (name === "get_leaderboard_v2") {
      // Escape hatch de test : simule une prod où la migration v27 n'a pas
      // encore été exécutée, pour vérifier le repli legacy du composant.
      if (localStorage.getItem("bt_force_legacy_leaderboard") === "1") {
        return Promise.resolve({ data: null, error: { message: "function get_leaderboard_v2 does not exist" } });
      }
      return Promise.resolve({ data: leaderboardV2(params), error: null });
    }
    if (name === "get_my_study_rank") return Promise.resolve({ data: leaderboard().find((row) => row.user_id === OFFLINE_USER_ID) || null, error: null });
    if (name === "get_my_email") {
      const db = readDb();
      const profile = (db.profiles || []).find((row) => row.id === OFFLINE_USER_ID);
      return Promise.resolve({ data: profile?.email || offlineUser.email || null, error: null });
    }
    if (name === "get_user_profile_stats") {
      const db = readDb();
      const userId = params.p_user_id;
      const total_seconds = (db.sessions || [])
        .filter((row) => row.user_id === userId)
        .reduce((sum, row) => sum + (row.duration_seconds || 0), 0);
      return Promise.resolve({ data: { total_seconds, sessions_count: 0, friends_count: 0 }, error: null });
    }
    if (name === "get_study_comparison") {
      const db = readDb();
      const since = Date.now() - 30 * 864e5;
      const per = {};
      for (const s of db.sessions || []) {
        if (new Date(s.started_at).getTime() < since) continue;
        const m = (per[s.user_id] ||= { secs: 0, sessions: 0, days: new Set() });
        m.secs += s.duration_seconds || 0;
        m.sessions += 1;
        m.days.add((s.started_at || "").slice(0, 10));
      }
      const uniOf = Object.fromEntries((db.profiles || []).map(p => [p.id, p.university]));
      const rows = Object.entries(per).map(([id, m]) => ({
        id, avg_daily_min: m.secs / 60 / 30, sessions: m.sessions, active_days: m.days.size, university: uniOf[id],
      }));
      const me = rows.find(r => r.id === OFFLINE_USER_ID);
      const myUni = uniOf[OFFLINE_USER_ID];
      const agg = (list) => {
        if (list.length < 3) return null;
        const avg = k => list.reduce((a, r) => a + r[k], 0) / list.length;
        return { avg_daily_min: Math.round(avg("avg_daily_min")), sessions: Math.round(avg("sessions") * 10) / 10, active_days: Math.round(avg("active_days") * 10) / 10, n: list.length };
      };
      return Promise.resolve({ data: {
        university: myUni,
        me: me ? { avg_daily_min: Math.round(me.avg_daily_min), sessions: me.sessions, active_days: me.active_days } : { avg_daily_min: 0, sessions: 0, active_days: 0 },
        uni: agg(rows.filter(r => myUni && r.university === myUni)),
        app: agg(rows),
      }, error: null });
    }
    if (name === "admin_get_referral_counts") return Promise.resolve({ data: [], error: null });
    if (name === "admin_get_referrals") return Promise.resolve({ data: [], error: null });
    if (name === "finish_group_chrono") return Promise.resolve({ data: null, error: null });
    if (name === "apply_referral") return Promise.resolve({ data: null, error: null });
    if (name === "self_delete_user" || name === "admin_delete_user") {
      return Promise.resolve({ data: null, error: { message: "Disabled in offline mode" } });
    }
    return Promise.resolve({ data: null, error: null });
  },
  auth: {
    onAuthStateChange(callback) {
      listeners.add(callback);
      setTimeout(() => callback("SIGNED_IN", getSession()), 0);
      return { data: { subscription: { unsubscribe: () => listeners.delete(callback) } } };
    },
    getSession() {
      return Promise.resolve({ data: { session: getSession() }, error: null });
    },
    getUser() {
      return Promise.resolve({ data: { user: getSession()?.user || null }, error: null });
    },
    signInWithPassword() {
      const session = { user: offlineUser, access_token: "offline-token", refresh_token: "offline-refresh" };
      setSession(session);
      return Promise.resolve({ data: { user: offlineUser, session }, error: null });
    },
    signUp() {
      const session = { user: offlineUser, access_token: "offline-token", refresh_token: "offline-refresh" };
      setSession(session);
      return Promise.resolve({ data: { user: offlineUser, session }, error: null });
    },
    setSession() {
      const session = { user: offlineUser, access_token: "offline-token", refresh_token: "offline-refresh" };
      setSession(session);
      return Promise.resolve({ data: { user: offlineUser, session }, error: null });
    },
    updateUser(attrs = {}) {
      const db = readDb();
      db.profiles = (db.profiles || []).map((profile) =>
        profile.id === OFFLINE_USER_ID ? { ...profile, email: attrs.email || profile.email } : profile
      );
      writeDb(db);
      return Promise.resolve({ data: { user: offlineUser }, error: null });
    },
    signOut() {
      clearSession();
      return Promise.resolve({ error: null });
    },
    resetPasswordForEmail() {
      return Promise.resolve({ data: {}, error: null });
    },
    exchangeCodeForSession() {
      return Promise.resolve({ data: { session: getSession() }, error: null });
    },
  },
  storage: {
    from(bucket) {
      return {
        upload(path) {
          return Promise.resolve({ data: { path, fullPath: `${bucket}/${path}` }, error: null });
        },
        getPublicUrl(path) {
          return { data: { publicUrl: `/offline-upload/${bucket}/${path}` } };
        },
      };
    },
  },
  channel() {
    return {
      on() { return this; },
      subscribe(callback) {
        if (typeof callback === "function") setTimeout(() => callback("SUBSCRIBED"), 0);
        return this;
      },
      unsubscribe() { return Promise.resolve("ok"); },
    };
  },
  removeChannel() {
    return Promise.resolve("ok");
  },
};
