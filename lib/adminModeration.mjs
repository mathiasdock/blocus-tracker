// Règles pures des actions de modération de l'admin (suspendre, supprimer,
// modérer un profil). Partagées par les routes serveur /api/admin/members/*
// et par l'écran admin, testées dans tests/admin-moderation.test.mjs.
//
// La base revérifie tout (fonctions admin_* de v56 à v58) : ces règles servent
// à refuser tôt, avec un message clair, pas à remplacer la base.

export const REASON_MIN = 3;
export const REASON_MAX = 500;

// Les seules modifications qu'un admin peut faire sur le profil d'un membre.
// Plus aucune édition libre (nom, université, filière…) : v56 l'a retirée.
export const MODERATION_ACTIONS = Object.freeze(["reset_username", "clear_bio", "remove_avatar"]);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value) {
  return typeof value === "string" && UUID_RE.test(value);
}

export function cleanReason(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

// → { ok: true, reason } ou { ok: false, error: "reason_required" | "reason_too_long" }
export function validateReason(value) {
  if (typeof value !== "string") return { ok: false, error: "reason_required" };
  const reason = cleanReason(value);
  if (reason.length < REASON_MIN) return { ok: false, error: "reason_required" };
  if (reason.length > REASON_MAX) return { ok: false, error: "reason_too_long" };
  return { ok: true, reason };
}

export function isModerationAction(value) {
  return MODERATION_ACTIONS.includes(value);
}

function normalizePseudo(value) {
  return String(value ?? "").trim().replace(/^@/, "").toLowerCase();
}

// Supprimer un compte demande de retaper son pseudo. La cible reste désignée
// par son identifiant : ce n'est qu'une friction volontaire contre le clic de
// trop, tolérante à la casse et à un « @ » en tête (clavier de téléphone).
export function deletionConfirmed(typed, pseudo) {
  const expected = normalizePseudo(pseudo);
  return expected.length > 0 && normalizePseudo(typed) === expected;
}

// Traduit une erreur des fonctions admin_* en code stable, que l'écran admin
// affiche dans la langue du lecteur. Le message brut de la base ne sort pas.
export function classifyAdminDbError(error) {
  const message = String(error?.message || "");
  if (/yourself|your own account/i.test(message)) return "self_target";
  if (/^Admins cannot/i.test(message)) return "admin_target";
  if (/^Unknown (profile|account)/i.test(message)) return "not_found";
  if (/reason is required/i.test(message)) return "reason_required";
  if (error?.code === "42501") return "forbidden";
  if (error?.code === "22023") return "invalid";
  return "failed";
}

export function httpStatusForAdminError(code) {
  if (code === "self_target" || code === "admin_target" || code === "forbidden") return 403;
  if (code === "not_found") return 404;
  if (code === "reason_required" || code === "reason_too_long" || code === "invalid"
    || code === "confirmation_mismatch") return 400;
  return 500;
}
