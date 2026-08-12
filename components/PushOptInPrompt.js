// Invitation à activer les notifications, juste après l'inscription.
//
// Pourquoi ici et pas dans le profil : personne ne va fouiller ses réglages
// pour découvrir une fonctionnalité qu'il ignore. Le moment d'intention le plus
// fort est l'arrivée sur le tableau de bord, une fois le compte créé.
//
// Sur iPhone, demander la permission est IMPOSSIBLE tant que l'app n'est pas
// sur l'écran d'accueil : iOS ne l'autorise qu'en mode standalone. L'invitation
// bifurque donc — on explique l'installation d'abord, la permission plus tard.
//
// Ne s'affiche qu'une fois, et jamais si la personne a déjà répondu à l'invite
// système : un rappel qu'on ne peut pas honorer serait pire que rien.

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import { useI18n } from "../contexts/I18nContext";
import { isIOS, isStandalone, isPushSupported, getAppId, enablePush, loginUser } from "../lib/onesignal";

const SEEN_KEY = "bt_push_prompt_seen";
const DELAY_MS = 1200; // laisse le tableau de bord se poser avant d'interrompre

export default function PushOptInPrompt() {
  const { user } = useAuth();
  const { t } = useI18n();
  const [mode, setMode] = useState(null); // null | "ask" | "ios-install"
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  const dismiss = useCallback(() => {
    try { localStorage.setItem(SEEN_KEY, "1"); } catch (_) {}
    setMode(null);
  }, []);

  useEffect(() => {
    if (!user || typeof window === "undefined") return undefined;
    let seen = false, enabled = false;
    try {
      seen = localStorage.getItem(SEEN_KEY) === "1";
      enabled = localStorage.getItem("bt_push_enabled") === "1";
    } catch (_) {}
    if (seen || enabled || !getAppId()) return undefined;

    // Déjà accordée ou déjà refusée : dans les deux cas, l'invite système ne
    // reviendra pas. Insister n'apporterait rien.
    const decided = typeof Notification !== "undefined" && Notification.permission !== "default";
    if (decided) return undefined;

    const next = isIOS() && !isStandalone() ? "ios-install" : (isPushSupported() ? "ask" : null);
    if (!next) return undefined;

    const id = setTimeout(() => setMode(next), DELAY_MS);
    return () => clearTimeout(id);
  }, [user]);

  async function activate() {
    setBusy(true); setFailed(false);
    try {
      const res = await enablePush();
      if (res?.ok) {
        if (user) await loginUser(user.id);
        try { localStorage.setItem("bt_push_enabled", "1"); } catch (_) {}
        dismiss();
        return;
      }
      // On ne laisse pas la personne dans le flou, mais on ne l'enferme pas
      // non plus : le réglage reste accessible depuis le profil.
      setFailed(true);
    } catch (_) { setFailed(true); }
    finally { setBusy(false); }
  }

  if (!mode) return null;
  const ios = mode === "ios-install";

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="push-prompt-title"
      className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-4"
      style={{ backgroundColor: "rgba(0,0,0,0.5)", backdropFilter: "blur(3px)" }}
      onClick={dismiss}>
      <div className="card bt-pop-in w-full max-w-sm p-6 text-center" onClick={e => e.stopPropagation()}>
        <span className="mx-auto flex items-center justify-center"
          style={{ width: 56, height: 56, borderRadius: 18, background: "linear-gradient(165deg, #14B885, #0E8F68 115%)" }}>
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.1"
            strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.7 21a2 2 0 0 1-3.4 0" />
          </svg>
        </span>

        <h2 id="push-prompt-title" className="font-display text-lg font-bold mt-4" style={{ color: "var(--bt-text-1)" }}>
          {t(ios ? "pushPrompt.iosTitle" : "pushPrompt.title")}
        </h2>
        <p className="text-sm mt-2 leading-snug" style={{ color: "var(--bt-text-2)" }}>
          {t(ios ? "pushPrompt.iosBody" : "pushPrompt.body")}
        </p>

        {failed && (
          <p className="text-xs mt-3" style={{ color: "#DC2626" }} role="alert">
            {t("pushPrompt.failed")}
          </p>
        )}

        <div className="mt-5 flex flex-col gap-2">
          {ios ? (
            <button className="btn-primary w-full py-3" onClick={dismiss}>{t("pushPrompt.iosCta")}</button>
          ) : (
            <>
              <button className="btn-primary w-full py-3 bt-press" disabled={busy} onClick={activate}>
                {busy ? t("pushPrompt.working") : t("pushPrompt.cta")}
              </button>
              <button className="btn-ghost w-full py-2.5 text-sm" disabled={busy} onClick={dismiss}>
                {t("pushPrompt.later")}
              </button>
            </>
          )}
        </div>

        {!ios && (
          <p className="text-[11px] mt-3" style={{ color: "var(--bt-text-4)" }}>
            {t("pushPrompt.footnote")}
          </p>
        )}
      </div>
    </div>
  );
}
