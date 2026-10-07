import { useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useLocation } from 'react-router-dom';
import { Calculator, Copy, Plus, RotateCcw } from 'lucide-react';
import { setSettings, useSettings } from '../lib/format';
import { anyLayerOpen, subscribeLayers } from './overlay';
import { Keypad, evalPartial, hasOperator, prettyExpr, prettyNumber, useKeyEntry } from './Keypad';
import { haptic, prefersReducedMotion, useApp } from './ui';
import '../styles/calc.css';

const PILL_H = 44;
const MARGIN = 12;
const DRAG_PX = 6;
const STORE = 'khata-calc';

type Insets = { top: number; right: number; bottom: number; left: number };
type Bounds = { minX: number; maxX: number; minY: number; maxY: number; defY: number; desktop: boolean };

function readInsets(probe: HTMLElement | null): Insets {
  if (!probe) return { top: 0, right: 0, bottom: 0, left: 0 };
  const cs = getComputedStyle(probe);
  return { top: parseFloat(cs.paddingTop) || 0, right: parseFloat(cs.paddingRight) || 0, bottom: parseFloat(cs.paddingBottom) || 0, left: parseFloat(cs.paddingLeft) || 0 };
}

/** Where the pill may sit: inside the safe area, off the sidebar on desktop, and above the dock's touch targets. */
function bounds(width: number, ins: Insets): Bounds {
  const W = window.innerWidth;
  const H = window.innerHeight;
  const desktop = W >= 1024;
  const side = desktop ? parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--side')) || 264 : 0;
  const edge = W >= 700 ? 24 : 16;
  const minX = side + ins.left + (desktop ? 32 : edge);
  const maxX = Math.max(minX, W - ins.right - edge - width);
  // phones/tablets: the tab bar (62 px) sits 10 px above the bottom inset, so stay above it.
  // desktop: the dock row holds only the + button on the right, so the pill may sit in that row (centred on it).
  const dock = desktop ? 20 + 31 - PILL_H / 2 - MARGIN : 10 + 62 - 4;
  const minY = ins.top + MARGIN + (desktop ? 0 : 44);
  const maxY = Math.max(minY, H - ins.bottom - dock - MARGIN - PILL_H);
  // default: the lowest spot (right above the + on phones, in the dock row on desktop), off the page content
  const defY = maxY;
  return { minX, maxX, minY, maxY, defY, desktop };
}

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

function loadExpr() {
  try {
    return localStorage.getItem(STORE) ?? '';
  } catch {
    return '';
  }
}

/**
 * Floating calculator. A small glass pill (calculator glyph + last result) that can be dragged and snaps
 * to the nearest side; tap opens a panel with the shared Keypad, Copy, Add as expense and Clear.
 * Position is kept in settings.calcPos as { x: 0 left | 1 right, y: 0..1 of the free height }.
 */
export function CalcPill() {
  const s = useSettings();
  const { pathname } = useLocation();
  const layerOpen = useSyncExternalStore(subscribeLayers, anyLayerOpen, () => false);
  const hidden = !s.calculator || pathname === '/welcome' || pathname === '/silent_add' || layerOpen;
  if (hidden) return null;
  return <CalcPillInner />;
}

