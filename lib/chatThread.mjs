// Fil d'une conversation de Social → Amis (messages privés et groupes), façon
// Instagram : du plus ancien au plus récent, une heure centrée au début de
// chaque échange, et les messages consécutifs d'une même personne réunis en
// une série (sa photo se pose à côté de la dernière bulle).
//
// Un échange commence au premier message, après 30 minutes de silence ou à
// un changement de jour : l'heure ne se répète pas sur chaque bulle.

export const CHAT_GAP_MS = 30 * 60 * 1000;

// Lue, pas comparée en texte : le serveur écrit « +00:00 », un navigateur « Z ».
function timeOf(value) {
  const time = Date.parse(value);
  return Number.isFinite(time) ? time : 0;
}

function sameLocalDay(a, b) {
  const x = new Date(a);
  const y = new Date(b);
  return x.getFullYear() === y.getFullYear() && x.getMonth() === y.getMonth() && x.getDate() === y.getDate();
}

export function buildChatThread(messages = [], { viewerId = null, authorOf = (message) => message.sender_id, gapMs = CHAT_GAP_MS } = {}) {
  const sorted = [...messages].sort((a, b) => timeOf(a.created_at) - timeOf(b.created_at));
  const items = [];
  let run = null;
  let previousAt = null;
  for (const message of sorted) {
    const at = timeOf(message.created_at);
    if (previousAt === null || at - previousAt >= gapMs || !sameLocalDay(at, previousAt)) {
      items.push({ type: "time", key: `time:${message.id}`, at: message.created_at });
      run = null;
    }
    const authorId = authorOf(message);
    if (run && run.authorId === authorId) {
      run.messages.push(message);
    } else {
      run = { type: "run", key: `run:${message.id}`, authorId, mine: !!viewerId && authorId === viewerId, messages: [message] };
      items.push(run);
    }
    previousAt = at;
  }
  return items;
}

// Place d'une bulle dans sa série : les coins qui se touchent se resserrent.
export function bubblePosition(index, count) {
  if (count <= 1) return "single";
  if (index === 0) return "first";
  return index === count - 1 ? "last" : "middle";
}

function localeOf(lang) {
  return lang === "en" ? "en-GB" : "fr-BE";
}

function capitalized(text) {
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : text;
}

// « 14:32 » aujourd'hui, « Hier 14:32 », « Dim. 21:17 » dans la semaine,
// « 27 mai, 14:03 » plus tôt (avec l'année si ce n'est pas celle en cours).
export function chatTimeLabel(value, { lang = "fr", now = new Date(), yesterday = "Hier" } = {}) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  const locale = localeOf(lang);
  const time = new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit" }).format(date);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const day = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  // Arrondi : un jour de changement d'heure dure 23 ou 25 heures.
  const daysAgo = Math.round((today - day) / 86_400_000);
  if (daysAgo <= 0) return time;
  if (daysAgo === 1) return `${yesterday} ${time}`;
  if (daysAgo < 7) {
    const weekday = new Intl.DateTimeFormat(locale, { weekday: "short" }).format(date);
    return capitalized(`${weekday} ${time}`);
  }
  const sameYear = date.getFullYear() === now.getFullYear();
  const dayLabel = new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", ...(sameYear ? {} : { year: "numeric" }) }).format(date);
  return `${dayLabel}, ${time}`;
}

// Date et heure complètes d'un message (infobulle au survol).
export function chatFullTime(value, lang = "fr") {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  return capitalized(new Intl.DateTimeFormat(localeOf(lang), {
    weekday: "long", day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit",
  }).format(date));
}
