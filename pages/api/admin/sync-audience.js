// Synchronise le consentement marketing de l'app avec les Contacts Resend.
//
// Pourquoi une synchro et pas un envoi : les Broadcasts Resend gèrent déjà la
// rédaction, le lien de désabonnement et l'en-tête List-Unsubscribe (exigé par
// Gmail/Outlook pour les envois en volume). On ne réimplémente pas tout ça —
// l'app se contente de tenir la LISTE à jour, Mathias rédige et envoie depuis
// le dashboard Resend.
//
// La synchro est à DOUBLE SENS, et c'est le point important :
//   app → Resend : qui a coché le réglage dans /profile ;
//   Resend → app : qui s'est désabonné depuis un email reçu. Sans ce retour,
//     le réglage afficherait encore « activé » à quelqu'un qui vient de se
//     désabonner, et la synchro suivante le réinscrirait — exactement ce que
//     le RGPD interdit. Le désabonnement côté Resend l'emporte toujours.
//
// La clé Resend est server-only (règle 3 du CLAUDE.md) : elle ne transite
// jamais par le navigateur, cette route est la seule à la lire.

import { createClient } from "@supabase/supabase-js";
import { getBearerToken, getClientIp, setBaseSecurityHeaders } from "../../../lib/apiSecurity";
import { rateLimit } from "../../../lib/rateLimit";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const RESEND_API_KEY = process.env.RESEND_API_KEY;

const RESEND = "https://api.resend.com";
// Vercel coupe la fonction au bout de 60 s. On plafonne le travail par appel et
// on le DIT dans la réponse plutôt que de tronquer en silence : relancer la
// synchro reprend là où elle en était, puisqu'elle est idempotente.
const MAX_CONTACTS_PER_RUN = 400;
const READBACK_PAGE = 100;
const BATCH = 4;

function resendHeaders() {
  return {
    Authorization: `Bearer ${RESEND_API_KEY}`,
    "Content-Type": "application/json",
  };
}

async function resendFetch(path, init) {
  const res = await fetch(`${RESEND}${path}`, { ...init, headers: resendHeaders() });
  let body = null;
  try { body = await res.json(); } catch (_) { body = null; }
  return { status: res.status, ok: res.ok, body };
}

/**
 * Aligne un contact sur l'état voulu. PATCH d'abord (l'endpoint accepte
 * l'email comme identifiant), POST si le contact n'existe pas encore.
 * On ne CRÉE que les opt-in : inutile de créer un contact pour le marquer
 * immédiatement désabonné, ça polluerait l'audience.
 */
