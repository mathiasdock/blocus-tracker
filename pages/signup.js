import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import AuthBackground from "../components/AuthBackground";
import AuthBrand from "../components/AuthBrand";
import PasswordInput from "../components/PasswordInput";
import { useAuth } from "../contexts/AuthContext";
import { useI18n } from "../contexts/I18nContext";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function FieldMessage({ id, error, helper }) {
  if (!error && !helper) return null;
  return (
    <p
      id={id}
      className={`mt-1.5 text-xs leading-relaxed ${error ? "bt-form-error" : ""}`}
      style={error ? undefined : { color: "var(--bt-text-2)" }}
      role={error ? "alert" : undefined}
    >
      {error || helper}
    </p>
  );
}

export default function Signup() {
  const { signUp, user, loading } = useAuth();
  const { t } = useI18n();
  const router = useRouter();
  const [firstName, setFirstName] = useState("");
  const [pseudo, setPseudo] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [touched, setTouched] = useState({});
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading && user) router.replace("/dashboard");
  }, [user, loading, router]);

  const errors = {
    firstName: !firstName.trim() ? t("signup.errFirstName") : "",
    pseudo: pseudo.trim().length < 3 || /\s/.test(pseudo.trim())
      ? t("signup.errPseudo")
      : "",
    email: !email.trim()
      ? t("signup.errEmail")
      : (!EMAIL_PATTERN.test(email.trim()) ? t("signup.errEmailInvalid") : ""),
    password: password.length < 6 ? t("signup.errPassword") : "",
  };

  function touch(field) {
    setTouched(current => ({ ...current, [field]: true }));
  }

  function clearServerError() {
    if (error) setError("");
  }

  async function handleSubmit(event) {
    event.preventDefault();
    const allTouched = { firstName: true, pseudo: true, email: true, password: true };
    setTouched(allTouched);
    setError("");

    const firstInvalid = Object.keys(errors).find(field => errors[field]);
    if (firstInvalid) {
      document.getElementById(`signup-${firstInvalid}`)?.focus();
      return;
    }

    let referralCode = null;
    try {
      const raw = localStorage.getItem("bt_ref_code");
      if (raw) {
        const { code, ts } = JSON.parse(raw);
        const thirtyDays = 30 * 24 * 60 * 60 * 1000;
        if (code && ts && Date.now() - ts < thirtyDays) referralCode = code;
      }
    } catch (_) {}

    setBusy(true);
    try {
      const { error: signUpError } = await signUp(
        pseudo.trim(),
        password,
        email.trim(),
        firstName.trim(),
        "",
        "",
        referralCode
      );

      if (signUpError) {
        if (signUpError.includes("already registered") || signUpError.includes("already been registered")) {
          setError(t("signup.errEmailTaken"));
        } else if (signUpError.includes("pseudo") || signUpError.includes("username")) {
          setError(t("signup.errPseudoTaken"));
        } else {
          setError(t("signup.unavailable"));
        }
        return;
      }

      try { localStorage.setItem("bt_just_registered", "1"); } catch (_) {}
      router.replace("/onboarding");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthBackground className="min-h-dvh flex items-center justify-center px-4 py-7 sm:py-10">
      <div className="w-full max-w-sm bt-stagger">
        <AuthBrand subtitle={t("signup.subtitle")} compact />

        <form onSubmit={handleSubmit} className="card p-6 sm:p-7" noValidate>
          <div className="mb-6">
            <h1 className="text-2xl">{t("signup.title")}</h1>
            <p className="mt-1.5 text-sm leading-relaxed" style={{ color: "var(--bt-text-2)" }}>
              {t("signup.fastSetup")}
            </p>
          </div>

          <div className="space-y-4">
            <div>
              <label className="label" htmlFor="signup-firstName">{t("profile.firstName")}</label>
              <input
                id="signup-firstName"
                className={`input ${touched.firstName && errors.firstName ? "input-error" : ""}`}
                value={firstName}
                onChange={event => { setFirstName(event.target.value); clearServerError(); }}
                onBlur={() => touch("firstName")}
                autoComplete="given-name"
                maxLength={50}
                disabled={busy}
                required
                autoFocus
                aria-invalid={Boolean(touched.firstName && errors.firstName)}
                aria-describedby={touched.firstName && errors.firstName ? "signup-firstName-message" : undefined}
              />
              <FieldMessage id="signup-firstName-message" error={touched.firstName ? errors.firstName : ""} />
            </div>

            <div>
              <label className="label" htmlFor="signup-pseudo">{t("signup.pseudo")}</label>
              <input
                id="signup-pseudo"
                className={`input ${touched.pseudo && errors.pseudo ? "input-error" : ""}`}
                value={pseudo}
                onChange={event => { setPseudo(event.target.value); clearServerError(); }}
                onBlur={() => touch("pseudo")}
                autoComplete="username"
                autoCapitalize="none"
                spellCheck="false"
                minLength={3}
                maxLength={30}
                disabled={busy}
                required
                aria-invalid={Boolean(touched.pseudo && errors.pseudo)}
                aria-describedby="signup-pseudo-message"
              />
              <FieldMessage
                id="signup-pseudo-message"
                error={touched.pseudo ? errors.pseudo : ""}
                helper={t("signup.pseudoHint")}
              />
            </div>

            <div>
              <label className="label" htmlFor="signup-email">{t("signup.email")}</label>
              <input
                id="signup-email"
                className={`input ${touched.email && errors.email ? "input-error" : ""}`}
                type="email"
                value={email}
                onChange={event => { setEmail(event.target.value); clearServerError(); }}
                onBlur={() => touch("email")}
                autoComplete="email"
                autoCapitalize="none"
                spellCheck="false"
                maxLength={254}
                disabled={busy}
                required
                aria-invalid={Boolean(touched.email && errors.email)}
                aria-describedby="signup-email-message"
              />
              <FieldMessage
                id="signup-email-message"
                error={touched.email ? errors.email : ""}
                helper={t("signup.emailHint")}
              />
            </div>

            <PasswordInput
              id="signup-password"
              label={t("login.password")}
              value={password}
              onChange={event => { setPassword(event.target.value); clearServerError(); }}
              onBlur={() => touch("password")}
              error={touched.password ? errors.password : ""}
              helper={t("signup.passwordHint")}
              autoComplete="new-password"
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
                {t("signup.creating")}
              </>
            ) : t("signup.create")}
          </button>

          <p className="mt-4 text-center text-xs leading-relaxed" style={{ color: "var(--bt-text-2)" }}>
            {t("signup.legalPre")} {" "}
            <Link href="/legal" className="bt-accent-link font-medium hover:underline">
              {t("signup.legalLink")}
            </Link>.
          </p>
        </form>

        <p className="mt-5 text-center text-sm font-medium" style={{ color: "var(--bt-text-1)" }}>
          {t("signup.alreadyAccount")} {" "}
          <Link href="/login" className="bt-accent-link inline-flex min-h-11 items-center font-semibold hover:underline">
            {t("login.signin")}
          </Link>
        </p>
      </div>
    </AuthBackground>
  );
}
