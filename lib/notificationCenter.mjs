// Centre de notifications — la logique pure, partagée par la cloche, le mode
// hors ligne et les tests Node. Aucun accès au navigateur ni à Supabase : les
// appels réseau reçoivent leur `rpc` en paramètre.
//
// La base (migration v64) fait la liste ET décide du lu / non lu ; ce module
// ne fait que vérifier ce qui revient, l'ordonner, le regrouper par jour,
// dire où mène chaque ligne et appliquer tout de suite ce que le membre fait
// (lecture optimiste), en attendant que la base le confirme.
import { isSafeInternalHref } from "./safeHref.mjs";

export const NOTIFICATION_KINDS = Object.freeze([
  "friend_request", "friend_accepted", "private_message", "comment", "reaction", "announcement",
]);
export const INBOX_PAGE_SIZE = 20;

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const UUID_RE = new RegExp(`^${UUID}$`);
export const NOTIFICATION_KEY_RE = new RegExp(`^(${NOTIFICATION_KINDS.join("|")}):${UUID}$`);
const ANNOUNCEMENT_TYPES = new Set(["new", "info", "important"]);
const SEEN_KEY_RE = new RegExp(`^(room|group)_(${UUID})$`);
const SEEN_LIMIT = 300;
const LEGACY_DISMISSED_LIMIT = 20;

export function isNotificationKey(value) {
  return typeof value === "string" && NOTIFICATION_KEY_RE.test(value);
}

function uuidOrNull(value) {
  return typeof value === "string" && UUID_RE.test(value) ? value : null;
}

function textOrNull(value, max) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.length > max ? `${trimmed.slice(0, max - 1)}…` : trimmed;
}

function countOf(value) {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : 0;
}

// La base date à la microseconde (« …12.123456+00:00 ») ; certains Safari ne
// lisent que les millisecondes. On garde la chaîne exacte pour le curseur de
// pagination, et on trie / affiche avec cette valeur-ci.
export function toMillis(value) {
  if (typeof value !== "string") return NaN;
  return Date.parse(value.replace(/(\.\d{3})\d+/, "$1"));
}

/**
 * Une ligne telle que la base la renvoie → une ligne sûre pour l'affichage,
 * ou null. Le profil de l'auteur passe par une liste blanche de colonnes :
 * même si la base en renvoyait une de trop (un e-mail), elle s'arrête ici.
 */
export function normalizeItem(raw) {
  if (!raw || typeof raw !== "object") return null;
  const { kind, key } = raw;
  if (!NOTIFICATION_KINDS.includes(kind) || !isNotificationKey(key) || !key.startsWith(`${kind}:`)) return null;
  const atMs = toMillis(raw.at);
  if (!Number.isFinite(atMs)) return null;
  const at = raw.at;

  const actorId = uuidOrNull(raw.actor?.id);
  const actor = actorId ? {
    id: actorId,
    pseudo: textOrNull(raw.actor.pseudo, 80),
    first_name: textOrNull(raw.actor.first_name, 80),
    last_name: textOrNull(raw.actor.last_name, 80),
    avatar_url: textOrNull(raw.actor.avatar_url, 2048),
  } : null;

  let announcement = null;
  if (kind === "announcement") {
    const a = raw.announcement && typeof raw.announcement === "object" ? raw.announcement : {};
    const title = textOrNull(a.title, 200);
    if (!title) return null;
    const href = textOrNull(a.href, 300);
    announcement = {
      title,
      message: textOrNull(a.message, 1000),
      title_en: textOrNull(a.title_en, 200),
      message_en: textOrNull(a.message_en, 1000),
      type: ANNOUNCEMENT_TYPES.has(a.type) ? a.type : "info",
      href: href && isSafeInternalHref(href) ? href : null,
    };
  }

  return {
    key,
    kind,
    at,
    atMs,
    read: raw.read === true,
    target: uuidOrNull(raw.target),
    count: countOf(raw.count),
    excerpt: kind === "comment" ? textOrNull(raw.excerpt, 160) : null,
    actor,
    announcement,
  };
}

/** Plus récent d'abord ; à date égale, l'ordre des clés départage. */
export function compareItems(a, b) {
  const diff = b.atMs - a.atMs;
  if (diff) return diff;
  return a.key < b.key ? 1 : a.key > b.key ? -1 : 0;
}

/** Fusionne une page dans la liste : la version la plus récente d'une clé gagne. */
export function mergeItems(current = [], incoming = []) {
  const byKey = new Map(current.map((item) => [item.key, item]));
  for (const item of incoming) byKey.set(item.key, item);
  return [...byKey.values()].sort(compareItems);
}

export function normalizeInbox(payload) {
  const items = Array.isArray(payload?.items) ? payload.items.map(normalizeItem).filter(Boolean) : [];
  return {
    items: mergeItems([], items),
    unread: countOf(payload?.unread),
    hasMore: payload?.has_more === true,
  };
}

/** Le curseur de « voir plus » : la dernière ligne chargée. */
export function nextCursor(items) {
  const last = items?.[items.length - 1];
  return last ? { at: last.at, key: last.key } : null;
}

// ── Lecture optimiste ──────────────────────────────────────────────────────
export function withItemRead(state, key) {
  const item = state.items.find((entry) => entry.key === key);
  if (!item || item.read) return state;
  return {
    ...state,
    items: state.items.map((entry) => (entry.key === key ? { ...entry, read: true } : entry)),
    unread: Math.max(0, state.unread - 1),
  };
}

export function withAllRead(state) {
  if (!state.unread && state.items.every((item) => item.read)) return state;
  return { ...state, items: state.items.map((item) => (item.read ? item : { ...item, read: true })), unread: 0 };
}

