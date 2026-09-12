import "../styles/globals.css";
import Glyph from "../components/Glyph";
import Head from "next/head";
import { useRouter } from "next/router";
import { useState, useEffect, useCallback, useRef } from "react";
import { AuthProvider, useAuth } from "../contexts/AuthContext";
import { TimerProvider } from "../contexts/TimerContext";
import { NotificationProvider } from "../contexts/NotificationContext";
import { ToastProvider } from "../contexts/ToastContext";
import { I18nProvider, useI18n } from "../contexts/I18nContext";
import { ConsentProvider, useConsent } from "../contexts/ConsentContext";
import { supabase, isOfflineDev } from "../lib/supabaseClient";
import { shouldRedirectToProfileRepair } from "../lib/authProfile.mjs";
import { loadUserLevelMap, clearUserLevelCache } from "../lib/userLevels";
import Celebration from "../components/Celebration";
import { disablePush, initOneSignal, loginUser } from "../lib/onesignal";
import ConsentManager from "../components/ConsentManager";
import LegalUpdateNotice from "../components/LegalUpdateNotice";
import { recordConsentChoice } from "../lib/privacySettings";
import { autoSharePost } from "../lib/autoShare";
import SeoHead from "../components/SeoHead";
import AppSplash from "../components/AppSplash";
import { appleSplashEntries } from "../lib/splashScreens.mjs";
import PageTransition from "../components/PageTransition";
import { initSensoryFeedback } from "../lib/sensoryFeedback";
import { BADGES } from "../lib/badges";

// Paliers de série célébrés (jours consécutifs). Volontairement rares pour que
// le moment reste marquant — on ne fête PAS chaque badge série (3/14).
const STREAK_MILESTONES = [7, 30, 100];
function highestStreakMilestone(streak) {
  return STREAK_MILESTONES.filter((m) => streak >= m).pop() || 0;
}

// Les badges étaient attribués sans que rien ne l'annonce : on les gagnait et
// on l'apprenait, plus tard, en ouvrant son profil. On lit la liste réelle
// (user_badges est en lecture seule côté client depuis v28) et on fête ce qui
// est apparu depuis le dernier passage.
const BADGE_BY_ID = Object.fromEntries(BADGES.map((b) => [b.id, b]));

function IncompleteProfileGuard() {
  const { user, loading, profileStatus, refreshProfile } = useAuth();
  const { t } = useI18n();
  const router = useRouter();

  useEffect(() => {
    if (shouldRedirectToProfileRepair({
      authLoading: loading,
      hasUser: Boolean(user),
      profileStatus,
      pathname: router.pathname,
    })) {
      router.replace({ pathname: "/onboarding", query: { repair: "1" } });
    }
  }, [loading, profileStatus, router, user]);

  if (
    !loading
    && user
    && profileStatus === "error"
    && router.pathname !== "/reset-password"
  ) {
    return (
      <div className="fixed inset-x-4 bottom-4 z-[1000] mx-auto max-w-md" role="alert">
        <div className="card flex items-center gap-3 p-4 shadow-xl">
          <p className="min-w-0 flex-1 text-sm leading-relaxed" style={{ color: "var(--bt-text-1)" }}>
            {t("auth.profileLoadError")}
          </p>
          <button type="button" className="btn-primary shrink-0" onClick={refreshProfile}>
            {t("auth.profileRetry")}
          </button>
        </div>
      </div>
    );
  }

  return null;
}

async function loadOwnBadgeIds(userId) {
  const { data, error } = await supabase
    .from("user_badges")
    .select("badge_id")
    .eq("user_id", userId);
  if (error) return null;
  return (data || []).map((r) => r.badge_id);
}

async function loadCurrentStatus(userId) {
  const levels = await loadUserLevelMap(supabase, [userId], {
    selfUserId: userId,
    includeSelfReferralStats: true,
  });
  const info = levels[userId];
  if (!info?.current) throw new Error("Unable to compute current level");
  return { ...info.current, streak: info.streak || 0 };
}

