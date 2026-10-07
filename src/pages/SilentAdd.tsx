import { useEffect, useState, type ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { CircleCheck, CircleHelp, Info, TriangleAlert } from 'lucide-react';
import { db } from '../db';
import { ingest, resolve, type Resolved } from '../lib/automation';
import { getSettings, money, todayISO } from '../lib/format';
import { parseSms, type Parsed } from '../lib/parse';
import { checkAlerts } from '../lib/notify';
import { haptic } from '../lib/haptics';
import { linkFromParams, smsParams } from './silentAddLogic';
import '../styles/screens-b.css';

export { smsFromSearch, smsParams } from './silentAddLogic';

// one add per navigation, even if the effect re-runs
const handled = new Set<string>();

type Tone = 'ok' | 'warn' | 'info';
type View =
  | { kind: 'loading' }
  | { kind: 'confirm'; r: Resolved; sms: boolean; account?: string; category?: string }
  | { kind: 'result'; tone: Tone; title: string; sub?: string; paste?: string };

const markDone = () => {
  try {
    history.replaceState(null, '', `${import.meta.env.BASE_URL}silent_add?done`);
  } catch {
    // sandboxed: nothing to do
  }
};

/**
 * Quick-add endpoint for Shortcuts / Tasker / MacroDroid / the share sheet:
 *   /silent_add?k=<link key>&amount=50&type=expense&name=Coffee&account=Cash&category=Food&description=...&date=yyyy-mm-dd
 *   /silent_add?k=<link key>&from=<sender>&sms=<raw bank SMS text>
 * Links without the key (made outside Khata) ask before adding.
 */
export function SilentAdd() {
  const { key, search, hash } = useLocation();
  const [view, setView] = useState<View>({ kind: 'loading' });
  const [busy, setBusy] = useState(false);

  async function add(r: Resolved, sms: boolean) {
    markDone();
    // repeated links are legitimate (two coffees a day), so only SMS is deduplicated
    const { added } = await ingest([r], sms ? 'sms' : 'link', sms);
    checkAlerts();
    if (added) haptic('success');
    setView(added
      ? { kind: 'result', tone: 'ok', title: `${money(r.amount, { force: true })} ${r.type === 'income' ? 'received' : 'spent'}`, sub: r.name }
      : sms && r.duplicate
        ? { kind: 'result', tone: 'info', title: 'Already added', sub: 'This alert is in Khata already.' }
        : { kind: 'result', tone: 'warn', title: 'No account yet', sub: 'Open Khata and add an account first.' });
  }

  useEffect(() => {
    if (handled.has(key)) return;
    handled.add(key);
    const q = new URLSearchParams(search);

    if (window.top !== window.self) {
      setView({ kind: 'result', tone: 'warn', title: 'Not allowed here', sub: 'Quick add only works when opened directly, not inside another page.' });
      return;
    }
    const sp = smsParams(search, hash);
    if (!sp && !q.has('amount') && q.has('done')) {
      setView({ kind: 'result', tone: 'info', title: 'Done', sub: 'You can close this page.' });
      return;
    }

    const s = getSettings();
    const k = sp?.k ?? q.get('k');
    const shared = !!sp && !k && q.has('sms') && document.referrer === '';
    const trusted = (!!s.linkKey && k === s.linkKey) || shared;

    let p: Parsed | null;
    if (sp) {
      p = sp.text ? parseSms(sp.text, sp.from ?? q.get('from') ?? '') : null;
      if (!p) {
        markDone();
        setView({ kind: 'result', tone: 'info', title: 'Nothing to add', sub: "That message isn't a completed payment. OTPs, offers and failed payments are skipped." });
        return;
      }
      if (p.foreign) {
        markDone();
        setView({ kind: 'result', tone: 'warn', title: `${p.foreign} charge`, sub: 'Open Khata to enter the amount in your currency.', paste: sp.text });
        return;
      }
    } else {
      const res = linkFromParams(q, todayISO());
      if (!res.ok) {
        markDone();
        setView({ kind: 'result', tone: 'warn', title: res.title, sub: res.sub });
        return;
      }
      p = res.p;
    }

    const parsed = p;
    (async () => {
      const [r] = await resolve([parsed]);
      const isSms = !!sp;
      if (isSms && r.duplicate) {
        markDone();
        return setView({ kind: 'result', tone: 'info', title: 'Already added', sub: 'This alert is in Khata already.' });
      }
      if (trusted) return add(r, isSms);
      const [acc, cat] = await Promise.all([
        r.accountId ? db.accounts.get(r.accountId) : undefined,
        r.categoryId ? db.categories.get(r.categoryId) : undefined,
      ]);
      setView({ kind: 'confirm', r, sms: isSms, account: acc?.name, category: cat?.name });
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, search, hash]);

  let body: ReactNode;
  if (view.kind === 'loading') {
    body = <p className="t-body secondary" role="status">One moment…</p>;
  } else if (view.kind === 'confirm') {
    const { r } = view;
    body = (
      <>
        <span className="sb-symbol info"><CircleHelp size={56} strokeWidth={1.6} aria-hidden="true" /></span>
        <h1 className="t-title1">Add {money(r.amount, { force: true })} for {r.name}?</h1>
        <p className="t-subhead secondary">
          {r.type === 'income' ? 'Income' : 'Expense'} · {r.date === todayISO() ? 'Today' : r.date}
          {view.account ? ` · ${view.account}` : ''}{view.category ? ` · ${view.category}` : ''}
        </p>
        <p className="t-footnote tertiary">This link wasn't made in Khata, so it asks first.</p>
        <div className="sb-result-actions">
          <button type="button" className="btn filled lg block" disabled={busy} onClick={async () => { setBusy(true); await add(r, view.sms); setBusy(false); }}>Add</button>
          <button type="button" className="btn gray lg block" disabled={busy}
            onClick={() => (markDone(), setView({ kind: 'result', tone: 'info', title: 'Not added', sub: 'Nothing was recorded.' }))}>
            Cancel
          </button>
        </div>
      </>
    );
  } else {
    const Sym = view.tone === 'ok' ? CircleCheck : view.tone === 'warn' ? TriangleAlert : Info;
    body = (
      <>
        <span className={`sb-symbol ${view.tone}`}><Sym size={56} strokeWidth={1.6} aria-hidden="true" /></span>
        <h1 className="t-title1">{view.title}</h1>
        {view.sub && <p className="t-body secondary">{view.sub}</p>}
        <div className="sb-result-actions">
          {view.paste
            ? <Link className="btn filled lg block" to="/connect" state={{ paste: view.paste }}>Open Khata</Link>
            : <Link className="btn filled lg block" to="/">Open Khata</Link>}
        </div>
      </>
    );
  }

  return (
    <div className="sb-result" aria-live="polite">
      <div className="sb-result-card">{body}</div>
    </div>
  );
}
