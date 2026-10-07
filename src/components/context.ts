import { createContext, useContext, useEffect, useRef } from 'react';
import type { Tx } from '../db';

export type Fab = { run: () => void; icon: 'plus' | 'filter' } | null;
export type ToastAction = { label: string; run: () => void };

export const AppCtx = createContext<{
  editTx: (t?: Partial<Tx>) => void;
  toast: (msg: string, action?: ToastAction) => void;
  setFab: (f: Fab) => void;
  dock: HTMLElement | null;
}>({ editTx: () => {}, toast: () => {}, setFab: () => {}, dock: null });
export const useApp = () => useContext(AppCtx);

/** Makes the dock's round button do this page's thing instead of "add transaction". */
export function useFab(run: () => void, icon: 'plus' | 'filter' = 'plus') {
  const { setFab } = useApp();
  const latest = useRef(run);
  latest.current = run;
  useEffect(() => {
    setFab({ run: () => latest.current(), icon });
    return () => setFab(null);
  }, [setFab, icon]);
}