function GlobalLevelUpWatcher() {
  const { user } = useAuth();
  // Le partage automatique se greffe ICI et nulle part ailleurs pour le niveau
  // et les paliers de série : ce veilleur sait déjà les détecter, et il porte
  // surtout les REPÈRES qui empêchent de fêter (donc de publier) un palier
  // déjà franchi au premier chargement. Refaire cette détection ailleurs, ce
  // serait la refaire à moitié.
  const { t } = useI18n();
  // Une seule célébration à l'écran à la fois ; les suivantes (ex. level-up ET
  // palier de série au même check) attendent dans la file.
  const [celebration, setCelebration] = useState(null);
  const queueRef = useRef([]);
  const previousLevelRef = useRef(null);
  const streakBaselineRef = useRef(null);
  const badgeBaselineRef = useRef(null);
  const activeUserRef = useRef(null);
  const loadingRef = useRef(false);
  const pendingRef = useRef(null);
  const rerunRef = useRef(false);

  const enqueueCelebration = useCallback((item) => {
    setCelebration((cur) => {
      if (cur) { queueRef.current.push(item); return cur; }
      return item;
    });
  }, []);

  const closeCelebration = useCallback(() => {
    setCelebration(queueRef.current.shift() || null);
  }, []);

  // Trappe de QA — build offline UNIQUEMENT (isOfflineDev est false en prod, donc
  // ce bloc est éliminé du bundle Vercel). Permet de prévisualiser une célébration
  // sans devoir franchir un vrai palier : ?bt_celebrate=streak:7 ou =level:5.
  useEffect(() => {
    if (!isOfflineDev || typeof window === "undefined") return;
    window.__btCelebrate = enqueueCelebration; // trigger direct pour la QA
    const raw = new URLSearchParams(window.location.search).get("bt_celebrate");
    if (raw) {
      const [kind, val] = raw.split(":");
      if (kind === "streak") enqueueCelebration({ kind: "streak", days: Number(val) || 7 });
      else if (kind === "level") enqueueCelebration({ kind: "level", level: Number(val) || 5, titleKey: `xp.level${Number(val) || 5}` });
    }
  }, [enqueueCelebration]);

  const checkLevel = useCallback(async () => {
    if (!user || typeof window === "undefined") return;
    if (loadingRef.current) {
      rerunRef.current = true;
      return;
    }
    loadingRef.current = true;
    try {
      const current = await loadCurrentStatus(user.id);
      const currentLevel = current.level;
      const streak = current.streak || 0;
      const reachedMilestone = highestStreakMilestone(streak);

      const storageKey = `blocus:last-announced-level:${user.id}`;
      const storedLevel = Number(localStorage.getItem(storageKey) || 0);
      const streakKey = `blocus:last-streak-milestone:${user.id}`;
      const storedStreak = Number(localStorage.getItem(streakKey) || 0);
      const badgeKey = `blocus:announced-badges:${user.id}`;
      const ownedBadges = await loadOwnBadgeIds(user.id);

      localStorage.setItem("bt_level", String(currentLevel));
      window.dispatchEvent(new CustomEvent("bt-level-updated", { detail: { level: currentLevel } }));

      if (activeUserRef.current !== user.id) {
        activeUserRef.current = user.id;
        previousLevelRef.current = null;
        streakBaselineRef.current = null;
        badgeBaselineRef.current = null;
      }

      // Premier passage pour cet utilisateur : on fixe les repères sans rien
      // fêter (sinon un compte déjà au niveau 8 / série 30 serait spammé au load).
      if (previousLevelRef.current === null) {
        const levelBaseline = Math.max(storedLevel, currentLevel);
        previousLevelRef.current = levelBaseline;
        if (storedLevel < levelBaseline) localStorage.setItem(storageKey, String(levelBaseline));

        const streakBaseline = Math.max(storedStreak, reachedMilestone);
        streakBaselineRef.current = streakBaseline;
        if (storedStreak < streakBaseline) localStorage.setItem(streakKey, String(streakBaseline));

        // Un compte qui possède déjà 6 badges ne doit pas en recevoir 6 pop-ups
        // au chargement : le premier passage ne fait qu'établir le repère.
        if (ownedBadges) {
          const known = new Set(JSON.parse(localStorage.getItem(badgeKey) || "[]"));
          ownedBadges.forEach((id) => known.add(id));
          badgeBaselineRef.current = known;
          localStorage.setItem(badgeKey, JSON.stringify([...known]));
        }
        return;
      }

      // Level-up ?
      if (currentLevel > previousLevelRef.current && currentLevel > storedLevel) {
        enqueueCelebration({ kind: "level", level: currentLevel, titleKey: current.titleKey });
        localStorage.setItem(storageKey, String(currentLevel));
        autoSharePost(supabase, {
          userId: user.id,
          kind: "level_up",
          caption: t("autoshare.level")
            .replace("{level}", String(currentLevel))
            .replace("{title}", current.titleKey ? t(current.titleKey) : ""),
        });
      }
      previousLevelRef.current = Math.max(previousLevelRef.current, currentLevel);

      // Nouveau palier de série ? (jamais un palier plus bas qu'un déjà fêté)
      if (reachedMilestone > (streakBaselineRef.current || 0) && reachedMilestone > storedStreak) {
        enqueueCelebration({ kind: "streak", days: reachedMilestone });
        localStorage.setItem(streakKey, String(reachedMilestone));
        autoSharePost(supabase, {
          userId: user.id,
          kind: "streak",
          caption: t("autoshare.streak").replace("{n}", String(reachedMilestone)),
        });
      }
      streakBaselineRef.current = Math.max(streakBaselineRef.current || 0, reachedMilestone);

      // Nouveaux badges ? Un par célébration, la file les enchaîne.
      if (ownedBadges && badgeBaselineRef.current) {
        const known = badgeBaselineRef.current;
        const fresh = ownedBadges.filter((id) => !known.has(id));
        fresh.forEach((id) => {
          known.add(id);
          const def = BADGE_BY_ID[id];
          if (def) enqueueCelebration({ kind: "badge", badgeId: def.id, labelKey: def.labelKey, descKey: def.descKey });
        });
        if (fresh.length) localStorage.setItem(badgeKey, JSON.stringify([...known]));
      }
    } catch (error) {
      console.error("Level watcher error:", error);
    } finally {
      loadingRef.current = false;
      if (rerunRef.current) {
        rerunRef.current = false;
        setTimeout(checkLevel, 0);
      }
    }
  }, [user, enqueueCelebration, t]);

  const scheduleCheck = useCallback(() => {
    if (typeof window === "undefined") return;
    clearTimeout(pendingRef.current);
    // Debounce élargi (1.5s) : coalesce les rafales d'événements realtime en un
    // seul recalcul au lieu d'un par événement.
    pendingRef.current = setTimeout(checkLevel, 1500);
  }, [checkLevel]);

  useEffect(() => {
    if (!user) {
      activeUserRef.current = null;
      previousLevelRef.current = null;
      streakBaselineRef.current = null;
      queueRef.current = [];
      setCelebration(null);
      return;
    }

    checkLevel();

    const focus = () => scheduleCheck();
    const visibility = () => {
      if (!document.hidden) scheduleCheck();
    };
    // Changement XP EXPLICITE → on invalide le cache de niveau pour forcer un
    // recalcul frais (le level-up reste instantané malgré le cache mémoire).
    const onXpChanged = () => { clearUserLevelCache(); scheduleCheck(); };
    window.addEventListener("focus", focus);
    window.addEventListener("bt-xp-changed", onXpChanged);
    document.addEventListener("visibilitychange", visibility);
    // Polling de sécurité : 5 min (au lieu de 60s). Les events realtime + le
    // cache mémoire de loadUserLevelMap couvrent les mises à jour entre-temps.
    const interval = setInterval(checkLevel, 300000);

    const watchedTables = [
      ["sessions", "user_id"],
      ["objectives", "user_id"],
      ["exams", "user_id"],
      ["user_badges", "user_id"],
      ["posts", "user_id"],
      ["likes", "user_id"],
      ["comments", "user_id"],
      ["group_members", "user_id"],
      ["community_messages", "user_id"],
      ["profiles", "id"],
      ["referrals", "referrer_id"],
      ["xp_ledger", "user_id"],
    ];
    const channels = watchedTables.map(([table, column]) =>
      supabase.channel(`level-watch-${table}-${user.id}`)
        .on("postgres_changes", {
          event: "*",
          schema: "public",
          table,
          filter: `${column}=eq.${user.id}`,
        }, scheduleCheck)
        .subscribe()
    );
    channels.push(
      supabase.channel(`level-watch-friendships-requester-${user.id}`)
        .on("postgres_changes", {
          event: "*",
          schema: "public",
          table: "friendships",
          filter: `requester=eq.${user.id}`,
        }, scheduleCheck)
        .subscribe()
    );
    channels.push(
      supabase.channel(`level-watch-friendships-addressee-${user.id}`)
        .on("postgres_changes", {
          event: "*",
          schema: "public",
          table: "friendships",
          filter: `addressee=eq.${user.id}`,
        }, scheduleCheck)
        .subscribe()
    );

    return () => {
      clearInterval(interval);
      clearTimeout(pendingRef.current);
      window.removeEventListener("focus", focus);
      window.removeEventListener("bt-xp-changed", onXpChanged);
      document.removeEventListener("visibilitychange", visibility);
      channels.forEach(ch => supabase.removeChannel(ch));
    };
  }, [checkLevel, scheduleCheck, user]);

  return celebration ? (
    <Celebration data={celebration} onClose={closeCelebration} />
  ) : null;
}

