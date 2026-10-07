import { useId, useState, type ReactNode } from 'react';
import { todayISO } from '../lib/format';
import { haptic } from '../lib/haptics';
import { PALETTE_COLORS } from '../lib/icons';
import { Sheet } from './Sheet';

/** The app mark: an espresso cup with steam that drifts up. */
export function Logo({ still }: { still?: boolean }) {
  // gradient ids must be unique: a copy inside a hidden sidebar would otherwise blank out the visible one
  const id = `logo-${useId().replace(/:/g, '')}`;
  return (
    <svg viewBox="0 0 512 512" aria-hidden="true">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#7a5539" /><stop offset="1" stopColor="#3a2618" /></linearGradient>
      </defs>
      <rect width="512" height="512" fill={`url(#${id})`} />
      <g transform="translate(256 256) scale(0.92) translate(-256 -256)">
        <g className={still ? undefined : 'steam'} fill="none" stroke="#f5e6d3" strokeWidth="18" strokeLinecap="round" opacity="0.85">
          <path d="M206 168c-18-22 18-38 0-62" />
          <path d="M256 158c-18-22 18-38 0-62" />
          <path d="M306 168c-18-22 18-38 0-62" />
        </g>
        <path d="M140 214h232v54c0 72-52 122-116 122s-116-50-116-122z" fill="#f5e6d3" />
        <path d="M372 236h18c30 0 48 20 48 44s-18 46-48 46h-30" fill="none" stroke="#f5e6d3" strokeWidth="22" strokeLinecap="round" />
        <ellipse cx="256" cy="216" rx="116" ry="20" fill="#c98a4b" />
        <path d="M104 408h304" stroke="#f5e6d3" strokeWidth="22" strokeLinecap="round" />
      </g>
    </svg>
  );
}

/** Stable palette colour for things without a colour of their own (goals, assets, bills). */
export const tintFor = (id: number) => PALETTE_COLORS[(id * 5) % PALETTE_COLORS.length];

/** iOS switch. */
export function Switch({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} className={`switch ${on ? 'on' : ''}`}
      onClick={() => (haptic(), onChange(!on))} />
  );
}

/** Rounded progress bar. `warn` turns it amber from 80 %; over the max it turns red. Colour comes from `color` or --c. */
export function Progress({ value, max, warn, color }: { value: number; max: number; warn?: boolean; color?: string }) {
  const pct = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : value > 0 ? 100 : 0;
  const state = value > max && max > 0 ? 'over' : warn && pct >= 80 ? 'warn' : '';
  return (
    <div className={`bar ${state}`} role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}
      style={color ? ({ ['--c' as string]: color }) : undefined}>
      <i style={{ width: `${pct}%` }} />
    </div>
  );
}

/** Label above a control. */
export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: ReactNode }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  );
}

/** Row of identity-palette colour chips. A value outside the palette shows as an extra selected chip. */
export function SwatchPicker({ value, onChange, label = 'Colour' }: { value?: string; onChange: (c: string) => void; label?: string }) {
  const custom = value && !PALETTE_COLORS.includes(value.toLowerCase()) ? value : null;
  return (
    <div className="swatches" role="radiogroup" aria-label={label}>
      {[...PALETTE_COLORS, ...(custom ? [custom] : [])].map((c) => (
        <button type="button" key={c} role="radio" aria-checked={value?.toLowerCase() === c.toLowerCase()} aria-label={c}
          className="swatch" style={{ ['--sw' as string]: c }} onClick={() => onChange(c)} />
      ))}
    </div>
  );
}

/** Small sheet asking for an amount and date; used for goal contributions and loan payments. */
export function AmountPrompt({ title, onSave, onClose }: { title: string; onSave: (amount: number, date: string) => void; onClose: () => void }) {
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(todayISO());
  return (
    <Sheet title={title} onClose={onClose} dirty={!!amount} size="sm">
      <form
        className="form"
        onSubmit={(e) => {
          e.preventDefault();
          if (+amount > 0) (onSave(+amount, date), haptic('success'), onClose());
        }}
      >
        <input className="amount-input" type="number" step="any" min="0" inputMode="decimal" aria-label="Amount" placeholder="0" autoFocus required value={amount} onChange={(e) => setAmount(e.target.value)} />
        <Field label="Date">
          <input type="date" required value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <button className="btn filled lg block">Save</button>
      </form>
    </Sheet>
  );
}
