function emptyCallback() {
  return {
    type: null,
    isPasswordRecovery: false,
    isEmailChange: false,
    hasImplicitTokens: false,
    hasPkceCode: false,
    errorCode: null,
    subject: null,
    expiresAt: null,
  };
}

function decodeJwtClaims(token) {
  try {
    const parts = String(token || "").split(".");
    if (parts.length !== 3 || typeof globalThis.atob !== "function") return null;

    const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
    const bytes = Uint8Array.from(globalThis.atob(padded), (char) => char.charCodeAt(0));
    const json = new TextDecoder().decode(bytes);
    return JSON.parse(json);
  } catch {
    return null;
  }
}

export function shouldCaptureAuthCallback(pathname) {
  return String(pathname || "").replace(/\/+$/, "") === "/reset-password";
}

export function parseInitialAuthCallback(href) {
  if (!href) return emptyCallback();

  try {
    const url = new URL(href);
    const hash = new URLSearchParams(url.hash.replace(/^#/, ""));
    const errorCode = url.searchParams.get("error_code")
      || hash.get("error_code")
      || (
        url.searchParams.has("error")
        || hash.has("error")
        || url.searchParams.has("error_description")
        || hash.has("error_description")
          ? "auth_callback_error"
          : null
      );
    const rawType = hash.get("type") || url.searchParams.get("type");
    const type = rawType === "recovery" || rawType === "email_change" ? rawType : null;
    const accessToken = hash.get("access_token");
    const refreshToken = hash.get("refresh_token");
    const tokenType = hash.get("token_type");
    const expiresIn = Number(hash.get("expires_in"));
    const claims = decodeJwtClaims(accessToken);
    const subject = typeof claims?.sub === "string" && claims.sub ? claims.sub : null;
    const claimExpiry = Number(claims?.exp);
    // Supabase access tokens are JWTs. Keep the signed claim's expiry as
    // correlation metadata; do not trust a standalone expires_at parameter.
    const expiresAt = Number.isFinite(claimExpiry) && claimExpiry > 0
      ? claimExpiry
      : null;
    const hasImplicitTokens = Boolean(
      accessToken
      && refreshToken
      && String(tokenType || "").toLowerCase() === "bearer"
      && Number.isFinite(expiresIn)
      && expiresIn > 0
      && subject
      && expiresAt
    );

    return {
      // Keep only callback metadata. Access and refresh tokens must never be
      // copied outside supabase-js' own session handling.
      type,
      isPasswordRecovery: type === "recovery",
      isEmailChange: type === "email_change",
      hasImplicitTokens,
      hasPkceCode: url.searchParams.has("code"),
      errorCode,
      subject,
      expiresAt,
    };
  } catch {
    return { ...emptyCallback(), errorCode: "invalid_callback_url" };
  }
}

function callbackMatchesSession(callback, session, expectedType) {
  // Expiry is deliberately not compared with the device clock here.
  // auth.initialize() has already validated the token against Supabase's
  // server clock; phones with a skewed clock must not reject a valid link.
  if (
    !session?.user?.id
    || callback?.errorCode
    || callback?.type !== expectedType
    || callback?.hasImplicitTokens !== true
    || !callback?.subject
    || callback.subject !== session.user.id
    || !Number.isFinite(callback?.expiresAt)
  ) {
    return false;
  }

  return true;
}

export function canUsePasswordRecoverySession(
  callback,
  session,
  event = "INITIAL_SESSION"
) {
  if (event !== "INITIAL_SESSION" && event !== "PASSWORD_RECOVERY") return false;
  return callbackMatchesSession(callback, session, "recovery");
}

export function canAcceptRecoveryEvent({
  callback,
  session,
  event = "INITIAL_SESSION",
  initializationSucceeded,
  callbackRejected,
}) {
  if (callbackRejected || initializationSucceeded !== true) return false;
  return canUsePasswordRecoverySession(callback, session, event);
}

export function canUseEmailChangeSession(
  callback,
  session
) {
  return callbackMatchesSession(callback, session, "email_change");
}
