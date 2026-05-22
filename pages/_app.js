import "../styles/globals.css";
import Head from "next/head";
import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/router";
import { AuthProvider, useAuth } from "../contexts/AuthContext";
import { TimerProvider } from "../contexts/TimerContext";
import { NotificationProvider } from "../contexts/NotificationContext";
import { I18nProvider } from "../contexts/I18nContext";
import { supabase } from "../lib/supabaseClient";
import { computeStreak } from "../lib/format";
import { computeEarnedBadgeIds } from "../lib/badges";
import { computeTotalXP, getLevelInfo } from "../lib/xp";
import LevelUpModal from "../components/LevelUpModal";

async function loadCurrentLevel(userId) {
  const [
    profileRes, sessionsRes, examRes, objRes, doneObjRes, friendRes,
    postRes, existingRes, likesRes, commentsRes, groupRes, commMsgRes,
    referralStatsRes,
  ] = await Promise.all([
    supabase.from("profiles").select("bonus_xp").eq("id", userId).maybeSingle(),
    supabase.from("sessions").select("started_at, duration_seconds").eq("user_id", userId),
    supabase.from("exams").select("id", { count: "exact", head: true }).eq("user_id", userId),
    supabase.from("objectives").select("id", { count: "exact", head: true }).eq("user_id", userId),
    supabase.from("objectives").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("done", true),
    supabase.from("friendships").select("id", { count: "exact", head: true })
      .or(`requester.eq.${userId},addressee.eq.${userId}`).eq("status", "accepted"),
    supabase.from("posts").select("id", { count: "exact", head: true }).eq("user_id", userId),
    supabase.from("user_badges").select("badge_id").eq("user_id", userId),
    supabase.from("likes").select("id", { count: "exact", head: true }).eq("user_id", userId),
    supabase.from("comments").select("id", { count: "exact", head: true }).eq("user_id", userId),
    supabase.from("group_members").select("id", { count: "exact", head: true }).eq("user_id", userId),
    supabase.from("community_messages").select("id", { count: "exact", head: true }).eq("user_id", userId),
    supabase.rpc("get_my_referral_stats"),
  ]);

  const hardError = [
    profileRes, sessionsRes, examRes, objRes, doneObjRes, friendRes,
    postRes, existingRes, likesRes, commentsRes, groupRes, commMsgRes,
  ].find(res => res.error);
  if (hardError) throw hardError.error;

  const sessions = sessionsRes.data || [];
  const streak = computeStreak(sessions);
  const totalSeconds = sessions.reduce((sum, s) => sum + Number(s.duration_seconds || 0), 0);
  const dayTotals = {};
  for (const s of sessions) {
    const day = (s.started_at || "").slice(0, 10);
    if (day) dayTotals[day] = (dayTotals[day] || 0) + Number(s.duration_seconds || 0);
  }

  const existingBadges = (existingRes.data || []).map(b => b.badge_id);
  const earnedBadges = computeEarnedBadgeIds({
    streak,
    totalHours: totalSeconds / 3600,
    maxDailyHours: Object.values(dayTotals).length ? Math.max(...Object.values(dayTotals)) / 3600 : 0,
    sessionCount: sessions.length,
    examCount: examRes.count || 0,
    objectiveCount: objRes.count || 0,
    completedObjCount: doneObjRes.count || 0,
    friendCount: friendRes.count || 0,
    postCount: postRes.count || 0,
    reactionsCount: (likesRes.count || 0) + (commentsRes.count || 0),
    groupMemberCount: groupRes.count || 0,
    communityMsgCount: commMsgRes.count || 0,
    referralCount: referralStatsRes.data?.ok ? (referralStatsRes.data.count || 0) : 0,
  });

  const totalXP = computeTotalXP({
    totalMinutes: totalSeconds / 60,
    completedObjectives: doneObjRes.count || 0,
    streak,
    examCount: examRes.count || 0,
    badgeCount: new Set([...existingBadges, ...earnedBadges]).size,
    bonusXP: profileRes.data?.bonus_xp || 0,
  });

  return getLevelInfo(totalXP).current;
}

