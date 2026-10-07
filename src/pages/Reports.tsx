import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { CalendarRange, Check, Download, Printer, X } from 'lucide-react';
import { db, type Tx } from '../db';
import { totals } from '../lib/automation';
import { fromISO, money, periodRange, toISO, todayISO } from '../lib/format';
import { PALETTE } from '../lib/icons';
import { Breakdown, TrendBars, type TrendPoint } from '../components/charts';
import { byNewest, TxList } from '../components/TxList';
import { haptic, IconTile, List, Money, Row, Screen, Segmented, Sheet, useFab } from '../components/ui';
import { Change } from './Home';
import { accountIcon, exportCsv, monthLabel, MonthGrid } from './Transactions';
import '../styles/screens-a.css';

// months for long ranges, weeks for short ones
function buckets(txs: Tx[], start: string, end: string): TrendPoint[] {
  const out: TrendPoint[] = [];
  const s = fromISO(start);
  const e = fromISO(end);
  const monthly = (e.getTime() - s.getTime()) / 864e5 > 45;
  for (let cur = new Date(s), n = 0; cur <= e && n < 24; n++) {
    const next = monthly ? new Date(cur.getFullYear(), cur.getMonth() + 1, 1) : new Date(cur.getFullYear(), cur.getMonth(), cur.getDate() + 7);
    const last = new Date(Math.min(next.getTime() - 864e5, e.getTime()));
    out.push({
      label: cur.toLocaleDateString(undefined, monthly ? { month: 'short' } : { day: 'numeric', month: 'short' }),
      ...totals(txs, toISO(cur), toISO(last)),
    });
    cur = next;
  }
  return out;
}

/** A report period: one calendar month ("2026-10") or one calendar year ("2026"). */
type Period = string;
const isYear = (p: Period) => p.length === 4;
function rangeOf(p: Period, back = 0) {
  if (isYear(p)) return periodRange('yearly', new Date(+p, 0, 1), -back);
  return periodRange('monthly', new Date(+p.slice(0, 4), +p.slice(5, 7) - 1, 1), -back);
}
const thisMonth = () => todayISO().slice(0, 7);
const thisYear = () => todayISO().slice(0, 4);
const periodTitle = (p: Period) => (isYear(p) ? (p === thisYear() ? 'This year' : p) : monthLabel(p, true));

const STRIP_MONTHS = 24;

