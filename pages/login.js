import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import AuthBackground from "../components/AuthBackground";
import AuthBrand from "../components/AuthBrand";
import PasswordInput from "../components/PasswordInput";
import { useAuth } from "../contexts/AuthContext";
import { useI18n } from "../contexts/I18nContext";

export default function Login() {
  const { signIn, user, loading } = useAuth();
  const { t } = useI18n();
  const router = useRouter();
  const [loginId, setLoginId] = useState("");
  const [password, setPassword] = useState("");
  const [touched, setTouched] = useState({ loginId: false, password: false });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading && user) router.replace("/dashboard");
  }, [user, loading, router]);

  const loginIdError = touched.loginId && !loginId.trim()
    ? t("login.errIdentifier")
    : "";
  const passwordError = touched.password && !password
    ? t("login.errPassword")
    : "";

  async function handleSubmit(event) {
    event.preventDefault();
    setTouched({ loginId: true, password: true });
    setError("");

    if (!loginId.trim() || !password) {
      document.getElementById(!loginId.trim() ? "login-id" : "login-password")?.focus();
      return;
    }

    setBusy(true);
    try {
      const { error: signInError } = await signIn(loginId.trim(), password);
      if (signInError === "LOGIN_INVALID_CREDENTIALS") {
        setError(t("login.invalidCredentials"));
      } else if (signInError === "LOGIN_RATE_LIMITED") {
        setError(t("login.rateLimited"));
      } else if (signInError) {
        setError(t("login.unavailable"));
      } else {
        router.replace("/dashboard");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthBackground>
      <div className="w-full max-w-sm bt-stagger">
        <AuthBrand subtitle={t("login.tagline")} />

        <form onSubmit={handleSubmit} className="card p-6 sm:p-7" noValidate>
          <div className="mb-6">
            <h1 className="text-2xl">{t("login.title")}</h1>
            <p className="mt-1.5 text-sm leading-relaxed" style={{ color: "var(--bt-text-2)" }}>
              {t("login.subtitle")}
            </p>
          </div>

          <div className="space-y-4">
            <div>
              <label className="label" htmlFor="login-id">{t("login.pseudoOrEmail")}</label>
              <input
                id="login-id"
                className={`input ${loginIdError ? "input-error" : ""}`}
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
                aria-describedby={loginIdError ? "login-id-error" : undefined}
              />
              {loginIdError && (
                <p id="login-id-error" className="bt-form-error mt-1.5 text-xs" role="alert">
                  {loginIdError}
                </p>
              )}
            </div>

            <PasswordInput
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
          </div>

          {error && (
            <div className="bt-form-alert mt-5" role="alert" aria-live="polite">
              {error}
            </div>
          )}

          <button className="btn-primary mt-6 w-full min-h-11" disabled={busy} aria-busy={busy}>
            {busy ? (
              <>
                <span className="bt-button-spinner" aria-hidden="true" />
                {t("login.connecting")}
              </>
            ) : t("login.signin")}
          </button>

          <div className="mt-4 text-center">
            <Link href="/forgot-password" className="inline-flex min-h-11 items-center text-sm font-medium transition-colors hover:underline" style={{ color: "var(--bt-text-2)" }}>
              {t("login.forgotPwd")}
            </Link>
          </div>
        </form>

        <p className="mt-5 text-center text-sm font-medium" style={{ color: "var(--bt-text-1)" }}>
          {t("login.noaccount")} {" "}
          <Link href="/signup" className="bt-accent-link inline-flex min-h-11 items-center font-semibold hover:underline">
            {t("login.create")}
          </Link>
        </p>
      </div>
    </AuthBackground>
  );
}