async function pushContact({ email, firstName, optedIn }) {
  const id = encodeURIComponent(email);
  const payload = { unsubscribed: !optedIn };
  if (firstName) payload.first_name = firstName;

  const patched = await resendFetch(`/contacts/${id}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
  if (patched.ok) return { action: "updated" };
  if (patched.status !== 404) {
    return { action: "failed", status: patched.status };
  }
  if (!optedIn) return { action: "skipped" };

  const created = await resendFetch("/contacts", {
    method: "POST",
    body: JSON.stringify({ email, unsubscribed: false, ...(firstName ? { first_name: firstName } : {}) }),
  });
  return created.ok ? { action: "created" } : { action: "failed", status: created.status };
}

/** Contacts désabonnés côté Resend, par email minuscule. → Set|null */
async function fetchResendUnsubscribed() {
  const unsubscribed = new Set();
  let after = null;
  for (let page = 0; page < 40; page += 1) {
    const query = `?limit=${READBACK_PAGE}${after ? `&after=${encodeURIComponent(after)}` : ""}`;
    const res = await resendFetch(`/contacts${query}`, { method: "GET" });
    if (!res.ok) return null;
    const rows = res.body?.data || [];
    rows.forEach((row) => {
      if (row?.unsubscribed && row?.email) unsubscribed.add(String(row.email).toLowerCase());
    });
    if (!res.body?.has_more || !rows.length) return unsubscribed;
    after = rows[rows.length - 1]?.id;
    if (!after) return unsubscribed;
  }
  return unsubscribed;
}

async function inBatches(items, size, worker) {
  const out = [];
  for (let i = 0; i < items.length; i += size) {
    const slice = items.slice(i, i + size);
    out.push(...await Promise.all(slice.map(worker)));
  }
  return out;
}

export default async function handler(req, res) {
  setBaseSecurityHeaders(res);

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const ip = getClientIp(req);
  const limited = rateLimit(`admin-sync-audience:${ip}`, 4, 60_000);
  if (!limited.ok) {
    return res.status(429).json({ error: "Too many requests" });
  }

  if (!SUPABASE_URL || !ANON_KEY || !SERVICE_ROLE_KEY) {
    return res.status(500).json({ error: "Server misconfigured" });
  }
  if (!RESEND_API_KEY) {
    return res.status(500).json({ error: "RESEND_API_KEY missing" });
  }

  const token = getBearerToken(req);
  if (!token) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: userData, error: userError } = await userClient.auth.getUser(token);
  const userId = userData?.user?.id;
  if (userError || !userId) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: adminProfile, error: profileError } = await admin
    .from("profiles")
    .select("is_admin")
    .eq("id", userId)
    .maybeSingle();

  if (profileError || !adminProfile?.is_admin) {
    console.warn("admin/sync-audience forbidden", { user: `${userId.slice(0, 8)}...` });
    return res.status(403).json({ error: "Forbidden" });
  }

  // ── Liste d'envoi ─────────────────────────────────────────────────────────
  // La RPC exclut déjà les adresses nulles, les comptes verrouillés et les
  // ~60 comptes legacy en @blocus.local, dont les hard bounces abîmeraient la
  // réputation du domaine — donc la délivrance des emails de reset.
  const { data: audience, error: audienceError } = await admin.rpc("get_promo_email_audience");
  if (audienceError) {
    return res.status(503).json({ error: "Migration v38 not applied", detail: audienceError.message });
  }

  const rows = (audience || []).filter((r) => r?.email);
  const truncated = rows.length > MAX_CONTACTS_PER_RUN;
  const batch = rows.slice(0, MAX_CONTACTS_PER_RUN);

  // ── 1) app → Resend ───────────────────────────────────────────────────────
  const pushed = await inBatches(batch, BATCH, (row) => pushContact({
    email: row.email,
    firstName: row.first_name,
    optedIn: row.promo_emails === true,
  }));

  const summary = pushed.reduce((acc, r) => {
    acc[r.action] = (acc[r.action] || 0) + 1;
    return acc;
  }, {});

  // ── 2) Resend → app ───────────────────────────────────────────────────────
  // Quelqu'un qui s'est désabonné depuis un email doit voir son réglage
  // repasser à "off", sinon la synchro suivante le réinscrirait.
  let reconciled = 0;
  let readbackFailed = false;
  const unsubscribed = await fetchResendUnsubscribed();
  if (unsubscribed === null) {
    readbackFailed = true;
  } else if (unsubscribed.size) {
    const toDisable = batch
      .filter((r) => r.promo_emails === true && unsubscribed.has(String(r.email).toLowerCase()))
      .map((r) => r.id);
    if (toDisable.length) {
      const { error: disableError } = await admin
        .from("profiles")
        .update({ promo_emails: false })
        .in("id", toDisable);
      if (!disableError) reconciled = toDisable.length;
    }
  }

  return res.status(200).json({
    ok: true,
    eligible: rows.length,
    processed: batch.length,
    optedIn: batch.filter((r) => r.promo_emails === true).length,
    ...summary,
    reconciled,
    ...(readbackFailed ? { warning: "Resend read-back failed — unsubscribes not reconciled this run" } : {}),
    ...(truncated ? { truncated: `Only the first ${MAX_CONTACTS_PER_RUN} of ${rows.length} were processed. Run again to continue.` } : {}),
  });
}
