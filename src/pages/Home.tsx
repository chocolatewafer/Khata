import type { CSSProperties, ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  ArrowDownLeft, ArrowDownRight, ArrowUpRight, ChevronRight, Download, Eye, EyeOff, Flame, HandCoins, Landmark, PiggyBank,
  Plus, Repeat, Settings, Split, Tags, Target, X, Zap, type LucideIcon,
} from 'lucide-react';
import { db, type Account, type Category, type Template, type Tx } from '../db';
import { balances, budgetStatus, totals } from '../lib/automation';
import { money, moneyShort, periodRange, setSettings, toISO, todayISO, useSettings } from '../lib/format';
import { PALETTE } from '../lib/icons';
import { promptInstall, useInstall } from '../lib/pwa';
import { TrendBars, type TrendPoint } from '../components/charts';
import { byNewest, TxList } from '../components/TxList';
import { actionSheet, haptic, IconTile, Money, Progress, Screen, useApp, useCountUp, useMediaQuery } from '../components/ui';
import '../styles/screens-a.css';

export function monthlyTrend(txs: Tx[], months = 6): TrendPoint[] {
  return Array.from({ length: months }, (_, i) => {
    const { start, end } = periodRange('monthly', new Date(), i - months + 1);
    const label = new Date(+start.slice(0, 4), +start.slice(5, 7) - 1, 1).toLocaleDateString(undefined, { month: 'short' });
    return { label, ...totals(txs, start, end) };
  });
}

/** Change against the previous period as a small pill; a rise in spending is the bad direction. */
export function Change({ now, before, goodWhenUp, onHero }: { now: number; before: number; goodWhenUp: boolean; onHero?: boolean }) {
  if (!before) return null;
  const pct = ((now - before) / before) * 100;
  const up = pct >= 0;
  const good = up === goodWhenUp;
  const Arrow = up ? ArrowUpRight : ArrowDownRight;
  const abs = Math.abs(pct);
  const text = abs >= 1000 ? '999+' : abs.toFixed(abs < 10 ? 1 : 0);
  return (
    <span className={`sa-change ${good ? 'good' : 'bad'} ${onHero ? 'on-hero' : ''}`} title={good ? 'Better than the period before' : 'Worse than the period before'}>
      <Arrow size={12} strokeWidth={2.6} aria-hidden="true" />
      <span className="sr">{up ? 'Up' : 'Down'}</span>
      {text}%
    </span>
  );
}

/** Consecutive days with at least one transaction, ending today (or yesterday, so the streak survives until tonight). */
function streak(txs: Tx[]) {
  const days = new Set(txs.map((t) => t.date));
  const d = new Date();
  if (!days.has(toISO(d))) d.setDate(d.getDate() - 1);
  let n = 0;
  while (days.has(toISO(d)) && n < 999) (n++, d.setDate(d.getDate() - 1));
  return n;
}

/** Records a saved quick pick for today, the same way the add sheet's quick picks do. */
async function recordPick(t: Template, accounts: Account[], toast: ReturnType<typeof useApp>['toast']) {
  const accountId = accounts.some((a) => a.id === t.accountId) ? t.accountId : accounts[0]?.id;
  if (accountId == null) return toast('Add an account first');
  const id = await db.txs.add({
    type: t.type, amount: t.amount, name: t.name, date: todayISO(), accountId, categoryId: t.categoryId, tagIds: [], source: 'manual',
  });
  haptic('success');
  toast(`${money(t.amount)} · ${t.name}`, { label: 'Undo', run: () => void db.txs.delete(id) });
}

function Tile({ to, icon: Icon, color, name, value, unit, foot }: {
  to: string; icon: LucideIcon; color: string; name: string; value: ReactNode; unit?: string; foot: ReactNode;
}) {
  return (
    <Link to={to} className="sa-tile" style={{ '--c': color } as CSSProperties}>
      <span className="sa-tile-head">
        <Icon size={17} strokeWidth={2.4} aria-hidden="true" />
        <span className="ellipsis">{name}</span>
        <ChevronRight className="sa-tile-chev" size={16} aria-hidden="true" />
      </span>
      <span className="sa-tile-value">
        <b className="rounded">{value}</b>
        {unit && <span className="secondary">{unit}</span>}
      </span>
      <span className="sa-tile-foot">{foot}</span>
    </Link>
  );
}

const longDate = (d = new Date()) =>
  `${d.toLocaleDateString(undefined, { weekday: 'long' })}, ${d.getDate()} ${d.toLocaleDateString(undefined, { month: 'long' })}`;

