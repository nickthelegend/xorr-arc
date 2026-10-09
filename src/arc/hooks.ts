/** Small data hooks: the executor's config once, and polled reads. */
import { useCallback, useEffect, useRef, useState } from 'react';
import { create } from 'zustand';
import { createReadGate } from './read-gate';
import { api, type Config } from './api';

type ConfigState = { config: Config | null; error: string | null; load: () => Promise<void> };
export const useConfig = create<ConfigState>((set) => ({
  config: null,
  error: null,
  async load() {
    try {
      set({ config: await api.config(), error: null });
    } catch (e) {
      set({ error: e instanceof Error ? e.message : String(e) });
    }
  },
}));

export function usePoll<T>(fn: (() => Promise<T>) | null, ms = 8000, deps: unknown[] = []) {
  const identity = JSON.stringify(deps);
  const [data, setData] = useState<{ identity: string; value: T } | null>(null);
  const [error, setError] = useState<{ identity: string; value: string } | null>(null);
  const alive = useRef(true);
  const gate = useRef(createReadGate());
  const run = useCallback(async () => {
    if (!fn) return;
    const accept = gate.current.begin();
    try {
      const v = await fn();
      if (alive.current && accept()) {
        setData({ identity, value: v });
        setError(null);
      }
    } catch (e) {
      if (alive.current && accept()) setError({ identity, value: e instanceof Error ? e.message : String(e) });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  useEffect(() => {
    alive.current = true;
    gate.current.invalidate();
    setData(null);
    setError(null);
    void run();
    const t = ms > 0 ? setInterval(run, ms) : null;
    return () => {
      alive.current = false;
      gate.current.invalidate();
      if (t) clearInterval(t);
    };
  }, [run, ms]);
  return { data: data?.identity === identity ? data.value : null, error: error?.identity === identity ? error.value : null, refresh: run };
}
