import { useEffect, useState, useCallback } from "react";
import dynamic from "next/dynamic";
import Layout, { Avatar } from "../components/Layout";
import UserProfileModal from "../components/UserProfileModal";
import StudyHeatmap from "../components/StudyHeatmap";
import { useAuth } from "../contexts/AuthContext";
import { useI18n } from "../contexts/I18nContext";
import { supabase } from "../lib/supabaseClient";
import { formatMinutesShort, lastNDates, getWeekDates, displayName, todayISO, computeStreak, computeBestStreak } from "../lib/format";
import { loadUserLevelMap } from "../lib/userLevels";
import LevelPill from "../components/LevelPill";

const Charts = dynamic(() => import("../components/StatsCharts"), { ssr: false });

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

// Mini-carte de stat partagée — fond vert pastel très léger + bordure verte
// subtile (dark-safe via var(--bt-accent-border)) + chip d'icône coloré.
function StatTile({ icon, chip, label, value, sub, subColor, spanFull }) {
  return (
    <div className={`rounded-2xl p-3.5 ${spanFull ? "col-span-2 sm:col-span-1" : ""}`}
      style={{ backgroundColor: "rgba(20,184,133,0.06)", border: "1px solid var(--bt-accent-border)" }}>
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
      <p className="text-[20px] sm:text-[22px] font-display leading-none tabular-nums"
        style={{ color: "var(--bt-text-1)" }}>
        {value}
      </p>
      {sub && (
        <p className="text-[11px] leading-tight font-medium mt-1.5 truncate" style={{ color: subColor }}>
          {sub}
        </p>
      )}
    </div>
  );
}

