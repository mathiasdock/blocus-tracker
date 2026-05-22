import { useEffect, useState, useCallback, useRef } from "react";
import Layout from "../components/Layout";
import { useAuth } from "../contexts/AuthContext";
import { useTimer } from "../contexts/TimerContext";
import { useI18n } from "../contexts/I18nContext";
import { supabase } from "../lib/supabaseClient";
import { formatDuration, formatMinutesShort, todayISO, computeStreak, computeBestStreak } from "../lib/format";
import { notifyXPChanged } from "../lib/xpEvents";
import { clearClientCache, getClientCache, setClientCache } from "../lib/clientCache";

function daysUntilExam(dateStr) {
  if (!dateStr) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const exam = new Date(dateStr + "T12:00:00");
  return Math.round((exam - today) / 86400000);
}

const DAILY_GOAL_SECS = 7200; // 2 hours
const POMO_WORK_OPTIONS  = [15, 20, 25, 30, 45, 50, 60];
const POMO_BREAK_OPTIONS = [3, 5, 10, 15];

const COLORS = [
  "#10b981", "#84cc16", "#14b8a6", "#0ea5e9",
  "#06b6d4", "#2563eb", "#6366f1", "#8b5cf6",
  "#7c3aed", "#d946ef", "#ec4899", "#f43f5e",
  "#ef4444", "#be123c", "#f97316", "#f59e0b",
];

