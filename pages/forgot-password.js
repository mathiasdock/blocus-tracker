import { useState } from "react";
import Link from "next/link";
import Glyph from "../components/Glyph";
import { supabase } from "../lib/supabaseClient";
import { classifyAuthError } from "../lib/authLogin.mjs";
import { getSiteUrl } from "../lib/siteUrl";
import { useI18n } from "../contexts/I18nContext";
import AuthBackground from "../components/AuthBackground";

export default function ForgotPassword() {
  const { t } = useI18n();
  const [email, setEmail] = useState("");
  const [busy, setBusy]   = useState(false);
  const [sent, setSent]   = useState(false);
  const [err, setErr]     = useState("");

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

  return (
    <AuthBackground>
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="font-display text-4xl text-[var(--bt-text-1)]">
            blocus<span className="text-accent">·</span>tracker
          </h1>
          <p className="text-[var(--bt-text-1)] mt-2 text-sm font-medium">{t("auth.forgotTitle")}</p>
        </div>

        {sent ? (
          <div className="card p-6 text-center space-y-4">
            <div className="flex justify-center" style={{ color: "var(--bt-accent-dark)" }}>
              <Glyph size={44}><rect x="2.8" y="4.8" width="18.4" height="14.4" rx="2.6"/><path d="m3.8 7.6 8.2 5.8 8.2-5.8"/></Glyph>
            </div>
            <p className="text-sm text-[var(--bt-text-2)]">{t("auth.forgotSent")}</p>
            <Link href="/login" className="text-sm text-accent-dark font-medium">
              <span className="inline-flex items-center gap-1"><Glyph size={13}><path d="M15 5.5 8.5 12l6.5 6.5"/></Glyph>{t("auth.forgotBack")}</span>
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="card p-6 space-y-4">
            <p className="text-sm text-[var(--bt-text-3)]">{t("auth.forgotSubtitle")}</p>
            <div>
              <label className="label">{t("auth.forgotEmail")}</label>
              <input
                className="input"
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                autoComplete="email"
                required
              />
            </div>
            {err && <p className="text-sm text-red-600">{err}</p>}
            <button className="btn-primary w-full" disabled={busy || !email.trim()}>
              {busy ? t("auth.forgotSending") : t("auth.forgotBtn")}
            </button>
            <div className="text-center">
              <Link href="/login" className="text-xs text-[var(--bt-text-4)] hover:text-accent-dark transition-colors">
                <span className="inline-flex items-center gap-1"><Glyph size={13}><path d="M15 5.5 8.5 12l6.5 6.5"/></Glyph>{t("auth.forgotBack")}</span>
              </Link>
            </div>
          </form>
        )}
      </div>
    </AuthBackground>
  );
}
