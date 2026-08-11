// API route serveur pour login par pseudo — résolution email côté serveur.
//
// Sécurité :
//   • Le SERVICE_ROLE_KEY n'est JAMAIS exposé au client (utilisé ici uniquement).
//   • Aucun email n'est jamais renvoyé au client — seuls les tokens de session.
//   • Rate limit : 8 tentatives / minute / IP (anti-bruteforce).
//   • CORS allowlist stricte.
//
// Env vars requises :
//   NEXT_PUBLIC_SUPABASE_URL
//   NEXT_PUBLIC_SUPABASE_ANON_KEY
//   SUPABASE_SERVICE_ROLE_KEY  ← server-only, à ajouter dans Vercel

import { createClient } from "@supabase/supabase-js";
import { getClientIp, requireJson, setBaseSecurityHeaders } from "../../lib/apiSecurity";
import { rateLimit } from "../../lib/rateLimit";
import {
  buildLoginIdentity,
  classifyAuthError,
  pickPseudoCandidate,
} from "../../lib/authLogin.mjs";

export const config = {
  api: {
    bodyParser: { sizeLimit: "8kb" },
  },
};

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Origines autorisées pour CORS
const allowedOrigins = [
  process.env.NEXT_PUBLIC_SITE_URL,
  // Older installed PWAs can still run from the apex origin even though the
  // canonical website now redirects to www. Their cross-origin API redirect
  // must remain usable until those service workers age out.
  "https://blocus-tracker.com",
  "https://www.blocus-tracker.com",
  ...(process.env.NODE_ENV === "development"
    ? ["http://localhost:3000", "http://127.0.0.1:3000"]
    : []),
].filter(Boolean);

function setCors(req, res) {
  const origin = req.headers.origin || "";
  if (allowedOrigins.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    res.setHeader("Access-Control-Allow-Credentials", "true");
  }
  setBaseSecurityHeaders(res);
}

function escapeIlikePattern(value) {
  return value.replace(/[\\%_]/g, "\\$&");
}

async function resolveProfileForLogin(adminClient, pseudo) {
  const { data: userId, error: rpcError } = await adminClient
    .rpc("resolve_login_user_id", { p_pseudo: pseudo });

  if (!rpcError) {
    return { profile: userId ? { id: userId, pseudo } : null, error: null };
  }

  // Rolling-deploy compatibility while v42 is being applied. This fallback
  // preserves case-insensitive login without ever choosing an ambiguous row.
  if (rpcError.code !== "PGRST202") return { profile: null, error: rpcError };

  const { data: candidates, error } = await adminClient
    .from("profiles")
    .select("id,pseudo")
    .ilike("pseudo", escapeIlikePattern(pseudo))
    .limit(3);

  if (error) return { profile: null, error };
  return { profile: pickPseudoCandidate(candidates, pseudo), error: null };
}

export default async function handler(req, res) {
  setCors(req, res);

  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  if (!requireJson(req, res)) return;

  // Rate limit : 8 tentatives / minute / IP
  const ip = getClientIp(req);
  const { ok } = rateLimit(`login:${ip}`, 8, 60_000);
  if (!ok) {
    return res
      .status(429)
      .json({ error: "Too many login attempts. Try again in a minute." });
  }

  if (!SUPABASE_URL || !ANON_KEY || !SERVICE_ROLE_KEY) {
    // En dev sans SERVICE_ROLE_KEY, on échoue clairement
    return res
      .status(500)
      .json({ error: "Server misconfigured (missing SUPABASE_SERVICE_ROLE_KEY)" });
  }

  const { pseudo, password } = req.body || {};
  if (
    typeof pseudo !== "string" ||
    typeof password !== "string" ||
    pseudo.length < 1 ||
    pseudo.length > 60 ||
    password.length < 1 ||
    password.length > 200
  ) {
    return res.status(400).json({ error: "Missing or invalid credentials" });
  }

  const cleanPseudo = pseudo.trim();

  // Client admin (service_role) — uniquement pour résoudre l'email côté serveur
  const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { profile, error: lookupErr } = await resolveProfileForLogin(
    adminClient,
    cleanPseudo
  );

  if (lookupErr) {
    console.error("[login] Unable to resolve the profile identity", {
      code: lookupErr.code || "unknown",
    });
    return res.status(500).json({ error: "Server error" });
  }

  if (!profile) {
    return res.status(401).json({ error: "Invalid credentials" });
  }

  // The profile row identifies the account, but never supplies the login
  // email. Only Supabase Auth owns that identity.
  const { data: authData, error: authLookupError } = await adminClient.auth.admin
    .getUserById(profile.id);
  if (authLookupError) {
    console.error("[login] Unable to load the Auth identity", {
      status: authLookupError.status || 0,
      code: authLookupError.code || "unknown",
    });
    return res.status(503).json({ error: "Service unavailable" });
  }

  const identity = buildLoginIdentity(profile, authData?.user);
  if (!identity) {
    console.error("[login] Profile/Auth identity invariant failed");
    return res.status(500).json({ error: "Server error" });
  }

  // Client utilisateur (anon-key) pour le signin
  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  let data;
  let error;
  try {
    ({ data, error } = await userClient.auth.signInWithPassword({
      email: identity.email,
      password,
    }));
  } catch (signInError) {
    console.error("[login] Supabase Auth request failed");
    return res.status(503).json({ error: "Service unavailable" });
  }

  if (error || !data?.session) {
    const kind = classifyAuthError(error);
    if (kind === "rate_limited") {
      res.setHeader("Retry-After", "60");
      return res.status(429).json({ error: "Too many login attempts" });
    }
    if (kind === "unavailable") {
      return res.status(503).json({ error: "Service unavailable" });
    }
    return res.status(401).json({ error: "Invalid credentials" });
  }

  // Defense in depth: even if a future lookup regression returns another
  // email, a session for a different account must never leave this endpoint.
  if (data.user?.id !== identity.userId) {
    await userClient.auth.signOut({ scope: "local" });
    console.error("[login] Refused a session for a different account");
    return res.status(500).json({ error: "Server error" });
  }

  // Retour : UNIQUEMENT les tokens de session — aucune fuite d'email
  return res.status(200).json({
    session: {
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
    },
  });
}
