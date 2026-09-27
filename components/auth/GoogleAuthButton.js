import { useEffect, useRef, useState } from "react";
import { FormNote } from "./Field";
import { useI18n } from "../../contexts/I18nContext";
import { googleRedirectTo, rememberGoogleReturnPath } from "../../lib/googleOAuth.mjs";
import { isOfflineDev, supabase } from "../../lib/supabaseClient";

function GoogleMark() {
  return (
    <svg width="19" height="19" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path fill="#4285F4" d="M21.6 12.23c0-.71-.06-1.39-.18-2.05H12v3.87h5.39a4.61 4.61 0 0 1-2 3.02v2.52h3.24c1.89-1.74 2.97-4.3 2.97-7.36Z" />
      <path fill="#34A853" d="M12 22c2.7 0 4.96-.9 6.62-2.41l-3.24-2.52c-.9.6-2.05.96-3.38.96-2.59 0-4.78-1.75-5.57-4.1H3.09v2.6A10 10 0 0 0 12 22Z" />
      <path fill="#FBBC05" d="M6.43 13.93a6.02 6.02 0 0 1 0-3.86v-2.6H3.09a10 10 0 0 0 0 9.06l3.34-2.6Z" />
      <path fill="#EA4335" d="M12 5.97c1.43 0 2.72.49 3.73 1.47l2.8-2.8A9.55 9.55 0 0 0 12 2a10 10 0 0 0-8.91 5.47l3.34 2.6c.79-2.35 2.98-4.1 5.57-4.1Z" />
    </svg>
  );
}

export default function GoogleAuthButton({ disabled = false, next = null }) {
  const { t } = useI18n();
  const started = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    // A cancelled external redirect can restore this page from the bfcache.
    const reset = () => { started.current = false; setBusy(false); };
    window.addEventListener("pageshow", reset);
    return () => window.removeEventListener("pageshow", reset);
  }, []);

  async function startGoogle() {
    if (started.current || disabled) return;
    started.current = true;
    setBusy(true);
    setError("");

    if (isOfflineDev) {
      setError(t("auth.googleUnavailable"));
      started.current = false;
      setBusy(false);
      return;
    }

    try {
      const redirectTo = googleRedirectTo(window.location.origin);
      rememberGoogleReturnPath(window.sessionStorage, Array.isArray(next) ? next[0] : next);
      const { error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo },
      });
      if (oauthError) throw oauthError;
      // The browser is leaving; remain disabled until navigation. If it comes
      // back from Google, pageshow releases the button without a second flow.
    } catch {
      rememberGoogleReturnPath(window.sessionStorage, null);
      setError(t("auth.googleUnavailable"));
      started.current = false;
      setBusy(false);
    }
  }

  return (
    <div className="bt-auth-google-group">
      <button
        type="button"
        className="bt-auth-google"
        onClick={startGoogle}
        disabled={busy || disabled}
        aria-busy={busy}
        aria-describedby={error ? "google-auth-error" : undefined}
      >
        {busy ? <span className="bt-button-spinner" aria-hidden="true" /> : <GoogleMark />}
        <span>{busy ? t("auth.googleConnecting") : t("auth.continueWithGoogle")}</span>
      </button>
      <FormNote id="google-auth-error" tone="error">{error}</FormNote>
    </div>
  );
}
