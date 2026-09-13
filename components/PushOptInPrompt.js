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
//
// LA MASCOTTE. C'est un moment — un rappel plafonné, avec sa fréquence — et
// DESIGN.md en prévoit la forme : « un moment qui déborde de sa carte ». Elle ne
// parle pas : les raisons restent du texte d'interface. Elle réagit : elle salue
// en arrivant, s'inquiète si l'activation échoue, fête la réussite. L'ancien
// visuel, une cloche blanche dans une tuile verte, était précisément la tuile
// colorée que la charte a retirée partout ailleurs.

import { useCallback, useEffect, useRef, useState } from "react";
import Glyph from "./Glyph";
import Mascot from "./Mascot";
import { useAuth } from "../contexts/AuthContext";
import { useI18n } from "../contexts/I18nContext";
import { useConsent } from "../contexts/ConsentContext";
import { isIOS, isStandalone, isPushSupported, getAppId, enablePush } from "../lib/onesignal";
import { pushErrorMessage } from "../lib/pushMessages";
import { playSensoryCue } from "../lib/sensoryFeedback";
import { isOfflineDev } from "../lib/supabaseClient";
import styles from "./PushOptInPrompt.module.css";

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
const LEAVE_MS = 180;  // durée de la sortie, alignée sur le module CSS
const DONE_HOLD_MS = 1700; // le temps de voir la mascotte fêter l'activation

// Les mêmes dessins que la navigation : la personne reconnaît les rubriques.
// La flamme est celle de la série, mais tracée comme les deux autres : la
// composante Flame est pleine, et une pleine à côté de deux contours se lisait
// comme une tache plus lourde que ses voisines.
const IconFlame = () => (
  <Glyph size={20}>
    <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z" />
  </Glyph>
);
const IconChat = () => (
  <Glyph size={20}><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></Glyph>
);
const IconCalendar = () => (
  <Glyph size={20}>
    <rect x="3" y="4" width="18" height="18" rx="2" />
    <path d="M16 2v4M8 2v4M3 10h18" />
  </Glyph>
);

// Le personnage suit ce qui se passe, il ne fait pas de figuration.
const MOOD = { idle: "happy", asking: "happy", preparing: "happy", subscribing: "happy", failed: "worried", done: "celebrating" };
// Au-delà de ce délai, « Activation… » ne dit plus la vérité : sur un premier
// lancement l'app peut encore télécharger ses fichiers, et on le dit.
const SLOW_PREP_MS = 2500;

