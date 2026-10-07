import { useEffect, useId, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { isTopLayer, popLayer, pushLayer, trapTab } from './overlay';

export type ConfirmOptions = {
  title: string;
  message?: string;
  /** Default "OK" (or "Delete" when destructive). */
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
};
export type ActionItem<V> = { label: string; value: V; destructive?: boolean; disabled?: boolean };
export type ActionSheetOptions<V> = { title?: string; message?: string; actions: ActionItem<V>[]; cancelLabel?: string };

type Req =
  | { id: number; kind: 'confirm'; opts: ConfirmOptions; resolve: (v: boolean) => void }
  | { id: number; kind: 'sheet'; opts: ActionSheetOptions<unknown>; resolve: (v: unknown) => void };

let queue: Req[] = [];
let seq = 0;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const subscribe = (l: () => void) => (listeners.add(l), () => void listeners.delete(l));

/** In-app replacement for window.confirm. Resolves true when the person confirms. */
export function confirm(opts: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => {
    queue = [...queue, { id: ++seq, kind: 'confirm', opts, resolve }];
    emit();
  });
}

/** Bottom action sheet. Resolves with the chosen action's value, or null on Cancel/dismiss. */
export function actionSheet<V>(opts: ActionSheetOptions<V>): Promise<V | null> {
  return new Promise((resolve) => {
    queue = [...queue, { id: ++seq, kind: 'sheet', opts: opts as ActionSheetOptions<unknown>, resolve: resolve as (v: unknown) => void }];
    emit();
  });
}

function settle(id: number, value: unknown) {
  const r = queue.find((q) => q.id === id);
  queue = queue.filter((q) => q.id !== id);
  emit();
  if (r) (r.resolve as (v: unknown) => void)(value);
}

/** Renders confirm() and actionSheet() requests. Mount once, near the root. */
export function DialogHost() {
  const list = useSyncExternalStore(subscribe, () => queue, () => queue);
  const top = list[0];
  if (!top) return null;
  return createPortal(top.kind === 'confirm' ? <Alert key={top.id} req={top} /> : <ActionSheetView key={top.id} req={top} />, document.body);
}

function useLayer(onCancel: () => void, root: React.RefObject<HTMLElement | null>) {
  const layer = useRef(Symbol('dialog'));
  const [restoreTo] = useState(() => document.activeElement as HTMLElement | null);
  const [closing, setClosing] = useState(false);
  useLayoutEffect(() => {
    const id = layer.current;
    pushLayer(id);
    root.current?.querySelector<HTMLElement>('[data-autofocus]')?.focus({ preventScroll: true });
    return () => {
      popLayer(id);
      if (restoreTo && document.contains(restoreTo)) restoreTo.focus({ preventScroll: true });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const cancel = useRef(onCancel);
  cancel.current = onCancel;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!isTopLayer(layer.current) || !root.current) return;
      if (e.key === 'Escape') (e.preventDefault(), e.stopPropagation(), cancel.current());
      else trapTab(e, root.current);
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [root]);
  return { closing, setClosing };
}

const OUT = 180;

function Alert({ req }: { req: Extract<Req, { kind: 'confirm' }> }) {
  const root = useRef<HTMLDivElement>(null);
  const tid = useId();
  const mid = useId();
  const done = (v: boolean) => {
    setClosing(true);
    window.setTimeout(() => settle(req.id, v), OUT);
  };
  const { closing, setClosing } = useLayer(() => done(false), root);
  const { title, message, destructive, confirmLabel, cancelLabel = 'Cancel' } = req.opts;
  return (
    <div className={`dialog-root ${closing ? 'closing' : ''}`} onMouseDown={(e) => e.target === e.currentTarget && done(false)}>
      <div ref={root} className="alert" role="alertdialog" aria-modal="true" aria-labelledby={tid} aria-describedby={message ? mid : undefined}>
        <div className="alert-text">
          <h2 id={tid} className="t-headline">{title}</h2>
          {message && <p id={mid} className="t-footnote">{message}</p>}
        </div>
        <div className="alert-btns">
          <button type="button" className={destructive ? 'destructive' : 'strong'} data-autofocus={destructive ? undefined : true} onClick={() => done(true)}>
            {confirmLabel ?? (destructive ? 'Delete' : 'OK')}
          </button>
          <button type="button" className={destructive ? 'strong' : ''} data-autofocus={destructive ? true : undefined} onClick={() => done(false)}>{cancelLabel}</button>
        </div>
      </div>
    </div>
  );
}

function ActionSheetView({ req }: { req: Extract<Req, { kind: 'sheet' }> }) {
  const root = useRef<HTMLDivElement>(null);
  const tid = useId();
  const done = (v: unknown) => {
    setClosing(true);
    window.setTimeout(() => settle(req.id, v), OUT);
  };
  const { closing, setClosing } = useLayer(() => done(null), root);
  const { title, message, actions, cancelLabel = 'Cancel' } = req.opts;
  return (
    <div className={`dialog-root bottom ${closing ? 'closing' : ''}`} onMouseDown={(e) => e.target === e.currentTarget && done(null)}>
      <div ref={root} className="action-sheet" role="dialog" aria-modal="true" aria-labelledby={title ? tid : undefined} aria-label={title ? undefined : 'Options'}>
        <div className="as-group">
          {(title || message) && (
            <div className="as-head">
              {title && <div id={tid} className="t-footnote strong-2">{title}</div>}
              {message && <div className="t-footnote">{message}</div>}
            </div>
          )}
          {actions.map((a, i) => (
            <button type="button" key={i} className={a.destructive ? 'destructive' : ''} disabled={a.disabled} data-autofocus={i === 0 ? true : undefined} onClick={() => done(a.value)}>
              {a.label}
            </button>
          ))}
        </div>
        <button type="button" className="as-cancel" onClick={() => done(null)}>{cancelLabel}</button>
      </div>
    </div>
  );
}
