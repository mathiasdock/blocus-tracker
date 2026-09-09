import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import Layout from "../components/Layout";
import { PageContentSkeleton, useSkeletonHatch } from "../components/PageSkeleton";
import { useAuth } from "../contexts/AuthContext";
import { useTimer } from "../contexts/TimerContext";
import { useI18n } from "../contexts/I18nContext";
import { supabase } from "../lib/supabaseClient";
import { formatDuration, formatMinutesShort, todayISO, computeStreak, computeBestStreak, isStreakPaused } from "../lib/format";
import { notifyXPChanged } from "../lib/xpEvents";
import { readSessionGoal, writeSessionGoal } from "../lib/sessionGoal";
import { clearClientCache, getClientCache, setClientCache } from "../lib/clientCache";
import { newClientId, enqueueSession, removeFromQueue, flushPending } from "../lib/timerDraft";
import { useWakeLock } from "../lib/useWakeLock";
import { COURSE_COLORS } from "../lib/courseColors";
import { runStreakFreezeUpkeep, applyStreakFreezes, gapKey } from "../lib/streakFreezes";
import StreakFreezeOffer from "../components/StreakFreezeOffer";
import { useToast } from "../contexts/ToastContext";
import PendingSessionsBanner from "../components/PendingSessionsBanner";
import CourseChecklistModal from "../components/CourseChecklistModal";
import CourseEditorModal from "../components/CourseEditorModal";
import Mascot from "../components/Mascot";
import MascotCoach from "../components/MascotCoach";
import AmbientSoundControl from "../components/AmbientSoundControl";
import FocusShaderBackground from "../components/FocusShaderBackground";
import AnimatedNumber from "../components/AnimatedNumber";
import FilterMenu from "../components/FilterMenu";
import SessionCompleteCard from "../components/SessionCompleteCard";
import DailyProgressCard from "../components/DailyProgressCard";
import TodayProgressCard from "../components/TodayProgressCard";
import TodaySessionsCard from "../components/TodaySessionsCard";
import DashboardCoursesCard from "../components/DashboardCoursesCard";
import BlocusCard from "../components/BlocusCard";
import PushOptInPrompt from "../components/PushOptInPrompt";
import { toRanges } from "../lib/blocus";
import { buildSessionShareMessage } from "../lib/sessionShare";
import { clientRateLimit } from "../lib/security";
import { playSensoryCue, triggerHaptic } from "../lib/sensoryFeedback";

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
const PAUSE_ACCENT = "#EF4444";  // rouge vif — la pause doit se voir d'un coup d'oeil

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
function Block({ state, fraction = 0, focus, groupStart = false }) {
  const GREEN = "var(--bt-accent)";
  const base = {
    flex: 1,
    minWidth: focus ? 8 : 5,
    maxWidth: focus ? 46 : 30,
    height: focus ? 22 : 14,
    borderRadius: focus ? 6 : 4,
    position: "relative",
    overflow: "hidden",
    marginLeft: groupStart ? (focus ? 7 : 5) : 0,
    transition: "background-color 0.4s ease, box-shadow 0.4s ease, opacity 0.4s ease",
  };
  if (state === "done") {
    return <span style={{ ...base, backgroundColor: GREEN, boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.07)" }} />;
  }
  if (state === "bonus") {
    return <span style={{ ...base, backgroundImage: "linear-gradient(155deg,var(--bt-accent-hover),var(--bt-accent))", boxShadow: "0 0 10px rgba(20,184,133,0.32)" }} />;
  }
  if (state === "active") {
    return (
      <span className="bt-block-active" style={{ ...base, backgroundColor: focus ? "rgba(20,184,133,0.16)" : "var(--bt-accent-bg)" }}>
        <span style={{ position: "absolute", inset: 0, backgroundColor: GREEN, transform: `scaleX(${Math.max(0.07, fraction)})`, transformOrigin: "left", transition: "transform 0.9s linear" }} />
      </span>
    );
  }
  if (state === "paused") {
    return (
      <span className="bt-block-paused" style={{ ...base, backgroundColor: focus ? "rgba(239,68,68,0.18)" : "rgba(239,68,68,0.12)" }}>
        <span style={{ position: "absolute", inset: 0, backgroundColor: PAUSE_ACCENT, opacity: 0.9, transform: `scaleX(${Math.max(0.07, fraction)})`, transformOrigin: "left" }} />
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
        <Block key={i} state={s} fraction={s === "active" || s === "paused" ? fraction : 0} focus={focus} groupStart={i > 0 && i % 4 === 0} />
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
function TimerDigits({ seconds, color, size = "clamp(4.5rem, 21vw, 7rem)" }) {
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

// Refus de gel déjà exprimé pour un trou donné — évite de reposer la question
// en boucle le même jour, sans empêcher une nouvelle proposition plus tard.
const FREEZE_DECLINED_KEY = "bt_freeze_declined_v1";

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
  const sensoryElapsedRef = useRef(elapsed);
  sensoryElapsedRef.current = elapsed;
  const startWithFeedback = useCallback(() => {
    playSensoryCue(sensoryElapsedRef.current > 0 ? "resume" : "start");
    triggerHaptic("start");
    start();
  }, [start]);
  const pauseWithFeedback = useCallback(() => {
    playSensoryCue("pause");
    pause();
  }, [pause]);
  // Premier chargement des donnees de la page. Tant qu'il n'est pas termine on
  // affiche un squelette : sinon la page rend des zeros et des listes vides,
  // que les gens lisent comme un bug et non comme un chargement.
  const [ready, setReady] = useState(false);
  const forceSkeleton = useSkeletonHatch();
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
  const [courseEditorOpen, setCourseEditorOpen] = useState(false);
  const [editingCourse, setEditingCourse] = useState(null);
  const [courseEditorBusy, setCourseEditorBusy] = useState(false);
  const [saveStatus, setSaveStatus] = useState("idle"); // "idle"|"saving"|"success"|"error"
  const savingRef = useRef(false);
  const [completionToast, setCompletionToast] = useState(null);
  // Amis pour l'envoi depuis le récapitulatif. `null` = pas encore chargés ;
  // on ne les charge qu'au clic sur "Envoyer à un ami", pas à chaque fin de
  // session — la plupart des sessions ne sont pas partagées.
  const [shareFriends, setShareFriends] = useState(null);
  const [showCourseMenu, setShowCourseMenu] = useState(false);
  const [checklistCounts, setChecklistCounts] = useState({}); // courseId -> { done, total }
  const [checklistCourse, setChecklistCourse] = useState(null);
  const [recentSessions, setRecentSessions] = useState([]); // 90 jours — records & semaine
  const [freezeInfo, setFreezeInfo] = useState(null); // gel de série { frozenDays, stock, pendingDays, canRepair }
  const [freezeOfferOpen, setFreezeOfferOpen] = useState(false);
  const [freezeBusy, setFreezeBusy] = useState(false);
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
    setCourseId(current => c.some((course) => course.id === current) ? current : c[0]?.id || "");
    setSessions(data.sessions || []);
    setRecentSessions(data.recentSessions || []);
    setStreak(computeStreak(data.recentSessions || []));
    setBestStreak(computeBestStreak(data.recentSessions || []));
    setTodayObjectives(data.objectives || []);
  }, [setCourseId]);

  // Le TimerProvider hydrate son dernier cours indépendamment des données du
  // dashboard. Si ce cours a depuis été supprimé, ou si le jeu de données a
  // changé (mode invité), on retombe sur un cours réellement disponible au
  // lieu d'afficher un tiret impossible à sélectionner.
  useEffect(() => {
    if (!courses.length) return;
    if (!courses.some((course) => course.id === courseId)) setCourseId(courses[0].id);
  }, [courses, courseId, setCourseId]);

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
      // Le gel ne se consomme plus tout seul : on PROPOSE. Un refus déjà donné
      // pour ce même trou n'est pas redemandé (mais un nouveau trou le sera).
      if (res.canRepair && !freezeToastShown.current) {
        let declined = null;
        try { declined = localStorage.getItem(FREEZE_DECLINED_KEY); } catch {}
        if (declined !== gapKey(res.pendingDays)) {
          freezeToastShown.current = true;
          setFreezeOfferOpen(true);
        }
      }
    });
    return () => { alive = false; };
  }, [user, recentSessions]);

  // Accepter : consomme réellement les gels, puis recalcule la série.
  const acceptFreeze = useCallback(async () => {
    if (!freezeInfo?.pendingDays?.length || freezeBusy) return;
    setFreezeBusy(true);
    const res = await applyStreakFreezes(supabase, freezeInfo.pendingDays);
    setFreezeBusy(false);
    if (!res.ok) { toast(t("streak.offerFailed"), "error"); return; }
    const merged = [...freezeInfo.frozenDays, ...freezeInfo.pendingDays];
    setFreezeInfo({ ...freezeInfo, frozenDays: merged, stock: res.stock, pendingDays: [], canRepair: false });
    setStreak(computeStreak(recentSessions, merged));
    setBestStreak(computeBestStreak(recentSessions, merged));
    setFreezeOfferOpen(false);
    toast(t("streak.offerDone"), "success");
  }, [freezeInfo, freezeBusy, recentSessions, t, toast]);

  const declineFreeze = useCallback(() => {
    try { localStorage.setItem(FREEZE_DECLINED_KEY, gapKey(freezeInfo?.pendingDays)); } catch {}
    setFreezeOfferOpen(false);
  }, [freezeInfo]);

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
      if (data.done) {
        playSensoryCue("goal");
        triggerHaptic("goal");
      }
    }
  }

  useEffect(() => { load().finally(() => setReady(true)); }, [load]);

  useEffect(() => {
    if (!focusMode) return;
    function handler(e) { if (e.key === "Escape") setFocusMode(false); }
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    // Fond racine vert + nav mobile masqué : le plein écran couvre la safe-area
    // du home indicator iPhone (sinon une bande blanche reste en bas). → globals.css
    document.documentElement.classList.add("bt-focus-active");
    document.addEventListener("keydown", handler);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.documentElement.classList.remove("bt-focus-active");
      document.removeEventListener("keydown", handler);
    };
  }, [focusMode]);

  // Bascule Libre/Pomodoro. Regroupe la logique des deux anciens boutons sans
  // la changer : garde-fou anti-perte de session, remise a zero du cycle, et
  // reinitialisation du drapeau pomodoro seulement dans ce sens.
  function pickMode(next) {
    const wantPomodoro = next === "pomodoro";
    if (wantPomodoro === pomodoro) return;
    if (!confirmDiscardIfWorking()) return;
    setPomodoro(wantPomodoro);
    if (running || elapsed > 0) { pause(); reset(); }
    setPomoPhase("work");
    setPomoCount(0);
    if (wantPomodoro) pomoHandled.current = false;
  }

  // La note ne s'affiche qu'a la demande : un champ toujours ouvert occupait
  // une ligne avant chaque session pour une saisie rare.
  const [noteOpen, setNoteOpen] = useState(false);

  // Objectif de session : restaure le dernier choix (ou celui que le planning
  // vient de poser en lançant « Commencer à réviser » sur un objectif daté).
  useEffect(() => {
    const v = readSessionGoal();
    if (v) setSessionGoalMin(v);
  }, []);

  function pickSessionGoal(min) {
    setSessionGoalMin(min);
    writeSessionGoal(min);
  }

  // ── Suivi de la pause ──────────────────────────────────────────
  // En pause on rend le chrono TRÈS visible : "Pause depuis mm:ss" +
  // bordeaux doux qui pulse. On mémorise l'instant de mise en pause et on
  // tick chaque seconde (le TimerContext ne re-rend plus quand il est figé).
  // Périodes de blocus — remontées par BlocusCard, qui les charge déjà. Elles
  // neutralisent les jours hors blocus dans le calcul de série (cf. computeStreak).
  const [blocusRanges, setBlocusRanges] = useState(null);
  const handleBlocusLoaded = useCallback((res) => {
    setBlocusRanges(res.supported ? toRanges(res.periods) : null);
  }, []);
  const streakPaused = isStreakPaused(blocusRanges);

  useEffect(() => {
    if (!blocusRanges || !recentSessions.length) return;
    setStreak(computeStreak(recentSessions, freezeInfo?.frozenDays || [], blocusRanges));
  }, [blocusRanges, recentSessions, freezeInfo]);

  // Repli local pour les missions du dashboard : sert uniquement quand le RPC
  // serveur n'est pas joignable (mode hors-ligne, migration pas encore passée).
  const missionStats = useMemo(() => ({
    todaySecs: sessions.reduce((a, s) => a + Number(s.duration_seconds || 0), 0),
    todayMaxSessionSecs: sessions.length ? Math.max(...sessions.map(s => Number(s.duration_seconds || 0))) : 0,
    todaySessionCount: sessions.length,
    todayCoursesCount: new Set(sessions.map(s => s.course_id).filter(Boolean)).size,
    todayDoneObj: todayObjectives.filter(o => o.done).length,
    tomorrowObjCount: 0,
    streak,
    studiedBeforeNoon: sessions.some(s => new Date(s.started_at).getHours() < 12),
    hasStudyNote: sessions.some(s => Boolean((s.note || "").trim())),
    referredToday: false,
  }), [sessions, todayObjectives, streak]);

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
      if (running) pauseWithFeedback();
      else if (courseId || pomodoro) startWithFeedback();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [focusMode, running, courseId, pomodoro, pauseWithFeedback, startWithFeedback]);

  // ── Pomodoro auto-transition ────────────────────────────────
  useEffect(() => {
    if (!pomodoro || !running || pomoHandled.current) return;
    const target = pomoPhase === "work" ? POMO_WORK : POMO_BREAK;
    if (elapsed < target) { pomoHandled.current = false; return; }
    pomoHandled.current = true;

    if (pomoPhase === "work") {
      playSensoryCue("pomodoro");
      triggerHaptic("goal");
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
      setCompletionToast(buildCompletionData({ seconds, goalPct: newGoalPct, xpGained, courseId, note }));
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

    setCompletionToast(buildCompletionData({ seconds, goalPct: newGoalPct, xpGained, courseId, note }));

    // Refresh streak / goal counters in background
    load();
  }

  // Le récapitulatif a besoin du COURS, que `stopAndSave` connaît par son id
  // seulement. On le résout ici, une fois : après `reset()` la sélection de
  // cours peut déjà avoir changé si l'utilisateur enchaîne.
  function buildCompletionData({ seconds, goalPct, xpGained, courseId, note }) {
    const course = courses.find(c => c.id === courseId);
    return {
      durationSecs: seconds,
      goalPct,
      xpGained,
      courseName: course?.name || null,
      courseColor: course?.color || null,
      note: note || null,
    };
  }

  // Chargé à la demande, au clic sur "Envoyer à un ami". Colonnes explicites
  // et PAS d'`email` : règle 2 du CLAUDE.md — on ne lit jamais l'email d'un
  // autre utilisateur.
  const loadShareFriends = useCallback(async () => {
    if (!user || isGuest) { setShareFriends([]); return; }
    const { data: links } = await supabase
      .from("friendships").select("requester, addressee")
      .or(`requester.eq.${user.id},addressee.eq.${user.id}`)
      .eq("status", "accepted");
    const ids = (links || []).map(l => (l.requester === user.id ? l.addressee : l.requester));
    if (!ids.length) { setShareFriends([]); return; }
    const { data: profs } = await supabase
      .from("profiles").select("id, pseudo, first_name, last_name, avatar_url")
      .in("id", ids);
    setShareFriends(profs || []);
  }, [user, isGuest]);

  // Envoie le récapitulatif en message privé. Renvoie true/false : c'est la
  // carte qui décide quoi afficher ensuite.
  async function shareSessionWith(friend) {
    if (!user || !completionToast || !friend?.id) return false;
    // Même garde-fou que l'envoi de DM normal dans `messages.js` : ce chemin
    // insère dans la même table, il ne doit pas être une porte dérobée.
    const allowed = clientRateLimit(`dm:send:${user.id}`, 20, 60_000);
    if (!allowed.ok) { toast(t("security.rateLimited"), "error"); return false; }
    const duration = formatMinutesShort(completionToast.durationSecs);
    const readableText = completionToast.courseName
      ? t("share.sessionMessage").replace("{duration}", duration).replace("{course}", completionToast.courseName)
      : t("share.sessionMessageNoCourse").replace("{duration}", duration);
    const { error } = await supabase.from("private_messages").insert({
      sender_id: user.id,
      receiver_id: friend.id,
      ...buildSessionShareMessage({
        durationSecs: completionToast.durationSecs,
        courseName: completionToast.courseName,
        courseColor: completionToast.courseColor,
        note: completionToast.note,
        readableText,
      }),
    });
    if (error) { toast(t("share.sendFailed"), "error"); return false; }
    return true;
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

  async function updateSession(session, { minutes, courseId: nextCourseId }) {
    const newMins = parseInt(minutes, 10);
    const maxMins = Math.floor(session.duration_seconds / 60);
    if (isNaN(newMins) || newMins < 1 || newMins > Math.max(1, maxMins)) return false;
    const newSecs = newMins * 60;
    clearDashboardCache();
    if (isGuest) {
      const nextSessions = sessions.map(s => s.id === session.id
        ? { ...s, duration_seconds: newSecs, course_id: nextCourseId || null }
        : s
      );
      setSessions(nextSessions);
      writeGuestDashboardData({ courses, sessions: nextSessions, recentSessions: nextSessions, objectives: todayObjectives });
      return true;
    }
    const endedAt = session.ended_at ? new Date(session.ended_at) : new Date();
    const adjustedStartedAt = new Date(endedAt.getTime() - newSecs * 1000).toISOString();
    const { error } = await supabase.from("sessions").update({
      duration_seconds: newSecs,
      course_id: nextCourseId || null,
      started_at: adjustedStartedAt,
    }).eq("id", session.id);
    if (error) {
      toast(t("dash.saveError"), "error");
      return false;
    }
    setSessions(prev => prev.map(s => s.id === session.id
      ? { ...s, duration_seconds: newSecs, course_id: nextCourseId || null, started_at: adjustedStartedAt }
      : s
    ));
    return true;
  }

  function openCourseEditor(course = null) {
    setEditingCourse(course);
    setCourseEditorOpen(true);
  }

  function closeCourseEditor() {
    setCourseEditorOpen(false);
    setEditingCourse(null);
  }

  async function saveCourse({ id, name, color, examDate }) {
    const duplicate = courses.some((course) => course.id !== id && course.name.trim().toLowerCase() === name.toLowerCase());
    if (duplicate) return { ok: false, message: t("courseEditor.duplicate") };

    setCourseEditorBusy(true);
    try {
      if (isGuest) {
        const savedCourse = id
          ? { ...courses.find((course) => course.id === id), name, color, exam_date: examDate }
          : {
              id: newClientId(),
              user_id: GUEST_USER_ID,
              name,
              color,
              exam_date: examDate,
              created_at: new Date().toISOString(),
            };
        const nextCourses = id
          ? courses.map((course) => course.id === id ? savedCourse : course)
          : [...courses, savedCourse];
        setCourses(nextCourses);
        if (!id) setCourseId(savedCourse.id);
        writeGuestDashboardData({ courses: nextCourses, sessions, recentSessions, objectives: todayObjectives });
        toast(t(id ? "courseEditor.updated" : "courseEditor.created"), "success");
        return { ok: true };
      }

      const query = id
        ? supabase
            .from("courses")
            .update({ name, color, exam_date: examDate })
            .eq("id", id)
            .eq("user_id", user.id)
        : supabase
            .from("courses")
            .insert({ user_id: user.id, name, color, exam_date: examDate });
      const { data, error } = await query.select("*").single();
      if (error || !data) return { ok: false, message: t("courseEditor.saveError") };

      clearDashboardCache();
      setCourses((prev) => id
        ? prev.map((course) => course.id === id ? data : course)
        : [...prev, data]);
      if (!id) setCourseId(data.id);
      toast(t(id ? "courseEditor.updated" : "courseEditor.created"), "success");
      return { ok: true };
    } catch (_) {
      return { ok: false, message: t("courseEditor.saveError") };
    } finally {
      setCourseEditorBusy(false);
    }
  }

  async function deleteCourse(id) {
    setCourseEditorBusy(true);
    try {
      const nextCourses = courses.filter((course) => course.id !== id);
      const nextSessions = sessions.map((session) => session.course_id === id ? { ...session, course_id: null } : session);
      const nextObjectives = todayObjectives.map((objective) => objective.course_id === id ? { ...objective, course_id: null } : objective);

      if (!isGuest) {
        const { data, error } = await supabase
          .from("courses")
          .delete()
          .eq("id", id)
          .eq("user_id", user.id)
          .select("id")
          .maybeSingle();
        if (error || !data) return { ok: false, message: t("courseEditor.deleteError") };
        clearDashboardCache();
      }

      setCourses(nextCourses);
      setSessions(nextSessions);
      setTodayObjectives(nextObjectives);
      setChecklistCounts((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      if (courseId === id) setCourseId(nextCourses[0]?.id || "");
      if (isGuest) {
        writeGuestDashboardData({ courses: nextCourses, sessions: nextSessions, recentSessions, objectives: nextObjectives });
      }
      toast(t("courseEditor.deleted"), "success");
      return { ok: true };
    } catch (_) {
      return { ok: false, message: t("courseEditor.deleteError") };
    } finally {
      setCourseEditorBusy(false);
    }
  }

  const totalToday = sessions.reduce((a, s) => a + s.duration_seconds, 0);
  const goalPct = Math.min(100, Math.round((totalToday / DAILY_GOAL_SECS) * 100));

  // Objectif effectif des Blocus Blocks : phase pomodoro > objectif de
  // session > mode libre (null → les blocs poussent sans fin).
  const pomoTargetSecs = pomoPhase === "work" ? POMO_WORK : POMO_BREAK;
  const sessionGoalSecs = !pomodoro && sessionGoalMin ? sessionGoalMin * 60 : null;
  // Paliers proposés + la durée exacte venue du planning si elle n'en fait pas
  // partie : sans ça, arriver depuis un objectif de 40 min posait bien la cible
  // mais n'allumait aucune pastille — l'objectif semblait ignoré.
  const sessionGoalChoices = useMemo(() => {
    const base = [[25, "25 min"], [45, "45 min"], [60, "1 h"], [90, "1 h 30"], [120, "2 h"]];
    const extra = sessionGoalMin && !base.some(([m]) => m === sessionGoalMin)
      ? [[sessionGoalMin, `${sessionGoalMin} min`]]
      : [];
    return [...base, ...extra].sort((a, b) => a[0] - b[0]).concat([[null, "∞"]]);
  }, [sessionGoalMin]);
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
  const hapticBlockRef = useRef(null);

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
    let achievementFeedbackPlayed = false;
    function fire(id, text) {
      if (momentsFired.current.has(id)) return;
      momentsFired.current.add(id);
      setMoment({ id, text });
      clearTimeout(momentTimer.current);
      momentTimer.current = setTimeout(() => setMoment(null), 8000);
      if (!pomodoro && !achievementFeedbackPlayed && (id === "sessionGoal" || id === "daily")) {
        playSensoryCue("goal");
        triggerHaptic("goal");
        achievementFeedbackPlayed = true;
      }
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

  // Ce jalon reste indépendant des Blocus Blocks de 15 min : un retour bref
  // accompagne chaque tranche de 25 min réellement franchie.
  useEffect(() => {
    const milestone = Math.floor(elapsed / (25 * 60));
    if (hapticBlockRef.current === null) {
      hapticBlockRef.current = milestone;
      return;
    }
    if (elapsed === 0) {
      hapticBlockRef.current = 0;
      return;
    }
    if (running && milestone > hapticBlockRef.current) triggerHaptic("block");
    hapticBlockRef.current = milestone;
  }, [elapsed, running]);

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

  if (!ready || forceSkeleton) return <Layout><PageContentSkeleton pathname="/dashboard" /></Layout>;

  return (
    <Layout>
      {!isGuest && <PendingSessionsBanner onSynced={handlePendingSynced} />}
      {/* Backdrop pour fermer le menu cours */}
      {showCourseMenu && (
        <div className="fixed inset-0 z-10" onClick={() => setShowCourseMenu(false)} />
      )}

      <h1 className="sr-only">{t("dash.title")}</h1>

      {/* Mobile suit l'urgence quotidienne. Desktop assemble un vrai poste de
          travail : action et historique à gauche, motivation et résultat à
          droite, réglages durables sous les deux colonnes. */}
      <div className="bt-dashboard-grid grid min-w-0 grid-cols-1 items-start gap-4 sm:gap-5 lg:grid-cols-[minmax(0,1.55fr)_minmax(320px,0.75fr)] lg:gap-6">

        {/* ══════════════════════════════════════════
            COLONNE GAUCHE — Chronomètre + Sessions/À faire du jour
        ══════════════════════════════════════════ */}
        {/* `contents` sous lg : les deux colonnes s'effacent et leurs cartes
            deviennent enfants directs de la grille. L'ordre mobile se pilote
            alors carte par carte (order-N), sans quoi déplacer une carte de
            colonne sur desktop la déplaçait aussi dans l'empilement mobile —
            « Aujourd'hui » se retrouvait un écran plus bas. Les rangs lg: sont
            donnés en clair plutôt que remis à zéro : `lg:order-none` ne
            l'emportait pas de façon fiable sur le rang mobile. */}
        <div className="contents min-w-0 lg:flex lg:flex-col lg:gap-6">
        <section className="bt-dashboard-timer order-1 lg:order-1 card relative min-w-0 overflow-hidden"
          style={{
            backgroundColor: isPaused ? "rgba(239,68,68,0.13)" : "var(--bt-surface)",
            backgroundImage: isPaused ? "none" : "radial-gradient(90% 75% at 50% 100%, var(--bt-timer-wash), transparent 72%), linear-gradient(180deg, var(--bt-surface), var(--bt-timer-base))",
            borderColor:     isPaused ? "rgba(239,68,68,0.60)" : "var(--bt-border)",
            boxShadow:       isPaused ? "0 4px 32px rgba(239,68,68,0.22)" : "0 4px 32px var(--bt-shadow)",
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
          <div className="relative z-20 grid grid-cols-[minmax(0,1fr)_auto] gap-2 px-4 pt-4 sm:px-6 sm:pt-5">
            <div className="flex min-w-0 items-center gap-2">
              <div className="relative min-w-0 flex-1">
                {courses.length === 0 ? (
                  <button type="button" onClick={() => openCourseEditor()} className="bt-dashboard-control flex min-h-11 w-full items-center justify-center rounded-xl border border-dashed px-3 text-sm font-semibold" style={{ borderColor: "var(--bt-border)", color: "var(--bt-accent-text)" }}>
                    {t("courseEditor.addTitle")}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => !running && setShowCourseMenu((value) => !value)}
                    disabled={running}
                    className="bt-dashboard-control flex min-h-11 max-w-full items-center gap-2 rounded-xl px-3 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50"
                    style={{
                      width: "100%",
                      backgroundColor: "var(--bt-subtle)",
                      border: `1px solid ${showCourseMenu ? "var(--bt-accent)" : "var(--bt-border)"}`,
                      boxShadow: showCourseMenu ? "0 0 0 3px rgba(20,184,133,0.12)" : "none",
                      color: courseId ? "var(--bt-text-1)" : "var(--bt-text-3)",
                    }}
                    aria-haspopup="listbox"
                    aria-expanded={showCourseMenu}
                  >
                    {courseId && <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: courses.find((item) => item.id === courseId)?.color }} aria-hidden="true" />}
                    <span className="min-w-0 flex-1 truncate text-left">{courseId ? courseName(courseId) : t("dash.selectCourse")}</span>
                    {!running && (
                      <svg className={`shrink-0 transition-transform duration-200 motion-reduce:transition-none ${showCourseMenu ? "rotate-180" : ""}`} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="m6 9 6 6 6-6" />
                      </svg>
                    )}
                  </button>
                )}

                {showCourseMenu && !running && (
                  <div className="bt-dashboard-menu absolute left-0 top-full z-30 mt-1.5 w-72 max-w-[calc(100vw-3.5rem)] overflow-hidden rounded-2xl" style={{ backgroundColor: "var(--bt-surface)", border: "1px solid var(--bt-border)", boxShadow: "0 14px 38px var(--bt-shadow)" }}>
                    <div className="max-h-64 overflow-y-auto py-1" role="listbox" aria-label={t("dash.selectCourse")}>
                      {courses.map((course) => (
                        <button key={course.id} type="button" role="option" aria-selected={courseId === course.id} onClick={() => { setCourseId(course.id); setShowCourseMenu(false); }} className="bt-dashboard-menu-item flex min-h-11 w-full items-center gap-3 px-4 text-left">
                          <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: course.color }} aria-hidden="true" />
                          <span className="min-w-0 flex-1 truncate text-sm font-semibold" style={{ color: "var(--bt-text-1)" }}>{course.name}</span>
                          {courseId === course.id && (
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--bt-accent)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                              <path d="m20 6-11 11-5-5" />
                            </svg>
                          )}
                        </button>
                      ))}
                    </div>
                    <div className="border-t p-1" style={{ borderColor: "var(--bt-border)" }}>
                      <button
                        type="button"
                        onClick={() => { setShowCourseMenu(false); openCourseEditor(); }}
                        className="bt-dashboard-menu-item flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-left text-sm font-bold"
                        style={{ color: "var(--bt-accent-text)" }}
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
                          <path d="M12 5v14M5 12h14" />
                        </svg>
                        {t("courseEditor.addTitle")}
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {(() => {
                const selectedCourse = courses.find((item) => item.id === courseId);
                if (!selectedCourse?.exam_date) return null;
                const days = daysUntilExam(selectedCourse.exam_date);
                return (
                  <span className="shrink-0 whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-bold" style={{ backgroundColor: days <= 0 ? "var(--bt-danger-bg)" : days <= 7 ? "#FEF3C7" : "var(--bt-accent-bg)", color: days <= 0 ? "var(--bt-danger)" : days <= 7 ? "#A85E00" : "var(--bt-accent-text)" }}>
                    {days === 0 ? t("exam.today") : days < 0 ? t("exam.passed") : `J-${days}`}
                  </span>
                );
              })()}
            </div>

            {/* Rayon aligne sur le selecteur de cours et le bouton Focus qui
                l'encadrent : en pilule, ce rail etait la seule forme ronde de
                la rangee. Et les deux options se partagent la largeur — placees
                dans une colonne `1fr`, elles restaient collees a gauche en
                laissant un tiers de rail vide. */}
            <button type="button" onClick={() => setFocusMode(true)} className="bt-dashboard-control flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl px-3 text-sm font-semibold" style={{ backgroundColor: "var(--bt-accent-bg)", border: "1px solid var(--bt-accent-border)", color: "var(--bt-accent-text)" }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M8 3H5a2 2 0 0 0-2 2v3M16 3h3a2 2 0 0 1 2 2v3M21 16v3a2 2 0 0 1-2 2h-3M8 21H5a2 2 0 0 1-2-2v-3" />
                <circle cx="12" cy="12" r="2.5" />
              </svg>
              <span>{t("dash.focusShort")}</span>
            </button>
          </div>

          {/* ── Héros : chiffres + onde de session + ligne vivante ── */}
          <div className="px-4 pb-1 pt-5 text-center sm:px-6 sm:pt-8">
            {pomodoro && (
              <div className="mb-3 text-[11px] font-bold uppercase tracking-[0.18em]"
                style={{ color: pomoPhase === "work" ? "var(--bt-accent-text)" : "#075E80" }}>
                {pomoPhase === "work" ? t("dash.work") : t("dash.pause")}
                {pomoCount > 0 && <span className="font-medium ml-2 opacity-60">· {t("dash.cycle")} {pomoCount}</span>}
              </div>
            )}
            {isPaused && !pomodoro && (
              <div className="mb-3 flex justify-center">
                <span className="bt-pause-pulse inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.14em] px-3 py-1.5 rounded-full"
                  style={{ color: "#FFFFFF", backgroundColor: "#DC2626", border: "1px solid #DC2626" }}>
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg>
                  {t("dash.pausedStatus")}
                </span>
              </div>
            )}

            <TimerDigits
              seconds={pomodoro ? Math.max(0, pomoTargetSecs - elapsed) : elapsed}
              color={isPaused && !pomodoro ? PAUSE_ACCENT : "var(--bt-text-1)"} />

            {(running || elapsed > 0) && (
            <div className="mx-auto mt-5 w-full max-w-[440px] sm:mt-6">
              <div className="mb-2 flex items-center justify-between gap-3 text-xs" style={{ color: "var(--bt-text-3)" }}>
                <span className="flex items-center gap-2">
                  <span>{t("dash.sessionBlocks")}</span>
                  <span className="rounded-full px-2 py-0.5 text-[10px] font-bold" style={{ backgroundColor: "var(--bt-accent-bg)", color: "var(--bt-accent-text)" }}>
                    {t("dash.blockUnit")}
                  </span>
                </span>
                <span className="font-num shrink-0 font-semibold tabular-nums">
                  {t("dash.blocksValidated").replace("{n}", String(blkValidated))}
                </span>
              </div>
              <BlocusBlocks elapsed={elapsed} running={running} paused={isPaused && !pomodoro} goalSecs={blockGoalSecs} />
            </div>
            )}

            {/* Coach visible uniquement avant, en pause ou lors d'un vrai
                accomplissement. Pendant le travail normal, la ligne reste
                textuelle pour ne pas distraire. */}
            <div className={`${showGuestIntro ? "h-2 mt-2" : "min-h-[58px] mt-2"} flex items-center justify-center`}>
              {timerCoach && !focusMode && !showGuestIntro ? (
                <MascotCoach
                  id={timerCoach.id}
                  message={timerCoach.message}
                  streak={streak}
                  persistence={timerCoach.persistence}
                  live={timerCoach.live}
                  className="w-full max-w-md"
                  size={48}
                />
              ) : !timerCoach && liveMessage ? (
                <p key={liveMessage} className={`text-sm ${isPaused ? "font-medium" : "bt-msg-swap"}`}
                  style={{ color: isPaused ? PAUSE_ACCENT : "var(--bt-text-3)" }}>
                  {liveMessage}
                </p>
              ) : null}
            </div>
          </div>

          {/* ── Reglages de session — compacts, entre le chrono et l'action ──
               Avant : six pastilles d'objectif + une bascule Libre/Pomodoro
               dans le bandeau + un champ note toujours ouvert, soit neuf
               controles a franchir avant « Demarrer ». Meme fonctions, meme
               valeurs, mais reduites a trois libelles qui disent deja leur
               etat. Rien n'est retire : tout est a un tap. */}
          {!running && elapsed === 0 && (
            <div className="mt-3 px-4 sm:px-6">
              <div className="mx-auto flex max-w-md flex-wrap items-center justify-center gap-2">
                <FilterMenu
                  value={pomodoro ? "pomodoro" : "free"}
                  options={[{ value: "free", label: t("dash.free") }, { value: "pomodoro", label: "Pomodoro" }]}
                  onChange={pickMode}
                  ariaLabel={t("dash.modeLabel")}
                  align="left"
                />
                {!pomodoro && (
                  <FilterMenu
                    value={sessionGoalMin == null ? "none" : String(sessionGoalMin)}
                    options={sessionGoalChoices.map(([m, label]) => ({
                      value: m == null ? "none" : String(m),
                      label: m == null ? t("dash.noGoal") : label,
                    }))}
                    onChange={(v) => pickSessionGoal(v === "none" ? null : Number(v))}
                    ariaLabel={t("dash.sessionGoalLabel")}
                    align="left"
                  />
                )}
                {pomodoro && (
                  <>
                    <FilterMenu
                      value={String(pomoWorkMin)}
                      options={POMO_WORK_OPTIONS.map((m) => ({ value: String(m), label: `${m} min` }))}
                      onChange={(v) => { setPomoWorkMin(Number(v)); pomoHandled.current = false; }}
                      ariaLabel={t("dash.workDuration")}
                      align="left"
                    />
                    <FilterMenu
                      value={String(pomoBreakMin)}
                      options={POMO_BREAK_OPTIONS.map((m) => ({ value: String(m), label: `${m} min` }))}
                      onChange={(v) => setPomoBreakMin(Number(v))}
                      ariaLabel={t("dash.breakDuration")}
                      align="left"
                    />
                  </>
                )}
                {(!pomodoro || pomoPhase === "work") && !noteOpen && !note && (
                  <button type="button" onClick={() => setNoteOpen(true)}
                    className="bt-filter-btn inline-flex min-h-8 items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-semibold">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
                      <path d="M12 5v14M5 12h14" />
                    </svg>
                    {t("dash.noteLabel")}
                  </button>
                )}
              </div>
            </div>
          )}

          {/* ── Note — champ discret, souligné au focus seulement ── */}
          {(!pomodoro || pomoPhase === "work") && (noteOpen || note || running || elapsed > 0) && (
            <div className="mt-3 px-4 sm:px-6">
              <label htmlFor="dashboard-session-note" className="sr-only">{t("dash.noteLabel")}</label>
              <input
                id="dashboard-session-note"
                autoFocus={noteOpen && !note}
                className="mx-auto block min-h-11 w-full max-w-xs bg-transparent py-2 text-center text-sm outline-none"
                style={{ color: "var(--bt-text-1)", borderBottom: "1px solid transparent", transition: "border-color 0.2s" }}
                onFocus={e => { e.currentTarget.style.borderBottomColor = "var(--bt-border)"; }}
                onBlur={e => { e.currentTarget.style.borderBottomColor = "transparent"; }}
                placeholder={t("dash.notePlaceholder")}
                value={note}
                onChange={(e) => setNote(e.target.value)} />
            </div>
          )}

          {/* ── Actions ── */}
          <div className="px-4 pb-4 pt-4 sm:px-6 sm:pb-5 sm:pt-5">
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
                    className="bt-dashboard-control bt-dashboard-primary flex min-h-12 flex-1 items-center justify-center gap-2 rounded-full px-4 text-sm font-extrabold"
                    style={{
                      opacity: (!courseId && !pomodoro) ? 0.45 : 1,
                    }}
                    onClick={() => { startWithFeedback(); setFocusMode(true); }}
                    disabled={!courseId && !pomodoro}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
                      <polygon points="5 3 19 12 5 21 5 3"/>
                    </svg>
                    {elapsed > 0 ? t("dash.resume") : t("dash.start")}
                  </button>
                ) : (
                  <button
                    className="bt-dashboard-control flex min-h-12 flex-1 items-center justify-center gap-2 rounded-full px-4 text-sm font-bold"
                    style={{ backgroundColor: "var(--bt-subtle)", color: "var(--bt-text-1)", border: "1px solid var(--bt-border)" }}
                    onClick={pauseWithFeedback}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
                      <rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/>
                    </svg>
                    {t("dash.pause")}
                  </button>
                )}
                {(elapsed >= 1 || saveStatus !== "idle") && (
                  <button
                    className="bt-dashboard-control flex min-h-12 flex-1 items-center justify-center gap-2 rounded-full px-4 text-sm font-bold"
                    style={{
                      backgroundColor: saveStatus === "success" ? "var(--bt-action)"
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
            <p className="mt-3 hidden text-center text-[11px] sm:block" style={{ color: "var(--bt-text-4)" }}>{t("dash.subtitle")}</p>
          </div>
        </section>

        {showGuestIntro && (
          <section className="order-2 overflow-hidden rounded-2xl px-4 py-4 sm:px-5 lg:order-2"
            style={{ backgroundColor: "var(--bt-accent-bg)", border: "1px solid var(--bt-accent-border)" }}>
            <div className="flex items-end gap-3 sm:items-center">
              <Mascot streak={12} size={64} className="h-14 w-14 shrink-0" ariaLabel="Mascotte de Blocus Tracker" />
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
            <div className="mt-3 flex flex-wrap items-center gap-2 sm:ml-[68px]">
              <Link href="/planning" className="btn-ghost min-h-11 px-3 py-2 text-xs">{t("guest.viewPlanning")}</Link>
              <Link href="/stats" className="btn-ghost min-h-11 px-3 py-2 text-xs">{t("guest.viewStats")}</Link>
              <Link href="/feed" className="btn-ghost min-h-11 px-3 py-2 text-xs">{t("guest.discoverSocial")}</Link>
              <span className="hidden flex-1 sm:block" />
              <Link href="/signup" className="btn-primary min-h-11 px-3 py-2 text-xs">{t("guest.keepProgress")}</Link>
              <Link href="/login" className="inline-flex min-h-11 items-center px-2 py-2 text-xs font-semibold" style={{ color: "var(--bt-accent-text)" }}>
                {t("guest.signIn")}
              </Link>
            </div>
          </section>
        )}

        <TodaySessionsCard
          className="order-4 lg:order-3"
          sessions={sessions}
          courses={courses}
          onUpdate={updateSession}
          onDelete={deleteSession}
        />

        {todayObjectives.length > 0 && (
          <section className="order-5 card flex min-h-0 flex-col p-4 sm:p-5 lg:order-4">
            <div className="mb-3 flex shrink-0 items-center justify-between gap-3">
              <h2 className="text-lg font-bold" style={{ color: "var(--bt-text-1)" }}>{t("dash.todo")}</h2>
              <span className="font-num inline-flex min-h-7 min-w-7 items-center justify-center rounded-full px-2 text-xs font-bold tabular-nums" style={{ backgroundColor: "var(--bt-subtle)", color: "var(--bt-text-2)" }}>
                {todayObjectives.filter((item) => item.done).length}/{todayObjectives.length}
              </span>
            </div>
            <ul className="divide-y" style={{ borderColor: "var(--bt-border)" }}>
              {todayObjectives.map((o) => {
                const course = courses.find((c) => c.id === o.course_id);
                return (
                  <li key={o.id}
                    className="flex min-h-[64px] items-center gap-2 py-2.5 text-sm">
                    <button
                      type="button"
                      role="checkbox"
                      aria-checked={o.done}
                      aria-label={`${o.title} — ${o.done ? t("checklist.markUndone") : t("checklist.markDone")}`}
                      onClick={() => toggleObjective(o)}
                      className="bt-dashboard-control flex h-11 w-11 shrink-0 items-center justify-center rounded-xl"
                    >
                      <span
                        className={`flex h-5 w-5 items-center justify-center rounded-md ${o.done ? "bt-check-pop" : ""}`}
                        style={{ backgroundColor: o.done ? "var(--bt-action)" : "var(--bt-surface)", border: `1px solid ${o.done ? "var(--bt-action)" : "var(--bt-border)"}` }}
                        aria-hidden="true"
                      >
                        {o.done && (
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                            <path d="m5 12 4 4L19 6" />
                          </svg>
                        )}
                      </span>
                    </button>
                    <div className="flex-1 min-w-0">
                      <p className={`bt-strike ${o.done ? "is-done" : ""} truncate`} style={{
                        color: o.done ? "var(--bt-text-3)" : "var(--bt-text-1)",
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
            SIDE — Missions + progression du jour
        ══════════════════════════════════════════ */}
        <aside className="contents min-w-0 lg:flex lg:flex-col lg:gap-6">
          <DailyProgressCard className="order-2 lg:order-none" todayStats={missionStats} />
          <TodayProgressCard
            className="order-3 lg:order-none"
            totalToday={totalToday}
            goalPct={goalPct}
            weekSecs={weekSecs}
            streak={streak}
            bestStreak={bestStreak}
            streakPaused={streakPaused}
            freezeInfo={freezeInfo}
          />
        </aside>

        <div className="order-6 grid min-w-0 gap-4 sm:gap-5 lg:col-span-2 lg:grid-cols-2 lg:gap-6">
          <DashboardCoursesCard
            courses={courses}
            checklistCounts={checklistCounts}
            onAdd={() => openCourseEditor()}
            onOpen={(course) => {
              if (isGuest) {
                openCourseEditor(course);
                return;
              }
              setChecklistCourse(course);
            }}
          />
          <BlocusCard
            sessions={recentSessions}
            exams={courses.filter((course) => course.exam_date)}
            onChange={handleBlocusLoaded}
          />
        </div>
      </div>

      {courseEditorOpen && (
        <CourseEditorModal
          key={editingCourse?.id || "new-course"}
          course={editingCourse}
          colors={COLORS}
          busy={courseEditorBusy}
          onClose={closeCourseEditor}
          onSave={saveCourse}
          onDelete={deleteCourse}
        />
      )}

      {/* Checklist de révision (depuis la carte Mes cours) */}
      {checklistCourse && user && (
        <CourseChecklistModal
          course={checklistCourse}
          userId={user.id}
          onClose={() => setChecklistCourse(null)}
          onChanged={loadChecklistCounts}
          onEdit={() => {
            const course = checklistCourse;
            setChecklistCourse(null);
            openCourseEditor(course);
          }}
        />
      )}

      {/* Focus mode overlay */}
      {/* La série annoncée est celle qui serait SAUVÉE, pas la série courante :
          computeStreak la voit déjà cassée (hier manque), elle vaut donc 0 et
          l'offre dirait « ta série de 0 jours peut être sauvée ». */}
      {/* Invitation aux notifications — au premier passage seulement, et après
          l'offre de gel pour ne pas empiler deux fenêtres. */}
      <PushOptInPrompt />

      <StreakFreezeOffer
        open={freezeOfferOpen}
        streak={computeStreak(recentSessions, [...(freezeInfo?.frozenDays || []), ...(freezeInfo?.pendingDays || [])])}
        days={freezeInfo?.pendingDays || []}
        stock={freezeInfo?.stock || 0}
        busy={freezeBusy}
        onAccept={acceptFreeze}
        onDecline={declineFreeze}
      />

      {focusMode && (
        <div className="fixed inset-0 flex flex-col items-center justify-center transition-colors duration-300 overflow-hidden bt-grain"
          style={{
            background: (isPaused && !pomodoro) ? "#1A0605" : "var(--bt-ink)",
            zIndex: 100,
          }}>
          {/* Vagues WebGL de marque. Le composant fournit son propre fallback
              statique et coupe la boucle sous prefers-reduced-motion. */}
          <FocusShaderBackground paused={isPaused && !pomodoro} />

          {/* Battement rouge à 1 Hz — un seul rythme, il happe le regard et
              dit "en pause" avant même de lire quoi que ce soit. */}
          {isPaused && !pomodoro && <div aria-hidden className="bt-pause-flash" />}

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
              color={(isPaused && !pomodoro) ? "#FFEDEB" : "var(--bt-ink-text)"}
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
                  style={{ color: isPaused ? "#FFB0A8" : "var(--bt-ink-muted)" }}>
                  {liveMessage}
                </p>
              ) : null}
            </div>

            {/* Indicateur EN PAUSE — pastille bordeaux qui pulse */}
            {isPaused && !pomodoro && (
              <div className="bt-pause-pulse inline-flex items-center gap-1.5 mt-4 px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-widest"
                style={{ color: "#FFFFFF", backgroundColor: "#DC2626", letterSpacing: "0.12em" }}>
                <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg>
                {t("dash.pausedStatus")}
              </div>
            )}
          </div>

          <div className="relative z-10 mt-8 flex w-full max-w-[560px] justify-center gap-3 px-4"
            style={{
              opacity: (focusCtlVisible || !running) ? 1 : 0,
              pointerEvents: (focusCtlVisible || !running) ? "auto" : "none",
              transition: "opacity 0.25s ease-out",
            }}>
            {pomoPhase === "break" && pomodoro ? (
              <button className="btn-ghost w-full border-white/20 px-6 py-3 text-white sm:w-auto sm:px-8"
                onClick={() => { pause(); reset(); setPomoPhase("work"); pomoHandled.current = false; }}>
                {t("dash.skipBreak")}
              </button>
            ) : (
              <>
                {!running ? (
                  <button onClick={startWithFeedback} disabled={!courseId && !pomodoro}
                    className={`btn-primary min-w-0 flex-1 px-4 py-3 text-base bt-press sm:flex-none sm:px-10 ${isPaused ? "bt-pause-cta" : ""}`}>
                    {elapsed > 0 ? t("dash.resume") : t("dash.start")}
                  </button>
                ) : (
                  <button onClick={pauseWithFeedback}
                    className="min-w-0 flex-1 rounded-2xl px-4 py-3 text-base font-semibold transition-colors bt-press sm:flex-none sm:px-10"
                    style={{ backgroundColor: "rgba(255,255,255,0.1)", color: "#fff" }}>
                    {t("dash.pause")}
                  </button>
                )}
                <button
                  onClick={() => { setPomodoro(false); setPomoPhase("work"); setPomoCount(0); stopAndSave(); setFocusMode(false); }}
                  disabled={elapsed < 1 || saveStatus === "saving"}
                  className="min-w-0 flex-1 rounded-2xl px-4 py-3 text-base font-semibold transition-colors bt-press sm:flex-none sm:px-10"
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
              transition: "opacity 0.25s ease-out, color 0.2s ease-out",
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
              transition: "opacity 0.25s ease-out",
            }}>
            {t("dash.spaceHint")}
          </p>

        </div>
      )}

      {/* Récapitulatif de fin de session — voir components/SessionCompleteCard.js
          pour pourquoi ce n'est PAS une modale. La carte gère elle-même son
          entrée, sa fermeture automatique et sa mise en pause au survol. */}
      {completionToast && (
        <SessionCompleteCard
          data={completionToast}
          streak={streak}
          onClose={() => { setCompletionToast(null); setShareFriends(null); }}
          friends={shareFriends}
          onLoadFriends={loadShareFriends}
          onShare={shareSessionWith}
          canShare={!isGuest}
        />
      )}

    </Layout>
  );
}
