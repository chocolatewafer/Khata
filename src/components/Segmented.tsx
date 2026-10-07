import { useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { haptic } from '../lib/haptics';
import { useApp } from './context';

export type SegOption<T extends string> = T | readonly [T, string];
export type SegProps<T extends string> = {
  value: T;
  options: readonly SegOption<T>[];
  onChange: (v: T) => void;
  /** Stretch to the container width (default) or size to the labels. */
  block?: boolean;
  size?: 'sm' | 'md';
  'aria-label'?: string;
  className?: string;
};

const entry = <T extends string>(o: SegOption<T>): [T, string] =>
  typeof o === 'string' ? [o, o[0].toUpperCase() + o.slice(1)] : [o[0], o[1]];

/** iOS segmented control: gray track, raised thumb that slides to the selected option. Arrow keys move it. */
export function Segmented<T extends string>({ value, options, onChange, block = true, size = 'md', className = '', ...rest }: SegProps<T>) {
  const track = useRef<HTMLDivElement>(null);
  const [thumb, setThumb] = useState<{ x: number; w: number } | null>(null);
  const items = options.map(entry);
  const idx = items.findIndex(([v]) => v === value);

  useLayoutEffect(() => {
    const el = track.current;
    if (!el) return;
    const measure = () => {
      const b = el.querySelectorAll<HTMLElement>('[role="tab"]')[idx];
      setThumb(b ? { x: b.offsetLeft, w: b.offsetWidth } : null);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [idx, items.length]);

  const pick = (v: T) => {
    if (v === value) return;
    haptic();
    onChange(v);
  };

  return (
    <div
      ref={track}
      className={`seg ${block ? 'block' : ''} ${size} ${className}`}
      role="tablist"
      aria-label={rest['aria-label']}
      onKeyDown={(e) => {
        if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft' && e.key !== 'Home' && e.key !== 'End') return;
        e.preventDefault();
        const n = items.length;
        const next = e.key === 'Home' ? 0 : e.key === 'End' ? n - 1 : (idx + (e.key === 'ArrowRight' ? 1 : -1) + n) % n;
        pick(items[next][0]);
        track.current?.querySelectorAll<HTMLElement>('[role="tab"]')[next]?.focus();
      }}
    >
      {thumb && <span className="seg-thumb" aria-hidden="true" style={{ width: thumb.w, transform: `translateX(${thumb.x}px)` }} />}
      {items.map(([v, label]) => (
        <button type="button" role="tab" key={v} aria-selected={v === value} tabIndex={v === value ? 0 : -1}
          className={v === value ? 'on' : ''} onClick={() => pick(v)}>
          {label}
        </button>
      ))}
    </div>
  );
}

/** Legacy name for Segmented. */
export const Seg = Segmented;

/** A Segmented control that floats in the bottom dock (where the tab bar sits on the main tabs). */
export function DockSeg<T extends string>(props: SegProps<T>) {
  const { dock } = useApp();
  return dock ? createPortal(<Segmented {...props} className={`dock-seg ${props.className ?? ''}`} />, dock) : null;
}
