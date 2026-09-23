// Contrôle d'accès des routes /api/admin/* — un seul endroit, côté serveur.
//
// Chaque route admin répétait sa propre copie de cette vérification ; une
// copie oubliée ou divergente suffit à ouvrir une route. Désormais :
//   1. le jeton Bearer est vérifié par Supabase Auth (jamais décodé à la main) ;
//   2. la fiche de l'appelant est relue avec la clé service role : il faut
//      is_admin = true ET un compte non suspendu ;
//   3. la route reçoit le client service role et l'identifiant de l'admin,
//      qu'elle transmet aux fonctions « admin_* » de la base (qui revérifient).
//
// Ce module lit SUPABASE_SERVICE_ROLE_KEY : il ne doit être importé que depuis
// pages/api/**, jamais depuis une page, un composant ou un contexte.
import { createClient } from "@supabase/supabase-js";
import { getBearerToken } from "../apiSecurity";
import { httpStatusForAdminError } from "../adminModeration.mjs";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const NO_SESSION = { auth: { autoRefreshToken: false, persistSession: false } };

export function isServerConfigured() {
  return Boolean(SUPABASE_URL && ANON_KEY && SERVICE_ROLE_KEY);
}

export function createServiceClient() {
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY, NO_SESSION);
}

// Identifie l'appelant à partir de son jeton. Renvoie { userId, token } ou
// null (et répond 401) quand le jeton manque ou n'est plus valide.
export async function requireUser(req, res) {
  const token = getBearerToken(req);
  if (!token) {
    res.status(401).json({ error: "Unauthorized" });
    return null;
  }
  const userClient = createClient(SUPABASE_URL, ANON_KEY, NO_SESSION);
  const { data, error } = await userClient.auth.getUser(token);
  const userId = data?.user?.id;
  if (error || !userId) {
    res.status(401).json({ error: "Unauthorized" });
    return null;
  }
  return { userId, token };
}

// Garde commune des routes admin. Renvoie { admin, userId, token } ou null
// après avoir déjà répondu (401, 403 ou 500).
export async function requireAdmin(req, res, route = "admin") {
  if (!isServerConfigured()) {
    res.status(500).json({ error: "Server misconfigured" });
    return null;
  }
  const caller = await requireUser(req, res);
  if (!caller) return null;

  const admin = createServiceClient();
  const { data: profile, error } = await admin
    .from("profiles")
    .select("is_admin, locked")
    .eq("id", caller.userId)
    .maybeSingle();

  // Un admin suspendu n'est plus admin : la base refuse de toute façon ses
  // écritures, la route ne lui ouvre donc rien non plus.
  if (error || !profile?.is_admin || profile.locked) {
    console.warn(`${route} forbidden`, { user: `${caller.userId.slice(0, 8)}...` });
    res.status(403).json({ error: "Forbidden" });
    return null;
  }
  return { admin, userId: caller.userId, token: caller.token };
}

// Réponse d'erreur des routes de modération : un code stable (voir
// classifyAdminDbError), jamais le message brut de la base.
export function sendAdminError(res, code, extra = {}) {
  return res.status(httpStatusForAdminError(code)).json({ error: code, ...extra });
}

// Fiche minimale de la cible d'une action admin (jamais son email).
export async function loadTargetProfile(admin, targetId) {
  const { data, error } = await admin
    .from("profiles")
    .select("id, pseudo, is_admin, locked")
    .eq("id", targetId)
    .maybeSingle();
  if (error) return { error: "failed" };
  if (!data) return { error: "not_found" };
  return { profile: data };
}

// Trace une action faite côté serveur (envoi de notification, nettoyage de
// fichiers…) dans le journal d'audit en ajout seul. La base revérifie que
// l'acteur est bien admin. Un échec d'écriture du journal est signalé dans
// les logs mais ne défait pas l'action déjà faite.
export async function logAdminAction(admin, actorId, action, entry = {}) {
  const { error } = await admin.rpc("log_admin_action", {
    p_actor: actorId,
    p_action: action,
    p_target_user: entry.targetUserId || null,
    p_target_type: entry.targetType || null,
    p_target_id: entry.targetId == null ? null : String(entry.targetId),
    p_reason: entry.reason || null,
    p_details: entry.details || {},
  });
  if (error) {
    console.error("admin audit log write failed", { action, code: error.code || "unknown" });
    return false;
  }
  return true;
}
