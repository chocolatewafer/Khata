import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { confirm } from './Dialogs';
import { prefersReducedMotion } from './hooks';
import { isTopLayer, popLayer, pushLayer, trapTab } from './overlay';

export type SheetAction = { label: string; onClick: () => void; disabled?: boolean };

const OUT_MS = 280;

/**
 * iOS-style sheet. Slides up on phones (drag the grabber or header down to dismiss); a centred card from
 * 600 px. Escape, the backdrop, Cancel and the close button all dismiss; with `dirty` they ask first.
 * Focus moves in, is trapped, and returns to where it was on close.
 */
export function Sheet({
  title, onClose, children, dirty, dirtyTitle = 'Discard changes?', dirtyMessage, action, cancelLabel, footer,
  size = 'md', className = '', hideTitle,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  /** Unsaved input: dismissing asks first. */
  dirty?: boolean;
  dirtyTitle?: string;
  dirtyMessage?: string;
  /** Primary action in the header's trailing slot (e.g. Save). With it, the leading slot shows Cancel. */
  action?: SheetAction;
  /** Show a text Cancel button on the left instead of the close (x) button on the right. */
  cancelLabel?: string;
  /** Pinned below the scrolling content (e.g. a full-width button). */
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  /** Keep the title for screen readers only. */
  hideTitle?: boolean;
}) {
  const layer = useRef(Symbol('sheet'));
  const panel = useRef<HTMLDivElement>(null);
  const titleId = useId();
  // captured during the first render, before children (and their autoFocus) mount
  const [restoreTo] = useState(() => document.activeElement as HTMLElement | null);
  const [closing, setClosing] = useState(false);
  const [drag, setDrag] = useState(0);
  const dragState = useRef<{ y: number; t: number; id: number; last: number; lastT: number } | null>(null);
  const asking = useRef(false);
  const latest = useRef({ dirty, onClose, dirtyTitle, dirtyMessage });
  latest.current = { dirty, onClose, dirtyTitle, dirtyMessage };

  const finish = useCallback(() => {
    if (prefersReducedMotion()) return latest.current.onClose();
    setClosing(true);
    window.setTimeout(() => latest.current.onClose(), OUT_MS);
  }, []);

  const requestClose = useCallback(async () => {
    if (asking.current) return;
    const { dirty: d, dirtyTitle: t, dirtyMessage: m } = latest.current;
    if (d) {
      asking.current = true;
      const ok = await confirm({ title: t, message: m, confirmLabel: 'Discard', cancelLabel: 'Keep editing', destructive: true });
      asking.current = false;
      if (!ok) return setDrag(0);
    }
    finish();
  }, [finish]);

  useLayoutEffect(() => {
    const id = layer.current;
    pushLayer(id);
    const el = panel.current;
    // React's autoFocus has already run by now; only take focus if nothing inside has it
    if (el && !el.contains(document.activeElement)) {
      const auto = el.querySelector<HTMLElement>('[autofocus], [data-autofocus]');
      (auto ?? el).focus({ preventScroll: true });
    }
    return () => {
      popLayer(id);
      if (restoreTo && document.contains(restoreTo)) restoreTo.focus({ preventScroll: true });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!isTopLayer(layer.current) || !panel.current) return;
      if (e.key === 'Escape') (e.preventDefault(), requestClose());
      else trapTab(e, panel.current);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [requestClose]);

  // drag-to-dismiss from the grabber/header
  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0 || (e.target as HTMLElement).closest('button, a, input, select, textarea')) return;
    dragState.current = { y: e.clientY, t: e.timeStamp, id: e.pointerId, last: e.clientY, lastT: e.timeStamp };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const s = dragState.current;
    if (!s || s.id !== e.pointerId) return;
    const dy = e.clientY - s.y;
    s.last = e.clientY;
    s.lastT = e.timeStamp;
    // rubber-band upwards, follow the finger downwards
    setDrag(dy < 0 ? -Math.sqrt(-dy) * 2 : dy);
  };
  const onPointerUp = (e: React.PointerEvent) => {
    const s = dragState.current;
    if (!s || s.id !== e.pointerId) return;
    dragState.current = null;
    const dy = e.clientY - s.y;
    const v = dy / Math.max(1, e.timeStamp - s.t);
    if (dy > 120 || (v > 0.6 && dy > 24)) requestClose();
    else setDrag(0);
  };

  const showCancel = !!(action || cancelLabel);
  const dragging = dragState.current != null;

  return createPortal(
    <div className={`sheet-root ${closing ? 'closing' : ''}`} onMouseDown={(e) => e.target === e.currentTarget && requestClose()}>
      <div
        ref={panel}
        className={`sheet ${size} ${className}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        style={drag ? { transform: `translateY(${drag}px)`, transition: dragging ? 'none' : undefined } : undefined}
      >
        <div className="sheet-head" onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}>
          <span className="grabber" aria-hidden="true" />
          <div className="sheet-bar">
            <div className="sheet-lead">
              {showCancel && <button type="button" className="btn plain" onClick={requestClose}>{cancelLabel ?? 'Cancel'}</button>}
            </div>
            <h2 id={titleId} className={`t-headline sheet-title ${hideTitle ? 'sr' : ''}`}>{title}</h2>
            <div className="sheet-trail">
              {action ? (
                <button type="button" className="btn plain strong" disabled={action.disabled} onClick={action.onClick}>{action.label}</button>
              ) : !showCancel ? (
                <button type="button" className="close-btn" aria-label="Close" onClick={requestClose}><X size={16} strokeWidth={2.6} /></button>
              ) : null}
            </div>
          </div>
        </div>
        <div className="sheet-body">{children}</div>
        {footer && <div className="sheet-foot">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

/** Legacy name. Prefer Sheet. */
export function Modal({ title, onClose, children, dirty }: { title: string; onClose: () => void; children: ReactNode; dirty?: boolean }) {
  return <Sheet title={title} onClose={onClose} dirty={dirty}>{children}</Sheet>;
}
