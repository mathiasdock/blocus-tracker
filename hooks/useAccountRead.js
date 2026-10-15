import { useCallback, useEffect, useRef, useState } from "react";

// A reliable snapshot belongs to one mounted account generation, including A→B→A.
// A refresh failure keeps it; another account can never borrow it.
export function useAccountRead(userId, read) {
  const owner = useRef(userId);
  const previousOwner = useRef(userId);
  owner.current = userId;
  const generation = useRef(0);
  const mounted = useRef(false);
  const pending = useRef(null);
  const [state, setState] = useState({ ownerId: null, data: null, loading: true, error: false });
  const refresh = useCallback(({ force = false, supersede = false } = {}) => {
    if (!userId || !mounted.current || owner.current !== userId) return Promise.resolve(false);
    if (pending.current && !supersede) return pending.current;
    const request = ++generation.current;
    const current = () => mounted.current && owner.current === userId && generation.current === request;
    setState(previous => ({ ownerId: userId, data: previous.ownerId === userId ? previous.data : null, loading: true, error: false }));
    const promise = Promise.resolve().then(() => read(userId, { force })).then(data => {
      if (data == null) throw new Error("Incomplete read");
      if (!current()) return false;
      setState({ ownerId: userId, data, loading: false, error: false });
      return true;
    }).catch(() => {
      if (current()) setState(previous => ({ ...previous, loading: false, error: true }));
      return false;
    }).finally(() => { if (pending.current === promise) pending.current = null; });
    pending.current = promise;
    return promise;
  }, [userId, read]);

  useEffect(() => {
    mounted.current = true;
    setState({ ownerId: userId, data: null, loading: Boolean(userId), error: false });
    const force = previousOwner.current !== userId;
    previousOwner.current = userId;
    void refresh({ force });
    return () => { mounted.current = false; generation.current += 1; pending.current = null; };
  }, [userId, refresh]);

  const owned = state.ownerId === userId;
  return { data: owned ? state.data : null, loading: owned ? state.loading : Boolean(userId),
    error: owned && state.error, refresh, retry: () => refresh({ force: true }) };
}
