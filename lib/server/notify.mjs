// Le point d'envoi unique des notifications push — SERVEUR UNIQUEMENT.
//
// Rappels du soir, demandes d'ami, envois admin, annonces poussées, test à
// soi-même : tout passe ici, dans cet ordre, sans exception.
//   1. Audience décidée par la base (notification_audience, v62) : compte
//      existant, non suspendu, interrupteur général, catégorie, blocage.
//   2. Raisons propres à l'envoi (fréquence, heures calmes, automatique coupé).
//   3. Registre : une ligne par envoi (notification_sends).
//   4. Réservation anti-doublon de chaque destinataire (notification_claim) :
//      une clé déjà prise par un envoi réussi ne repart jamais.
//   5. OneSignal, par lots, uniquement vers les comptes réservés.
//   6. Résultat par destinataire (notification_mark) et bilan de l'envoi.
//
// Jamais de segment OneSignal : on vise des comptes Blocus Tracker éligibles,
// donc jamais un appareil sans compte, déconnecté ou d'un compte supprimé.

import { CLAIM_BATCH, ONESIGNAL_BATCH, summarizeAudience } from "../notificationRules.mjs";

export class NotifyError extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}

const SCOPE_OF_TARGET = {
  all: "all",
  university: "university",
  users: "users",
  self: "self",
  automation: "users",
  event: "users",
};

