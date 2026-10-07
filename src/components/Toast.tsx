import { useSyncExternalStore } from 'react';
import type { ToastAction } from './context';

type Item = { id: number; text: string; action?: ToastAction };

const PLAIN_MS = 2600;
const ACTION_MS = 6500;

let current: Item | null = null;
let waiting: Item[] = [];
let seq = 0;
let timer = 0;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

function show(item: Item | null) {
  clearTimeout(timer);
  current = item;
  if (item) timer = window.setTimeout(next, item.action ? ACTION_MS : PLAIN_MS);
  emit();
}
function next() {
  show(waiting.shift() ?? null);
}

/**
 * Shows a toast. A toast with an action (Undo) stays at least 6 s and is never pushed out by a plain
 * toast: plain ones wait their turn. A newer action toast replaces an older one.
 */
export function showToast(text: string, action?: ToastAction) {
  const item = { id: ++seq, text, action };
  if (current?.action && !action) {
    // keep only the latest couple of plain messages waiting
    waiting = [...waiting.filter((w) => w.action), item].slice(-2);
    return;
  }
  show(item);
}

export function dismissToast() {
  next();
}

/** The toast region. Mount once. */
export function ToastHost() {
  const t = useSyncExternalStore(
    (l) => (listeners.add(l), () => void listeners.delete(l)),
    () => current,
    () => current,
  );
  // pause the countdown while the pointer or focus is on an action toast, then give it a few more seconds
  const hold = () => t?.action && clearTimeout(timer);
  const resume = () => {
    if (!t?.action) return;
    clearTimeout(timer);
    timer = window.setTimeout(next, 3000);
  };

  return (
    <div className="toast-region" role="status" aria-live="polite">
      {t && (
        <div className="toast" key={t.id} onPointerEnter={hold} onPointerLeave={resume}>
          <span className="toast-text">{t.text}</span>
          {t.action && (
            <button type="button" onFocus={hold} onBlur={resume}
              onClick={() => {
                t.action!.run();
                next();
              }}>
              {t.action.label}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
