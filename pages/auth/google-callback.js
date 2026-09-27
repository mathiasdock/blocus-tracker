import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import AuthShell, { AuthHeading } from "../../components/auth/AuthShell";
import { useI18n } from "../../contexts/I18nContext";
import {
  finishGoogleOAuth,
  pendingReferralCode,
  takeGoogleReturnPath,
} from "../../lib/googleOAuth.mjs";
import {
  clearInitialAuthCallback,
  getInitialAuthCallback,
  supabase,
} from "../../lib/supabaseClient";

export default function GoogleCallback() {
  const { t } = useI18n();
  const router = useRouter();
  const started = useRef(false);
  const active = useRef(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    active.current = true;
    if (started.current) return () => { active.current = false; };
    started.current = true;
    const callback = getInitialAuthCallback();
    const destination = takeGoogleReturnPath(window.sessionStorage);
    const referralCode = pendingReferralCode(window.localStorage);
    async function complete() {
      const result = await finishGoogleOAuth({ supabase, callback, referralCode, destination });
      clearInitialAuthCallback();
      if (!active.current) return;
      if (result.error === "suspended") {
        try { await supabase.auth.signOut({ scope: "local" }); } catch {}
        router.replace("/login?suspended=1");
      } else if (result.error) {
        setError(result.error);
      } else {
        router.replace(result.path);
      }
    }

    complete();
    return () => { active.current = false; };
  }, [router]);

  const message = error === "cancelled" ? t("auth.googleCancelled")
    : error === "missing_callback" || error === "missing_session" ? t("auth.googleSessionMissing")
      : t("auth.googleUnavailable");

  return (
    <AuthShell layout="single" contentKey={error ? "google-error" : "google-connecting"}>
      <AuthHeading
        title={error ? t("auth.googleErrorTitle") : t("auth.googleConnecting")}
        lead={error ? message : undefined}
      />
      {error ? <Link href="/login" className="bt-auth-primary">{t("login.signin")}</Link>
        : <div className="bt-auth-skeleton" role="status" aria-label={t("auth.googleConnecting")} />}
    </AuthShell>
  );
}
