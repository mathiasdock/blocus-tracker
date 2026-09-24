// Mode hors ligne (build de démonstration) : la même cloche que la
// production, calculée sur la base locale avec les règles de la migration v64 :
//   • une demande en attente, une annonce active restent tant qu'elles sont
//     vraies ; le reste suit une fenêtre de 60 jours ;
//   • un message privé = une entrée par expéditeur, sans son texte ;
//   • auteur suspendu ou bloqué : rien ;
//   • lu = avant la date butoir de « tout marquer comme lu », ou ouvert après
//     la dernière mise à jour, ou conversation déjà lue dans Messages.
//
// Les identifiants locaux (« offline-post-mine ») ne sont pas des UUID : ils
// sont convertis en UUID stables pour avoir la forme exacte des clés réelles.
//
// `?bt_notif=demo|few|empty|many|long` remplace la base locale par un jeu fixe,
// pour vérifier chaque état à l'écran. Leur lu / non lu reste bien stocké.

const DAY_MS = 24 * 3600 * 1000;
const WINDOW_MS = 60 * DAY_MS;
export const OFFLINE_NOTIFICATION_RPCS = new Set([
  "notification_inbox", "notification_summary", "notification_mark_read", "notification_mark_all_read",
]);
const KEY_RE = /^(friend_request|friend_accepted|private_message|comment|reaction|announcement):[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

// FNV-1a, quatre graines → 128 bits → un UUID stable pour un id local.
export function offlineUuid(value) {
  const input = String(value);
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(input)) return input;
  let hex = "";
  for (const seed of [0x811c9dc5, 0x01000193, 0x9e3779b9, 0x85ebca6b]) {
    let h = seed >>> 0;
    for (let i = 0; i < input.length; i += 1) {
      h ^= input.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    hex += h.toString(16).padStart(8, "0");
  }
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

function scenarioFromLocation() {
  if (typeof window === "undefined") return null;
  const value = new URLSearchParams(window.location.search).get("bt_notif");
  return ["demo", "few", "empty", "many", "long"].includes(value) ? value : null;
}

// ── Jeux fixes pour les captures ───────────────────────────────────────────
const PEOPLE = {
  lea: { id: offlineUuid("demo-lea"), pseudo: "lea.m", first_name: "Léa", last_name: "Martin", avatar_url: null },
  hugo: { id: offlineUuid("demo-hugo"), pseudo: "hugo", first_name: "Hugo", last_name: "Lambert", avatar_url: null },
  sarah: { id: offlineUuid("demo-sarah"), pseudo: "sarah.v", first_name: "Sarah", last_name: "Verhoeven", avatar_url: null },
  tom: { id: offlineUuid("demo-tom"), pseudo: "tom", first_name: "Tom", last_name: "Okafor", avatar_url: null },
  ines: { id: offlineUuid("demo-ines"), pseudo: "ines", first_name: "Inès", last_name: null, avatar_url: null },
  long: {
    id: offlineUuid("demo-long"), pseudo: "anne-charlotte",
    first_name: "Anne-Charlotte", last_name: "de la Vallée-Poussin-Delacroix", avatar_url: null,
  },
};

function demoRow(kind, id, minutesAgo, fields, now) {
  return { key: `${kind}:${offlineUuid(id)}`, kind, at: new Date(now - minutesAgo * 60000).toISOString(), ...fields };
}

function announcementRow(id, minutesAgo, { read = false, ...fields }, now) {
  return demoRow("announcement", id, minutesAgo, {
    actor: null, target: offlineUuid(id), count: 0, read,
    announcement: { title_en: null, message_en: null, href: null, type: "info", ...fields },
  }, now);
}

function scenarioRows(scenario, now) {
  if (scenario === "empty") return [];
  if (scenario === "few") return scenarioRows("demo", now).slice(0, 3);
  if (scenario === "demo") {
    return [
      demoRow("private_message", "demo-lea", 2, { actor: PEOPLE.lea, target: PEOPLE.lea.id, count: 2, unreadMessages: 2 }, now),
      demoRow("friend_request", "demo-req-hugo", 8, { actor: PEOPLE.hugo, target: offlineUuid("demo-req-hugo") }, now),
      demoRow("friend_accepted", "demo-acc-ines", 20, { actor: PEOPLE.ines, target: PEOPLE.ines.id }, now),
      announcementRow("demo-ann-planning", 180, {
        title: "Nouveau : tes examens dans le planning",
        message: "Ajoute tes dates d'examen pour voir le compte à rebours de chaque cours.",
        title_en: "New: your exams in the planner",
        message_en: "Add your exam dates to see a countdown for each course.",
        type: "new", href: "/planning",
      }, now),
      demoRow("comment", "demo-comment-sarah", 60 * 26, {
        actor: PEOPLE.sarah, target: offlineUuid("demo-post"), excerpt: "Bravo pour ta session de ce matin, tu tiens le rythme !", read: true,
      }, now),
      demoRow("reaction", "demo-like-tom", 60 * 50, { actor: PEOPLE.tom, target: offlineUuid("demo-post"), emoji: "👍", read: true }, now),
      announcementRow("demo-ann-info", 60 * 24 * 5, {
        title: "Maintenance terminée",
        message: "Les statistiques sont de nouveau à jour.",
        title_en: "Maintenance complete",
        message_en: "Your statistics are up to date again.",
        read: true,
      }, now),
    ];
  }
  if (scenario === "long") {
    return [
      demoRow("friend_request", "long-req", 5, { actor: PEOPLE.long, target: offlineUuid("long-req") }, now),
      demoRow("comment", "long-comment", 40, {
        actor: PEOPLE.long, target: offlineUuid("long-post"),
        excerpt: "Franchement, cette méthode de révision par blocs de quarante-cinq minutes avec des pauses actives m'a sauvé toute la session de janvier, merci infiniment de l'avoir partagée ici avec tout le monde !",
      }, now),
      announcementRow("long-ann", 90, {
        title: "Nouveauté importante pour la période de blocus : des objectifs hebdomadaires plus précis et des rappels mieux espacés",
        message: "Pendant le blocus, tu peux maintenant fixer un objectif différent pour chaque semaine, suivre ton avance ou ton retard jour après jour, et recevoir un seul rappel le soir au lieu de plusieurs dans la journée. Ouvre ton planning pour découvrir les nouveaux réglages.",
        type: "important", href: "/planning",
      }, now),
      demoRow("private_message", "long-dm", 60 * 30, { actor: PEOPLE.long, target: PEOPLE.long.id, count: 12, unreadMessages: 12 }, now),
    ];
  }
  // many : 26 lignes sur dix jours, les six plus récentes non lues.
  const kinds = ["private_message", "comment", "reaction", "friend_accepted", "friend_request", "announcement"];
  const people = [PEOPLE.lea, PEOPLE.hugo, PEOPLE.sarah, PEOPLE.tom, PEOPLE.ines];
  return Array.from({ length: 26 }, (_, i) => {
    const kind = kinds[i % kinds.length];
    const minutes = i < 4 ? 3 + i * 25 : 60 * 12 * (i - 2);
    const read = i >= 6;
    if (kind === "announcement") {
      return announcementRow(`many-ann-${i}`, minutes, {
        title: `Annonce n°${i + 1}`, message: "Un message court de l'équipe Blocus.", read,
      }, now);
    }
    const actor = people[i % people.length];
    return demoRow(kind, `many-${kind}-${i}`, minutes, {
      actor, target: kind === "friend_request" ? offlineUuid(`many-req-${i}`) : actor.id,
      count: kind === "private_message" ? (i % 3) + 1 : 0, unreadMessages: kind === "private_message" && !read ? (i % 3) + 1 : 0,
      excerpt: kind === "comment" ? "Bien joué pour ta série !" : null, read,
    }, now);
  });
}

// ── La base locale, avec les règles de v64 ─────────────────────────────────
function profileMap(db) {
  return new Map((db.profiles || []).map((profile) => [profile.id, profile]));
}

function actorOf(profiles, id) {
  const p = profiles.get(id);
  if (!p) return null;
  return { id: offlineUuid(p.id), pseudo: p.pseudo || null, first_name: p.first_name || null, last_name: p.last_name || null, avatar_url: p.avatar_url || null };
}

function dbRows(db, uid, now) {
  const since = now - WINDOW_MS;
  const profiles = profileMap(db);
  const me = profiles.get(uid);
  const hidden = (id) => profiles.get(id)?.locked === true
    || (db.user_blocks || []).some((b) => (b.blocker_id === uid && b.blocked_id === id) || (b.blocker_id === id && b.blocked_id === uid));
  const rows = [];
  for (const f of db.friendships || []) {
    if (f.addressee === uid && f.status === "pending" && !hidden(f.requester)) {
      rows.push({ key: `friend_request:${offlineUuid(f.id)}`, kind: "friend_request", at: f.created_at, actor: actorOf(profiles, f.requester), target: offlineUuid(f.id) });
    }
    const acceptedAt = f.accepted_at || f.created_at;
    if (f.requester === uid && f.status === "accepted" && Date.parse(acceptedAt) >= since && !hidden(f.addressee)) {
      rows.push({ key: `friend_accepted:${offlineUuid(f.id)}`, kind: "friend_accepted", at: acceptedAt, actor: actorOf(profiles, f.addressee), target: offlineUuid(f.addressee) });
    }
  }
  const bySender = new Map();
  for (const m of db.private_messages || []) {
    if (m.receiver_id !== uid || m.sender_id === uid || Date.parse(m.created_at) < since || hidden(m.sender_id)) continue;
    const group = bySender.get(m.sender_id) || { at: m.created_at, unread: 0 };
    if (Date.parse(m.created_at) > Date.parse(group.at)) group.at = m.created_at;
    if (!m.read) group.unread += 1;
    bySender.set(m.sender_id, group);
  }
  for (const [sender, group] of bySender) {
    rows.push({
      key: `private_message:${offlineUuid(sender)}`, kind: "private_message", at: group.at,
      actor: actorOf(profiles, sender), target: offlineUuid(sender), count: group.unread, unreadMessages: group.unread,
    });
  }
  const mine = new Set((db.posts || []).filter((p) => p.user_id === uid).map((p) => p.id));
  for (const c of db.comments || []) {
    if (!mine.has(c.post_id) || c.user_id === uid || Date.parse(c.created_at) < since || hidden(c.user_id)) continue;
    rows.push({
      key: `comment:${offlineUuid(c.id)}`, kind: "comment", at: c.created_at, actor: actorOf(profiles, c.user_id),
      target: offlineUuid(c.post_id), excerpt: String(c.content || "").replace(/\s+/g, " ").slice(0, 160),
    });
  }
  for (const l of db.likes || []) {
    if (!mine.has(l.post_id) || l.user_id === uid || Date.parse(l.created_at) < since || hidden(l.user_id)) continue;
    rows.push({ key: `reaction:${offlineUuid(l.id)}`, kind: "reaction", at: l.created_at, actor: actorOf(profiles, l.user_id), target: offlineUuid(l.post_id), emoji: l.emoji || null });
  }
  for (const a of db.app_announcements || []) {
    if (!a.is_active) continue;
    if (a.starts_at && Date.parse(a.starts_at) > now) continue;
    if (a.ends_at && Date.parse(a.ends_at) <= now) continue;
    if (a.audience === "university" && a.audience_university !== me?.university) continue;
    const at = a.starts_at && Date.parse(a.starts_at) > Date.parse(a.created_at) ? a.starts_at : a.created_at;
    rows.push({
      key: `announcement:${offlineUuid(a.id)}`, kind: "announcement", at, actor: null, target: offlineUuid(a.id),
      announcement: { title: a.title, message: a.message, title_en: a.title_en || null, message_en: a.message_en || null, type: a.type || "info", href: a.href || null },
    });
  }
  return rows;
}

function withReadState(db, uid, rows) {
  const cutoff = (db.notification_inbox_state || []).find((s) => s.user_id === uid)?.read_all_before;
  const receipts = new Map((db.notification_reads || []).filter((r) => r.user_id === uid).map((r) => [r.item_key, r.read_at]));
  return rows.map((row) => {
    const at = Date.parse(row.at);
    const receipt = receipts.get(row.key);
    const read = row.read === true
      || (row.kind === "private_message" && row.unreadMessages === 0)
      || (cutoff && at <= Date.parse(cutoff))
      || (receipt && Date.parse(receipt) >= at);
    return { ...row, read: Boolean(read) };
  });
}

// Un jeu fixe est daté une fois par onglet : sinon « il y a 2 min » glisserait
// avec l'horloge et repasserait après une lecture enregistrée.
function scenarioBase(scenario, now) {
  if (typeof window === "undefined") return now;
  try {
    const key = `bt_offline_notif_base_${scenario}`;
    const saved = Number(window.sessionStorage.getItem(key));
    if (Number.isFinite(saved) && saved > 0) return saved;
    window.sessionStorage.setItem(key, String(now));
  } catch {}
  return now;
}

export function offlineItems(db, uid, now = Date.now(), scenario = scenarioFromLocation()) {
  const rows = scenario ? scenarioRows(scenario, scenarioBase(scenario, now)) : dbRows(db, uid, now);
  return withReadState(db, uid, rows)
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at) || (a.key < b.key ? 1 : -1));
}