export default function Stats() {
  const { user, profile } = useAuth();
  const { t, lang } = useI18n();
  const [courses, setCourses]   = useState([]);
  const [sessions, setSessions] = useState([]);
  const [allTimeSecs, setAllTimeSecs] = useState(0);

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

  const todayLabel = new Date().toLocaleDateString(
    lang === "en" ? "en-GB" : "fr-FR", { weekday: "short", day: "numeric", month: "short" });

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

  const medal = ["🥇", "🥈", "🥉"];
  const hasFriends = acceptedIds.length > 0;

  // ── Percentile ────────────────────────────────────────────────
  const pct = myRank?.total_active > 0 && Number(myRank?.my_secs) > 0
    ? Math.max(1, Math.ceil(Number(myRank.better_count) / Number(myRank.total_active) * 100))
    : null;

  return (
    <Layout>
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
              chip: { bg: "rgba(20,184,133,0.14)", color: "#14B885" },
              label: t("stats.compactToday"),
              value: formatMinutesShort(todaySecs),
              sub: todayLabel,
              subColor: "var(--bt-text-3)",
            },
            {
              icon: (
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>
                </svg>
              ),
              chip: { bg: "rgba(20,184,133,0.14)", color: "#14B885" },
              label: t("stats.compactWeek"),
              value: formatMinutesShort(currentWeekSecs),
              sub: weekDeltaPct === null
                ? t("stats.weekNoCompare")
                : weekDeltaPct > 0 ? t("stats.weekUpPct").replace("{n}", String(weekDeltaPct))
                : weekDeltaPct < 0 ? t("stats.weekDownPct").replace("{n}", String(weekDeltaPct))
                : t("stats.weekSamePct"),
              subColor: weekDeltaPct > 0 ? "#14B885" : weekDeltaPct < 0 ? "#DC2626" : "var(--bt-text-3)",
            },
            {
              icon: (
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/>
                </svg>
              ),
              chip: { bg: "rgba(20,184,133,0.14)", color: "#14B885" },
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
              chip: { bg: "rgba(20,184,133,0.14)", color: "#14B885" },
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
                  chip: { bg: "rgba(217,119,6,0.15)", color: "#D97706" },
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
                  chip: { bg: "rgba(3,105,161,0.13)", color: "#0369a1" },
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
                  chip: { bg: "rgba(20,184,133,0.14)", color: "#14B885" },
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

      {/* ── Heatmap ────────────────────────────────────────────── */}
      <div className="card p-5 mb-4">
        <h2 className="text-sm font-semibold mb-3" style={{ color: "var(--bt-text-2)" }}>
          {t("heatmap.title")}
        </h2>
        <StudyHeatmap sessions={sessions} />
      </div>

      {/* ── Percentile ─────────────────────────────────────────── */}
      <div className="mb-4 relative overflow-hidden rounded-2xl px-5 py-4"
        style={{
          background: "linear-gradient(135deg, #0A7A5A 0%, #14B885 60%, #20D998 100%)",
          boxShadow: "0 6px 24px rgba(20,184,133,0.30)",
        }}>
        {/* Decorative blobs */}
        <div style={{ position: "absolute", right: -16, top: -24, width: 110, height: 110, borderRadius: "50%", background: "rgba(255,255,255,0.10)", pointerEvents: "none" }} />
        <div style={{ position: "absolute", right: 55, bottom: -36, width: 80, height: 80, borderRadius: "50%", background: "rgba(255,255,255,0.07)", pointerEvents: "none" }} />
        <div className="flex items-center gap-4 relative">
          {/* Trophy */}
          <div className="flex-shrink-0 w-11 h-11 rounded-xl flex items-center justify-center"
            style={{ background: "rgba(255,255,255,0.20)" }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
                <p className="text-white font-bold leading-tight" style={{ fontSize: "clamp(0.9rem,4vw,1.05rem)" }}>
                  {t("stats.percentilePre")}{" "}
                  <span style={{ fontSize: "clamp(1.25rem,6vw,1.5rem)" }}>{pct}%</span>
                </p>
                <p className="mt-0.5 leading-snug" style={{ color: "rgba(255,255,255,0.82)", fontSize: "clamp(0.7rem,3vw,0.78rem)" }}>
                  {t("stats.percentilePost")}
                </p>
              </>
            ) : (
              <>
                <p className="text-white font-bold leading-tight" style={{ fontSize: "clamp(0.9rem,4vw,1.05rem)" }}>
                  {t("stats.percentileNoData")}
                </p>
                <p className="mt-0.5 leading-snug" style={{ color: "rgba(255,255,255,0.82)", fontSize: "clamp(0.7rem,3vw,0.78rem)" }}>
                  {t("stats.percentileNoDataSub")}
                </p>
              </>
            )}
          </div>
        </div>
      </div>

      {sessionCount === 0 ? (
        <div className="card p-10 text-center text-sm" style={{ color: "#A8A09A" }}>
          {t("stats.empty")}
        </div>
      ) : (
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
        />
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
                  <span className="w-6 text-center text-lg shrink-0">{["🥇", "🥈", "🥉"][i]}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="flex items-center gap-2 min-w-0">
                        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: c.color }} />
                        <span className="text-sm font-medium truncate" style={{ color: "var(--bt-text-1)" }}>{c.name}</span>
                      </span>
                      <span className="text-sm font-semibold tabular-nums shrink-0 ml-2" style={{ color: "#0E8F68" }}>
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
                  <span className="w-6 text-center text-sm font-bold" style={{ color: "var(--bt-text-3)" }}>
                    {medal[i] || i + 1}
                  </span>
                  <Avatar url={row.avatar} pseudo={row.name} size={32} />
                  <span className="flex-1 text-sm font-medium truncate" style={{ color: "var(--bt-text-1)" }}>
                    {row.name}
                    {row.me && <span className="font-normal" style={{ color: "var(--bt-text-3)" }}> {t("stats.me")}</span>}
                  </span>
                  <span className="text-sm font-semibold tabular-nums" style={{ color: "#0E8F68" }}>
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
                      <span className="w-6 text-center text-sm font-bold" style={{ color: "var(--bt-text-3)" }}>
                        {medal[i] || i + 1}
                      </span>
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
                      <span className="text-sm font-semibold tabular-nums" style={{ color: "#0E8F68" }}>
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

      {viewUserId && (
        <UserProfileModal userId={viewUserId} onClose={() => setViewUserId(null)} />
      )}
    </Layout>
  );
}
