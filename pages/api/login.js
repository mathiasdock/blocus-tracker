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

  const { data: profile, error: lookupErr } = await adminClient
    .from("profiles")
    .select("email")
    .eq("pseudo", cleanPseudo)
    .maybeSingle();

  if (lookupErr) {
    return res.status(500).json({ error: "Server error" });
  }

  // Si pas d'email réel défini, fallback sur le format ancien
  const email = (profile?.email && profile.email.length > 0)
    ? profile.email
    : `${cleanPseudo}@blocus.local`;

  // Client utilisateur (anon-key) pour le signin
  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data, error } = await userClient.auth.signInWithPassword({
    email,
    password,
  });

  if (error || !data?.session) {
    return res.status(401).json({ error: "Invalid credentials" });
  }

  // Retour : UNIQUEMENT les tokens de session — aucune fuite d'email
  return res.status(200).json({
    session: {
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
    },
  });
}
