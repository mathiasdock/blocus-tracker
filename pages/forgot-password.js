import { useState } from "react";
import Link from "next/link";
import AuthShell, { AuthHeading } from "../components/auth/AuthShell";
import { Field, FieldGroup, FormNote } from "../components/auth/Field";
import MascotGuide from "../components/auth/MascotGuide";
import { guideText, setupGuide } from "../lib/setupGuide.mjs";
import { supabase } from "../lib/supabaseClient";
import { classifyAuthError } from "../lib/authLogin.mjs";
import { getSiteUrl } from "../lib/siteUrl";
import { useI18n } from "../contexts/I18nContext";

export default function ForgotPassword() {
  const { t } = useI18n();
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState("");

  async function handleSubmit(e) {
    e.preventDefault();
    setErr("");
    setBusy(true);

    let error = null;
    try {
      ({ error } = await supabase.auth.resetPasswordForEmail(
        email.trim().toLowerCase(),
        { redirectTo: `${getSiteUrl()}/reset-password` }
      ));
    } catch {
      error = { code: "unexpected_failure", status: 503 };
    }

    setBusy(false);

    if (error) {
      setErr(
        classifyAuthError(error) === "rate_limited"
          ? t("auth.forgotRateLimited")
          : t("auth.forgotUnavailable")
      );
    } else {
      setSent(true);
    }
  }

  const alternate = { text: "", cta: t("auth.forgotBack"), href: "/login" };
  const guide = setupGuide({ page: "forgot", sent });
  const guideNode = <MascotGuide message={guideText(guide, t)} mood={guide.mood} reaction={guide.reaction} />;

  if (sent) {
    return (
      <AuthShell layout="single" alternate={alternate} guide={guideNode} contentKey="sent">
        <AuthHeading title={t("auth.forgotSentTitle")} lead={t("auth.forgotSent")} />
        <Link href="/login" className="bt-auth-primary">{t("auth.forgotBack")}</Link>
      </AuthShell>
    );
  }

  return (
    <AuthShell layout="single" alternate={alternate} guide={guideNode} contentKey="form">
      <AuthHeading title={t("auth.forgotTitle")} />
      <form onSubmit={handleSubmit} noValidate>
        <FieldGroup>
          <Field id="forgot-email" label={t("auth.forgotEmail")}>
            <input
              id="forgot-email"
              className="bt-field-input"
              type="email"
              value={email}
              onChange={event => { setEmail(event.target.value); if (err) setErr(""); }}
              autoComplete="email"
              autoCapitalize="none"
              spellCheck="false"
              inputMode="email"
              required
              autoFocus
            />
          </Field>
        </FieldGroup>
        <FormNote tone="error">{err}</FormNote>
        <button className="bt-auth-primary" disabled={busy || !email.trim()} aria-busy={busy}>
          {busy && <span className="bt-button-spinner" aria-hidden="true" />}
          {busy ? t("auth.forgotSending") : t("auth.forgotBtn")}
        </button>
      </form>
    </AuthShell>
  );
}
