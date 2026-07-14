import "../styles/globals.css";
import Head from "next/head";
import { useState, useEffect, useCallback, useRef } from "react";
import { AuthProvider, useAuth } from "../contexts/AuthContext";
import { TimerProvider } from "../contexts/TimerContext";
import { NotificationProvider } from "../contexts/NotificationContext";
import { ToastProvider } from "../contexts/ToastContext";
import { I18nProvider } from "../contexts/I18nContext";
import { supabase, isOfflineDev } from "../lib/supabaseClient";
import { loadUserLevelMap, clearUserLevelCache } from "../lib/userLevels";
import Celebration from "../components/Celebration";
import { initOneSignal, loginUser } from "../lib/onesignal";
import SeoHead from "../components/SeoHead";

// Paliers de série célébrés (jours consécutifs). Volontairement rares pour que
// le moment reste marquant — on ne fête PAS chaque badge série (3/14).
const STREAK_MILESTONES = [7, 30, 100];
function highestStreakMilestone(streak) {
  return STREAK_MILESTONES.filter((m) => streak >= m).pop() || 0;
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
  // Une seule célébration à l'écran à la fois ; les suivantes (ex. level-up ET
  // palier de série au même check) attendent dans la file.
  const [celebration, setCelebration] = useState(null);
  const queueRef = useRef([]);
  const previousLevelRef = useRef(null);
  const streakBaselineRef = useRef(null);
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

      localStorage.setItem("bt_level", String(currentLevel));
      window.dispatchEvent(new CustomEvent("bt-level-updated", { detail: { level: currentLevel } }));

      if (activeUserRef.current !== user.id) {
        activeUserRef.current = user.id;
        previousLevelRef.current = null;
        streakBaselineRef.current = null;
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
        return;
      }

      // Level-up ?
      if (currentLevel > previousLevelRef.current && currentLevel > storedLevel) {
        enqueueCelebration({ kind: "level", level: currentLevel, titleKey: current.titleKey });
        localStorage.setItem(storageKey, String(currentLevel));
      }
      previousLevelRef.current = Math.max(previousLevelRef.current, currentLevel);

      // Nouveau palier de série ? (jamais un palier plus bas qu'un déjà fêté)
      if (reachedMilestone > (streakBaselineRef.current || 0) && reachedMilestone > storedStreak) {
        enqueueCelebration({ kind: "streak", days: reachedMilestone });
        localStorage.setItem(streakKey, String(reachedMilestone));
      }
      streakBaselineRef.current = Math.max(streakBaselineRef.current || 0, reachedMilestone);
    } catch (error) {
      console.error("Level watcher error:", error);
    } finally {
      loadingRef.current = false;
      if (rerunRef.current) {
        rerunRef.current = false;
        setTimeout(checkLevel, 0);
      }
    }
  }, [user, enqueueCelebration]);

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

// Ré-associe l'abonnement push à l'utilisateur uniquement s'il l'a déjà activé
// (flag localStorage). N'init RIEN pour les utilisateurs qui n'ont jamais opt-in
// → aucun coût de chargement du SDK OneSignal pour eux.
function PushInit() {
  const { user } = useAuth();
  useEffect(() => {
    if (!user || typeof window === "undefined") return;
    if (localStorage.getItem("bt_push_enabled") !== "1") return;
    let cancelled = false;
    (async () => {
      try {
        await initOneSignal();
        if (!cancelled) await loginUser(user.id);
      } catch (_) {}
    })();
    return () => { cancelled = true; };
  }, [user]);
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
          backgroundColor: "#14B885", color: "#fff", border: "none",
          borderRadius: 10, padding: "8px 16px", fontSize: 13, fontWeight: 600, cursor: "pointer",
        }}>
          Installer
        </button>
        <button onClick={() => setPrompt(null)} aria-label="Fermer" style={{
          color: "#A8A09A", background: "none", border: "none",
          cursor: "pointer", fontSize: 18, lineHeight: 1, padding: 4,
        }}>
          ✕
        </button>
      </div>
    </div>
  );
}

export default function App({ Component, pageProps }) {
  return (
    <AuthProvider>
      <I18nProvider>
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
          <link rel="icon" type="image/png" href="/icon-192x192.png" />
          <link rel="apple-touch-icon" href="/icon-192x192.png" />
        </Head>
        <SeoHead />
        <Component {...pageProps} />
        <GlobalLevelUpWatcher />
        <ReferralCapture />
        <PushInit />
        <InstallBanner />
      </ToastProvider>
      </NotificationProvider>
      </TimerProvider>
      </I18nProvider>
    </AuthProvider>
  );
}