// Capture du code de parrainage présent dans l'URL (?ref=XXXXXXXX) à la
// première visite et conservation en localStorage jusqu'à la création du
// compte. Expire après 30 jours pour éviter les attributions tardives.
function ReferralCapture() {
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const code = (params.get("ref") || "").trim();
      if (!code) return;
      const clean = code.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 16);
      if (!clean) return;
      const payload = JSON.stringify({ code: clean, ts: Date.now() });
      localStorage.setItem("bt_ref_code", payload);
    } catch (_) {}
  }, []);
  return null;
}

// An installed PWA can keep the JavaScript from the previous deployment in an
// already-open window even after the new service worker has taken control. We
// check only during the first seconds of launch and reload once if its
// controller changes. This updates stale artwork without interrupting a study
// session later in the day.
function AppVersionRefresh() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return undefined;
    const hadController = Boolean(navigator.serviceWorker.controller);
    let reloading = false;

    const onControllerChange = () => {
      if (!hadController || reloading) return;
      reloading = true;
      window.location.reload();
    };
    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);
    navigator.serviceWorker.getRegistration("/")
      .then((registration) => registration?.update())
      .catch(() => {});

    const stopListening = window.setTimeout(() => {
      navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
    }, 15000);
    return () => {
      window.clearTimeout(stopListening);
      navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
    };
  }, []);
  return null;
}

