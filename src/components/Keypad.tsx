import { useEffect, useRef, type ReactNode } from 'react';
import { Check, Delete, Divide, Equal, Minus, Plus, X } from 'lucide-react';
import { evalAmount, getSettings } from '../lib/format';
import { haptic } from '../lib/haptics';
import '../styles/quickadd.css';

/** Keys the pad understands. Operators are stored as ASCII so evalAmount can read the string. */
export type PadKey = '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '.' | '+' | '-' | '*' | '/' | 'back' | 'clear';

const OPS = '+-*/';
const MAX_LEN = 28;

/** Applies one key to an expression string, keeping it something evalAmount can read. */
export function pressKey(value: string, key: PadKey): string {
  if (key === 'clear') return '';
  if (key === 'back') return value.slice(0, -1);
  const last = value.slice(-1);
  const current = value.split(/[+\-*/]/).pop() ?? '';
  if (OPS.includes(key)) {
    if (!value) return '';
    if (OPS.includes(last)) return value.slice(0, -1) + key;
    if (last === '.') return value.slice(0, -1) + key;
    return value.length >= MAX_LEN ? value : value + key;
  }
  if (value.length >= MAX_LEN) return value;
  if (key === '.') {
    if (current.includes('.')) return value;
    return value + (current === '' ? '0.' : '.');
  }
  // digits: at most 2 decimals, no leading zeros
  if (/\.\d{2}$/.test(current)) return value;
  if (current === '0') return value.slice(0, -1) + key;
  return value + key;
}

/** Evaluates an expression that may end in an operator or a dot while typing ("120+" reads as 120). */
export function evalPartial(value: string): number {
  const v = evalAmount(value.replace(/[+\-*/.]+$/, ''));
  return Number.isFinite(v) ? v : 0;
}

export const hasOperator = (value: string) => /\d[+\-*/]/.test(value);

const groupLocale = () => (['INR', 'NPR'].includes(getSettings().currency) ? 'en-IN' : undefined);

/** "1200.5+45*2" → "1,200.5 + 45 × 2", keeping a trailing dot or operator as typed. */
export function prettyExpr(value: string): string {
  const fmt = new Intl.NumberFormat(groupLocale(), { maximumFractionDigits: 0 });
  return value
    .replace(/\d+/g, (m, off: number, s: string) => (s[off - 1] === '.' ? m : fmt.format(+m)))
    .replace(/[+\-*/]/g, (op) => ` ${op === '*' ? '×' : op === '/' ? '÷' : op === '-' ? '−' : '+'} `)
    .trim();
}

/** Plain grouped number, no currency (for the calculator). */
export function prettyNumber(n: number): string {
  return new Intl.NumberFormat(groupLocale(), { maximumFractionDigits: 2 }).format(n);
}

/** Maps a physical key to a pad key. */
function keyFor(e: KeyboardEvent): PadKey | null {
  const k = e.key;
  if (/^[0-9]$/.test(k)) return k as PadKey;
  if (k === '.' || k === ',' || k === 'Decimal') return '.';
  if (k === '+') return '+';
  if (k === '-' || k === 'Subtract') return '-';
  if (k === '*' || k === 'x' || k === 'X') return '*';
  if (k === '/') return '/';
  if (k === 'Backspace') return 'back';
  if (k === 'Delete') return 'clear';
  return null;
}

const isEditable = (el: Element | null) =>
  !!el && (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement || (el as HTMLElement).isContentEditable);

/**
 * Physical keyboard for a pad: digits, operators (+ - * / x), '.', ',', Backspace, Delete (clear) and
 * Enter or '='. Ignored while a text field has focus, with modifier keys, or when `active()` says no.
 */
export function useKeyEntry(opts: {
  active: () => boolean;
  value: string;
  onChange: (v: string) => void;
  onEnter?: (shift: boolean) => void;
}) {
  const latest = useRef(opts);
  latest.current = opts;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const o = latest.current;
      if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey || isEditable(document.activeElement) || !o.active()) return;
      if (e.key === 'Enter' || e.key === '=') {
        const el = document.activeElement as HTMLElement | null;
        // a focused button outside the pad (Cancel, a chip) keeps its own Enter
        if (e.key === 'Enter' && el && el.matches('button, a, summary, [role="tab"]') && !el.closest('.keypad, [data-keys]')) return;
        if (!o.onEnter) return;
        e.preventDefault();
        o.onEnter(e.shiftKey);
        return;
      }
      const key = keyFor(e);
      if (!key) return;
      e.preventDefault();
      o.onChange(pressKey(o.value, key));
    };
    const onPaste = (e: ClipboardEvent) => {
      const o = latest.current;
      if (isEditable(document.activeElement) || !o.active()) return;
      const text = (e.clipboardData?.getData('text') ?? '').replace(/[^\d.,+\-*/x×÷]/g, '').replace(/[x×]/g, '*').replace(/÷/g, '/');
      const n = evalAmount(text);
      if (!(n > 0)) return;
      e.preventDefault();
      o.onChange(String(n));
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('paste', onPaste);
    return () => (document.removeEventListener('keydown', onKey), document.removeEventListener('paste', onPaste));
  }, []);
}