function GlobalLevelUpWatcher() {
  const { user } = useAuth();
  const router = useRouter();
  const [levelUp, setLevelUp] = useState(null);
  const previousLevelRef = useRef(null);
  const activeUserRef = useRef(null);
  const loadingRef = useRef(false);
  const pendingRef = useRef(null);
  const rerunRef = useRef(false);

  const checkLevel = useCallback(async () => {
    if (!user || typeof window === "undefined") return;
    if (loadingRef.current) {
      rerunRef.current = true;
      return;
    }
    loadingRef.current = true;
    try {
      const current = await loadCurrentLevel(user.id);
      const currentLevel = current.level;
      const storageKey = `blocus:last-announced-level:${user.id}`;
      const storedLevel = Number(localStorage.getItem(storageKey) || 0);

      localStorage.setItem("bt_level", String(currentLevel));
      window.dispatchEvent(new CustomEvent("bt-level-updated", { detail: { level: currentLevel } }));

      if (activeUserRef.current !== user.id) {
        activeUserRef.current = user.id;
        previousLevelRef.current = null;
      }

      if (previousLevelRef.current === null) {
        const baseline = Math.max(storedLevel, currentLevel);
        previousLevelRef.current = baseline;
        if (storedLevel < baseline) localStorage.setItem(storageKey, String(baseline));
        return;
      }

      if (currentLevel > previousLevelRef.current && currentLevel > storedLevel) {
        setLevelUp({ level: currentLevel, titleKey: current.titleKey });
        localStorage.setItem(storageKey, String(currentLevel));
      }

      previousLevelRef.current = Math.max(previousLevelRef.current, currentLevel);
    } catch (error) {
      console.error("Level watcher error:", error);
    } finally {
      loadingRef.current = false;
      if (rerunRef.current) {
        rerunRef.current = false;
        setTimeout(checkLevel, 0);
      }
    }
  }, [user]);

  const scheduleCheck = useCallback(() => {
    if (typeof window === "undefined") return;
    clearTimeout(pendingRef.current);
    pendingRef.current = setTimeout(checkLevel, 500);
  }, [checkLevel]);

  useEffect(() => {
    if (!user) {
      activeUserRef.current = null;
      previousLevelRef.current = null;
      setLevelUp(null);
      return;
    }

    checkLevel();

    const focus = () => checkLevel();
    const visibility = () => {
      if (!document.hidden) checkLevel();
    };
    window.addEventListener("focus", focus);
    window.addEventListener("bt-xp-changed", scheduleCheck);
    document.addEventListener("visibilitychange", visibility);
    router.events.on("routeChangeComplete", scheduleCheck);
    const interval = setInterval(checkLevel, 60000);

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
      window.removeEventListener("bt-xp-changed", scheduleCheck);
      document.removeEventListener("visibilitychange", visibility);
      router.events.off("routeChangeComplete", scheduleCheck);
      channels.forEach(ch => supabase.removeChannel(ch));
    };
  }, [checkLevel, router.events, scheduleCheck, user]);

  return levelUp ? (
    <LevelUpModal
      level={levelUp.level}
      titleKey={levelUp.titleKey}
      onClose={() => setLevelUp(null)}
    />
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
        <button onClick={() => setPrompt(null)} style={{
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
        <Head>
          <title>blocus-tracker</title>
          <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
          <meta name="description" content="Suivi d'étude avec un réseau social entre amis." />
          <meta name="application-name" content="Blocus Tracker" />
          <meta name="apple-mobile-web-app-capable" content="yes" />
          <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
          <meta name="apple-mobile-web-app-title" content="Blocus" />
          <meta name="mobile-web-app-capable" content="yes" />
          <meta name="theme-color" content="#14B885" />
          <link rel="manifest" href="/manifest.json" />
          <link rel="apple-touch-icon" href="/icon-192x192.png" />
        </Head>
        <Component {...pageProps} />
        <GlobalLevelUpWatcher />
        <ReferralCapture />
        <InstallBanner />
      </NotificationProvider>
      </TimerProvider>
      </I18nProvider>
    </AuthProvider>
  );
}