// Ré-associe l'abonnement push à l'utilisateur uniquement s'il l'a déjà activé
// (flag localStorage) ET tant que le consentement « fonctionnel » tient. N'init
// RIEN sinon → aucun chargement du SDK OneSignal, donc aucune donnée envoyée
// chez un tiers, pour qui n'a rien demandé.
//
// Le retrait du consentement doit AGIR : quand la catégorie repasse à false, on
// désinscrit vraiment l'appareil au lieu de se contenter de ne plus initialiser
// (l'abonnement existant continuerait sinon de recevoir des notifications).
function PushInit() {
  const { user } = useAuth();
  const { allows, hydrated } = useConsent();
  const functionalAllowed = allows("functional");

  useEffect(() => {
    if (typeof window === "undefined" || !hydrated) return undefined;

    if (!functionalAllowed) {
      if (localStorage.getItem("bt_push_enabled") === "1") disablePush();
      return undefined;
    }
    if (!user) return undefined;
    if (localStorage.getItem("bt_push_enabled") !== "1") return undefined;

    let cancelled = false;
    (async () => {
      try {
        await initOneSignal();
        if (!cancelled) await loginUser(user.id);
      } catch (_) {}
    })();
    return () => { cancelled = true; };
  }, [user, functionalAllowed, hydrated]);
  return null;
}

// Recopie le choix cookies/traceurs sur le COMPTE, pour qu'il suive la personne
// d'un appareil à l'autre — et qu'il existe une trace de ce qui a été choisi.
// Silencieux : la migration v44 peut ne pas être encore passée, et un miroir
// indisponible ne doit jamais empêcher le choix local de s'appliquer.
function ConsentSync() {
  const { user } = useAuth();
  const { consent, hydrated } = useConsent();
  const lastSyncedRef = useRef(null);

  useEffect(() => {
    if (!user || !hydrated || !consent?.decidedAt) return;
    // Un enregistrement produit deux mises à jour d'état (retour direct +
    // événement inter-onglets) : sans cette signature, chaque choix partirait
    // deux fois en base pour rien.
    const signature = `${user.id}|${consent.version}|${consent.decidedAt}|${JSON.stringify(consent.categories)}`;
    if (lastSyncedRef.current === signature) return;
    lastSyncedRef.current = signature;
    recordConsentChoice(supabase, user.id, consent);
  }, [user, hydrated, consent]);

  return null;
}