export function Reports() {
  const accounts = useLiveQuery(() => db.accounts.toArray()) ?? [];
  const categories = useLiveQuery(() => db.categories.toArray()) ?? [];
  const tags = useLiveQuery(() => db.tags.toArray()) ?? [];
  const all = useLiveQuery(() => db.txs.toArray()) ?? [];
  const [period, setPeriod] = useState<Period>(thisMonth);
  const [account, setAccount] = useState('');
  const [kind, setKind] = useState<'expense' | 'income'>('expense');
  const [excluded, setExcluded] = useState<number[]>([]);
  const [filtering, setFiltering] = useState(false);
  const [custom, setCustom] = useState(false);
  useFab(() => setFiltering(true), 'filter');

  const { start, end } = rangeOf(period);
  const before = rangeOf(period, 1);
  const keep = (t: Tx) => t.type !== 'transfer' && (!account || t.accountId === +account) && !(t.categoryId && excluded.includes(t.categoryId));
  const txs = all.filter((t) => t.date >= start && t.date <= end && keep(t)).sort(byNewest);
  const sum = totals(txs, start, end);
  const prev = totals(all.filter(keep), before.start, before.end);
  const net = sum.income - sum.expense;
  const ofKind = txs.filter((t) => t.type === kind);
  const catById = new Map(categories.map((c) => [c.id, c]));
  const accById = new Map(accounts.map((a) => [a.id, a]));

  const sumBy = <K,>(list: Tx[], key: (t: Tx) => K[]) => {
    const m = new Map<K, number>();
    for (const t of list) for (const k of key(t)) if (k != null) m.set(k, (m.get(k) ?? 0) + t.amount);
    return m;
  };
  const catRows = [...sumBy(ofKind, (t) => [t.categoryId ?? 0])].map(([id, value]) => {
    const c = catById.get(id);
    return { name: c?.name ?? 'No category', value, icon: c?.icon ?? 'tag', color: c?.color ?? PALETTE.gray };
  });
  const accRows = [...sumBy(ofKind, (t) => [t.accountId])].map(([id, value]) => {
    const a = accById.get(id);
    return { name: a?.name ?? 'Deleted account', value, icon: a ? accountIcon(a) : 'wallet', color: a?.color ?? PALETTE.gray };
  });
  const tagRows = (k: 'label' | 'person' | 'place') =>
    [...sumBy(ofKind, (t) => t.tagIds.filter((id) => tags.find((x) => x.id === id)?.kind === k))].map(([id, value]) => ({
      name: tags.find((x) => x.id === id)?.name ?? '', value,
    }));

  const expenses = txs.filter((t) => t.type === 'expense');
  const today = todayISO();
  const lastDay = end < today ? end : today < start ? start : today;
  const days = Math.max(1, Math.round((fromISO(lastDay).getTime() - fromISO(start).getTime()) / 864e5) + 1);
  const byCat = sumBy(expenses, (t) => [t.categoryId ?? 0]);
  const top = [...byCat].sort((a, b) => b[1] - a[1])[0];
  const topCat = top ? catById.get(top[0]) : undefined;
  const largest = [...expenses].sort((a, b) => b.amount - a.amount)[0];
  const largestCat = largest?.categoryId != null ? catById.get(largest.categoryId) : undefined;
  const rate = sum.income > 0 ? Math.round((net / sum.income) * 100) : null;

  const months = Array.from({ length: STRIP_MONTHS }, (_, i) => {
    const d = new Date(new Date().getFullYear(), new Date().getMonth() - i, 1);
    return toISO(d).slice(0, 7);
  });
  const inStrip = period === thisYear() || months.includes(period);
  const minYear = Math.min(new Date().getFullYear() - 1, ...all.map((t) => +t.date.slice(0, 4)).filter((y) => y > 1999));
  const filters = (account ? 1 : 0) + excluded.length;

  // keep the selected chip in view
  const strip = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = strip.current?.querySelector<HTMLElement>('[aria-pressed="true"]');
    el?.scrollIntoView?.({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
  }, [period]);

  const pick = (p: Period) => (haptic(), setPeriod(p));
  const csvName = `khata-${period}.csv`;
  const title = periodTitle(period);

  return (
    <div className="stack sa-reports">
      <Screen title="Reports"
        actions={
          <>
            <button className="nav-btn" aria-label="Export CSV" title="Export CSV" disabled={!txs.length} onClick={() => exportCsv(txs, accounts, categories, tags, csvName)}><Download size={22} /></button>
            <button className="nav-btn" aria-label="Print or save as PDF" title="Print or save as PDF" onClick={() => window.print()}><Printer size={22} /></button>
          </>
        } />

      <div className="sa-print-only sa-print-head">
        <b>Khata report · {title}</b>
        <span>{fromISO(start).toLocaleDateString()} – {fromISO(end).toLocaleDateString()}</span>
      </div>

      <div className="sa-periods no-print">
        <div className="sa-strip" ref={strip} role="group" aria-label="Period">
          {!inStrip && (
            <button type="button" className="chip on" aria-pressed="true" onClick={() => setCustom(true)}>{periodTitle(period)}</button>
          )}
          <button type="button" className="chip" aria-pressed={period === thisYear()} onClick={() => pick(thisYear())}>This year</button>
          {months.map((ym) => (
            <button type="button" key={ym} className="chip" aria-pressed={period === ym} onClick={() => pick(ym)}>{monthLabel(ym)}</button>
          ))}
        </div>
        <button type="button" className="chip sa-custom" onClick={() => setCustom(true)} aria-haspopup="dialog">
          <CalendarRange size={16} strokeWidth={2.4} aria-hidden="true" />
          <span>Custom…</span>
        </button>
      </div>

      {filters > 0 && (
        <div className="sa-filterbar no-print">
          <span className="t-footnote secondary">
            Filtered{account ? ` · ${accById.get(+account)?.name ?? 'Account'}` : ''}{excluded.length ? ` · ${excluded.length} categor${excluded.length === 1 ? 'y' : 'ies'} left out` : ''}
          </span>
          <button type="button" className="btn plain sm" onClick={() => (setAccount(''), setExcluded([]))}>
            <X size={14} strokeWidth={2.6} aria-hidden="true" /> Clear
          </button>
        </div>
      )}

      <section className="card sa-net" aria-label={`Net for ${title}`}>
        <div className="sa-net-top">
          <span className="t-footnote secondary strong-2">Net · {title}</span>
          <Money value={net} kind={net < 0 ? 'expense' : 'income'} size="xl" />
        </div>
        <div className="sa-net-cols">
          <div className="sa-net-stat inc">
            <span className="t-footnote secondary"><i className="sa-key inc" aria-hidden="true" />Income</span>
            <Money value={sum.income} className="sa-net-v" />
            <span className="sa-net-cmp t-caption secondary">
              <Change now={sum.income} before={prev.income} goodWhenUp />
              <span>{prev.income ? `was ${money(prev.income)}` : 'Nothing the period before'}</span>
            </span>
          </div>
          <div className="sa-net-stat exp">
            <span className="t-footnote secondary"><i className="sa-key exp" aria-hidden="true" />Expense</span>
            <Money value={sum.expense} className="sa-net-v" />
            <span className="sa-net-cmp t-caption secondary">
              <Change now={sum.expense} before={prev.expense} goodWhenUp={false} />
              <span>{prev.expense ? `was ${money(prev.expense)}` : 'Nothing the period before'}</span>
            </span>
          </div>
        </div>
      </section>

      <section className="sa-section" aria-labelledby="sa-ins-h">
        <div className="list-header"><span id="sa-ins-h">Quick insights</span></div>
        <div className="sa-ins-wrap">
          <div className="sa-insights">
            <Insight icon="piggy-bank" color={PALETTE.green} label="Savings rate" value={rate == null ? '–' : `${rate}%`} bad={rate != null && rate < 0} />
            <Insight icon="calendar" color={PALETTE.orange} label="Avg. daily spend" value={money(Math.round(sum.expense / days))} />
            <Insight icon="receipt" color={PALETTE.blue} label="Transactions" value={String(txs.length)} />
            <Insight icon={topCat?.icon ?? 'tag'} color={topCat?.color ?? PALETTE.gray} label="Top category"
              value={top ? (topCat?.name ?? 'No category') : '–'} sub={top && sum.expense ? `${Math.round((top[1] / sum.expense) * 100)}% of spending` : undefined} />
            <Insight icon={largestCat?.icon ?? 'trending-up'} color={largestCat?.color ?? PALETTE.red} label="Largest expense" wide
              value={largest ? largest.name : '–'} sub={largest ? `${money(largest.amount)} · ${fromISO(largest.date).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}` : undefined} />
          </div>
        </div>
      </section>

      <section className="sa-section" aria-labelledby="sa-ive-h">
        <div className="list-header"><span id="sa-ive-h">Income vs expense</span><span className="t-footnote">{isYear(period) ? 'By month' : 'By week'}</span></div>
        <div className="card"><TrendBars data={buckets(txs, start, end)} /></div>
      </section>

      <div className="sa-report-grid">
        <section className="sa-section" aria-labelledby="sa-cat-h">
          <div className="list-header sa-cat-head">
            <span id="sa-cat-h">Categories</span>
            <span className="no-print"><Segmented size="sm" block={false} value={kind} options={[['expense', 'Expense'], ['income', 'Income']] as const} onChange={setKind} aria-label="Breakdown type" /></span>
          </div>
          <div className="card"><Breakdown rows={catRows} empty={`No ${kind === 'expense' ? 'expenses' : 'income'} in this period.`} /></div>
        </section>
        <section className="sa-section" aria-labelledby="sa-acc-h">
          <div className="list-header"><span id="sa-acc-h">By account</span><span className="t-footnote">{kind === 'expense' ? 'Expenses' : 'Income'}</span></div>
          <div className="card"><Breakdown rows={accRows} empty={`No ${kind === 'expense' ? 'expenses' : 'income'} in this period.`} /></div>
        </section>
        {(['label', 'person', 'place'] as const).map((k) => {
          const rows = tagRows(k);
          return rows.length ? (
            <section className="sa-section" key={k}>
              <div className="list-header"><span>By {k}</span><span className="t-footnote">{kind === 'expense' ? 'Expenses' : 'Income'}</span></div>
              <div className="card"><Breakdown rows={rows} /></div>
            </section>
          ) : null;
        })}
      </div>

      <section className="sa-section no-print" aria-labelledby="sa-tx-h">
        <div className="list-header">
          <span id="sa-tx-h">Transactions · {txs.length}</span>
          {txs.length > 0 && <Link to={isYear(period) ? '/search' : `/search?month=${period}`}>See all</Link>}
        </div>
        <TxList txs={txs.slice(0, 20)} accounts={accounts} categories={categories} empty="Nothing in this period" />
      </section>

      <section className="sa-print-only">
        <h2 className="t-headline">Transactions ({txs.length})</h2>
        <table className="sa-table">
          <thead>
            <tr><th>Date</th><th>Name</th><th>Category</th><th>Account</th><th className="r">Amount</th></tr>
          </thead>
          <tbody>
            {txs.slice(0, 1000).map((t) => (
              <tr key={t.id}>
                <td className="nw">{t.date}</td>
                <td>{t.name}</td>
                <td>{t.categoryId ? catById.get(t.categoryId)?.name : ''}</td>
                <td>{accById.get(t.accountId)?.name}</td>
                <td className="r num nw">{t.type === 'income' ? '+' : '−'}{money(t.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {custom && <PeriodSheet period={period} minYear={minYear} onPick={(p) => (pick(p), setCustom(false))} onClose={() => setCustom(false)} />}

      {filtering && (
        <Sheet title="Filter report" onClose={() => setFiltering(false)}
          footer={
            <div className="sa-sheet-foot">
              <button className="btn gray lg" onClick={() => (setAccount(''), setExcluded([]))} disabled={!filters}>Reset</button>
              <button className="btn filled lg" onClick={() => setFiltering(false)}>Done</button>
            </div>
          }>
          <div className="stack">
            <List header="Account">
              <Row icon="wallet" color={PALETTE.gray} title="All accounts" accessory="none" onClick={() => setAccount('')}
                value={!account ? <Check className="accent" size={20} strokeWidth={2.6} aria-label="Selected" /> : undefined} />
              {accounts.map((a) => (
                <Row key={a.id} icon={accountIcon(a)} color={a.color} title={a.name} accessory="none" onClick={() => setAccount(String(a.id))}
                  value={account === String(a.id) ? <Check className="accent" size={20} strokeWidth={2.6} aria-label="Selected" /> : undefined} />
              ))}
            </List>
            <section>
              <div className="list-header">
                <span>Categories included</span>
                {excluded.length > 0 && <button type="button" onClick={() => setExcluded([])}>Include all</button>}
              </div>
              <div className="chips sa-catchips">
                {categories.map((c) => {
                  const off = excluded.includes(c.id);
                  return (
                    <button type="button" key={c.id} className={`chip sa-catchip ${off ? 'off' : ''}`} aria-pressed={!off}
                      onClick={() => setExcluded(off ? excluded.filter((x) => x !== c.id) : [...excluded, c.id])}>
                      <IconTile name={c.icon} color={off ? undefined : c.color} size="sm" />
                      {c.name}
                    </button>
                  );
                })}
              </div>
              <p className="list-footer">Tap a category to leave it out of this report.</p>
            </section>
          </div>
        </Sheet>
      )}
    </div>
  );
}

function PeriodSheet({ period, minYear, onPick, onClose }: { period: Period; minYear: number; onPick: (p: Period) => void; onClose: () => void }) {
  const [mode, setMode] = useState<'month' | 'year'>(isYear(period) ? 'year' : 'month');
  const [year, setYear] = useState(+period.slice(0, 4));
  const maxYear = new Date().getFullYear();
  const years = Array.from({ length: maxYear - minYear + 1 }, (_, i) => String(maxYear - i));
  return (
    <Sheet title="Choose a period" onClose={onClose} size="sm">
      <div className="stack">
        <Segmented value={mode} options={[['month', 'Month'], ['year', 'Year']] as const} onChange={setMode} aria-label="Period type" />
        {mode === 'month' ? (
          <MonthGrid year={year} setYear={setYear} minYear={minYear} selected={isYear(period) ? undefined : period} onPick={onPick} />
        ) : (
          <div className="sa-years">
            {years.map((y) => (
              <button type="button" key={y} className={`sa-month ${period === y ? 'on' : ''}`} aria-pressed={period === y} onClick={() => onPick(y)}>{y}</button>
            ))}
          </div>
        )}
      </div>
    </Sheet>
  );
}

function Insight({ icon, color, label, value, sub, bad, wide }: { icon: string; color: string; label: string; value: string; sub?: string; bad?: boolean; wide?: boolean }) {
  return (
    <div className={`sa-insight ${wide ? 'wide' : ''}`}>
      <IconTile name={icon} color={color} size="md" />
      <div className="sa-insight-txt">
        <span className="t-footnote secondary">{label}</span>
        <b className={`ellipsis ${bad ? 'neg' : ''}`}>{value}</b>
        {sub && <span className="t-caption tertiary ellipsis">{sub}</span>}
      </div>
    </div>
  );
}
