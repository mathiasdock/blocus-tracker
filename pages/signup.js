import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import AuthBackground from "../components/AuthBackground";
import AuthBrand from "../components/AuthBrand";
import PasswordInput from "../components/PasswordInput";
import UniPicker from "../components/UniPicker";
import { useAuth } from "../contexts/AuthContext";
import { useI18n } from "../contexts/I18nContext";
import { STUDY_YEARS } from "../lib/studyYears";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ACCOUNT_FIELDS = ["firstName", "lastName", "pseudo", "email", "password", "confirm"];

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
  const signupInProgress = useRef(false);
  const [step, setStep] = useState(0);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [pseudo, setPseudo] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [university, setUniversity] = useState("");
  const [customUniversity, setCustomUniversity] = useState("");
  const [useCustomUniversity, setUseCustomUniversity] = useState(false);
  const [studyField, setStudyField] = useState("");
  const [studyYear, setStudyYear] = useState("");
  const [customStudyYear, setCustomStudyYear] = useState("");
  const [touched, setTouched] = useState({});
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading && user && !signupInProgress.current) router.replace("/dashboard");
  }, [user, loading, router]);

  const selectedUniversity = useCustomUniversity
    ? customUniversity.trim()
    : university.trim();
  const selectedStudyYear = studyYear === "Autre"
    ? (customStudyYear.trim() || "Autre")
    : studyYear;

  const errors = {
    firstName: !firstName.trim() ? t("signup.errFirstName") : "",
    lastName: !lastName.trim() ? t("signup.errLastName") : "",
    pseudo: pseudo.trim().length < 3 || /\s/.test(pseudo.trim())
      ? t("signup.errPseudo")
      : "",
    email: !email.trim()
      ? t("signup.errEmail")
      : (!EMAIL_PATTERN.test(email.trim()) ? t("signup.errEmailInvalid") : ""),
    password: password.length < 6 ? t("signup.errPassword") : "",
    confirm: !confirm
      ? t("signup.errConfirmPassword")
      : (password !== confirm ? t("signup.errPwdMatch") : ""),
    university: !selectedUniversity ? t("signup.errUniversity") : "",
  };

  function touch(field) {
    setTouched(current => ({ ...current, [field]: true }));
  }

  function clearServerError() {
    if (error) setError("");
  }

  function showAccountStep() {
    setStep(0);
    setTimeout(() => document.getElementById("signup-firstName")?.focus(), 0);
  }

  function showStudyStep() {
    const nextTouched = ACCOUNT_FIELDS.reduce((result, field) => ({ ...result, [field]: true }), {});
    setTouched(current => ({ ...current, ...nextTouched }));
    setError("");

    const firstInvalid = ACCOUNT_FIELDS.find(field => errors[field]);
    if (firstInvalid) {
      document.getElementById(`signup-${firstInvalid}`)?.focus();
      return false;
    }

    setStep(1);
    setTimeout(() => document.getElementById("signup-university")?.focus(), 0);
    return true;
  }

  async function createAccount() {
    touch("university");
    setError("");
    if (errors.university) {
      document.getElementById("signup-university")?.focus();
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

    signupInProgress.current = true;
    setBusy(true);
    try {
      const { error: signUpError, userId } = await signUp(
        pseudo.trim(),
        password,
        email.trim(),
        firstName.trim(),
        lastName.trim(),
        selectedUniversity,
        referralCode,
        studyField.trim(),
        selectedStudyYear
      );

      if (signUpError) {
        signupInProgress.current = false;
        if (signUpError.includes("already registered") || signUpError.includes("already been registered")) {
          setError(t("signup.errEmailTaken"));
        } else if (signUpError.includes("pseudo") || signUpError.includes("username")) {
          setError(t("signup.errPseudoTaken"));
        } else {
          setError(t("signup.unavailable"));
        }
        return;
      }

      try {
        localStorage.setItem("bt_just_registered", "1");
        if (userId) localStorage.setItem(`bt_onboarding_step_${userId}`, "2");
      } catch (_) {}
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
    if (step === 0) {
      showStudyStep();
      return;
    }
    await createAccount();
  }

  return (
    <AuthBackground className="min-h-dvh flex items-center justify-center px-4 py-7 sm:py-10">
      <div className="w-full max-w-md bt-stagger">
        <AuthBrand subtitle={t("signup.subtitle")} compact />

        <form onSubmit={handleSubmit} className="card p-6 sm:p-7" noValidate>
          <div className="mb-5">
            <div className="mb-4 flex items-center justify-between text-xs font-semibold" style={{ color: "var(--bt-text-2)" }}>
              <span>{t("signup.step")} {step + 1} / 2</span>
              <span>{step === 0 ? t("signup.stepAccount") : t("signup.stepStudies")}</span>
            </div>
            <div
              className="mb-6 h-1.5 overflow-hidden rounded-full"
              style={{ backgroundColor: "var(--bt-border)" }}
              role="progressbar"
              aria-valuemin="1"
              aria-valuemax="2"
              aria-valuenow={step + 1}
            >
              <div
                className="h-full rounded-full bg-accent transition-[width] duration-300 ease-out motion-reduce:transition-none"
                style={{ width: step === 0 ? "50%" : "100%" }}
              />
            </div>
            <h1 className="text-2xl">{step === 0 ? t("signup.accountTitle") : t("signup.studiesTitle")}</h1>
            <p className="mt-1.5 text-sm leading-relaxed" style={{ color: "var(--bt-text-2)" }}>
              {step === 0 ? t("signup.accountSubtitle") : t("signup.studiesSubtitle")}
            </p>
          </div>

          {step === 0 && (
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
                    aria-describedby={touched.firstName && errors.firstName ? "signup-firstName-message" : undefined}
                  />
                  <FieldMessage id="signup-firstName-message" error={touched.firstName ? errors.firstName : ""} />
                </div>

                <div>
                  <label className="label" htmlFor="signup-lastName">{t("profile.lastName")}</label>
                  <input
                    id="signup-lastName"
                    className={`input ${touched.lastName && errors.lastName ? "input-error" : ""}`}
                    value={lastName}
                    onChange={event => { setLastName(event.target.value); clearServerError(); }}
                    onBlur={() => touch("lastName")}
                    autoComplete="family-name"
                    maxLength={80}
                    required
                    aria-invalid={Boolean(touched.lastName && errors.lastName)}
                    aria-describedby={touched.lastName && errors.lastName ? "signup-lastName-message" : undefined}
                  />
                  <FieldMessage id="signup-lastName-message" error={touched.lastName ? errors.lastName : ""} />
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

              <button className="btn-primary mt-2 w-full min-h-11">
                {t("signup.continue")}
              </button>
            </div>
          )}

          {step === 1 && (
            <div className="bt-rise space-y-4">
              <div>
                <label className="label" htmlFor="signup-university">{t("signup.university")}</label>
                {!useCustomUniversity ? (
                  <>
                    <UniPicker
                      id="signup-university"
                      value={university}
                      onChange={value => { setUniversity(value); touch("university"); clearServerError(); }}
                      placeholder={t("signup.uniSearch")}
                      error={Boolean(touched.university && errors.university)}
                      ariaDescribedBy={touched.university && errors.university ? "signup-university-error" : "signup-university-help"}
                    />
                    <button
                      type="button"
                      onClick={() => {
                        setUseCustomUniversity(true);
                        setUniversity("");
                        setTouched(current => ({ ...current, university: false }));
                      }}
                      className="mt-2 inline-flex min-h-11 items-center text-sm font-medium hover:underline"
                      style={{ color: "var(--bt-text-2)" }}
                    >
                      {t("signup.otherUniversity")}
                    </button>
                  </>
                ) : (
                  <>
                    <input
                      id="signup-university"
                      className={`input ${touched.university && errors.university ? "input-error" : ""}`}
                      placeholder={t("signup.uniCustom")}
                      value={customUniversity}
                      onChange={event => { setCustomUniversity(event.target.value); touch("university"); clearServerError(); }}
                      onBlur={() => touch("university")}
                      autoComplete="organization"
                      maxLength={120}
                      required
                      autoFocus
                      aria-invalid={Boolean(touched.university && errors.university)}
                      aria-describedby={touched.university && errors.university ? "signup-university-error" : "signup-university-help"}
                    />
                    <button
                      type="button"
                      onClick={() => {
                        setUseCustomUniversity(false);
                        setCustomUniversity("");
                        setTouched(current => ({ ...current, university: false }));
                      }}
                      className="bt-accent-link mt-2 inline-flex min-h-11 items-center text-sm font-medium hover:underline"
                    >
                      {t("signup.backToList")}
                    </button>
                  </>
                )}
                <FieldMessage
                  id={touched.university && errors.university ? "signup-university-error" : "signup-university-help"}
                  error={touched.university ? errors.university : ""}
                  helper={t("signup.universityHint")}
                />
              </div>

              <div>
                <div className="mb-1 flex items-center justify-between">
                  <label className="label mb-0" htmlFor="signup-studyField">{t("onboarding.field.label")}</label>
                  <span className="text-xs" style={{ color: "var(--bt-text-2)" }}>{t("signup.optional")}</span>
                </div>
                <input
                  id="signup-studyField"
                  className="input"
                  placeholder={t("onboarding.field.placeholder")}
                  value={studyField}
                  onChange={event => setStudyField(event.target.value)}
                  maxLength={100}
                  autoComplete="organization-title"
                />
              </div>

              <div>
                <div className="mb-1 flex items-center justify-between">
                  <label className="label mb-0" htmlFor="signup-studyYear">{t("onboarding.year.label")}</label>
                  <span className="text-xs" style={{ color: "var(--bt-text-2)" }}>{t("signup.optional")}</span>
                </div>
                <select
                  id="signup-studyYear"
                  className="input"
                  value={studyYear}
                  onChange={event => {
                    setStudyYear(event.target.value);
                    setCustomStudyYear("");
                  }}
                >
                  <option value="">{t("onboarding.year.choose")}</option>
                  {STUDY_YEARS.map(year => <option key={year.value} value={year.value}>{t(year.key)}</option>)}
                </select>
              </div>

              {studyYear === "Autre" && (
                <div>
                  <label className="label" htmlFor="signup-customStudyYear">{t("onboarding.year.customLabel")}</label>
                  <input
                    id="signup-customStudyYear"
                    className="input"
                    placeholder={t("onboarding.year.customPlaceholder")}
                    value={customStudyYear}
                    onChange={event => setCustomStudyYear(event.target.value)}
                    maxLength={80}
                    autoFocus
                  />
                </div>
              )}

              {error && <div className="bt-form-alert" role="alert" aria-live="polite">{error}</div>}

              <div className="flex gap-3 pt-2">
                <button type="button" className="btn-ghost flex-1" onClick={showAccountStep} disabled={busy}>
                  {t("comm.back")}
                </button>
                <button className="btn-primary flex-[1.35]" disabled={busy} aria-busy={busy}>
                  {busy ? (
                    <>
                      <span className="bt-button-spinner" aria-hidden="true" />
                      {t("signup.creating")}
                    </>
                  ) : t("signup.create")}
                </button>
              </div>

              <p className="text-center text-xs leading-relaxed" style={{ color: "var(--bt-text-2)" }}>
                {t("signup.legalPre")} {" "}
                <Link href="/legal" className="bt-accent-link font-medium hover:underline">
                  {t("signup.legalLink")}
                </Link>.
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
