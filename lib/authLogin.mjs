export function normalizePseudoForLogin(value) {
  return String(value || "").trim().toLowerCase();
}

export function pickPseudoCandidate(candidates, requestedPseudo) {
  const requested = String(requestedPseudo || "").trim();
  const rows = Array.isArray(candidates) ? candidates : [];
  const exact = rows.filter((row) => row?.pseudo === requested);
  if (exact.length === 1) return exact[0];

  const normalized = normalizePseudoForLogin(requested);
  const matches = rows.filter(
    (row) => normalizePseudoForLogin(row?.pseudo) === normalized
  );
  return matches.length === 1 ? matches[0] : null;
}

export function buildLoginIdentity(profile, authUser) {
  if (!profile?.id || !authUser?.id || profile.id !== authUser.id || !authUser.email) {
    return null;
  }

  return {
    userId: authUser.id,
    // Authentication must only ever use the address owned by Supabase Auth.
    // profiles.email is display data and may be stale or unverified.
    email: authUser.email,
  };
}

export function classifyAuthError(error) {
  if (!error) return null;
  const status = Number(error.status || 0);
  const code = String(error.code || "");
  const name = String(error.name || "");

  if (
    status === 429
    || code === "over_request_rate_limit"
    || code === "over_email_send_rate_limit"
  ) {
    return "rate_limited";
  }

  if (
    status >= 500
    || code === "unexpected_failure"
    || code === "request_timeout"
    || name === "AuthRetryableFetchError"
  ) {
    return "unavailable";
  }
  return "invalid";
}
