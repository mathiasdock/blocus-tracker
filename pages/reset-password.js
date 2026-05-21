import { useState, useEffect } from "react";
import { useRouter } from "next/router";
import Link from "next/link";
import { supabase } from "../lib/supabaseClient";
import { useI18n } from "../contexts/I18nContext";
import AuthBackground from "../components/AuthBackground";

function EyeIcon({ open }) {
  return open ? (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
      <circle cx="12" cy="12" r="3"/>
    </svg>
  ) : (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>
      <line x1="1" y1="1" x2="23" y2="23"/>
    </svg>
  );
}

export default function ResetPassword() {
  const { t } = useI18n();
  const router = useRouter();

  const [ready, setReady]           = useState(false);
  const [invalid, setInvalid]       = useState(false);
  const [password, setPassword]     = useState("");
  const [confirm, setConfirm]       = useState("");
  const [showPwd, setShowPwd]       = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [busy, setBusy]             = useState(false);
  const [success, setSuccess]       = useState(false);
  const [err, setErr]               = useState("");

  // Supabase injecte le token dans le hash de l'URL.
  // onAuthStateChange détecte l'événement PASSWORD_RECOVERY
  // et établit automatiquement la session temporaire.
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        setReady(true);
      }
    });

    // Timeout : si après 5s aucun événement PASSWORD_RECOVERY,
    // le lien est invalide ou expiré.
    const t = setTimeout(() => {
      setReady(r => {
        if (!r) setInvalid(true);
        return r;
      });
    }, 5000);

    return () => {
      subscription.unsubscribe();
      clearTimeout(t);
    };
  }, []);

  const pwdMatch = confirm === "" || password === confirm;

  async function handleSubmit(e) {
    e.preventDefault();
    setErr("");

    if (password.length < 6) { setErr(t("signup.errPassword")); return; }
    if (password !== confirm) { setErr(t("auth.resetMismatch")); return; }

    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);

    if (error) {
      setErr(error.message);
    } else {
      setSuccess(true);
      setTimeout(() => router.replace("/dashboard"), 2000);
    }
  }

  // Lien invalide / expiré
  if (invalid) {
    return (
      <AuthBackground>
        <div className="w-full max-w-sm">
          <div className="text-center mb-8">
            <h1 className="font-display text-4xl text-stone-900">
              blocus<span className="text-accent">·</span>tracker
            </h1>
          </div>
          <div className="card p-6 text-center space-y-4">
            <div className="text-4xl">⚠️</div>
            <p className="text-sm text-red-600">{t("auth.resetInvalid")}</p>
            <Link href="/forgot-password" className="text-sm text-accent-dark font-medium block">
              {t("auth.forgotBtn")}
            </Link>
          </div>
        </div>
      </AuthBackground>
    );
  }

  // En attente de la session PASSWORD_RECOVERY
  if (!ready) {
    return (
      <AuthBackground className="min-h-screen flex items-center justify-center">
        <p className="text-stone-600 text-sm">{t("common.loading")}</p>
      </AuthBackground>
    );
  }

  return (
    <AuthBackground>
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="font-display text-4xl text-stone-900">
            blocus<span className="text-accent">·</span>tracker
          </h1>
          <p className="text-stone-800 mt-2 text-sm font-medium">{t("auth.resetSubtitle")}</p>
        </div>

        {success ? (
          <div className="card p-6 text-center space-y-3">
            <div className="text-4xl">✅</div>
            <p className="text-sm text-stone-700">{t("auth.resetSuccess")}</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="card p-6 space-y-4">
            <h2 className="text-lg font-semibold text-stone-900">{t("auth.resetTitle")}</h2>

            {/* Nouveau mot de passe */}
            <div>
              <label className="label">{t("auth.resetNewPwd")}</label>
              <div className="relative">
                <input className="input pr-10" type={showPwd ? "text" : "password"}
                  value={password} onChange={e => setPassword(e.target.value)}
                  autoComplete="new-password" minLength={6} required />
                <button type="button" tabIndex={-1}
                  onClick={() => setShowPwd(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600">
                  <EyeIcon open={showPwd} />
                </button>
              </div>
            </div>

            {/* Confirmation */}
            <div>
              <label className="label">{t("auth.resetConfirm")}</label>
              <div className="relative">
                <input
                  className={`input pr-10 ${!pwdMatch ? "border-red-400 focus:ring-red-300" : ""}`}
                  type={showConfirm ? "text" : "password"}
                  value={confirm} onChange={e => setConfirm(e.target.value)}
                  autoComplete="new-password" minLength={6} required />
                <button type="button" tabIndex={-1}
                  onClick={() => setShowConfirm(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600">
                  <EyeIcon open={showConfirm} />
                </button>
              </div>
              {!pwdMatch && (
                <p className="text-xs text-red-500 mt-1">{t("auth.resetMismatch")}</p>
              )}
            </div>

            {err && <p className="text-sm text-red-600">{err}</p>}

            <button className="btn-primary w-full"
              disabled={busy || password.length < 6 || password !== confirm}>
              {busy ? t("auth.resetUpdating") : t("auth.resetBtn")}
            </button>
          </form>
        )}
      </div>
    </AuthBackground>
  );
}
