// Ménage quotidien des notifications — SERVEUR UNIQUEMENT.
// Appelé par la purge de nuit (/api/cron/purge-posts), qui l'inscrit dans le
// journal des tâches.
//
//   • Registre : chaque destinataire est gardé 180 jours (de quoi appliquer le
//     plafond de relances et répondre à « ai-je reçu ceci ? »), chaque envoi
//     un an (l'historique de l'admin). Les exclusions ne sont que des
//     compteurs : il n'y a rien d'autre à effacer.
//   • Appareils déclarés : un appareil détaché est effacé après 180 jours, un
//     appareil qui ne s'est plus manifesté depuis un an aussi.
//   • Comptes supprimés : la file push_identity_cleanup est vidée chez
//     OneSignal (utilisateur + abonnements) ; un échec reste en file.

import { createIdentityQueue, processIdentityCleanup } from "./pushIdentity.mjs";

export const RECIPIENT_RETENTION_DAYS = 180;
export const SEND_RETENTION_DAYS = 365;
export const DETACHED_DEVICE_RETENTION_DAYS = 180;
export const SILENT_DEVICE_RETENTION_DAYS = 365;

export async function notificationHousekeeping(db, onesignal, now = new Date()) {
  const at = (days) => new Date(now.getTime() - days * 864e5).toISOString();
  const out = { recipients: null, sends: null, devices: null, onesignal: null };
  try {
    const { count, error } = await db.from("notification_recipients")
      .delete({ count: "exact" }).lt("created_at", at(RECIPIENT_RETENTION_DAYS));
    out.recipients = error ? null : count || 0;
  } catch (_) {}
  try {
    const { count, error } = await db.from("notification_sends")
      .delete({ count: "exact" }).lt("created_at", at(SEND_RETENTION_DAYS));
    out.sends = error ? null : count || 0;
  } catch (_) {}
  try {
    const detached = await db.from("push_devices").delete({ count: "exact" })
      .eq("status", "detached").lt("detached_at", at(DETACHED_DEVICE_RETENTION_DAYS));
    const silent = await db.from("push_devices").delete({ count: "exact" })
      .lt("last_seen_at", at(SILENT_DEVICE_RETENTION_DAYS));
    out.devices = (detached.error || silent.error) ? null : (detached.count || 0) + (silent.count || 0);
  } catch (_) {}
  try {
    const result = await processIdentityCleanup({ queue: createIdentityQueue(db), onesignal, now });
    out.onesignal = { deleted: result.deleted + result.missing, failed: result.failed, skipped: result.skipped || null };
  } catch (_) {}
  return out;
}
