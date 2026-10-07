import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ChevronLeft, Settings } from 'lucide-react';

/**
 * Page scaffold. Tab pages get a large title (with optional subtitle above it); pushed pages (`back`)
 * also get a "‹ Back" button. Once the large title scrolls away, a compact glass bar fades in with the
 * title centred. Children, if any, render below in a vertical stack.
 */
export function Screen({ title, subtitle, large = true, back, actions, children, className = '' }: {
  title: string;
  subtitle?: ReactNode;
  /** Show the large title. With false, only the compact bar shows (title always visible). */
  large?: boolean;
  /** true for "Back", a string for a custom label. Goes back in history, or Home when there is none. */
  back?: boolean | string;
  /** Trailing buttons in the nav bar (use `.nav-btn` for icon buttons). */
  actions?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  const navigate = useNavigate();
  const sentinel = useRef<HTMLDivElement>(null);
  const [stuck, setStuck] = useState(!large);

  useEffect(() => {
    if (!large) return setStuck(true);
    const el = sentinel.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(([e]) => setStuck(!e.isIntersecting && e.boundingClientRect.top < 60), {
      rootMargin: '-52px 0px 0px 0px',
    });
    io.observe(el);
    return () => io.disconnect();
  }, [large]);

  const goBack = () => (window.history.state?.idx > 0 ? navigate(-1) : navigate('/'));

  const head = (
    <>
      <header className={`navbar no-print ${stuck ? 'stuck' : ''} ${back ? 'has-back' : ''}`}>
        <div className="navbar-in">
          <div className="nav-lead">
            {back && (
              <button type="button" className="nav-back" onClick={goBack}>
                <ChevronLeft size={26} strokeWidth={2.4} aria-hidden="true" />
                <span>{typeof back === 'string' ? back : 'Back'}</span>
              </button>
            )}
          </div>
          <div className="nav-title t-headline" aria-hidden={large ? !stuck : undefined}>{title}</div>
          <div className="nav-trail">{actions}</div>
        </div>
      </header>
      {large && (
        <div className="large-title">
          {subtitle && <div className="lt-sub t-footnote">{subtitle}</div>}
          <h1 className="t-large">{title}</h1>
          <div ref={sentinel} className="lt-sentinel" aria-hidden="true" />
        </div>
      )}
      {!large && <h1 className="sr">{title}</h1>}
    </>
  );

  if (children === undefined) return head;
  return (
    <div className={`screen stack ${className}`}>
      {head}
      {children}
    </div>
  );
}

/** Legacy tab header. Prefer Screen. Without a title it shows today's date and "Summary". */
export function TopBar({ title, actions }: { title?: string; actions?: ReactNode }) {
  const date = new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });
  return (
    <Screen
      title={title ?? 'Summary'}
      subtitle={title ? undefined : date}
      actions={
        <>
          {actions}
          <Link to="/settings" className="nav-btn hide-desktop" aria-label="Preferences"><Settings size={22} /></Link>
        </>
      }
    />
  );
}

/** Legacy pushed-page header. Prefer <Screen back>. */
export function PageHead({ title, actions }: { title: string; actions?: ReactNode }) {
  return <Screen title={title} back actions={actions} />;
}
