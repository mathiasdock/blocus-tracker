import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import Glyph from "../components/Glyph";
import Link from "next/link";
import { useRouter } from "next/router";
import Layout from "../components/Layout";
import { PageContentSkeleton, useSkeletonHatch } from "../components/PageSkeleton";
import { useAuth } from "../contexts/AuthContext";
import { useTimer } from "../contexts/TimerContext";
import { useI18n } from "../contexts/I18nContext";
import { supabase } from "../lib/supabaseClient";
import { formatDuration, formatMinutesShort, todayISO, localISO, localDayStartISO, isStreakPaused } from "../lib/format";
import { notifyXPChanged } from "../lib/xpEvents";
import { autoSharePost, shareSavedSession } from "../lib/autoShare";
import { readSessionGoal, writeSessionGoal } from "../lib/sessionGoal";
import { clearClientCache, getClientCache, setClientCache } from "../lib/clientCache";
import { newClientId, enqueueSession, removeFromQueue, flushPending, listPending } from "../lib/timerDraft";
import { currentWeekDates, fetchStudyDays, mergeStudyDays, secondsByDay, secondsOn, sessionsOnDay, thisWeekSeconds, unsyncedSessionDays } from "../lib/studyDays.mjs";
import { studyDayMinSeconds, studyStreaks } from "../lib/studyDayStates.mjs";
import { useOfficialStreak } from "../lib/useOfficialStreak";
import { useWakeLock } from "../lib/useWakeLock";
import { COURSE_COLORS } from "../lib/courseColors";
import { runStreakFreezeUpkeep, applyStreakFreezes, gapKey, invalidateStreakFreezeUpkeep } from "../lib/streakFreezes";
import { freezeGap, liveChronoDays, pendingSessionDays } from "../lib/streakFreezeGap.mjs";
import { daysLostByChange } from "../lib/sessionDayImpact.mjs";
import { missionDayStats } from "../lib/missionStats.mjs";
import StreakFreezeOffer from "../components/StreakFreezeOffer";
import { useToast } from "../contexts/ToastContext";
import PendingSessionsBanner from "../components/PendingSessionsBanner";
import CourseChecklistModal from "../components/CourseChecklistModal";
import CourseEditorModal from "../components/CourseEditorModal";
import Mascot from "../components/Mascot";
import MascotMoment from "../components/MascotMoment";
import AmbientSoundControl from "../components/AmbientSoundControl";
import FocusShaderBackground from "../components/FocusShaderBackground";
import AnimatedNumber from "../components/AnimatedNumber";
import FilterMenu from "../components/FilterMenu";
import SessionCompleteCard from "../components/SessionCompleteCard";
import MissionSummary from "../components/MissionSummary";
import ChallengeStrip from "../components/ChallengeStrip";
import { loadUserLevelMap } from "../lib/userLevels";
import { getDailyMissionDefs, evaluateMissions } from "../lib/xp";
import StudyBlocks, { RestTrack } from "../components/StudyBlocks";
import { studyBlockLayout } from "../lib/studyBlocks.mjs";
import TodayProgressCard from "../components/TodayProgressCard";
import TodaySessionsCard from "../components/TodaySessionsCard";
import DashboardCoursesCard from "../components/DashboardCoursesCard";
import BlocusCard from "../components/BlocusCard";
import PushOptInPrompt from "../components/PushOptInPrompt";
import { toRanges } from "../lib/blocus";
import { normalizePlanningExams, nextExamForCourse } from "../lib/planningExams.mjs";
import { buildSessionShareMessage } from "../lib/sessionShare";
import { clientRateLimit } from "../lib/security";
import { playSensoryCue, triggerHaptic } from "../lib/sensoryFeedback";
import { GuestGate } from "../components/guest/GuestDiscovery";

function daysUntilExam(dateStr) {
  if (!dateStr) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const exam = new Date(dateStr + "T12:00:00");
  return Math.floor((exam - today) / 86400000);
}