// ── Où mène une ligne ──────────────────────────────────────────────────────
// Toujours un chemin interne, jamais une adresse venue d'ailleurs sans
// contrôle. Une cible manquante renvoie vers la page la plus proche ; une
// annonce sans lien sûr ne mène nulle part (null).
export function destinationFor(item) {
  if (!item) return null;
  const target = uuidOrNull(item.target);
  switch (item.kind) {
    case "friend_request": return "/messages?tab=relations";
    case "friend_accepted": return target ? `/messages?profile=${target}` : "/messages";
    case "private_message": return target ? `/messages?dm=${target}` : "/messages";
    case "comment":
    case "reaction": return target ? `/feed?post=${target}` : "/feed";
    case "announcement": {
      const href = item.announcement?.href;
      return href && isSafeInternalHref(href) ? href : null;
    }
    default: return null;
  }
}

// ── Aujourd'hui / Plus tôt ─────────────────────────────────────────────────
export function localDayKey(value) {
  const date = value instanceof Date ? value : new Date(value);
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function dayGroups(items = [], now = new Date()) {
  const today = localDayKey(now);
  const groups = [{ id: "today", items: [] }, { id: "earlier", items: [] }];
  for (const item of items) groups[localDayKey(new Date(item.atMs)) === today ? 0 : 1].items.push(item);
  return groups.filter((group) => group.items.length > 0);
}

// ── Le texte d'une ligne ───────────────────────────────────────────────────
const SENTENCE_KEYS = {
  friend_request: "notif.friendRequest",
  friend_accepted: "notif.friendAccepted",
  comment: "notif.commentedPost",
  reaction: "notif.reactedPost",
};

export function sentenceKeyFor(item) {
  if (item.kind === "private_message") return item.count > 1 ? "notif.messages" : "notif.message";
  return SENTENCE_KEYS[item.kind] || null;
}

/**
 * « {name} veut t'ajouter » → [texte, nom, texte]. Le nom est la seule
 * partie mise en avant, où que la langue le place dans la phrase.
 */
export function splitSentence(template, name, count = 0) {
  const filled = String(template || "").replace("{n}", String(count));
  const at = filled.indexOf("{name}");
  if (at < 0) return [{ text: `${name} ${filled}`.trim(), strong: false }];
  return [
    { text: filled.slice(0, at), strong: false },
    { text: name, strong: true },
    { text: filled.slice(at + "{name}".length), strong: false },
  ].filter((part) => part.text);
}

export function announcementText(item, lang) {
  const a = item.announcement || {};
  const english = lang === "en";
  return {
    title: (english && a.title_en) || a.title || "",
    body: (english && a.message_en) || a.message || null,
  };
}

// ── Compteurs de navigation ────────────────────────────────────────────────
function countsList(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((row) => ({ id: uuidOrNull(row?.id), unread: countOf(row?.unread), seen: row?.seen === true }))
    .filter((row) => row.id);
}

export function normalizeSummary(payload) {
  if (!payload || typeof payload !== "object") return null;
  const feed = payload.feed_new === null || payload.feed_new === undefined ? null : countOf(payload.feed_new);
  return {
    bell: countOf(payload.bell_unread),
    messages: countOf(payload.messages_unread),
    friends: countOf(payload.friend_requests),
    feed,
    rooms: countsList(payload.rooms),
    groups: countsList(payload.groups),
  };
}

/**
 * Les « vu pour la dernière fois » gardés sur l'appareil (clés
 * bt_last_seen_room_<id> et bt_last_seen_group_<id>) → les deux objets
 * envoyés à la base. Tout ce qui n'a pas la bonne forme est ignoré.
 */
export function seenMaps(entries) {
  const rooms = {};
  const groups = {};
  let total = 0;
  for (const [name, value] of entries || []) {
    const match = SEEN_KEY_RE.exec(String(name || ""));
    if (!match || typeof value !== "string" || !Number.isFinite(Date.parse(value))) continue;
    if (++total > SEEN_LIMIT * 2) break;
    (match[1] === "room" ? rooms : groups)[match[2]] = value;
  }
  return { rooms, groups };
}

/** Les annonces masquées sur cet appareil par l'ancienne cloche → leurs clés. */
export function legacyDismissedKeys(json) {
  let ids;
  try { ids = JSON.parse(json || "[]"); } catch { return []; }
  if (!Array.isArray(ids)) return [];
  return [...new Set(ids.filter((id) => uuidOrNull(id)).map((id) => `announcement:${id}`))]
    .slice(0, LEGACY_DISMISSED_LIMIT);
}

// ── Appels à la base (le `rpc` est fourni par l'appelant) ──────────────────
export async function fetchInbox(rpc, cursor = null) {
  const params = { p_limit: INBOX_PAGE_SIZE };
  if (cursor) {
    params.p_before_at = cursor.at;
    params.p_before_key = cursor.key;
  }
  const { data, error } = await rpc("notification_inbox", params);
  if (error) throw error;
  return normalizeInbox(data);
}

export async function fetchSummary(rpc, { feedSince = null, rooms = {}, groups = {} } = {}) {
  const { data, error } = await rpc("notification_summary", {
    p_feed_since: feedSince,
    p_rooms_seen: rooms,
    p_groups_seen: groups,
  });
  if (error) throw error;
  return normalizeSummary(data);
}

export async function sendMarkRead(rpc, key) {
  if (!isNotificationKey(key)) return false;
  const { data, error } = await rpc("notification_mark_read", { p_key: key });
  if (error) throw error;
  return data === true;
}

export async function sendMarkAllRead(rpc) {
  const { error } = await rpc("notification_mark_all_read", {});
  if (error) throw error;
  return true;
}
