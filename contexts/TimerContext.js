import {
  createContext,
  useContext,
  useEffect,
  useReducer,
  useRef,
  useState,
  useCallback,
} from "react";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "./AuthContext";
import { deviceTimezone, isValidSessionTimezone } from "../lib/sessionDayParts.mjs";

const TimerContext = createContext(null);
const LEGACY_KEY = "bt_timer_v1";
const KEY_PREFIX = "bt_timer_v2";
const GUEST_OWNER = "guest";
const MAX_SESSION_SECONDS = 12 * 60 * 60;

function timerStorageKey(owner) {
  return `${KEY_PREFIX}:${owner}`;
}

function emptyTimerSnapshot() {
  return { courseId: "", note: "", running: false, startMs: 0, baseSeconds: 0, timezone: "" };
}

export function TimerProvider({ children }) {
  const { user, loading } = useAuth();
  const timerOwner = user?.id || GUEST_OWNER;
  const [courseId, setCourseId] = useState("");
  const [note, setNote] = useState("");
  const [running, setRunning] = useState(false);
  const [startMs, setStartMs] = useState(0);
  const [baseSeconds, setBaseSeconds] = useState(0);
  // Fuseau IANA de l'appareil au PREMIER démarrage de la session : il la suit à
  // travers pauses, rechargements et file hors ligne, et c'est lui qui fixe ses
  // jours locaux (session_day_parts, v65) — pas le fuseau du moment de l'envoi.
  const [timezone, setTimezone] = useState("");
  const [, forceRender] = useReducer((x) => x + 1, 0);
  // `hydratedOwner` est un STATE (pas une ref) : il est appliqué dans le même
  // batch que les valeurs restaurées. Avec une ref, le double-effect de
  // React StrictMode (dev) réécrivait le storage avec les états par défaut
  // AVANT la relecture du restore → le chrono ne survivait pas au reload.
  const [hydratedOwner, setHydratedOwner] = useState(null);
  const hydrated = hydratedOwner === timerOwner;
  const activeOwnerRef = useRef(null);

  // Restore from localStorage once Auth knows which space owns the timer, then
  // again whenever that owner changes. Guest and account snapshots must never
  // share a key: a discovery session cannot become a production session after
  // sign-in, and two accounts on one device cannot inherit each other's timer.
  //
  // ⚠️ Sanity cap : si le timer était "running" mais que l'appareil a dormi /
  // l'app a été fermée pendant > 12h, on ne compte PAS ce gap (sinon la session
  // est artificiellement gonflée à plusieurs heures). On fige le timer en pause
  // sur la dernière valeur connue ; l'utilisateur peut reprendre ou stopper.
  useEffect(() => {
    if (loading) return;
    let snapshot = emptyTimerSnapshot();
    try {
      const key = timerStorageKey(timerOwner);
      let raw = localStorage.getItem(key);

      // One-time migration for timers created before ownership was recorded.
      // A legacy guest course is recognisable; any other legacy timer belongs
      // only to the account already authenticated at migration time.
      if (!raw) {
        const legacyRaw = localStorage.getItem(LEGACY_KEY);
        if (legacyRaw) {
          const legacy = JSON.parse(legacyRaw);
          const legacyOwner = String(legacy.courseId || "").startsWith("guest-course-")
            ? GUEST_OWNER
            : user?.id || null;
          if (legacyOwner === timerOwner) {
            raw = legacyRaw;
            localStorage.setItem(key, legacyRaw);
          }
          localStorage.removeItem(LEGACY_KEY);
        }
      }

      if (raw) {
        const s = JSON.parse(raw);
        snapshot.courseId = s.courseId || "";
        snapshot.note = s.note || "";
        let nextRunning = !!s.running;
        let nextStartMs = s.startMs || 0;
        const nextBase = Math.min(s.baseSeconds || 0, MAX_SESSION_SECONDS);
        const MAX_GAP_MS = 12 * 60 * 60 * 1000; // 12h
        if (nextRunning && nextStartMs && Date.now() - nextStartMs > MAX_GAP_MS) {
          nextRunning = false;
          nextStartMs = 0;
          // baseSeconds inchangé : on n'inclut PAS le gap suspect.
        }
        snapshot.running = nextRunning;
        snapshot.startMs = nextStartMs;
        snapshot.baseSeconds = nextBase;
        snapshot.timezone = isValidSessionTimezone(s.timezone) ? s.timezone : "";
      }
    } catch {}

    // A guest timer is deliberately temporary. Once an account takes over,
    // discard it instead of letting it resume after a later sign-out.
    if (activeOwnerRef.current === GUEST_OWNER && timerOwner !== GUEST_OWNER) {
      try { localStorage.removeItem(timerStorageKey(GUEST_OWNER)); } catch {}
    }

    activeOwnerRef.current = timerOwner;
    setCourseId(snapshot.courseId);
    setNote(snapshot.note);
    setRunning(snapshot.running);
    setStartMs(snapshot.startMs);
    setBaseSeconds(snapshot.baseSeconds);
    setTimezone(snapshot.timezone);
    setHydratedOwner(timerOwner);
    forceRender();
  }, [loading, timerOwner, user?.id]);

  // Persist any change — jamais avant l'hydration (sinon on écrase le
  // storage avec les états par défaut).
  useEffect(() => {
    if (!hydrated || activeOwnerRef.current !== timerOwner) return;
    try {
      localStorage.setItem(
        timerStorageKey(timerOwner),
        JSON.stringify({ courseId, note, running, startMs, baseSeconds, timezone })
      );
    } catch {}
  }, [hydrated, timerOwner, courseId, note, running, startMs, baseSeconds, timezone]);

  // Re-render every 500ms while running and pause at the same 12-hour cap
  // enforced by the database. This also prevents a sleeping device from
  // silently producing a 20-hour session while the page stays mounted.
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => {
      const current = baseSeconds + (startMs ? (Date.now() - startMs) / 1000 : 0);
      if (current >= MAX_SESSION_SECONDS) {
        setBaseSeconds(MAX_SESSION_SECONDS);
        setStartMs(0);
        setRunning(false);
        return;
      }
      forceRender();
    }, 500);
    return () => clearInterval(id);
  }, [running, baseSeconds, startMs]);

  // ── Live presence: update studying_since on start/stop ──────
  useEffect(() => {
    if (!user || !hydrated || activeOwnerRef.current !== timerOwner) return;
    supabase
      .from("profiles")
      .update({ studying_since: running ? new Date().toISOString() : null })
      .eq("id", user.id)
      .then();
  }, [hydrated, running, timerOwner, user]);

  // Heartbeat: keep studying_since fresh every 5 min while running
  useEffect(() => {
    if (!running || !user || !hydrated || activeOwnerRef.current !== timerOwner) return;
    const id = setInterval(() => {
      supabase
        .from("profiles")
        .update({ studying_since: new Date().toISOString() })
        .eq("id", user.id)
        .then();
    }, 5 * 60 * 1000);
    return () => clearInterval(id);
  }, [hydrated, running, timerOwner, user]);

  // Les navigateurs (surtout mobile/PWA) gèlent les intervals en arrière-plan :
  // le heartbeat prend du retard et la présence expire (fenêtre 10 min, cf.
  // lib/presence.js) alors que le chrono tourne toujours. On rafraîchit
  // studying_since dès le retour au premier plan pour "ressusciter" la présence.
  useEffect(() => {
    if (!running || !user || !hydrated || activeOwnerRef.current !== timerOwner) return;
    function onVisible() {
      if (document.visibilityState !== "visible") return;
      supabase
        .from("profiles")
        .update({ studying_since: new Date().toISOString() })
        .eq("id", user.id)
        .then();
    }
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [hydrated, running, timerOwner, user]);

  const elapsed = Math.min(MAX_SESSION_SECONDS, Math.floor(
    baseSeconds + (running && startMs ? (Date.now() - startMs) / 1000 : 0)
  ));

  const start = useCallback(() => {
    // Premier démarrage d'une session (rien d'accumulé) : on fige le fuseau.
    if (!baseSeconds && !startMs) setTimezone(deviceTimezone() || "");
    setStartMs(Date.now());
    setRunning(true);
  }, [baseSeconds, startMs]);

  const pause = useCallback(() => {
    setBaseSeconds((b) => b + (startMs ? (Date.now() - startMs) / 1000 : 0));
    setStartMs(0);
    setRunning(false);
  }, [startMs]);

  const reset = useCallback(() => {
    setRunning(false);
    setStartMs(0);
    setBaseSeconds(0);
    setTimezone("");
    setNote("");
  }, []);

  return (
    <TimerContext.Provider
      value={{ courseId, setCourseId, note, setNote, running, elapsed, timezone, start, pause, reset }}
    >
      {children}
    </TimerContext.Provider>
  );
}

export function useTimer() {
  const ctx = useContext(TimerContext);
  if (!ctx) throw new Error("useTimer must be used within TimerProvider");
  return ctx;
}
