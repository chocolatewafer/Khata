import type { CSSProperties, ReactNode } from 'react';
import { glyphOn, iconFor } from '../lib/icons';

/** A line icon from the curated set in lib/icons. Accepts an icon key (or a legacy emoji). */
export function Icon({ name, size = 20, strokeWidth = 2, className, label }: {
  name?: string;
  size?: number;
  strokeWidth?: number;
  className?: string;
  /** Accessible name. Without it the icon is decorative. */
  label?: string;
}) {
  const C = iconFor(name);
  return <C size={size} strokeWidth={strokeWidth} className={className} aria-hidden={label ? undefined : true} aria-label={label} role={label ? 'img' : undefined} />;
}

const GLYPH = { sm: 16, md: 20, lg: 24, xl: 34 } as const;
export type TileSize = keyof typeof GLYPH;

/**
 * Solid rounded square in `color` with a glyph on top (white, or dark on light colours).
 * Pass `name` for an icon, `text` for a monogram, or `children` for anything else.
 */
export function IconTile({ name, color, size = 'md', text, children, className = '', label }: {
  name?: string;
  color?: string;
  size?: TileSize;
  text?: string;
  children?: ReactNode;
  className?: string;
  label?: string;
}) {
  const style = color ? ({ '--tile': color, '--glyph': glyphOn(color) } as CSSProperties) : undefined;
  return (
    <span className={`tile-ic ${size} ${color ? '' : 'neutral'} ${className}`} style={style} role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
      {children ?? (text ? <span className="mono-t">{text}</span> : <Icon name={name} size={GLYPH[size]} strokeWidth={size === 'sm' ? 2.2 : 2} />)}
    </span>
  );
}

/** Legacy tile: `icon` may be an icon key, an emoji (mapped to a key) or a node. Prefer IconTile. */
export function IconSq({ icon, color, small }: { icon: ReactNode; color?: string; small?: boolean }) {
  const size = small ? 'sm' : 'md';
  if (typeof icon === 'string' || icon == null) return <IconTile name={icon ?? undefined} color={color} size={size} />;
  return <IconTile color={color} size={size}>{icon}</IconTile>;
}
