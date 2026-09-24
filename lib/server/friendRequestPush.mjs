// Demande d'ami → notification push — SERVEUR UNIQUEMENT.
//
// Appelé par /api/push/notify quand la base signale une nouvelle demande
// (déclencheur push_friend_request, v62_1). La route ne croit rien du corps
// reçu, sauf l'identifiant : la demande est relue en base, doit être en
// attente et fraîche, l'auteur doit exister sans être suspendu, et le
// destinataire passe par le même filtre que tout le reste (préférences,
// suspension, blocage, fréquence, anti-doublon par paire et par jour).

import { timingSafeEqual } from "node:crypto";
import {
  SOCIAL_DAILY_CAP, fillVars, friendRequestKey, friendRequestVerdict,
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

/**
 * @param loadFriendship(id) → { id, requester, addressee, status, created_at } | null
 * @param loadProfile(id)    → { pseudo, first_name, last_name, locked } | null
 * @param nameOf(profile)    → nom affiché (lib/format.js displayName)
 */
export async function notifyFriendRequest({
  store, onesignal, loadFriendship, loadProfile, automations, nameOf, friendshipId, now = new Date(),
}) {
  const instant = now instanceof Date ? now : new Date(now);
  const friendship = await loadFriendship(friendshipId);
  const verdict = friendRequestVerdict(friendship, instant.getTime());
  if (!verdict.ok) return { status: "skipped", reason: verdict.reason };

  const conf = automations.friend_request;
  if (!conf || conf.enabled === false) return { status: "skipped", reason: "disabled" };

  const requester = await loadProfile(friendship.requester);
  if (!requester || requester.locked) return { status: "skipped", reason: "requester_unavailable" };

  const name = nameOf(requester);
  const result = await dispatchNotification({
    store,
    onesignal,
    now: instant,
    spec: {
      source: "social",
      category: "social",
      kind: "friend_request",
      trigger: "friendship",
      actorId: friendship.requester,
      target: { type: "event", userIds: [friendship.addressee] },
      content: { title: fillVars(conf.title, { name }), body: fillVars(conf.body, { name }), url: conf.url },
      // Le registre garde le modèle, jamais le nom de l'auteur.
      logContent: { title: conf.title, body: conf.body, url: conf.url },
      langs: ["fr", "en"],
      recipientKey: (row) => friendRequestKey(friendship.requester, row.user_id, instant),
      extraReason: (row) => (Number(row.recent_social || 0) >= SOCIAL_DAILY_CAP ? "frequency" : null),
    },
  });
  return { status: result.status, sendId: result.sendId || null, summary: result.summary };
}
