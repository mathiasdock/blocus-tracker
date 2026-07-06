import { useEffect, useState, useCallback, useRef } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import Layout, { Avatar } from "../components/Layout";
import UserProfileModal from "../components/UserProfileModal";
import StudyHeatmap from "../components/StudyHeatmap";
import { useAuth } from "../contexts/AuthContext";
import { useI18n } from "../contexts/I18nContext";
import { supabase } from "../lib/supabaseClient";
import { formatMinutesShort, lastNDates, getWeekDates, displayName, todayISO, computeStreak, computeBestStreak } from "../lib/format";
import { computeInsights } from "../lib/statsInsights";
import { loadUserLevelMap } from "../lib/userLevels";
import LevelPill from "../components/LevelPill";

const Charts = dynamic(() => import("../components/StatsCharts"), { ssr: false });

// 1er janvier 2024 = un lundi → sert de référence pour nommer un jour ISO
// (0=lun) dans la langue courante sans dépendre d'une locale figée.
function weekdayName(isoIndex, lang) {
  if (isoIndex == null) return "—";
  const d = new Date(2024, 0, 1 + isoIndex);
  return d.toLocaleDateString(lang === "en" ? "en-GB" : "fr-FR", { weekday: "long" });
}

// Formate des minutes-depuis-minuit en heure lisible (18h42 / 6:42 PM).
function formatClock(minutes, lang) {
  if (minutes == null) return "—";
  const h = Math.floor(minutes / 60), m = minutes % 60;
  if (lang === "en") {
    const ap = h < 12 ? "AM" : "PM";
    const h12 = h % 12 === 0 ? 12 : h % 12;
    return `${h12}:${String(m).padStart(2, "0")} ${ap}`;
  }
  return `${h}h${String(m).padStart(2, "0")}`;
}

// Compteur animé (micro-interaction) — anime un entier de 0 → value au montage.
// Respecte prefers-reduced-motion (saute direct à la valeur finale).
function useCountUp(value, duration = 900) {
  const [display, setDisplay] = useState(value);
  const ref = useRef(value);
  useEffect(() => {
    if (typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      setDisplay(value); ref.current = value; return;
    }
    const from = ref.current, to = value, start = performance.now();
    let raf;
    const tick = (now) => {
      const p = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setDisplay(Math.round(from + (to - from) * eased));
      if (p < 1) raf = requestAnimationFrame(tick);
      else ref.current = to;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);
  return display;
}

function CountInt({ value, suffix = "" }) {
  const n = useCountUp(value || 0);
  return <>{n}{suffix}</>;
}

// Barre d'objectif proéminente — libellé, valeur/cible, pourcentage, reste.
function GoalBar({ icon, chip, label, pct, valueText, targetText, footer, footerColor }) {
  const reached = pct >= 100;
  return (
    <div className="rounded-2xl p-4" style={{ backgroundColor: "var(--bt-subtle)", border: "1px solid var(--bt-border)" }}>
      <div className="flex items-center gap-2 mb-2.5">
        <span className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: chip.bg, color: chip.color }}>{icon}</span>
        <span className="text-[11px] font-semibold uppercase tracking-wide flex-1 min-w-0 truncate" style={{ color: "var(--bt-text-2)" }}>{label}</span>
        <span className="text-sm font-num font-bold tabular-nums" style={{ color: reached ? "#0E8F68" : "var(--bt-text-1)" }}>
          <CountInt value={Math.round(pct)} suffix="%" />
        </span>
      </div>
      <div className="w-full h-2.5 rounded-full overflow-hidden" style={{ backgroundColor: "var(--bt-border)" }}>
        <div className="h-full rounded-full transition-all duration-700"
          style={{ width: `${Math.min(100, pct)}%`, backgroundImage: reached ? "linear-gradient(90deg,#0E8F68,#14B885)" : "linear-gradient(90deg,#14B885,#2BD9A4)" }} />
      </div>
      <div className="flex items-center justify-between mt-2 gap-2">
        <span className="text-[11px] font-num tabular-nums" style={{ color: "var(--bt-text-3)" }}>{valueText}{targetText ? ` / ${targetText}` : ""}</span>
        {footer && <span className="text-[11px] font-semibold truncate" style={{ color: footerColor || "var(--bt-text-3)" }}>{footer}</span>}
      </div>
    </div>
  );
}

// Ligne d'insight compacte — icône + libellé + valeur (Habitudes / Perf).
function InsightRow({ icon, label, value }) {
  return (
    <div className="flex items-center gap-2.5 py-2">
      <span className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: "var(--bt-subtle)", color: "var(--bt-text-2)" }}>{icon}</span>
      <span className="text-xs flex-1 min-w-0 truncate" style={{ color: "var(--bt-text-2)" }}>{label}</span>
      <span className="text-sm font-num font-semibold tabular-nums shrink-0" style={{ color: "var(--bt-text-1)" }}>{value}</span>
    </div>
  );
}

// Puce de badge statistique — icône SVG teintée accent (débloqué) ou grisée.
function StatBadge({ earned, label, icon }) {
  return (
    <div className="flex flex-col items-center text-center gap-1.5" style={{ opacity: earned ? 1 : 0.45 }} title={label}>
      <span className="w-12 h-12 rounded-2xl flex items-center justify-center"
        style={{ backgroundColor: earned ? "var(--bt-accent-bg)" : "var(--bt-subtle)", border: `1px solid ${earned ? "var(--bt-accent-border)" : "var(--bt-border)"}`, color: earned ? "#0E8F68" : "var(--bt-text-4)" }}>
        {icon}
      </span>
      <span className="text-[10px] leading-tight font-medium" style={{ color: earned ? "var(--bt-text-2)" : "var(--bt-text-4)" }}>{label}</span>
    </div>
  );
}

// Format the Mon–Sun label for a week
function weekLabel(dates, lang) {
  const start = new Date(dates[0] + "T12:00:00");
  const end   = new Date(dates[6] + "T12:00:00");
  const locale = lang === "en" ? "en-GB" : "fr-FR";
  const opts   = { day: "numeric", month: "short" };
  if (start.getMonth() === end.getMonth()) {
    return `${start.getDate()} – ${end.toLocaleDateString(locale, opts)}`;
  }
  return `${start.toLocaleDateString(locale, opts)} – ${end.toLocaleDateString(locale, opts)}`;
}

// Pastille de rang — podium or / argent / bronze pour bien démarquer le 1er.
// Réservé et intentionnel (comme le rouge pour le destructif) ; le reste en
// numéro discret. Chiffres en Space Grotesk. Dark-safe (couleurs pleines).
function RankBadge({ rank }) {
  const medal = rank === 1
    ? { backgroundColor: "#F59E0B", color: "#fff", boxShadow: "0 2px 10px rgba(245,158,11,0.5)" }   // or
    : rank === 2
    ? { backgroundColor: "#9AA4B2", color: "#fff", boxShadow: "0 1px 5px rgba(154,164,178,0.45)" }  // argent
    : rank === 3
    ? { backgroundColor: "#C2703D", color: "#fff", boxShadow: "0 1px 5px rgba(194,112,61,0.45)" }   // bronze
    : null;
  if (!medal) {
    return (
      <span className="shrink-0 w-6 h-6 flex items-center justify-center font-num font-bold text-xs tabular-nums"
        style={{ color: "var(--bt-text-3)" }}>
        {rank}
      </span>
    );
  }
  return (
    <span className="shrink-0 w-6 h-6 rounded-full flex items-center justify-center font-num font-bold text-xs tabular-nums"
      style={medal}>
      {rank}
    </span>
  );
}

