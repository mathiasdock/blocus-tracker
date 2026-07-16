import { useEffect, useState, useCallback, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import Layout from "../components/Layout";
import { useAuth } from "../contexts/AuthContext";
import { useTimer } from "../contexts/TimerContext";
import { useI18n } from "../contexts/I18nContext";
import { supabase } from "../lib/supabaseClient";
import { formatDuration, formatMinutesShort, todayISO, computeStreak, computeBestStreak } from "../lib/format";
import { notifyXPChanged } from "../lib/xpEvents";
import { clearClientCache, getClientCache, setClientCache } from "../lib/clientCache";
import { newClientId, enqueueSession, removeFromQueue, flushPending } from "../lib/timerDraft";
import { useWakeLock } from "../lib/useWakeLock";
import { COURSE_COLORS } from "../lib/courseColors";
import { runStreakFreezeUpkeep } from "../lib/streakFreezes";
import { useToast } from "../contexts/ToastContext";
import PendingSessionsBanner from "../components/PendingSessionsBanner";
import CourseChecklistModal from "../components/CourseChecklistModal";
import Mascot from "../components/Mascot";
import MascotCoach from "../components/MascotCoach";
import AmbientSoundControl from "../components/AmbientSoundControl";

function daysUntilExam(dateStr) {
  if (!dateStr) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const exam = new Date(dateStr + "T12:00:00");
  return Math.floor((exam - today) / 86400000);
}

// ── Blocus Blocks — la signature visuelle du chrono ───────────
// L'utilisateur ne "remplit pas une barre" : il CONSTRUIT sa session bloc
// par bloc. Un bloc = 15 min de concentration.
//  • Mode libre : les blocs validés s'accumulent (pas de fin imposée).
//  • Mode objectif / pomodoro : progression vers un total de blocs, puis
//    blocs bonus une fois l'objectif dépassé.
// États d'un bloc : vide (discret) · validé (vert plein) · en cours (se
// remplit + pulse doux) · pause (bordeaux doux qui pulse) · bonus (sobre
// mais valorisé).
const BLOCK_SECS = 900;          // 15 minutes par bloc
const PAUSE_ACCENT = "#CB5A4E";  // rouge/bordeaux doux, jamais agressif

// Construit la liste des blocs à afficher selon le mode.
function buildBlockLayout({ elapsed, goalSecs, running, paused, max }) {
  const validated = Math.floor(elapsed / BLOCK_SECS);
  const fraction  = (elapsed % BLOCK_SECS) / BLOCK_SECS;
  const curState  = paused ? "paused" : running ? "active" : "next";

  if (goalSecs) {
    const goalBlocks = Math.max(1, Math.ceil(goalSecs / BLOCK_SECS));
    const reached = elapsed >= goalSecs;
    const shown = Math.min(goalBlocks, max);
    const head = [];
    for (let i = 0; i < shown; i++) {
      head.push(reached || i < validated ? "done" : i === validated ? curState : "empty");
    }
    return {
      head,
      overflow: goalBlocks > max ? goalBlocks - max : 0,
      tail: null,
      bonus: reached ? Math.min(4, Math.max(0, validated - goalBlocks)) : 0,
      fraction,
    };
  }

  // ── Mode libre — pas de fin, les blocs poussent ──
  const need = validated + 1;
  if (need <= max) {
    const baseline = Math.max(need, 6);       // toujours au moins 6 emplacements
    const head = [];
    for (let i = 0; i < Math.min(baseline, max); i++) {
      head.push(i < validated ? "done" : i === validated ? curState : "empty");
    }
    return { head, overflow: 0, tail: null, bonus: 0, fraction };
  }
  // Session longue : [quelques validés] +N [bloc en cours]
  const headDone = max - 2;
  return {
    head: Array.from({ length: headDone }, () => "done"),
    overflow: validated - headDone,
    tail: curState,
    bonus: 0,
    fraction,
  };
}

// Un bloc individuel. `fraction` remplit le bloc en cours (0→1).
function Block({ state, fraction = 0, focus }) {
  const GREEN = "#14B885";
  const base = {
    flex: 1,
    minWidth: focus ? 8 : 5,
    maxWidth: focus ? 46 : 30,
    height: focus ? 22 : 14,
    borderRadius: focus ? 6 : 4,
    position: "relative",
    overflow: "hidden",
    transition: "background-color 0.4s ease, box-shadow 0.4s ease, opacity 0.4s ease",
  };
  if (state === "done") {
    return <span style={{ ...base, backgroundColor: GREEN, boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.07)" }} />;
  }
  if (state === "bonus") {
    return <span style={{ ...base, backgroundImage: "linear-gradient(155deg,#2BD9A4,#14B885)", boxShadow: "0 0 10px rgba(43,217,164,0.45)" }} />;
  }
  if (state === "active") {
    return (
      <span className="bt-block-active" style={{ ...base, backgroundColor: focus ? "rgba(20,184,133,0.16)" : "var(--bt-accent-bg)" }}>
        <span style={{ position: "absolute", inset: 0, width: `${Math.max(7, fraction * 100)}%`, backgroundColor: GREEN, transition: "width 0.9s linear" }} />
      </span>
    );
  }
  if (state === "paused") {
    return (
      <span className="bt-block-paused" style={{ ...base, backgroundColor: focus ? "rgba(203,90,78,0.16)" : "rgba(203,90,78,0.10)" }}>
        <span style={{ position: "absolute", inset: 0, width: `${Math.max(7, fraction * 100)}%`, backgroundColor: PAUSE_ACCENT, opacity: 0.85 }} />
      </span>
    );
  }
  if (state === "next") {
    return <span style={{ ...base, backgroundColor: "transparent", boxShadow: `inset 0 0 0 1.5px ${focus ? "rgba(255,255,255,0.24)" : "var(--bt-border)"}` }} />;
  }
  // empty
  return <span style={{ ...base, backgroundColor: focus ? "rgba(255,255,255,0.07)" : "var(--bt-subtle)", boxShadow: focus ? "none" : "inset 0 0 0 1px var(--bt-border)" }} />;
}

function BlocusBlocks({ elapsed, running, paused, goalSecs, focus = false }) {
  const max = focus ? 16 : 12;
  const { head, overflow, tail, bonus, fraction } = buildBlockLayout({ elapsed, goalSecs, running, paused, max });
  return (
    <div className="flex items-center justify-center gap-[5px] w-full" style={{ minHeight: focus ? 22 : 14 }} aria-hidden="true">
      {head.map((s, i) => (
        <Block key={i} state={s} fraction={s === "active" || s === "paused" ? fraction : 0} focus={focus} />
      ))}
      {overflow > 0 && (
        <span className="font-num tabular-nums shrink-0 px-1" style={{ fontSize: focus ? 13 : 11, fontWeight: 700, color: focus ? "rgba(255,255,255,0.6)" : "var(--bt-text-3)" }}>
          +{overflow}
        </span>
      )}
      {tail && <Block state={tail} fraction={fraction} focus={focus} />}
      {bonus > 0 && (
        <>
          <span className="shrink-0" style={{ width: 4 }} />
          {Array.from({ length: bonus }, (_, i) => <Block key={`b${i}`} state="bonus" focus={focus} />)}
        </>
      )}
    </div>
  );
}

// Un caractère du chrono dans une fente à largeur fixe : quand sa valeur
// change, le nouveau chiffre glisse vers le haut en fondu (effet odomètre).
// Seuls les caractères qui changent s'animent — la clé porte la valeur.
// Pas de clip : un overflow-hidden inline-block casserait la baseline.
function RollChar({ ch }) {
  return (
    <span className="inline-block" style={{ width: /\d/.test(ch) ? "1ch" : undefined }}>
      <span key={ch} className="bt-digit-roll">{ch}</span>
    </span>
  );
}

// Chiffres du chrono — heures:minutes en héros, secondes dé-emphasées
// (plus petites, atténuées) : la lecture premium façon minuteur Apple.
function TimerDigits({ seconds, color, size = "clamp(3.6rem, 11vw, 6rem)" }) {
  const [hh, mm, ss] = formatDuration(seconds).split(":");
  const showHours = hh !== "00";
  const main = showHours ? `${hh}:${mm}` : mm;
  return (
    <div className="font-num font-bold tabular-nums"
      style={{ fontSize: size, lineHeight: 1, letterSpacing: "-0.04em", color, transition: "color 0.3s" }}>
      {main.split("").map((ch, i) => <RollChar key={`m${i}`} ch={ch} />)}
      <span style={{ fontSize: "0.42em", fontWeight: 600, opacity: 0.45, marginLeft: "0.06em" }}>
        :{ss.split("").map((ch, i) => <RollChar key={`s${i}`} ch={ch} />)}
      </span>
    </div>
  );
}

// Message contextuel selon l'heure — mode Focus uniquement, discret.
function focusGreeting(t) {
  const h = new Date().getHours();
  if (h >= 5 && h < 12)  return t("dash.focusGreetingMorning");
  if (h >= 12 && h < 18) return t("dash.focusGreetingAfternoon");
  if (h >= 18 && h < 23) return t("dash.focusGreetingEvening");
  return t("dash.focusGreetingNight");
}

const DAILY_GOAL_SECS = 7200; // 2 hours
const POMO_WORK_OPTIONS  = [15, 20, 25, 30, 45, 50, 60];
const POMO_BREAK_OPTIONS = [3, 5, 10, 15];

const COLORS = COURSE_COLORS;

const GUEST_USER_ID = "guest-local";
const GUEST_DASHBOARD_KEY = "bt_guest_dashboard_v1";

function defaultGuestDashboardData() {
  return {
    courses: [
      {
        id: "guest-course-discovery",
        user_id: GUEST_USER_ID,
        name: "Session découverte",
        color: "#14b8a6",
        exam_date: null,
        created_at: new Date().toISOString(),
      },
    ],
    sessions: [],
    recentSessions: [],
    objectives: [],
  };
}

function readGuestDashboardData() {
  if (typeof window === "undefined") return defaultGuestDashboardData();
  try {
    const raw = localStorage.getItem(GUEST_DASHBOARD_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        ...defaultGuestDashboardData(),
        ...parsed,
        recentSessions: parsed.recentSessions || parsed.sessions || [],
      };
    }
  } catch {}
  const seed = defaultGuestDashboardData();
  try { localStorage.setItem(GUEST_DASHBOARD_KEY, JSON.stringify(seed)); } catch {}
  return seed;
}

function writeGuestDashboardData(data) {
  if (typeof window === "undefined") return;
  const snapshot = {
    courses: data.courses || [],
    sessions: data.sessions || [],
    recentSessions: data.recentSessions || data.sessions || [],
    objectives: data.objectives || [],
  };
  try { localStorage.setItem(GUEST_DASHBOARD_KEY, JSON.stringify(snapshot)); } catch {}
}

export default function Dashboard() {
  const { user } = useAuth();
  const { t } = useI18n();
  const { toast } = useToast();
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
  // Garde l'écran allumé tant qu'une session tourne (inline ou mode focus) :
  // sans ça l'iPhone se verrouille après ~30 s et la respiration du mode focus
  // s'éteint. Relâché automatiquement en pause / à l'arrêt. Voir lib/useWakeLock.
  useWakeLock(running);

  // ── Raccourci PWA "Démarrer le chrono" (?quickstart=1, manifest.json) ──
  // Tient la promesse du raccourci : démarre la session (dernier cours utilisé,
  // persisté par TimerContext) et entre en mode focus. Si une session tourne
  // déjà, on entre juste en focus. Une seule fois, puis URL nettoyée.
  const router = useRouter();
  const quickstartDone = useRef(false);
  useEffect(() => {
    if (!router.isReady || router.query.quickstart !== "1" || quickstartDone.current) return;
    if (running) {
      quickstartDone.current = true;
      setFocusMode(true);
    } else if (courseId) {
      quickstartDone.current = true;
      start();
      setFocusMode(true);
    } else {
      return; // courseId pas encore hydraté / aucun cours — on retentera au prochain render
    }
    router.replace("/dashboard", undefined, { shallow: true });
  }, [router, router.isReady, router.query.quickstart, running, courseId, start]);
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
  const [checklistCounts, setChecklistCounts] = useState({}); // courseId -> { done, total }
  const [checklistCourse, setChecklistCourse] = useState(null);
  const [recentSessions, setRecentSessions] = useState([]); // 90 jours — records & semaine
  const [freezeInfo, setFreezeInfo] = useState(null); // gel de série { frozenDays, stock, supported }
  // Objectif de session — l'intention posée avant de démarrer. Persisté
  // (localStorage) pour que l'habitude survive aux rechargements.
  const [sessionGoalMin, setSessionGoalMin] = useState(null);

  // Pomodoro
  const [pomodoro, setPomodoro]     = useState(false);
  const [pomoPhase, setPomoPhase]   = useState("work"); // "work" | "break"
  const [pomoCount, setPomoCount]   = useState(0);
  const [pomoWorkMin,  setPomoWorkMin]  = useState(25);
  const [pomoBreakMin, setPomoBreakMin] = useState(5);
  const pomoHandled = useRef(false);

  const POMO_WORK  = pomoWorkMin  * 60;
  const POMO_BREAK = pomoBreakMin * 60;
  const isGuest = !user;
  const dashboardCachePrefix = user ? `dashboard:${user.id}:` : "";

  const applyDashboardData = useCallback((data) => {
    const c = data.courses || [];
    setCourses(c);
    setCourseId(current => current || c[0]?.id || "");
    setSessions(data.sessions || []);
    setRecentSessions(data.recentSessions || []);
    setStreak(computeStreak(data.recentSessions || []));
    setBestStreak(computeBestStreak(data.recentSessions || []));
    setTodayObjectives(data.objectives || []);
  }, [setCourseId]);

  const clearDashboardCache = useCallback(() => {
    if (dashboardCachePrefix) clearClientCache(dashboardCachePrefix);
  }, [dashboardCachePrefix]);

  // ── Gel de série : recharge mensuelle + consommation si jours manqués ──
  // Mémoïsé par jour dans lib/streakFreezes (plusieurs pages peuvent appeler).
  // Avant migration v29 : supported=false → comportement d'avant, silencieux.
  const freezeToastShown = useRef(false);
  useEffect(() => {
    if (!user || !recentSessions.length) return;
    let alive = true;
    runStreakFreezeUpkeep(supabase, user.id, recentSessions).then((res) => {
      if (!alive || !res.supported) return;
      setFreezeInfo(res);
      setStreak(computeStreak(recentSessions, res.frozenDays));
      setBestStreak(computeBestStreak(recentSessions, res.frozenDays));
      if (res.usedNow > 0 && !freezeToastShown.current) {
        freezeToastShown.current = true;
        toast(t("streak.freezeUsed"), "info");
      }
    });
    return () => { alive = false; };
  }, [user, recentSessions, t, toast]);

  const loadChecklistCounts = useCallback(async () => {
    if (!user) {
      setChecklistCounts({});
      return;
    }
    const { data } = await supabase
      .from("course_checklist_items")
      .select("course_id, is_done")
      .eq("user_id", user.id);
    const map = {};
    (data || []).forEach(row => {
      if (!map[row.course_id]) map[row.course_id] = { done: 0, total: 0 };
      map[row.course_id].total += 1;
      if (row.is_done) map[row.course_id].done += 1;
    });
    setChecklistCounts(map);
  }, [user]);

  useEffect(() => { loadChecklistCounts(); }, [loadChecklistCounts]);

  const load = useCallback(async () => {
    if (!user) {
      applyDashboardData(readGuestDashboardData());
      return;
    }
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
        .select("started_at, duration_seconds")
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
    if (isGuest) return;
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

  // Objectif de session : restaure le dernier choix.
  useEffect(() => {
    try {
      const v = localStorage.getItem("bt_session_goal_v1");
      if (v) setSessionGoalMin(parseInt(v, 10) || null);
    } catch {}
  }, []);

  function pickSessionGoal(min) {
    setSessionGoalMin(min);
    try {
      if (min) localStorage.setItem("bt_session_goal_v1", String(min));
      else localStorage.removeItem("bt_session_goal_v1");
    } catch {}
  }

  // ── Suivi de la pause ──────────────────────────────────────────
  // En pause on rend le chrono TRÈS visible : "Pause depuis mm:ss" +
  // bordeaux doux qui pulse. On mémorise l'instant de mise en pause et on
  // tick chaque seconde (le TimerContext ne re-rend plus quand il est figé).
  const isPaused = !running && elapsed > 0;
  const [pausedAt, setPausedAt] = useState(null);
  const [, setPauseTick] = useState(0);
  useEffect(() => {
    if (!isPaused) { setPausedAt(null); return; }
    setPausedAt(prev => prev ?? Date.now());
    const id = setInterval(() => setPauseTick(x => x + 1), 1000);
    return () => clearInterval(id);
  }, [isPaused]);
  const pauseSince = pausedAt
    ? formatDuration(Math.max(0, Math.floor((Date.now() - pausedAt) / 1000))).replace(/^00:/, "")
    : "00:00";
  const pauseSeconds = pausedAt ? Math.max(0, Math.floor((Date.now() - pausedAt) / 1000)) : 0;

  // Contrôles du mode focus : s'estompent après 4,5 s d'inactivité (pattern
  // lecteur vidéo) — tout mouvement / toucher / touche les fait réapparaître.
  const [focusCtlVisible, setFocusCtlVisible] = useState(true);
  const focusCtlTimer = useRef(null);
  useEffect(() => {
    if (!focusMode) return;
    function poke() {
      setFocusCtlVisible(true);
      clearTimeout(focusCtlTimer.current);
      focusCtlTimer.current = setTimeout(() => setFocusCtlVisible(false), 4500);
    }
    poke();
    window.addEventListener("mousemove", poke);
    window.addEventListener("touchstart", poke);
    window.addEventListener("keydown", poke);
    return () => {
      clearTimeout(focusCtlTimer.current);
      window.removeEventListener("mousemove", poke);
      window.removeEventListener("touchstart", poke);
      window.removeEventListener("keydown", poke);
    };
  }, [focusMode]);

  // Barre espace en mode focus : pause / reprise.
  useEffect(() => {
    if (!focusMode) return;
    function onKey(e) {
      if (e.code !== "Space" || e.repeat) return;
      if (/INPUT|TEXTAREA|SELECT/.test(e.target?.tagName || "")) return;
      e.preventDefault();
      if (running) pause();
      else if (courseId || pomodoro) start();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [focusMode, running, courseId, pomodoro, pause, start]);

  // ── Pomodoro auto-transition ────────────────────────────────
  useEffect(() => {
    if (!pomodoro || !running || pomoHandled.current) return;
    const target = pomoPhase === "work" ? POMO_WORK : POMO_BREAK;
    if (elapsed < target) { pomoHandled.current = false; return; }
    pomoHandled.current = true;

    if (pomoPhase === "work") {
      const secs = Math.min(elapsed, POMO_WORK);
      const endedAt = new Date().toISOString();
      const startedAt = new Date(Date.now() - secs * 1000).toISOString();

      // 1) Snapshot LOCAL (queue) AVANT toute tentative Supabase → zéro perte
      //    si l'auto-stop pomodoro tombe pendant un creux réseau.
      const payload = {
        id: newClientId(),
        user_id: user?.id || GUEST_USER_ID,
        course_id: courseId || null,
        duration_seconds: secs,
        note: note || null,
        started_at: startedAt,
        ended_at: endedAt,
      };

      pause();
      reset();

      if (isGuest) {
        const nextSessions = [payload, ...sessions];
        const snapshot = {
          courses,
          sessions: nextSessions,
          recentSessions: nextSessions,
          objectives: todayObjectives,
        };
        writeGuestDashboardData(snapshot);
        setSessions(nextSessions);
      } else {
        enqueueSession(payload);
        // 2) Tentative d'envoi : la queue se vide d'elle-même via flushPending
        //    (idempotent, dédupe via PK sur 23505).
        flushPending(supabase, user.id).then((res) => {
          if (res.synced + res.alreadyExists > 0) {
            clearDashboardCache();
            notifyXPChanged();
            load();
          }
        });
      }

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

    const endedAt   = new Date().toISOString();
    const startedAt = new Date(Date.now() - seconds * 1000).toISOString();

    // 1) Snapshot LOCAL immédiat. À partir d'ici la session ne peut plus être
    //    perdue : même si le navigateur crashe ou si l'utilisateur ferme l'app,
    //    elle reste dans la queue localStorage et sera renvoyée au prochain
    //    focus / online / mount du dashboard (via PendingSessionsBanner).
    const payload = {
      id: newClientId(),
      user_id: user?.id || GUEST_USER_ID,
      course_id: courseId || null,
      duration_seconds: seconds,
      note: note || null,
      started_at: startedAt,
      ended_at: endedAt,
    };

    // 2) Reset UI : le travail est capturé dans la queue, l'utilisateur voit
    //    le timer revenir à 0. Pas de risque de re-cliquer "stop" sur le même
    //    elapsed (id idempotent via PK).
    reset();

    if (isGuest) {
      savingRef.current = false;
      const currentTotal = sessions.reduce((a, s) => a + s.duration_seconds, 0);
      const newGoalPct = Math.min(100, Math.round(((currentTotal + seconds) / DAILY_GOAL_SECS) * 100));
      const xpGained = Math.floor(seconds / 60);
      const nextSessions = [payload, ...sessions];
      writeGuestDashboardData({
        courses,
        sessions: nextSessions,
        recentSessions: nextSessions,
        objectives: todayObjectives,
      });
      setSessions(nextSessions);
      setSaveStatus("success");
      setTimeout(() => setSaveStatus("idle"), 2500);
      setCompletionToast({ durationSecs: seconds, goalPct: newGoalPct, xpGained });
      setToastVisible(false);
      setTimeout(() => setToastVisible(true), 50);
      setTimeout(() => {
        setToastVisible(false);
        setTimeout(() => setCompletionToast(null), 350);
      }, 4000);
      return;
    }

    enqueueSession(payload);

    // 3) Tentative d'envoi (id explicite → idempotence parfaite via PK sessions).
    const { data: inserted, error } = await supabase
      .from("sessions")
      .insert(payload)
      .select()
      .maybeSingle();

    savingRef.current = false;

    // 23505 = unique violation = déjà insérée → succès idempotent.
    const isDuplicateOk = error && error.code === "23505";

    if (error && !isDuplicateOk) {
      // Échec réseau/serveur : la session reste dans la queue, le banner prend
      // le relais et retentera automatiquement (online / focus / interval).
      setSaveStatus("queued");
      setTimeout(() => setSaveStatus("idle"), 3500);
      return;
    }

    // Succès : on retire le draft de la queue.
    removeFromQueue(payload.id);

    const currentTotal = sessions.reduce((a, s) => a + s.duration_seconds, 0);
    const newGoalPct = Math.min(100, Math.round(((currentTotal + seconds) / DAILY_GOAL_SECS) * 100));
    const xpGained = Math.floor(seconds / 60);

    // Optimistic update — use the server row si dispo, sinon notre payload
    // (cas du 23505 idempotent où inserted === null mais la ligne existe).
    const sessionRow = inserted || payload;
    clearDashboardCache();
    setSessions(prev => prev.some(s => s.id === sessionRow.id) ? prev : [sessionRow, ...prev]);
    notifyXPChanged();
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
    if (isGuest) {
      const nextCourses = courses.map(c => c.id === courseId ? { ...c, exam_date: examDate || null } : c);
      setCourses(nextCourses);
      writeGuestDashboardData({ courses: nextCourses, sessions, recentSessions: sessions, objectives: todayObjectives });
      return;
    }
    await supabase.from("courses").update({ exam_date: examDate || null }).eq("id", courseId);
    setCourses(prev => prev.map(c => c.id === courseId ? { ...c, exam_date: examDate || null } : c));
  }

  async function deleteSession(id) {
    clearDashboardCache();
    if (isGuest) {
      const nextSessions = sessions.filter(s => s.id !== id);
      setSessions(nextSessions);
      writeGuestDashboardData({ courses, sessions: nextSessions, recentSessions: nextSessions, objectives: todayObjectives });
      return;
    }
    await supabase.from("sessions").delete().eq("id", id);
    setSessions(prev => prev.filter(s => s.id !== id));
  }

  async function updateSession(session) {
    const newMins = parseInt(editMinutes, 10);
    const maxMins = Math.floor(session.duration_seconds / 60);
    if (isNaN(newMins) || newMins < 1 || newMins > maxMins) return;
    const newSecs = newMins * 60;
    clearDashboardCache();
    if (isGuest) {
      const nextSessions = sessions.map(s => s.id === session.id
        ? { ...s, duration_seconds: newSecs, course_id: editCourseId || null }
        : s
      );
      setSessions(nextSessions);
      writeGuestDashboardData({ courses, sessions: nextSessions, recentSessions: nextSessions, objectives: todayObjectives });
      setEditingSessionId(null);
      return;
    }
    const endedAt = session.ended_at ? new Date(session.ended_at) : new Date();
    const adjustedStartedAt = new Date(endedAt.getTime() - newSecs * 1000).toISOString();
    await supabase.from("sessions").update({
      duration_seconds: newSecs,
      course_id: editCourseId || null,
      started_at: adjustedStartedAt,
    }).eq("id", session.id);
    setSessions(prev => prev.map(s => s.id === session.id
      ? { ...s, duration_seconds: newSecs, course_id: editCourseId || null, started_at: adjustedStartedAt }
      : s
    ));
    setEditingSessionId(null);
  }

  async function addCourse(e) {
    e.preventDefault();
    const name = newCourse.trim();
    if (!name) return;
    if (isGuest) {
      const data = {
        id: newClientId(),
        user_id: GUEST_USER_ID,
        name,
        color: newColor,
        exam_date: null,
        created_at: new Date().toISOString(),
      };
      const nextCourses = [...courses, data];
      setNewCourse("");
      setCourses(nextCourses);
      setCourseId(data.id);
      writeGuestDashboardData({ courses: nextCourses, sessions, recentSessions: sessions, objectives: todayObjectives });
      return;
    }
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
    if (isGuest) {
      const nextCourses = courses.filter((c) => c.id !== id);
      const nextSessions = sessions.map((s) => s.course_id === id ? { ...s, course_id: null } : s);
      setCourses(nextCourses);
      setSessions(nextSessions);
      writeGuestDashboardData({ courses: nextCourses, sessions: nextSessions, recentSessions: nextSessions, objectives: todayObjectives });
      if (courseId === id) setCourseId(nextCourses[0]?.id || "");
      return;
    }
    await supabase.from("courses").delete().eq("id", id);
    setCourses((prev) => prev.filter((c) => c.id !== id));
    if (courseId === id) setCourseId("");
  }

  const totalToday = sessions.reduce((a, s) => a + s.duration_seconds, 0);
  const goalPct = Math.min(100, Math.round((totalToday / DAILY_GOAL_SECS) * 100));

  // Objectif effectif des Blocus Blocks : phase pomodoro > objectif de
  // session > mode libre (null → les blocs poussent sans fin).
  const pomoTargetSecs = pomoPhase === "work" ? POMO_WORK : POMO_BREAK;
  const sessionGoalSecs = !pomodoro && sessionGoalMin ? sessionGoalMin * 60 : null;
  const blockGoalSecs = pomodoro ? pomoTargetSecs : sessionGoalSecs;
  // Marée du mode focus : monte vers l'objectif ; en libre, ambiance basse
  // et constante (aucune "fin" à suggérer).
  const focusTidePct = blockGoalSecs ? Math.min(1, elapsed / blockGoalSecs) : 0.22;

  // ── Records (fenêtre 90 jours) ────────────────────────────────
  const dayTotals = {};
  recentSessions.forEach(s => {
    const d = (s.started_at || "").slice(0, 10);
    if (d) dayTotals[d] = (dayTotals[d] || 0) + (s.duration_seconds || 0);
  });
  const bestDaySecs = Object.values(dayTotals).reduce((m, v) => Math.max(m, v), 0);
  const longestSessionSecs = recentSessions.reduce((m, s) => Math.max(m, s.duration_seconds || 0), 0);
  const weekStart = new Date();
  weekStart.setDate(weekStart.getDate() - 6);
  const weekStartISO = weekStart.toISOString().slice(0, 10);
  const weekSecs = Object.entries(dayTotals).reduce((a, [d, v]) => (d >= weekStartISO ? a + v : a), 0);

  // ── Texte intelligent sous les blocs — UNE phrase, selon le mode ──
  const blkValidated = Math.floor(elapsed / BLOCK_SECS);
  const blkGoalCount = blockGoalSecs ? Math.max(1, Math.ceil(blockGoalSecs / BLOCK_SECS)) : null;
  const blkReached = blockGoalSecs ? elapsed >= blockGoalSecs : false;
  const nextBlockMin = Math.max(1, Math.ceil((BLOCK_SECS - (elapsed % BLOCK_SECS)) / 60));
  function blockLine() {
    if (isPaused) return t("dash.blkPause").replace("{t}", pauseSince);
    if (pomodoro) {
      if (pomoPhase === "break") return t("dash.nextAutoStart");
      const rem = formatMinutesShort(Math.max(0, blockGoalSecs - elapsed));
      return t("dash.blkPomo")
        .replace("{done}", String(Math.min(blkValidated, blkGoalCount)))
        .replace("{total}", String(blkGoalCount))
        .replace("{t}", rem);
    }
    if (blockGoalSecs) {
      if (blkReached) return t("dash.blkGoalOver").replace("{m}", String(Math.max(0, Math.floor((elapsed - blockGoalSecs) / 60))));
      const rem = formatMinutesShort(Math.max(0, blockGoalSecs - elapsed));
      return t("dash.blkGoal").replace("{done}", String(blkValidated)).replace("{total}", String(blkGoalCount)).replace("{t}", rem);
    }
    // Mode libre : rien tant qu'on n'a pas démarré (les chips objectif sont là).
    if (!running && elapsed === 0) return null;
    if (blkValidated === 0) return t("dash.blkFreeNext").replace("{m}", String(nextBlockMin));
    return (blkValidated === 1 ? t("dash.blkFreeOne") : t("dash.blkFreeMany").replace("{n}", String(blkValidated)))
      .replace("{m}", String(nextBlockMin));
  }
  const liveMessage = blockLine();

  // ── Moments — le bon message au bon moment ────────────────────
  // Détectés au franchissement d'un seuil (une seule fois par session),
  // affichés 8 s en priorité sur la rotation ambiante, en vert accent.
  const [moment, setMoment] = useState(null);
  const momentsFired = useRef(new Set());
  const momentTimer = useRef(null);
  const sessionActiveRef = useRef(false);

  // La fin de session (retour à zéro) réarme les moments.
  useEffect(() => {
    const active = running || elapsed > 0;
    if (!active && sessionActiveRef.current) {
      momentsFired.current = new Set();
      setMoment(null);
    }
    sessionActiveRef.current = active;
  }, [running, elapsed]);

  useEffect(() => {
    if (!running || (pomodoro && pomoPhase === "break")) return;
    function fire(id, text) {
      if (momentsFired.current.has(id)) return;
      momentsFired.current.add(id);
      setMoment({ id, text });
      clearTimeout(momentTimer.current);
      momentTimer.current = setTimeout(() => setMoment(null), 8000);
    }
    // Du plus banal au plus précieux : si plusieurs seuils tombent dans le
    // même tick, le dernier setMoment gagne → le plus rare l'emporte.
    const blocks = Math.floor(elapsed / BLOCK_SECS);
    if (blocks >= 1) fire(`block${blocks}`, t("coach.timer.block"));
    const hours = Math.floor(elapsed / 3600);
    if (hours >= 1) fire(`hour${hours}`, t("dash.momentHour").replace("{h}", String(hours)));
    if (sessionGoalSecs && elapsed >= sessionGoalSecs) fire("sessionGoal", t("dash.momentSessionGoal"));
    if (totalToday < DAILY_GOAL_SECS && totalToday + elapsed >= DAILY_GOAL_SECS) fire("daily", t("dash.momentDaily"));
    if (longestSessionSecs > 0 && elapsed > longestSessionSecs) fire("longest", t("dash.momentLongest"));
    if (bestDaySecs > 0 && totalToday < bestDaySecs && totalToday + elapsed > bestDaySecs) fire("bestDay", t("dash.momentBestDay"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [elapsed, running, pomodoro, pomoPhase]);

  const timerCoach = moment
    ? { id: `timer-${moment.id}`, message: moment.text, persistence: false, live: true }
    : isPaused
      ? {
          id: pauseSeconds >= 10 * 60 ? "timer-long-pause" : "timer-pause",
          message: t(pauseSeconds >= 10 * 60 ? "coach.timer.longPause" : "coach.timer.pause"),
          persistence: "session",
          live: false,
        }
      : (!running && elapsed === 0)
        ? { id: "timer-ready", message: t("coach.timer.ready"), persistence: "day", live: false }
        : null;
  const showGuestIntro = isGuest && !running && elapsed === 0;

  const perCourse = courses.map((c) => ({
    ...c,
    secs: sessions
      .filter((s) => s.course_id === c.id)
      .reduce((a, s) => a + s.duration_seconds, 0),
  }));
  const courseName = (id) => courses.find((c) => c.id === id)?.name || "—";

  // Anti-effacement accidentel : demande confirmation si une session > 60s est
  // en cours / en pause au moment d'un changement de mode (libre ↔ pomodoro).
  function confirmDiscardIfWorking() {
    if (elapsed > 60 && typeof window !== "undefined") {
      return window.confirm(t("dash.discardConfirm"));
    }
    return true;
  }

  // Quand la queue se vide en arrière-plan, on rafraîchit la liste pour que
  // les sessions précédemment "queued" apparaissent enfin sur le dashboard.
  function handlePendingSynced() {
    if (isGuest) return;
    clearDashboardCache();
    load();
    notifyXPChanged();
  }

  return (
    <Layout>
      {!isGuest && <PendingSessionsBanner onSynced={handlePendingSynced} />}
      {/* Backdrop pour fermer le menu cours */}
      {showCourseMenu && (
        <div className="fixed inset-0 z-10" onClick={() => setShowCourseMenu(false)} />
      )}

      {showGuestIntro && (
        <section className="mb-5 overflow-hidden rounded-2xl px-4 py-4 sm:px-5"
          style={{ backgroundColor: "var(--bt-accent-bg)", border: "1px solid var(--bt-accent-border)" }}>
          <div className="flex items-end gap-3 sm:items-center">
            <Mascot streak={12} size={76} className="h-[70px] w-[70px] shrink-0" ariaLabel="Mascotte de Blocus Tracker" />
            <div className="relative min-w-0 flex-1 rounded-2xl px-4 py-3"
              style={{ backgroundColor: "var(--bt-surface)", border: "1px solid var(--bt-border)", boxShadow: "0 8px 24px var(--bt-shadow)" }}>
              <span aria-hidden="true" className="absolute -left-2 bottom-4 h-4 w-4 rotate-45"
                style={{ backgroundColor: "var(--bt-surface)", borderBottom: "1px solid var(--bt-border)", borderLeft: "1px solid var(--bt-border)" }} />
              <p className="relative text-sm font-semibold" style={{ color: "var(--bt-text-1)" }}>{t("guest.discoveryTitle")}</p>
              <p className="relative mt-1 text-xs leading-relaxed" style={{ color: "var(--bt-text-2)" }}>
                {t("guest.discoveryText")}
              </p>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2 sm:ml-[82px]">
            <Link href="/planning" className="btn-ghost px-3 py-2 text-xs">{t("guest.viewPlanning")}</Link>
            <Link href="/stats" className="btn-ghost px-3 py-2 text-xs">{t("guest.viewStats")}</Link>
            <Link href="/feed" className="btn-ghost px-3 py-2 text-xs">{t("guest.discoverSocial")}</Link>
            <span className="hidden flex-1 sm:block" />
            <Link href="/signup" className="btn-primary px-3 py-2 text-xs">{t("guest.keepProgress")}</Link>
            <Link href="/login" className="px-2 py-2 text-xs font-semibold" style={{ color: "var(--bt-accent-dark)" }}>
              {t("guest.signIn")}
            </Link>
          </div>
        </section>
      )}

      {/* Étirement de la ligne UNIQUEMENT s'il y a un second bloc (Sessions
          du jour / À faire) pour remplir la colonne gauche : sinon (rien à
          afficher là), on reste en hauteur naturelle pour ne pas étirer la
          carte Chrono dans le vide comme le faisait l'ancien alignement. */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3 min-w-0 bt-stagger"
        style={{ alignItems: (sessions.length > 0 || todayObjectives.length > 0) ? "stretch" : "start" }}>

        {/* ══════════════════════════════════════════
            COLONNE GAUCHE — Chronomètre + Sessions/À faire du jour
        ══════════════════════════════════════════ */}
        <div className="lg:col-span-2 flex flex-col gap-5 min-w-0">
        <section className="card relative min-w-0 transition-all duration-300 overflow-hidden"
          style={{
            backgroundColor: isPaused ? "rgba(239,68,68,0.06)" : "var(--bt-surface)",
            borderColor:     isPaused ? "rgba(239,68,68,0.35)" : "var(--bt-border)",
            boxShadow:       isPaused ? "0 4px 32px rgba(239,68,68,0.10)" : "0 4px 32px var(--bt-shadow)",
          }}>

          {/* Halo de progression — le fond respire et s'intensifie avec la
              session (opacité seule : GPU, aucun re-layout) */}
          <div aria-hidden className="absolute inset-x-0 bottom-0 pointer-events-none"
            style={{
              height: "58%",
              background: "radial-gradient(ellipse at 50% 100%, rgba(20,184,133,0.10), transparent 70%)",
              opacity: (running || elapsed > 0) && !isPaused ? 0.35 + focusTidePct * 0.65 : 0,
              transition: "opacity 1.5s ease",
            }} />

          {/* ── Barre de contexte : cours actif · modes · plein écran ── */}
          <div className="flex flex-wrap items-center gap-2 px-5 pt-5 sm:px-6 sm:pt-6 relative z-20">
            {/* Sélecteur de cours */}
            <div className="relative min-w-0">
              {courses.length === 0 ? (
                <span className="inline-flex items-center px-3 py-2 rounded-full text-xs font-medium"
                  style={{ backgroundColor: "var(--bt-subtle)", border: "1px dashed var(--bt-border)", color: "var(--bt-text-3)" }}>
                  {t("dash.addCourseHint")}
                </span>
              ) : (
                <button
                  onClick={() => !running && setShowCourseMenu(s => !s)}
                  disabled={running}
                  className="inline-flex items-center gap-2 pl-3 pr-2.5 py-2 rounded-full text-sm font-medium transition-all max-w-full"
                  style={{
                    backgroundColor: "var(--bt-subtle)",
                    border: `1px solid ${showCourseMenu ? "#14B885" : "var(--bt-border)"}`,
                    boxShadow: showCourseMenu ? "0 0 0 3px rgba(20,184,133,0.12)" : "none",
                    color: courseId ? "var(--bt-text-1)" : "var(--bt-text-3)",
                  }}>
                  {courseId && (
                    <span className="w-2.5 h-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: courses.find(c => c.id === courseId)?.color }} />
                  )}
                  <span className="truncate max-w-[130px] sm:max-w-[200px]">
                    {courseId ? courseName(courseId) : t("dash.selectCourse")}
                  </span>
                  {!running && (
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                      style={{ transform: showCourseMenu ? "rotate(180deg)" : "none", transition: "transform 0.2s", opacity: 0.6 }}>
                      <polyline points="6 9 12 15 18 9"/>
                    </svg>
                  )}
                </button>
              )}

              {/* Menu déroulant des cours */}
              {showCourseMenu && !running && (
                <div className="absolute top-full left-0 mt-1.5 w-72 max-w-[78vw] rounded-2xl z-30 overflow-hidden"
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

            {/* Badge examen du cours actif */}
            {(() => {
              const c = courses.find(x => x.id === courseId);
              if (!c?.exam_date) return null;
              const d = daysUntilExam(c.exam_date);
              return (
                <span className="text-[11px] px-2.5 py-1 rounded-full font-bold shrink-0 whitespace-nowrap" style={{
                  backgroundColor: d <= 0 ? "#FEF2F2" : d <= 7 ? "#FEF3C7" : "#EAFBF4",
                  color: d <= 0 ? "#DC2626" : d <= 7 ? "#D97706" : "#0E8F68",
                }}>
                  {d === 0 ? t("exam.today") : d < 0 ? t("exam.passed") : `J-${d}`}
                </span>
              );
            })()}

            <div className="flex-1" />

            {/* Segmented Libre / Pomodoro */}
            <div className="flex rounded-full p-0.5 gap-0.5 shrink-0"
              style={{ backgroundColor: "var(--bt-subtle)", border: "1px solid var(--bt-border)" }}>
              <button
                onClick={() => { if (!pomodoro) return; if (!confirmDiscardIfWorking()) return; setPomodoro(false); if (running || elapsed > 0) { pause(); reset(); } setPomoPhase("work"); setPomoCount(0); }}
                className="px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all"
                style={!pomodoro
                  ? { backgroundColor: "var(--bt-surface)", color: "var(--bt-text-1)", boxShadow: "0 1px 4px var(--bt-shadow)" }
                  : { color: "var(--bt-text-3)" }}>
                {t("dash.free")}
              </button>
              <button
                onClick={() => { if (pomodoro) return; if (!confirmDiscardIfWorking()) return; setPomodoro(true); if (running || elapsed > 0) { pause(); reset(); } setPomoPhase("work"); setPomoCount(0); pomoHandled.current = false; }}
                className="px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all"
                style={pomodoro
                  ? { backgroundColor: "var(--bt-surface)", color: "var(--bt-text-1)", boxShadow: "0 1px 4px var(--bt-shadow)" }
                  : { color: "var(--bt-text-3)" }}>
                Pomodoro
              </button>
            </div>

            {/* Plein écran → mode focus */}
            <button onClick={() => setFocusMode(true)} title={t("dash.focusMode")} aria-label={t("dash.focusMode")}
              className="w-9 h-9 flex items-center justify-center rounded-full shrink-0 transition-colors"
              style={{ backgroundColor: "var(--bt-subtle)", border: "1px solid var(--bt-border)", color: "var(--bt-text-3)" }}
              onMouseEnter={e => { e.currentTarget.style.color = "var(--bt-text-1)"; }}
              onMouseLeave={e => { e.currentTarget.style.color = "var(--bt-text-3)"; }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/>
              </svg>
            </button>
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

          {/* ── Héros : chiffres + onde de session + ligne vivante ── */}
          <div className="px-5 sm:px-6 pt-9 sm:pt-11 pb-1 text-center">
            {pomodoro && (
              <div className="text-[11px] font-bold uppercase tracking-[0.18em] mb-5"
                style={{ color: pomoPhase === "work" ? "#14B885" : "#0ea5e9" }}>
                {pomoPhase === "work" ? t("dash.work") : t("dash.pause")}
                {pomoCount > 0 && <span className="font-medium ml-2 opacity-60">· {t("dash.cycle")} {pomoCount}</span>}
              </div>
            )}
            {isPaused && !pomodoro && (
              <div className="mb-5 flex justify-center">
                <span className="bt-pause-pulse inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.14em] px-3 py-1.5 rounded-full"
                  style={{ color: PAUSE_ACCENT, backgroundColor: "rgba(203,90,78,0.10)", border: "1px solid rgba(203,90,78,0.30)" }}>
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg>
                  {t("dash.pausedStatus")}
                </span>
              </div>
            )}

            <TimerDigits
              seconds={pomodoro ? Math.max(0, pomoTargetSecs - elapsed) : elapsed}
              color={isPaused && !pomodoro ? PAUSE_ACCENT : "var(--bt-text-1)"} />

            <div className="mt-8 mx-auto w-full max-w-[440px]">
              <BlocusBlocks elapsed={elapsed} running={running} paused={isPaused && !pomodoro} goalSecs={blockGoalSecs} />
            </div>

            {/* Coach visible uniquement avant, en pause ou lors d'un vrai
                accomplissement. Pendant le travail normal, la ligne reste
                textuelle pour ne pas distraire. */}
            <div className={`${showGuestIntro ? "h-5 mt-5" : "min-h-[92px] mt-4"} flex items-center justify-center`}>
              {timerCoach && !focusMode && !showGuestIntro ? (
                <MascotCoach
                  id={timerCoach.id}
                  message={timerCoach.message}
                  streak={streak}
                  persistence={timerCoach.persistence}
                  live={timerCoach.live}
                  className="w-full max-w-md"
                  size={72}
                />
              ) : !timerCoach && liveMessage ? (
                <p key={liveMessage} className={`text-sm ${isPaused ? "font-medium" : "bt-msg-swap"}`}
                  style={{ color: isPaused ? PAUSE_ACCENT : "var(--bt-text-3)" }}>
                  {liveMessage}
                </p>
              ) : null}
            </div>
          </div>

          {/* ── Objectif de session — poser l'intention avant de démarrer ── */}
          {!pomodoro && !running && elapsed === 0 && (
            <div className="px-5 sm:px-6 mt-3">
              <p className="text-[11px] font-bold uppercase tracking-wider text-center mb-2.5" style={{ color: "var(--bt-text-4)" }}>
                {t("dash.sessionGoalLabel")}
              </p>
              <div className="flex flex-wrap justify-center gap-1.5">
                {[[25, "25 min"], [45, "45 min"], [60, "1 h"], [90, "1 h 30"], [120, "2 h"], [null, "∞"]].map(([m, label]) => (
                  <button key={label} type="button" onClick={() => pickSessionGoal(m)}
                    title={m === null ? t("dash.noGoal") : undefined}
                    aria-pressed={sessionGoalMin === m}
                    className="px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all bt-press"
                    style={sessionGoalMin === m
                      ? { backgroundColor: "#14B885", color: "#fff", boxShadow: "0 2px 8px rgba(20,184,133,0.25)" }
                      : { backgroundColor: "var(--bt-subtle)", border: "1px solid var(--bt-border)", color: "var(--bt-text-2)" }}>
                    {label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* ── Note — champ discret, souligné au focus seulement ── */}
          {(!pomodoro || pomoPhase === "work") && (
            <div className="px-5 sm:px-6 mt-4">
              <input
                className="block w-full max-w-xs mx-auto text-center text-sm bg-transparent outline-none py-1.5"
                style={{ color: "var(--bt-text-1)", borderBottom: "1px solid transparent", transition: "border-color 0.2s" }}
                onFocus={e => { e.currentTarget.style.borderBottomColor = "var(--bt-border)"; }}
                onBlur={e => { e.currentTarget.style.borderBottomColor = "transparent"; }}
                placeholder={t("dash.notePlaceholder")}
                value={note}
                onChange={(e) => setNote(e.target.value)} />
            </div>
          )}

          {/* ── Actions ── */}
          <div className="px-5 sm:px-6 pt-6 pb-5 sm:pb-6">
            {pomoPhase === "break" && pomodoro ? (
              <div className="max-w-md mx-auto">
                <button className="btn-ghost w-full py-3 text-sm"
                  onClick={() => { pause(); reset(); setPomoPhase("work"); pomoHandled.current = false; }}>
                  {t("dash.skipBreak")} →
                </button>
              </div>
            ) : (
              <div className="flex flex-col xs:flex-row items-stretch justify-center gap-2.5 max-w-md mx-auto">
                {!running ? (
                  <button
                    className="flex-1 py-3.5 rounded-full text-sm font-bold transition-all flex items-center justify-center gap-2 bt-press"
                    style={{
                      backgroundImage: "linear-gradient(165deg, #14B885, #0E8F68 115%)",
                      color: "#fff",
                      boxShadow: "0 4px 16px rgba(20,184,133,0.30)",
                      opacity: (!courseId && !pomodoro) ? 0.45 : 1,
                    }}
                    onClick={() => { start(); setFocusMode(true); }}
                    disabled={!courseId && !pomodoro}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
                      <polygon points="5 3 19 12 5 21 5 3"/>
                    </svg>
                    {elapsed > 0 ? t("dash.resume") : t("dash.start")}
                  </button>
                ) : (
                  <button
                    className="flex-1 py-3.5 rounded-full text-sm font-bold transition-all flex items-center justify-center gap-2 bt-press"
                    style={{ backgroundColor: "var(--bt-subtle)", color: "var(--bt-text-1)", border: "1px solid var(--bt-border)" }}
                    onClick={pause}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
                      <rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/>
                    </svg>
                    {t("dash.pause")}
                  </button>
                )}
                {(elapsed >= 1 || saveStatus !== "idle") && (
                  <button
                    className="flex-1 py-3.5 rounded-full text-sm font-bold transition-all flex items-center justify-center gap-2 bt-press"
                    style={{
                      backgroundColor: saveStatus === "success" ? "#14B885"
                        : saveStatus === "error" ? "#ef4444"
                        : "var(--bt-text-1)",
                      color: saveStatus === "success" || saveStatus === "error" ? "#fff" : "var(--bt-surface)",
                      opacity: (elapsed < 1 && saveStatus === "idle") || saveStatus === "saving" ? 0.45 : 1,
                    }}
                    onClick={() => { setPomodoro(false); setPomoPhase("work"); setPomoCount(0); stopAndSave(); }}
                    disabled={elapsed < 1 || saveStatus === "saving"}>
                    {saveStatus === "saving" ? (
                      <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    ) : saveStatus === "success" ? (
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12"/>
                      </svg>
                    ) : (
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
                        <rect x="3" y="3" width="18" height="18" rx="2"/>
                      </svg>
                    )}
                    {saveStatus === "saving"  ? t("common.saving")
                      : saveStatus === "success" ? t("dash.saveSuccess")
                      : saveStatus === "error"   ? t("dash.saveError")
                      : t("dash.finish")}
                  </button>
                )}
              </div>
            )}
            <p className="text-[11px] text-center mt-4" style={{ color: "var(--bt-text-4)" }}>{t("dash.subtitle")}</p>
          </div>
        </section>

        {/* Sessions du jour / À faire — flex-1 À PARTIR DE lg seulement : à
            ce breakpoint la carte partage une ligne de grille avec la
            colonne Aujourd'hui/Mes cours et doit s'étirer pour l'égaler
            (contenu débordant → la LISTE défile, la carte n'excède jamais
            cette hauteur). En dessous de lg (mono-colonne, pas de colonne à
            égaler), un flex-basis fixe non conditionnel créerait un vide
            artificiel — d'où le préfixe lg: sur la classe flex ci-dessous. */}
        {sessions.length > 0 && (
          <section className="card p-5 flex flex-col min-h-0 lg:[flex:1_1_260px]">
            <h2 className="text-sm font-bold uppercase tracking-wider mb-4 shrink-0" style={{ color: "var(--bt-text-3)" }}>{t("dash.todaySessions")}</h2>
            <ul className="divide-y flex-1 min-h-0 overflow-y-auto" style={{ borderColor: "var(--bt-border)" }}>
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
          <section className="card p-5 flex flex-col min-h-0 lg:[flex:1_1_200px]">
            <h2 className="text-sm font-bold uppercase tracking-wider mb-4 shrink-0" style={{ color: "var(--bt-text-3)" }}>{t("dash.todo")}</h2>
            <ul className="space-y-2 flex-1 min-h-0 overflow-y-auto">
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

        {/* ══════════════════════════════════════════
            SIDE — Aujourd'hui + Mes cours
        ══════════════════════════════════════════ */}
        <div className="space-y-5 min-w-0">

          {/* ── Aujourd'hui — surface ink signature ── */}
          <section className="card-ink bt-grain p-5 min-w-0 relative">
          <div className="relative z-10">
            {/* La mascotte vit désormais autour du chrono. Ici, la série reste
                lisible comme une donnée, sans deuxième personnage concurrent. */}
            {streak > 0 && (
              <div className="absolute top-2 right-3 flex items-center gap-1.5 sm:right-4">
                {/* Gels de série restants — filet anti-perte de série (v29) */}
                {freezeInfo?.supported && freezeInfo.stock > 0 && (
                  <span className="flex items-center gap-1 px-2 py-0.5 rounded-full"
                    title={t("streak.freezeStock")} aria-label={t("streak.freezeStock")}
                    style={{ backgroundColor: "rgba(14,165,233,0.16)", border: "1px solid rgba(14,165,233,0.30)" }}>
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#7DD3FC" strokeWidth="2" strokeLinecap="round">
                      <path d="M12 2v20M4 6l16 12M20 6L4 18M12 2l-2.5 2.5M12 2l2.5 2.5M12 22l-2.5-2.5M12 22l2.5-2.5"/>
                    </svg>
                    <span className="text-[11px] font-bold font-num tabular-nums" style={{ color: "#BAE6FD" }}>{freezeInfo.stock}</span>
                  </span>
                )}
                <span className="flex items-center gap-1 px-2 py-0.5 rounded-full"
                  style={{ backgroundColor: "rgba(255,255,255,0.12)", border: "1px solid rgba(255,255,255,0.12)" }}>
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="#FBBF24" stroke="none">
                    <path d="M12 2c.5 2.5 2 4.2 3.5 5.8C17 9.4 18 11 18 13a6 6 0 0 1-12 0c0-1.2.4-2.2 1-3 .3 1.2 1.2 2 2.3 2 .6-2.3-.3-4.3 2.7-10z"/>
                  </svg>
                  <span className="text-[11px] font-bold font-num tabular-nums" style={{ color: "#fff" }}>{streak} {t("dash.streak")}</span>
                </span>
              </div>
            )}
            <p className="text-xs font-bold uppercase tracking-wider mb-1" style={{ color: "var(--bt-accent)" }}>
              {t("dash.today")}
            </p>
            <div className="font-num font-bold tabular-nums mb-3"
              style={{ fontSize: "clamp(2rem,6vw,2.5rem)", color: "var(--bt-ink-text)", lineHeight: 1.1, letterSpacing: "-0.02em" }}>
              {formatMinutesShort(totalToday)}
            </div>
            <div className="mb-4">
              <div className="flex items-center justify-between text-xs mb-1.5" style={{ color: "var(--bt-ink-muted)" }}>
                <span>{t("dash.goal")}</span>
                <span className="font-bold tabular-nums">{goalPct}%</span>
              </div>
              <div className="w-full h-2 rounded-full overflow-hidden" style={{ backgroundColor: "rgba(255,255,255,0.14)" }}>
                <div className="h-full rounded-full transition-all duration-700"
                  style={{ width: `${goalPct}%`, backgroundImage: "linear-gradient(90deg, #14B885, #2BD9A4)" }} />
              </div>
            </div>
            <ul className="space-y-2">
              {perCourse.filter((c) => c.secs > 0).map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-2 text-sm overflow-hidden">
                  <span className="flex items-center gap-2 min-w-0">
                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: c.color }} />
                    <span className="truncate min-w-0" style={{ color: "var(--bt-ink-muted)" }}>{c.name}</span>
                  </span>
                  <span className="shrink-0 tabular-nums font-semibold" style={{ color: "var(--bt-ink-text)" }}>{formatMinutesShort(c.secs)}</span>
                </li>
              ))}
              {totalToday === 0 && (
                <li className="text-sm" style={{ color: "var(--bt-ink-muted)" }}>{t("dash.noSession")}</li>
              )}
            </ul>

            {/* Records — repères à battre, calculés sur les 90 derniers jours */}
            {(bestDaySecs > 0 || weekSecs > 0) && (
              <div className="mt-4 pt-4 grid grid-cols-2 gap-x-4 gap-y-3"
                style={{ borderTop: "1px solid var(--bt-ink-border)" }}>
                {[
                  [t("dash.recBestDay"), formatMinutesShort(bestDaySecs)],
                  [t("dash.recLongest"), formatMinutesShort(longestSessionSecs)],
                  [t("dash.recWeek"), formatMinutesShort(weekSecs)],
                  [t("dash.recBestStreak"), `${bestStreak} ${t("dash.daysShort")}`],
                ].map(([label, value]) => (
                  <div key={label}>
                    <p className="text-[10px] font-bold uppercase tracking-wider mb-0.5"
                      style={{ color: "var(--bt-ink-muted)", opacity: 0.8 }}>{label}</p>
                    <p className="font-num font-bold tabular-nums text-base" style={{ color: "var(--bt-ink-text)" }}>{value}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
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
                  className="[&::-webkit-scrollbar]:hidden flex gap-2"
                  style={{
                    overflowX: "auto",
                    scrollbarWidth: "none",
                    WebkitOverflowScrolling: "touch",
                    // `overflow-x: auto` fait implicitement passer overflow-y à
                    // "auto" aussi (règle CSS : un seul axe ne peut pas rester
                    // "visible"). Sans marge, ce conteneur ne fait QUE 26px de haut
                    // → l'anneau de sélection (qui déborde du cercle) se faisait
                    // rogner en haut, et à gauche pour la 1ère pastille (pas de
                    // marge gauche). Le padding donne la place au débordement de
                    // respirer sans être coupé.
                    padding: 8,
                    margin: -8,
                  }}>
                  {COLORS.map((col) => (
                    <button type="button" key={col} onClick={() => setNewColor(col)}
                      className="transition-all"
                      style={{
                        width: 26,
                        height: 26,
                        borderRadius: "50%",
                        backgroundColor: col,
                        // box-shadow au lieu de border/outline : le cercle garde sa
                        // couleur pleine (border-box grignotait le rond avec la
                        // bordure) et l'anneau suit parfaitement le rayon partout.
                        boxShadow: newColor === col
                          ? `0 0 0 2px var(--bt-surface), 0 0 0 4px var(--bt-text-1)`
                          : "none",
                        transform: newColor === col ? "scale(1.08)" : "scale(1)",
                        position: "relative",
                        zIndex: newColor === col ? 1 : 0,
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
                    {/* Checklist révision — aperçu + bouton */}
                    <div className="flex items-center justify-between gap-2 mt-1.5" onClick={(e) => e.stopPropagation()}>
                      <span className="text-[11px]" style={{ color: "var(--bt-text-3)" }}>
                        {t("checklist.revisionLabel")}{" "}
                        {(() => { const cc = checklistCounts[c.id]; return `${cc?.done || 0}/${cc?.total || 0}`; })()}
                      </span>
                      <button onClick={(e) => { e.stopPropagation(); setChecklistCourse(c); }}
                        className="text-[11px] font-semibold px-2 py-0.5 rounded-lg transition-colors"
                        style={{ backgroundColor: "var(--bt-subtle)", color: "var(--bt-accent-dark)", border: "1px solid var(--bt-border)" }}>
                        {t("checklist.button")}
                      </button>
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

      {/* Checklist de révision (depuis la carte Mes cours) */}
      {checklistCourse && user && (
        <CourseChecklistModal
          course={checklistCourse}
          userId={user.id}
          onClose={() => setChecklistCourse(null)}
          onChanged={loadChecklistCounts}
        />
      )}

      {/* Focus mode overlay */}
      {focusMode && (
        <div className="fixed inset-0 flex flex-col items-center justify-center transition-colors duration-500 overflow-hidden bt-grain"
          style={{
            background: (isPaused && !pomodoro) ? "#1E0F0D" : "var(--bt-ink)",
            zIndex: 100,
          }}>
          {/* Dégradé ink vivant — dérive lentement, coupé sur l'état pausé */}
          {!(isPaused && !pomodoro) && <div className="bt-ink-drift" />}

          {/* Marée de progression — lueur verte qui monte vers l'objectif
              (transform GPU). En mode libre elle reste basse (aucune fin). */}
          <div aria-hidden className="absolute inset-x-0 bottom-0 pointer-events-none"
            style={{
              height: "80%",
              background: "linear-gradient(to top, rgba(20,184,133,0.20), rgba(20,184,133,0.06) 55%, transparent)",
              transform: `scaleY(${(0.18 + focusTidePct * 0.82).toFixed(3)})`,
              transformOrigin: "bottom",
              opacity: (isPaused && !pomodoro) ? 0 : 1,
              transition: "transform 2.5s ease, opacity 0.6s ease",
            }} />

          {/* Marée bordeaux — remplace la verte en pause et pulse doucement */}
          {isPaused && !pomodoro && (
            <div aria-hidden className="absolute inset-x-0 bottom-0 pointer-events-none bt-pause-tide"
              style={{ height: "55%", background: "linear-gradient(to top, rgba(203,90,78,0.26), rgba(203,90,78,0.05) 60%, transparent)" }} />
          )}

          {/* Ambiance sonore synthétisée (opt-in, 0 fichier / 0 egress) */}
          <AmbientSoundControl active={focusMode} visible={focusCtlVisible || !running} />

          <p className="text-xs mb-5 relative z-10" style={{ color: "var(--bt-ink-muted)" }}>
            {focusGreeting(t)}
          </p>

          {pomodoro && (
            <p className="text-xs font-semibold uppercase tracking-widest mb-3 relative z-10"
              style={{ color: pomoPhase === "work" ? "#14B885" : "#0ea5e9" }}>
              {pomoPhase === "work" ? t("dash.work") : t("dash.pause")}
              {pomoCount > 0 && <span className="font-normal ml-2" style={{ color: "#555" }}>· {t("dash.cycle")} {pomoCount}</span>}
            </p>
          )}

          <p className="text-sm mb-2 relative z-10" style={{ color: "#A8A09A" }}>
            {courseId ? courseName(courseId) : t("dash.noCourse")}
          </p>

          <div className="relative z-10 w-full text-center px-6">
            <TimerDigits
              seconds={pomodoro ? Math.max(0, pomoTargetSecs - elapsed) : elapsed}
              color={(isPaused && !pomodoro) ? "#ef4444" : "var(--bt-ink-text)"}
              size="clamp(4.5rem, 16vw, 8.5rem)" />

            <div className="mt-10 mx-auto w-full max-w-[600px]">
              <BlocusBlocks elapsed={elapsed} running={running} paused={isPaused && !pomodoro} goalSecs={blockGoalSecs} focus />
            </div>

            <div className="min-h-[82px] mt-5 flex items-center justify-center">
              {timerCoach ? (
                <MascotCoach
                  id={timerCoach.id}
                  message={timerCoach.message}
                  streak={streak}
                  persistence={timerCoach.persistence}
                  live={timerCoach.live}
                  surface="ink"
                  className="w-full max-w-md"
                  size={58}
                />
              ) : liveMessage ? (
                <p key={liveMessage} className={`text-sm ${isPaused ? "font-medium" : "bt-msg-swap"}`}
                  style={{ color: isPaused ? "#E88A80" : "var(--bt-ink-muted)" }}>
                  {liveMessage}
                </p>
              ) : null}
            </div>

            {/* Indicateur EN PAUSE — pastille bordeaux qui pulse */}
            {isPaused && !pomodoro && (
              <div className="bt-pause-pulse inline-flex items-center gap-1.5 mt-4 px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-widest"
                style={{ color: "#E88A80", backgroundColor: "rgba(203,90,78,0.18)", letterSpacing: "0.12em" }}>
                <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg>
                {t("dash.pausedStatus")}
              </div>
            )}
          </div>

          <div className="relative z-10 mt-8 flex gap-3"
            style={{
              opacity: (focusCtlVisible || !running) ? 1 : 0,
              pointerEvents: (focusCtlVisible || !running) ? "auto" : "none",
              transition: "opacity 0.8s ease",
            }}>
            {pomoPhase === "break" && pomodoro ? (
              <button className="btn-ghost text-white border-white/20 px-8 py-3"
                onClick={() => { pause(); reset(); setPomoPhase("work"); pomoHandled.current = false; }}>
                {t("dash.skipBreak")}
              </button>
            ) : (
              <>
                {!running ? (
                  <button onClick={start} disabled={!courseId && !pomodoro}
                    className={`btn-primary px-10 py-3 text-base bt-press ${isPaused ? "bt-pause-cta" : ""}`}>
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
            className="relative z-10 mt-6 flex items-center gap-2 text-sm font-medium rounded-2xl px-5 py-2.5"
            style={{
              color: "rgba(255,255,255,0.45)",
              opacity: (focusCtlVisible || !running) ? 1 : 0,
              pointerEvents: (focusCtlVisible || !running) ? "auto" : "none",
              transition: "opacity 0.8s ease, color 0.2s ease",
            }}
            onMouseEnter={e => e.currentTarget.style.color = "rgba(255,255,255,0.8)"}
            onMouseLeave={e => e.currentTarget.style.color = "rgba(255,255,255,0.45)"}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
            {t("dash.exitFocus")}
          </button>

          {/* Raccourci clavier — desktop uniquement */}
          <p className="hidden sm:block relative z-10 mt-2 text-[11px]"
            style={{
              color: "rgba(255,255,255,0.25)",
              opacity: (focusCtlVisible || !running) ? 1 : 0,
              transition: "opacity 0.8s ease",
            }}>
            {t("dash.spaceHint")}
          </p>

        </div>
      )}

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
          pointerEvents: "auto",
        }}>
          <div
            className="min-w-[220px] max-w-[280px] lg:min-w-[340px] lg:max-w-[400px]"
            style={{
              position: "relative",
              backgroundColor: "#0E8F68",
              color: "#fff",
              borderRadius: 18,
              boxShadow: "0 8px 32px rgba(14,143,104,0.35)",
            }}>
            <button
              type="button"
              onClick={() => setCompletionToast(null)}
              aria-label={t("coach.close")}
              title={t("coach.close")}
              className="absolute top-2 right-2 w-7 h-7 rounded-full flex items-center justify-center text-lg"
              style={{ color: "rgba(255,255,255,0.75)" }}
            >
              ×
            </button>
            <div className="p-4 pr-10 lg:p-6 lg:pr-12 flex items-start gap-3">
              <Mascot streak={streak} size={58} className="shrink-0" ariaLabel={t("coach.timer.done")} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 mb-1.5 lg:mb-2">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                    <polyline points="20 6 9 17 4 12"/>
                  </svg>
                  <span className="font-semibold text-sm lg:text-base">{t("dash.doneTitle")}</span>
                </div>
                <p className="text-xs lg:text-sm mb-2" style={{ opacity: 0.9 }}>{t("coach.timer.done")}</p>
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
        </div>
      )}
    </Layout>
  );
}
