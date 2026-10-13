import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import { supabase } from "../lib/supabaseClient";
import { DEFAULT_FOCUS_PREFERENCES, equipFocusEnvironment, loadFocusPreferences } from "../lib/focusPreferences.mjs";

const CHANGED_EVENT = "bt:focus-environment-changed";
const initialState = (ownerId = null) => ({ ownerId, ...DEFAULT_FOCUS_PREFERENCES, loading: false, saving: false, error: null });

export function useFocusEnvironment() {
  const { user } = useAuth();
  const userId = user?.id || null;
  const [state, setState] = useState(() => initialState());
  const ownerRef = useRef(userId);
  ownerRef.current = userId;
  const mountedRef = useRef(false);
  const generationRef = useRef(0);
  const pendingReadRef = useRef(null);
  const pendingSaveRef = useRef(null);
  const retryIdRef = useRef(null);

  const refresh = useCallback(({ force = false, supersede = false } = {}) => {
    if (!userId || ownerRef.current !== userId || !mountedRef.current) return Promise.resolve(false);
    if (pendingSaveRef.current) return pendingSaveRef.current.promise;
    if (!force && !supersede && pendingReadRef.current?.userId === userId) return pendingReadRef.current.promise;
    const generation = ++generationRef.current;
    retryIdRef.current = null;
    setState(previous => ({ ...(previous.ownerId === userId ? previous : initialState(userId)), loading: true, error: null }));
    const promise = loadFocusPreferences(supabase, userId, { force }).then(result => {
      if (!mountedRef.current || ownerRef.current !== userId || generationRef.current !== generation) return false;
      setState(previous => ({
        ...(previous.ownerId === userId ? previous : initialState(userId)),
        ...(result.ok || result.error === "focus_unavailable" ? { environmentId: result.environmentId, highestLevel: result.highestLevel } : {}),
        ownerId: userId, loading: false, error: result.error,
      }));
      return result.ok;
    }).finally(() => {
      if (pendingReadRef.current?.promise === promise) pendingReadRef.current = null;
    });
    pendingReadRef.current = { userId, promise };
    return promise;
  }, [userId]);

  const equip = useCallback(id => {
    if (!userId || ownerRef.current !== userId || !mountedRef.current || pendingSaveRef.current) return Promise.resolve(false);
    const generation = ++generationRef.current;
    retryIdRef.current = id;
    setState(previous => ({ ...(previous.ownerId === userId ? previous : initialState(userId)), loading: false, saving: true, error: null }));
    const promise = equipFocusEnvironment(supabase, id, userId).then(result => {
      if (!mountedRef.current || ownerRef.current !== userId || generationRef.current !== generation) return false;
      if (result.ok) {
        retryIdRef.current = null;
        // Other mounted consumers fetch a fresh server answer; the event does
        // not carry any local eligibility claim.
      }
      setState(previous => ({
        ...(previous.ownerId === userId ? previous : initialState(userId)),
        ...(result.ok || result.error === "focus_unavailable" ? { environmentId: result.environmentId, highestLevel: result.highestLevel } : {}),
        ownerId: userId, saving: false, error: result.error,
      }));
      if (result.ok && typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent(CHANGED_EVENT, { detail: { userId } }));
      }
      return result.ok;
    }).finally(() => {
      if (pendingSaveRef.current?.promise === promise) pendingSaveRef.current = null;
    });
    pendingSaveRef.current = { userId, promise };
    return promise;
  }, [userId]);

  const retry = useCallback(() => retryIdRef.current
    ? equip(retryIdRef.current) : refresh({ force: true }), [equip, refresh]);

  useEffect(() => {
    mountedRef.current = true;
    generationRef.current += 1;
    pendingReadRef.current = null;
    pendingSaveRef.current = null;
    retryIdRef.current = null;
    setState(initialState(userId));
    if (userId) void refresh();
    return () => { mountedRef.current = false; generationRef.current += 1; };
  }, [userId, refresh]);

  useEffect(() => {
    if (!userId || typeof window === "undefined") return undefined;
    const foreground = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    const changed = event => {
      if (event.detail?.userId === userId) void refresh({ supersede: true });
    };
    const xpChanged = () => { void refresh({ force: true }); };
    document.addEventListener("visibilitychange", foreground);
    window.addEventListener("focus", foreground);
    window.addEventListener("online", foreground);
    window.addEventListener("bt-xp-changed", xpChanged);
    window.addEventListener("bt-level-updated", foreground);
    window.addEventListener(CHANGED_EVENT, changed);
    return () => {
      document.removeEventListener("visibilitychange", foreground);
      window.removeEventListener("focus", foreground);
      window.removeEventListener("online", foreground);
      window.removeEventListener("bt-xp-changed", xpChanged);
      window.removeEventListener("bt-level-updated", foreground);
      window.removeEventListener(CHANGED_EVENT, changed);
    };
  }, [userId, refresh]);

  const current = state.ownerId === userId ? state : initialState(userId);
  return { environmentId: current.environmentId, highestLevel: current.highestLevel,
    loading: current.loading, saving: current.saving, error: current.error, refresh, equip, retry };
}

export default useFocusEnvironment;