// Chip de tendance — flèche ▲/▼ + pourcentage. Vert en hausse, rouge en baisse,
// neutre si stable. Direction portée par la flèche (pct affiché en absolu).
function TrendChip({ dir, pct }) {
  const cfg = dir === "up"
    ? { color: "#0E8F68", bg: "rgba(20,184,133,0.14)", arrow: <polyline points="5 12 12 5 19 12" /> }
    : dir === "down"
    ? { color: "#DC2626", bg: "rgba(220,38,38,0.12)", arrow: <polyline points="5 12 12 19 19 12" /> }
    : { color: "var(--bt-text-3)", bg: "var(--bt-subtle)", arrow: <line x1="5" y1="12" x2="19" y2="12" /> };
  return (
    <span className="inline-flex items-center gap-0.5 text-[11px] font-bold rounded-md px-1.5 py-0.5 tabular-nums shrink-0"
      style={{ color: cfg.color, backgroundColor: cfg.bg }}>
      <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
        {cfg.arrow}
      </svg>
      {pct}%
    </span>
  );
}

// Mini-carte de stat partagée — fond neutre (l'accent ne reste que sur la puce
// d'icône, pleine, pour qu'elle ressorte). Supporte une chip de tendance
// inline et une barre de progression (ex. objectif du jour).
function StatTile({ icon, chip, label, value, sub, subColor, spanFull, trend, progress, progressLabel }) {
  return (
    <div className={`rounded-2xl p-3.5 ${spanFull ? "col-span-2 sm:col-span-1" : ""}`}
      style={{ backgroundColor: "var(--bt-subtle)", border: "1px solid var(--bt-border)" }}>
      <div className="flex items-center gap-2 mb-3">
        <span className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
          style={{ backgroundColor: chip.bg, color: chip.color }}>
          {icon}
        </span>
        <span className="text-[10px] font-semibold uppercase tracking-wide leading-tight"
          style={{ color: "var(--bt-text-2)" }}>
          {label}
        </span>
      </div>
      <div className="flex items-baseline gap-1.5 flex-wrap">
        <p className="text-[20px] sm:text-[22px] font-num font-bold leading-none tabular-nums"
          style={{ color: "var(--bt-text-1)", letterSpacing: "-0.02em" }}>
          {value}
        </p>
        {trend && <TrendChip dir={trend.dir} pct={trend.pct} />}
      </div>
      {progress != null ? (
        <div className="mt-2.5">
          <div className="w-full h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: "var(--bt-border)" }}>
            <div className="h-full rounded-full transition-all duration-500"
              style={{ width: `${progress}%`, backgroundImage: "linear-gradient(90deg,#14B885,#2BD9A4)" }} />
          </div>
          {progressLabel && (
            <p className="text-[10px] font-medium mt-1 tabular-nums truncate" style={{ color: "var(--bt-text-3)" }}>{progressLabel}</p>
          )}
        </div>
      ) : sub ? (
        <p className="text-[11px] leading-tight font-medium mt-1.5 truncate" style={{ color: subColor }}>
          {sub}
        </p>
      ) : null}
    </div>
  );
}

