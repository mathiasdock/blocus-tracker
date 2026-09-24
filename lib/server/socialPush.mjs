// Notifications sociales, au moment de l'événement — SERVEUR UNIQUEMENT.
//
// Appelées par /api/push/notify quand la base signale un événement
// (déclencheurs v62_1 et v63) :
//   • demande d'ami reçue    → la personne demandée ;
//   • demande acceptée       → celle qui l'avait envoyée (une fois par amitié) ;
//   • message privé          → le destinataire, SANS le contenu du message,
//                              au plus une fois par conversation et 10 minutes.
// La route ne croit rien du corps reçu, sauf l'identifiant : l'événement est
// relu en base et doit être frais ; l'auteur doit exister sans être
// suspendu ; le destinataire passe par le même filtre que tout le reste
// (interrupteur général, préférence Social, suspension, blocage, garde-fou
// de 20 par 24 h, anti-doublon).
//
// Le registre garde le MODÈLE (« {name} t'a envoyé un message ») : jamais le
// prénom, jamais un message, seulement le type, les identifiants techniques
// nécessaires, le statut et l'heure.

import { timingSafeEqual } from "node:crypto";
import {
  MESSAGE_COOLDOWN_MS, SOCIAL_DAILY_CAP, fillVars, firstNameOf, friendAcceptedKey, friendAcceptedVerdict,
  friendRequestKey, friendRequestVerdict, privateMessageKey, privateMessageKeyPrefix, privateMessageVerdict,
} from "../notificationRules.mjs";
import { dispatchNotification } from "./notify.mjs";

function sameSecret(a, b) {
  const left = Buffer.from(String(a || ""));
  const right = Buffer.from(String(b || ""));
  return left.length === right.length && left.length > 0 && timingSafeEqual(left, right);
}

/**
 * Le webhook est-il authentique ? Le secret vit dans Vault (v62) et se
 * vérifie par la base ; un secret d'environnement n'est accepté que s'il est
 * fort (32 caractères au moins) — l'ancien secret faible ne passe plus.
 */
export async function isWebhookAuthorized({ header, envSecret = "", verifyVaultSecret }) {
  const secret = String(Array.isArray(header) ? header[0] : header || "");
  if (secret.length < 32) return false;
  if (envSecret && String(envSecret).length >= 32 && sameSecret(secret, envSecret)) return true;
  try {
    return (await verifyVaultSecret(secret)) === true;
  } catch (_) {
    return false;
  }
}

function socialSpec({ kind, trigger, actorId, recipientId, conf, name, url, recipientKey }) {
  return {
    source: "social",
    category: "social",
    kind,
    trigger,
    actorId,
    target: { type: "event", userIds: [recipientId] },
    content: { title: fillVars(conf.title, { name }), body: fillVars(conf.body, { name }), url },
    logContent: { title: conf.title, body: conf.body, url: conf.url },
    langs: ["fr", "en"],
    recipientKey: () => recipientKey,
    extraReason: (row) => (Number(row.recent_social || 0) >= SOCIAL_DAILY_CAP ? "frequency" : null),
  };
}

function withParam(base, param, id) {
  return `${base}${base.includes("?") ? "&" : "?"}${param}=${encodeURIComponent(id)}`;
}

/**
 * @param loadFriendship(id) → { id, requester, addressee, status, created_at } | null
 * @param loadProfile(id)    → { pseudo, first_name, locked } | null
 */
