import { useState, useEffect } from "react";
import Link from "next/link";
import { useAuth } from "../contexts/AuthContext";
import { useI18n } from "../contexts/I18nContext";

// Rappel discret pour les comptes "legacy" : ~60 utilisateurs ont un faux
// email <pseudo>@blocus.local et ne peuvent pas recuperer leur mot de passe
// tant qu'ils n'ajoutent pas une vraie adresse. On les previent ici (le
// formulaire est dans /profile). Snooze 3 jours pour ne pas harceler.
const SNOOZE_KEY = "bt_email_banner_snooze";
const SNOOZE_MS = 3 * 24 * 60 * 60 * 1000;

export default function LegacyEmailBanner() {
  const { user, profile } = useAuth();
  const { t } = useI18n();
  const [hidden, setHidden] = useState(true);

  const needsEmail =
    !!user && !!profile && (!profile.email || /@blocus\.local$/i.test(profile.email));

  useEffect(() => {
    if (!needsEmail) { setHidden(true); return; }
    try {
      const until = Number(localStorage.getItem(SNOOZE_KEY) || 0);
      setHidden(Date.now() < until);
    } catch { setHidden(false); }
  }, [needsEmail]);

  if (!needsEmail || hidden) return null;

  function snooze() {
    try { localStorage.setItem(SNOOZE_KEY, String(Date.now() + SNOOZE_MS)); } catch {}
    setHidden(true);
  }

  return (
    <div className="mb-5 flex flex-col gap-3 rounded-2xl px-4 py-3 sm:flex-row sm:items-center"
      style={{ backgroundColor: "#FEF3C7", border: "1px solid #FADF9A" }}>
      <span className="shrink-0 inline-flex h-9 w-9 items-center justify-center rounded-xl"
        style={{ backgroundColor: "#FDE9AE", color: "#B45309" }} aria-hidden="true">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 5h16a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z" />
          <path d="m3.5 6.5 8.5 6 8.5-6" />
        </svg>
      </span>
      <span className="flex-1 text-sm leading-snug" style={{ color: "#92400E" }}>
        <strong style={{ color: "#78350F" }}>{t("banner.emailTitle")}</strong> {t("banner.emailText")}
      </span>
      <div className="flex shrink-0 gap-2">
        <Link href="/profile"
          className="inline-flex items-center justify-center rounded-xl px-4 py-2 text-sm font-semibold text-white"
          style={{ backgroundColor: "#B45309" }}>
          {t("banner.emailCta")}
        </Link>
        <button onClick={snooze}
          className="inline-flex items-center justify-center rounded-xl px-3 py-2 text-sm font-semibold"
          style={{ color: "#92400E" }}>
          {t("banner.later")}
        </button>
      </div>
    </div>
  );
}
