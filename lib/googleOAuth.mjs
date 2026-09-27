import { deriveOnboardingState, ONBOARDING_VERSION } from "./onboarding.mjs";

export const GOOGLE_CALLBACK_PATH = "/auth/google-callback";
const RETURN_KEY = "bt_google_oauth_return";
const MAX_RETURN_AGE_MS = 10 * 60 * 1000;

// The OAuth redirect is always this deployment's own origin, never a URL from
// a query parameter. Supabase's redirect allowlist is the second boundary.
export function googleRedirectTo(origin) {
  const url = new URL(origin);
  const local = ["localhost", "127.0.0.1"].includes(url.hostname);
  if (url.origin !== origin || (url.protocol !== "https:" && !(local && url.protocol === "http:"))) {
    throw new Error("unsafe_oauth_origin");
  }
  return `${url.origin}${GOOGLE_CALLBACK_PATH}`;
}

export function safeGoogleReturnPath(value) {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//")) return null;
  if (/[\\\u0000-\u001f\u007f]/.test(value) || /%2f|%5c/i.test(value)) return null;
  try {
    const url = new URL(value, "https://www.blocus-tracker.com");
    if (url.origin !== "https://www.blocus-tracker.com") return null;
    if (/^\/(?:auth\/|login\/?$|signup\/?$|onboarding\/?$|reset-password\/?$|forgot-password\/?$)/.test(url.pathname)) return null;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return null;
  }
}

export function rememberGoogleReturnPath(storage, value, now = Date.now()) {
  const path = safeGoogleReturnPath(value);
  try {
    if (path) storage?.setItem(RETURN_KEY, JSON.stringify({ path, at: now }));
    else storage?.removeItem(RETURN_KEY);
  } catch {}
}

export function takeGoogleReturnPath(storage, now = Date.now()) {
  try {
    const raw = storage?.getItem(RETURN_KEY);
    storage?.removeItem(RETURN_KEY);
    const saved = JSON.parse(raw || "null");
    if (!Number.isFinite(saved?.at) || saved.at > now || now - saved.at > MAX_RETURN_AGE_MS) return null;
    return safeGoogleReturnPath(saved.path);
  } catch {
    return null;
  }
}

export function pendingReferralCode(storage, now = Date.now()) {
  try {
    const { code, ts } = JSON.parse(storage?.getItem("bt_ref_code") || "null") || {};
    return typeof code === "string" && code.length <= 40 && Number.isFinite(ts)
      && ts <= now && now - ts < 30 * 24 * 60 * 60 * 1000
      ? code.trim().toUpperCase() || null
      : null;
  } catch {
    return null;
  }
}

export function canUseGoogleCallbackSession(callback, session) {
  return Boolean(
    !callback?.errorCode
    && callback?.type == null
    && callback?.hasImplicitTokens === true
    && callback?.subject
    && Number.isFinite(callback?.expiresAt)
    && callback.subject === session?.user?.id
  );
}

// Supabase Auth owns account creation and automatic identity linking. This
// function never creates or merges auth users or profiles. A genuinely new
// Google user has no profile yet and uses the existing identity-repair step.
export async function finishGoogleOAuth({ supabase, callback, referralCode = null, destination = null }) {
  if (callback?.errorCode) {
    return { error: callback.errorCode === "access_denied" ? "cancelled" : "oauth_error" };
  }
  if (!callback?.hasImplicitTokens) return { error: "missing_callback" };

  try {
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    const session = sessionData?.session;
    if (sessionError || !canUseGoogleCallbackSession(callback, session)) return { error: "missing_session" };

    const { data: userData, error: userError } = await supabase.auth.getUser();
    const user = userData?.user;
    if (userError || user?.id !== session.user.id) return { error: "missing_session" };

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("id,pseudo,first_name,university,broad_field,study_year,locked")
      .eq("id", user.id)
      .maybeSingle();
    if (profileError) return { error: "profile_unavailable" };
    if (profile?.locked) return { error: "suspended" };

    if (!profile) {
      const metadata = { onboarding_version: ONBOARDING_VERSION };
      if (referralCode && !user.user_metadata?.pending_referral_code) {
        metadata.pending_referral_code = referralCode;
      }
      const { error: updateError } = await supabase.auth.updateUser({ data: metadata });
      if (updateError) return { error: "profile_unavailable" };
      return { path: "/onboarding", newProfile: true };
    }

    // Legacy users with a real profile remain legacy; a new onboarding rule
    // must not suddenly force them to add a field or course.
    if (Number(user.user_metadata?.onboarding_version || 0) < ONBOARDING_VERSION) {
      return { path: safeGoogleReturnPath(destination) || "/dashboard", newProfile: false };
    }

    const { data: courses, error: coursesError } = await supabase
      .from("courses")
      .select("id,archived_at")
      .eq("user_id", user.id)
      .is("archived_at", null)
      .limit(1);
    if (coursesError) return { error: "profile_unavailable" };
    const state = deriveOnboardingState({ user, profile, courses: courses || [] });
    return {
      path: state.complete ? (safeGoogleReturnPath(destination) || "/dashboard") : "/onboarding",
      newProfile: false,
    };
  } catch {
    return { error: "profile_unavailable" };
  }
}