function chunks(list, size) {
  const out = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

/**
 * Accès au registre et au filtre d'audience, avec le client service role.
 * Isolé ici pour que la mécanique d'envoi se teste sans base.
 */
export function createNotificationStore(db) {
  return {
    async audience({ category, scope, university = null, userIds = null, actorId = null }) {
      const rows = [];
      // Les fonctions qui renvoient un ensemble sont plafonnées à 1 000 lignes
      // par réponse (réglage PostgREST) : on lit par pages, dans un ordre stable.
      for (let from = 0; from < 1_000_000; from += 1000) {
        const { data, error } = await db
          .rpc("notification_audience", {
            p_category: category,
            p_scope: scope,
            p_university: university,
            p_user_ids: userIds,
            p_actor: actorId,
          })
          .order("user_id")
          .range(from, from + 999);
        if (error) throw new NotifyError("audience_failed");
        rows.push(...(data || []));
        if (!data || data.length < 1000) break;
      }
      return rows;
    },

    async settings() {
      const { data } = await db.from("notification_settings")
        .select("reminders_weekly_cap, updated_at").eq("id", true).maybeSingle();
      return { remindersWeeklyCap: data?.reminders_weekly_cap ?? null, updatedAt: data?.updated_at ?? null };
    },

    async findSendByKey(key) {
      const { data } = await db.from("notification_sends")
        .select("id, status, targeted, eligible, sent, failed, excluded")
        .eq("idempotency_key", key).maybeSingle();
      return data || null;
    },

    async getSend(id) {
      const { data } = await db.from("notification_sends")
        .select("id, status, source, category, kind, onesignal_ids, scheduled_for, title, announcement_id")
        .eq("id", id).maybeSingle();
      return data || null;
    },

    async createSend(row) {
      const { data, error } = await db.from("notification_sends").insert(row).select("id").single();
      if (error?.code === "23505") return { conflict: true };
      if (error || !data?.id) throw new NotifyError("registry_failed");
      return { id: data.id };
    },

    async claim(sendId, rows) {
      const { data, error } = await db.rpc("notification_claim", { p_send_id: sendId, p_rows: rows });
      if (error) throw new NotifyError("registry_failed");
      return (data || []).map((row) => row.user_id);
    },

    async mark(sendId, userIds, status, onesignalId = null, errorCode = null) {
      const { error } = await db.rpc("notification_mark", {
        p_send_id: sendId,
        p_user_ids: userIds,
        p_status: status,
        p_onesignal_id: onesignalId,
        p_error: errorCode,
      });
      if (error) console.warn("notification mark not recorded", { status, code: error.code || null });
    },

    async finishSend(sendId, patch) {
      const { error } = await db.from("notification_sends").update(patch).eq("id", sendId);
      if (error) console.warn("notification send not finalised", { code: error.code || null });
    },
  };
}

/**
 * Envoie (ou simule) une notification.
 *
 * spec :
 *   source, category, kind, trigger       (obligatoires)
 *   target        { type, label?, university?, userIds? }
 *   content       { title: {fr,en}, body: {fr,en}, url }
 *   logContent    ce que garde le registre (par défaut : content). Une
 *                 demande d'ami y garde son modèle, jamais le nom de l'auteur.
 *   langs, authorId, actorId, announcementId, sendAfter
 *   idempotencyKey  clé de l'envoi entier (double clic, nouvel essai réseau)
 *   recipientKey(row) → clé anti-doublon d'un destinataire (ou null)
 *   extraReason(row)  → raison d'exclusion propre à l'envoi (ou null)
 *   audienceRows  audience déjà calculée (rappels du soir) ; sinon la base
 *   dryRun        rien n'est écrit ni envoyé
 *   recordEmpty   garder une trace même sans destinataire éligible (admin)
 */
export async function dispatchNotification({ store, onesignal, spec, now = new Date() }) {
  const {
    source, category, kind, trigger, target = { type: "users" }, content,
    langs = ["fr", "en"], authorId = null, actorId = null, announcementId = null,
    sendAfter = null, idempotencyKey = null, recipientKey = null, extraReason = null,
    audienceRows = null, dryRun = false, recordEmpty = false,
  } = spec;
  const logContent = spec.logContent || content;
  const stamp = (now instanceof Date ? now : new Date(now)).toISOString();

  if (!dryRun && !onesignal?.configured) throw new NotifyError("onesignal_unconfigured");

  if (!dryRun && idempotencyKey) {
    const existing = await store.findSendByKey(idempotencyKey);
    if (existing) return { duplicate: true, sendId: existing.id, status: existing.status, summary: summaryFromRow(existing) };
  }

  const rows = (audienceRows || await store.audience({
    category,
    scope: SCOPE_OF_TARGET[target.type] || "users",
    university: target.university || null,
    userIds: target.userIds || null,
    actorId,
  })).map((row) => ({ ...row, reason: row.reason || extraReason?.(row) || null }));

  const summary = summarizeAudience(rows);
  const eligibleRows = rows.filter((row) => !row.reason);

  if (dryRun) return { dryRun: true, status: "preview", summary, eligibleRows };
  if (!eligibleRows.length && !recordEmpty) return { status: "skipped", sendId: null, summary };

  const created = await store.createSend({
    source,
    category,
    kind,
    trigger,
    author_id: authorId,
    actor_id: actorId,
    target_type: target.type,
    target_label: target.label || null,
    title: logContent.title,
    body: logContent.body,
    url: logContent.url || null,
    langs,
    announcement_id: announcementId,
    scheduled_for: sendAfter,
    status: eligibleRows.length ? "pending" : "skipped",
    targeted: summary.targeted,
    excluded: summary.excluded,
    eligible: summary.eligible,
    idempotency_key: idempotencyKey,
    finished_at: eligibleRows.length ? null : stamp,
  });
  if (created.conflict) {
    const existing = await store.findSendByKey(idempotencyKey);
    return { duplicate: true, sendId: existing?.id || null, status: existing?.status || "pending", summary };
  }
  const sendId = created.id;
  if (!eligibleRows.length) return { status: "skipped", sendId, summary };

  // Réservation : ce qui a déjà été envoyé sous la même clé ne repart pas.
  const claimed = [];
  for (const part of chunks(eligibleRows, CLAIM_BATCH)) {
    const ids = await store.claim(sendId, part.map((row) => ({
      user_id: row.user_id,
      key: recipientKey ? recipientKey(row) : null,
      lang: row.lang || null,
    })));
    claimed.push(...ids);
  }
  const duplicates = eligibleRows.length - claimed.length;
  const excluded = { ...summary.excluded, ...(duplicates > 0 ? { duplicate: duplicates } : {}) };

  if (!claimed.length) {
    await store.finishSend(sendId, { status: "skipped", excluded, finished_at: stamp });
    return { status: "skipped", sendId, summary: { ...summary, excluded, eligible: summary.eligible }, counts: { claimed: 0, duplicates, sent: 0, failed: 0, unreachable: 0 } };
  }

  let sent = 0;
  let failed = 0;
  let unreachable = 0;
  let lastError = null;
  const onesignalIds = [];
  for (const part of chunks(claimed, ONESIGNAL_BATCH)) {
    try {
      const response = await onesignal.send({
        externalIds: part,
        title: content.title,
        body: content.body,
        url: content.url || null,
        sendAfter,
      });
      if (response.noRecipients) {
        unreachable += part.length;
        await store.mark(sendId, part, "unreachable", null, "no_subscription");
      } else {
        sent += part.length;
        onesignalIds.push(response.id);
        await store.mark(sendId, part, sendAfter ? "scheduled" : "sent", response.id, null);
      }
    } catch (error) {
      failed += part.length;
      lastError = error?.code || "send_failed";
      await store.mark(sendId, part, "failed", null, lastError);
    }
  }

  const status = failed === claimed.length ? "failed"
    : failed > 0 ? "partial"
    : sent === 0 ? "skipped"
    : sendAfter ? "scheduled"
    : "sent";
  const finalExcluded = { ...excluded, ...(unreachable ? { unreachable } : {}) };
  await store.finishSend(sendId, {
    status,
    sent,
    failed,
    onesignal_ids: onesignalIds,
    error: lastError,
    excluded: finalExcluded,
    finished_at: stamp,
  });
  return {
    status,
    sendId,
    summary: { ...summary, excluded: finalExcluded },
    counts: { claimed: claimed.length, duplicates, sent, failed, unreachable },
    onesignalIds,
    error: lastError,
  };
}

function summaryFromRow(row) {
  return {
    targeted: row.targeted ?? 0,
    excluded: row.excluded || {},
    eligible: row.eligible ?? 0,
    sent: row.sent ?? 0,
    failed: row.failed ?? 0,
  };
}

/** Annule un envoi programmé, chez OneSignal puis dans le registre. */
export async function cancelScheduledSend({ store, onesignal, sendId, now = new Date() }) {
  const send = await store.getSend(sendId);
  if (!send) throw new NotifyError("not_found");
  if (send.status !== "scheduled") throw new NotifyError("not_cancellable");
  for (const id of send.onesignal_ids || []) {
    try {
      await onesignal.cancel(id);
    } catch (_) {
      throw new NotifyError("cancel_refused");
    }
  }
  await store.mark(sendId, null, "cancelled", null, null);
  await store.finishSend(sendId, { status: "cancelled", finished_at: (now instanceof Date ? now : new Date(now)).toISOString() });
  return { ok: true, send };
}

/**
 * Relit chez OneSignal la livraison d'un envoi (appareils atteints, échecs).
 * Les clics ne sont pas repris : aucune mesure fiable n'est vérifiée à ce
 * jour, l'admin affiche donc « non disponible » plutôt qu'un zéro trompeur.
 */
export async function refreshDelivery({ store, onesignal, sendId, now = new Date() }) {
  const send = await store.getSend(sendId);
  if (!send) throw new NotifyError("not_found");
  const ids = send.onesignal_ids || [];
  if (!ids.length) return { delivery: null };
  const total = { successful: 0, failed: 0, errored: 0, remaining: 0 };
  for (const id of ids) {
    const stats = await onesignal.delivery(id);
    total.successful += stats.successful;
    total.failed += stats.failed;
    total.errored += stats.errored;
    total.remaining += stats.remaining;
  }
  const delivery = { ...total, fetched_at: (now instanceof Date ? now : new Date(now)).toISOString() };
  await store.finishSend(sendId, { delivery });
  return { delivery };
}