function inbox(db, uid, params, now) {
  const limit = Math.min(Math.max(Number(params.p_limit) || 20, 1), 50);
  const items = offlineItems(db, uid, now);
  const beforeAt = params.p_before_at ? Date.parse(params.p_before_at) : null;
  const page = items.filter((item) => beforeAt === null
    || Date.parse(item.at) < beforeAt
    || (Date.parse(item.at) === beforeAt && item.key < String(params.p_before_key || "")));
  return {
    unread: items.filter((item) => !item.read).length,
    has_more: page.length > limit,
    items: page.slice(0, limit).map((item) => ({
      key: item.key, kind: item.kind, at: item.at, read: item.read, target: item.target,
      count: item.count || 0, excerpt: item.excerpt || null, emoji: item.emoji || null,
      announcement: item.announcement || null, actor: item.actor || null,
    })),
  };
}

function countSince(rows, since, uid) {
  const from = Date.parse(since);
  return rows.filter((row) => row.user_id !== uid && Date.parse(row.created_at) > from).length;
}

function summary(db, uid, params, now) {
  const rooms = params.p_rooms_seen && typeof params.p_rooms_seen === "object" ? params.p_rooms_seen : {};
  const groups = params.p_groups_seen && typeof params.p_groups_seen === "object" ? params.p_groups_seen : {};
  const valid = (value) => typeof value === "string" && Number.isFinite(Date.parse(value));
  return {
    bell_unread: offlineItems(db, uid, now).filter((item) => !item.read).length,
    messages_unread: (db.private_messages || []).filter((m) => m.receiver_id === uid && !m.read).length,
    friend_requests: (db.friendships || []).filter((f) => f.addressee === uid && f.status === "pending").length,
    feed_new: params.p_feed_since ? countSince(db.posts || [], params.p_feed_since, uid) : null,
    rooms: (db.course_room_members || []).filter((m) => m.user_id === uid).map((m) => {
      const seen = rooms[m.room_id];
      return { id: m.room_id, seen: valid(seen), unread: valid(seen) ? countSince((db.community_messages || []).filter((c) => c.room_id === m.room_id), seen, uid) : 0 };
    }),
    groups: [...new Set((db.group_members || []).filter((m) => m.user_id === uid).map((m) => m.group_id))].map((id) => {
      const seen = groups[id];
      return { id, seen: valid(seen), unread: valid(seen) ? countSince((db.group_messages || []).filter((g) => g.group_id === id), seen, uid) : 0 };
    }),
  };
}

