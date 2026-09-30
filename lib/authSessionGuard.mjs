// Garde du renouvellement de session Supabase, côté navigateur.
//
// auth-js (2.105.4) a deux faiblesses qu'on ne corrige pas dans node_modules :
//
// 1. Horloge. Il compare `expires_at` (heure du serveur) à `Date.now()` (heure
//    du téléphone), avec une marge de 90 s. Un téléphone en avance d'une heure
//    renouvelle à chaque requête (~35 /token par chargement, mesuré le
//    2026-09-30) ; en retard, il garde un jeton que le serveur refuse déjà.
//    Ici, auth-js lit un `expires_at` recalculé à chaque lecture comme
//    « maintenant + temps restant ». Le temps restant vient de `expires_in`
//    moins le temps écoulé depuis l'envoi de la demande, pris comme le plus
//    grand de `performance.now()` (insensible aux changements d'heure) et de
//    `Date.now()` (qui avance aussi pendant que l'appareil dort, ce que
//    `performance.now()` ne fait pas toujours sur iPhone). Dans le calcul
//    d'auth-js, les deux `Date.now()` s'annulent : seule la durée compte. Un
//    « JWT expired » du serveur fait renouveler le jeton.
//
// 2. Refus « trop de demandes ». Un 429 au renouvellement ferme la session.
//    Sur le NAT partagé d'UCF (seau /token par IP : 30 + 150 / 5 min), un seau
//    vide déconnecterait tous ceux qui renouvellent à ce moment-là. Ici, un
//    429 (ou un 500 / 503) laisse la session en place et ouvre une attente
//    croissante, tirée au hasard et partagée entre onglets, pendant laquelle
//    aucun renouvellement ne part. Le jeton courant reste utilisé tant qu'il
//    est vraiment valide ; ensuite, les requêtes de données échouent proprement
//    au lieu de partir en anonyme. Seules les erreurs définitives (jeton de
//    renouvellement invalide ou déjà utilisé, session révoquée) déconnectent.

export const EXPIRY_MARGIN_MS = 90_000; // marge d'auth-js avant expiration
export const HOLD_PRESENTED_MS = 122_000; // au-delà du seuil du minuteur d'auth-js (4 × 30 s)
export const MIN_LENT_MS = 30_000; // en dessous, le jeton n'est plus utilisé pendant l'attente
export const BACKOFF_BASE_MS = 5_000;
export const BACKOFF_CAP_MS = 60_000;
export const BACKOFF_FORGET_MS = 10 * 60_000; // une attente finie depuis 10 min ne compte plus
export const FRESH_TOKEN_MS = 60_000; // « JWT expired » ignoré pour un jeton reçu il y a moins d'1 min
export const TOKEN_AGE_ALLOWANCE_S = 60; // âge supposé d'un jeton reçu sans passer par /token
export const LOCK_WAIT_MS = 10_000;
export const BACKOFF_STORAGE_KEY = "bt_auth_refresh_backoff";
export const RENEWAL_PENDING_CODE = "BT_SESSION_RENEWAL_PENDING";

const LOCK_NAME = "bt-auth-refresh";
const API_VERSION = "2024-01-01";
const TRANSIENT_REFRESH_STATUSES = new Set([429, 500, 503]);
const JWT_EXPIRED = /jwt expired|token is expired|"exp" claim timestamp check failed/i;
const MAX_TOKENS = 16;

// Même clé que supabase-js par défaut (SupabaseClient : `sb-<ref>-auth-token`).
export function authStorageKeyFor(supabaseUrl) {
  return `sb-${new URL(supabaseUrl).hostname.split(".")[0]}-auth-token`;
}

// Attente après un refus : 5 s, 10 s, 20 s… jusqu'à 60 s, tirée entre 50 et
// 100 % pour que les téléphones d'un même réseau ne réessaient pas ensemble.
export function backoffDelayMs(failures, random = Math.random) {
  const ceiling = Math.min(BACKOFF_CAP_MS, BACKOFF_BASE_MS * 2 ** Math.max(0, failures - 1));
  return Math.round(ceiling * (0.5 + 0.5 * random()));
}

function parseJson(text) {
  if (typeof text !== "string" || !text) return null;
  try { return JSON.parse(text); } catch { return null; }
}