export default function PushOptInPrompt() {
  const { user } = useAuth();
  const { t } = useI18n();
  // Le bandeau de confidentialité passe « avant tout le reste », et il le dit.
  // Sur une installation neuve, les deux fenêtres s'empilaient : l'invitation
  // attend donc que le choix soit fait.
  const { hydrated: consentHydrated, needsDecision } = useConsent();
  const [visible, setVisible] = useState(false);
  const [leaving, setLeaving] = useState(false);
  // idle → asking → preparing → subscribing → done | failed
  const [phase, setPhase] = useState("idle");
  const [failure, setFailure] = useState(null);
  const [slowPrep, setSlowPrep] = useState(false);
  const surfaceRef = useRef(null);
  const busy = phase === "asking" || phase === "preparing" || phase === "subscribing";

  useEffect(() => {
    setSlowPrep(false);
    if (phase !== "preparing") return undefined;
    const id = window.setTimeout(() => setSlowPrep(true), SLOW_PREP_MS);
    return () => window.clearTimeout(id);
  }, [phase]);

  const close = useCallback(({ forever = false } = {}) => {
    try {
      if (forever) localStorage.setItem(NEVER_KEY, "1");
      else sessionStorage.setItem(SESSION_KEY, "1");
    } catch (_) {}
    setLeaving(true);
    window.setTimeout(() => { setVisible(false); setLeaving(false); }, LEAVE_MS);
  }, []);

  useEffect(() => {
    if (!user || typeof window === "undefined") return undefined;
    // Trappe de QA des builds offline : `?bt_pushprompt=1` affiche l'invitation
    // sans ses conditions. Inerte en production, où isOfflineDev vaut false.
    // Sans elle, la fenêtre est invisible en local — pas d'App ID, et un
    // navigateur de test qui refuse d'office les notifications.
    const hatch = isOfflineDev ? new URLSearchParams(window.location.search).get("bt_pushprompt") : null;
    if (hatch) {
      // `=failed` et `=done` figent aussi l'état : ni l'un ni l'autre ne peut
      // s'atteindre sans un vrai abonnement OneSignal.
      if (hatch === "failed") { setFailure({ reason: "preparing" }); setPhase("failed"); }
      if (hatch === "done") setPhase("done");
      setVisible(true);
      return undefined;
    }
    if (!consentHydrated || needsDecision) return undefined;
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
  }, [user, consentHydrated, needsDecision]);

  // Focus sur la feuille à l'ouverture, Échap pour fermer — sauf pendant
  // l'activation, qui ne doit pas être interrompue par un geste réflexe.
  useEffect(() => {
    if (!visible) return undefined;
    surfaceRef.current?.focus({ preventScroll: true });
    const onKey = (event) => { if (event.key === "Escape" && !busy) close(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [visible, busy, close]);

  async function activate() {
    setFailure(null);
    setPhase("asking");
    try {
      // Ne rien attendre avant cet appel : il demande la permission, et iOS
      // n'affiche l'invite que dans le geste qui vient d'avoir lieu.
      const res = await enablePush(user?.id, { onStage: setPhase });
      if (res?.ok) {
        try {
          localStorage.setItem("bt_push_enabled", "1");
          localStorage.removeItem("bt_push_last_error");
        } catch (_) {}
        setPhase("done");
        playSensoryCue("notification");
        window.setTimeout(() => close({ forever: true }), DONE_HOLD_MS);
        return;
      }
      // Refusé dans l'invite système : c'est une réponse, pas une panne. L'invite
      // ne reviendra pas, la fenêtre n'a plus rien à proposer.
      if (res?.reason === "denied") { close(); return; }
      setFailure(res || { reason: "error" });
      setPhase("failed");
    } catch (_) {
      setFailure({ reason: "error" });
      setPhase("failed");
    }
  }

  if (!visible) return null;

  const done = phase === "done";
  const ctaLabel = phase === "preparing" && slowPrep ? t("pushPrompt.preparing")
    : busy ? t("pushPrompt.working")
    : t("pushPrompt.cta");

  return (
    <div className={`${styles.layer} ${leaving ? styles.leaving : ""}`}>
      <div className={styles.scrim} onClick={() => { if (!busy) close(); }} aria-hidden="true" />

      <div className={styles.sheet}>
        <span className={styles.mascot} aria-hidden="true">
          <Mascot mood={MOOD[phase]} size={124} />
        </span>

        <div ref={surfaceRef} tabIndex={-1} className={styles.surface}
          role="dialog" aria-modal="true" aria-labelledby="push-prompt-title">
          {!done && (
            // Croix : ferme pour cette session, l'invitation revient au prochain
            // lancement. Fermer n'est pas refuser.
            <button type="button" className={styles.close} disabled={busy}
              onClick={() => close()} aria-label={t("pushPrompt.later")}>
              <span><Glyph size={16}><path d="m17.4 6.6-10.8 10.8M6.6 6.6l10.8 10.8" /></Glyph></span>
            </button>
          )}

          <h2 id="push-prompt-title" className={`font-display ${styles.title}`}>
            {done ? t("push.enabled") : t("pushPrompt.title")}
          </h2>

          {/* La réussite garde la hauteur de la feuille : le texte et les
              raisons restent en place, seule la zone des boutons change. Une
              feuille qui se rétracte d'un coup ferait tomber la mascotte au
              moment précis où elle fête l'activation. */}
          <p className={styles.lead}>{t("pushPrompt.lead")}</p>
          <ul className={styles.reasons}>
            <li className={styles.reason}>
              <span className={styles.reasonIcon}><IconFlame /></span>
              {t("pushPrompt.reasonStreak")}
            </li>
            <li className={styles.reason}>
              <span className={styles.reasonIcon}><IconChat /></span>
              {t("pushPrompt.reasonFriend")}
            </li>
            <li className={styles.reason}>
              <span className={styles.reasonIcon}><IconCalendar /></span>
              {t("pushPrompt.reasonExam")}
            </li>
          </ul>

          {phase === "failed" && (
            <p className={styles.failure} role="alert">
              {pushErrorMessage(t, failure?.reason, failure?.origin) || t("push.error")}
            </p>
          )}

          {done ? (
            <p className={styles.done} role="status">
              <Glyph size={18}><polyline points="20 6 9 17 4 12" /></Glyph>
              {t("pushPrompt.done")}
            </p>
          ) : (
            <div className={styles.actions}>
              <button type="button" className="btn-primary bt-press w-full" disabled={busy} onClick={activate}>
                {phase === "failed" ? t("pushPrompt.retry") : ctaLabel}
              </button>
              <button type="button" className="btn-ghost w-full text-sm" disabled={busy} onClick={() => close()}>
                {t("pushPrompt.later")}
              </button>
            </div>
          )}

          <div className={styles.foot}>
            <span>{t("pushPrompt.footnote")}</span>
            {/* Sortie définitive, volontairement discrète : qui ne veut
                vraiment pas doit pouvoir le dire une fois pour toutes, sans
                que ce soit le geste le plus facile de la fenêtre. Masquée mais
                gardée à la réussite, pour que la feuille ne change pas de
                hauteur. */}
            <button type="button" className={styles.never} disabled={busy || done}
              style={done ? { visibility: "hidden" } : undefined}
              onClick={() => close({ forever: true })}>
              {t("pushPrompt.never")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
