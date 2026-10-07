import { useLayoutEffect, useRef, useState } from 'react';
import { compact, money, useSettings } from '../lib/format';
import { IconTile } from './Icon';

export interface TrendPoint {
  label: string;
  income: number;
  expense: number;
}

const H = 200;
const PAD = { l: 44, r: 4, t: 10, b: 28 };

function niceMax(v: number) {
  if (v <= 0) return 100;
  const p = 10 ** Math.floor(Math.log10(v));
  return [1, 2, 4, 5, 10].find((s) => s * p >= v)! * p;
}

// bar with a 4px rounded data-end, square on the baseline
function bar(x: number, y: number, w: number, h: number) {
  const r = Math.min(4, h, w / 2);
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
}

/** Income vs expense per period as grouped bars. */
export function TrendBars({ data }: { data: TrendPoint[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const { hide } = useSettings();
  // draw at the real pixel width so labels stay 11px on every screen
  const box = useRef<HTMLDivElement>(null);
  const [W, setW] = useState(600);
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => el.clientWidth && setW(el.clientWidth));
    ro.observe(el);
    setW(el.clientWidth || 600);
    return () => ro.disconnect();
  }, []);
  const max = niceMax(Math.max(...data.map((d) => Math.max(d.income, d.expense)), 0));
  const iw = W - PAD.l - PAD.r;
  const ih = H - PAD.t - PAD.b;
  const slot = iw / Math.max(data.length, 1);
  const bw = Math.max(3, Math.min(16, (slot - 12) / 2));
  const y = (v: number) => PAD.t + ih - (v / max) * ih;
  const h = hover != null ? data[hover] : null;

  return (
    <div className="chart" ref={box}>
      <div className="legend">
        <span><i style={{ background: 'var(--positive)' }} />Income</span>
        <span><i style={{ background: 'var(--accent)' }} />Expense</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Income and expense by period" onMouseLeave={() => setHover(null)}>
        {[0, 0.5, 1].map((f) => (
          <g key={f}>
            <line x1={PAD.l} x2={W - PAD.r} y1={y(max * f)} y2={y(max * f)} stroke={f ? 'var(--separator)' : 'var(--fill-strong)'} strokeDasharray={f ? '2 4' : undefined} />
            <text x={PAD.l - 6} y={y(max * f) + 4} textAnchor="end">{hide ? '' : compact(max * f)}</text>
          </g>
        ))}
        {data.map((d, i) => {
          const cx = PAD.l + slot * i + slot / 2;
          return (
            <g key={i} opacity={hover == null || hover === i ? 1 : 0.5}>
              {d.income > 0 && <path d={bar(cx - bw - 1, y(d.income), bw, y(0) - y(d.income))} fill="var(--positive)" className="b" style={{ animationDelay: `${i * 50}ms` }} />}
              {d.expense > 0 && <path d={bar(cx + 1, y(d.expense), bw, y(0) - y(d.expense))} fill="var(--accent)" className="b" style={{ animationDelay: `${i * 50 + 25}ms` }} />}
              <text x={cx} y={H - 6} textAnchor="middle">{d.label}</text>
              <rect x={cx - slot / 2} y={0} width={slot} height={H} fill="transparent" onMouseEnter={() => setHover(i)} onClick={() => setHover(i)} />
            </g>
          );
        })}
      </svg>
      {h && hover != null && (
        <div className="tip" style={{ left: `${Math.min(88, Math.max(12, ((PAD.l + slot * hover + slot / 2) / W) * 100))}%` }}>
          <b>{h.label}</b>
          <div className="tip-row"><i style={{ background: 'var(--positive)' }} />Income <span className="num">{money(h.income)}</span></div>
          <div className="tip-row"><i style={{ background: 'var(--accent)' }} />Expense <span className="num">{money(h.expense)}</span></div>
          <div className="tip-row net">Net <span className="num">{money(h.income - h.expense)}</span></div>
        </div>
      )}
    </div>
  );
}

/** Ranked horizontal bars: one hue, value and share labelled on every row. */
export function Breakdown({ rows, empty = 'Nothing in this range.' }: {
  /** `icon`/`color` (optional) show an IconTile and tint the bar. */
  rows: { name: string; value: number; icon?: string; color?: string }[];
  empty?: string;
}) {
  const sorted = rows.filter((r) => r.value > 0).sort((a, b) => b.value - a.value);
  const max = sorted[0]?.value ?? 0;
  const total = sorted.reduce((s, r) => s + r.value, 0);
  if (!sorted.length) return <div className="chart-empty t-subhead">{empty}</div>;
  const icons = sorted.some((r) => r.icon || r.color);
  return (
    <div className={`breakdown ${icons ? 'with-icons' : ''}`}>
      {sorted.map((r, i) => (
        <div className="hbar" key={r.name} title={`${r.name}: ${money(r.value)}`}>
          {icons && <IconTile name={r.icon} color={r.color ?? '#8e8e93'} size="sm" />}
          <div className="hbar-main">
            <div className="hbar-top">
              <span className="name">{r.name}</span>
              <span className="num hbar-val">
                {money(r.value)} <span className="pct">{Math.round((r.value / total) * 100)}%</span>
              </span>
            </div>
            <span className="track">
              <i style={{ width: `${(r.value / max) * 100}%`, background: r.color, animationDelay: `${Math.min(i, 8) * 40}ms` }} />
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}
