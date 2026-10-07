import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { IconTile, type TileSize } from './Icon';
import { Switch } from './controls';

/** Inset grouped list section (iOS Settings style). Children are usually Rows. */
export function List({ header, footer, children, className = '', action }: {
  header?: ReactNode;
  footer?: ReactNode;
  /** Trailing link/button on the header line, e.g. "See all". */
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`list-section ${className}`}>
      {(header || action) && (
        <div className="list-header">
          <span>{header}</span>
          {action}
        </div>
      )}
      <div className="list">{children}</div>
      {footer && <div className="list-footer">{footer}</div>}
    </section>
  );
}

type RowBase = {
  /** Icon key (rendered as an IconTile) or any node. */
  icon?: string | ReactNode;
  /** IconTile colour (palette hex). */
  color?: string;
  iconSize?: TileSize;
  title: ReactNode;
  subtitle?: ReactNode;
  /** Trailing value text (secondary colour), or any node (e.g. <Money>). */
  value?: ReactNode;
  destructive?: boolean;
  className?: string;
  children?: ReactNode;
};
type RowProps = RowBase &
  (
    | { accessory?: 'chevron' | 'none'; onClick?: () => void; to?: string; checked?: never; onToggle?: never }
    | { accessory: 'switch'; checked: boolean; onToggle: (v: boolean) => void; onClick?: never; to?: never }
  );

/** One row of a List: 44 px min height, optional icon tile, title/subtitle, trailing value and accessory. */
export function Row(p: RowProps) {
  const { icon, color, iconSize = 'sm', title, subtitle, value, destructive, className = '', children } = p;
  const accessory = p.accessory ?? (p.onClick || p.to ? 'chevron' : 'none');
  const label = typeof title === 'string' ? title : undefined;
  const inner = (
    <>
      {icon != null && (typeof icon === 'string' ? <IconTile name={icon} color={color} size={iconSize} /> : <span className="row-ic">{icon}</span>)}
      <span className="row-main">
        <span className="row-title">{title}</span>
        {subtitle && <span className="row-sub">{subtitle}</span>}
        {children}
      </span>
      {value != null && <span className="row-value">{value}</span>}
      {accessory === 'chevron' && <ChevronRight className="row-chev" size={18} aria-hidden="true" />}
      {accessory === 'switch' && <Switch on={p.checked!} onChange={p.onToggle!} label={label ?? 'Toggle'} />}
    </>
  );
  const cls = `row-item ${destructive ? 'destructive' : ''} ${p.onClick || p.to ? 'tappable' : ''} ${className}`;
  if (p.to) return <Link to={p.to} className={cls}>{inner}</Link>;
  if (p.onClick) return <button type="button" className={cls} onClick={p.onClick}>{inner}</button>;
  return <div className={cls}>{inner}</div>;
}
