import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import AuthShell, { AuthHeading } from "../components/auth/AuthShell";
import { Field, FieldGroup, FormNote, PasswordField, messageId } from "../components/auth/Field";
import MascotGuide from "../components/auth/MascotGuide";
import GoogleAuthButton from "../components/auth/GoogleAuthButton";
import AuthCaptcha, { useAuthCaptcha } from "../components/auth/AuthCaptcha";
import { useAuth } from "../contexts/AuthContext";
import { useI18n } from "../contexts/I18nContext";
import { isManagedOnboardingUser } from "../lib/onboarding.mjs";
import { guideText, setupGuide } from "../lib/setupGuide.mjs";
import { LEGAL_CONTACT_EMAIL } from "../lib/legalVersions";
import { syncAuthEmailLanguage } from "../lib/authEmailLanguage.mjs";
import { supabase } from "../lib/supabaseClient";

export default function Login() {
  const { signIn, user, loading, profileStatus } = useAuth();
  const { t, lang } = useI18n();
  const router = useRouter();
  const [loginId, setLoginId] = useState("");
  const [password, setPassword] = useState("");
  const [touched, setTouched] = useState({ loginId: false, password: false });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const submitting = useRef(false);
  const captcha = useAuthCaptcha();

  useEffect(() => {
    if (loading || !user) return;
    if (profileStatus === "missing") {
      router.replace({ pathname: "/onboarding", query: { repair: "1" } });
    } else if (profileStatus === "ready") {
      router.replace(isManagedOnboardingUser(user) ? "/onboarding" : "/dashboard");
    }
  }, [user, loading, profileStatus, router]);

  // Compte suspendu : refusé à la connexion (LOGIN_SUSPENDED) ou session
  // refermée par AuthContext, qui renvoie ici avec ?suspended=1.
  const suspendedNotice = t("login.suspended").replace("{email}", LEGAL_CONTACT_EMAIL);
  useEffect(() => {
    if (router.query.suspended === "1") setError(suspendedNotice);
  }, [router.query.suspended, suspendedNotice]);

  const loginIdError = touched.loginId && !loginId.trim()
    ? t("login.errIdentifier")
    : "";
  const passwordError = touched.password && !password
    ? t("login.errPassword")
    : "";

  async function handleSubmit(event) {
    event.preventDefault();
    if (submitting.current) return;
    setTouched({ loginId: true, password: true });
    setError("");

    if (!loginId.trim() || !password) {
      document.getElementById(!loginId.trim() ? "login-id" : "login-password")?.focus();
      return;
    }
    if (!captcha.requireToken()) return;

    submitting.current = true;
    setBusy(true);
    try {
      const { error: signInError } = await signIn(loginId.trim(), password, captcha.token);
      if (!signInError) {
        // The next recovery email can use this account's last known app
        // language. This does not alter the login result or redirect.
        void syncAuthEmailLanguage(supabase, lang);
      }
      if (signInError === "LOGIN_INVALID_CREDENTIALS") {
        setError(t("login.invalidCredentials"));
      } else if (signInError === "LOGIN_RATE_LIMITED") {
        setError(t("login.rateLimited"));
      } else if (signInError === "LOGIN_SUSPENDED") {
        setError(suspendedNotice);
      } else if (signInError === "LOGIN_CAPTCHA_FAILED") {
        setError(t("auth.captchaRejected"));
      } else if (signInError) {
        setError(t("login.unavailable"));
      }
    } catch {
      setError(t("login.unavailable"));
    } finally {
      captcha.reset();
      submitting.current = false;
      setBusy(false);
    }
  }

  const guide = setupGuide({ page: "login" });

  return (
    <AuthShell
      guide={<MascotGuide message={guideText(guide, t)} mood={guide.mood} reaction={guide.reaction} variant="hero" />}
      contentKey="login"
    >
      <AuthHeading title={t("setup.loginTitle")} />

      <GoogleAuthButton disabled={busy} next={router.query.next} />
      <p className="bt-auth-divider bt-auth-oauth-divider"><span>{t("auth.orEmail")}</span></p>

      <form onSubmit={handleSubmit} noValidate>
        <FieldGroup>
          <Field id="login-id" label={t("login.pseudoOrEmail")} error={loginIdError}>
            <input
              id="login-id"
              className="bt-field-input"
              value={loginId}
              onChange={event => {
                setLoginId(event.target.value);
                if (error) setError("");
              }}
              onBlur={() => setTouched(current => ({ ...current, loginId: true }))}
              autoComplete="username"
              autoCapitalize="none"
              spellCheck="false"
              disabled={busy}
              required
              autoFocus
              aria-invalid={Boolean(loginIdError)}
              aria-describedby={loginIdError ? messageId("login-id") : undefined}
            />
          </Field>
          <PasswordField
            id="login-password"
            label={t("login.password")}
            value={password}
            onChange={event => {
              setPassword(event.target.value);
              if (error) setError("");
            }}
            onBlur={() => setTouched(current => ({ ...current, password: true }))}
            error={passwordError}
            autoComplete="current-password"
            disabled={busy}
            showLabel={t("auth.showPassword")}
            hideLabel={t("auth.hidePassword")}
          />
        </FieldGroup>

        <p className="bt-auth-sublink">
          <Link href="/forgot-password">{t("login.forgotPwd")}</Link>
        </p>

        <AuthCaptcha controller={captcha} />
        <FormNote tone="error">{error}</FormNote>

        <button className="bt-auth-primary" disabled={busy} aria-busy={busy}>
          {busy && <span className="bt-button-spinner" aria-hidden="true" />}
          {busy ? t("login.connecting") : t("login.signin")}
        </button>
      </form>

      {/* The other door, where a newcomer's eye already is: right under the
          only button of the page, before anything else. */}
      <div className="bt-auth-door">
        <p className="bt-auth-divider"><span>{t("setup.newHere")}</span></p>
        <Link href="/signup" className="bt-auth-secondary">{t("login.create")}</Link>
      </div>

      <p className="bt-auth-footnote">{t("login.repairHint")}</p>
    </AuthShell>
  );
}
