import { useEffect, useState, useCallback } from "react";
import dynamic from "next/dynamic";
import Layout, { Avatar } from "../components/Layout";
import UserProfileModal from "../components/UserProfileModal";
import StudyHeatmap from "../components/StudyHeatmap";
import { useAuth } from "../contexts/AuthContext";
import { useI18n } from "../contexts/I18nContext";
import { supabase } from "../lib/supabaseClient";
import { formatMinutesShort, lastNDates, getWeekDates, displayName, todayISO } from "../lib/format";
import { getLevelInfo } from "../lib/xp";
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

export default function Stats() {
  const { user, profile, refreshProfile } = useAuth();
  const { t, lang } = useI18n();
  const [courses, setCourses]   = useState([]);
  const [sessions, setSessions] = useState([]);

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
  const [loadingPublic, setLoadingPublic] = useState(false);
  const [myRank,        setMyRank]        = useState(null);
  const [maFacActive,   setMaFacActive]   = useState(false);

  // ── Goals ─────────────────────────────────────────────────────
  const [editGoals, setEditGoals]     = useState(false);
  const [weekGoal,  setWeekGoal]      = useState("");
  const [monthGoal, setMonthGoal]     = useState("");

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
      setPublicLeader(data || []);
      setLoadingPublic(false);
    })();
  }, [user, leaderPeriod, leaderMode, maFacActive, profile?.university]);

  // ── Sync goals from profile ────────────────────────────────────
  useEffect(() => {
    if (profile) {
      const wkH = profile.goal_weekly_minutes ? profile.goal_weekly_minutes / 60 : "";
      const moH = profile.goal_monthly_minutes ? profile.goal_monthly_minutes / 60 : "";
      setWeekGoal(wkH === "" ? "" : String(Number.isInteger(wkH) ? wkH : parseFloat(wkH.toFixed(1))));
      setMonthGoal(moH === "" ? "" : String(Number.isInteger(moH) ? moH : parseFloat(moH.toFixed(1))));
    }
  }, [profile]);

  async function saveGoals() {
    const wk = Math.round((parseFloat(weekGoal) || 0) * 60);
    const mo = Math.round((parseFloat(monthGoal) || 0) * 60);
    await supabase.from("profiles").update({
      goal_weekly_minutes: wk,
      goal_monthly_minutes: mo,
    }).eq("id", user.id);
    setEditGoals(false);
    refreshProfile();
  }

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

  // Compact stat items
  const compactStats = [
    { label: t("stats.compactToday"),   value: formatMinutesShort(todaySecs) },
    { label: t("stats.compactWeek"),    value: formatMinutesShort(currentWeekSecs) },
    { label: t("stats.compactMonth"),   value: formatMinutesShort(total30) },
    { label: t("stats.compactAvg7d"),   value: formatMinutesShort(avgPerDay) },
  ];

  return (
    <Layout>
      <h1 className="text-2xl mb-0.5" style={{ color: "var(--bt-text-1)" }}>{t("stats.title")}</h1>
      <p className="text-sm mb-4" style={{ color: "var(--bt-text-2)" }}>{t("stats.subtitle")}</p>

      {/* ── Compact stats card ─────────────────────────────────── */}
      {/* Mobile  : 2×2 grid (items 0-1 top row, items 2-3 bottom row)
          sm (640+): 4-column single row                              */}
      <div className="card mb-4 overflow-hidden">
        <div className="grid grid-cols-2 sm:grid-cols-4">
          {compactStats.map((s, i) => {
            // Border classes: left border for right-column items; top border for bottom-row items (mobile only)
            const borderClass = [
              "",                                  // 0: top-left, no border
              "border-l",                          // 1: top-right, left border always
              "border-t sm:border-t-0 sm:border-l", // 2: bottom-left on mobile / right of center on sm
              "border-t sm:border-t-0 border-l",   // 3: bottom-right, left+top on mobile, left on sm
            ][i];
            return (
              <div key={i}
                className={`flex flex-col items-center text-center py-4 px-3 ${borderClass}`}
                style={{ borderColor: "var(--bt-border)" }}>
                <p className="text-[10px] font-semibold uppercase tracking-wide leading-none mb-2 whitespace-nowrap"
                  style={{ color: "var(--bt-text-3)" }}>
                  {s.label}
                </p>
                <p className="text-[17px] font-display leading-none tabular-nums"
                  style={{ color: "var(--bt-text-1)" }}>
                  {s.value}
                </p>
              </div>
            );
          })}
        </div>
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

      {/* ── Goals ──────────────────────────────────────────────── */}
      <div className="card p-5 mt-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-semibold" style={{ color: "var(--bt-text-1)" }}>
            {t("goal.title")}
          </h2>
          <button
            onClick={() => {
              const wkH = profile?.goal_weekly_minutes ? profile.goal_weekly_minutes / 60 : "";
              const moH = profile?.goal_monthly_minutes ? profile.goal_monthly_minutes / 60 : "";
              setWeekGoal(wkH === "" ? "" : String(Number.isInteger(wkH) ? wkH : parseFloat(wkH.toFixed(1))));
              setMonthGoal(moH === "" ? "" : String(Number.isInteger(moH) ? moH : parseFloat(moH.toFixed(1))));
              setEditGoals(g => !g);
            }}
            className="text-xs font-semibold px-2.5 py-1 rounded-xl transition-all"
            style={{ backgroundColor: "var(--bt-subtle)", color: "var(--bt-text-2)", border: "1px solid var(--bt-border)" }}>
            {editGoals ? t("common.cancel") : t("goal.edit")}
          </button>
        </div>

        {editGoals ? (
          <div className="space-y-3">
            <div>
              <label className="text-xs font-semibold uppercase tracking-wide block mb-1.5" style={{ color: "var(--bt-text-3)" }}>
                {t("goal.weeklyGoal")} ({t("goal.minPerWeek")})
              </label>
              <input
                type="number"
                min={0}
                max={168}
                step={0.5}
                placeholder="Ex : 10"
                value={weekGoal}
                onChange={e => setWeekGoal(e.target.value)}
                className="input"
              />
            </div>
            <div>
              <label className="text-xs font-semibold uppercase tracking-wide block mb-1.5" style={{ color: "var(--bt-text-3)" }}>
                {t("goal.monthlyGoal")} ({t("goal.minPerMonth")})
              </label>
              <input
                type="number"
                min={0}
                max={744}
                step={0.5}
                placeholder="Ex : 40"
                value={monthGoal}
                onChange={e => setMonthGoal(e.target.value)}
                className="input"
              />
            </div>
            <button onClick={saveGoals} className="btn-primary w-full">{t("goal.save")}</button>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Weekly */}
            {profile?.goal_weekly_minutes > 0 ? (
              <div>
                <div className="flex justify-between text-xs mb-1.5" style={{ color: "var(--bt-text-2)" }}>
                  <span className="font-medium">{t("goal.weeklyGoal")}</span>
                  <span>
                    {formatMinutesShort(currentWeekSecs)} / {formatMinutesShort(profile.goal_weekly_minutes * 60)}
                    <span className="ml-1.5 font-semibold" style={{ color: "#14B885" }}>
                      {Math.min(100, Math.round(currentWeekSecs / 60 / profile.goal_weekly_minutes * 100))}%
                    </span>
                  </span>
                </div>
                <div className="w-full h-2 rounded-full overflow-hidden" style={{ backgroundColor: "var(--bt-subtle)" }}>
                  <div className="h-full rounded-full transition-all duration-700" style={{
                    width: `${Math.min(100, Math.round(currentWeekSecs / 60 / profile.goal_weekly_minutes * 100))}%`,
                    backgroundColor: "#14B885",
                  }} />
                </div>
              </div>
            ) : (
              <p className="text-xs" style={{ color: "var(--bt-text-3)" }}>{t("goal.weeklyGoal")} — —</p>
            )}
            {/* Monthly */}
            {profile?.goal_monthly_minutes > 0 ? (
              <div>
                <div className="flex justify-between text-xs mb-1.5" style={{ color: "var(--bt-text-2)" }}>
                  <span className="font-medium">{t("goal.monthlyGoal")}</span>
                  <span>
                    {formatMinutesShort(total30)} / {formatMinutesShort(profile.goal_monthly_minutes * 60)}
                    <span className="ml-1.5 font-semibold" style={{ color: "#14B885" }}>
                      {Math.min(100, Math.round(total30 / 60 / profile.goal_monthly_minutes * 100))}%
                    </span>
                  </span>
                </div>
                <div className="w-full h-2 rounded-full overflow-hidden" style={{ backgroundColor: "var(--bt-subtle)" }}>
                  <div className="h-full rounded-full transition-all duration-700" style={{
                    width: `${Math.min(100, Math.round(total30 / 60 / profile.goal_monthly_minutes * 100))}%`,
                    backgroundColor: "#14B885",
                  }} />
                </div>
              </div>
            ) : (
              <p className="text-xs" style={{ color: "var(--bt-text-3)" }}>{t("goal.monthlyGoal")} — —</p>
            )}
            {!profile?.goal_weekly_minutes && !profile?.goal_monthly_minutes && (
              <button
                onClick={() => setEditGoals(true)}
                className="text-sm font-medium transition-colors"
                style={{ color: "#14B885" }}>
                + {t("goal.setGoals")}
              </button>
            )}
          </div>
        )}
      </div>

      {/* ── Leaderboard ─────────────────────────────────────────── */}
      <section className="card p-5 mt-6">
        {/* Title */}
        <div className="flex items-center justify-between mb-3">
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
                          {Number(row.alltime_seconds ?? row.total_seconds) > 0 && (
                            <LevelPill level={getLevelInfo(Math.floor(Number(row.alltime_seconds ?? row.total_seconds) / 60)).current.level} />
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
