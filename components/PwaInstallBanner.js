import { useState, useEffect } from "react";
import { useAuth } from "../contexts/AuthContext";
import { useI18n } from "../contexts/I18nContext";

function ShareIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      style={{ display: "inline-block", verticalAlign: "text-bottom", margin: "0 2px" }}>
      <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/>
      <polyline points="16 6 12 2 8 6"/>
      <line x1="12" y1="2" x2="12" y2="15"/>
    </svg>
  );
}

export default function PwaInstallBanner() {
  const { user } = useAuth();
  const { t } = useI18n();
  const [show, setShow] = useState(false);
  const [showSteps, setShowSteps] = useState(false);

  useEffect(() => {
    if (!user?.id) return;
    const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent);
    const isStandalone = window.navigator.standalone === true;
    // Permanent dismiss saved per user (survives sessions/reloads)
    const donePermanently = localStorage.getItem(`bt_pwa_done_${user.id}`);
    // Session dismiss — clears when browser/tab is closed
    const closedThisSession = sessionStorage.getItem("bt_pwa_closed");

    if (isIOS && !isStandalone && !donePermanently && !closedThisSession) {
      const timer = setTimeout(() => setShow(true), 900);
      return () => clearTimeout(timer);
    }
  }, [user?.id]);

  if (!show) return null;

  // X button: close only for this session — will re-appear on next login
  function closeSession() {
    sessionStorage.setItem("bt_pwa_closed", "1");
    setShow(false);
  }

  // "C'est déjà fait": never show again for this user on this device
  function closePermanently() {
    if (user?.id) localStorage.setItem(`bt_pwa_done_${user.id}`, "1");
    setShow(false);
  }

  const steps = [
    <span key="s1">{t("pwa.step1")}<ShareIcon /></span>,
    <span key="s2">{t("pwa.step2")}</span>,
    <span key="s3">{t("pwa.step3")}</span>,
  ];

  return (
    <div
      className="fixed inset-0 flex items-end sm:items-center justify-center"
      style={{
        zIndex: 300,
        backgroundColor: "rgba(0,0,0,0.55)",
        padding: "0 16px 24px",
        paddingBottom: "max(24px, env(safe-area-inset-bottom))",
      }}
      onClick={closeSession}
    >
      <div
        className="w-full max-w-sm rounded-3xl shadow-2xl"
        style={{
          backgroundColor: "var(--bt-surface)",
          border: "1px solid var(--bt-border)",
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 px-6 pt-6 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl flex items-center justify-center shrink-0"
              style={{ backgroundColor: "#EAFBF4", color: "#0E8F68" }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <rect x="5" y="2" width="14" height="20" rx="2" ry="2"/>
                <circle cx="12" cy="17" r="1" fill="currentColor" stroke="none"/>
              </svg>
            </div>
            <div>
              <p className="font-semibold text-[15px] leading-tight" style={{ color: "var(--bt-text-1)" }}>
                {t("pwa.title")}
              </p>
              <p className="text-xs mt-0.5" style={{ color: "var(--bt-text-3)" }}>
                {t("pwa.subtitle")}
              </p>
            </div>
          </div>
          {/* X = fermer pour cette session uniquement */}
          <button
            onClick={closeSession}
            aria-label="Fermer"
            className="shrink-0 w-7 h-7 flex items-center justify-center rounded-full transition-colors"
            style={{ backgroundColor: "var(--bt-subtle)", color: "var(--bt-text-3)" }}
            onMouseEnter={e => e.currentTarget.style.backgroundColor = "var(--bt-border)"}
            onMouseLeave={e => e.currentTarget.style.backgroundColor = "var(--bt-subtle)"}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth="2.5" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18"/>
              <line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        {/* Divider */}
        <div style={{ height: "1px", backgroundColor: "var(--bt-border)", margin: "0 24px" }} />

        {/* Body text */}
        <div className="px-6 pt-4">
          <p className="text-sm leading-relaxed" style={{ color: "var(--bt-text-2)" }}>
            {t("pwa.mainText")}
          </p>
        </div>

        {/* Steps — masqués par défaut, visibles après "Voir comment faire" */}
        {showSteps && (
          <ol className="px-6 pt-4 space-y-3">
            {steps.map((stepContent, i) => (
              <li key={i} className="flex items-start gap-3">
                <span
                  className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5"
                  style={{ backgroundColor: "#EAFBF4", color: "#0E8F68" }}>
                  {i + 1}
                </span>
                <p className="text-sm leading-relaxed pt-0.5" style={{ color: "var(--bt-text-2)" }}>
                  {stepContent}
                </p>
              </li>
            ))}
          </ol>
        )}

        {/* Actions */}
        <div className="px-6 pt-4 pb-6 space-y-2">
          {/* Bouton principal — fermeture permanente */}
          <button onClick={closePermanently} className="btn-primary w-full">
            {t("pwa.alreadyDone")}
          </button>
          {/* Bouton secondaire — toggle des étapes */}
          <button
            onClick={() => setShowSteps(s => !s)}
            className="w-full py-2 text-sm font-medium transition-colors rounded-xl"
            style={{ color: showSteps ? "var(--bt-text-3)" : "#0E8F68" }}>
            {showSteps ? t("pwa.hideHow") : t("pwa.showHow")}
          </button>
        </div>
      </div>
    </div>
  );
}
