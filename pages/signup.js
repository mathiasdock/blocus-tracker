import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import AuthBackground from "../components/AuthBackground";
import AuthBrand from "../components/AuthBrand";
import PasswordInput from "../components/PasswordInput";
import { useAuth } from "../contexts/AuthContext";
import { useI18n } from "../contexts/I18nContext";
import { isManagedOnboardingUser } from "../lib/onboarding.mjs";
import { PRIVACY_VERSION, TERMS_VERSION } from "../lib/legalVersions";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ACCOUNT_FIELDS = ["email", "password", "confirm", "terms"];
const IDENTITY_FIELDS = ["firstName", "pseudo"];

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
  const { signUp, user, loading, profileStatus } = useAuth();
  const { t } = useI18n();
  const router = useRouter();
  const signupInProgress = useRef(false);
  const [step, setStep] = useState(0);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [pseudo, setPseudo] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [touched, setTouched] = useState({});
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [awaitingEmail, setAwaitingEmail] = useState("");

  useEffect(() => {
    if (loading || !user || signupInProgress.current) return;
    if (profileStatus === "missing") {
      router.replace({ pathname: "/onboarding", query: { repair: "1" } });
    } else if (profileStatus === "ready") {
      router.replace(isManagedOnboardingUser(user) ? "/onboarding" : "/dashboard");
    }
  }, [user, loading, profileStatus, router]);

  const errors = {
    email: !email.trim()
      ? t("signup.errEmail")
      : (!EMAIL_PATTERN.test(email.trim()) ? t("signup.errEmailInvalid") : ""),
    password: password.length < 6 ? t("signup.errPassword") : "",
    confirm: !confirm
      ? t("signup.errConfirmPassword")
      : (password !== confirm ? t("signup.errPwdMatch") : ""),
    terms: !acceptedTerms ? t("signup.errTerms") : "",
    firstName: !firstName.trim() ? t("signup.errFirstName") : "",
    pseudo: pseudo.trim().length < 3 || pseudo.trim().length > 30 || /\s/.test(pseudo.trim())
      ? t("signup.errPseudo")
      : "",
  };

  function touch(field) {
    setTouched(current => ({ ...current, [field]: true }));
  }

  function clearServerError() {
    if (error) setError("");
  }

  function focusFirstInvalid(fields) {
    const firstInvalid = fields.find(field => errors[field]);
    if (!firstInvalid) return false;
    document.getElementById(`signup-${firstInvalid}`)?.focus();
    return true;
  }

  function showIdentityStep() {
    setTouched(current => ({
      ...current,
      ...Object.fromEntries(ACCOUNT_FIELDS.map(field => [field, true])),
    }));
    setError("");
    if (focusFirstInvalid(ACCOUNT_FIELDS)) return;
    setStep(1);
    setTimeout(() => document.getElementById("signup-firstName")?.focus(), 0);
  }

  function showAccountStep() {
    setStep(0);
    setTimeout(() => document.getElementById("signup-email")?.focus(), 0);
  }

  async function createAccount() {
    setTouched(current => ({
      ...current,
      ...Object.fromEntries(IDENTITY_FIELDS.map(field => [field, true])),
    }));
    setError("");
    if (focusFirstInvalid(IDENTITY_FIELDS)) return;

    let referralCode = null;
    try {
      const raw = localStorage.getItem("bt_ref_code");
      if (raw) {
        const { code, ts } = JSON.parse(raw);
        const thirtyDays = 30 * 24 * 60 * 60 * 1000;
        if (code && ts && Date.now() - ts < thirtyDays) referralCode = code;
      }
    } catch (_) {}

    signupInProgress.current = true;
    setBusy(true);
    try {
      const result = await signUp({
        pseudo: pseudo.trim(),
        password,
        email: email.trim(),
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        referralCode,
        termsVersion: TERMS_VERSION,
        privacyVersion: PRIVACY_VERSION,
      });

      if (result.error) {
        signupInProgress.current = false;
        if (result.errorCode === "EMAIL_TAKEN") setError(t("signup.errEmailTaken"));
        else if (result.errorCode === "PSEUDO_TAKEN") setError(t("signup.errPseudoTaken"));
        else setError(t("signup.unavailable"));
        return;
      }

      try {
        localStorage.setItem("bt_just_registered", "1");
        if (result.userId) localStorage.setItem(`bt_onboarding_step_${result.userId}`, "2");
      } catch (_) {}

      if (result.confirmationRequired) {
        signupInProgress.current = false;
        setAwaitingEmail(result.email || email.trim());
        return;
      }
      await router.replace("/onboarding");
    } catch (_) {
      signupInProgress.current = false;
      setError(t("signup.unavailable"));
    } finally {
      setBusy(false);
    }
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (step === 0) showIdentityStep();
    else await createAccount();
  }

  if (awaitingEmail) {
    return (
      <AuthBackground className="min-h-dvh flex items-center justify-center px-4 py-7 sm:py-10">
        <div className="w-full max-w-md bt-stagger">
          <AuthBrand subtitle={t("signup.subtitle")} compact />
          <section className="card p-6 sm:p-7" aria-live="polite">
            <h1 className="text-2xl">{t("signup.checkEmailTitle")}</h1>
            <p className="mt-2 text-sm leading-relaxed" style={{ color: "var(--bt-text-2)" }}>
              {t("signup.checkEmailBody").replace("{email}", awaitingEmail)}
            </p>
            <p className="mt-4 text-sm leading-relaxed" style={{ color: "var(--bt-text-2)" }}>
              {t("signup.checkEmailResume")}
            </p>
            <Link href="/login" className="btn-ghost mt-6 w-full text-center">
              {t("signup.checkEmailLogin")}
            </Link>
          </section>
        </div>
      </AuthBackground>
    );
  }

  return (
    <AuthBackground className="min-h-dvh flex items-center justify-center px-4 py-7 sm:py-10">
      <div className="w-full max-w-md bt-stagger">
        <AuthBrand subtitle={t("signup.subtitle")} compact />

        <form onSubmit={handleSubmit} className="card p-6 sm:p-7" noValidate>
          <div className="mb-5">
            <div className="mb-4 flex items-center justify-between text-xs font-semibold" style={{ color: "var(--bt-text-2)" }}>
              <span>{t("signup.step")} {step + 1} / 5</span>
              <span>{step === 0 ? t("signup.stepAccount") : t("signup.stepYou")}</span>
            </div>
            <div
              className="mb-6 h-1.5 overflow-hidden rounded-full"
              style={{ backgroundColor: "var(--bt-border)" }}
              role="progressbar"
              aria-label={`${t("signup.step")} ${step + 1} / 5`}
              aria-valuemin="1"
              aria-valuemax="5"
              aria-valuenow={step + 1}
            >
              <div
                className="h-full rounded-full bg-accent transition-[width] duration-300 ease-out motion-reduce:transition-none"
                style={{ width: `${((step + 1) / 5) * 100}%` }}
              />
            </div>
            <h1 className="text-2xl">{step === 0 ? t("signup.accountTitle") : t("signup.youTitle")}</h1>
            <p className="mt-1.5 text-sm leading-relaxed" style={{ color: "var(--bt-text-2)" }}>
              {step === 0 ? t("signup.accountSubtitle") : t("signup.youSubtitle")}
            </p>
          </div>

          {step === 0 && (
            <div className="bt-rise space-y-4">
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
                  required
                  autoFocus
                  aria-invalid={Boolean(touched.email && errors.email)}
                  aria-describedby="signup-email-message"
                />
                <FieldMessage id="signup-email-message" error={touched.email ? errors.email : ""} helper={t("signup.emailHint")} />
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
                showLabel={t("auth.showPassword")}
                hideLabel={t("auth.hidePassword")}
              />

              <PasswordInput
                id="signup-confirm"
                label={t("signup.confirmPwd")}
                value={confirm}
                onChange={event => { setConfirm(event.target.value); clearServerError(); }}
                onBlur={() => touch("confirm")}
                error={touched.confirm ? errors.confirm : ""}
                helper={t("signup.confirmHint")}
                autoComplete="new-password"
                showLabel={t("auth.showPassword")}
                hideLabel={t("auth.hidePassword")}
              />

              <label
                htmlFor="signup-terms"
                className="flex cursor-pointer items-start gap-3 rounded-xl px-3 py-3"
                style={{ backgroundColor: "var(--bt-subtle)", border: "1px solid var(--bt-hairline)" }}
              >
                <input
                  id="signup-terms"
                  type="checkbox"
                  checked={acceptedTerms}
                  onChange={event => { setAcceptedTerms(event.target.checked); touch("terms"); clearServerError(); }}
                  className="mt-0.5 h-[18px] w-[18px] shrink-0 cursor-pointer accent-[#14B885]"
                  aria-invalid={Boolean(touched.terms && errors.terms)}
                  aria-describedby="signup-terms-help"
                />
                <span id="signup-terms-help" className="text-xs leading-relaxed" style={{ color: "var(--bt-text-1)" }}>
                  {t("signup.termsPre")} {" "}
                  <Link href="/legal?doc=terms" target="_blank" rel="noopener" className="bt-accent-link font-semibold hover:underline">
                    {t("signup.termsLink")}
                  </Link>{" "}
                  {t("signup.termsMid")} {" "}
                  <Link href="/legal?doc=privacy" target="_blank" rel="noopener" className="bt-accent-link font-semibold hover:underline">
                    {t("signup.privacyLink")}
                  </Link>.
                </span>
              </label>
              {touched.terms && errors.terms && <p className="bt-form-error text-xs" role="alert">{errors.terms}</p>}

              <button className="btn-primary mt-2 w-full min-h-11">{t("signup.continue")}</button>
            </div>
          )}

          {step === 1 && (
            <div className="bt-rise space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
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
                    required
                    autoFocus
                    aria-invalid={Boolean(touched.firstName && errors.firstName)}
                    aria-describedby="signup-firstName-message"
                  />
                  <FieldMessage id="signup-firstName-message" error={touched.firstName ? errors.firstName : ""} />
                </div>
                <div>
                  <div className="mb-1 flex items-center justify-between">
                    <label className="label mb-0" htmlFor="signup-lastName">{t("profile.lastName")}</label>
                    <span className="text-xs" style={{ color: "var(--bt-text-2)" }}>{t("signup.optional")}</span>
                  </div>
                  <input
                    id="signup-lastName"
                    className="input"
                    value={lastName}
                    onChange={event => { setLastName(event.target.value); clearServerError(); }}
                    autoComplete="family-name"
                    maxLength={80}
                    aria-describedby="signup-lastName-message"
                  />
                  <FieldMessage id="signup-lastName-message" helper={t("signup.lastNameHint")} />
                </div>
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
                  required
                  aria-invalid={Boolean(touched.pseudo && errors.pseudo)}
                  aria-describedby="signup-pseudo-message"
                />
                <FieldMessage id="signup-pseudo-message" error={touched.pseudo ? errors.pseudo : ""} helper={t("signup.pseudoHint")} />
              </div>

              {error && <div className="bt-form-alert" role="alert" aria-live="polite">{error}</div>}

              <div className="flex gap-3 pt-2">
                <button type="button" className="btn-ghost flex-1" onClick={showAccountStep} disabled={busy}>
                  {t("comm.back")}
                </button>
                <button className="btn-primary flex-[1.35]" disabled={busy} aria-busy={busy}>
                  {busy ? (
                    <><span className="bt-button-spinner" aria-hidden="true" />{t("signup.creating")}</>
                  ) : t("signup.create")}
                </button>
              </div>
              <p className="text-center text-xs leading-relaxed" style={{ color: "var(--bt-text-3)" }}>
                {t("signup.noMarketing")}
              </p>
            </div>
          )}
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
