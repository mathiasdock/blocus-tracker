// Faux Supabase (GoTrue + PostgREST) pour les tests de renouvellement de session.
// Reproduit ce qui compte en production :
// - rotation du jeton de renouvellement, réemploi du parent accepté 10 s puis
//   révocation de toute la session (« Already Used ») ;
// - seau /token par IP : 30 d'avance, puis 150 par 5 min ;
// - jetons datés à l'heure du serveur, refusés une fois expirés (PostgREST
//   « JWT expired », GoTrue « token is expired »).
// `now` est l'horloge du serveur : un décalage avec celle du « téléphone »
// simule un téléphone à la mauvaise heure.

const API_VERSION = "2024-01-01";

function base64url(value) {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

export function makeJwt(payload) {
  // Signature non vérifiée ; base64url valide pour auth-js (decodeJWT).
  return `${base64url({ alg: "HS256", typ: "JWT" })}.${base64url(payload)}.c2lnbmF0dXJl`;
}

export function readJwt(token) {
  try {
    return JSON.parse(Buffer.from(String(token).split(".")[1], "base64url").toString("utf8"));
  } catch {
    return null;
  }
}

export function createFakeSupabase({
  anonKey = "anon-key",
  now = () => Date.now(),
  lifetimeS = 3600,
  reuseIntervalS = 10,
  bucket = { capacity: 30, refillPerSecond: 150 / 300 },
  rows = () => [],
} = {}) {
  const users = new Map([["u1", { id: "u1", email: "u1@example.test", password: "secret" }]]);
  const refreshTokens = new Map(); // jeton -> { sessionId, userId, usedAt, child }
  const revokedSessions = new Set();
  const buckets = new Map(); // ip -> { tokens, at }
  const counts = {
    refresh: 0, refreshOk: 0, refresh429: 0, refreshReuse: 0, refreshAlreadyUsed: 0, refreshInvalid: 0,
    password: 0, user: 0, userExpired: 0, logout: 0, restAuth: 0, restAnon: 0, rest401: 0,
    offlineAttempts: 0,
  };
  const log = [];
  let nextId = 1;
  // Réponse forcée pour un test : (requête) => réponse | null.
  let intercept = null;
  let offline = false;

  const seconds = () => Math.floor(now() / 1000);

  function take(ip) {
    const t = now();
    const state = buckets.get(ip) || { tokens: bucket.capacity, at: t };
    state.tokens = Math.min(bucket.capacity, state.tokens + ((t - state.at) / 1000) * bucket.refillPerSecond);
    state.at = t;
    buckets.set(ip, state);
    if (state.tokens < 1) return false;
    state.tokens -= 1;
    return true;
  }

  function setBucketTokens(tokens, ip = "campus") {
    buckets.set(ip, { tokens, at: now() });
  }

  function bucketTokens(ip = "campus") {
    const state = buckets.get(ip);
    if (!state) return bucket.capacity;
    return Math.min(bucket.capacity, state.tokens + ((now() - state.at) / 1000) * bucket.refillPerSecond);
  }

  function reply(status, body, headers = {}) {
    return {
      status,
      headers: { "Content-Type": "application/json", "X-Supabase-Api-Version": API_VERSION, ...headers },
      body: body == null ? null : JSON.stringify(body),
    };
  }

  function sessionFor(userId, sessionId, refreshToken) {
    const iat = seconds();
    const user = users.get(userId);
    return {
      access_token: makeJwt({
        sub: userId, aud: "authenticated", role: "authenticated", email: user.email,
        iat, exp: iat + lifetimeS, session_id: sessionId,
      }),
      token_type: "bearer",
      expires_in: lifetimeS,
      expires_at: iat + lifetimeS,
      refresh_token: refreshToken,
      user: { id: userId, aud: "authenticated", role: "authenticated", email: user.email },
    };
  }

  function newRefreshToken(sessionId, userId) {
    const token = `rt-${nextId++}`;
    refreshTokens.set(token, { sessionId, userId, usedAt: null, child: null });
    return token;
  }

  // Session ouverte directement (sans requête), pour préparer un test.
  function issueSession(userId = "u1") {
    const sessionId = `s-${nextId++}`;
    return sessionFor(userId, sessionId, newRefreshToken(sessionId, userId));
  }

  function bearerClaims(headers) {
    const value = headers.authorization || "";
    const token = value.startsWith("Bearer ") ? value.slice(7) : "";
    if (!token || token === anonKey) return { anon: true };
    const claims = readJwt(token);
    return { anon: false, claims, expired: !claims || claims.exp <= seconds() };
  }

  function refreshGrant(body, ip) {
    counts.refresh += 1;
    if (!take(ip)) {
      counts.refresh429 += 1;
      return reply(429, { code: "over_request_rate_limit", message: "Request rate limit reached" });
    }
    const record = refreshTokens.get(body.refresh_token);
    if (!record || revokedSessions.has(record.sessionId)) {
      counts.refreshInvalid += 1;
      return reply(400, { code: "refresh_token_not_found", message: "Invalid Refresh Token: Refresh Token Not Found" });
    }
    if (record.usedAt != null) {
      if (seconds() - record.usedAt <= reuseIntervalS) {
        counts.refreshReuse += 1;
        return reply(200, sessionFor(record.userId, record.sessionId, record.child));
      }
      counts.refreshAlreadyUsed += 1;
      revokedSessions.add(record.sessionId);
      return reply(400, { code: "refresh_token_already_used", message: "Invalid Refresh Token: Already Used" });
    }
    record.usedAt = seconds();
    record.child = newRefreshToken(record.sessionId, record.userId);
    counts.refreshOk += 1;
    return reply(200, sessionFor(record.userId, record.sessionId, record.child));
  }

  function passwordGrant(body, ip) {
    counts.password += 1;
    if (!take(ip)) return reply(429, { code: "over_request_rate_limit", message: "Request rate limit reached" });
    const user = [...users.values()].find((u) => u.email === body.email && u.password === body.password);
    if (!user) return reply(400, { code: "invalid_credentials", message: "Invalid login credentials" });
    return reply(200, issueSession(user.id));
  }

  function handle({ method = "GET", url, headers = {}, body = null, ip = "campus" }) {
    const parsed = new URL(url);
    const path = parsed.pathname;
    const lower = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
    const json = typeof body === "string" && body ? JSON.parse(body) : {};
    log.push({ at: now(), method, path: `${path}${parsed.search}`, authorization: lower.authorization || "" });
    const forced = intercept?.({ method, path, search: parsed.searchParams, headers: lower, body: json });
    if (forced) return reply(forced.status, forced.body ?? null, forced.headers);

    if (path === "/auth/v1/token" && method === "POST") {
      const grant = parsed.searchParams.get("grant_type");
      if (grant === "refresh_token") return refreshGrant(json, ip);
      if (grant === "password") return passwordGrant(json, ip);
      return reply(400, { code: "unsupported_grant_type", message: "Unsupported grant type" });
    }
    if (path === "/auth/v1/user" && method === "GET") {
      counts.user += 1;
      const auth = bearerClaims(lower);
      if (auth.anon) return reply(401, { code: "no_authorization", message: "This endpoint requires a valid Bearer token" });
      if (auth.expired) {
        counts.userExpired += 1;
        return reply(403, { code: "bad_jwt", message: "invalid JWT: unable to parse or verify signature, token has invalid claims: token is expired" });
      }
      if (revokedSessions.has(auth.claims.session_id)) return reply(403, { code: "session_not_found", message: "Session from session_id claim in JWT does not exist" });
      const user = users.get(auth.claims.sub);
      return reply(200, { id: user.id, aud: "authenticated", role: "authenticated", email: user.email });
    }
    if (path === "/auth/v1/logout" && method === "POST") {
      counts.logout += 1;
      const auth = bearerClaims(lower);
      if (auth.anon || auth.expired) return reply(403, { code: "bad_jwt", message: "token is expired" });
      if (parsed.searchParams.get("scope") !== "others") revokedSessions.add(auth.claims.session_id);
      return { status: 204, headers: {}, body: null };
    }
    if (path.startsWith("/rest/v1/")) {
      const auth = bearerClaims(lower);
      if (auth.anon) {
        counts.restAnon += 1;
        return reply(200, []);
      }
      if (auth.expired) {
        counts.rest401 += 1;
        return reply(401, { code: "PGRST303", details: null, hint: null, message: "JWT expired" }, {
          "WWW-Authenticate": 'Bearer error="invalid_token", error_description="JWT expired"',
        });
      }
      counts.restAuth += 1;
      return reply(200, rows({ path, search: parsed.searchParams, user: auth.claims }));
    }
    return reply(404, { message: "not found" });
  }

  async function fetchImpl(input, init = {}) {
    if (offline) {
      counts.offlineAttempts += 1;
      throw new TypeError("Failed to fetch");
    }
    const url = typeof input === "string" ? input : input.url;
    const headers = Object.fromEntries(new Headers(init.headers || {}).entries());
    const result = handle({ method: (init.method || "GET").toUpperCase(), url, headers, body: init.body ?? null });
    return new Response(result.body, { status: result.status, headers: result.headers });
  }

  return {
    anonKey, counts, log, users, handle, fetch: fetchImpl, issueSession, setBucketTokens, bucketTokens,
    revokeSession: (sessionId) => revokedSessions.add(sessionId),
    setIntercept: (fn) => { intercept = fn; },
    setOffline: (value) => { offline = value; },
  };
}
