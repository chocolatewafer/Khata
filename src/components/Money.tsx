import { money, useSettings } from '../lib/format';

export type MoneyKind = 'expense' | 'income' | 'transfer' | 'neutral';

/**
 * A formatted amount. `expense` shows "−" in the label colour, `income` "+" in green, `transfer` secondary,
 * `neutral` as is. When amounts are hidden it shows •••• (announced as "Hidden").
 */
export function Money({ value, kind = 'neutral', size, sign = true, force, className = '' }: {
  value: number;
  kind?: MoneyKind;
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'hero';
  /** Prefix − / + for expense and income. */
  sign?: boolean;
  /** Show even when amounts are hidden. */
  force?: boolean;
  className?: string;
}) {
  const { hide } = useSettings();
  const cls = `money ${kind} ${size ? `m-${size}` : ''} ${className}`;
  if (hide && !force)
    return <span className={`${cls} hidden-amt`} aria-label="Hidden">••••</span>;
  const prefix = sign && value !== 0 ? (kind === 'expense' ? '−' : kind === 'income' ? '+' : '') : '';
  return <span className={cls}>{prefix}{money(prefix ? Math.abs(value) : value, { force: true })}</span>;
}
