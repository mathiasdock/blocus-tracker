import { useState, useEffect } from "react";
import { useRouter } from "next/router";
import Link from "next/link";
import { useAuth } from "../contexts/AuthContext";
import { useI18n } from "../contexts/I18nContext";
import AuthBackground from "../components/AuthBackground";

export default function Login() {
  const { signIn, user, loading } = useAuth();
  const { t } = useI18n();
  const router = useRouter();
  const [pseudo, setPseudo] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading && user) router.replace("/dashboard");
  }, [user, loading, router]);

  async function handleSubmit(e) {
    e.preventDefault();
    setErr("");
    setBusy(true);
    const { error } = await signIn(pseudo, password);
    setBusy(false);
    if (error) {
      if (error === "LOGIN_INVALID_CREDENTIALS") setErr(t("login.invalidCredentials"));
      else if (error === "LOGIN_RATE_LIMITED")   setErr(t("login.rateLimited"));
      else setErr(error);
    } else {
      router.replace("/dashboard");
    }
  }

  return (
    <AuthBackground>
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="font-display text-4xl text-stone-900">
            blocus<span className="text-accent">·</span>tracker
          </h1>
          <p className="text-stone-800 mt-2 text-sm font-medium">
            {t("login.tagline")}
          </p>
        </div>
        <form onSubmit={handleSubmit} className="card p-6 space-y-4">
          <div>
            <label className="label">{t("login.pseudoOrEmail")}</label>
            <input
              className="input"
              value={pseudo}
              onChange={(e) => setPseudo(e.target.value)}
              autoComplete="username"
              required
            />
          </div>
          <div>
            <label className="label">{t("login.password")}</label>
            <input
              className="input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </div>
          {err && <p className="text-sm text-red-600">{err}</p>}
          <button className="btn-primary w-full" disabled={busy}>
            {busy ? t("login.connecting") : t("login.signin")}
          </button>
          <div className="text-center">
            <Link href="/forgot-password" className="text-xs text-stone-400 hover:text-accent-dark transition-colors">
              {t("login.forgotPwd")}
            </Link>
          </div>
        </form>
        <p className="text-center text-sm text-stone-800 font-medium mt-4">
          {t("login.noaccount")}{" "}
          <Link href="/signup" className="text-accent-dark font-semibold">
            {t("login.create")}
          </Link>
        </p>
      </div>
    </AuthBackground>
  );
}