// ── Blocus Blocks ─────────────────────────────────────────────
// Le dessin et l'échelle vivent maintenant dans components/StudyBlocks.js et
// lib/studyBlocks.mjs, partagés avec la carte « Progression du jour ». Ce qui a
// disparu d'ici : le plafond à douze blocs suivi d'un « +N » (qui voulait dire
// tantôt des blocs étudiés cachés, tantôt des blocs d'objectif cachés), la
// rangée de six emplacements vides en mode libre alors qu'aucun objectif
// n'était choisi, et le remplissage de TOUTES les cases dès l'objectif atteint
// — vingt-cinq minutes y devenaient deux blocs pleins, soit trente annoncées.

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
function TimerDigits({
  seconds,
  color,
  size = "clamp(4.9rem, 23vw, 7.5rem)",
  // Une session de plus d'une heure affiche TROIS groupes de chiffres. A la
  // taille du cas courant, « 11:56:58 » debordait et le « 8 » des secondes
  // passait a la ligne sous le chrono a 320 px. Le cas courant garde sa taille.
  hoursSize = "clamp(3.4rem, 16vw, 6.4rem)",
}) {
  const [hh, mm, ss] = formatDuration(seconds).split(":");
  const showHours = hh !== "00";
  const main = showHours ? `${hh}:${mm}` : mm;
  return (
    <div className="font-num font-bold tabular-nums"
      style={{ fontSize: showHours ? hoursSize : size, lineHeight: 1, letterSpacing: "-0.04em", whiteSpace: "nowrap", color, transition: "color 0.3s" }}>
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
const GUEST_DASHBOARD_KEY = "bt_guest_dashboard_v2";

function guestCourseName(id, lang) {
  if (id === "guest-course-physics") return lang === "en" ? "Physics" : "Physique";
  if (id === "guest-course-economics") return lang === "en" ? "Economics" : "Économie";
  return null;
}

function localizeGuestCourses(courses, lang) {
  return (courses || []).map((course) => ({ ...course, name: guestCourseName(course.id, lang) || course.name }));
}

function defaultGuestDashboardData(lang = "fr") {
  return {
    courses: [
      {
        id: "guest-course-physics",
        user_id: GUEST_USER_ID,
        name: guestCourseName("guest-course-physics", lang),
        color: COURSE_COLORS[11],
        exam_date: null,
        created_at: new Date().toISOString(),
      },
      {
        id: "guest-course-economics",
        user_id: GUEST_USER_ID,
        name: guestCourseName("guest-course-economics", lang),
        color: COURSE_COLORS[1],
        exam_date: null,
        created_at: new Date().toISOString(),
      },
    ],
    sessions: [],
    recentSessions: [],
    objectives: [],
  };
}

function readGuestDashboardData(lang) {
  if (typeof window === "undefined") return defaultGuestDashboardData(lang);
  try {
    const raw = localStorage.getItem(GUEST_DASHBOARD_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        ...defaultGuestDashboardData(lang),
        ...parsed,
        courses: localizeGuestCourses(parsed.courses, lang),
        recentSessions: parsed.recentSessions || parsed.sessions || [],
      };
    }
  } catch {}
  const seed = defaultGuestDashboardData(lang);
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
  const { t, lang } = useI18n();
  const { toast } = useToast();
  const {
    courseId,
    setCourseId,
    note,
    setNote,
    running,
    elapsed,
    timezone: timerTimezone,
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
  const [examRows, setExamRows] = useState([]);
  // Lignes de session du jour (celles que la liste affiche) : commencées
  // aujourd'hui, plus celles que session_days place aujourd'hui sans qu'elles
  // aient commencé aujourd'hui (23:30 → 00:30).
  const [sessions, setSessions] = useState([]);
  // Lignes de session_days sur 90 jours : la source de TOUT ce qui se compte
  // par jour sur cette page (aujourd'hui, semaine, meilleur jour, blocus).
  const [serverDays, setServerDays] = useState([]);
  // File hors ligne (lib/timerDraft) : sessions arrêtées, pas encore en base.
  const [queuedSessions, setQueuedSessions] = useState([]);
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
  // Sessions arrêtées dont les jours ne sont pas encore revenus de la base :
  // sans elles le total du jour RETOMBERAIT le temps d'un aller-retour réseau,
  // juste après avoir été crédité par le chrono. L'entrée porte la session
  // entière (ses jours se calculent comme en base) et son id, donc elle ne
  // peut pas compter deux fois.
  const [pendingCredits, setPendingCredits] = useState([]);
  const [completionToast, setCompletionToast] = useState(null);
  // Amis pour l'envoi depuis le récapitulatif. `null` = pas encore chargés ;
  // on ne les charge qu'au clic sur "Envoyer à un ami", pas à chaque fin de
  // session — la plupart des sessions ne sont pas partagées.
  const [shareFriends, setShareFriends] = useState(null);
  const [showCourseMenu, setShowCourseMenu] = useState(false);
  const [guestGate, setGuestGate] = useState(null);
  const [checklistCounts, setChecklistCounts] = useState({}); // courseId -> { done, total }
  const [checklistCourse, setChecklistCourse] = useState(null);
  const [recentSessions, setRecentSessions] = useState([]); // 90 jours — records & semaine
  const [freezeInfo, setFreezeInfo] = useState(null); // joker { supported, frozenDays, stock }
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
    const active = c.filter((course) => !course.archived_at);
    setCourses(c);
    setExamRows(data.examRows || []);
    setCourseId(current => active.some((course) => course.id === current) ? current : active[0]?.id || "");
    setSessions(data.sessions || []);
    setServerDays(data.days || []);
    setRecentSessions(data.recentSessions || []);
    setTodayObjectives(data.objectives || []);
  }, [setCourseId]);

  // `courses` reste la source unique — elle contient TOUT, y compris les cours
  // archivés, parce que c'est elle qui donne son nom à une session passée.
  // Les sélecteurs, eux, ne doivent proposer que ce qui est en cours : un cours
  // du semestre dernier n'a rien à faire dans la liste du chrono.
  const activeCourses = useMemo(() => courses.filter((c) => !c.archived_at), [courses]);
  const normalizedExams = useMemo(() => normalizePlanningExams(courses, examRows), [courses, examRows]);
  const nextCourseExam = useCallback((id) => nextExamForCourse(normalizedExams, id, localISO(new Date())), [normalizedExams]);

  // Le TimerProvider hydrate son dernier cours indépendamment des données du
  // dashboard. Si ce cours a depuis été archivé ou supprimé, ou si le jeu de
  // données a changé (mode invité), on retombe sur un cours réellement
  // disponible au lieu d'afficher un tiret impossible à sélectionner.
  useEffect(() => {
    if (!activeCourses.length) return;
    if (!activeCourses.some((course) => course.id === courseId)) setCourseId(activeCourses[0].id);
  }, [activeCourses, courseId, setCourseId]);

  const clearDashboardCache = useCallback(() => {
    if (dashboardCachePrefix) clearClientCache(dashboardCachePrefix);
  }, [dashboardCachePrefix]);

  // ── Joker : stock du mois + jours déjà protégés ──
  // Mémoïsé par jour dans lib/streakFreezes (plusieurs pages peuvent appeler).
  // Le « trou » à proposer, lui, se calcule plus bas sur le moteur canonique
  // (freezeGap), une fois les jours et le chrono connus.
  const [freezeReload, setFreezeReload] = useState(0);
  useEffect(() => {
    if (!user) return;
    let alive = true;
    runStreakFreezeUpkeep(supabase, user.id).then((res) => {
      if (alive && res.supported) setFreezeInfo(res);
    });
    return () => { alive = false; };
  }, [user, freezeReload]);

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
      applyDashboardData(readGuestDashboardData(lang));
      return;
    }
    const cacheKey = `${dashboardCachePrefix}${localISO(new Date())}`;
    const cached = getClientCache(cacheKey);
    if (cached) applyDashboardData(cached);

    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
    const todayDate = localISO(new Date());

    const [coursesRes, examsRes, sessionsRes, recentRes, objectivesRes, daysRes] = await Promise.all([
      supabase
        .from("courses")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at"),
      supabase.from("exams").select("id,course_id,name,exam_date,exam_time,location")
        .eq("user_id", user.id).order("exam_date"),
      cached ? Promise.resolve({ data: cached.sessions || [] }) : supabase
        .from("sessions")
        .select("*")
        .eq("user_id", user.id)
        .gte("started_at", localDayStartISO())
        .order("started_at", { ascending: false }),
      cached ? Promise.resolve({ data: cached.recentSessions || [] }) : supabase
        .from("sessions")
        .select("started_at, duration_seconds")
        .eq("user_id", user.id)
        .gte("started_at", ninetyDaysAgo.toISOString()),
      cached ? Promise.resolve({ data: cached.objectives || [] }) : supabase
        .from("objectives")
        .select("*")
        .eq("user_id", user.id)
        .eq("scheduled_date", todayDate)
        .order("done"),
      cached ? Promise.resolve({ data: cached.days || [] }) : fetchStudyDays(supabase, user.id, { fromISO: localISO(ninetyDaysAgo) }),
    ]);

    // Une session peut appartenir à aujourd'hui sans avoir commencé
    // aujourd'hui (23:30 → 00:30) : session_days dit lesquelles, `sessions`
    // donne leurs heures, leur cours et leur note.
    let todaySessions = sessionsRes.data || [];
    const days = daysRes.data || [];
    const loadedIds = new Set(todaySessions.map((session) => session.id));
    const missingIds = [...new Set(days
      .filter((row) => row.local_date === todayDate && !loadedIds.has(row.session_id))
      .map((row) => row.session_id))];
    if (missingIds.length) {
      const { data: extra } = await supabase.from("sessions").select("*").in("id", missingIds);
      if (extra?.length) todaySessions = [...todaySessions, ...extra];
    }
    setQueuedSessions(listPending(user.id));

    const data = {
      courses: coursesRes.error ? cached?.courses || [] : coursesRes.data || [],
      examRows: examsRes.error ? cached?.examRows || [] : examsRes.data || [],
      sessions: todaySessions,
      recentSessions: recentRes.data || [],
      objectives: objectivesRes.data || [],
      days,
    };
    setClientCache(cacheKey, data, 45000);
    applyDashboardData(data);
  }, [applyDashboardData, dashboardCachePrefix, lang, user]);

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
        // Au COCHAGE seulement : décocher n'est pas un évènement à annoncer.
        autoSharePost(supabase, {
          userId: user.id,
          kind: "goal_completed",
          eventKey: data.id,
          activity: { version: 1, type: "goal_completed", title: data.title || "" },
        });
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
  // Périodes de blocus — remontées par BlocusCard, qui les charge déjà. Les
  // jours hors blocus sont neutres pour la série (ne la cassent pas).
  const [blocusRanges, setBlocusRanges] = useState(null);
  const [blocusLoaded, setBlocusLoaded] = useState(false);
  const handleBlocusLoaded = useCallback((res) => {
    setBlocusRanges(res.supported ? toRanges(res.periods) : null);
    setBlocusLoaded(true);
  }, []);
  const streakPaused = isStreakPaused(blocusRanges);

  // Missions : le chargement est remonté ici parce que trois surfaces en
  // dépendent désormais — la bande de défi contre le bouton Start, le résumé
  // du rail droit, et l'objectif hebdomadaire de la carte « Aujourd'hui ».
  // Le laisser dans un composant aurait obligé à le refaire dans les autres.
  const [levelInfo, setLevelInfo] = useState(null);
  const [serverMissions, setServerMissions] = useState(null);
  const [serverWeekly, setServerWeekly] = useState(null);

  const refreshMissions = useCallback(async () => {
    if (!user) return;
    const [levels, missionsRes, weeklyRes] = await Promise.all([
      loadUserLevelMap(supabase, [user.id], { selfUserId: user.id }).catch(() => null),
      supabase.rpc("get_my_daily_missions").then(r => r).catch(() => ({ data: null })),
      supabase.rpc("get_my_weekly_missions").then(r => r).catch(() => ({ data: null })),
    ]);
    if (levels?.[user.id]) setLevelInfo(levels[user.id]);
    if (Array.isArray(missionsRes?.data) && missionsRes.data.length) {
      setServerMissions(missionsRes.data.map(m => ({
        id: m.mission_id, key: m.label_key, xp: m.xp, done: m.done,
        kind: m.kind || "daily", params: m.params || {},
      })));
    }
    if (Array.isArray(weeklyRes?.data)) {
      setServerWeekly(weeklyRes.data.map(w => ({
        id: w.mission_id, key: w.label_key, target: Number(w.target || 0),
        progress: Number(w.progress || 0), xp: Number(w.xp || 0), done: Boolean(w.done),
      })));
    }
  }, [user]);

  useEffect(() => {
    refreshMissions();
    const onChange = () => refreshMissions();
    window.addEventListener("bt-xp-changed", onChange);
    return () => window.removeEventListener("bt-xp-changed", onChange);
  }, [refreshMissions]);

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
        // Fuseau du démarrage (v65) ; absent → la base prend celui du profil.
        ...(timerTimezone ? { timezone: timerTimezone } : {}),
      };

      pause();
      reset();
      setPendingCredits((prev) => [...prev, { id: payload.id, session: payload }]);

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
      // Fuseau du démarrage (v65) ; absent → la base prend celui du profil.
      ...(timerTimezone ? { timezone: timerTimezone } : {}),
    };

    // 2) Reset UI : le travail est capturé dans la queue, l'utilisateur voit
    //    le timer revenir à 0. Pas de risque de re-cliquer "stop" sur le même
    //    elapsed (id idempotent via PK). Le total du jour prend le relais du
    //    chrono dans le même geste : il ne redescend pas en attendant la base.
    reset();
    setPendingCredits((prev) => [...prev, { id: payload.id, session: payload }]);

    if (isGuest) {
      savingRef.current = false;
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

    // Seule la part d'AUJOURD'HUI compte pour l'objectif du jour : une session
    // commencée avant minuit en laisse une partie à hier.
    const todayPart = secondsOn(unsyncedSessionDays(inserted || payload), localISO(new Date()));
    const newGoalPct = Math.min(100, Math.round(((totalToday + todayPart) / DAILY_GOAL_SECS) * 100));
    const xpGained = Math.floor(seconds / 60);

    // Optimistic update — use the server row si dispo, sinon notre payload
    // (cas du 23505 idempotent où inserted === null mais la ligne existe).
    // Seule la ligne renvoyée par la base entre dans `sessions` : elle porte le
    // fuseau que la base a retenu. Le payload seul reste un crédit en attente
    // jusqu'au rechargement, pour ne pas être pris pour une session historique.
    const sessionRow = inserted || payload;
    clearDashboardCache();
    if (inserted) setSessions(prev => prev.some(s => s.id === inserted.id) ? prev : [inserted, ...prev]);
    notifyXPChanged();
    setSaveStatus("success");
    setTimeout(() => setSaveStatus("idle"), 2500);

    setCompletionToast(buildCompletionData({ seconds, goalPct: newGoalPct, xpGained, courseId, note }));

    // Publie seulement APRÈS un enregistrement réussi : une session encore
    // dans la file hors ligne n'existe pas côté serveur, l'annoncer serait
    // annoncer quelque chose qui n'est pas là. Jamais la note personnelle —
    // on la prend pour soi, pas pour la vitrine.
    const sharedCourse = courses.find(c => c.id === courseId);
    shareSavedSession(supabase, sessionRow, sharedCourse);

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
    setServerDays(prev => prev.filter(row => row.session_id !== id));
    // Un joker rendu a pu être repris par la base (v75) : on relit le stock.
    invalidateStreakFreezeUpkeep();
    setFreezeReload((n) => n + 1);
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
    // Ses anciens jours ne valent plus : la session modifiée est recalculée
    // localement avec la règle de la base (même fuseau, figé à la création)
    // jusqu'au prochain chargement.
    setServerDays(prev => prev.filter(row => row.session_id !== session.id));
    invalidateStreakFreezeUpkeep();
    setFreezeReload((n) => n + 1);
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
    // Comparé aux seuls cours actifs : reprendre le nom d'un cours archivé est
    // le cas normal quand la même matière revient au quadrimestre suivant.
    const duplicate = activeCourses.some((course) => course.id !== id && course.name.trim().toLowerCase() === name.toLowerCase());
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

  // Retirer un cours de la liste ne le détruit JAMAIS : il part à l'archive.
  //
  // La version précédente ne l'archivait que s'il portait des sessions, et
  // supprimait les cours vierges. C'était logique sur le papier et illisible en
  // pratique : le même bouton faisait deux choses différentes selon un état que
  // l'utilisateur ne voit pas, et personne ne s'arrête pour lire ce que veut
  // dire « archiver ». Un seul geste, un seul résultat — et la suppression
  // définitive existe, mais dans l'archive, là où on la cherche exprès.
  async function deleteCourse(id) {
    setCourseEditorBusy(true);
    try {
      const archivedAt = new Date().toISOString();
      const nextCourses = courses.map((course) =>
        course.id === id ? { ...course, archived_at: archivedAt } : course);

      if (!isGuest) {
        const { data, error } = await supabase
          .from("courses")
          .update({ archived_at: archivedAt })
          .eq("id", id)
          .eq("user_id", user.id)
          .select("id")
          .maybeSingle();
        if (error || !data) return { ok: false, message: t("courseEditor.deleteError") };
        clearDashboardCache();
      }

      setCourses(nextCourses);
      if (courseId === id) {
        setCourseId(nextCourses.find((course) => !course.archived_at)?.id || "");
      }
      if (isGuest) {
        writeGuestDashboardData({ courses: nextCourses, sessions, recentSessions, objectives: todayObjectives });
      }
      toast(t("courseEditor.archived"), "success");
      return { ok: true };
    } catch (_) {
      return { ok: false, message: t("courseEditor.deleteError") };
    } finally {
      setCourseEditorBusy(false);
    }
  }

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
  const onBreak = pomodoro && pomoPhase === "break";
  // La pause Pomodoro n'est pas du temps étudié : elle n'alimente ni les blocs,
  // ni le total du jour, ni les moments.
  const blockGoalSecs = onBreak ? null : (pomodoro ? pomoTargetSecs : sessionGoalSecs);
  const liveStudySecs = onBreak ? 0 : elapsed;
  // Marée du mode focus : monte vers l'objectif ; en libre, ambiance basse
  // et constante (aucune "fin" à suggérer).
  const focusTidePct = blockGoalSecs ? Math.min(1, elapsed / blockGoalSecs) : 0.22;

  // ── Session en cours vs journée ───────────────────────────────
  // « Chrono 16:19 / Aujourd'hui 1 min » était techniquement exact et
  // incompréhensible : le total du jour ne lisait que les sessions ENREGISTRÉES
  // pendant que le chrono tenait du temps non encore sauvé. La journée additionne
  // donc trois sources, sans jamais compter une session deux fois (son id est
  // la clé, celle-là même qui rend la file hors ligne idempotente) :
  //   · session_days — les jours que la base connaît déjà ;
  //   · les sessions que la base n'a pas encore renvoyées — arrêtées à
  //     l'instant (`pendingCredits`) ou en file hors ligne — dont les jours sont
  //     calculés avec la règle de la base (lib/studyDays.mjs) ; elles cèdent la
  //     place dès que session_days les contient ;
  //   · `liveStudySecs` — la session qui tourne, remise à zéro par `reset()`
  //     à l'instant précis où le crédit prend le relais.
  // « Aujourd'hui » est la date locale de l'appareil : elle choisit quelle
  // journée afficher, jamais le jour d'une session passée.
  const todayDate = localISO(new Date());
  const unsyncedSessions = useMemo(
    () => [...queuedSessions, ...pendingCredits.map((c) => c.session)],
    [queuedSessions, pendingCredits],
  );
  const studyDays = useMemo(() => (isGuest
    ? mergeStudyDays([], { unsynced: [...sessions, ...unsyncedSessions] })
    : mergeStudyDays(serverDays, { synced: sessions, unsynced: unsyncedSessions })),
  [isGuest, serverDays, sessions, unsyncedSessions]);
  const totalToday = secondsOn(studyDays, todayDate);

  // Série OFFICIELLE (5A2) : le serveur fait foi ; le calcul local canonique
  // ne prend le relais que pendant le chrono, pour une session pas encore en
  // base, en invité ou si le serveur ne répond pas (lib/useOfficialStreak).
  const frozenDays = freezeInfo?.frozenDays;
  const officialStreak = useOfficialStreak({
    supabase,
    userId: user?.id || null,
    serverRows: serverDays,
    rows: studyDays,
    freezes: frozenDays,
    blocusRanges: blocusRanges || undefined,
    liveSeconds: liveStudySecs,
  });
  const streak = officialStreak.current;

  // ── Missions : repli local (hors ligne, invité, serveur muet) ──
  // Le serveur fait foi (get_my_daily_missions, v76) ; ce repli applique les
  // MÊMES règles sur les mêmes sources :
  //   · durée du jour / par cours → les jours canoniques (`studyDays` :
  //     session_days + sessions pas encore en base), portion du jour seulement ;
  //   · une session précise (longue, deux sessions, avant midi) → les sessions
  //     COMMENCÉES aujourd'hui (heure de l'appareil), en base ou en file ;
  //   · la série → la série officielle.
  const missionSessions = useMemo(() => {
    const dayStart = new Date(localDayStartISO()).getTime();
    const byId = new Map();
    for (const s of [...sessions, ...unsyncedSessions]) if (s?.id && !byId.has(s.id)) byId.set(s.id, s);
    return [...byId.values()].filter((s) => new Date(s.started_at).getTime() >= dayStart);
  }, [sessions, unsyncedSessions]);
  const missionStats = useMemo(
    () => missionDayStats({ rows: studyDays, startedToday: missionSessions, today: todayDate, streak }),
    [missionSessions, studyDays, todayDate, streak],
  );

  // Cette page ne lit que les sessions du JOUR : elle ne peut pas calculer un
  // défi qui demande l'historique, et `pickFallbackChallenge` s'abstient
  // plutôt que d'inventer.
  const fallbackAll = useMemo(
    () => evaluateMissions(
      getDailyMissionDefs(todayISO(), user?.id, { streak: missionStats.streak }),
      missionStats,
    ),
    [user?.id, missionStats],
  );
  const allMissions = serverMissions || fallbackAll;
  const dailyMissions = allMissions.filter(m => m.kind !== "challenge");
  const challenge = allMissions.find(m => m.kind === "challenge") || null;
  // w_hours est retirée d'ici : elle s'affiche maintenant comme l'objectif de
  // la stat « cette semaine » de la carte Aujourd'hui. La laisser aussi dans le
  // résumé aurait recréé exactement la duplication qu'on vient d'enlever.
  const weeklyGoalMin = (serverWeekly || []).find(w => w.id === "w_hours")?.target || 0;
  const weeklyMissions = (serverWeekly || []).filter(w => w.id !== "w_hours");

  // ── Joker : quel trou proposer (Phase 5A3) ──
  // Moteur canonique sur les jours connus de l'app. Jamais tant qu'un jour du
  // trou peut encore se remplir tout seul : chrono qui déborde sur ce jour
  // (arrêté maintenant, il y écrirait des secondes), session de ce jour en
  // file d'attente. Un chrono commencé aujourd'hui ne bloque pas « hier ».
  const chronoDays = liveChronoDays({ elapsedSeconds: elapsed, timezone: timerTimezone });
  const chronoDaysKey = chronoDays.join("|");
  const freezeGapInfo = useMemo(() => {
    if (isGuest || !freezeInfo?.supported || !blocusLoaded) return null;
    return freezeGap({
      rows: studyDays,
      freezes: freezeInfo.frozenDays,
      blocusRanges: blocusRanges || [],
      today: officialStreak.today,
      rules: officialStreak.rules,
      stock: freezeInfo.stock,
      blockedDays: [...(chronoDaysKey ? chronoDaysKey.split("|") : []), ...pendingSessionDays(unsyncedSessions)],
    });
  }, [isGuest, freezeInfo, blocusLoaded, studyDays, blocusRanges, officialStreak.today, officialStreak.rules, chronoDaysKey, unsyncedSessions]);

  // Proposé une fois par trou ; un refus n'est pas redemandé pour ce même trou.
  const freezeOfferShown = useRef(false);
  useEffect(() => {
    if (!freezeGapInfo?.canRepair || freezeOfferShown.current) return;
    let declined = null;
    try { declined = localStorage.getItem(FREEZE_DECLINED_KEY); } catch {}
    if (declined === gapKey(freezeGapInfo.days)) return;
    freezeOfferShown.current = true;
    setFreezeOfferOpen(true);
  }, [freezeGapInfo]);
  // Chrono lancé ou session en attente pendant que l'offre est ouverte : on la
  // retire, elle reviendra si le jour reste manqué.
  useEffect(() => {
    if (freezeOfferOpen && !freezeBusy && !freezeGapInfo?.canRepair) {
      setFreezeOfferOpen(false);
      freezeOfferShown.current = false;
    }
  }, [freezeOfferOpen, freezeBusy, freezeGapInfo]);

  // Un jour protégé est devenu étudié (session synchronisée) : la base a rendu
  // le joker (v74) — on relit le stock. Une seule relecture par jour concerné.
  const freezeRechecked = useRef(new Set());
  useEffect(() => {
    const days = freezeInfo?.frozenDays || [];
    const fresh = days.filter((d) => !freezeRechecked.current.has(d)
      && secondsOn(studyDays, d) >= studyDayMinSeconds(d, officialStreak.rules));
    if (!fresh.length || unsyncedSessions.length) return;
    fresh.forEach((d) => freezeRechecked.current.add(d));
    invalidateStreakFreezeUpkeep();
    setFreezeReload((n) => n + 1);
  }, [freezeInfo, studyDays, officialStreak.rules, unsyncedSessions]);

  // Accepter : pose réellement les jokers (le serveur revérifie chaque jour).
  const acceptFreeze = useCallback(async () => {
    const days = freezeGapInfo?.days || [];
    if (!days.length || freezeBusy || !freezeInfo) return;
    setFreezeBusy(true);
    const res = await applyStreakFreezes(supabase, days);
    setFreezeBusy(false);
    setFreezeOfferOpen(false);
    if (!res.ok) {
      // Refus « déjà étudié / hors blocus » : la série n'a pas besoin de joker.
      const notNeeded = res.reason === "studied" || res.reason === "outside_blocus";
      toast(t(notNeeded ? "streak.offerNotNeeded" : "streak.offerFailed"), notNeeded ? "success" : "error");
      setFreezeReload((n) => n + 1);
      return;
    }
    setFreezeInfo({ ...freezeInfo, frozenDays: [...freezeInfo.frozenDays, ...days], stock: res.stock });
    toast(t("streak.offerDone"), "success");
  }, [freezeGapInfo, freezeBusy, freezeInfo, t, toast]);

  // Supprimer / raccourcir une session : le jour repasserait-il sous son seuil ?
  const sessionDayLoss = (session, newSeconds) =>
    daysLostByChange({ rows: studyDays, session, newSeconds, rules: officialStreak.rules }).length > 0;

  const declineFreeze = useCallback(() => {
    try { localStorage.setItem(FREEZE_DECLINED_KEY, gapKey(freezeGapInfo?.days)); } catch {}
    setFreezeOfferOpen(false);
  }, [freezeGapInfo]);
  // La liste du jour : exactement les sessions qui font ce total, chacune avec
  // SA part d'aujourd'hui (`day_seconds`) et ses vraies heures.
  const todaySessionList = useMemo(() => sessionsOnDay(studyDays, todayDate, isGuest
    ? { unsynced: [...sessions, ...unsyncedSessions] }
    : { synced: sessions, unsynced: unsyncedSessions }),
  [studyDays, todayDate, isGuest, sessions, unsyncedSessions]);

  // ── Records (fenêtre 90 jours) ────────────────────────────────
  const dayTotals = secondsByDay(studyDays);
  const bestDaySecs = Object.values(dayTotals).reduce((m, v) => Math.max(m, v), 0);
  const longestSessionSecs = recentSessions.reduce((m, s) => Math.max(m, s.duration_seconds || 0), 0);
  // « Cette semaine » = du lundi à aujourd'hui (calendrier local), la même
  // définition que sur /stats et que la mission hebdomadaire dont l'objectif
  // s'affiche à côté. Les barres montrent lundi → dimanche : les jours passés
  // additionnés donnent exactement le total, les jours à venir restent vides.
  const weekSecs = thisWeekSeconds(studyDays);
  const weekDays = currentWeekDates().map((date) => ({
    date,
    secs: dayTotals[date] || 0,
    isToday: date === todayDate,
    isFuture: date > todayDate,
  }));

  // ── Ce que les blocs ne disent pas ───────────────────────────
  // L'en-tete des blocs portait quatre encodages de la meme quantite : le
  // libelle, la pastille d'unite, « N termines », puis une phrase « 3/8 blocs ·
  // encore 1h12 » sous la piste — alors que le chrono geant donnait deja la
  // valeur exacte. Il n'en reste qu'un slot, a droite, pour la seule question
  // que le dessin ne tranche pas : ce qu'il reste, ou ce qui a ete fait en plus.
  // Meme echelle que la piste : ni le libelle d'unite ni le compte a rebours ne
  // peuvent la contredire. « Prochain bloc dans 15 min » pendant que la piste
  // affiche des heures serait exactement l'ambiguite qu'on essaie de retirer.
  const blockUnitSecs = studyBlockLayout({
    earnedSecs: elapsed, plannedSecs: blockGoalSecs, maxUnits: 12,
  }).unitSecs;
  const nextBlockMin = Math.max(1, Math.ceil((blockUnitSecs - (elapsed % blockUnitSecs)) / 60));
  function blockAside() {
    // La pause du chrono comme celle du Pomodoro disent deja leur etat : le
    // slot reste vide plutot que d'annoncer « 0 min etudiees ».
    if (isPaused || onBreak) return null;
    // Pomodoro : les chiffres comptent a rebours, donc la valeur exacte du
    // temps etudie ne serait ecrite nulle part ailleurs.
    if (pomodoro) return t("dash.blkStudied").replace("{t}", formatMinutesShort(elapsed));
    if (blockGoalSecs) {
      const over = elapsed - blockGoalSecs;
      // Sous la minute, on ne raconte ni « +0 min » ni « encore 0 min » : on
      // dit l'état. Au-delà, la valeur arrondie suffit — le chrono garde
      // la seconde exacte juste au-dessus.
      if (over >= 60) return t("dash.blkOver").replace("{t}", formatMinutesShort(over));
      if (over >= 0) return t("dash.goalDone");
      return t("dash.blkLeft").replace("{t}", formatMinutesShort(Math.max(60, -over)));
    }
    return t("dash.blkFreeNext").replace("{m}", String(nextBlockMin));
  }
  const blocksAside = blockAside();
  const blocksAria = blockGoalSecs
    ? t("dash.blkAriaGoal")
        .replace("{done}", formatMinutesShort(elapsed))
        .replace("{goal}", formatMinutesShort(blockGoalSecs))
    : t("dash.blkStudied").replace("{t}", formatMinutesShort(elapsed));
  // Une pause dit son etat une seule fois, dans son libelle.
  const liveMessage = onBreak ? t("dash.nextAutoStart") : null;

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
    //
    // Le quart d'heure ne déclenche PLUS la mascotte. Une journée de blocus de
    // huit heures produisait trente-deux apparitions : à ce rythme le
    // personnage ne félicite plus rien, il commente. L'accumulation ordinaire
    // est désormais dite par les blocs eux-mêmes — plus un retour haptique bref
    // toutes les vingt-cinq minutes. Il reste les heures pleines, l'objectif de
    // session, l'objectif du jour, la plus longue session et le record du jour :
    // des événements qui existaient déjà, aucun critère nouveau.
    const hours = Math.floor(elapsed / 3600);
    if (hours >= 1) fire(`hour${hours}`, t("dash.momentHour").replace("{h}", String(hours)));
    if (sessionGoalSecs && elapsed >= sessionGoalSecs) fire("sessionGoal", t("dash.momentSessionGoal"));
    if (totalToday < DAILY_GOAL_SECS && totalToday + elapsed >= DAILY_GOAL_SECS) fire("daily", t("dash.momentDaily"));
    if (longestSessionSecs > 0 && elapsed > longestSessionSecs) fire("longest", t("dash.momentLongest"));
    if (bestDaySecs > 0 && totalToday < bestDaySecs && totalToday + elapsed > bestDaySecs) fire("bestDay", t("dash.momentBestDay"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [elapsed, running, pomodoro, pomoPhase]);

  // Un crédit disparaît dès que la base connaît sa session : le total ne
  // bouge pas, il change juste de source.
  useEffect(() => {
    const known = new Set([...sessions.map((s) => s.id), ...serverDays.map((row) => row.session_id)]);
    setPendingCredits((prev) => {
      const kept = prev.filter((c) => !known.has(c.id));
      return kept.length === prev.length ? prev : kept;
    });
  }, [sessions, serverDays]);

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

  // En découverte la mascotte est réservée aux gates contextuels. Les petits
  // jalons du chrono restent textuels et le récap XP n'existe pas : le visiteur
  // teste le cœur sans simuler une progression de compte.
  const timerMoment = !isGuest && moment ? { key: `timer-${moment.id}`, message: moment.text } : null;
  // Ce que la mascotte ne dit plus, l'écran le dit en texte : l'état de pause
  // et l'invitation à démarrer, qui n'ont jamais été des exploits.
  // Le libellé « En pause · mm:ss » dit déjà l'état et sa durée : la phrase de
  // coach n'apparaît que lorsqu'elle AJOUTE quelque chose, après dix minutes.
  const timerHint = timerMoment
    ? null
    : isPaused
      ? (pauseSeconds >= 10 * 60 ? t("coach.timer.longPause") : null)
      : (!running && elapsed === 0)
        ? t("coach.timer.ready")
        : null;
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
      <div className={`bt-dashboard-grid grid min-w-0 grid-cols-1 items-start gap-4 sm:gap-5 lg:items-stretch lg:gap-6 ${isGuest ? "mx-auto max-w-3xl lg:grid-cols-1" : "lg:grid-cols-[minmax(0,1.55fr)_minmax(320px,0.75fr)]"}`}>

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
        {/* ── La carte entière change d'état en pause ──────────────────
            Le lavis vert du travail s'éteint ET la carte prend la teinte
            d'attention : fond, bordure et halo. C'est volontairement fort.
            Ce n'est pas une sémantique d'erreur (voir DESIGN.md § The
            Paused-Timer Exception) : c'est le rappel qu'une session est
            ouverte et que le temps n'est plus compté. Les étudiants mettent
            en pause, se laissent distraire, et oublient de relancer — un
            traitement discret leur coûtait des heures de travail non
            enregistrées. */}
        <section className="bt-dashboard-timer order-1 lg:order-1 card relative min-w-0 overflow-hidden"
          style={{
            backgroundColor: isPaused ? "var(--bt-pause-bg)" : "var(--bt-surface)",
            backgroundImage: isPaused ? "none" : "radial-gradient(90% 75% at 50% 100%, var(--bt-timer-wash), transparent 72%), linear-gradient(180deg, var(--bt-surface), var(--bt-timer-base))",
            borderColor:     isPaused ? "var(--bt-pause-border)" : "var(--bt-border)",
            boxShadow:       isPaused ? "0 4px 32px var(--bt-pause-shadow)" : "0 4px 32px var(--bt-shadow)",
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

          {/* ── Barre de contexte : cours actif · modes · plein écran ──
              z-30 et non z-20 : le défi du jour, juste en dessous, est aussi
              en z-20 et vient APRÈS dans le DOM — il recouvrait donc le menu
              des cours ouvert. */}
          <div className="relative z-30 grid grid-cols-[minmax(0,1fr)_auto] gap-2 px-4 pt-4 sm:px-6 sm:pt-5">
            <div className="flex min-w-0 items-center gap-2">
              <div className="relative min-w-0 flex-1">
                {activeCourses.length === 0 ? (
                  <button type="button" onClick={() => isGuest ? setGuestGate("course") : openCourseEditor()} className="bt-dashboard-control flex min-h-11 w-full items-center justify-center rounded-xl border border-dashed px-3 text-sm font-semibold" style={{ borderColor: "var(--bt-border)", color: "var(--bt-accent-text)" }}>
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
                      <Glyph size={14} className={`shrink-0 transition-transform duration-200 motion-reduce:transition-none ${showCourseMenu ? "rotate-180" : ""}`}>
                        <path d="m6 9 6 6 6-6" />
                      </Glyph>
                    )}
                  </button>
                )}

                {showCourseMenu && !running && (
                  <div className="bt-dashboard-menu absolute left-0 top-full z-30 mt-1.5 w-72 max-w-[calc(100vw-3.5rem)] overflow-hidden rounded-2xl" style={{ backgroundColor: "var(--bt-surface)", border: "1px solid var(--bt-hairline)", boxShadow: "0 14px 38px var(--bt-shadow)" }}>
                    <div className="max-h-64 overflow-y-auto py-1" role="listbox" aria-label={t("dash.selectCourse")}>
                      {activeCourses.map((course) => (
                        <button key={course.id} type="button" role="option" aria-selected={courseId === course.id} onClick={() => { setCourseId(course.id); setShowCourseMenu(false); }} className="bt-dashboard-menu-item flex min-h-11 w-full items-center gap-3 px-4 text-left">
                          <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: course.color }} aria-hidden="true" />
                          <span className="min-w-0 flex-1 truncate text-sm font-semibold" style={{ color: "var(--bt-text-1)" }}>{course.name}</span>
                          {courseId === course.id && (
                            <Glyph size={15} strokeWidth={2.5} style={{ color: "var(--bt-accent)" }}>
                              <path d="m20 6-11 11-5-5" />
                            </Glyph>
                          )}
                        </button>
                      ))}
                    </div>
                    <div className="border-t p-1" style={{ borderColor: "var(--bt-border)" }}>
                      <button
                        type="button"
                        onClick={() => { setShowCourseMenu(false); isGuest ? setGuestGate("course") : openCourseEditor(); }}
                        className="bt-dashboard-menu-item flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-left text-sm font-bold"
                        style={{ color: "var(--bt-accent-text)" }}
                      >
                        <Glyph size={16}>
                          <path d="M12 5v14M5 12h14" />
                        </Glyph>
                        {t("courseEditor.addTitle")}
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {(() => {
                const selectedCourse = courses.find((item) => item.id === courseId);
                const exam = nextCourseExam(selectedCourse?.id);
                if (!exam) return null;
                const days = daysUntilExam(exam.exam_date);
                return (
                  <span className="shrink-0 whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-bold" style={{ backgroundColor: days <= 0 ? "var(--bt-danger-bg)" : days <= 7 ? "#FEF3C7" : "var(--bt-accent-bg)", color: days <= 0 ? "var(--bt-danger)" : days <= 7 ? "#A85E00" : "var(--bt-accent-text)" }}>
                    {days === 0 ? t("exam.today") : days < 0 ? t("exam.passed") : t("exam.daysAway").replace("{n}", String(days))}
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
              <Glyph size={16}>
                <path d="M8 3H5a2 2 0 0 0-2 2v3M16 3h3a2 2 0 0 1 2 2v3M21 16v3a2 2 0 0 1-2 2h-3M8 21H5a2 2 0 0 1-2-2v-3" />
                <circle cx="12" cy="12" r="2.5" />
              </Glyph>
              <span>{t("dash.focusShort")}</span>
            </button>
          </div>

          {/* Le Défi du jour, SOUS le cours et avant le bouton Démarrer. Il
              était au-dessus du sélecteur : une mission passait donc avant la
              première question de la page, « qu'est-ce que j'étudie ». Il
              s'efface aussi dès qu'une session existe — pendant une pause, il
              venait commenter par-dessus un chrono arrêté. Sa place dans la
              liste des objectifs du jour, elle, ne bouge pas.
              Le tap n'est proposé QUE si le cours du défi existe encore dans la
              liste : un bouton qui ne sélectionne rien, ou qui sélectionne un
              cours supprimé pour se faire corriger à la frame suivante, vaut
              moins qu'une simple ligne de texte. */}
          {challenge && !isGuest && !running && elapsed === 0 && (
            <div className="relative z-20 mt-3 px-4 sm:px-6">
              <ChallengeStrip
                challenge={challenge}
                onPickCourse={activeCourses.some(c => c.id === challenge?.params?.course_id) ? setCourseId : undefined}
              />
            </div>
          )}

          {/* ── Héros : chiffres + onde de session + ligne vivante ── */}
          <div className="px-4 pb-3 pt-8 text-center sm:px-6 sm:pt-10">
            {pomodoro && (
              <div className="mb-3 text-[11px] font-bold uppercase tracking-[0.18em]"
                style={{ color: pomoPhase === "work" ? "var(--bt-accent-text)" : "var(--bt-text-2)" }}>
                {pomoPhase === "work" ? t("dash.work") : t("dash.pause")}
                {pomoCount > 0 && <span className="font-medium ml-2 opacity-60">· {t("dash.cycle")} {pomoCount}</span>}
              </div>
            )}
            {/* La pastille d'état, franche et qui respire. Elle porte sa durée :
                « En pause · 04:12 » répond d'un coup à « depuis quand est-ce
                que je ne compte plus ? », ce qui est précisément la question
                d'un retour de distraction.
                L'annonce vocale est portée par un compagnon invisible au texte
                FIXE. Mettre `role="status"` sur la pastille elle-même aurait
                relu « En pause · 04:13 » à chaque seconde — un lecteur d'écran
                serait devenu inutilisable. La durée reste lisible à la demande,
                elle n'est simplement pas dans une région vivante. */}
            {isPaused && !pomodoro && (
              <div className="mb-3 flex justify-center">
                <span className="sr-only" role="status">{t("dash.pausedStatus")}</span>
                <span className="bt-pause-pulse inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.14em]"
                  style={{ color: "#FFFFFF", backgroundColor: "var(--bt-pause-strong)", border: "1px solid var(--bt-pause-strong)" }}>
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg>
                  <span className="font-num tabular-nums">{t("dash.pausedFor").replace("{t}", pauseSince)}</span>
                </span>
              </div>
            )}

            {/* Les chiffres passent à la teinte d'attention : c'est l'élément le
                plus grand de l'écran, donc le plus sûr à reconnaître de loin. */}
            <TimerDigits
              seconds={pomodoro ? Math.max(0, pomoTargetSecs - elapsed) : elapsed}
              color={isPaused && !pomodoro ? "var(--bt-pause)" : "var(--bt-text-1)"} />

            {(running || elapsed > 0) && (
            <div className="mx-auto mt-5 w-full max-w-[440px] sm:mt-6">
              <div className="mb-2 flex items-center justify-between gap-3 text-xs" style={{ color: "var(--bt-text-3)" }}>
                <span className="flex min-w-0 items-center gap-2">
                  {/* Sous 380 px, « Blocs de la session » se reduisait a
                      « Blo… » : la pastille d'unite dit deja de quoi parle la
                      rangee. « Pause », lui, reste — c'est le seul libelle de
                      la piste de repos. */}
                  <span className={onBreak ? "truncate" : "hidden truncate xs:inline"}>
                    {onBreak ? t("dash.pause") : t("dash.sessionBlocks")}
                  </span>
                  {/* L'unité est écrite parce qu'elle CHANGE : quinze minutes
                      sur une session courte, une heure sur une journée de
                      blocus. Compresser sans le dire rendrait la piste
                      ambiguë. */}
                  {!onBreak && (
                    <span className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold" style={{ backgroundColor: "var(--bt-accent-bg)", color: "var(--bt-accent-text)" }}>
                      {t("dash.blockUnitLabel").replace("{u}", formatMinutesShort(blockUnitSecs))}
                    </span>
                  )}
                </span>
                {blocksAside && (
                  <span className="font-num shrink-0 font-semibold tabular-nums">{blocksAside}</span>
                )}
              </div>
              {onBreak ? (
                <RestTrack
                  remainingSecs={Math.max(0, pomoTargetSecs - elapsed)}
                  totalSecs={pomoTargetSecs}
                  label={t("dash.breakAria").replace("{t}", formatMinutesShort(Math.max(0, pomoTargetSecs - elapsed)))}
                />
              ) : (
                <StudyBlocks
                  earnedSecs={elapsed}
                  plannedSecs={blockGoalSecs}
                  running={running}
                  paused={isPaused}
                  maxUnits={12}
                  label={blocksAria}
                />
              )}
            </div>
            )}

            {/* Coach visible uniquement avant, en pause ou lors d'un vrai
                accomplissement. Pendant le travail normal, la ligne reste
                textuelle pour ne pas distraire. */}
            <div className={`${(timerMoment || liveMessage || timerHint) ? "min-h-[58px] mt-4" : "mt-0"} flex items-center justify-center`}>
              {timerMoment && !focusMode ? (
                <MascotMoment
                  message={timerMoment.message}
                  mood="proud"
                  frequency="always"
                  streak={streak}
                  dismissible={false}
                  size={42}
                  live
                />
              ) : !timerMoment && (liveMessage || timerHint) ? (
                <p key={liveMessage || timerHint} className={`text-sm ${isPaused ? "font-medium" : "bt-msg-swap"}`}
                  style={{ color: isPaused ? "var(--bt-pause-text)" : "var(--bt-text-3)" }}>
                  {liveMessage || timerHint}
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
                {!isGuest && (!pomodoro || pomoPhase === "work") && !noteOpen && !note && (
                  <button type="button" onClick={() => setNoteOpen(true)}
                    className="bt-filter-btn inline-flex min-h-8 items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-semibold">
                    <Glyph size={12}>
                      <path d="M12 5v14M5 12h14" />
                    </Glyph>
                    {t("dash.noteLabel")}
                  </button>
                )}
              </div>
            </div>
          )}

          {/* ── Note — champ discret, souligné au focus seulement ── */}
          {!isGuest && (!pomodoro || pomoPhase === "work") && (noteOpen || note || running || elapsed > 0) && (
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
                    style={{ backgroundColor: "var(--bt-subtle)", color: "var(--bt-text-1)", border: "1px solid var(--bt-hairline)" }}
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
                      <Glyph size={13}>
                        <polyline points="20 6 9 17 4 12"/>
                      </Glyph>
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

        {isGuest && sessions.length > 0 && (
          <p className="order-2 px-2 text-center text-sm" style={{ color: "var(--bt-text-2)" }}>
            <Link href="/signup" className="font-semibold" style={{ color: "var(--bt-accent-text)" }}>{t("guest.timerProgressHint")}</Link>
          </p>
        )}

        <TodaySessionsCard
          // Trois sessions au plus, le reste sur l'historique : la carte a
          // donc une hauteur bornée et n'a plus besoin de défiler en dedans.
          // `flex-1` lui fait prendre le reste de la colonne quand la colonne
          // de droite est la plus haute — la Progression du jour fait de même
          // dans l'autre sens, si bien qu'aucune des deux ne laisse de trou.
          className="order-4 lg:order-3 lg:flex-1"
          showDividers={false}
          limit={isGuest ? 2 : 3}
          seeAllHref={isGuest ? "" : "/historique"}
          sessions={todaySessionList}
          courses={courses}
          selectableCourses={activeCourses}
          onUpdate={updateSession}
          onDelete={deleteSession}
          dayLossFor={sessionDayLoss}
          actionsHint={!isGuest}
          readOnly={isGuest}
        />

        {todayObjectives.length > 0 && (
          <section className="order-5 card flex min-h-0 flex-col p-4 sm:p-5 lg:order-4">
            <div className="mb-3 flex shrink-0 items-center justify-between gap-3">
              <h2 className="text-lg font-bold" style={{ color: "var(--bt-text-1)" }}>{t("dash.todo")}</h2>
              <span className="font-num inline-flex min-h-7 min-w-7 items-center justify-center rounded-full px-2 text-xs font-bold tabular-nums" style={{ backgroundColor: "var(--bt-subtle)", color: "var(--bt-text-2)" }}>
                {todayObjectives.filter((item) => item.done).length}/{todayObjectives.length}
              </span>
            </div>
            <ul className="divide-y divide-[color:var(--bt-border)]">
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
                          <Glyph size={11} strokeWidth={3} style={{ color: "#fff" }}>
                            <path d="m5 12 4 4L19 6" />
                          </Glyph>
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
        {!isGuest && <aside className="contents min-w-0 lg:flex lg:flex-col lg:gap-6">
          <MissionSummary
            className="order-2 lg:order-none"
            missions={dailyMissions}
            challenge={challenge}
            weekly={weeklyMissions}
            levelInfo={levelInfo}
            streak={streak}
          />
          <TodayProgressCard
            className="order-3 lg:order-none lg:flex-1"
            totalToday={totalToday}
            liveSecs={liveStudySecs}
            goalSecs={DAILY_GOAL_SECS}
            weekSecs={weekSecs}
            weekDays={weekDays}
            weeklyGoalMin={weeklyGoalMin}
            streak={streak}
            streakPaused={streakPaused}
            freezeInfo={freezeInfo}
          />
        </aside>}

        {!isGuest && <div className="order-6 grid min-w-0 gap-4 sm:gap-5 lg:col-span-2 lg:grid-cols-2 lg:gap-6">
          <DashboardCoursesCard
            courses={activeCourses}
            nextExamForCourse={nextCourseExam}
            checklistCounts={checklistCounts}
            onAdd={() => isGuest ? setGuestGate("course") : openCourseEditor()}
            onOpen={(course) => {
              if (isGuest) {
                setGuestGate("course");
                return;
              }
              setChecklistCourse(course);
            }}
          />
          <BlocusCard
            studyDays={studyDays}
            exams={normalizedExams}
            courses={courses}
            onChange={handleBlocusLoaded}
          />
        </div>}
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

      <GuestGate gate={guestGate} onClose={() => setGuestGate(null)} />

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
          la série officielle la voit déjà cassée (hier manque), elle vaut donc 0
          et l'offre dirait « ta série de 0 jours peut être sauvée ». Même moteur
          canonique, avec les jokers proposés comptés comme posés. */}
      {/* Invitation aux notifications — au premier passage seulement, et après
          l'offre de gel pour ne pas empiler deux fenêtres. */}
      <PushOptInPrompt />

      <StreakFreezeOffer
        open={freezeOfferOpen}
        streak={studyStreaks({
          rows: studyDays,
          freezes: [...(freezeInfo?.frozenDays || []), ...(freezeGapInfo?.days || [])],
          blocusRanges: blocusRanges || [],
          today: officialStreak.today,
          rules: officialStreak.rules,
        }).current}
        days={freezeGapInfo?.days || []}
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
              statique et coupe la boucle sous prefers-reduced-motion. En pause,
              le champ vire au rouge : en plein écran il n'y a pas de carte pour
              porter l'état, c'est l'environnement qui le porte. */}
          <FocusShaderBackground paused={isPaused && !pomodoro} />

          {/* Respiration rouge périphérique — le signal qui rattrape un regard
              parti ailleurs. Cycle de 2,4 s, courbe douce et centre transparent
              (voir globals.css) : aussi voyant que l'ancien battement à 1 Hz,
              sans son attaque stroboscopique. En mouvement réduit, le halo
              reste posé à pleine force au lieu de disparaître. */}
          {isPaused && !pomodoro && <div aria-hidden className="bt-pause-flash" />}

          {/* Ambiance sonore synthétisée (opt-in, 0 fichier / 0 egress) */}
          <AmbientSoundControl active={focusMode} visible={focusCtlVisible || !running} />

          <p className="text-xs mb-5 relative z-10" style={{ color: "var(--bt-ink-muted)" }}>
            {focusGreeting(t)}
          </p>

          {pomodoro && (
            <p className="text-xs font-semibold uppercase tracking-widest mb-3 relative z-10"
              style={{ color: pomoPhase === "work" ? "var(--bt-accent)" : "var(--bt-ink-muted)" }}>
              {pomoPhase === "work" ? t("dash.work") : t("dash.pause")}
              {pomoCount > 0 && <span className="font-normal ml-2 opacity-60">· {t("dash.cycle")} {pomoCount}</span>}
            </p>
          )}

          {/* Le cours garde son identité en plein écran : un marqueur de sa
              couleur, pas un habillage complet de l'écran. Sans lui, Focus
              perdait le seul repère visuel partagé avec le Chrono, le planning
              et les stats. Le cercle clair l'isole du champ mouvant. */}
          <p className="text-sm mb-2 relative z-10 flex items-center gap-2" style={{ color: "var(--bt-ink-muted)" }}>
            {courseId && courses.find((c) => c.id === courseId)?.color && (
              <span aria-hidden="true" className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{
                  backgroundColor: courses.find((c) => c.id === courseId).color,
                  boxShadow: "0 0 0 1.5px rgba(255,255,255,0.32)",
                }} />
            )}
            <span>{courseId ? courseName(courseId) : t("dash.noCourse")}</span>
          </p>

          <div className="relative z-10 w-full text-center px-6">
            <TimerDigits
              seconds={pomodoro ? Math.max(0, pomoTargetSecs - elapsed) : elapsed}
              color={(isPaused && !pomodoro) ? "#FFEDEB" : "var(--bt-ink-text)"}
              size="clamp(4.5rem, 16vw, 8.5rem)"
              hoursSize="clamp(3.2rem, 11vw, 7rem)" />

            {/* Même échelle et même plafond d'unités que le Chrono : le
                plein écran ne compresse plus différemment. */}
            <div className="mt-10 mx-auto w-full max-w-[600px]">
              {onBreak ? (
                <RestTrack
                  focus
                  remainingSecs={Math.max(0, pomoTargetSecs - elapsed)}
                  totalSecs={pomoTargetSecs}
                  label={t("dash.breakAria").replace("{t}", formatMinutesShort(Math.max(0, pomoTargetSecs - elapsed)))}
                />
              ) : (
                <StudyBlocks
                  focus
                  earnedSecs={elapsed}
                  plannedSecs={blockGoalSecs}
                  running={running}
                  paused={isPaused}
                  maxUnits={12}
                  label={blocksAria}
                />
              )}
            </div>

            <div className="min-h-[82px] mt-5 flex items-center justify-center">
              {timerMoment ? (
                <MascotMoment
                  message={timerMoment.message}
                  mood="proud"
                  frequency="always"
                  streak={streak}
                  dismissible={false}
                  size={52}
                  live
                />
              ) : (liveMessage || timerHint) ? (
                <p key={liveMessage || timerHint} className={`text-sm ${isPaused ? "font-medium" : "bt-msg-swap"}`}
                  style={{ color: isPaused ? "#FFB0A8" : "var(--bt-ink-muted)" }}>
                  {liveMessage || timerHint}
                </p>
              ) : null}
            </div>

            {/* En pause — pastille franche qui respire, avec sa durée. L'annonce
                vocale vit dans le compagnon invisible de la carte : une seule
                région vivante suffit, et elle ne doit pas relire la durée. */}
            {isPaused && !pomodoro && (
              <div className="bt-pause-pulse inline-flex items-center gap-1.5 mt-4 px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-widest"
                style={{ color: "#FFFFFF", backgroundColor: "var(--bt-pause-strong)", letterSpacing: "0.12em" }}>
                <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg>
                <span className="font-num tabular-nums">{t("dash.pausedFor").replace("{t}", pauseSince)}</span>
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
            <Glyph size={14}>
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </Glyph>
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
