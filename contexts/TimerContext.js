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

const TimerContext = createContext(null);
const KEY = "bt_timer_v1";
const MAX_SESSION_SECONDS = 12 * 60 * 60;

export function TimerProvider({ children }) {
  const { user } = useAuth();
  const [courseId, setCourseId] = useState("");
  const [note, setNote] = useState("");
  const [running, setRunning] = useState(false);
  const [startMs, setStartMs] = useState(0);
  const [baseSeconds, setBaseSeconds] = useState(0);
  const [, forceRender] = useReducer((x) => x + 1, 0);
  // `hydrated` est un STATE (pas une ref) : il est appliqué dans le même
  // batch que les valeurs restaurées. Avec une ref, le double-effect de
  // React StrictMode (dev) réécrivait le storage avec les états par défaut
  // AVANT la relecture du restore → le chrono ne survivait pas au reload.
  const [hydrated, setHydrated] = useState(false);

  // Restore from localStorage on first mount.
  //
  // ⚠️ Sanity cap : si le timer était "running" mais que l'appareil a dormi /
  // l'app a été fermée pendant > 12h, on ne compte PAS ce gap (sinon la session
  // est artificiellement gonflée à plusieurs heures). On fige le timer en pause
  // sur la dernière valeur connue ; l'utilisateur peut reprendre ou stopper.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const s = JSON.parse(raw);
        setCourseId(s.courseId || "");
        setNote(s.note || "");
        let nextRunning = !!s.running;
        let nextStartMs = s.startMs || 0;
        const nextBase = Math.min(s.baseSeconds || 0, MAX_SESSION_SECONDS);
        const MAX_GAP_MS = 12 * 60 * 60 * 1000; // 12h
        if (nextRunning && nextStartMs && Date.now() - nextStartMs > MAX_GAP_MS) {
          nextRunning = false;
          nextStartMs = 0;
          // baseSeconds inchangé : on n'inclut PAS le gap suspect.
        }
        setRunning(nextRunning);
        setStartMs(nextStartMs);
        setBaseSeconds(nextBase);
      }
    } catch {}
    setHydrated(true);
    forceRender();
  }, []);

  // Persist any change — jamais avant l'hydration (sinon on écrase le
  // storage avec les états par défaut).
  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(
        KEY,
        JSON.stringify({ courseId, note, running, startMs, baseSeconds })
      );
    } catch {}
  }, [hydrated, courseId, note, running, startMs, baseSeconds]);

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
    if (!user) return;
    supabase
      .from("profiles")
      .update({ studying_since: running ? new Date().toISOString() : null })
      .eq("id", user.id)
      .then();
  }, [running, user]);

  // Heartbeat: keep studying_since fresh every 5 min while running
  useEffect(() => {
    if (!running || !user) return;
    const id = setInterval(() => {
      supabase
        .from("profiles")
        .update({ studying_since: new Date().toISOString() })
        .eq("id", user.id)
        .then();
    }, 5 * 60 * 1000);
    return () => clearInterval(id);
  }, [running, user]);

  const elapsed = Math.min(MAX_SESSION_SECONDS, Math.floor(
    baseSeconds + (running && startMs ? (Date.now() - startMs) / 1000 : 0)
  ));

  const start = useCallback(() => {
    setStartMs(Date.now());
    setRunning(true);
  }, []);

  const pause = useCallback(() => {
    setBaseSeconds((b) => b + (startMs ? (Date.now() - startMs) / 1000 : 0));
    setStartMs(0);
    setRunning(false);
  }, [startMs]);

  const reset = useCallback(() => {
    setRunning(false);
    setStartMs(0);
    setBaseSeconds(0);
    setNote("");
  }, []);

  return (
    <TimerContext.Provider
      value={{ courseId, setCourseId, note, setNote, running, elapsed, start, pause, reset }}
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