function CalcPillInner() {
  const s = useSettings();
  const { editTx, toast } = useApp();
  const [expr, setExpr] = useState(loadExpr);
  const [open, setOpen] = useState(false);
  const [width, setWidth] = useState(PILL_H);
  const [vp, setVp] = useState(0); // bumps on resize so the position is re-clamped
  const [drag, setDrag] = useState<{ x: number; y: number } | null>(null);
  const [panelPos, setPanelPos] = useState<{ left: number; top: number } | null>(null);
  const pill = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const probe = useRef<HTMLDivElement>(null);
  const press = useRef<{ id: number; sx: number; sy: number; ox: number; oy: number; moved: boolean } | null>(null);
  const swallowClick = useRef(false);
  // after '=' (or a result restored from last time) a digit starts a new number, like a real calculator
  const justEq = useRef(true);
  const input = (next: string) => {
    if (justEq.current && next.length === expr.length + 1 && next.startsWith(expr) && /[\d.]$/.test(next)) {
      next = next.endsWith('.') ? '0.' : next.slice(-1);
    }
    justEq.current = false;
    setExpr(next);
  };

  const result = evalPartial(expr);
  const shown = expr ? prettyNumber(result) : '';

  useEffect(() => {
    try {
      localStorage.setItem(STORE, expr);
    } catch {
      // private mode: the calculator forgets on reload
    }
  }, [expr]);

  useLayoutEffect(() => {
    const el = pill.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.offsetWidth));
    ro.observe(el);
    setWidth(el.offsetWidth);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const onResize = () => setVp((n) => n + 1);
    window.addEventListener('resize', onResize);
    window.visualViewport?.addEventListener('resize', onResize);
    return () => (window.removeEventListener('resize', onResize), window.visualViewport?.removeEventListener('resize', onResize));
  }, []);

  const ins = readInsets(probe.current);
  const b = bounds(width, ins);
  void vp;
  const side = s.calcPos?.x ?? (b.desktop ? 0 : 1);
  const top = s.calcPos ? b.minY + clamp(s.calcPos.y, 0, 1) * (b.maxY - b.minY) : b.defY;
  const pos = drag ?? { x: side >= 0.5 ? b.maxX : b.minX, y: clamp(top, b.minY, b.maxY) };

  const close = useCallback((refocus = true) => {
    setOpen(false);
    if (refocus) pill.current?.focus({ preventScroll: true });
  }, []);

  // place the panel next to the pill: above it if there's room, else below, always on screen
  useLayoutEffect(() => {
    if (!open || !panel.current) return setPanelPos(null);
    const p = panel.current;
    const W = window.innerWidth;
    const H = window.innerHeight;
    const pw = p.offsetWidth;
    const ph = p.offsetHeight;
    const right = side >= 0.5;
    const left = clamp(right ? pos.x + width - pw : pos.x, ins.left + 8, W - ins.right - pw - 8);
    let t = pos.y - 8 - ph;
    if (t < ins.top + 8) t = pos.y + PILL_H + 8;
    t = clamp(t, ins.top + 8, Math.max(ins.top + 8, H - ins.bottom - ph - 8));
    setPanelPos({ left, top: t });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, pos.x, pos.y, width, side, vp]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (panel.current?.contains(t) || pill.current?.contains(t)) return;
      close(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !anyLayerOpen()) (e.preventDefault(), close());
    };
    document.addEventListener('pointerdown', onDown, true);
    document.addEventListener('keydown', onKey);
    return () => (document.removeEventListener('pointerdown', onDown, true), document.removeEventListener('keydown', onKey));
  }, [open, close]);

  const placed = panelPos != null;
  useEffect(() => {
    if (open && placed) panel.current?.focus({ preventScroll: true });
  }, [open, placed]);

  const equals = () => {
    if (!expr) return;
    haptic('light');
    const v = evalPartial(expr);
    setExpr(v ? String(v) : '');
    justEq.current = true;
  };
  useKeyEntry({ active: () => open && !anyLayerOpen(), value: expr, onChange: input, onEnter: equals });

  const onPointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0) return;
    press.current = { id: e.pointerId, sx: e.clientX, sy: e.clientY, ox: pos.x, oy: pos.y, moved: false };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const p = press.current;
    if (!p || p.id !== e.pointerId) return;
    const dx = e.clientX - p.sx;
    const dy = e.clientY - p.sy;
    if (!p.moved && Math.hypot(dx, dy) < DRAG_PX) return;
    if (!p.moved) (p.moved = true, setOpen(false));
    const W = window.innerWidth;
    setDrag({ x: clamp(p.ox + dx, b.minX - 8, Math.max(b.minX, W - ins.right - width - 8)), y: clamp(p.oy + dy, b.minY, b.maxY) });
  };
  const onPointerUp = (e: React.PointerEvent) => {
    const p = press.current;
    if (!p || p.id !== e.pointerId) return;
    press.current = null;
    if (!p.moved) return;
    swallowClick.current = true;
    const cur = drag ?? { x: p.ox, y: p.oy };
    const mid = (b.minX + b.maxX + width) / 2;
    const x = cur.x + width / 2 < mid ? 0 : 1;
    const y = b.maxY > b.minY ? clamp((cur.y - b.minY) / (b.maxY - b.minY), 0, 1) : 0;
    setDrag(null);
    setSettings({ calcPos: { x, y: Math.round(y * 1000) / 1000 } });
    haptic('light');
  };

  const copy = async () => {
    const text = String(result);
    try {
      await navigator.clipboard.writeText(text);
      toast(`Copied ${prettyNumber(result)}`);
    } catch {
      toast('Couldn’t copy on this browser');
    }
  };
  const addExpense = () => {
    if (!(result > 0)) return;
    close(false);
    editTx({ amount: result, type: 'expense' });
  };

  const reduce = prefersReducedMotion();

  return (
    <>
      <div ref={probe} className="calc-safe" aria-hidden="true" />
      <button
        ref={pill}
        type="button"
        className={`calc-pill no-print ${drag ? 'dragging' : ''} ${open ? 'open' : ''} ${shown ? '' : 'bare'} ${reduce ? 'still' : ''}`}
        style={{ transform: `translate3d(${Math.round(pos.x)}px, ${Math.round(pos.y)}px, 0)` }}
        aria-label={shown ? `Calculator, ${shown}` : 'Calculator'}
        aria-expanded={open}
        aria-haspopup="dialog"
        data-keys
        title="Calculator (drag to move)"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onClick={() => {
          if (swallowClick.current) return void (swallowClick.current = false);
          haptic('light');
          setOpen((o) => !o);
        }}
      >
        <Calculator size={20} strokeWidth={2.2} aria-hidden="true" />
        {shown && <span className="calc-pill-val num">{shown}</span>}
      </button>
      {open && (
        <div
          ref={panel}
          className={`calc-panel no-print ${panelPos ? '' : 'measuring'}`}
          style={panelPos ? { left: panelPos.left, top: panelPos.top } : undefined}
          role="dialog"
          aria-label="Calculator"
          data-keys
          tabIndex={-1}
        >
          <div className="calc-display" role="status" aria-live="polite" aria-atomic="true">
            <div className="calc-expr">{hasOperator(expr) ? `${prettyExpr(expr)} =` : ' '}</div>
            <div className={`calc-result num ${shown.length > 12 ? 's' : ''} ${expr ? '' : 'empty'}`}>{expr ? (hasOperator(expr) ? shown : prettyExpr(expr)) : '0'}</div>
          </div>
          <Keypad mode="calc" size="sm" value={expr} onChange={input} onSubmit={equals} />
          <div className="calc-actions">
            <button type="button" className="btn gray sm" onClick={copy} disabled={!expr}><Copy size={15} aria-hidden="true" /> Copy</button>
            <button type="button" className="btn filled sm" onClick={addExpense} disabled={!(result > 0)}><Plus size={16} aria-hidden="true" /> Add as expense</button>
            <button type="button" className="btn gray sm calc-clear" onClick={() => (haptic('light'), setExpr(''))} disabled={!expr} aria-label="Clear"><RotateCcw size={15} aria-hidden="true" /></button>
          </div>
        </div>
      )}
    </>
  );
}