/** Répond comme les fonctions de v64 ; écrit dans `db` (l'appelant l'enregistre). */
export function offlineNotificationRpc(db, name, params = {}, uid, now = Date.now()) {
  if (name === "notification_inbox") return { data: inbox(db, uid, params, now), error: null };
  if (name === "notification_summary") return { data: summary(db, uid, params, now), error: null };
  if (name === "notification_mark_read") {
    const key = String(params.p_key || "");
    if (!KEY_RE.test(key)) return { data: null, error: { message: "invalid_notification_key", code: "22023" } };
    if (!offlineItems(db, uid, now).some((item) => item.key === key)) return { data: false, error: null };
    const stamp = new Date(now).toISOString();
    db.notification_reads = (db.notification_reads || []).filter((r) => !(r.user_id === uid && r.item_key === key));
    db.notification_reads.push({ user_id: uid, item_key: key, read_at: stamp });
    return { data: true, error: null };
  }
  if (name === "notification_mark_all_read") {
    const stamp = new Date(now).toISOString();
    db.notification_inbox_state = (db.notification_inbox_state || []).filter((s) => s.user_id !== uid);
    db.notification_inbox_state.push({ user_id: uid, read_all_before: stamp, updated_at: stamp });
    db.notification_reads = (db.notification_reads || []).filter((r) => r.user_id !== uid || Date.parse(r.read_at) > now);
    return { data: stamp, error: null };
  }
  return { data: null, error: { message: `unknown rpc ${name}` } };
}
