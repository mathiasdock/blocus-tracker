import { useState } from "react";
import Link from "next/link";
import { supabase } from "../lib/supabaseClient";
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

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || window.location.origin;

    const { error } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
      redirectTo: `${siteUrl}/reset-password`,
    });

    setBusy(false);

    if (error) {
      setErr(error.message);
    } else {
      setSent(true);
    }
  }

  return (
    <AuthBackground>
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="font-display text-4xl text-stone-900">
            blocus<span className="text-accent">·</span>tracker
          </h1>
          <p className="text-stone-800 mt-2 text-sm font-medium">{t("auth.forgotTitle")}</p>
        </div>

        {sent ? (
          <div className="card p-6 text-center space-y-4">
            <div className="text-4xl">📬</div>
            <p className="text-sm text-stone-700">{t("auth.forgotSent")}</p>
            <Link href="/login" className="text-sm text-accent-dark font-medium">
              {t("auth.forgotBack")}
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="card p-6 space-y-4">
            <p className="text-sm text-stone-500">{t("auth.forgotSubtitle")}</p>
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
              <Link href="/login" className="text-xs text-stone-400 hover:text-accent-dark transition-colors">
                {t("auth.forgotBack")}
              </Link>
            </div>
          </form>
        )}
      </div>
    </AuthBackground>
  );
}
