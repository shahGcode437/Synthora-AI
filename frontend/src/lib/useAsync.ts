import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError } from "../api/client";

export const errMsg = (e: unknown, fallback = "Something went wrong.") =>
  e instanceof ApiError ? (e.isNetwork ? "Can't reach the server. If it was idle it may be waking up: try again in a few seconds." : e.message) : e instanceof Error ? e.message : fallback;

/** Run an async loader when `deps` change. Stale responses are ignored; `reload` re-runs it. */
export function useAsync<T>(load: () => Promise<T>, deps: unknown[], enabled = true) {
  const [state, setState] = useState<{ data: T | null; error: string | null; loading: boolean }>({ data: null, error: null, loading: enabled });
  const [tick, setTick] = useState(0);
  const loadRef = useRef(load);
  loadRef.current = load;
  useEffect(() => {
    if (!enabled) { setState((s) => ({ ...s, loading: false })); return; }
    let live = true;
    setState((s) => ({ ...s, loading: true, error: null }));
    loadRef.current().then((data) => live && setState({ data, error: null, loading: false }))
      .catch((e) => live && setState((s) => ({ data: s.data, error: errMsg(e), loading: false })));
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, enabled, tick]);
  const reload = useCallback(() => setTick((n) => n + 1), []);
  const setData = useCallback((fn: (d: T | null) => T | null) => setState((s) => ({ ...s, data: fn(s.data) })), []);
  return { ...state, reload, setData };
}