export default function Stats() {
  const { user, profile } = useAuth();
  const { t, lang } = useI18n();
  const [courses, setCourses]   = useState([]);
  const [sessions, setSessions] = useState([]);
  const [allTimeSecs, setAllTimeSecs] = useState(0);
  const [comparison, setComparison] = useState(undefined); // undefined=loading, null=indispo

  // ── Niveau 2 : section « Analyse avancée » repliable ───────────
  // Persistée : un utilisateur curieux qui l'ouvre la retrouve ouverte.
  const [showAdvanced, setShowAdvanced] = useState(false);
  useEffect(() => {
    try { if (localStorage.getItem("bt_stats_advanced") === "1") setShowAdvanced(true); } catch {}
  }, []);
  function toggleAdvanced() {
    setShowAdvanced(v => {
      const next = !v;
      try { localStorage.setItem("bt_stats_advanced", next ? "1" : "0"); } catch {}
      return next;
    });
  }

  // ── Chart week navigation ──────────────────────────────────────
  const [weekOffset, setWeekOffset] = useState(0); // 0=current week, -1=last week…

  // ── Leaderboard state ──────────────────────────────────────────
  const [leaderPeriod, setLeaderPeriod] = useState("day");
  const [leaderMode,   setLeaderMode]   = useState("public");
  const [myWeekSecs,   setMyWeekSecs]   = useState(0);
  const [myDaySecs,    setMyDaySecs]    = useState(0);
  const [friendData,   setFriendData]   = useState({});
  const [acceptedIds,  setAcceptedIds]  = useState([]);
  const [viewUserId,   setViewUserId]   = useState(null);

  // ── Public leaderboard + percentile ───────────────────────────
  const [publicLeader,  setPublicLeader]  = useState([]);
  const [leaderLevels,  setLeaderLevels]  = useState({});
  const [loadingPublic, setLoadingPublic] = useState(false);
  const [myRank,        setMyRank]        = useState(null);
  const [maFacActive,   setMaFacActive]   = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    const since = lastNDates(370)[0]; // 53 weeks for annual heatmap
    const { data: c } = await supabase
      .from("courses")
      .select("*")
      .eq("user_id", user.id);
    setCourses(c || []);
    const { data: s } = await supabase
      .from("sessions")
      .select("*")
      .eq("user_id", user.id)
      .gte("started_at", since);
    setSessions(s || []);
  }, [user]);

  useEffect(() => { load(); }, [load]);

  // ── All-time total (cheap: single column, own rows only) ───────
  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase
        .from("sessions")
        .select("duration_seconds")
        .eq("user_id", user.id);
      setAllTimeSecs((data || []).reduce((a, s) => a + s.duration_seconds, 0));
    })();
  }, [user]);

  // ── Friends leaderboard data ───────────────────────────────────
  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data: links } = await supabase
        .from("friendships")
        .select("requester, addressee")
        .or(`requester.eq.${user.id},addressee.eq.${user.id}`)
        .eq("status", "accepted");
      const ids = (links || []).map(l =>
        l.requester === user.id ? l.addressee : l.requester
      );
      setAcceptedIds(ids);
      if (!ids.length) { setFriendData({}); return; }

      const since7 = lastNDates(7)[0];
      const [{ data: profs }, { data: fSessions }] = await Promise.all([
        supabase.from("profiles")
          .select("id, pseudo, first_name, last_name, avatar_url, university")
          .in("id", ids),
        supabase.from("sessions")
          .select("user_id, duration_seconds, started_at")
          .in("user_id", ids)
          .gte("started_at", since7),
      ]);
      const map = {};
      (profs || []).forEach(p => { map[p.id] = { profile: p, sessions: [] }; });
      (fSessions || []).forEach(s => { if (map[s.user_id]) map[s.user_id].sessions.push(s); });
      setFriendData(map);

      const { data: myW } = await supabase.from("sessions")
        .select("duration_seconds")
        .eq("user_id", user.id)
        .gte("started_at", since7);
      setMyWeekSecs((myW || []).reduce((a, s) => a + s.duration_seconds, 0));

      const { data: myD } = await supabase.from("sessions")
        .select("duration_seconds")
        .eq("user_id", user.id)
        .gte("started_at", todayISO());
      setMyDaySecs((myD || []).reduce((a, s) => a + s.duration_seconds, 0));
    })();
  }, [user]);

  // ── Percentile ────────────────────────────────────────────────
  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase.rpc("get_my_study_rank", { p_period: "day" });
      if (data?.[0]) setMyRank(data[0]);
    })();
  }, [user]);

  // ── Comparaison vs autres (RPC agrégée ; null si non déployée) ─
  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data, error } = await supabase.rpc("get_study_comparison");
      // RPC absente en prod tant que la migration v24 n'est pas exécutée →
      // on masque proprement la section (null) plutôt que de crasher.
      setComparison(error ? null : (data || null));
    })();
  }, [user]);

  // ── Public leaderboard ────────────────────────────────────────
  useEffect(() => {
    if (!user) return;
    setLoadingPublic(true);
    (async () => {
      const { data } = await supabase.rpc("get_public_leaderboard", {
        p_period: leaderPeriod,
        p_university: maFacActive ? (profile?.university || null) : null,
      });
      const rows = data || [];
      setPublicLeader(rows);
      if (rows.length) {
        const fallbackTotalSecondsByUser = Object.fromEntries(
          rows.map((row) => [row.user_id, Number(row.alltime_seconds ?? row.total_seconds ?? 0)])
        );
        const levelMap = await loadUserLevelMap(supabase, rows.map((row) => row.user_id), {
          selfUserId: user.id,
          fallbackTotalSecondsByUser,
        });
        setLeaderLevels(levelMap);
      } else {
        setLeaderLevels({});
      }
      setLoadingPublic(false);
    })();
  }, [user, leaderPeriod, leaderMode, maFacActive, profile?.university]);

  // ── Stats computation ──────────────────────────────────────────
  // Chart: 7 days of the selected week
  const weekDates   = getWeekDates(weekOffset);
  const dailyData   = weekDates.map((d) => {
    const secs = sessions
      .filter((s) => s.started_at.slice(0, 10) === d)
      .reduce((a, s) => a + s.duration_seconds, 0);
    return {
      day: new Date(d + "T12:00:00").toLocaleDateString(
        lang === "en" ? "en-GB" : "fr-FR",
        { weekday: "short" }
      ),
      minutes: Math.round(secs / 60),
    };
  });

  // Compact stats card
  const todaySecs = sessions
    .filter(s => s.started_at.slice(0, 10) === todayISO())
    .reduce((a, s) => a + s.duration_seconds, 0);

  // Objectif du jour (aligné sur le dashboard : 2h) + progression.
  const DAILY_GOAL_SECS = 7200;
  const todayGoalPct = Math.min(100, Math.round(todaySecs / DAILY_GOAL_SECS * 100));

  // Tendance aujourd'hui vs hier.
  const yesterdayISO = lastNDates(2)[0];
  const yesterdaySecs = sessions
    .filter(s => s.started_at.slice(0, 10) === yesterdayISO)
    .reduce((a, s) => a + s.duration_seconds, 0);
  const todayDeltaPct = yesterdaySecs > 0
    ? Math.round((todaySecs - yesterdaySecs) / yesterdaySecs * 100)
    : null;

  // Convertit un delta signé (ou null) en prop de TrendChip.
  const trendOf = (deltaPct) => deltaPct == null
    ? undefined
    : { dir: deltaPct > 0 ? "up" : deltaPct < 0 ? "down" : "flat", pct: Math.abs(deltaPct) };

  const thisWeekDates = getWeekDates(0); // always current week for stat card
  const currentWeekSecs = sessions
    .filter(s => thisWeekDates.includes(s.started_at.slice(0, 10)))
    .reduce((a, s) => a + s.duration_seconds, 0);

  const thirtyDaysAgo = lastNDates(30)[0];
  const total30 = sessions
    .filter(s => s.started_at >= thirtyDaysAgo)
    .reduce((a, s) => a + s.duration_seconds, 0);

  const rolling7 = lastNDates(7);
  const avgPerDay = sessions
    .filter(s => rolling7.includes(s.started_at.slice(0, 10)))
    .reduce((a, s) => a + s.duration_seconds, 0) / 7;

  const byCourse30 = courses
    .map((c) => ({
      name: c.name,
      color: c.color,
      minutes: Math.round(
        sessions.filter(s => s.course_id === c.id && s.started_at >= thirtyDaysAgo)
          .reduce((a, s) => a + s.duration_seconds, 0) / 60
      ),
    }))
    .filter(c => c.minutes > 0);

  const byCourse7 = courses
    .map((c) => ({
      name: c.name,
      color: c.color,
      minutes: Math.round(
        sessions
          .filter(s => s.course_id === c.id && rolling7.includes(s.started_at.slice(0, 10)))
          .reduce((a, s) => a + s.duration_seconds, 0) / 60
      ),
    }))
    .filter(c => c.minutes > 0);

  const sessionCount = sessions.length;

  // ── Overview stats (#1 streak, #2 all-time, #3 best day, #4 week evo) ──
  const streak     = computeStreak(sessions);
  const bestStreak = computeBestStreak(sessions);

  // Best day: max total over a single calendar day (within loaded window)
  const dayTotals = {};
  for (const s of sessions) {
    const d = s.started_at.slice(0, 10);
    dayTotals[d] = (dayTotals[d] || 0) + s.duration_seconds;
  }
  const bestDayEntry = Object.entries(dayTotals).sort((a, b) => b[1] - a[1])[0] || null;
  const bestDaySecs  = bestDayEntry ? bestDayEntry[1] : 0;
  const bestDayLabel = bestDayEntry
    ? new Date(bestDayEntry[0] + "T12:00:00").toLocaleDateString(
        lang === "en" ? "en-GB" : "fr-FR", { weekday: "short", day: "numeric", month: "short" })
    : null;

  // Week-over-week evolution (calendar weeks)
  const lastWeekDates = getWeekDates(-1);
  const lastWeekSecs  = sessions
    .filter(s => lastWeekDates.includes(s.started_at.slice(0, 10)))
    .reduce((a, s) => a + s.duration_seconds, 0);
  const weekDeltaPct = lastWeekSecs > 0
    ? Math.round((currentWeekSecs - lastWeekSecs) / lastWeekSecs * 100)
    : null;

  // ── #7 Course podium — top 3 over 30 days ──────────────────────
  const podium = [...byCourse30].sort((a, b) => b.minutes - a.minutes).slice(0, 3);

  // ── Friends leaderboard computation ───────────────────────────
  const mySecs = leaderPeriod === "day" ? myDaySecs : myWeekSecs;
  const leaderboard = [
    { id: user?.id, name: displayName(profile), avatar: profile?.avatar_url, secs: mySecs, me: true },
    ...acceptedIds
      .filter(fid => friendData[fid])
      .filter(fid => !maFacActive || !profile?.university || friendData[fid].profile?.university === profile.university)
      .map(fid => {
        const fd = friendData[fid];
        const secs = leaderPeriod === "day"
          ? fd.sessions.filter(s => s.started_at.slice(0, 10) === todayISO())
              .reduce((a, s) => a + s.duration_seconds, 0)
          : fd.sessions.reduce((a, s) => a + s.duration_seconds, 0);
        return { id: fid, name: displayName(fd.profile), avatar: fd.profile?.avatar_url, secs, me: false };
      }),
  ].sort((a, b) => b.secs - a.secs);

  const hasFriends = acceptedIds.length > 0;

  // ── Percentile ────────────────────────────────────────────────
  const pct = myRank?.total_active > 0 && Number(myRank?.my_secs) > 0
    ? Math.max(1, Math.ceil(Number(myRank.better_count) / Number(myRank.total_active) * 100))
    : null;
  const rankPos   = myRank && Number(myRank.my_secs) > 0 ? Number(myRank.better_count) + 1 : null;
  const rankTotal = myRank ? Number(myRank.total_active) : null;

  // ── Insights (module pur) ─────────────────────────────────────
  const insights = computeInsights(sessions, {
    todaySecs, streak, bestStreak, allTimeSecs, dailyGoalSecs: DAILY_GOAL_SECS,
  });

  // ── Objectifs (journalier déjà = 2h ; semaine 10h ; mois 40h) ──
  const WEEKLY_GOAL_SECS  = 10 * 3600;
  const MONTHLY_GOAL_SECS = 40 * 3600;
  const weekGoalPct  = Math.min(100, Math.round(currentWeekSecs / WEEKLY_GOAL_SECS * 100));
  const monthGoalPct = Math.min(100, Math.round(total30 / MONTHLY_GOAL_SECS * 100));
  const dailyRemain  = Math.max(0, DAILY_GOAL_SECS  - todaySecs);
  const weekRemain   = Math.max(0, WEEKLY_GOAL_SECS  - currentWeekSecs);
  const monthRemain  = Math.max(0, MONTHLY_GOAL_SECS - total30);
  const streakTarget = streak < 7 ? 7 : streak < 14 ? 14 : streak < 30 ? 30 : streak < 100 ? 100 : streak + 10;
  const streakPct    = Math.min(100, Math.round(streak / streakTarget * 100));

  // ── Résumé « intelligent » — phrases dynamiques et priorisées ──
  const aiLines = [];
  if (todaySecs === 0) {
    aiLines.push({ text: t("stats.aiNoToday"), strong: true });
    aiLines.push({ text: streak > 0
      ? t("stats.aiStreakSave").replace("{n}", String(streak))
      : t("stats.aiStreakStart") });
  } else {
    aiLines.push({ text: t("stats.aiTodayGood").replace("{time}", formatMinutesShort(todaySecs)), strong: true });
    if (insights.monthSecs > 0) aiLines.push({ text: t("stats.aiMonth").replace("{time}", formatMinutesShort(insights.monthSecs)) });
    if (insights.bestWeekday != null) aiLines.push({ text: t("stats.aiBestDay").replace("{day}", weekdayName(insights.bestWeekday, lang)) });
  }
  // Ligne de régularité seulement si la semaine passée avait de l'activité.
  if (insights.activeDaysLastWeek > 0) {
    aiLines.push({ text: insights.moreRegular ? t("stats.aiMoreRegular") : t("stats.aiLessRegular"),
      color: insights.moreRegular ? "#0E8F68" : "var(--bt-text-2)" });
  }
  if (todaySecs > 0) aiLines.push({ text: t("stats.aiKeepGoing"), color: "#0E8F68" });
  const aiLinesShown = aiLines.slice(0, 4);

  // ── Badges statistiques (icône SVG teintée accent) ────────────
  const iconOf = {
    firstHour:     <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15 14"/></svg>,
    streak7:       <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/></svg>,
    hours50:       <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>,
    hours100:      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="6"/><path d="M15.477 12.89 17 22l-5-3-5 3 1.523-9.11"/></svg>,
    session3h:     <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polyline points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>,
    marathonDay:   <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="5" r="1"/><path d="m9 20 3-6 3 6"/><path d="m6 8 6 2 6-2"/><path d="M12 10v4"/></svg>,
    afterMidnight: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>,
    earlyBird:     <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.2" y1="4.2" x2="5.6" y2="5.6"/><line x1="18.4" y1="18.4" x2="19.8" y2="19.8"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/></svg>,
    goal10:        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>,
  };
  const badgeDefs = [
    { id: "firstHour",     label: t("stats.badgeFirstHour") },
    { id: "streak7",       label: t("stats.badgeStreak7") },
    { id: "session3h",     label: t("stats.badgeSession3h") },
    { id: "marathonDay",   label: t("stats.badgeMarathon") },
    { id: "hours50",       label: t("stats.badgeHours50") },
    { id: "hours100",      label: t("stats.badgeHours100") },
    { id: "afterMidnight", label: t("stats.badgeNight") },
    { id: "earlyBird",     label: t("stats.badgeEarly") },
    { id: "goal10",        label: t("stats.badgeGoal10") },
  ];
  const earnedBadges = badgeDefs.filter(b => insights.badges[b.id]).length;

  // Répartition du temps par moment de la journée (Habitudes).
  const slots = [
    { key: "morning",   label: t("stats.slotMorning"),   color: "#F59E0B" },
    { key: "afternoon", label: t("stats.slotAfternoon"), color: "#14B885" },
    { key: "evening",   label: t("stats.slotEvening"),   color: "#6366F1" },
    { key: "night",     label: t("stats.slotNight"),     color: "#8B5CF6" },
  ];

  // ── Comparaison vs autres (uniquement des moyennes) ───────────
  const cmpReady = comparison && comparison.me && comparison.app;
  const cmpMetrics = cmpReady ? [
    { label: t("stats.cmpAvgDaily"),   fmt: v => formatMinutesShort(v * 60), me: comparison.me.avg_daily_min, uni: comparison.uni?.avg_daily_min, app: comparison.app.avg_daily_min },
    { label: t("stats.cmpSessions"),   fmt: v => String(Math.round(v)),      me: comparison.me.sessions,      uni: comparison.uni?.sessions,      app: comparison.app.sessions },
    { label: t("stats.cmpActiveDays"), fmt: v => `${Math.round(v)} ${t("stats.dayUnit")}`, me: comparison.me.active_days, uni: comparison.uni?.active_days, app: comparison.app.active_days },
  ] : [];
  const cmpDelta = (mine, other) => (other && other > 0) ? Math.round((mine - other) / other * 100) : null;

  // Moyenne / jour (7j glissants) déjà calculée : avgPerDay (secs).
  return (
    <Layout>
      <div className="bt-stagger">
      <h1 className="text-2xl mb-0.5" style={{ color: "var(--bt-text-1)" }}>{t("stats.title")}</h1>
      <p className="text-sm mb-4" style={{ color: "var(--bt-text-2)" }}>{t("stats.subtitle")}</p>

      {/* ── Carte stats unifiée : Temps d'étude + Progression ──── */}
      <div className="card p-5 mb-4">
        {/* Groupe : Temps d'étude */}
        <div className="flex items-center gap-2 mb-3.5">
          <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: "#14B885" }} />
          <h2 className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--bt-text-2)" }}>
            {t("stats.groupStudyTime")}
          </h2>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-3">
          {[
            {
              icon: (
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15 14"/>
                </svg>
              ),
              chip: { bg: "#14B885", color: "#fff" },
              label: t("stats.compactToday"),
              value: formatMinutesShort(todaySecs),
              trend: trendOf(todayDeltaPct),
              progress: todayGoalPct,
              progressLabel: `${todayGoalPct}% · ${t("dash.goal")}`,
            },
            {
              icon: (
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>
                </svg>
              ),
              chip: { bg: "#14B885", color: "#fff" },
              label: t("stats.compactWeek"),
              value: formatMinutesShort(currentWeekSecs),
              trend: trendOf(weekDeltaPct),
              sub: weekDeltaPct === null ? t("stats.weekNoCompare") : t("stats.vsLastWeek"),
              subColor: "var(--bt-text-3)",
            },
            {
              icon: (
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/>
                </svg>
              ),
              chip: { bg: "#14B885", color: "#fff" },
              label: t("stats.compactMonth"),
              value: formatMinutesShort(total30),
              sub: t("stats.subLast30"),
              subColor: "var(--bt-text-3)",
            },
            {
              icon: (
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
                </svg>
              ),
              chip: { bg: "#14B885", color: "#fff" },
              label: t("stats.compactAvg7d"),
              value: formatMinutesShort(avgPerDay),
              sub: t("stats.subPerDay"),
              subColor: "var(--bt-text-3)",
            },
          ].map((tile, i) => <StatTile key={i} {...tile} />)}
        </div>

        {/* Groupe : Progression */}
        {sessionCount > 0 && (
          <>
            <div className="h-px my-5" style={{ backgroundColor: "var(--bt-border)" }} />
            <div className="flex items-center gap-2 mb-3.5">
              <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: "#14B885" }} />
              <h2 className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--bt-text-2)" }}>
                {t("stats.groupProgress")}
              </h2>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 sm:gap-3">
              {[
                {
                  icon: (
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/>
                    </svg>
                  ),
                  chip: { bg: "#D97706", color: "#fff" },
                  label: t("stats.streakLabel"),
                  value: `${streak} ${t("stats.dayUnit")}`,
                  sub: t("stats.streakRecord").replace("{n}", String(bestStreak)).replace("{unit}", t("stats.dayUnit")),
                  subColor: "var(--bt-text-3)",
                },
                {
                  icon: (
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="8" r="6"/><path d="M15.477 12.89 17 22l-5-3-5 3 1.523-9.11"/>
                    </svg>
                  ),
                  chip: { bg: "#0369a1", color: "#fff" },
                  label: t("stats.allTimeLabel"),
                  value: formatMinutesShort(allTimeSecs),
                  sub: t("stats.allTimeSub"),
                  subColor: "var(--bt-text-3)",
                },
                {
                  icon: (
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M6 9H3.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h2.5a2.5 2.5 0 0 0 0-5H18"/>
                      <path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/>
                      <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/>
                    </svg>
                  ),
                  chip: { bg: "#14B885", color: "#fff" },
                  label: t("stats.bestDayLabel"),
                  value: formatMinutesShort(bestDaySecs),
                  sub: bestDayLabel || t("stats.bestDaySub"),
                  subColor: "var(--bt-text-3)",
                  spanFull: true,
                },
              ].map((tile, i) => <StatTile key={i} {...tile} />)}
            </div>
          </>
        )}
      </div>

      {/* ── Résumé intelligent ─────────────────────────────────── */}
      <div className="card p-5 mb-4 relative overflow-hidden">
        <div className="absolute top-0 left-0 bottom-0 w-1" style={{ backgroundImage: "linear-gradient(180deg,#14B885,#2BD9A4)" }} />
        <div className="flex items-center gap-2 mb-3 pl-1">
          <span className="w-6 h-6 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: "var(--bt-accent-bg)", color: "#0E8F68" }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3l1.9 4.6L18.5 9l-4.6 1.9L12 15.5 10.1 10.9 5.5 9l4.6-1.4L12 3z"/><path d="M19 15l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8.8-2z"/></svg>
          </span>
          <h2 className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--bt-text-2)" }}>{t("stats.aiTitle")}</h2>
        </div>
        <div className="pl-1 space-y-1">
          {aiLinesShown.map((l, i) => (
            <p key={i} className={l.strong ? "text-lg font-semibold leading-snug" : "text-sm leading-snug"}
              style={{ color: l.color || (l.strong ? "var(--bt-text-1)" : "var(--bt-text-2)") }}>
              {l.text}
            </p>
          ))}
        </div>
      </div>

      {/* ── Objectifs — proéminents ────────────────────────────── */}
      <div className="card p-5 mb-4">
        <h2 className="text-sm font-semibold mb-4" style={{ color: "var(--bt-text-1)" }}>{t("stats.goalsTitle")}</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 sm:gap-3">
          <GoalBar
            icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15 14"/></svg>}
            chip={{ bg: "#14B885", color: "#fff" }} label={t("stats.goalDaily")} pct={todayGoalPct}
            valueText={formatMinutesShort(todaySecs)} targetText={formatMinutesShort(DAILY_GOAL_SECS)}
            footer={todayGoalPct >= 100 ? t("stats.goalReached") : t("stats.goalRemaining").replace("{time}", formatMinutesShort(dailyRemain))}
            footerColor={todayGoalPct >= 100 ? "#0E8F68" : "var(--bt-text-3)"} />
          <GoalBar
            icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>}
            chip={{ bg: "#0369a1", color: "#fff" }} label={t("stats.goalWeekly")} pct={weekGoalPct}
            valueText={formatMinutesShort(currentWeekSecs)} targetText={formatMinutesShort(WEEKLY_GOAL_SECS)}
            footer={weekGoalPct >= 100 ? t("stats.goalReached") : t("stats.goalRemaining").replace("{time}", formatMinutesShort(weekRemain))}
            footerColor={weekGoalPct >= 100 ? "#0E8F68" : "var(--bt-text-3)"} />
          <GoalBar
            icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg>}
            chip={{ bg: "#6366F1", color: "#fff" }} label={t("stats.goalMonthly")} pct={monthGoalPct}
            valueText={formatMinutesShort(total30)} targetText={formatMinutesShort(MONTHLY_GOAL_SECS)}
            footer={monthGoalPct >= 100 ? t("stats.goalReached") : t("stats.goalRemaining").replace("{time}", formatMinutesShort(monthRemain))}
            footerColor={monthGoalPct >= 100 ? "#0E8F68" : "var(--bt-text-3)"} />
          <GoalBar
            icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/></svg>}
            chip={{ bg: "#D97706", color: "#fff" }} label={t("stats.goalStreakCard")} pct={streakPct}
            valueText={t("stats.goalStreakUnit").replace("{n}", String(streak)).replace("{target}", String(streakTarget))} targetText=""
            footer={t("stats.goalStreakKeep")} footerColor="var(--bt-text-3)" />
        </div>
      </div>

      {/* ── Heatmap + synthèse ─────────────────────────────────── */}
      <div className="card p-5 mb-4">
        <h2 className="text-sm font-semibold mb-3" style={{ color: "var(--bt-text-2)" }}>
          {t("heatmap.title")}
        </h2>
        <StudyHeatmap sessions={sessions} />
        {insights.hasData && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mt-4 pt-4" style={{ borderTop: "1px solid var(--bt-border)" }}>
            {[
              { label: t("stats.streakLabel"),     value: `${streak} ${t("stats.dayUnit")}` },
              { label: t("stats.recLongestStreak"), value: `${bestStreak} ${t("stats.dayUnit")}` },
              { label: t("stats.recBestMonth"),     value: formatMinutesShort(insights.bestMonthSecs) },
              { label: t("stats.compactAvg7d"),     value: formatMinutesShort(avgPerDay) },
            ].map((s, i) => (
              <div key={i} className="text-center">
                <p className="font-num font-bold tabular-nums text-base" style={{ color: "var(--bt-text-1)" }}>{s.value}</p>
                <p className="text-[10px] font-semibold uppercase tracking-wide mt-0.5" style={{ color: "var(--bt-text-3)" }}>{s.label}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Niveau 2 (Habitudes, Performances, Records, Badges) déplacé
          plus bas dans la section repliable « Analyse avancée ». */}

      {/* ── Percentile — moment de marque (surface ink) ────────── */}
      <div className="card-ink bt-grain px-5 py-4 mb-4">
        <div className="relative z-10 flex items-center gap-4">
          <div className="shrink-0 w-12 h-12 rounded-2xl flex items-center justify-center"
            style={{ background: "rgba(255,255,255,0.10)", border: "1px solid var(--bt-ink-border)" }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--bt-ink-text)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M6 9H3.5a2.5 2.5 0 0 1 0-5H6" />
              <path d="M18 9h2.5a2.5 2.5 0 0 0 0-5H18" />
              <path d="M4 22h16" />
              <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" />
              <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" />
              <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" />
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            {pct !== null ? (
              <>
                <p className="leading-tight" style={{ color: "var(--bt-ink-muted)", fontSize: "0.78rem" }}>
                  {t("stats.percentilePre")}
                </p>
                <p className="font-num font-bold leading-none mt-0.5 tabular-nums"
                  style={{ fontSize: "clamp(1.6rem,7vw,2.1rem)", color: "var(--bt-ink-text)", letterSpacing: "-0.02em" }}>
                  {pct}%
                </p>
                <div className="mt-1.5 flex items-center gap-2 flex-wrap">
                  <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full"
                    style={{ backgroundColor: "rgba(255,255,255,0.12)", color: "var(--bt-ink-text)", border: "1px solid var(--bt-ink-border)" }}>
                    {t("stats.rankTop").replace("{pct}", String(pct))}
                  </span>
                  {rankPos != null && rankTotal != null && (
                    <span className="text-[11px] tabular-nums" style={{ color: "var(--bt-ink-muted)" }}>
                      {t("stats.rankPosition").replace("{rank}", String(rankPos)).replace("{total}", String(rankTotal))}
                    </span>
                  )}
                </div>
              </>
            ) : (
              <>
                <p className="font-semibold leading-tight" style={{ color: "var(--bt-ink-text)", fontSize: "0.95rem" }}>
                  {t("stats.percentileNoData")}
                </p>
                <p className="mt-1 leading-snug" style={{ color: "var(--bt-ink-muted)", fontSize: "0.75rem" }}>
                  {t("stats.percentileNoDataSub")}
                </p>
              </>
            )}
          </div>
        </div>
      </div>

      {/* ── Comparaison avec les autres (moyennes uniquement) ──── */}
      {cmpReady && (
        <div className="card p-5 mb-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold" style={{ color: "var(--bt-text-1)" }}>{t("stats.cmpTitle")}</h2>
            <span className="text-[11px]" style={{ color: "var(--bt-text-3)" }}>{t("stats.cmpSub")}</span>
          </div>
          <div className="space-y-4">
            {cmpMetrics.map((m, i) => {
              const max = Math.max(m.me, m.uni || 0, m.app || 0) || 1;
              const bars = [
                { key: "me",  label: t("stats.cmpYou"),   val: m.me,  color: "#14B885" },
                ...(m.uni != null ? [{ key: "uni", label: t("stats.cmpUni"), val: m.uni, color: "#0369a1" }] : []),
                { key: "app", label: t("stats.cmpApp"),   val: m.app, color: "#94908B" },
              ];
              const dApp = cmpDelta(m.me, m.app);
              return (
                <div key={i}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold" style={{ color: "var(--bt-text-2)" }}>{m.label}</span>
                    <span className="flex items-center gap-1.5">
                      {dApp != null && <TrendChip dir={dApp > 0 ? "up" : dApp < 0 ? "down" : "flat"} pct={Math.abs(dApp)} />}
                      {dApp != null && <span className="text-[10px]" style={{ color: "var(--bt-text-4)" }}>{t("stats.cmpVsApp")}</span>}
                    </span>
                  </div>
                  <div className="space-y-1.5">
                    {bars.map(b => (
                      <div key={b.key} className="flex items-center gap-2">
                        <span className="text-[11px] w-16 shrink-0" style={{ color: b.key === "me" ? "var(--bt-text-1)" : "var(--bt-text-3)", fontWeight: b.key === "me" ? 600 : 400 }}>{b.label}</span>
                        <div className="flex-1 h-4 rounded-md overflow-hidden" style={{ backgroundColor: "var(--bt-subtle)" }}>
                          <div className="h-full rounded-md transition-all duration-700 flex items-center justify-end pr-1.5"
                            style={{ width: `${Math.max(6, Math.round(b.val / max * 100))}%`, backgroundColor: b.color }}>
                            <span className="text-[9px] font-num font-bold tabular-nums" style={{ color: "#fff" }}>{m.fmt(b.val)}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
          <p className="text-[10px] mt-4" style={{ color: "var(--bt-text-4)" }}>{t("stats.cmpPrivacy")}</p>
        </div>
      )}

      {sessionCount === 0 && (
        <div className="card p-8 sm:p-10 flex flex-col items-center text-center">
          <span className="w-16 h-16 rounded-3xl flex items-center justify-center mb-4"
            style={{ backgroundColor: "var(--bt-accent-bg)", color: "#0E8F68" }}>
            <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3v18h18"/><rect x="7" y="12" width="3" height="6" rx="0.5"/><rect x="12" y="8" width="3" height="10" rx="0.5"/><rect x="17" y="4" width="3" height="14" rx="0.5"/></svg>
          </span>
          <h3 className="text-base font-semibold mb-1" style={{ color: "var(--bt-text-1)" }}>{t("stats.emptyChartsTitle")}</h3>
          <p className="text-sm mb-5 max-w-xs" style={{ color: "var(--bt-text-3)" }}>{t("stats.emptyChartsSub")}</p>
          <Link href="/dashboard" className="btn-primary inline-flex items-center gap-2 px-5 py-2.5 text-sm">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
            {t("stats.emptyCta")}
          </Link>
        </div>
      )}

      {/* ── Podium des cours (30 jours) ────────────────────────── */}
      {podium.length > 0 && (
        <div className="card p-5 mt-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold" style={{ color: "var(--bt-text-1)" }}>
              {t("stats.podiumTitle")}
            </h2>
            <span className="text-xs" style={{ color: "var(--bt-text-3)" }}>{t("stats.podiumSub")}</span>
          </div>
          <ul className="space-y-3">
            {podium.map((c, i) => {
              const max = podium[0].minutes || 1;
              const pct = Math.max(4, Math.round(c.minutes / max * 100));
              return (
                <li key={i} className="flex items-center gap-3">
                  <RankBadge rank={i + 1} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="flex items-center gap-2 min-w-0">
                        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: c.color }} />
                        <span className="text-sm font-medium truncate" style={{ color: "var(--bt-text-1)" }}>{c.name}</span>
                      </span>
                      <span className="text-sm font-num font-semibold tabular-nums shrink-0 ml-2" style={{ color: "#0E8F68" }}>
                        {formatMinutesShort(c.minutes * 60)}
                      </span>
                    </div>
                    <div className="w-full h-2 rounded-full overflow-hidden" style={{ backgroundColor: "var(--bt-subtle)" }}>
                      <div className="h-full rounded-full transition-all duration-700"
                        style={{ width: `${pct}%`, backgroundColor: c.color }} />
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* ── Leaderboard ─────────────────────────────────────────── */}
      <section className="card p-5 mt-6">
        {/* Title */}
        <div className="flex items-start justify-between mb-3">
          <div>
            <h2 className="text-base font-semibold" style={{ color: "var(--bt-text-1)" }}>
              {leaderMode === "friends" ? t("stats.leaderTitle") : t("stats.publicLeaderTitle")}
            </h2>
            <p className="text-xs" style={{ color: "var(--bt-text-3)" }}>
              {leaderMode === "public"
                ? (maFacActive && profile?.university
                    ? `Top 50 — ${profile.university}`
                    : (leaderPeriod === "day" ? t("stats.publicLeaderSubDay") : t("stats.publicLeaderSub")))
                : (leaderPeriod === "day" ? t("common.today") : t("stats.last7days"))
              }
            </p>
          </div>
          <div className="flex sm:hidden" style={{ backgroundColor: "var(--bt-subtle)", border: "1px solid var(--bt-border)", borderRadius: 24, padding: 3, flexShrink: 0 }}>
            {[
              { val: "day",  label: t("stats.day")  },
              { val: "week", label: t("stats.week") },
            ].map(opt => {
              const active = leaderPeriod === opt.val;
              return (
                <button key={opt.val} onClick={() => setLeaderPeriod(opt.val)}
                  style={{ borderRadius: 20, padding: "5px 14px", fontSize: 12, fontWeight: active ? 600 : 400, border: "none", cursor: "pointer", transition: "all 0.15s", backgroundColor: active ? "#14B885" : "transparent", color: active ? "#fff" : "var(--bt-text-3)", boxShadow: active ? "0 1px 4px rgba(20,184,133,0.30)" : "none" }}>
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* ── Single compact filter bar ─────────────────────────── */}
        <div className="flex items-center gap-2 mb-4 flex-wrap">

          {/* Left: Public / Amis */}
          <div style={{ display: "inline-flex", backgroundColor: "var(--bt-subtle)", border: "1px solid var(--bt-border)", borderRadius: 24, padding: 3, flexShrink: 0 }}>
            <button onClick={() => setLeaderMode("public")}
              style={{ borderRadius: 20, padding: "5px 14px", fontSize: 12, fontWeight: leaderMode === "public" ? 600 : 400, border: "none", cursor: "pointer", transition: "all 0.15s", backgroundColor: leaderMode === "public" ? "#14B885" : "transparent", color: leaderMode === "public" ? "#fff" : "var(--bt-text-3)", boxShadow: leaderMode === "public" ? "0 1px 4px rgba(20,184,133,0.30)" : "none" }}>
              {t("stats.filterPublic")}
            </button>
            {hasFriends && (
              <button onClick={() => setLeaderMode("friends")}
                style={{ borderRadius: 20, padding: "5px 14px", fontSize: 12, fontWeight: leaderMode === "friends" ? 600 : 400, border: "none", cursor: "pointer", transition: "all 0.15s", backgroundColor: leaderMode === "friends" ? "#14B885" : "transparent", color: leaderMode === "friends" ? "#fff" : "var(--bt-text-3)", boxShadow: leaderMode === "friends" ? "0 1px 4px rgba(20,184,133,0.30)" : "none" }}>
                {t("stats.filterFriends")}
              </button>
            )}
          </div>

          {/* Center: Ma fac toggle — visible only if user has a university */}
          {profile?.university && (
            <button onClick={() => setMaFacActive(f => !f)}
              className="flex items-center gap-1.5"
              style={{ borderRadius: 20, padding: "5px 12px", fontSize: 12, fontWeight: maFacActive ? 600 : 400, border: "1px solid", cursor: "pointer", transition: "all 0.15s", backgroundColor: maFacActive ? "#EAFBF4" : "transparent", color: maFacActive ? "#0E8F68" : "var(--bt-text-3)", borderColor: maFacActive ? "#C6EED9" : "var(--bt-border)", flexShrink: 0 }}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 10v6M2 10l10-5 10 5-10 5z"/>
                <path d="M6 12v5c3 3 9 3 12 0v-5"/>
              </svg>
              {t("stats.filterMyUni")}
            </button>
          )}

          {/* Right: Jour / Semaine — desktop only (mobile: in title row) */}
          <div className="hidden sm:inline-flex" style={{ backgroundColor: "var(--bt-subtle)", border: "1px solid var(--bt-border)", borderRadius: 24, padding: 3, flexShrink: 0, marginLeft: "auto" }}>
            {[
              { val: "day",  label: t("stats.day")  },
              { val: "week", label: t("stats.week") },
            ].map(opt => {
              const active = leaderPeriod === opt.val;
              return (
                <button key={opt.val} onClick={() => setLeaderPeriod(opt.val)}
                  style={{ borderRadius: 20, padding: "5px 14px", fontSize: 12, fontWeight: active ? 600 : 400, border: "none", cursor: "pointer", transition: "all 0.15s", backgroundColor: active ? "#14B885" : "transparent", color: active ? "#fff" : "var(--bt-text-3)", boxShadow: active ? "0 1px 4px rgba(20,184,133,0.30)" : "none" }}>
                  {opt.label}
                </button>
              );
            })}
          </div>

        </div>

        {/* Friends leaderboard */}
        {leaderMode === "friends" && (
          <div className="[&::-webkit-scrollbar]:hidden"
            style={{ maxHeight: "480px", overflowY: "auto", scrollbarWidth: "none" }}>
            <ul className="space-y-1.5">
              {leaderboard.map((row, i) => (
                <li key={row.id}
                  className="flex items-center gap-3 rounded-2xl px-3 py-2.5 transition-colors"
                  style={row.me ? { backgroundColor: "#EAFBF4" } : { cursor: "pointer" }}
                  onClick={() => { if (!row.me) setViewUserId(row.id); }}
                  onMouseEnter={e => { if (!row.me) e.currentTarget.style.backgroundColor = "var(--bt-subtle)"; }}
                  onMouseLeave={e => { if (!row.me) e.currentTarget.style.backgroundColor = ""; }}>
                  <RankBadge rank={i + 1} />
                  <Avatar url={row.avatar} pseudo={row.name} size={32} />
                  <span className="flex-1 text-sm font-medium truncate" style={{ color: "var(--bt-text-1)" }}>
                    {row.name}
                    {row.me && <span className="font-normal" style={{ color: "var(--bt-text-3)" }}> {t("stats.me")}</span>}
                  </span>
                  <span className="text-sm font-num font-semibold tabular-nums" style={{ color: "#0E8F68" }}>
                    {formatMinutesShort(row.secs)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Public leaderboard */}
        {leaderMode === "public" && (
          <div className="[&::-webkit-scrollbar]:hidden"
            style={{ maxHeight: "480px", overflowY: "auto", scrollbarWidth: "none" }}>
            {loadingPublic ? (
              <p className="py-6 text-center text-sm" style={{ color: "var(--bt-text-3)" }}>
                {t("common.loading")}
              </p>
            ) : (
              <ul className="space-y-1.5">
                {publicLeader.map((row, i) => {
                  const isMe = row.user_id === user?.id;
                  const name = [row.first_name, row.last_name].filter(Boolean).join(" ") || row.pseudo;
                  return (
                    <li key={row.user_id}
                      className="flex items-center gap-3 rounded-2xl px-3 py-2.5 transition-colors"
                      style={isMe ? { backgroundColor: "#EAFBF4" } : { cursor: "pointer" }}
                      onClick={() => { if (!isMe) setViewUserId(row.user_id); }}
                      onMouseEnter={e => { if (!isMe) e.currentTarget.style.backgroundColor = "var(--bt-subtle)"; }}
                      onMouseLeave={e => { if (!isMe) e.currentTarget.style.backgroundColor = ""; }}>
                      <RankBadge rank={i + 1} />
                      <Avatar url={row.avatar_url} pseudo={name} size={32} />
                      <span className="flex-1 min-w-0 text-sm font-medium" style={{ color: "var(--bt-text-1)" }}>
                        <span className="inline-flex items-center gap-1.5 max-w-full">
                          <span className="truncate">{name}</span>
                          {Number(leaderLevels[row.user_id]?.totalXP) > 0 && (
                            <LevelPill level={leaderLevels[row.user_id].current.level} />
                          )}
                        </span>
                        {isMe && <span className="font-normal" style={{ color: "var(--bt-text-3)" }}> {t("stats.me")}</span>}
                      </span>
                      <span className="text-sm font-num font-semibold tabular-nums" style={{ color: "#0E8F68" }}>
                        {formatMinutesShort(Number(row.total_seconds))}
                      </span>
                    </li>
                  );
                })}
                {publicLeader.length === 0 && (
                  <li className="py-6 text-center text-sm" style={{ color: "var(--bt-text-3)" }}>—</li>
                )}
              </ul>
            )}
          </div>
        )}
      </section>

      {/* ══ NIVEAU 2 — Analyse avancée (repliable) ══════════════ */}
      {sessionCount > 0 && (
        <div className="mt-6">
          <button onClick={toggleAdvanced}
            className="w-full card p-4 flex items-center gap-3 text-left transition-colors"
            style={{ cursor: "pointer" }}
            aria-expanded={showAdvanced}
            onMouseEnter={e => e.currentTarget.style.backgroundColor = "var(--bt-subtle)"}
            onMouseLeave={e => e.currentTarget.style.backgroundColor = ""}>
            <span className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: "var(--bt-accent-bg)", color: "#0E8F68" }}>
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3v18h18"/><path d="M18.7 8l-5.1 5.2-2.8-2.7L7 14.3"/></svg>
            </span>
            <span className="flex-1 min-w-0">
              <span className="block text-sm font-semibold" style={{ color: "var(--bt-text-1)" }}>{t("stats.advancedTitle")}</span>
              <span className="block text-xs truncate" style={{ color: "var(--bt-text-3)" }}>{t("stats.advancedSub")}</span>
            </span>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
              style={{ color: "var(--bt-text-3)", transform: showAdvanced ? "rotate(180deg)" : "none", transition: "transform 0.25s", flexShrink: 0 }}>
              <polyline points="6 9 12 15 18 9"/>
            </svg>
          </button>

          {showAdvanced && (
            <div className="mt-4 space-y-4 bt-stagger">
              {/* Graphiques détaillés */}
              <Charts
                dailyData={dailyData}
                byCourseWeek={byCourse7}
                byCourseMonth={byCourse30}
                weekLabel={weekLabel(weekDates, lang)}
                onPrev={() => setWeekOffset(o => Math.max(-3, o - 1))}
                onNext={() => setWeekOffset(o => Math.min(0, o + 1))}
                canPrev={weekOffset > -3}
                canNext={weekOffset < 0}
                chartTitle={t("stats.chartTitle")}
                courseChartTitle={t("stats.chartCourses")}
                noDataText={t("stats.chartNoData")}
                unitMinLabel={t("stats.unitMin")}
                unitHrLabel={t("stats.unitHrs")}
                weekToggleLabel={t("stats.week")}
                monthToggleLabel={t("stats.month")}
                csvLabel={t("stats.exportCsv")}
              />

              {/* Habitudes + Performances/Records */}
              {insights.hasData && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {/* Habitudes */}
                  <div className="card p-5">
                    <h2 className="text-sm font-semibold mb-4" style={{ color: "var(--bt-text-1)" }}>{t("stats.habitsTitle")}</h2>
                    <p className="text-[11px] font-semibold uppercase tracking-wide mb-2" style={{ color: "var(--bt-text-3)" }}>{t("stats.habitsWhen")}</p>
                    <div className="space-y-2 mb-4">
                      {slots.map(s => {
                        const p = insights.timeOfDayPct[s.key];
                        return (
                          <div key={s.key} className="flex items-center gap-2.5">
                            <span className="text-xs w-16 shrink-0" style={{ color: "var(--bt-text-2)" }}>{s.label}</span>
                            <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ backgroundColor: "var(--bt-subtle)" }}>
                              <div className="h-full rounded-full transition-all duration-700" style={{ width: `${p}%`, backgroundColor: s.color }} />
                            </div>
                            <span className="text-xs font-num font-semibold tabular-nums w-9 text-right shrink-0" style={{ color: "var(--bt-text-1)" }}>{p}%</span>
                          </div>
                        );
                      })}
                    </div>
                    <div className="pt-2" style={{ borderTop: "1px solid var(--bt-border)" }}>
                      <InsightRow icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>}
                        label={t("stats.habitPreferredDay")} value={weekdayName(insights.bestWeekday, lang)} />
                      <InsightRow icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15 14"/></svg>}
                        label={t("stats.habitAvgSession")} value={formatMinutesShort(insights.avgSessionSecs)} />
                      <InsightRow icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M5 22h14M5 2h14M17 2v5a5 5 0 0 1-10 0V2M7 22v-5a5 5 0 0 1 10 0v5"/></svg>}
                        label={t("stats.habitAvgStart")} value={formatClock(insights.avgStartMinutes, lang)} />
                    </div>
                  </div>

                  {/* Performances + Records */}
                  <div className="card p-5">
                    <h2 className="text-sm font-semibold mb-2" style={{ color: "var(--bt-text-1)" }}>{t("stats.perfTitle")}</h2>
                    <div className="mb-3">
                      <InsightRow icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>}
                        label={t("stats.perfProductiveDay")} value={weekdayName(insights.bestWeekday, lang)} />
                      <InsightRow icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15 14"/></svg>}
                        label={t("stats.perfProductiveHour")}
                        value={insights.mostProductiveHour == null ? "—" : t("stats.hourRange").replace("{h}", String(insights.mostProductiveHour)).replace("{h2}", String((insights.mostProductiveHour + 1) % 24))} />
                      <InsightRow icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polyline points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>}
                        label={t("stats.perfLongest")} value={formatMinutesShort(insights.longestSessionSecs)} />
                      <InsightRow icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/><path d="M4 22h16"/></svg>}
                        label={t("stats.perfBestDay")} value={formatMinutesShort(insights.bestDaySecs)} />
                    </div>
                    <p className="text-[11px] font-semibold uppercase tracking-wide mb-1 pt-3" style={{ color: "var(--bt-text-3)", borderTop: "1px solid var(--bt-border)" }}>{t("stats.recordsTitle")}</p>
                    <div className="grid grid-cols-2 gap-x-4">
                      <InsightRow icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/></svg>}
                        label={t("stats.recLongestStreak")} value={`${bestStreak} ${t("stats.dayUnit")}`} />
                      <InsightRow icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M3 10h18"/></svg>}
                        label={t("stats.recBestWeek")} value={formatMinutesShort(insights.bestWeekSecs)} />
                      <InsightRow icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 2 7 12 12 22 7 12 2"/></svg>}
                        label={t("stats.recBestMonth")} value={formatMinutesShort(insights.bestMonthSecs)} />
                      <InsightRow icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="6"/><path d="M15.477 12.89 17 22l-5-3-5 3 1.523-9.11"/></svg>}
                        label={t("stats.recTotal")} value={formatMinutesShort(allTimeSecs)} />
                    </div>
                  </div>
                </div>
              )}

              {/* Badges statistiques */}
              {insights.hasData && (
                <div className="card p-5">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-sm font-semibold" style={{ color: "var(--bt-text-1)" }}>{t("stats.badgesTitle")}</h2>
                    <span className="text-xs font-num tabular-nums px-2 py-0.5 rounded-full" style={{ backgroundColor: "var(--bt-accent-bg)", color: "#0E8F68" }}>
                      {t("stats.badgesEarned").replace("{n}", String(earnedBadges)).replace("{total}", String(badgeDefs.length))}
                    </span>
                  </div>
                  <div className="grid grid-cols-3 sm:grid-cols-5 lg:grid-cols-9 gap-3">
                    {badgeDefs.map(b => (
                      <StatBadge key={b.id} earned={!!insights.badges[b.id]} label={b.label} icon={iconOf[b.id]} />
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
      </div>

      {viewUserId && (
        <UserProfileModal userId={viewUserId} onClose={() => setViewUserId(null)} />
      )}
    </Layout>
  );
}
