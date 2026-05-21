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

export function TimerProvider({ children }) {
  const { user } = useAuth();
  const [courseId, setCourseId] = useState("");
  const [note, setNote] = useState("");
  const [running, setRunning] = useState(false);
  const [startMs, setStartMs] = useState(0);
  const [baseSeconds, setBaseSeconds] = useState(0);
  const [, forceRender] = useReducer((x) => x + 1, 0);
  const hydrated = useRef(false);

  // Restore from localStorage on first mount
  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const s = JSON.parse(raw);
        setCourseId(s.courseId || "");
        setNote(s.note || "");
        setRunning(!!s.running);
        setStartMs(s.startMs || 0);
        setBaseSeconds(s.baseSeconds || 0);
      }
    } catch {}
    hydrated.current = true;
    forceRender();
  }, []);

  // Persist any change
  useEffect(() => {
    if (!hydrated.current) return;
    try {
      localStorage.setItem(
        KEY,
        JSON.stringify({ courseId, note, running, startMs, baseSeconds })
      );
    } catch {}
  }, [courseId, note, running, startMs, baseSeconds]);

  // Re-render every 500ms while running
  useEffect(() => {
    if (!running) return;
    const id = setInterval(forceRender, 500);
    return () => clearInterval(id);
  }, [running]);

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

  const elapsed = Math.floor(
    baseSeconds + (running && startMs ? (Date.now() - startMs) / 1000 : 0)
  );

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
