import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTimer } from "../../contexts/TimerContext";
import { useI18n } from "../../contexts/I18nContext";
import { formatDuration, formatMinutesShort } from "../../lib/format";
import { newClientId } from "../../lib/clientId.mjs";
import { pomodoroCycleInProgress } from "../../lib/pomodoro.mjs";
import { readSessionGoal, writeSessionGoal } from "../../lib/sessionGoal";
import { studyBlockLayout } from "../../lib/studyBlocks.mjs";
import { playSensoryCue, triggerHaptic } from "../../lib/sensoryFeedback";
import { useWakeLock } from "../../lib/useWakeLock";

// Le comportement du Chrono, partagé par les pages qui l'affichent : démarrage
// et pause avec leur retour sensoriel, écran gardé allumé, objectif de session
// (Libre), cycle Pomodoro, suivi de la pause, et ce que disent les Blocus
// Blocks. Sorti tel quel de pages/dashboard.js (2026-10-07).
//
// Ce qui n'est PAS ici : où et comment une session terminée s'enregistre. La
// page le dit avec `onWorkComplete(payload)` — le Dashboard enregistre un bloc
// de travail Pomodoro dans l'espace invité local, ou dans la file hors ligne
// puis Supabase pour un compte. Rien de Supabase, des missions, de la série,
// de la mascotte ou des widgets du Dashboard ne passe par ce module.
//
// Options :
//   ownerId        — `user_id` des sessions (compte, ou l'id local invité)
//   enabled        — la page est prête à enregistrer (ses données sont là) :
//                    tant que ce n'est pas le cas, le cycle Pomodoro attend
//   defaultMode    — "free" | "pomodoro" : mode à l'ouverture de la page quand
//                    aucun cycle Pomodoro n'est en cours (le Dashboard : Libre)
//   onWorkComplete — enregistre le bloc de travail d'un Pomodoro terminé
export function useChrono({ ownerId, enabled = true, defaultMode = "free", onWorkComplete }) {
  const { t } = useI18n();
  const timer = useTimer();
  const {
    courseId,
    note,
    running,
    elapsed,
    timezone: timerTimezone,
    sessionId,
    start,
    pause,
    reset,
    hydrated,
    pomodoro,
    setPomodoro,
    pomoPhase,
    setPomoPhase,
    pomoCount,
    setPomoCount,
    pomoWorkMin,
    setPomoWorkMin,
    pomoBreakMin,
  } = timer;

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

  // Garde l'écran allumé tant qu'une session tourne (inline ou mode focus) :
  // sans ça l'iPhone se verrouille après ~30 s et la respiration du mode focus
  // s'éteint. Relâché automatiquement en pause / à l'arrêt. Voir lib/useWakeLock.
  useWakeLock(running);

  // Objectif de session — l'intention posée avant de démarrer. Persisté
  // (localStorage) pour que l'habitude survive aux rechargements.
  const [sessionGoalMin, setSessionGoalMin] = useState(null);

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

  const pomoHandled = useRef(false);
  const POMO_WORK  = pomoWorkMin  * 60;
  const POMO_BREAK = pomoBreakMin * 60;

  // À l'ouverture de la page, sans Pomodoro en cours (lib/pomodoro.mjs), le
  // Chrono prend le mode de la page avec un cycle neuf : le Dashboard s'ouvre
  // en Libre, comme quand ce mode ne survivait pas à la page (le Planning, les
  // Communautés et Messages y envoient en comptant dessus). Un Pomodoro en
  // cours — travail ou pause, qui compte ou mis en pause — garde son mode, sa
  // phase et son cycle. Une fois par page, après restauration du chrono.
  const modeChecked = useRef(false);
  useEffect(() => {
    if (!hydrated || modeChecked.current) return;
    modeChecked.current = true;
    if (pomodoroCycleInProgress({ pomodoro, running, elapsed })) return;
    setPomodoro(defaultMode === "pomodoro");
    setPomoPhase("work");
    setPomoCount(0);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated]);

  // Anti-effacement accidentel : demande confirmation si une session > 60s est
  // en cours / en pause au moment d'un changement de mode (libre ↔ pomodoro).
  function confirmDiscardIfWorking() {
    if (elapsed > 60 && typeof window !== "undefined") {
      return window.confirm(t("dash.discardConfirm"));
    }
    return true;
  }

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

  // Durée de travail choisie : le cycle se réarme sur la nouvelle durée.
  function pickWorkMin(min) {
    setPomoWorkMin(min); pomoHandled.current = false;
  }

  // « Passer la pause » : retour au travail, chrono à zéro.
  function skipBreak() {
    pause(); reset(); setPomoPhase("work"); pomoHandled.current = false;
  }

  // « Terminer » quitte le cycle : la session est enregistrée par la page, le
  // Chrono revient au mode Libre.
  function leavePomodoro() {
    setPomodoro(false); setPomoPhase("work"); setPomoCount(0);
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

  // ── Pomodoro auto-transition ────────────────────────────────
  // Le bloc de travail terminé porte l'id de la session (TimerContext) : vu
  // dans deux onglets, il n'est enregistré qu'une fois. Sans id (chrono
  // restauré d'avant ce champ), un id neuf comme auparavant.
  useEffect(() => {
    if (!enabled || !pomodoro || !running || pomoHandled.current) return;
    const target = pomoPhase === "work" ? POMO_WORK : POMO_BREAK;
    if (elapsed < target) { pomoHandled.current = false; return; }
    pomoHandled.current = true;

    if (pomoPhase === "work") {
      playSensoryCue("pomodoro");
      triggerHaptic("goal");
      const secs = Math.min(elapsed, POMO_WORK);
      const endedAt = new Date().toISOString();
      const startedAt = new Date(Date.now() - secs * 1000).toISOString();

      const payload = {
        id: sessionId || newClientId(),
        user_id: ownerId,
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
      onWorkComplete?.(payload);

      setPomoPhase("break");
      setPomoCount(c => c + 1);
      setTimeout(() => { start(); pomoHandled.current = false; }, 80);
    } else {
      pause();
      reset();
      setPomoPhase("work");
      playSensoryCue("breakEnd");
      pomoHandled.current = false;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [elapsed, pomodoro, running, pomoPhase, enabled]);

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

  // Ce que la mascotte ne dit plus, l'écran le dit en texte : l'état de pause
  // et l'invitation à démarrer, qui n'ont jamais été des exploits.
  // Le libellé « En pause · mm:ss » dit déjà l'état et sa durée : la phrase de
  // coach n'apparaît que lorsqu'elle AJOUTE quelque chose, après dix minutes.
  // (Une page qui affiche un jalon de la mascotte retire cette phrase.)
  const hint = isPaused
    ? (pauseSeconds >= 10 * 60 ? t("coach.timer.longPause") : null)
    : (!running && elapsed === 0)
      ? t(pomodoro && pomoPhase === "work" && pomoCount > 0 ? "dash.breakEnded" : "coach.timer.ready")
      : null;

  // Ce jalon reste indépendant des Blocus Blocks de 15 min : un retour bref
  // accompagne chaque tranche de 25 min réellement franchie.
  const hapticBlockRef = useRef(null);
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

  return {
    ...timer,
    startWithFeedback,
    pauseWithFeedback,
    sessionGoalMin,
    sessionGoalSecs,
    sessionGoalChoices,
    pickSessionGoal,
    pickMode,
    pickWorkMin,
    skipBreak,
    leavePomodoro,
    pomoTargetSecs,
    onBreak,
    isPaused,
    pauseSince,
    pauseSeconds,
    blockGoalSecs,
    liveStudySecs,
    focusTidePct,
    blockUnitSecs,
    blocksAside,
    blocksAria,
    liveMessage,
    hint,
  };
}
