import { useState, useEffect } from "react";
import { useRouter } from "next/router";
import Link from "next/link";
import { useAuth } from "../contexts/AuthContext";
import { useI18n } from "../contexts/I18nContext";
import UniPicker from "../components/UniPicker";
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

function Req() {
  return <span className="text-red-500 ml-0.5">*</span>;
}

export default function Signup() {
  const { signUp, user, loading } = useAuth();
  const { t } = useI18n();
  const router = useRouter();

  const [firstName, setFirstName]     = useState("");
  const [lastName, setLastName]       = useState("");
  const [pseudo, setPseudo]           = useState("");
  const [email, setEmail]             = useState("");
  const [university, setUniversity]   = useState("");
  const [customUni, setCustomUni]     = useState("");
  const [useCustom, setUseCustom]     = useState(false);
  const [password, setPassword]       = useState("");
  const [confirm, setConfirm]         = useState("");
  const [showPwd, setShowPwd]         = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [err, setErr]                 = useState("");
  const [busy, setBusy]               = useState(false);

  useEffect(() => {
    if (!loading && user) router.replace("/dashboard");
  }, [user, loading, router]);

  const finalUni   = useCustom ? customUni.trim() : university;
  const pwdMatch   = confirm === "" || password === confirm;
  const emailValid = email === "" || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

  const canSubmit =
    firstName.trim() &&
    lastName.trim() &&
    pseudo.trim().length >= 3 &&
    email.trim() &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) &&
    finalUni &&
    password.length >= 6 &&
    confirm.length >= 6 &&
    password === confirm;

  async function handleSubmit(e) {
    e.preventDefault();
    setErr("");

    if (!firstName.trim())  { setErr(t("signup.errFirstName")); return; }
    if (!lastName.trim())   { setErr(t("signup.errLastName")); return; }
    if (pseudo.trim().length < 3) { setErr(t("signup.errPseudo")); return; }
    if (!email.trim())      { setErr(t("signup.errEmail")); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { setErr(t("signup.errEmailInvalid")); return; }
    if (!finalUni)          { setErr(t("signup.errUniversity")); return; }
    if (password.length < 6){ setErr(t("signup.errPassword")); return; }
    if (password !== confirm){ setErr(t("signup.errPwdMatch")); return; }

    setBusy(true);
    const { error } = await signUp(pseudo, password, email, firstName, lastName, finalUni);
    setBusy(false);
    if (error) {
      if (error.includes("already registered") || error.includes("already been registered"))
        setErr(t("signup.errEmailTaken"));
      else setErr(error);
    } else {
      // Flag pour afficher la notification PWA à la première visite post-inscription
      try { localStorage.setItem("bt_just_registered", "1"); } catch (_) {}
      router.replace("/onboarding");
    }
  }

  return (
    <AuthBackground>
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="font-display text-4xl text-stone-900">
            blocus<span className="text-accent">·</span>tracker
          </h1>
          <p className="text-stone-800 mt-2 text-sm font-medium">{t("signup.subtitle")}</p>
        </div>

        <form onSubmit={handleSubmit} className="card p-6 space-y-4">
          <p className="text-xs text-stone-400"><span className="text-red-500">*</span> {t("signup.required")}</p>

          {/* Prénom + Nom */}
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="label">{t("profile.firstName")}<Req /></label>
              <input className="input" value={firstName}
                onChange={e => setFirstName(e.target.value)}
                autoComplete="given-name" required />
            </div>
            <div className="flex-1">
              <label className="label">{t("profile.lastName")}<Req /></label>
              <input className="input" value={lastName}
                onChange={e => setLastName(e.target.value)}
                autoComplete="family-name" required />
            </div>
          </div>

          {/* Pseudo */}
          <div>
            <label className="label">{t("signup.pseudo")}<Req /></label>
            <input className="input" value={pseudo}
              onChange={e => setPseudo(e.target.value)}
              autoComplete="username" minLength={3} required />
            <p className="text-xs text-stone-400 mt-1">{t("signup.pseudoHint")}</p>
          </div>

          {/* Email */}
          <div>
            <label className="label">{t("signup.email")}<Req /></label>
            <input
              className={`input ${!emailValid ? "border-red-400 focus:ring-red-300" : ""}`}
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              autoComplete="email"
              required />
            <p className="text-xs text-stone-400 mt-1">{t("signup.emailHint")}</p>
          </div>

          {/* Université */}
          <div>
            <label className="label">{t("signup.university")}<Req /></label>
            {!useCustom ? (
              <>
                <UniPicker
                  value={university}
                  onChange={v => setUniversity(v)}
                  placeholder={t("signup.uniSearch")}
                />
                <button type="button"
                  onClick={() => { setUseCustom(true); setUniversity(""); }}
                  className="mt-1.5 text-xs text-stone-400 hover:text-accent-dark transition-colors">
                  {t("signup.uniNotFound")}
                </button>
              </>
            ) : (
              <>
                <input className="input" placeholder={t("signup.uniCustom")}
                  value={customUni} onChange={e => setCustomUni(e.target.value)} required />
                <button type="button"
                  onClick={() => { setUseCustom(false); setCustomUni(""); }}
                  className="mt-1.5 text-xs text-stone-400 hover:text-accent-dark transition-colors">
                  {t("signup.backToList")}
                </button>
              </>
            )}
          </div>

          {/* Mot de passe */}
          <div>
            <label className="label">{t("login.password")}<Req /></label>
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
            <p className="text-xs text-stone-400 mt-1">{t("signup.passwordHint")}</p>
          </div>

          {/* Confirmation mot de passe */}
          <div>
            <label className="label">{t("signup.confirmPwd")}<Req /></label>
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
              <p className="text-xs text-red-500 mt-1">{t("signup.pwdMismatch")}</p>
            )}
          </div>

          {err && <p className="text-sm text-red-600">{err}</p>}

          <button className="btn-primary w-full" disabled={busy || !canSubmit}>
            {busy ? t("signup.creating") : t("signup.create")}
          </button>
        </form>

        <p className="text-center text-sm text-stone-800 font-medium mt-4">
          {t("signup.alreadyAccount")}{" "}
          <Link href="/login" className="text-accent-dark font-semibold">
            {t("login.signin")}
          </Link>
        </p>
      </div>
    </AuthBackground>
  );
}