export function Home() {
  const s = useSettings();
  const { editTx, toast } = useApp();
  const install = useInstall();
  const desktop = useMediaQuery('(min-width: 1024px)');
  const accounts = useLiveQuery(() => db.accounts.toArray()) ?? [];
  const categories = useLiveQuery(() => db.categories.toArray()) ?? [];
  const txs = useLiveQuery(() => db.txs.toArray()) ?? [];
  const budgets = useLiveQuery(() => db.budgets.toArray()) ?? [];
  const recurring = useLiveQuery(() => db.recurring.toArray()) ?? [];
  const goals = useLiveQuery(() => db.goals.toArray()) ?? [];
  const loans = useLiveQuery(() => db.loans.toArray()) ?? [];
  const assets = useLiveQuery(() => db.assets.toArray()) ?? [];
  const splits = useLiveQuery(() => db.splits.toArray()) ?? [];
  const templates = useLiveQuery(() => db.templates.toArray()) ?? [];
  const tags = useLiveQuery(() => db.tags.count()) ?? 0;

  const total = [...balances(accounts, txs).values()].reduce((t, v) => t + v, 0);
  const shown = useCountUp(total);
  const month = periodRange('monthly');
  const prev = periodRange('monthly', new Date(), -1);
  const m = totals(txs, month.start, month.end);
  const p = totals(txs, prev.start, prev.end);
  const today = todayISO();
  const todays = txs.filter((x) => x.date === today);
  const spentToday = todays.reduce((t, x) => (x.type === 'expense' ? t + x.amount : t), 0);

  const status = budgets.map((b) => ({ b, ...budgetStatus(b, txs) }));
  const bSpent = status.reduce((t, x) => t + x.spent, 0);
  const bLimit = status.reduce((t, x) => t + x.limit, 0);
  const over = status.filter((x) => x.left < 0).length;
  const topBudgets = [...status].sort((a, b) => b.spent / (b.limit || 1) - a.spent / (a.limit || 1)).slice(0, 3);
  const active = recurring.filter((r) => r.active);
  const dueSoon = active.filter((r) => r.nextDate <= month.end).length;
  const left = (l: (typeof loans)[number]) => l.amount - l.payments.reduce((t, x) => t + x.amount, 0);
  const openLoans = loans.filter((l) => left(l) > 0);
  const overdue = openLoans.filter((l) => l.dueDate && l.dueDate < today).length;
  const saved = goals.reduce((t, g) => t + g.contributions.reduce((a, c) => a + c.amount, 0), 0);
  const auto = txs.filter((t) => t.source === 'sms' || t.source === 'csv' || t.source === 'link').length;
  const linked = accounts.filter((a) => a.provider || a.last4).length;
  const openSplits = splits.filter((x) => x.parts.some((y) => y.name !== x.paidBy && !y.settled)).length;
  const days = streak(txs);
  const cat = new Map<number, Category>(categories.map((c) => [c.id, c]));
  const picks = templates.filter((t) => t.type !== 'transfer');

  const attention: { text: string; to: string }[] = [];
  if (over) attention.push({ text: `${over} budget${over > 1 ? 's' : ''} over`, to: '/budgets' });
  if (overdue) attention.push({ text: `${overdue} loan${overdue > 1 ? 's' : ''} overdue`, to: '/loans' });
  if (dueSoon) attention.push({ text: `${dueSoon} recurring due`, to: '/recurring' });

  const showInstall = (install === 'prompt' || install === 'ios') && !s.installDismissed && txs.length > 0;

  const removePick = async (t: Template) => {
    const v = await actionSheet({ title: t.name, actions: [{ label: 'Remove quick pick', value: 'del', destructive: true }] });
    if (v !== 'del') return;
    await db.templates.delete(t.id);
    toast(`Removed “${t.name}”`, { label: 'Undo', run: () => void db.templates.add(t) });
  };

  const statusLine = (
    <p className="sa-status t-subhead secondary">
      {spentToday > 0 ? (
        <>You've spent <Money value={spentToday} className="sa-status-amt" /> today</>
      ) : todays.length ? (
        <>Nothing spent today</>
      ) : (
        <>Nothing logged yet today</>
      )}
      {attention.length ? (
        attention.map((a) => (
          <span key={a.to}>
            <span className="sa-dot" aria-hidden="true"> · </span>
            <Link to={a.to} className="sa-attn">{a.text}</Link>
          </span>
        ))
      ) : (
        <span><span className="sa-dot" aria-hidden="true"> · </span>all caught up</span>
      )}
    </p>
  );

  const hero = (
    <section className="hero sa-hero" aria-label="Balance">
      <div className="sa-hero-top">
        <span className="label">Total balance</span>
        <button className="icon-btn" aria-label={s.hide ? 'Show amounts' : 'Hide amounts'} onClick={() => setSettings({ hide: !s.hide })}>
          {s.hide ? <Eye size={22} /> : <EyeOff size={22} />}
        </button>
      </div>
      <div className="sa-hero-big">{s.hide ? <span aria-label="Hidden">••••</span> : money(shown)}</div>
      <div className="sa-hero-month">
        <div className="sa-hero-label">This month</div>
        <div className="sa-hero-cols">
          <div className="sa-hero-stat">
            <span className="sa-hero-ic" aria-hidden="true"><ArrowDownLeft size={15} strokeWidth={2.6} /></span>
            <div className="sa-hero-txt">
              <small>Income</small>
              <span className="sa-hero-v">{money(m.income)}</span>
              <span className="sa-hero-cmp">
                <Change now={m.income} before={p.income} goodWhenUp onHero />
                {!p.income && <span>Nothing last month</span>}
              </span>
            </div>
          </div>
          <div className="sa-hero-stat">
            <span className="sa-hero-ic" aria-hidden="true"><ArrowUpRight size={15} strokeWidth={2.6} /></span>
            <div className="sa-hero-txt">
              <small>Expense</small>
              <span className="sa-hero-v">{money(m.expense)}</span>
              <span className="sa-hero-cmp">
                <Change now={m.expense} before={p.expense} goodWhenUp={false} onHero />
                {!p.expense && <span>Nothing last month</span>}
              </span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );

  const todayCard = (
    <section className="card sa-today" aria-labelledby="sa-today-h">
      <div className="sa-today-top">
        <div className="sa-today-spent">
          <h2 id="sa-today-h" className="t-footnote secondary strong-2">Spent today</h2>
          <Money value={spentToday} size="xl" />
        </div>
        <div className={`sa-streak ${days >= 2 ? 'on' : ''}`} title="Days in a row with something logged">
          <Flame size={18} strokeWidth={2.4} aria-hidden="true" />
          <span>
            <b className="rounded">{days}</b> day{days === 1 ? '' : 's'}
            <span className="sa-streak-l">streak</span>
          </span>
        </div>
      </div>
      <div className="sa-picks" role="group" aria-label="Quick picks">
        <button type="button" className="sa-pick sa-pick-add" onClick={() => editTx({})}>
          <span className="sa-pick-plus" aria-hidden="true"><Plus size={18} strokeWidth={2.6} /></span>
          <span>Add</span>
        </button>
        {picks.map((t) => {
          const c = t.categoryId != null ? cat.get(t.categoryId) : undefined;
          return (
            <button type="button" key={t.id} className="sa-pick" onClick={() => recordPick(t, accounts, toast)}
              onContextMenu={(e) => (e.preventDefault(), removePick(t))}
              aria-label={`Record ${t.name}, ${money(t.amount)}`}>
              <IconTile name={c?.icon ?? (t.type === 'income' ? 'banknote' : 'circle-ellipsis')} color={c?.color ?? PALETTE.gray} size="sm" />
              <span className="sa-pick-name">{t.name}</span>
              <span className="sa-pick-amt rounded">{moneyShort(t.amount)}</span>
            </button>
          );
        })}
      </div>
      {!picks.length && <p className="t-footnote tertiary sa-picks-hint">Save a quick pick from the add sheet to log it here in one tap.</p>}
    </section>
  );

  const budgetsGlance = topBudgets.length > 0 && (
    <section className="sa-section" aria-labelledby="sa-budgets-h">
      <div className="list-header"><span id="sa-budgets-h">Budgets</span><Link to="/budgets">See all</Link></div>
      <div className="list sa-budgets">
        {topBudgets.map(({ b, spent, limit, left: l }) => (
          <Link to="/budgets" key={b.id} className="sa-budget">
            <span className="sa-budget-top">
              <span className="ellipsis t-headline">{b.name}</span>
              <span className={`t-footnote ${l < 0 ? 'neg' : 'secondary'}`}>
                {l < 0 ? <><Money value={-l} sign={false} /> over</> : <><Money value={l} sign={false} /> left</>}
              </span>
            </span>
            <Progress value={spent} max={limit} warn />
            <span className="t-footnote tertiary"><Money value={spent} sign={false} /> of <Money value={limit} sign={false} /></span>
          </Link>
        ))}
      </div>
    </section>
  );

  const tiles = (
    <section className="sa-section" aria-labelledby="sa-overview-h">
      <div className="list-header"><span id="sa-overview-h">Overview</span></div>
      <div className="sa-tiles-wrap">
        <div className="sa-tiles rise">
          <Tile to="/budgets" icon={PiggyBank} color={PALETTE.orange} name="Budgets"
            value={bLimit ? `${Math.round((bSpent / bLimit) * 100)}%` : budgets.length || 'None'} unit={bLimit ? 'used' : undefined}
            foot={bLimit ? `${budgets.length} budget${budgets.length === 1 ? '' : 's'} this period` : 'Set a spending limit'} />
          <Tile to="/connect" icon={Zap} color={PALETTE.blue} name="Banks & SMS" value={linked} unit="linked"
            foot={auto ? `${auto} auto-added` : linked ? 'Paste or forward alerts' : 'Link a bank or wallet'} />
          <Tile to="/recurring" icon={Repeat} color={PALETTE.indigo} name="Recurring" value={active.length} unit="active"
            foot={dueSoon ? `${dueSoon} due this month` : 'Nothing due this month'} />
          <Tile to="/goals" icon={Target} color={PALETTE.green} name="Goals" value={moneyShort(saved)} unit="saved"
            foot={goals.length ? `${goals.length} goal${goals.length === 1 ? '' : 's'}` : 'Start saving for something'} />
          <Tile to="/loans" icon={HandCoins} color={PALETTE.pink} name="Loans" value={openLoans.length} unit="open"
            foot={overdue ? `${overdue} overdue` : 'Nothing overdue'} />
          <Tile to="/split" icon={Split} color={PALETTE.teal} name="Bill Splitter" value={openSplits} unit="open"
            foot={`${splits.length} bill${splits.length === 1 ? '' : 's'} in total`} />
          <Tile to="/assets" icon={Landmark} color={PALETTE.brown} name="Assets" value={moneyShort(assets.reduce((t, a) => t + a.value, 0))}
            foot={`${assets.length} asset${assets.length === 1 ? '' : 's'}`} />
          <Tile to="/tags" icon={Tags} color={PALETTE.purple} name="Labels" value={tags} unit={tags === 1 ? 'label' : 'labels'}
            foot="Labels, people, places" />
        </div>
      </div>
    </section>
  );

  const trend = (
    <section className="sa-section" aria-labelledby="sa-trend-h">
      <div className="list-header"><span id="sa-trend-h">Trend</span><span className="t-footnote">Last 6 months</span></div>
      <div className="card"><TrendBars data={monthlyTrend(txs)} /></div>
    </section>
  );

  const recent = (
    <section className="sa-section" aria-labelledby="sa-recent-h">
      <div className="list-header"><span id="sa-recent-h">Recent</span>{txs.length > 0 && <Link to="/search">See all</Link>}</div>
      <TxList txs={[...txs].sort(byNewest).slice(0, 8)} accounts={accounts} categories={categories} />
    </section>
  );

  return (
    <div className="stack sa-home">
      <Screen title="Summary" subtitle={longDate()}
        actions={<Link to="/settings" className="nav-btn hide-desktop" aria-label="Preferences"><Settings size={22} /></Link>} />
      {statusLine}

      {showInstall && (
        <div className="banner rise">
          <Download size={22} color="var(--accent)" style={{ flex: 'none' }} aria-hidden="true" />
          <div className="body">
            <b>Install Khata</b>
            <div className="t-footnote secondary">{install === 'ios' ? 'Tap Share, then “Add to Home Screen”.' : 'One tap away, works offline.'}</div>
          </div>
          {install === 'prompt' && <button className="btn filled sm" onClick={promptInstall}>Install</button>}
          <button className="icon-btn" aria-label="Dismiss" onClick={() => setSettings({ installDismissed: true })}><X size={18} /></button>
        </div>
      )}

      {desktop ? (
        <div className="sa-home-grid">
          <div className="sa-col">{hero}{todayCard}{tiles}{trend}</div>
          <div className="sa-col">{budgetsGlance}{recent}</div>
        </div>
      ) : (
        <div className="sa-col">{hero}{todayCard}{budgetsGlance}{tiles}{trend}{recent}</div>
      )}

      <p className="sa-credit t-footnote tertiary">
        <Link to="/about">Khata · made by @chocolatewafer</Link>
      </p>
    </div>
  );
}
