// ── Partage d'une session d'étude en message privé ─────────────────────────
//
// POURQUOI PAS DE MIGRATION. `private_messages` n'a pas de colonne pour une
// charge utile structurée, et en ajouter une imposerait à Mathias d'exécuter du
// SQL à la main avant que la fonctionnalité marche (règle 5 du CLAUDE.md : les
// migrations ne sont jamais jouées par Claude). On se sert donc des colonnes
// de pièce jointe existantes, sans inventer un nouveau `attachment_type` : la
// migration v24 limite cette colonne à "image" ou "file", et toute autre
// valeur fait échouer l'INSERT.
//
//   attachment_type = null         ← respecte la contrainte existante
//   attachment_name = préfixe+JSON ← marqueur + charge utile
//   attachment_url  = null        ← DOIT rester null
//   content         = phrase lisible
//
// `attachment_url` null n'est pas un détail : `pages/api/storage/sign.js`,
// `api/admin/egress-guard.js` et `api/admin/storage-cleanup.js` filtrent tous
// sur `attachment_url is not null`. Une session ne passe donc jamais pour un
// fichier stocké, et aucun de ces travaux ne va tenter de la signer ou de la
// balayer. Côté rendu, chaque branche de pièce jointe de `pages/messages.js`
// est gardée par `m.attachment_url && …` : un client qui ne connaît pas ce
// type n'affiche rien de cassé.
//
// DÉGRADATION GRACIEUSE. `content` porte toujours la phrase lisible. Un vieux
// client, une notification push ou l'aperçu de conversation affichent une
// phrase correcte ; seuls les clients qui comprennent le marqueur remplacent
// la phrase par la carte riche.

// Ancien encodage reconnu en lecture pour les données de démo ou un
// environnement qui aurait déjà autorisé ce type avant ce correctif.
export const SESSION_ATTACHMENT_TYPE = "session";
export const SESSION_ATTACHMENT_PREFIX = "bt-session:v1:";

// Bornes de sécurité : `attachment_name` est une colonne texte sans contrainte,
// et le contenu vient d'un client. On tronque avant d'écrire, on revalide en
// lisant — un payload trafiqué ne doit jamais casser le rendu d'une conversation.
const MAX_COURSE_LEN = 60;
const MAX_NOTE_LEN   = 140;
const MAX_SECONDS    = 24 * 3600;

function clampText(value, max) {
  if (typeof value !== "string") return "";
  const clean = value.trim();
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}

/**
 * Construit les colonnes d'insertion pour un partage de session.
 * `readableText` est la phrase déjà traduite (le lib n'a pas accès à `t`).
 */
export function buildSessionShareMessage({ durationSecs, courseName, courseColor, note, readableText }) {
  const secs = Math.max(0, Math.min(MAX_SECONDS, Math.round(Number(durationSecs) || 0)));
  const payload = {
    v: 1,
    secs,
    course: clampText(courseName, MAX_COURSE_LEN) || null,
    color: /^#[0-9a-fA-F]{3,8}$/.test(courseColor || "") ? courseColor : null,
    note: clampText(note, MAX_NOTE_LEN) || null,
  };
  return {
    content: readableText || null,
    attachment_type: null,
    attachment_name: `${SESSION_ATTACHMENT_PREFIX}${JSON.stringify(payload)}`,
    attachment_url: null,
  };
}

/**
 * Relit un message. Renvoie `null` dès que quoi que ce soit cloche — l'appelant
 * retombe alors sur l'affichage texte normal, jamais sur une carte à moitié vide.
 */
export function readSessionShare(message) {
  if (!message) return null;
  if (message.attachment_url) return null; // vraie pièce jointe : pas pour nous

  const legacyEncoding = message.attachment_type === SESSION_ATTACHMENT_TYPE;
  const currentEncoding = message.attachment_type == null
    && typeof message.attachment_name === "string"
    && message.attachment_name.startsWith(SESSION_ATTACHMENT_PREFIX);
  if (!legacyEncoding && !currentEncoding) return null;

  let parsed;
  try {
    const raw = currentEncoding
      ? message.attachment_name.slice(SESSION_ATTACHMENT_PREFIX.length)
      : message.attachment_name;
    parsed = JSON.parse(raw || "");
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const secs = Number(parsed.secs);
  if (!Number.isFinite(secs) || secs <= 0 || secs > MAX_SECONDS) return null;
  return {
    secs: Math.round(secs),
    course: clampText(parsed.course, MAX_COURSE_LEN) || null,
    color: /^#[0-9a-fA-F]{3,8}$/.test(parsed.color || "") ? parsed.color : null,
    note: clampText(parsed.note, MAX_NOTE_LEN) || null,
  };
}