export async function notifyFriendRequest({
  store, onesignal, loadFriendship, loadProfile, automations, friendshipId, now = new Date(),
}) {
  const instant = now instanceof Date ? now : new Date(now);
  const friendship = await loadFriendship(friendshipId);
  const verdict = friendRequestVerdict(friendship, instant.getTime());
  if (!verdict.ok) return { status: "skipped", reason: verdict.reason };

  const conf = automations.friend_request;
  if (!conf || conf.enabled === false) return { status: "skipped", reason: "disabled" };

  const requester = await loadProfile(friendship.requester);
  const name = firstNameOf(requester);
  if (!requester || requester.locked || !name) return { status: "skipped", reason: "requester_unavailable" };

  const result = await dispatchNotification({
    store,
    onesignal,
    now: instant,
    spec: socialSpec({
      kind: "friend_request",
      trigger: "friendship",
      actorId: friendship.requester,
      recipientId: friendship.addressee,
      conf,
      name,
      url: conf.url,
      recipientKey: friendRequestKey(friendship.requester, friendship.addressee, instant),
    }),
  });
  return { status: result.status, sendId: result.sendId || null, summary: result.summary };
}

/**
 * Demande acceptée : notifiée à la personne qui l'avait envoyée.
 * @param loadFriendship(id) → { id, requester, addressee, status, accepted_at } | null
 */
export async function notifyFriendAccepted({
  store, onesignal, loadFriendship, loadProfile, automations, friendshipId, now = new Date(),
}) {
  const instant = now instanceof Date ? now : new Date(now);
  const friendship = await loadFriendship(friendshipId);
  const verdict = friendAcceptedVerdict(friendship, instant.getTime());
  if (!verdict.ok) return { status: "skipped", reason: verdict.reason };

  const conf = automations.friend_accepted;
  if (!conf || conf.enabled === false) return { status: "skipped", reason: "disabled" };

  const accepter = await loadProfile(friendship.addressee);
  const name = firstNameOf(accepter);
  if (!accepter || accepter.locked || !name) return { status: "skipped", reason: "actor_unavailable" };

  const result = await dispatchNotification({
    store,
    onesignal,
    now: instant,
    spec: socialSpec({
      kind: "friend_accepted",
      trigger: "friendship_accepted",
      actorId: friendship.addressee,
      recipientId: friendship.requester,
      conf,
      name,
      url: withParam(conf.url, "profile", friendship.addressee),
      recipientKey: friendAcceptedKey(friendship.id),
    }),
  });
  return { status: result.status, sendId: result.sendId || null, summary: result.summary };
}

/**
 * Message privé : notifié au destinataire, sans le contenu.
 * @param loadMessage(id) → { id, sender_id, receiver_id, created_at } | null
 *                          (le contenu n'est jamais demandé à la base)
 */
export async function notifyPrivateMessage({
  store, onesignal, loadMessage, loadProfile, automations, messageId, now = new Date(),
}) {
  const instant = now instanceof Date ? now : new Date(now);
  const message = await loadMessage(messageId);
  const verdict = privateMessageVerdict(message, instant.getTime());
  if (!verdict.ok) return { status: "skipped", reason: verdict.reason };

  const conf = automations.private_message;
  if (!conf || conf.enabled === false) return { status: "skipped", reason: "disabled" };

  const sender = await loadProfile(message.sender_id);
  const name = firstNameOf(sender);
  if (!sender || sender.locked || !name) return { status: "skipped", reason: "actor_unavailable" };

  // Pause par conversation : un échange rapide ne sonne qu'une fois.
  const recent = await store.recentRecipientKey({
    userId: message.receiver_id,
    kind: "private_message",
    keyPrefix: privateMessageKeyPrefix(message.sender_id, message.receiver_id),
    since: new Date(instant.getTime() - MESSAGE_COOLDOWN_MS).toISOString(),
  });
  if (recent) return { status: "skipped", reason: "cooldown" };

  const result = await dispatchNotification({
    store,
    onesignal,
    now: instant,
    spec: socialSpec({
      kind: "private_message",
      trigger: "private_message",
      actorId: message.sender_id,
      recipientId: message.receiver_id,
      conf,
      name,
      url: withParam(conf.url, "dm", message.sender_id),
      recipientKey: privateMessageKey(message.sender_id, message.receiver_id, instant),
    }),
  });
  return { status: result.status, sendId: result.sendId || null, summary: result.summary };
}