function InstallBanner() {
  const [prompt, setPrompt] = useState(null);

  useEffect(() => {
    function handler(e) { e.preventDefault(); setPrompt(e); }
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  if (!prompt) return null;

  async function install() {
    prompt.prompt();
    await prompt.userChoice;
    setPrompt(null);
  }

  return (
    <div style={{
      position: "fixed", bottom: 80, left: 0, right: 0, zIndex: 200,
      padding: "0 16px", pointerEvents: "none",
    }}>
      <div style={{
        backgroundColor: "#1F1A17", color: "#fff", borderRadius: 16,
        padding: "12px 16px", maxWidth: 400, margin: "0 auto",
        display: "flex", alignItems: "center", gap: 12,
        boxShadow: "0 8px 28px rgba(0,0,0,0.28)", pointerEvents: "all",
      }}>
        <div style={{ flex: 1 }}>
          <p style={{ fontSize: 14, fontWeight: 600, margin: 0 }}>Installer l&apos;app</p>
          <p style={{ fontSize: 12, color: "#A8A09A", margin: "2px 0 0" }}>
            Accède à blocus-tracker depuis ton écran d&apos;accueil
          </p>
        </div>
        <button onClick={install} style={{
          backgroundColor: "#087454", color: "#fff", border: "none",
          borderRadius: 10, padding: "8px 16px", minHeight: 44, fontSize: 13, fontWeight: 600, cursor: "pointer",
        }}>
          Installer
        </button>
        <button onClick={() => setPrompt(null)} aria-label="Fermer" style={{
          color: "#A8A09A", background: "none", border: "none",
          cursor: "pointer", width: 44, height: 44, display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0, padding: 0,
        }}>
          <Glyph size={16}>
            <path d="M18 6 6 18M6 6l12 12" />
          </Glyph>
        </button>
      </div>
    </div>
  );
}

export default function App({ Component, pageProps }) {
  useEffect(() => initSensoryFeedback(), []);

  return (
    <AuthProvider>
      <I18nProvider>
      <ConsentProvider>
      <TimerProvider>
      <NotificationProvider>
      <ToastProvider>
        <Head>
          <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
          <meta name="application-name" content="Blocus Tracker" />
          <meta name="apple-mobile-web-app-capable" content="yes" />
          <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
          <meta name="apple-mobile-web-app-title" content="Blocus" />
          <meta name="mobile-web-app-capable" content="yes" />
          <link rel="manifest" href="/manifest.json" />
          <link rel="icon" type="image/png" sizes="64x64" href="/app-icon-v2-64x64.png" />
          <link rel="apple-touch-icon" sizes="180x180" href="/app-icon-v2-180x180.png" />
          {/* Écran de lancement iOS. Une image par écran physique et par sens :
              iOS n'en retient une que si les dimensions tombent juste, sinon il
              démarre sur du blanc. La liste et les images sortent toutes deux de
              lib/splashScreens.mjs — voir scripts/generate-splash.mjs. */}
          {appleSplashEntries().map((entry) => (
            <link
              key={`${entry.href}-${entry.orientation}`}
              rel="apple-touch-startup-image"
              href={entry.href}
              media={entry.media}
            />
          ))}
        </Head>
        <SeoHead />
        <AppSplash />
        <PageTransition />
        <IncompleteProfileGuard />
        <Component {...pageProps} />
        <GlobalLevelUpWatcher />
        <AppVersionRefresh />
        <ReferralCapture />
        <PushInit />
        <ConsentSync />
        <InstallBanner />
        <ConsentManager />
        <LegalUpdateNotice />
      </ToastProvider>
      </NotificationProvider>
      </TimerProvider>
      </ConsentProvider>
      </I18nProvider>
    </AuthProvider>
  );
}