function isSession(value) {
  return !!value && typeof value === "object"
    && typeof value.access_token === "string"
    && typeof value.refresh_token === "string";
}

function jwtClaims(token) {
  const part = typeof token === "string" ? token.split(".")[1] : null;
  if (!part) return null;
  try {
    const base64 = part.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
    const bytes = Array.from(atob(padded), (c) => `%${c.charCodeAt(0).toString(16).padStart(2, "0")}`);
    return JSON.parse(decodeURIComponent(bytes.join("")));
  } catch {
    return null;
  }
}

function jsonResponse(status, body, reason) {
  return new Response(body == null ? null : JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "X-Supabase-Api-Version": API_VERSION,
      "X-Blocus-Auth": reason,
    },
  });
}

export function createAuthSessionGuard({
  supabaseUrl,
  anonKey,
  sessionStore,
  baseFetch = (...args) => fetch(...args),
  sharedStore = () => null,
  locks = () => null,
  wallNow = () => Date.now(),
  monoNow = () => (typeof performance !== "undefined" ? performance.now() : Date.now()),
  random = Math.random,
}) {
  const base = new URL(supabaseUrl);
  const sessionKey = authStorageKeyFor(supabaseUrl);
  const tokens = new Map(); // jeton d'accès -> { lifetimeMs, mono0, wall0, measured }
  const expiredTokens = new Set(); // jetons que le serveur a déclarés expirés
  const families = new Map(); // jeton de renouvellement -> session_id de sa session
  let memoryBackoff = null;
  let signingOut = 0;

  // --- Temps restant d'un jeton -------------------------------------------

  function track(token, lifetimeMs, { measured, mono0 = monoNow(), wall0 = wallNow() }) {
    tokens.delete(token);
    tokens.set(token, { lifetimeMs, mono0, wall0, measured });
    while (tokens.size > MAX_TOKENS) tokens.delete(tokens.keys().next().value);
    return tokens.get(token);
  }

  function elapsedMs(record) {
    return Math.max(monoNow() - record.mono0, wallNow() - record.wall0, 0);
  }

  // Session stockée par un autre onglet ou une page précédente : son
  // `expires_at` est dans le repère de ce téléphone (ou du serveur pour une
  // session d'avant ce correctif) ; on suit ensuite le temps écoulé.
  function adopt(session) {
    if (!Number.isFinite(session.expires_at)) return null;
    return track(session.access_token, session.expires_at * 1000 - wallNow(), { measured: false });
  }

  // Session obtenue sans passer par /token (connexion par pseudo, retour
  // Google, lien email) : auth-js a pris `exp` dans le JWT, à l'heure du
  // serveur. `exp - iat` est une durée, juste quelle que soit l'horloge ; on
  // ne dépasse jamais ce qu'auth-js aurait retenu.
  function adoptNew(session) {
    const claims = jwtClaims(session.access_token);
    const byAuthJs = Number.isFinite(session.expires_at) ? session.expires_at * 1000 - wallNow() : Infinity;
    const lifetime = claims && Number.isFinite(claims.exp) && Number.isFinite(claims.iat) && claims.exp > claims.iat
      ? (claims.exp - claims.iat - TOKEN_AGE_ALLOWANCE_S) * 1000
      : Infinity;
    const remaining = Math.min(byAuthJs, lifetime);
    if (!Number.isFinite(remaining)) return null;
    return track(session.access_token, remaining, { measured: false });
  }

  // Un jeton déclaré expiré par le serveur ne vaut plus rien, quoi qu'en dise
  // la mesure locale.
  function remainingOf(session, record = tokens.get(session.access_token) || adopt(session)) {
    if (expiredTokens.has(session.access_token) || !record) return -1;
    return record.lifetimeMs - elapsedMs(record);
  }

  function expiresAtFor(remaining) {
    return Math.floor((wallNow() + remaining) / 1000);
  }

  function withExpiresAt(raw, session, remaining) {
    const expiresAt = expiresAtFor(remaining);
    return expiresAt === session.expires_at ? raw : JSON.stringify({ ...session, expires_at: expiresAt });
  }

  function sessionIdOf(session) {
    const id = jwtClaims(session.access_token)?.session_id;
    return typeof id === "string" && id ? id : null;
  }

  // Retient à quelle session appartient chaque jeton de renouvellement vu ici.
  function noteFamily(session) {
    const id = sessionIdOf(session);
    if (!id || families.get(session.refresh_token) === id) return;
    families.delete(session.refresh_token);
    families.set(session.refresh_token, id);
    while (families.size > MAX_TOKENS * 2) families.delete(families.keys().next().value);
  }

  // Ce qu'auth-js lit : son calcul `expires_at * 1000 - Date.now()` redonne le
  // temps restant mesuré ici.
  function present(raw) {
    const session = parseJson(raw);
    if (!isSession(session)) return raw;
    noteFamily(session);
    const record = tokens.get(session.access_token) || adopt(session);
    if (!record) return raw;
    let remaining = remainingOf(session, record);
    // Pendant l'attente, un jeton encore valide reste utilisé sans qu'auth-js
    // ne tente de le renouveler.
    if (remaining > MIN_LENT_MS && backoffActive()) remaining = Math.max(remaining, HOLD_PRESENTED_MS);
    return withExpiresAt(raw, session, remaining);
  }

  // Ce qui est écrit : toujours la vraie échéance, pour les autres onglets.
  function prepareWrite(raw) {
    const session = parseJson(raw);
    if (!isSession(session)) return raw;
    noteFamily(session);
    const record = tokens.get(session.access_token) || adoptNew(session);
    if (!record) return raw;
    return withExpiresAt(raw, session, record.lifetimeMs - elapsedMs(record));
  }

  // Stockage lu et écrit par auth-js.
  const storage = {
    getItem(key) {
      const raw = sessionStore.getItem(key);
      return key === sessionKey ? present(raw) : raw;
    },
    setItem(key, value) {
      sessionStore.setItem(key, key === sessionKey ? prepareWrite(value) : value);
    },
    removeItem(key) {
      sessionStore.removeItem(key);
    },
  };

  function storedSession() {
    try {
      const session = parseJson(sessionStore.getItem(sessionKey));
      return isSession(session) ? session : null;
    } catch {
      return null;
    }
  }

  // --- Attente partagée après un refus ------------------------------------

  // L'attente partagée fait foi (un autre onglet a pu réussir et l'effacer) ;
  // la copie en mémoire ne sert que si le stockage est inaccessible.
  function backoffState() {
    let state = memoryBackoff;
    try {
      const store = sharedStore();
      if (store) state = parseJson(store.getItem(BACKOFF_STORAGE_KEY));
    } catch {}
    if (!state || !Number.isFinite(state.until) || !Number.isFinite(state.failures)) return null;
    const wait = state.until - wallNow();
    // Heure reculée depuis : l'attente enregistrée ne veut plus rien dire.
    if (wait > BACKOFF_CAP_MS + 1000 || wait < -BACKOFF_FORGET_MS) return null;
    return state;
  }

  function backoffActive() {
    const state = backoffState();
    return !!state && state.until > wallNow();
  }

  function writeBackoff(state) {
    memoryBackoff = state;
    try {
      const store = sharedStore();
      if (state) store?.setItem(BACKOFF_STORAGE_KEY, JSON.stringify(state));
      else store?.removeItem(BACKOFF_STORAGE_KEY);
    } catch {}
  }

  function recordTransientFailure() {
    const failures = Math.min((backoffState()?.failures || 0) + 1, 16);
    writeBackoff({ until: wallNow() + backoffDelayMs(failures, random), failures });
  }

  // --- Réponses locales ----------------------------------------------------

  // auth-js traite un 503 comme une panne passagère : il garde la session.
  function deferred(reason) {
    return jsonResponse(503, { code: "bt_refresh_deferred", message: "Session renewal deferred" }, reason);
  }

  // Pendant une déconnexion demandée : « session introuvable », qu'auth-js
  // traite en oubliant la session localement.
  function sessionGone(reason) {
    return jsonResponse(403, {
      code: "session_not_found",
      error_code: "session_not_found",
      msg: "Session forgotten locally during sign-out",
    }, reason);
  }

  // `expires_in` doit rester positif : sinon auth-js y voit une absence de
  // session et ferme tout.
  function sessionResponse(session, remaining, reason) {
    return jsonResponse(200, {
      ...session,
      expires_in: Math.max(1, Math.floor(remaining / 1000)),
      expires_at: expiresAtFor(remaining),
    }, reason);
  }

  // 401 : aucun jeton valide pour l'instant. postgrest-js relancerait un 503
  // trois fois, et chaque relance referait patienter auth-js.
  function renewalPending() {
    return jsonResponse(401, {
      code: RENEWAL_PENDING_CODE,
      message: "Session renewal pending",
      details: null,
      hint: null,
    }, "renewal-pending");
  }

  // --- Verrou entre onglets autour de l'envoi réseau -----------------------

  async function withRefreshLock(fn) {
    let manager = null;
    try { manager = locks(); } catch {}
    if (!manager || typeof manager.request !== "function") return fn();
    const controller = typeof AbortController === "function" ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), LOCK_WAIT_MS) : null;
    let ran = false;
    try {
      return await manager.request(LOCK_NAME, controller ? { signal: controller.signal } : {}, () => {
        ran = true;
        if (timer) clearTimeout(timer);
        return fn();
      });
    } catch (error) {
      if (ran) throw error;
      if (error?.name === "AbortError") return deferred("lock-timeout");
      return fn(); // verrou indisponible : sans verrou, comme avant ce correctif
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  // --- Réponses de session : échéance dans le repère de ce téléphone -------

  async function stampSession(response, startWall, startMono) {
    const text = await response.text();
    const body = parseJson(text);
    const lifetimeS = Number(body?.expires_in);
    const init = { status: response.status, statusText: response.statusText, headers: new Headers(response.headers) };
    init.headers.delete("content-length");
    init.headers.delete("content-encoding");
    if (!isSession(body) || !Number.isFinite(lifetimeS) || lifetimeS <= 0) return new Response(text || null, init);
    // Compté depuis l'envoi : la latence est du temps déjà consommé.
    track(body.access_token, lifetimeS * 1000, { measured: true, mono0: startMono, wall0: startWall });
    noteFamily(body);
    return new Response(JSON.stringify({ ...body, expires_at: Math.floor((startWall + lifetimeS * 1000) / 1000) }), init);
  }

  // --- Renouvellement ------------------------------------------------------

  function refreshTokenOf(body) {
    return typeof body === "string" ? parseJson(body)?.refresh_token || null : null;
  }

  async function refresh(input, init) {
    const requested = refreshTokenOf(init?.body);
    return withRefreshLock(async () => {
      const stored = storedSession();
      const family = requested ? families.get(requested) : null;
      if (family && stored && stored.refresh_token !== requested && sessionIdOf(stored) === family) {
        // Un autre onglet a déjà échangé ce jeton : la session stockée en est la
        // suite. Le renvoyer après 10 s ferait révoquer toute la session par
        // Supabase (« Already Used »). Une autre session (nouvelle connexion,
        // autre compte) n'est jamais concernée.
        const remaining = remainingOf(stored);
        return remaining > EXPIRY_MARGIN_MS
          ? sessionResponse(stored, remaining, "shared-session")
          : deferred("stale-refresh-token");
      }

      // Renouvellement impossible maintenant. Si le jeton actuel est encore
      // vraiment valide, auth-js le garde (« pas maintenant ») au lieu de
      // relancer en boucle ; sinon il patiente, et une déconnexion demandée
      // oublie la session ici.
      const notNow = (reason) => {
        const current = stored && stored.refresh_token === requested ? stored : null;
        const remaining = current ? remainingOf(current) : -1;
        if (remaining > MIN_LENT_MS) return sessionResponse(current, remaining, `keep-current:${reason}`);
        return signingOut ? sessionGone(`sign-out:${reason}`) : deferred(reason);
      };
      if (backoffActive()) return notNow("backoff");

      const startWall = wallNow();
      const startMono = monoNow();
      let response;
      try {
        response = await baseFetch(input, init);
      } catch (error) {
        if (signingOut) return sessionGone("sign-out:network");
        throw error; // réseau coupé : relances rapides d'auth-js, inchangées
      }
      if (response.ok) {
        writeBackoff(null);
        const stamped = await stampSession(response, startWall, startMono);
        // Enregistrée avant de rendre le verrou (auth-js l'écrira aussi, à
        // l'identique) : l'onglet qui attend voit déjà la nouvelle session et
        // ne renvoie pas l'ancien jeton.
        const body = parseJson(await stamped.clone().text());
        if (isSession(body)) storage.setItem(sessionKey, JSON.stringify(body));
        return stamped;
      }
      if (TRANSIENT_REFRESH_STATUSES.has(response.status)) {
        recordTransientFailure();
        return notNow(`http-${response.status}`);
      }
      return response; // définitive : auth-js ferme la session
    });
  }

  // --- Requêtes de données et lecture du compte ----------------------------

  function bearerOf(input, init) {
    try {
      const headers = new Headers(init?.headers || (typeof input === "object" && input?.headers) || undefined);
      const value = headers.get("authorization") || "";
      return value.startsWith("Bearer ") ? value.slice(7) : "";
    } catch {
      return "";
    }
  }

  async function noteExpiredJwt(response, token) {
    let text = "";
    try { text = await response.clone().text(); } catch {}
    const header = response.headers.get("www-authenticate") || "";
    if (!JWT_EXPIRED.test(text) && !JWT_EXPIRED.test(header)) return;
    const record = tokens.get(token);
    // Un jeton reçu il y a moins d'une minute ne peut pas être expiré : on ne
    // boucle pas sur une horloge serveur fausse.
    if (record?.measured && elapsedMs(record) < FRESH_TOKEN_MS) return;
    expiredTokens.add(token);
    while (expiredTokens.size > MAX_TOKENS) expiredTokens.delete(expiredTokens.values().next().value);
  }

  async function withExpiryFeedback(input, init, statuses) {
    const token = bearerOf(input, init);
    const response = await baseFetch(input, init);
    if (token && token !== anonKey && statuses.includes(response.status)) await noteExpiredJwt(response, token);
    return response;
  }

  async function data(input, init) {
    const token = bearerOf(input, init);
    // supabase-js n'envoie la clé publique que si auth-js n'a pas pu fournir la
    // session : avec une session encore stockée, c'est un renouvellement en
    // attente. La requête échoue ici au lieu de partir en anonyme.
    if ((!token || token === anonKey) && storedSession()) return renewalPending();
    return withExpiryFeedback(input, init, [400, 401, 403]);
  }

  async function logout(input, init) {
    // Déconnexion demandée : même sans réseau, la session est oubliée ici.
    try {
      const response = await baseFetch(input, init);
      if (signingOut && (response.status === 429 || response.status >= 500)) return jsonResponse(204, null, "sign-out");
      return response;
    } catch (error) {
      if (signingOut) return jsonResponse(204, null, "sign-out:network");
      throw error;
    }
  }

  async function sessionGrant(input, init) {
    const startWall = wallNow();
    const startMono = monoNow();
    const response = await baseFetch(input, init);
    return response.ok ? stampSession(response, startWall, startMono) : response;
  }

  // --- Aiguillage ----------------------------------------------------------

  function routeOf(input, init) {
    let url;
    try { url = new URL(typeof input === "string" ? input : input?.url || String(input), base); } catch { return "other"; }
    if (url.origin !== base.origin) return "other";
    const path = url.pathname;
    const method = String(init?.method || (typeof input === "object" && input?.method) || "GET").toUpperCase();
    if (path.endsWith("/auth/v1/token") && url.searchParams.get("grant_type") === "refresh_token") return "refresh";
    if (path.endsWith("/auth/v1/logout")) return "logout";
    if (path.endsWith("/auth/v1/user") && method === "GET") return "user";
    if (path.includes("/auth/v1/")) return method === "POST" ? "session-grant" : "other";
    if (/\/(rest|storage|functions|graphql)\/v1\//.test(path)) return "data";
    return "other";
  }

  function guardedFetch(input, init) {
    switch (routeOf(input, init)) {
      case "refresh": return refresh(input, init);
      case "logout": return logout(input, init);
      case "user": return withExpiryFeedback(input, init, [401, 403]);
      case "session-grant": return sessionGrant(input, init);
      case "data": return data(input, init);
      default: return baseFetch(input, init);
    }
  }

  return {
    sessionKey,
    fetch: guardedFetch,
    storage,
    // Enveloppe `supabase.auth.signOut` : une déconnexion demandée n'attend
    // jamais un renouvellement impossible.
    async whileSigningOut(fn) {
      signingOut += 1;
      try { return await fn(); } finally { signingOut -= 1; }
    },
    backoffActive,
  };
}
