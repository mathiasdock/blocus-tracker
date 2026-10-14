import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabaseClient";

const PAGE_SIZE = 25;

// Only a successful read replaces the known history. Requests belong to one
// account/filter generation; a late response must not commit into another.
export function useSessionHistory(userId, filterCourse) {
  const key = JSON.stringify([userId, filterCourse]);
  const currentKeyRef = useRef(key);
  currentKeyRef.current = key;
  const mountedRef = useRef(false);
  const generationRef = useRef(0);
  const pendingRef = useRef(null);
  const [result, setResult] = useState({ ownerId: null, filterCourse: null, sessions: [], hasMore: false });
  const [request, setRequest] = useState({ key: null, loading: false, error: null });

  const fetchPage = useCallback(async (offset, reset) => {
    if (!userId || !mountedRef.current || currentKeyRef.current !== key || pendingRef.current?.key === key) return false;
    const generation = ++generationRef.current;
    pendingRef.current = { key, generation };
    const isCurrent = () => mountedRef.current && currentKeyRef.current === key && generationRef.current === generation;
    setRequest({ key, loading: true, error: null });

    try {
      let query = supabase.from("sessions").select("*").eq("user_id", userId)
        .order("started_at", { ascending: false })
        .order("id", { ascending: false })
        .range(offset, offset + PAGE_SIZE - 1);
      if (filterCourse) query = query.eq("course_id", filterCourse);
      const { data, error } = await query;
      if (error || !Array.isArray(data)) throw error || new Error("Session history response is not a list");
      if (!isCurrent()) return false;
      setResult(previous => ({
        ownerId: userId, filterCourse,
        sessions: reset ? data : [...previous.sessions, ...data],
        hasMore: data.length === PAGE_SIZE,
      }));
      setRequest({ key, loading: false, error: null });
      return true;
    } catch {
      if (isCurrent()) setRequest({ key, loading: false, error: { reset } });
      return false;
    } finally {
      if (pendingRef.current?.generation === generation) pendingRef.current = null;
    }
  }, [userId, filterCourse, key]);

  useEffect(() => {
    mountedRef.current = true;
    fetchPage(0, true);
    return () => {
      mountedRef.current = false;
      generationRef.current += 1;
      pendingRef.current = null;
    };
  }, [fetchPage]);

  const owned = Boolean(userId) && result.ownerId === userId;
  const sessions = owned ? result.sessions : [];
  const matchesFilter = owned && result.filterCourse === filterCourse;
  const loading = request.key === key ? request.loading : Boolean(userId);
  const error = request.key === key ? request.error : null;

  // Keep the page's existing edit/delete handlers scoped to their account.
  const setSessions = useCallback(update => {
    setResult(previous => previous.ownerId === userId
      ? { ...previous, sessions: update(previous.sessions) }
      : previous);
  }, [userId]);

  return {
    sessions, setSessions, loading, error,
    hasMore: matchesFilter && result.hasMore,
    empty: matchesFilter && sessions.length === 0 && !loading && !error,
    previousFilter: owned && !matchesFilter && sessions.length > 0,
    loadMore: () => {
      if (matchesFilter && result.hasMore && !loading && !error) return fetchPage(sessions.length, false);
    },
    retry: () => {
      if (error) return fetchPage(error.reset ? 0 : sessions.length, error.reset);
    },
  };
}