export default function Dashboard() {
  const { user } = useAuth();
  const { t } = useI18n();
  const {
    courseId,
    setCourseId,
    note,
    setNote,
    running,
    elapsed,
    start,
    pause,
    reset,
  } = useTimer();
  const [courses, setCourses] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [streak, setStreak] = useState(0);
  const [bestStreak, setBestStreak] = useState(0);
  const [focusMode, setFocusMode] = useState(false);
  const [todayObjectives, setTodayObjectives] = useState([]);
  const [newCourse, setNewCourse] = useState("");
  const [newColor, setNewColor] = useState(COLORS[0]);
  const [saveStatus, setSaveStatus] = useState("idle"); // "idle"|"saving"|"success"|"error"
  const savingRef = useRef(false);
  const [editingSessionId, setEditingSessionId] = useState(null);
  const [editMinutes, setEditMinutes] = useState("");
  const [editCourseId, setEditCourseId] = useState(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [editingExamId, setEditingExamId] = useState(null);
  const [examDateInput, setExamDateInput] = useState("");
  const [completionToast, setCompletionToast] = useState(null);
  const [toastVisible, setToastVisible] = useState(false);
  const [showCourseMenu, setShowCourseMenu] = useState(false);

  // Pomodoro
  const [pomodoro, setPomodoro]     = useState(false);
  const [pomoPhase, setPomoPhase]   = useState("work"); // "work" | "break"
  const [pomoCount, setPomoCount]   = useState(0);
  const [pomoWorkMin,  setPomoWorkMin]  = useState(25);
  const [pomoBreakMin, setPomoBreakMin] = useState(5);
  const pomoHandled = useRef(false);

  const POMO_WORK  = pomoWorkMin  * 60;
  const POMO_BREAK = pomoBreakMin * 60;
  const dashboardCachePrefix = user ? `dashboard:${user.id}:` : "";

  const applyDashboardData = useCallback((data) => {
    const c = data.courses || [];
    setCourses(c);
    setCourseId(current => current || c[0]?.id || "");
    setSessions(data.sessions || []);
    setStreak(computeStreak(data.recentSessions || []));
    setBestStreak(computeBestStreak(data.recentSessions || []));
    setTodayObjectives(data.objectives || []);
  }, [setCourseId]);

  const clearDashboardCache = useCallback(() => {
    if (dashboardCachePrefix) clearClientCache(dashboardCachePrefix);
  }, [dashboardCachePrefix]);

  const load = useCallback(async () => {
    if (!user) return;
    const cacheKey = `${dashboardCachePrefix}${todayISO()}`;
    const cached = getClientCache(cacheKey);
    if (cached) {
      applyDashboardData(cached);
      return;
    }

    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

    const [coursesRes, sessionsRes, recentRes, objectivesRes] = await Promise.all([
      supabase
        .from("courses")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at"),
      supabase
        .from("sessions")
        .select("*")
        .eq("user_id", user.id)
        .gte("started_at", todayISO())
        .order("started_at", { ascending: false }),
      supabase
        .from("sessions")
        .select("started_at")
        .eq("user_id", user.id)
        .gte("started_at", ninetyDaysAgo.toISOString()),
      supabase
        .from("objectives")
        .select("*")
        .eq("user_id", user.id)
        .eq("scheduled_date", todayISO())
        .order("done"),
    ]);

    const data = {
      courses: coursesRes.data || [],
      sessions: sessionsRes.data || [],
      recentSessions: recentRes.data || [],
      objectives: objectivesRes.data || [],
    };
    setClientCache(cacheKey, data, 45000);
    applyDashboardData(data);
  }, [applyDashboardData, dashboardCachePrefix, user]);

  async function toggleObjective(o) {
    const { data } = await supabase
      .from("objectives")
      .update({ done: !o.done })
      .eq("id", o.id)
      .select()
      .single();
    if (data) {
      clearDashboardCache();
      setTodayObjectives((prev) => prev.map((x) => (x.id === o.id ? data : x)));
      notifyXPChanged();
    }
  }

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!focusMode) return;
    function handler(e) { if (e.key === "Escape") setFocusMode(false); }
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [focusMode]);

  // ── Pomodoro auto-transition ────────────────────────────────
  useEffect(() => {
    if (!pomodoro || !running || pomoHandled.current) return;
    const target = pomoPhase === "work" ? POMO_WORK : POMO_BREAK;
    if (elapsed < target) { pomoHandled.current = false; return; }
    pomoHandled.current = true;

    if (pomoPhase === "work") {
      const secs = Math.min(elapsed, POMO_WORK);
      const startedAt = new Date(Date.now() - secs * 1000).toISOString();
      pause();
      reset();
      supabase.from("sessions").insert({
        user_id: user.id, course_id: courseId, duration_seconds: secs,
        note: note || null, started_at: startedAt, ended_at: new Date().toISOString(),
      }).then(() => {
        clearDashboardCache();
        notifyXPChanged();
        load();
      });
      setPomoPhase("break");
      setPomoCount(c => c + 1);
      setTimeout(() => { start(); pomoHandled.current = false; }, 80);
    } else {
      pause();
      reset();
      setPomoPhase("work");
      pomoHandled.current = false;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [elapsed, pomodoro, running, pomoPhase]);

  async function stopAndSave() {
    if (savingRef.current) return;
    const seconds = elapsed;
    if (running) pause();
    if (seconds < 1) { reset(); return; }

    savingRef.current = true;
    setSaveStatus("saving");

    const startedAt = new Date(Date.now() - seconds * 1000).toISOString();
    const endedAt   = new Date().toISOString();
    const { data: inserted, error } = await supabase.from("sessions").insert({
      user_id:          user.id,
      course_id:        courseId,
      duration_seconds: seconds,
      note:             note || null,
      started_at:       startedAt,
      ended_at:         endedAt,
    }).select().single();

    savingRef.current = false;

    if (error) {
      setSaveStatus("error");
      setTimeout(() => setSaveStatus("idle"), 3000);
      return;
    }

    const currentTotal = sessions.reduce((a, s) => a + s.duration_seconds, 0);
    const newGoalPct = Math.min(100, Math.round(((currentTotal + seconds) / DAILY_GOAL_SECS) * 100));
    const xpGained = Math.floor(seconds / 60);

    // Optimistic update — show session immediately without waiting for reload
    if (inserted) {
      clearDashboardCache();
      setSessions(prev => [inserted, ...prev]);
      notifyXPChanged();
    }
    reset();
    setSaveStatus("success");
    setTimeout(() => setSaveStatus("idle"), 2500);

    setCompletionToast({ durationSecs: seconds, goalPct: newGoalPct, xpGained });
    setToastVisible(false);
    setTimeout(() => setToastVisible(true), 50);
    setTimeout(() => {
      setToastVisible(false);
      setTimeout(() => setCompletionToast(null), 350);
    }, 4000);

    // Refresh streak / goal counters in background
    load();
  }

  async function updateExamDate(courseId, examDate) {
    clearDashboardCache();
    await supabase.from("courses").update({ exam_date: examDate || null }).eq("id", courseId);
    setCourses(prev => prev.map(c => c.id === courseId ? { ...c, exam_date: examDate || null } : c));
  }

  async function deleteSession(id) {
    clearDashboardCache();
    await supabase.from("sessions").delete().eq("id", id);
    setSessions(prev => prev.filter(s => s.id !== id));
  }

  async function updateSession(session) {
    const newMins = parseInt(editMinutes, 10);
    const maxMins = Math.floor(session.duration_seconds / 60);
    if (isNaN(newMins) || newMins < 1 || newMins > maxMins) return;
    const newSecs = newMins * 60;
    clearDashboardCache();
    await supabase.from("sessions").update({
      duration_seconds: newSecs,
      course_id: editCourseId || null,
    }).eq("id", session.id);
    setSessions(prev => prev.map(s => s.id === session.id
      ? { ...s, duration_seconds: newSecs, course_id: editCourseId || null }
      : s
    ));
    setEditingSessionId(null);
  }

  async function addCourse(e) {
    e.preventDefault();
    const name = newCourse.trim();
    if (!name) return;
    const { data } = await supabase
      .from("courses")
      .insert({ user_id: user.id, name, color: newColor })
      .select()
      .single();
    setNewCourse("");
    if (data) {
      clearDashboardCache();
      setCourses((prev) => [...prev, data]);
      setCourseId(data.id);
    }
  }

  async function deleteCourse(id) {
    clearDashboardCache();
    await supabase.from("courses").delete().eq("id", id);
    setCourses((prev) => prev.filter((c) => c.id !== id));
    if (courseId === id) setCourseId("");
  }

  // La carte du chrono devient rouge quand le chrono est en pause (démarré mais arrêté)
  const isPaused = !running && elapsed > 0;

  const totalToday = sessions.reduce((a, s) => a + s.duration_seconds, 0);
  const goalPct = Math.min(100, Math.round((totalToday / DAILY_GOAL_SECS) * 100));
  const perCourse = courses.map((c) => ({
    ...c,
    secs: sessions
      .filter((s) => s.course_id === c.id)
      .reduce((a, s) => a + s.duration_seconds, 0),
  }));
  const courseName = (id) => courses.find((c) => c.id === id)?.name || "—";

  return (
    <Layout>
      {/* Backdrop pour fermer le menu cours */}
      {showCourseMenu && (
        <div className="fixed inset-0 z-10" onClick={() => setShowCourseMenu(false)} />
      )}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3 min-w-0">

        {/* ══════════════════════════════════════════
            SECTION 1 — Chronomètre
        ══════════════════════════════════════════ */}
        <section className="card lg:col-span-2 min-w-0 transition-all duration-300 overflow-hidden"
          style={{
            backgroundColor: isPaused ? "rgba(239,68,68,0.06)" : "var(--bt-surface)",
            borderColor:     isPaused ? "rgba(239,68,68,0.35)" : "var(--bt-border)",
            boxShadow:       isPaused ? "0 4px 32px rgba(239,68,68,0.10)" : "0 4px 32px var(--bt-shadow)",
          }}>

          {/* ── Header ── */}
          <div className="flex flex-col items-center pt-8 pb-2 px-6">
            {/* Icône */}
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4"
              style={{ backgroundColor: "var(--bt-accent-bg)", border: "1px solid var(--bt-accent-border)" }}>
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#14B885" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2.5"/><path d="M9.5 3h5M12 3v2"/>
              </svg>
            </div>
            <h1 className="text-[22px] text-center mb-1" style={{ color: "var(--bt-text-1)" }}>{t("dash.title")}</h1>
            <p className="text-sm text-center" style={{ color: "var(--bt-text-3)" }}>{t("dash.subtitle")}</p>
          </div>

          {/* ── Mode toggle ── */}
          <div className="px-6 pt-5 pb-0">
            <div className="flex items-center gap-2 rounded-2xl p-1.5"
              style={{ backgroundColor: "var(--bt-subtle)", border: "1px solid var(--bt-border)" }}>
              {/* Mode focus */}
              <button
                onClick={() => setFocusMode(true)}
                className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-sm font-medium transition-all"
                style={{ color: "var(--bt-text-3)", backgroundColor: "transparent" }}
                onMouseEnter={e => { e.currentTarget.style.backgroundColor = "var(--bt-surface)"; e.currentTarget.style.color = "var(--bt-text-2)"; }}
                onMouseLeave={e => { e.currentTarget.style.backgroundColor = "transparent"; e.currentTarget.style.color = "var(--bt-text-3)"; }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/>
                </svg>
                <span className="hidden xs:inline">{t("dash.focusMode")}</span>
                <span className="xs:hidden">Focus</span>
              </button>
              {/* Libre */}
              <button
                onClick={() => { setPomodoro(false); if (running) { pause(); reset(); } setPomoPhase("work"); setPomoCount(0); }}
                className="flex-1 py-2 rounded-xl text-sm font-semibold transition-all"
                style={!pomodoro ? {
                  backgroundColor: "var(--bt-surface)",
                  color: "var(--bt-text-1)",
                  boxShadow: "0 1px 6px var(--bt-shadow)",
                } : {
                  backgroundColor: "transparent",
                  color: "var(--bt-text-3)",
                }}>
                {t("dash.free")}
              </button>
              {/* Pomodoro */}
              <button
                onClick={() => { setPomodoro(true); if (running) { pause(); reset(); } setPomoPhase("work"); setPomoCount(0); pomoHandled.current = false; }}
                className="flex-1 py-2 rounded-xl text-sm font-semibold transition-all"
                style={pomodoro ? {
                  backgroundColor: "#14B885",
                  color: "#fff",
                  boxShadow: "0 2px 8px rgba(20,184,133,0.30)",
                } : {
                  backgroundColor: "transparent",
                  color: "var(--bt-text-3)",
                }}>
                Pomodoro
              </button>
            </div>
          </div>

          {/* ── Pomodoro settings ── */}
          {pomodoro && !running && (
            <div className="mx-6 mt-4 space-y-3 rounded-2xl p-4"
              style={{ backgroundColor: "var(--bt-subtle)", border: "1px solid var(--bt-border)" }}>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: "var(--bt-text-3)" }}>{t("dash.workDuration")}</p>
                <div className="flex flex-wrap gap-1.5">
                  {POMO_WORK_OPTIONS.map(m => (
                    <button key={m} type="button"
                      onClick={() => { setPomoWorkMin(m); pomoHandled.current = false; }}
                      className="px-3 py-1 rounded-full text-xs font-semibold transition-all"
                      style={pomoWorkMin === m
                        ? { backgroundColor: "#14B885", color: "#fff", boxShadow: "0 2px 6px rgba(20,184,133,0.25)" }
                        : { backgroundColor: "var(--bt-surface)", border: "1px solid var(--bt-border)", color: "var(--bt-text-2)" }}>
                      {m} min
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: "var(--bt-text-3)" }}>{t("dash.breakDuration")}</p>
                <div className="flex flex-wrap gap-1.5">
                  {POMO_BREAK_OPTIONS.map(m => (
                    <button key={m} type="button"
                      onClick={() => setPomoBreakMin(m)}
                      className="px-3 py-1 rounded-full text-xs font-semibold transition-all"
                      style={pomoBreakMin === m
                        ? { backgroundColor: "#0ea5e9", color: "#fff" }
                        : { backgroundColor: "var(--bt-surface)", border: "1px solid var(--bt-border)", color: "var(--bt-text-2)" }}>
                      {m} min
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ── Course selector ── */}
          {(!pomodoro || pomoPhase === "work") && (
            <div className="px-6 mt-5 relative z-20">
              {courses.length === 0 ? (
                <p className="text-sm text-center py-2" style={{ color: "var(--bt-text-3)" }}>{t("dash.addCourseHint")}</p>
              ) : (
                <button
                  onClick={() => !running && setShowCourseMenu(s => !s)}
                  disabled={running}
                  className="w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl transition-all text-left"
                  style={{
                    backgroundColor: "var(--bt-subtle)",
                    border: `1px solid ${showCourseMenu ? "#14B885" : "var(--bt-border)"}`,
                    boxShadow: showCourseMenu ? "0 0 0 3px rgba(20,184,133,0.12)" : "none",
                  }}>
                  {courses.find(c => c.id === courseId) && (
                    <span className="w-3 h-3 rounded-full shrink-0"
                      style={{ backgroundColor: courses.find(c => c.id === courseId)?.color }} />
                  )}
                  <span className="flex-1 text-sm font-medium truncate min-w-0"
                    style={{ color: courseId ? "var(--bt-text-1)" : "var(--bt-text-3)" }}>
                    {courseId ? courseName(courseId) : t("dash.selectCourse")}
                  </span>
                  {!running && (
                    <span className="text-xs font-semibold shrink-0 flex items-center gap-1"
                      style={{ color: "#14B885" }}>
                      {t("dash.changeCourse")}
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                        style={{ transform: showCourseMenu ? "rotate(180deg)" : "none", transition: "transform 0.2s" }}>
                        <polyline points="6 9 12 15 18 9"/>
                      </svg>
                    </span>
                  )}
                </button>
              )}

              {/* Dropdown menu */}
              {showCourseMenu && !running && (
                <div className="absolute top-full left-6 right-6 mt-1.5 rounded-2xl z-20 overflow-hidden"
                  style={{ backgroundColor: "var(--bt-surface)", border: "1px solid var(--bt-border)", boxShadow: "0 8px 32px var(--bt-shadow)" }}>
                  {courses.map((c, i) => (
                    <button key={c.id}
                      onClick={() => { setCourseId(c.id); setShowCourseMenu(false); }}
                      className="w-full flex items-center gap-3 px-4 py-3 text-left transition-colors"
                      style={{ borderBottom: i < courses.length - 1 ? "1px solid var(--bt-border)" : "none" }}
                      onMouseEnter={e => e.currentTarget.style.backgroundColor = "var(--bt-subtle)"}
                      onMouseLeave={e => e.currentTarget.style.backgroundColor = ""}>
                      <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: c.color }} />
                      <span className="flex-1 text-sm font-medium truncate" style={{ color: "var(--bt-text-1)" }}>{c.name}</span>
                      {courseId === c.id && (
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#14B885" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="20 6 9 17 4 12"/>
                        </svg>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── Timer display ── */}
          <div className={`text-center px-6 py-10 ${running ? "bt-pulse-green rounded-3xl" : ""}`}>
            {pomodoro ? (
              <>
                <div className="text-xs font-bold uppercase tracking-[0.15em] mb-4"
                  style={{ color: pomoPhase === "work" ? "#14B885" : "#0ea5e9" }}>
                  {pomoPhase === "work" ? t("dash.work") : t("dash.pause")}
                  {pomoCount > 0 && <span className="font-normal ml-2 opacity-60">· {t("dash.cycle")} {pomoCount}</span>}
                </div>
                <div className="font-display tabular-nums"
                  style={{ fontSize: "clamp(3.5rem,12vw,5.5rem)", lineHeight: 1, color: "var(--bt-text-1)" }}>
                  {formatDuration(Math.max(0, (pomoPhase === "work" ? POMO_WORK : POMO_BREAK) - elapsed))}
                </div>
                <div className="mt-6 w-full max-w-[200px] mx-auto h-1.5 rounded-full overflow-hidden"
                  style={{ backgroundColor: "var(--bt-border)" }}>
                  <div className="h-full rounded-full transition-all duration-1000"
                    style={{
                      width: `${Math.min(100, (elapsed / (pomoPhase === "work" ? POMO_WORK : POMO_BREAK)) * 100)}%`,
                      backgroundColor: pomoPhase === "work" ? "#14B885" : "#0ea5e9",
                    }} />
                </div>
                {pomoPhase === "break" && (
                  <p className="text-xs mt-2" style={{ color: "var(--bt-text-3)" }}>{t("dash.nextAutoStart")}</p>
                )}
              </>
            ) : (
              <>
                <div className="font-display tabular-nums transition-colors duration-300"
                  style={{ fontSize: "clamp(3.5rem,12vw,5.5rem)", lineHeight: 1, color: isPaused ? "#ef4444" : "var(--bt-text-1)" }}>
                  {formatDuration(elapsed)}
                </div>
                {isPaused && (
                  <div className="text-xs font-bold uppercase tracking-[0.15em] mt-2"
                    style={{ color: "#ef4444" }}>
                    {t("dash.pausedStatus")}
                  </div>
                )}
                {/* Cours actif + badge examen */}
                <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
                  {courseId && courses.find(c => c.id === courseId) && (
                    <span className="flex items-center gap-1.5 text-sm" style={{ color: "var(--bt-text-2)" }}>
                      <span className="w-2 h-2 rounded-full shrink-0"
                        style={{ backgroundColor: courses.find(c => c.id === courseId)?.color }} />
                      <span className="truncate max-w-[180px]">{courseName(courseId)}</span>
                    </span>
                  )}
                  {(() => {
                    const c = courses.find(c => c.id === courseId);
                    if (!c?.exam_date) return null;
                    const d = daysUntilExam(c.exam_date);
                    return (
                      <span className="text-xs px-2.5 py-0.5 rounded-full font-semibold shrink-0 whitespace-nowrap" style={{
                        backgroundColor: d <= 0 ? "#FEF2F2" : d <= 7 ? "#FEF3C7" : "#EAFBF4",
                        color: d <= 0 ? "#DC2626" : d <= 7 ? "#D97706" : "#0E8F68",
                      }}>
                        {d === 0 ? t("exam.today") : d < 0 ? t("exam.passed") : `${t("exam.setDate")} : ${d} ${t("exam.inDays")}`}
                      </span>
                    );
                  })()}
                </div>
              </>
            )}
          </div>

          {/* ── Note ── */}
          {(!pomodoro || pomoPhase === "work") && (
            <div className="px-6 pb-0">
              <div className="relative">
                <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
                  width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
                  style={{ color: "var(--bt-text-4)" }}>
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                  <polyline points="14 2 14 8 20 8"/>
                  <line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>
                </svg>
                <input
                  className="input"
                  style={{ paddingLeft: "2.25rem" }}
                  placeholder={t("dash.notePlaceholder")}
                  value={note}
                  onChange={(e) => setNote(e.target.value)} />
              </div>
            </div>
          )}

          {/* ── Action buttons ── */}
          <div className="px-6 pt-4 pb-6 space-y-2.5">
            {pomoPhase === "break" && pomodoro ? (
              <button className="btn-ghost w-full py-3 text-sm"
                onClick={() => { pause(); reset(); setPomoPhase("work"); pomoHandled.current = false; }}>
                {t("dash.skipBreak")} →
              </button>
            ) : (
              <>
                {!running ? (
                  <button
                    className="w-full py-3.5 rounded-2xl text-sm font-bold transition-all flex items-center justify-center gap-2 bt-press"
                    style={{
                      backgroundColor: "#14B885",
                      color: "#fff",
                      boxShadow: "0 4px 16px rgba(20,184,133,0.30)",
                      opacity: (!courseId && !pomodoro) ? 0.45 : 1,
                    }}
                    onClick={() => { start(); setFocusMode(true); }}
                    disabled={!courseId && !pomodoro}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                      <polygon points="5 3 19 12 5 21 5 3"/>
                    </svg>
                    {elapsed > 0 ? t("dash.resume") : t("dash.start")}
                  </button>
                ) : (
                  <button
                    className="w-full py-3.5 rounded-2xl text-sm font-bold transition-all flex items-center justify-center gap-2 bt-press"
                    style={{ backgroundColor: "var(--bt-subtle)", color: "var(--bt-text-1)", border: "1px solid var(--bt-border)" }}
                    onClick={pause}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                      <rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/>
                    </svg>
                    {t("dash.pause")}
                  </button>
                )}
                <button
                  className="w-full py-3.5 rounded-2xl text-sm font-bold transition-all flex items-center justify-center gap-2 bt-press"
                  style={{
                    backgroundColor: saveStatus === "success" ? "#14B885"
                      : saveStatus === "error" ? "#ef4444"
                      : "var(--bt-text-1)",
                    color: "#fff",
                    opacity: (elapsed < 1 || saveStatus === "saving") ? 0.45 : 1,
                  }}
                  onClick={() => { setPomodoro(false); setPomoPhase("work"); setPomoCount(0); stopAndSave(); }}
                  disabled={elapsed < 1 || saveStatus === "saving"}>
                  {saveStatus === "saving" ? (
                    <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : saveStatus === "success" ? (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12"/>
                    </svg>
                  ) : (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                      <rect x="3" y="3" width="18" height="18" rx="2"/>
                    </svg>
                  )}
                  {saveStatus === "saving"  ? t("common.saving")
                    : saveStatus === "success" ? t("dash.saveSuccess")
                    : saveStatus === "error"   ? t("dash.saveError")
                    : t("dash.finish")}
                </button>
              </>
            )}
          </div>
        </section>

        {/* ══════════════════════════════════════════
            SIDE — Aujourd'hui + Mes cours
        ══════════════════════════════════════════ */}
        <div className="space-y-5 min-w-0">

          {/* ── Aujourd'hui ── */}
          <section className="card p-5 min-w-0 overflow-hidden relative"
            style={{ backgroundColor: "#EAFBF4", borderColor: "#C6EED9" }}>
            {/* Streak badge */}
            {streak > 0 && (
              <div className="absolute top-4 right-4 flex items-center gap-1 px-2.5 py-1 rounded-full"
                style={{ backgroundColor: "#FEF3C7" }}>
                <span style={{ fontSize: 13 }}>🔥</span>
                <span className="text-xs font-bold" style={{ color: "#92400E" }}>{streak} {t("dash.streak")}</span>
              </div>
            )}
            <p className="text-xs font-bold uppercase tracking-wider mb-1" style={{ color: "#14B885" }}>
              {t("dash.today")}
            </p>
            <div className="font-display tabular-nums mb-3" style={{ fontSize: "clamp(2rem,6vw,2.5rem)", color: "#0E8F68", lineHeight: 1.1 }}>
              {formatMinutesShort(totalToday)}
            </div>
            <div className="mb-4">
              <div className="flex items-center justify-between text-xs mb-1.5" style={{ color: "#0E8F68", opacity: 0.75 }}>
                <span>{t("dash.goal")}</span>
                <span className="font-bold">{goalPct}%</span>
              </div>
              <div className="w-full h-2 rounded-full overflow-hidden" style={{ backgroundColor: "rgba(20,184,133,0.18)" }}>
                <div className="h-full rounded-full transition-all duration-700"
                  style={{ width: `${goalPct}%`, backgroundColor: "#14B885" }} />
              </div>
            </div>
            <ul className="space-y-2">
              {perCourse.filter((c) => c.secs > 0).map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-2 text-sm overflow-hidden">
                  <span className="flex items-center gap-2 min-w-0">
                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: c.color }} />
                    <span className="truncate min-w-0" style={{ color: "#0E8F68" }}>{c.name}</span>
                  </span>
                  <span className="shrink-0 tabular-nums font-semibold" style={{ color: "#0E8F68" }}>{formatMinutesShort(c.secs)}</span>
                </li>
              ))}
              {totalToday === 0 && (
                <li className="text-sm" style={{ color: "#14B885", opacity: 0.7 }}>{t("dash.noSession")}</li>
              )}
            </ul>
          </section>

          {/* ── Mes cours ── */}
          <section className="card p-5 min-w-0">
            <h2 className="text-sm font-bold uppercase tracking-wider mb-4"
              style={{ color: "var(--bt-text-3)" }}>{t("dash.myCourses")}</h2>
            <form onSubmit={addCourse} className="mb-5">
              {/* Input + bouton inline */}
              <div className="flex gap-2 mb-3">
                <input className="input flex-1 min-w-0" placeholder={t("dash.newCourse")}
                  value={newCourse} onChange={(e) => setNewCourse(e.target.value)} />
                <button className="btn-primary shrink-0 px-3.5 rounded-xl" type="submit"
                  style={{ padding: "0 14px" }}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                  </svg>
                </button>
              </div>
              {/* Palette horizontale scrollable */}
              <div className="relative">
                <div
                  className="[&::-webkit-scrollbar]:hidden flex gap-2 pb-0.5"
                  style={{ overflowX: "auto", scrollbarWidth: "none", WebkitOverflowScrolling: "touch" }}>
                  {COLORS.map((col) => (
                    <button type="button" key={col} onClick={() => setNewColor(col)}
                      className="transition-all"
                      style={{
                        width: 26,
                        height: 26,
                        borderRadius: "50%",
                        backgroundColor: col,
                        border: newColor === col ? `3px solid var(--bt-text-1)` : "3px solid transparent",
                        outline: newColor === col ? `2px solid ${col}40` : "none",
                        outlineOffset: 1,
                        transform: newColor === col ? "scale(1.18)" : "scale(1)",
                        flexShrink: 0,
                        cursor: "pointer",
                      }}
                      aria-label={col} />
                  ))}
                </div>
                {/* Fade côté droit */}
                <div className="absolute top-0 right-0 bottom-0 w-8 pointer-events-none"
                  style={{ background: "linear-gradient(to left, var(--bt-surface), transparent)" }} />
              </div>
            </form>
            <ul className="space-y-1.5">
              {courses.map((c) => {
                const examDays = daysUntilExam(c.exam_date);
                return (
                  <li key={c.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => setCourseId(c.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setCourseId(c.id);
                      }
                    }}
                    className="rounded-2xl px-3 py-2.5 transition-colors overflow-hidden cursor-pointer"
                    style={{ border: "1px solid var(--bt-border)", backgroundColor: courseId === c.id ? "var(--bt-accent-bg)" : "var(--bt-surface)" }}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="flex items-center gap-2.5 text-sm min-w-0 flex-1">
                        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: c.color }} />
                        <span className="truncate min-w-0 font-medium" style={{ color: "var(--bt-text-1)" }}>{c.name}</span>
                        {c.exam_date && (
                          <span className="shrink-0 text-[10px] px-2 py-0.5 rounded-full font-bold whitespace-nowrap" style={{
                            backgroundColor: examDays <= 0 ? "#FEF2F2" : examDays <= 7 ? "#FEF3C7" : "#EAFBF4",
                            color: examDays <= 0 ? "#DC2626" : examDays <= 7 ? "#92400E" : "#0E8F68",
                          }}>
                            {examDays === 0 ? t("exam.today") : examDays < 0 ? t("exam.passed") : `J-${examDays}`}
                          </span>
                        )}
                      </span>
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          onClick={(e) => { e.stopPropagation(); setEditingExamId(editingExamId === c.id ? null : c.id); setExamDateInput(c.exam_date || ""); }}
                          title={t("exam.setDate")}
                          className="transition-colors w-7 h-7 flex items-center justify-center rounded-lg"
                          style={{ color: c.exam_date ? "#14B885" : "var(--bt-text-4)" }}
                          onMouseEnter={e => { e.currentTarget.style.color = "#14B885"; e.currentTarget.style.backgroundColor = "var(--bt-subtle)"; }}
                          onMouseLeave={e => { e.currentTarget.style.color = c.exam_date ? "#14B885" : "var(--bt-text-4)"; e.currentTarget.style.backgroundColor = ""; }}>
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
                          </svg>
                        </button>
                        <button onClick={(e) => { e.stopPropagation(); deleteCourse(c.id); }}
                          className="transition-colors w-7 h-7 flex items-center justify-center rounded-lg"
                          style={{ color: "var(--bt-text-4)" }}
                          onMouseEnter={e => { e.currentTarget.style.color = "#ef4444"; e.currentTarget.style.backgroundColor = "rgba(239,68,68,0.08)"; }}
                          onMouseLeave={e => { e.currentTarget.style.color = "var(--bt-text-4)"; e.currentTarget.style.backgroundColor = ""; }}
                          title={t("common.remove")}>
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/>
                          </svg>
                        </button>
                      </div>
                    </div>
                    {editingExamId === c.id && (
                      <div className="flex items-center gap-1.5 mt-2 overflow-hidden" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="date"
                          value={examDateInput}
                          onChange={e => setExamDateInput(e.target.value)}
                          min={todayISO()}
                          style={{
                            fontSize: 12,
                            padding: "3px 8px",
                            borderRadius: 10,
                            border: "1px solid var(--bt-border)",
                            backgroundColor: "var(--bt-subtle)",
                            color: "var(--bt-text-1)",
                            outline: "none",
                            minWidth: 0,
                            flex: "1 1 auto",
                          }}
                        />
                        <button onClick={(e) => { e.stopPropagation(); updateExamDate(c.id, examDateInput); setEditingExamId(null); }}
                          title={t("common.save")} style={{ color: "#14B885" }}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="20 6 9 17 4 12"/>
                          </svg>
                        </button>
                        {c.exam_date && (
                          <button onClick={(e) => { e.stopPropagation(); updateExamDate(c.id, null); setEditingExamId(null); }}
                            title={t("common.remove")}
                            style={{ color: "var(--bt-text-4)" }}
                            onMouseEnter={e => e.currentTarget.style.color = "#ef4444"}
                            onMouseLeave={e => e.currentTarget.style.color = "var(--bt-text-4)"}>
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/>
                            </svg>
                          </button>
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        </div>
      </div>

      {/* Focus mode overlay */}
      {focusMode && (
        <div className="fixed inset-0 flex flex-col items-center justify-center transition-colors duration-500"
          style={{ backgroundColor: (isPaused && !pomodoro) ? "#220000" : "#1F1A17", zIndex: 100 }}>

          {pomodoro && (
            <p className="text-xs font-semibold uppercase tracking-widest mb-3"
              style={{ color: pomoPhase === "work" ? "#14B885" : "#0ea5e9" }}>
              {pomoPhase === "work" ? t("dash.work") : t("dash.pause")}
              {pomoCount > 0 && <span className="font-normal ml-2" style={{ color: "#555" }}>· {t("dash.cycle")} {pomoCount}</span>}
            </p>
          )}

          <p className="text-sm mb-2" style={{ color: "#A8A09A" }}>
            {courseId ? courseName(courseId) : t("dash.noCourse")}
          </p>

          <div className="font-display tabular-nums transition-colors duration-300"
            style={{
              fontSize: "clamp(4rem,15vw,7rem)",
              lineHeight: 1.1,
              color: (isPaused && !pomodoro) ? "#ef4444" : "#ffffff",
            }}>
            {pomodoro
              ? formatDuration(Math.max(0, (pomoPhase === "work" ? POMO_WORK : POMO_BREAK) - elapsed))
              : formatDuration(elapsed)}
          </div>

          {/* Indicateur EN PAUSE en mode focus */}
          {isPaused && !pomodoro && (
            <div className="mt-3 px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-widest"
              style={{ color: "#ef4444", backgroundColor: "rgba(239,68,68,0.15)", letterSpacing: "0.12em" }}>
              {t("dash.pausedStatus")}
            </div>
          )}

          {pomodoro && (
            <div className="mt-6 w-full max-w-xs h-1 rounded-full" style={{ backgroundColor: "#333" }}>
              <div className="h-full rounded-full transition-all duration-1000"
                style={{
                  width: `${Math.min(100, (elapsed / (pomoPhase === "work" ? POMO_WORK : POMO_BREAK)) * 100)}%`,
                  backgroundColor: pomoPhase === "work" ? "#14B885" : "#0ea5e9",
                }} />
            </div>
          )}

          <div className="mt-8 flex gap-3">
            {pomoPhase === "break" && pomodoro ? (
              <button className="btn-ghost text-white border-white/20 px-8 py-3"
                onClick={() => { pause(); reset(); setPomoPhase("work"); pomoHandled.current = false; }}>
                {t("dash.skipBreak")}
              </button>
            ) : (
              <>
                {!running ? (
                  <button onClick={start} disabled={!courseId && !pomodoro}
                    className="btn-primary px-10 py-3 text-base bt-press">
                    {elapsed > 0 ? t("dash.resume") : t("dash.start")}
                  </button>
                ) : (
                  <button onClick={pause}
                    className="px-10 py-3 text-base rounded-2xl font-semibold transition-colors bt-press"
                    style={{ backgroundColor: "rgba(255,255,255,0.1)", color: "#fff" }}>
                    {t("dash.pause")}
                  </button>
                )}
                <button
                  onClick={() => { setPomodoro(false); setPomoPhase("work"); setPomoCount(0); stopAndSave(); setFocusMode(false); }}
                  disabled={elapsed < 1 || saveStatus === "saving"}
                  className="px-10 py-3 text-base rounded-2xl font-semibold transition-colors bt-press"
                  style={{ backgroundColor: "rgba(255,255,255,0.1)", color: "#fff" }}>
                  {saveStatus === "saving" ? t("common.saving") : t("dash.finish")}
                </button>
              </>
            )}
          </div>

          <button onClick={() => setFocusMode(false)}
            className="mt-6 flex items-center gap-2 text-sm font-medium rounded-2xl px-5 py-2.5 transition-colors"
            style={{ color: "rgba(255,255,255,0.45)" }}
            onMouseEnter={e => e.currentTarget.style.color = "rgba(255,255,255,0.8)"}
            onMouseLeave={e => e.currentTarget.style.color = "rgba(255,255,255,0.45)"}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
            {t("dash.exitFocus")}
          </button>

        </div>
      )}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2 mt-5 min-w-0">
        {sessions.length > 0 && (
          <section className="card p-5">
            <h2 className="text-sm font-bold uppercase tracking-wider mb-4" style={{ color: "var(--bt-text-3)" }}>{t("dash.todaySessions")}</h2>
            <ul className="divide-y" style={{ borderColor: "var(--bt-border)" }}>
              {sessions.map((s) => {
                const maxMins = Math.floor(s.duration_seconds / 60);
                const isEditing = editingSessionId === s.id;
                return (
                  <li key={s.id} className="py-2.5 flex items-center gap-2 text-sm">
                    {isEditing ? (
                      /* ── Inline editor ── */
                      <div className="flex-1 flex flex-col gap-2">
                        {/* Course selector */}
                        <select
                          value={editCourseId ?? ""}
                          onChange={e => setEditCourseId(e.target.value || null)}
                          style={{
                            width: "100%",
                            padding: "3px 8px",
                            fontSize: 13,
                            borderRadius: 8,
                            border: "1px solid var(--bt-border)",
                            backgroundColor: "var(--bt-surface)",
                            color: "var(--bt-text-1)",
                            outline: "none",
                          }}>
                          <option value="">{t("dash.noCourse")}</option>
                          {courses.map(c => (
                            <option key={c.id} value={c.id}>{c.name}</option>
                          ))}
                        </select>
                        {/* Duration row */}
                        <div className="flex items-center gap-1.5">
                          <input
                            type="number"
                            min={1}
                            max={maxMins}
                            value={editMinutes}
                            onChange={e => setEditMinutes(e.target.value)}
                            onKeyDown={e => {
                              if (e.key === "Enter") updateSession(s);
                              if (e.key === "Escape") setEditingSessionId(null);
                            }}
                            autoFocus
                            style={{
                              width: 52,
                              padding: "2px 6px",
                              fontSize: 13,
                              textAlign: "center",
                              borderRadius: 8,
                              border: "1px solid var(--bt-border)",
                              backgroundColor: "var(--bt-surface)",
                              color: "var(--bt-text-1)",
                              outline: "none",
                            }}
                          />
                          <span className="text-xs tabular-nums flex-1" style={{ color: "var(--bt-text-3)" }}>
                            / {maxMins} min
                          </span>
                          {/* Confirm */}
                          <button
                            onClick={() => updateSession(s)}
                            title={t("common.save")}
                            className="shrink-0 transition-colors"
                            style={{ color: "#14B885" }}
                            onMouseEnter={e => e.currentTarget.style.color = "#0E8F68"}
                            onMouseLeave={e => e.currentTarget.style.color = "#14B885"}>
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                              <polyline points="20 6 9 17 4 12"/>
                            </svg>
                          </button>
                          {/* Cancel */}
                          <button
                            onClick={() => setEditingSessionId(null)}
                            title={t("common.cancel")}
                            className="shrink-0 transition-colors"
                            style={{ color: "var(--bt-text-3)" }}
                            onMouseEnter={e => e.currentTarget.style.color = "var(--bt-text-1)"}
                            onMouseLeave={e => e.currentTarget.style.color = "var(--bt-text-3)"}>
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                            </svg>
                          </button>
                        </div>
                      </div>
                    ) : (
                      /* ── Normal view ── */
                      <>
                        <span className="flex-1 min-w-0">
                          <span className="font-medium" style={{ color: "var(--bt-text-1)" }}>{courseName(s.course_id)}</span>
                          {s.note && <span style={{ color: "#A8A09A" }}> — {s.note}</span>}
                        </span>
                        <span className="shrink-0 tabular-nums" style={{ color: "var(--bt-text-2)" }}>
                          {formatMinutesShort(s.duration_seconds)}
                        </span>
                        {/* Edit */}
                        <button
                          onClick={() => { setEditingSessionId(s.id); setEditMinutes(String(maxMins)); setEditCourseId(s.course_id); }}
                          title={t("dash.editSession")}
                          className="shrink-0 transition-colors"
                          style={{ color: "var(--bt-text-4)" }}
                          onMouseEnter={e => e.currentTarget.style.color = "var(--bt-text-2)"}
                          onMouseLeave={e => e.currentTarget.style.color = "var(--bt-text-4)"}>
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/>
                          </svg>
                        </button>
                        {/* Delete — double confirmation */}
                        {confirmDeleteId === s.id ? (
                          <>
                            <button
                              onClick={() => { deleteSession(s.id); setConfirmDeleteId(null); }}
                              title={t("common.delete")}
                              className="shrink-0 transition-colors"
                              style={{ color: "#ef4444" }}>
                              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/>
                              </svg>
                            </button>
                            <button
                              onClick={() => setConfirmDeleteId(null)}
                              title={t("common.cancel")}
                              className="shrink-0 transition-colors"
                              style={{ color: "var(--bt-text-3)" }}
                              onMouseEnter={e => e.currentTarget.style.color = "var(--bt-text-1)"}
                              onMouseLeave={e => e.currentTarget.style.color = "var(--bt-text-3)"}>
                              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                              </svg>
                            </button>
                          </>
                        ) : (
                          <button
                            onClick={() => setConfirmDeleteId(s.id)}
                            title={t("common.delete")}
                            className="shrink-0 transition-colors"
                            style={{ color: "var(--bt-text-4)" }}
                            onMouseEnter={e => e.currentTarget.style.color = "#ef4444"}
                            onMouseLeave={e => e.currentTarget.style.color = "var(--bt-text-4)"}>
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/>
                            </svg>
                          </button>
                        )}
                      </>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        {todayObjectives.length > 0 && (
          <section className="card p-5">
            <h2 className="text-sm font-bold uppercase tracking-wider mb-4" style={{ color: "var(--bt-text-3)" }}>{t("dash.todo")}</h2>
            <ul className="space-y-2">
              {todayObjectives.map((o) => {
                const course = courses.find((c) => c.id === o.course_id);
                return (
                  <li key={o.id}
                    className="flex items-center gap-3 text-sm rounded-2xl px-3.5 py-3 transition-colors"
                    style={{
                      border: "1px solid var(--bt-border)",
                      backgroundColor: o.done ? "var(--bt-subtle)" : "var(--bt-surface)",
                    }}>
                    <input type="checkbox" checked={o.done} onChange={() => toggleObjective(o)}
                      className="w-4 h-4 shrink-0 rounded" style={{ accentColor: "#14B885" }} />
                    <div className="flex-1 min-w-0">
                      <p className="truncate" style={{
                        color: o.done ? "var(--bt-text-3)" : "var(--bt-text-1)",
                        textDecoration: o.done ? "line-through" : "none",
                        fontWeight: o.done ? 400 : 500,
                      }}>
                        {o.title}
                      </p>
                      <p className="text-xs flex items-center gap-1.5 mt-0.5" style={{ color: "var(--bt-text-3)" }}>
                        {course && (
                          <>
                            <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: course.color }} />
                            <span className="truncate">{course.name}</span>
                            <span>·</span>
                          </>
                        )}
                        <span>{o.target_minutes} min</span>
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        )}
      </div>

      {/* Session completion toast */}
      {completionToast && (
        <div style={{
          position: "fixed",
          bottom: 24,
          right: 24,
          zIndex: 9000,
          opacity: toastVisible ? 1 : 0,
          transform: toastVisible ? "translateY(0)" : "translateY(20px)",
          transition: "opacity 0.3s ease-out, transform 0.3s ease-out",
          pointerEvents: "none",
        }}>
          <div
            className="min-w-[220px] max-w-[280px] lg:min-w-[340px] lg:max-w-[400px]"
            style={{
              backgroundColor: "#0E8F68",
              color: "#fff",
              borderRadius: 18,
              boxShadow: "0 8px 32px rgba(14,143,104,0.35)",
            }}>
            <div className="p-4 lg:p-6">
              <div className="flex items-center gap-2 mb-2 lg:mb-3">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
                <span className="font-semibold text-sm lg:text-base">{t("dash.doneTitle")}</span>
              </div>
              <div className="text-xs lg:text-sm mb-2" style={{ opacity: 0.9 }}>
                {t("dash.doneDuration")} : <strong>{formatMinutesShort(completionToast.durationSecs)}</strong>
              </div>
              {completionToast.xpGained > 0 && (
                <div className="relative mb-2" style={{ minHeight: 24 }}>
                  <div className="text-xs lg:text-sm font-bold" style={{ opacity: 0.95, color: "#A7F3D0" }}>
                    +{completionToast.xpGained} {t("dash.doneXP")}
                  </div>
                  {/* Floating XP ghost — animates upward */}
                  <div
                    key={completionToast.durationSecs}
                    className="bt-xp-float absolute left-0 top-0 text-base lg:text-lg font-extrabold pointer-events-none"
                    style={{ color: "#FBBF24", textShadow: "0 0 12px rgba(251,191,36,0.6)" }}>
                    +{completionToast.xpGained} XP
                  </div>
                </div>
              )}
              {completionToast.goalPct > 0 && (
                <>
                  <div className="text-xs lg:text-sm mb-1.5" style={{ opacity: 0.85 }}>
                    {completionToast.goalPct}% {t("dash.doneGoalPct")}
                  </div>
                  <div style={{ width: "100%", height: 4, borderRadius: 4, backgroundColor: "rgba(255,255,255,0.25)" }}>
                    <div style={{
                      height: "100%",
                      borderRadius: 4,
                      backgroundColor: "#fff",
                      width: `${completionToast.goalPct}%`,
                      transition: "width 1s ease-out",
                    }} />
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
