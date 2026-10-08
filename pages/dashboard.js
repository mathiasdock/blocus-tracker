import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import Glyph from "../components/Glyph";
import Link from "next/link";
import { useRouter } from "next/router";
import Layout from "../components/Layout";
import { PageContentSkeleton, useSkeletonHatch } from "../components/PageSkeleton";
import { useAuth } from "../contexts/AuthContext";
import { useI18n } from "../contexts/I18nContext";
import { supabase } from "../lib/supabaseClient";
import { formatMinutesShort, todayISO, localISO, localDayStartISO, isStreakPaused } from "../lib/format";
import { notifyXPChanged } from "../lib/xpEvents";
import { autoSharePost, shareSavedSession } from "../lib/autoShare";
import { dailyStudyGoalSeconds, fetchDailyObjectives } from "../lib/dailyStudyGoal.mjs";
import { clearClientCache, getClientCache, setClientCache } from "../lib/clientCache";
import { newClientId, enqueueSession, removeFromQueue, flushPending, listPending } from "../lib/timerDraft";
import { currentWeekDates, fetchStudyDays, mergeStudyDays, secondsByDay, secondsOn, sessionsOnDay, thisWeekSeconds, unsyncedSessionDays } from "../lib/studyDays.mjs";
import { studyDayMinSeconds, studyStreaks } from "../lib/studyDayStates.mjs";
import { useOfficialStreak } from "../lib/useOfficialStreak";
import { COURSE_COLORS } from "../lib/courseColors";
import { runStreakFreezeUpkeep, applyStreakFreezes, gapKey, invalidateStreakFreezeUpkeep } from "../lib/streakFreezes";
import { freezeGap, liveChronoDays, pendingSessionDays } from "../lib/streakFreezeGap.mjs";
import { daysLostByChange } from "../lib/sessionDayImpact.mjs";
import { missionDayStats } from "../lib/missionStats.mjs";
import { isDailyCapError, dailyCapMessage } from "../lib/dailyCap.mjs";
import StreakFreezeOffer from "../components/StreakFreezeOffer";
import { useToast } from "../contexts/ToastContext";
import PendingSessionsBanner from "../components/PendingSessionsBanner";
import CourseChecklistModal from "../components/CourseChecklistModal";
import CourseEditorModal from "../components/CourseEditorModal";
import Mascot from "../components/Mascot";
import MascotMoment from "../components/MascotMoment";
import AnimatedNumber from "../components/AnimatedNumber";
import SessionCompleteCard from "../components/SessionCompleteCard";
import MissionSummary from "../components/MissionSummary";
import ChallengeStrip from "../components/ChallengeStrip";
import { loadUserLevelMap } from "../lib/userLevels";
import { getDailyMissionDefs, evaluateMissions } from "../lib/xp";
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
import { useChrono } from "../components/timer/useChrono";
import ChronoCard from "../components/timer/ChronoCard";
import ChronoFocus from "../components/timer/ChronoFocus";
import { GUEST_USER_ID, appendGuestSession, readGuestDashboardData, writeGuestDashboardData } from "../lib/guestStudySpace";

function daysUntilExam(dateStr) {
  if (!dateStr) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const exam = new Date(dateStr + "T12:00:00");
  return Math.floor((exam - today) / 86400000);
}

// Refus de gel déjà exprimé pour un trou donné — évite de reposer la question
// en boucle le même jour, sans empêcher une nouvelle proposition plus tard.
const FREEZE_DECLINED_KEY = "bt_freeze_declined_v1";

const COLORS = COURSE_COLORS;

// Compte qui a choisi lui-même un cours depuis l'ouverture de l'app (module :
// survit aux allers-retours entre pages). Avant ce choix, le chrono suit le
// dernier cours étudié ; après, il ne le remplace plus.
let coursePickedBy = null;

