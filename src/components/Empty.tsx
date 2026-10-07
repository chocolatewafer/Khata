import type { ReactNode } from 'react';
import { Icon } from './Icon';

/** Content-unavailable view: tinted circle with an icon, a title, a line of help and an optional action. */
export function Empty({ icon = 'circle-ellipsis', title, message, action, compact }: {
  icon?: string;
  title: ReactNode;
  message?: ReactNode;
  /** A button: `{ label, onClick }`, or any node. */
  action?: { label: string; onClick: () => void } | ReactNode;
  compact?: boolean;
}) {
  const isBtn = !!action && typeof action === 'object' && 'label' in (action as object) && 'onClick' in (action as object);
  return (
    <div className={`empty-view ${compact ? 'compact' : ''}`}>
      <span className="empty-ic"><Icon name={icon} size={compact ? 24 : 30} /></span>
      <div className="t-title3">{title}</div>
      {message && <p className="t-subhead secondary">{message}</p>}
      {isBtn ? (
        <button type="button" className="btn tinted" onClick={(action as { onClick: () => void }).onClick}>{(action as { label: string }).label}</button>
      ) : (action as ReactNode)}
    </div>
  );
}

/** Legacy empty state. Prefer Empty. */
export function EmptyCup({ text, hint }: { text: string; hint?: ReactNode }) {
  return <Empty icon="coffee" title={text} message={hint} />;
}
