import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import AuthShell, { AuthHeading } from "../components/auth/AuthShell";
import { Field, FieldGroup, FieldSplit, FormNote, PasswordField, messageId } from "../components/auth/Field";
import SpaceSheet from "../components/auth/SpaceSheet";
import MascotGuide from "../components/auth/MascotGuide";
import { PseudoStatus, isPseudoShapeValid, usePseudoAvailability } from "../components/auth/UsernameStatus";
import { useAuth } from "../contexts/AuthContext";
import { useI18n } from "../contexts/I18nContext";
import { isManagedOnboardingUser } from "../lib/onboarding.mjs";
import { guideText, setupGuide } from "../lib/setupGuide.mjs";
import { PRIVACY_VERSION, TERMS_VERSION } from "../lib/legalVersions";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// Visual order of the form: the first invalid answer takes the focus.
const FIELDS = ["firstName", "pseudo", "email", "password", "terms"];

export default function Signup() {
  const { signUp, user, loading, profileStatus } = useAuth();
  const { t } = useI18n();
  const router = useRouter();
  const signupInProgress = useRef(false);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [pseudo, setPseudo] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [touched, setTouched] = useState({});
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [awaitingEmail, setAwaitingEmail] = useState("");
  const availability = usePseudoAvailability(pseudo);

  useEffect(() => {
    if (loading || !user || signupInProgress.current) return;
    if (profileStatus === "missing") {
      router.replace({ pathname: "/onboarding", query: { repair: "1" } });
    } else if (profileStatus === "ready") {
      router.replace(isManagedOnboardingUser(user) ? "/onboarding" : "/dashboard");
    }
  }, [user, loading, profileStatus, router]);

  const errors = {
    firstName: !firstName.trim() ? t("signup.errFirstName") : "",
    pseudo: !isPseudoShapeValid(pseudo)
      ? t("signup.errPseudo")
      : (availability === "unavailable" ? t("signup.errPseudoTaken") : ""),
    email: !email.trim()
      ? t("signup.errEmail")
      : (!EMAIL_PATTERN.test(email.trim()) ? t("signup.errEmailInvalid") : ""),
    password: password.length < 6 ? t("signup.errPassword") : "",
    terms: !acceptedTerms ? t("signup.errTerms") : "",
  };
  const shown = field => (touched[field] ? errors[field] : "");

  function touch(field) {
    setTouched(current => ({ ...current, [field]: true }));
  }

  function clearServerError() {
    if (error) setError("");
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setTouched(Object.fromEntries(FIELDS.map(field => [field, true])));
    setError("");
    const firstInvalid = FIELDS.find(field => errors[field]);
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

  const sheet = <SpaceSheet firstName={firstName} lastName={lastName} pseudo={pseudo} stage={awaitingEmail ? 1 : 0} />;
  // The guide greets a name once it is given (field left), not at each keystroke.
  const guide = setupGuide({ page: "signup", awaitingEmail, firstName, named: Boolean(touched.firstName) });
  const guideNode = <MascotGuide message={guideText(guide, t)} mood={guide.mood} reaction={guide.reaction} />;

  if (awaitingEmail) {
    return (
      <AuthShell stage={1} guide={guideNode} aside={sheet} contentKey="check-email">
        <AuthHeading
          title={t("signup.checkEmailTitle")}
          lead={t("signup.checkEmailBody").replace("{email}", awaitingEmail)}
        />
        <Link href="/login" className="bt-auth-primary">{t("signup.checkEmailLogin")}</Link>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      stage={0}
      alternate={{ text: t("signup.alreadyAccount"), cta: t("login.signin"), href: "/login" }}
      guide={guideNode}
      aside={sheet}
      contentKey="account"
    >
      <AuthHeading title={t("setup.accountTitle")} />

      <form onSubmit={handleSubmit} noValidate>
        <FieldGroup>
          <FieldSplit>
            <Field id="signup-firstName" label={t("profile.firstName")} error={shown("firstName")}>
              <input
                id="signup-firstName"
                className="bt-field-input"
                value={firstName}
                onChange={event => { setFirstName(event.target.value); clearServerError(); }}
                onBlur={() => touch("firstName")}
                autoComplete="given-name"
                autoCapitalize="words"
                maxLength={50}
                required
                autoFocus
                aria-invalid={Boolean(shown("firstName"))}
                aria-describedby={shown("firstName") ? messageId("signup-firstName") : undefined}
              />
            </Field>
            <Field id="signup-lastName" label={t("profile.lastName")}>
              <input
                id="signup-lastName"
                className="bt-field-input"
                value={lastName}
                onChange={event => { setLastName(event.target.value); clearServerError(); }}
                placeholder={t("setup.optional")}
                autoComplete="family-name"
                autoCapitalize="words"
                maxLength={80}
                title={t("signup.lastNameHint")}
              />
            </Field>
          </FieldSplit>
          <Field
            id="signup-pseudo"
            label={t("signup.pseudo")}
            error={shown("pseudo")}
            trailing={<PseudoStatus state={availability} />}
          >
            <input
              id="signup-pseudo"
              className="bt-field-input"
              value={pseudo}
              onChange={event => { setPseudo(event.target.value); clearServerError(); }}
              onBlur={() => touch("pseudo")}
              placeholder={t("setup.pseudoPlaceholder")}
              autoComplete="username"
              autoCapitalize="none"
              spellCheck="false"
              minLength={3}
              maxLength={30}
              required
              aria-invalid={Boolean(shown("pseudo"))}
              aria-describedby={shown("pseudo") ? messageId("signup-pseudo") : undefined}
            />
          </Field>
        </FieldGroup>

        <FieldGroup>
          <Field id="signup-email" label={t("signup.email")} error={shown("email")}>
            <input
              id="signup-email"
              className="bt-field-input"
              type="email"
              value={email}
              onChange={event => { setEmail(event.target.value); clearServerError(); }}
              onBlur={() => touch("email")}
              autoComplete="email"
              autoCapitalize="none"
              spellCheck="false"
              inputMode="email"
              maxLength={254}
              required
              aria-invalid={Boolean(shown("email"))}
              aria-describedby={shown("email") ? messageId("signup-email") : undefined}
            />
          </Field>
          <PasswordField
            id="signup-password"
            label={t("login.password")}
            value={password}
            onChange={event => { setPassword(event.target.value); clearServerError(); }}
            onBlur={() => touch("password")}
            error={shown("password")}
            placeholder={t("setup.passwordPlaceholder")}
            autoComplete="new-password"
            showLabel={t("auth.showPassword")}
            hideLabel={t("auth.hidePassword")}
          />
        </FieldGroup>

        <label className="bt-auth-check" htmlFor="signup-terms" data-invalid={shown("terms") ? "true" : undefined}>
          <input
            id="signup-terms"
            type="checkbox"
            checked={acceptedTerms}
            onChange={event => { setAcceptedTerms(event.target.checked); touch("terms"); clearServerError(); }}
            aria-invalid={Boolean(shown("terms"))}
            aria-describedby={shown("terms") ? "signup-terms-message" : undefined}
          />
          <span>
            {t("signup.termsPre")}{" "}
            <Link href="/legal?doc=terms" target="_blank" rel="noopener">{t("signup.termsLink")}</Link>{" "}
            {t("signup.termsMid")}{" "}
            <Link href="/legal?doc=privacy" target="_blank" rel="noopener">{t("signup.privacyLink")}</Link>.
          </span>
        </label>
        {shown("terms") && <FormNote id="signup-terms-message" tone="error">{shown("terms")}</FormNote>}

        <FormNote tone="error">{error}</FormNote>

        <button className="bt-auth-primary" disabled={busy} aria-busy={busy}>
          {busy && <span className="bt-button-spinner" aria-hidden="true" />}
          {busy ? t("signup.creating") : t("signup.create")}
        </button>
      </form>

      <p className="bt-auth-footnote">{t("signup.noMarketing")}</p>
    </AuthShell>
  );
}