/** Long press (default 480 ms) that cancels when the finger moves; the click after it is swallowed. */
export function useLongPress(onLong: () => void, ms = 480) {
  const timer = useRef(0);
  const start = useRef<{ x: number; y: number } | null>(null);
  const fired = useRef(false);
  const cancel = () => (window.clearTimeout(timer.current), (start.current = null));
  return {
    onPointerDown: (e: React.PointerEvent) => {
      if (e.button !== 0) return;
      fired.current = false;
      start.current = { x: e.clientX, y: e.clientY };
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => {
        fired.current = true;
        start.current = null;
        onLong();
      }, ms);
    },
    onPointerMove: (e: React.PointerEvent) => {
      const s = start.current;
      if (s && Math.hypot(e.clientX - s.x, e.clientY - s.y) > 8) cancel();
    },
    onPointerUp: cancel,
    onPointerCancel: cancel,
    onPointerLeave: cancel,
    onContextMenu: (e: React.MouseEvent) => {
      e.preventDefault();
      cancel();
      if (!fired.current) {
        fired.current = true;
        onLong();
      }
    },
    /** Call at the top of onClick: true when this click ends a long press. */
    consumed: () => {
      const f = fired.current;
      fired.current = false;
      return f;
    },
  };
}

type Cell = { key: PadKey; label: ReactNode; aria: string; kind?: 'op' | 'fn' };

const GRID: Cell[] = [
  { key: '1', label: '1', aria: '1' }, { key: '2', label: '2', aria: '2' }, { key: '3', label: '3', aria: '3' },
  { key: '/', label: <Divide size={24} strokeWidth={2.4} />, aria: 'divide', kind: 'op' },
  { key: '4', label: '4', aria: '4' }, { key: '5', label: '5', aria: '5' }, { key: '6', label: '6', aria: '6' },
  { key: '*', label: <X size={22} strokeWidth={2.6} />, aria: 'multiply', kind: 'op' },
  { key: '7', label: '7', aria: '7' }, { key: '8', label: '8', aria: '8' }, { key: '9', label: '9', aria: '9' },
  { key: '-', label: <Minus size={24} strokeWidth={2.6} />, aria: 'minus', kind: 'op' },
  { key: '.', label: '.', aria: 'decimal point' }, { key: '0', label: '0', aria: '0' },
  { key: 'back', label: <Delete size={24} strokeWidth={2} />, aria: 'delete', kind: 'fn' },
  { key: '+', label: <Plus size={24} strokeWidth={2.6} />, aria: 'plus', kind: 'op' },
];

/**
 * On-screen number pad, Apple-calculator style: 1 2 3 ÷ / 4 5 6 × / 7 8 9 − / . 0 ⌫ + and a full-width
 * submit key. `mode="add"` shows a check and `submitLabel`; `mode="calc"` shows '='. Long-press ⌫ clears.
 */
export function Keypad({ mode = 'add', value, onChange, onSubmit, submitLabel, submitDisabled, size = 'md', className = '' }: {
  mode?: 'add' | 'calc';
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  /** Text on the submit key in add mode, e.g. "Add Rs 165". */
  submitLabel?: ReactNode;
  submitDisabled?: boolean;
  size?: 'md' | 'sm';
  className?: string;
}) {
  const { consumed, ...clearHandlers } = useLongPress(() => {
    if (!value) return;
    haptic('medium');
    onChange('');
  });
  const tap = (key: PadKey) => {
    haptic('light');
    onChange(pressKey(value, key));
  };
  return (
    <div className={`keypad ${mode} ${size} ${className}`} role="group" aria-label={mode === 'calc' ? 'Calculator keys' : 'Amount keys'}>
      {GRID.map((c) => (
        <button
          key={c.key}
          type="button"
          className={`key ${c.kind ?? 'num'}`}
          aria-label={c.aria}
          title={c.key === 'back' ? 'Delete (hold to clear)' : undefined}
          {...(c.key === 'back' ? clearHandlers : {})}
          onClick={() => {
            if (c.key === 'back' && consumed()) return;
            tap(c.key);
          }}
        >
          {c.label}
        </button>
      ))}
      <button
        type="button"
        className="key submit"
        disabled={submitDisabled}
        onClick={() => {
          if (submitDisabled) return;
          onSubmit();
        }}
        aria-label={mode === 'calc' ? 'equals' : undefined}
      >
        {mode === 'calc' ? <Equal size={26} strokeWidth={2.6} /> : <><Check size={22} strokeWidth={2.8} aria-hidden="true" /><span className="ellipsis">{submitLabel ?? 'Add'}</span></>}
      </button>
    </div>
  );
}
