import { useCallback, useEffect, useRef, useState } from "react";
import Glyph from "./Glyph";
import PwaHomeScreenVisual from "./PwaHomeScreenVisual";
import { useAuth } from "../contexts/AuthContext";
import { useConsent } from "../contexts/ConsentContext";
import { useI18n } from "../contexts/I18nContext";
import { isOfflineDev } from "../lib/supabaseClient";
import {
  decidePwaPrompt,
  isIOSSafari,
  isPwaInstalled,
} from "../lib/pwaInstall.mjs";
import styles from "./PwaInstallBanner.module.css";

const SESSION_KEY = "bt_pwa_closed";
const LEAVE_MS = 160;
const OPEN_DELAY_MS = 900;

function storageKeys(userId) {
  return {
    installed: `bt_pwa_installed_${userId}`,
  };
}

function browserState() {
  return {
    installed: isPwaInstalled({
      displayModeStandalone: window.matchMedia?.("(display-mode: standalone)").matches === true,
      navigatorStandalone: window.navigator.standalone === true,
    }),
    iosSafari: isIOSSafari({
      userAgent: navigator.userAgent || "",
      platform: navigator.platform || "",
      maxTouchPoints: navigator.maxTouchPoints || 0,
    }),
  };
}

function ShareIcon() {
  return (
    <Glyph size={28}>
      <path d="M5 11v8a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-8" />
      <path d="M12 3v12M8 7l4-4 4 4" />
    </Glyph>
  );
}

export default function PwaInstallBanner({ enabled = true }) {
  const { user } = useAuth();
  const { hydrated: consentHydrated, needsDecision } = useConsent();
  const { t } = useI18n();
  const [nativePrompt, setNativePrompt] = useState(null);
  const [mode, setMode] = useState(null);
  const [closed, setClosed] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [installing, setInstalling] = useState(false);
  const surfaceRef = useRef(null);

  const markDone = useCallback(() => {
    if (!user?.id) return;
    try { localStorage.setItem(storageKeys(user.id).installed, "1"); } catch (_) {}
  }, [user?.id]);

  useEffect(() => {
    const onPrompt = (event) => {
      event.preventDefault();
      setNativePrompt(event);
    };
    const onInstalled = () => {
      markDone();
      setClosed(true);
      setMode(null);
      setNativePrompt(null);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, [markDone]);

  useEffect(() => {
    if (mode || closed || !enabled || !consentHydrated || needsDecision) return undefined;

    const preview = isOfflineDev
      && new URLSearchParams(window.location.search).get("pwa") === "preview";
    const keys = user?.id ? storageKeys(user.id) : null;
    let installationRecorded = false;
    let dismissedThisSession = false;
    try {
      installationRecorded = keys ? localStorage.getItem(keys.installed) === "1" : false;
      dismissedThisSession = sessionStorage.getItem(SESSION_KEY) === "1";
    } catch (_) {}

    const state = browserState();
    const nextMode = preview ? "ios" : decidePwaPrompt({
      enabled,
      hasUser: Boolean(user?.id),
      installed: state.installed,
      nativePromptAvailable: Boolean(nativePrompt),
      iosSafari: state.iosSafari,
      installationRecorded,
      dismissedThisSession,
    });
    if (!nextMode) return undefined;

    const timer = window.setTimeout(() => {
      setMode(nextMode);
    }, preview ? 0 : OPEN_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [closed, consentHydrated, enabled, mode, nativePrompt, needsDecision, user?.id]);

  const close = useCallback(({ dismissed = true } = {}) => {
    setClosed(true);
    if (dismissed) {
      try {
        sessionStorage.setItem(SESSION_KEY, "1");
      } catch (_) {}
    }
    setLeaving(true);
    window.setTimeout(() => {
      setMode(null);
      setLeaving(false);
    }, LEAVE_MS);
  }, []);

  useEffect(() => {
    if (!mode) return undefined;
    surfaceRef.current?.focus({ preventScroll: true });
    const onKeyDown = (event) => {
      if (event.key === "Escape" && !installing) close();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [close, installing, mode]);

  useEffect(() => {
    if (!enabled && mode) setMode(null);
  }, [enabled, mode]);

  async function install() {
    if (!nativePrompt || installing) return;
    setInstalling(true);
    try {
      await nativePrompt.prompt();
      const choice = await nativePrompt.userChoice;
      setNativePrompt(null);
      if (choice?.outcome === "accepted") {
        markDone();
        close({ dismissed: false });
      } else {
        close();
      }
    } catch (_) {
      setNativePrompt(null);
      close();
    } finally {
      setInstalling(false);
    }
  }

  if (!mode) return null;

  return (
    <div className={`${styles.layer} ${leaving ? styles.leaving : ""}`}>
      <div className={styles.scrim} onClick={() => { if (!installing) close(); }} aria-hidden="true" />
      <div
        ref={surfaceRef}
        tabIndex={-1}
        className={styles.surface}
        role="dialog"
        aria-modal="true"
        aria-labelledby="pwa-install-title"
        aria-describedby="pwa-install-subtitle"
      >
        <button
          type="button"
          className={styles.close}
          onClick={() => close()}
          disabled={installing}
          aria-label={t("pwa.dismiss")}
        >
          <Glyph size={17}><path d="m17.4 6.6-10.8 10.8M6.6 6.6l10.8 10.8" /></Glyph>
        </button>

        <h2 id="pwa-install-title" className={`font-display ${styles.title}`}>{t("pwa.title")}</h2>
        <p id="pwa-install-subtitle" className={styles.subtitle}>{t("pwa.subtitle")}</p>

        {mode === "ios" ? (
          <ol className={styles.steps}>
            <li className={styles.step}>
              <span className={styles.stepNumber}>1</span>
              <span className={styles.stepText}>{t("pwa.step1")}</span>
              <span className={styles.shareIcon} aria-hidden="true"><ShareIcon /></span>
            </li>
            <li className={styles.step}>
              <span className={styles.stepNumber}>2</span>
              <span className={styles.stepText}>{t("pwa.step2")}</span>
              <span className={styles.homeRow}><PwaHomeScreenVisual /></span>
            </li>
          </ol>
        ) : (
          <div className={styles.actions}>
            <button type="button" className="btn-primary bt-press w-full" onClick={install} disabled={installing}>
              {installing ? t("pwa.installing") : t("pwa.install")}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