export default function Dashboard() {
  const { user, loading: authLoading } = useAuth();
  const { t, lang } = useI18n();
  const { toast } = useToast();
  // Premier chargement des donnees de la page. Tant qu'il n'est pas termine on
  // affiche un squelette : sinon la page rend des zeros et des listes vides,
  // que les gens lisent comme un bug et non comme un chargement.
  const [ready, setReady] = useState(false);
  // Le Chrono (components/timer) : démarrage, pause, cycle Pomodoro, Blocus
  // Blocks, Focus. La page dit où va un bloc de travail Pomodoro terminé (plus
  // bas) ; le cycle attend que ses données soient chargées.
  const chrono = useChrono({
    ownerId: user?.id || GUEST_USER_ID,
    enabled: ready,
    defaultMode: "free",
    onWorkComplete: savePomodoroWork,
  });
  const {
    courseId,
    setCourseId,
    note,
    running,
    elapsed,
    timezone: timerTimezone,
    sessionId,
    start,
    pause,
    reset,
    hydrated: timerHydrated,
    pomodoro,
    pomoPhase,
    liveStudySecs,
    sessionGoalSecs,
    hint,
  } = chrono;
  const forceSkeleton = useSkeletonHatch();
  const [courses, setCourses] = useState([]);
  const [newCourseId, setNewCourseId] = useState(null);
  // Espace (compte ou démo invité) auquel appartient `courses` ; null tant
  // que rien n'est chargé. Voir le repli du cours du chrono plus bas.
  const [coursesOwner, setCoursesOwner] = useState(null);
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
  const todayDate = localISO(new Date());
  const dailyGoalSecs = dailyStudyGoalSeconds(todayObjectives, todayDate);
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
  const [guestGate, setGuestGate] = useState(null);
  const [checklistCounts, setChecklistCounts] = useState({}); // courseId -> { done, total }
  const [checklistCourse, setChecklistCourse] = useState(null);
  const [recentSessions, setRecentSessions] = useState([]); // 90 jours — records & semaine
  const [freezeInfo, setFreezeInfo] = useState(null); // joker { supported, frozenDays, stock }
  const [freezeOfferOpen, setFreezeOfferOpen] = useState(false);
  const [freezeBusy, setFreezeBusy] = useState(false);

  const isGuest = !user;
  const dashboardCachePrefix = user ? `dashboard:${user.id}:` : "";
  // Espace dont la page doit montrer les données : le compte, ou la démo
  // invité. Aucun tant que l'auth n'a pas répondu — le chrono n'a pas encore
  // restauré sa session non plus (TimerContext attend la même réponse).
  const dataOwner = authLoading ? null : user?.id || GUEST_USER_ID;

  const applyDashboardData = useCallback((data, owner) => {
    const c = data.courses || [];
    const active = c.filter((course) => !course.archived_at);
    setCourses(c);
    setCoursesOwner(owner);
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
  // Seulement face à la liste de l'espace qui possède le chrono : juste après
  // une connexion, `courses` est encore celle d'avant (démo invité), où le
  // cours d'une session en cours manque forcément. Le remplacer là faisait
  // enregistrer la session sous le plus ancien cours du compte.
  useEffect(() => {
    if (!dataOwner || coursesOwner !== dataOwner || !activeCourses.length) return;
    if (!activeCourses.some((course) => course.id === courseId)) setCourseId(activeCourses[0].id);
  }, [activeCourses, coursesOwner, dataOwner, courseId, setCourseId]);

  // À l'ouverture de l'app, le chrono propose le dernier cours étudié — pas
  // le plus ancien du compte, ni un cours choisi puis jamais travaillé. Les
  // données en cache arrivent d'abord, les fraîches ensuite : on suit donc la
  // dernière session connue jusqu'à ce que l'étudiant choisisse lui-même un
  // cours (revenir ensuite sur le Chrono ne l'écrase pas). Jamais pendant une
  // session commencée.
  useEffect(() => {
    if (!dataOwner || coursesOwner !== dataOwner || !timerHydrated || !activeCourses.length) return;
    if (coursePickedBy === dataOwner || running || elapsed > 0) return;
    const active = new Set(activeCourses.map((course) => course.id));
    let latest = null;
    for (const session of [...sessions, ...recentSessions]) {
      if (!session?.course_id || !active.has(session.course_id) || !session.started_at) continue;
      if (!latest || Date.parse(session.started_at) > Date.parse(latest.started_at)) latest = session;
    }
    if (latest && latest.course_id !== courseId) setCourseId(latest.course_id);
  }, [dataOwner, coursesOwner, timerHydrated, activeCourses, sessions, recentSessions, running, elapsed, courseId, setCourseId]);

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
      applyDashboardData(readGuestDashboardData(lang), GUEST_USER_ID);
      return;
    }
    const cacheKey = `${dashboardCachePrefix}${localISO(new Date())}`;
    const cached = getClientCache(cacheKey);
    if (cached) applyDashboardData(cached, user.id);

    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

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
        .select("started_at, duration_seconds, course_id")
        .eq("user_id", user.id)
        .gte("started_at", ninetyDaysAgo.toISOString()),
      // Re-read the plan even with cached study history: edits in Planning
      // must update the daily goal immediately when returning to Timer.
      fetchDailyObjectives(supabase, user.id, todayDate),
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
      objectives: objectivesRes.error ? cached?.objectives || [] : objectivesRes.data || [],
      days,
    };
    setClientCache(cacheKey, data, 45000);
    applyDashboardData(data, user.id);
  }, [applyDashboardData, dashboardCachePrefix, lang, user, todayDate]);

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

  // Rien avant la réponse de l'auth : sans compte encore connu, `load`
  // prendrait la démo invité (et l'écrirait dans le stockage) pour un compte
  // simplement pas encore restauré. Le squelette reste affiché jusque-là.
  useEffect(() => {
    if (authLoading) return;
    load().finally(() => setReady(true));
  }, [authLoading, load]);

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

  // Bloc de travail d'un Pomodoro terminé : components/timer/useChrono.js le
  // détecte, remet le chrono à zéro et lance la pause ; la page l'enregistre.
  // 1) Snapshot LOCAL (queue) AVANT toute tentative Supabase → zéro perte si
  //    l'auto-stop pomodoro tombe pendant un creux réseau. Le bloc porte l'id
  //    de la session du chrono : vu dans deux onglets, il n'est compté qu'une
  //    fois (doublon reconnu par la base, ou par id dans l'espace invité, relu
  //    au moment d'écrire).
  function savePomodoroWork(payload) {
    setPendingCredits((prev) => [...prev, { id: payload.id, session: payload }]);

    if (isGuest) {
      setSessions(appendGuestSession(payload, lang));
    } else {
      enqueueSession(payload);
      // 2) Tentative d'envoi : la queue se vide d'elle-même via flushPending
      //    (idempotent, dédupe via PK sur 23505).
      flushPending(supabase, user.id).then((res) => {
        const capped = res.results.find((r) => r.status === "rejected");
        if (capped) {
          setPendingCredits((prev) => prev.filter((c) => c.id !== capped.item.id));
          toast(dailyCapMessage(t, lang, capped.date), "error");
        }
        if (res.synced + res.alreadyExists > 0) {
          clearDashboardCache();
          notifyXPChanged();
          load();
        }
      });
    }
  }

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
    //    L'id est celui de la session du chrono (TimerContext) : terminée ici
    //    pendant qu'un autre onglet la termine aussi (ou la clôt en fin de
    //    Pomodoro), elle n'est comptée qu'une fois. Sans id (chrono restauré
    //    d'avant ce champ), un id neuf comme auparavant.
    const payload = {
      id: sessionId || newClientId(),
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
      setSessions(appendGuestSession(payload, lang));
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

    // Plafond de 16 h dépassé sur une date (v78) : refus définitif. On le dit,
    // date à l'appui, au lieu de la laisser en file « hors ligne » pour toujours.
    if (isDailyCapError(error)) {
      removeFromQueue(payload.id);
      setPendingCredits((prev) => prev.filter((c) => c.id !== payload.id));
      setSaveStatus("idle");
      toast(dailyCapMessage(t, lang, error.details), "error");
      return;
    }

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
    const newGoalPct = Math.min(100, Math.round(((totalToday + todayPart) / dailyGoalSecs) * 100));
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
        if (!id) setNewCourseId(savedCourse.id);
        if (!id) { coursePickedBy = dataOwner; setCourseId(savedCourse.id); }
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
      if (!id) setNewCourseId(data.id);
      if (!id) { coursePickedBy = dataOwner; setCourseId(data.id); }
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


  // ── Moments — le bon message au bon moment ────────────────────
  // Détectés au franchissement d'un seuil (une seule fois par session),
  // affichés 8 s en priorité sur la rotation ambiante, en vert accent.
  const [moment, setMoment] = useState(null);
  const momentsFired = useRef(new Set());
  const momentTimer = useRef(null);
  const sessionActiveRef = useRef(false);
  const timerMomentAnchor = useRef(null);

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
    if (totalToday < dailyGoalSecs && totalToday + elapsed >= dailyGoalSecs) fire("daily", t("dash.momentDaily"));
    if (longestSessionSecs > 0 && elapsed > longestSessionSecs) fire("longest", t("dash.momentLongest"));
    if (bestDaySecs > 0 && totalToday < bestDaySecs && totalToday + elapsed > bestDaySecs) fire("bestDay", t("dash.momentBestDay"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [elapsed, running, pomodoro, pomoPhase, dailyGoalSecs]);

  // Un crédit disparaît dès que la base connaît sa session : le total ne
  // bouge pas, il change juste de source.
  useEffect(() => {
    const known = new Set([...sessions.map((s) => s.id), ...serverDays.map((row) => row.session_id)]);
    setPendingCredits((prev) => {
      const kept = prev.filter((c) => !known.has(c.id));
      return kept.length === prev.length ? prev : kept;
    });
  }, [sessions, serverDays]);

  // En découverte la mascotte est réservée aux gates contextuels. Les petits
  // jalons du chrono restent textuels et le récap XP n'existe pas : le visiteur
  // teste le cœur sans simuler une progression de compte.
  const timerMoment = !isGuest && moment ? { key: `timer-${moment.id}`, message: moment.text } : null;
  // La phrase du chrono (pause longue, invitation à démarrer : useChrono)
  // s'efface quand un jalon de la mascotte parle à sa place.
  const timerHint = timerMoment ? null : hint;
  const selectedCourseExam = courseId ? nextCourseExam(courseId) : null;
  const selectedExamDays = selectedCourseExam ? daysUntilExam(selectedCourseExam.exam_date) : null;

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
        <ChronoCard
          chrono={chrono}
          className="order-1 lg:order-1"
          courses={courses}
          activeCourses={activeCourses}
          onPickCourse={(id) => { coursePickedBy = dataOwner; setCourseId(id); }}
          onAddCourse={() => isGuest ? setGuestGate("course") : openCourseEditor()}
          courseExam={selectedCourseExam}
          examDays={selectedExamDays}
          onOpenFocus={() => setFocusMode(true)}
          onStart={() => { chrono.startWithFeedback(); setFocusMode(true); }}
          onFinish={stopAndSave}
          saveStatus={saveStatus}
          noteEnabled={!isGuest}
          hint={timerHint}
          momentShown={Boolean(timerMoment)}
          blocksAnchorRef={timerMomentAnchor}
          /* Le Défi du jour, SOUS le cours et avant le bouton Démarrer. Il
             était au-dessus du sélecteur : une mission passait donc avant la
             première question de la page, « qu'est-ce que j'étudie ». Il
             s'efface aussi dès qu'une session existe — pendant une pause, il
             venait commenter par-dessus un chrono arrêté. Sa place dans la
             liste des objectifs du jour, elle, ne bouge pas.
             Le tap n'est proposé QUE si le cours du défi existe encore dans la
             liste : un bouton qui ne sélectionne rien, ou qui sélectionne un
             cours supprimé pour se faire corriger à la frame suivante, vaut
             moins qu'une simple ligne de texte. */
          challenge={challenge && !isGuest && !running && elapsed === 0 && (
            <div className="relative z-20 mt-3 px-4 sm:px-6">
              <ChallengeStrip
                challenge={challenge}
                onPickCourse={activeCourses.some(c => c.id === challenge?.params?.course_id) ? (id) => { coursePickedBy = dataOwner; setCourseId(id); } : undefined}
              />
            </div>
          )}
          coach={timerMoment && !focusMode && <MascotMoment
            message={timerMoment.message}
            mood="proud"
            presentation="anchored"
            anchorKind="studyBlocks"
            anchorRef={timerMomentAnchor}
            frequency="always"
            eventKey={timerMoment.key}
            onDismiss={() => setMoment(null)}
            streak={streak}
            live />}
        />

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
              <span className="font-num text-xs font-bold tabular-nums" style={{ color: "var(--bt-text-2)" }}>
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
            goalSecs={dailyGoalSecs}
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
            newCourseId={newCourseId}
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
        <ChronoFocus
          chrono={chrono}
          courses={courses}
          onClose={() => setFocusMode(false)}
          onFinish={stopAndSave}
          saveStatus={saveStatus}
          hint={timerHint}
          momentShown={Boolean(timerMoment)}
          renderCoach={({ anchorRef, frameRef }) => timerMoment && <MascotMoment
            message={timerMoment.message}
            mood="proud"
            presentation="anchored"
            anchorKind="focusBlocks"
            anchorRef={anchorRef}
            frameRef={frameRef}
            frequency="always"
            eventKey={timerMoment.key}
            onDismiss={() => setMoment(null)}
            streak={streak}
            live />}
        />
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
