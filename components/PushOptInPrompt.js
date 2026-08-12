// Invitation à activer les notifications, juste après l'inscription.
//
// Pourquoi ici et pas dans le profil : personne ne va fouiller ses réglages
// pour découvrir une fonctionnalité qu'il ignore. Le moment d'intention le plus
// fort est l'arrivée sur le tableau de bord, une fois le compte créé.
//
// Sur iPhone, demander la permission est IMPOSSIBLE tant que l'app n'est pas
// sur l'écran d'accueil : iOS ne l'autorise qu'en mode standalone. Dans ce cas
// on ne montre RIEN ici — PwaInstallBanner explique déjà l'installation, avec
// ses étapes et son illustration. Deux fenêtres disant la même chose, c'est
// exactement le trop-plein de texte qu'on cherche à éviter. L'invitation
// reviendra d'elle-même une fois l'app installée.
//
// Ne s'affiche qu'une fois, et jamais si la personne a déjà répondu à l'invite
// système : un rappel qu'on ne peut pas honorer serait pire que rien.

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import { useI18n } from "../contexts/I18nContext";
import { isIOS, isStandalone, isPushSupported, getAppId, enablePush, loginUser } from "../lib/onesignal";

// Une seule proposition ne touchait que les nouveaux inscrits : tous ceux qui
// utilisent déjà l'app ignoraient la fonctionnalité. L'invitation revient donc
// à chaque nouvelle session — mais PLAFONNÉE. Au-delà de quelques rappels, on
// n'obtient plus d'activations : on apprend seulement aux gens à fermer sans
// lire, et on abîme le peu de crédit qu'a une fenêtre modale.
const NEVER_KEY = "bt_push_prompt_never";   // choix explicite : ne plus proposer
const COUNT_KEY = "bt_push_prompt_count";   // nombre de rappels déjà montrés
const SESSION_KEY = "bt_push_prompt_closed"; // fermée pour cette session
const MAX_PROMPTS = 4;
const DELAY_MS = 1200; // laisse le tableau de bord se poser avant d'interrompre

export default function PushOptInPrompt() {
  const { user } = useAuth();
  const { t } = useI18n();
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  const close = useCallback(({ forever = false } = {}) => {
    try {
      if (forever) localStorage.setItem(NEVER_KEY, "1");
      else sessionStorage.setItem(SESSION_KEY, "1");
    } catch (_) {}
    setVisible(false);
  }, []);

  useEffect(() => {
    if (!user || typeof window === "undefined") return undefined;
    let never = false, enabled = false, closedThisSession = false, count = 0;
    try {
      never = localStorage.getItem(NEVER_KEY) === "1";
      enabled = localStorage.getItem("bt_push_enabled") === "1";
      closedThisSession = sessionStorage.getItem(SESSION_KEY) === "1";
      count = Number(localStorage.getItem(COUNT_KEY) || 0);
    } catch (_) {}
    if (never || enabled || closedThisSession || count >= MAX_PROMPTS || !getAppId()) return undefined;

    // Déjà accordée ou déjà refusée : dans les deux cas, l'invite système ne
    // reviendra pas. Insister n'apporterait rien.
    const decided = typeof Notification !== "undefined" && Notification.permission !== "default";
    if (decided) return undefined;

    // iPhone hors écran d'accueil : PwaInstallBanner s'en charge, on se tait.
    if (isIOS() && !isStandalone()) return undefined;
    if (!isPushSupported()) return undefined;

    const id = setTimeout(() => {
      setVisible(true);
      // Compté à l'affichage réel, pas au montage : un rappel jamais vu ne
      // doit pas consommer le quota.
      try { localStorage.setItem(COUNT_KEY, String(count + 1)); } catch (_) {}
    }, DELAY_MS);
    return () => clearTimeout(id);
  }, [user]);

  async function activate() {
    setBusy(true); setFailed(false);
    try {
      const res = await enablePush();
      if (res?.ok) {
        if (user) await loginUser(user.id);
        try { localStorage.setItem("bt_push_enabled", "1"); } catch (_) {}
        close({ forever: true });
        return;
      }
      // On ne laisse pas la personne dans le flou, mais on ne l'enferme pas
      // non plus : le réglage reste accessible depuis le profil.
      setFailed(true);
    } catch (_) { setFailed(true); }
    finally { setBusy(false); }
  }

  if (!visible) return null;

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="push-prompt-title"
      className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-4"
      style={{ backgroundColor: "rgba(0,0,0,0.5)", backdropFilter: "blur(3px)" }}
      onClick={() => close()}>
      <div className="card bt-pop-in w-full max-w-sm p-6 text-center relative" onClick={e => e.stopPropagation()}>
        {/* Croix : ferme pour cette session, l'invitation revient au prochain
            lancement. Fermer n'est pas refuser. */}
        <button type="button" onClick={() => close()} aria-label={t("pushPrompt.later")}
          className="absolute top-3 right-3 w-8 h-8 rounded-full flex items-center justify-center"
          style={{ color: "var(--bt-text-3)" }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
            strokeLinecap="round" aria-hidden="true">
            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>

        <span className="mx-auto flex items-center justify-center"
          style={{ width: 56, height: 56, borderRadius: 18, background: "linear-gradient(165deg, #14B885, #0E8F68 115%)" }}>
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.1"
            strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.7 21a2 2 0 0 1-3.4 0" />
          </svg>
        </span>

        <h2 id="push-prompt-title" className="font-display text-lg font-bold mt-4" style={{ color: "var(--bt-text-1)" }}>
          {t("pushPrompt.title")}
        </h2>
        <p className="text-sm mt-2 leading-snug" style={{ color: "var(--bt-text-2)" }}>
          {t("pushPrompt.body")}
        </p>

        {failed && (
          <p className="text-xs mt-3" style={{ color: "#DC2626" }} role="alert">
            {t("pushPrompt.failed")}
          </p>
        )}

        <div className="mt-5 flex flex-col gap-2">
          <button className="btn-primary w-full py-3 bt-press" disabled={busy} onClick={activate}>
            {busy ? t("pushPrompt.working") : t("pushPrompt.cta")}
          </button>
          <button className="btn-ghost w-full py-2.5 text-sm" disabled={busy} onClick={() => close()}>
            {t("pushPrompt.later")}
          </button>
        </div>

        <p className="text-[11px] mt-3" style={{ color: "var(--bt-text-4)" }}>
          {t("pushPrompt.footnote")}
        </p>

        {/* Sortie définitive, volontairement discrète : qui ne veut vraiment
            pas doit pouvoir le dire une fois pour toutes, sans que ce soit le
            geste le plus facile de la fenêtre. */}
        <button type="button" disabled={busy} onClick={() => close({ forever: true })}
          className="mt-3 text-[11px] underline underline-offset-2"
          style={{ color: "var(--bt-text-4)" }}>
          {t("pushPrompt.never")}
        </button>
      </div>
    </div>
  );
}
