import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { ArrowDownLeft, ArrowUpRight, Check, MapPin, Settings, Trash2, User } from 'lucide-react';
import { db, TABLES, type Account, type Asset, type Category, type Goal, type Loan, type Recurring, type Split, type Tag, type Tx } from '../db';
import { balances, processRecurring, totals } from '../lib/automation';
import { fromISO, getSettings, money, periodRange, prettyDate, setSettings, todayISO, useSettings } from '../lib/format';
import { ACCOUNT_ICONS, PALETTE } from '../lib/icons';
import {
  actionSheet, AmountPrompt, confirm, DockSeg, EntityManager, Field, IconTile, List, Money, Row, Screen, Segmented, Sheet, Switch, tintFor, useApp, useFab,
  Empty,
} from '../components/ui';
import { checkAlerts, enableNotifications, notificationsSupported, permission, show } from '../lib/notify';
import { promptInstall, useInstall } from '../lib/pwa';
import { monogram } from '../lib/providers';
import { PERIODS } from './Budgets';
import { download } from './download';
import '../styles/screens-b.css';

const sum = (list: { amount: number }[]) => list.reduce((s, x) => s + x.amount, 0);
const daysUntil = (iso: string) => Math.round((fromISO(iso).getTime() - fromISO(todayISO()).getTime()) / 864e5);
const dueBadge = (iso?: string) => {
  if (!iso) return undefined;
  const d = daysUntil(iso);
  return d < 0 ? 'Overdue' : d === 0 ? 'Due today' : d === 1 ? 'Tomorrow' : `${d} days left`;
};
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

const PrefsLink = () => (
  <Link to="/settings" className="nav-btn hide-desktop" aria-label="Preferences"><Settings size={22} /></Link>
);

/* ---------------------------------------------------------------- Accounts */

const KIND_LABEL: Record<Account['kind'], string> = { bank: 'Bank', cash: 'Cash', card: 'Credit card', wallet: 'Wallet' };

/** Asks what to do with an account's transactions and recurring items, then deletes it. Never leaves orphans. */
async function deleteAccount(a: Account, toast: (m: string) => void) {
  const [txIds, recIds, tplIds, others] = await Promise.all([
    db.txs.filter((t) => t.accountId === a.id || t.toAccountId === a.id).primaryKeys(),
    db.recurring.filter((r) => r.accountId === a.id).primaryKeys(),
    db.templates.filter((t) => t.accountId === a.id).primaryKeys(),
    db.accounts.filter((x) => x.id !== a.id).toArray(),
  ]);
  const n = txIds.length;
  const r = recIds.length;
  const forgetLast = () => getSettings().lastAccountId === a.id && setSettings({ lastAccountId: undefined });

  if (!n && !r) {
    const ok = await confirm({ title: `Delete “${a.name}”?`, message: 'It has no transactions. This can’t be undone.', confirmLabel: 'Delete', destructive: true });
    if (!ok) return false;
    await db.transaction('rw', db.accounts, db.templates, async () => {
      await db.templates.bulkDelete(tplIds);
      await db.accounts.delete(a.id);
    });
    forgetLast();
    toast(`Deleted “${a.name}”`);
    return true;
  }

  const what = [n && plural(n, 'transaction'), r && plural(r, 'recurring item')].filter(Boolean).join(' and ');
  const choice = await actionSheet<'move' | 'delete'>({
    title: `“${a.name}” has ${what}`,
    message: others.length ? 'Move them to another account, or delete them with the account.' : 'This is your only account, so they can only be deleted with it.',
    actions: [
      { label: n ? `Move ${plural(n, 'transaction')} to…` : 'Move recurring items to…', value: 'move', disabled: !others.length },
      { label: n ? `Delete account and its ${plural(n, 'transaction')}` : 'Delete account and its recurring items', value: 'delete', destructive: true },
    ],
  });
  if (!choice) return false;

  if (choice === 'move') {
    const target = await actionSheet<number>({
      title: `Move to which account?`,
      actions: others.map((o) => ({ label: o.name, value: o.id })),
    });
    if (target == null) return false;
    await db.transaction('rw', [db.accounts, db.txs, db.recurring, db.templates], async () => {
      await db.txs.where('id').anyOf(txIds).modify((t: Tx) => {
        if (t.accountId === a.id) t.accountId = target;
        if (t.toAccountId === a.id) t.toAccountId = target;
      });
      await db.recurring.where('id').anyOf(recIds).modify({ accountId: target });
      await db.templates.where('id').anyOf(tplIds).modify({ accountId: target });
      await db.accounts.delete(a.id);
    });
    forgetLast();
    toast(`Moved to ${others.find((o) => o.id === target)?.name} and deleted “${a.name}”`);
    return true;
  }

  const sure = await confirm({
    title: `Delete “${a.name}” and ${what}?`,
    message: 'Transfers to or from it are deleted too. This can’t be undone.',
    confirmLabel: 'Delete all',
    destructive: true,
  });
  if (!sure) return false;
  await db.transaction('rw', [db.accounts, db.txs, db.recurring, db.templates], async () => {
    await db.txs.bulkDelete(txIds);
    await db.recurring.bulkDelete(recIds);
    await db.templates.bulkDelete(tplIds);
    await db.accounts.delete(a.id);
  });
  forgetLast();
  toast(`Deleted “${a.name}” and ${what}`);
  return true;
}

export function Accounts() {
  const { toast } = useApp();
  const txs = useLiveQuery(() => db.txs.toArray()) ?? [];
  const accounts = useLiveQuery(() => db.accounts.toArray());
  const bal = balances(accounts ?? [], txs);
  const month = periodRange('monthly');
  const net = [...bal.values()].reduce((s, v) => s + v, 0);
  const m = totals(txs, month.start, month.end);
  return (
    <Screen title="Accounts" actions={<PrefsLink />} className="sb">
      <section className="card sb-summary" aria-label="Net worth">
        <span className="t-footnote secondary">Net worth</span>
        <Money value={net} size="xl" sign={false} className={net < 0 ? 'neg' : ''} />
        <div className="sb-summary-cols">
          <div><span className="t-caption secondary">In this month</span><Money value={m.income} kind="income" size="sm" /></div>
          <div><span className="t-caption secondary">Out this month</span><Money value={m.expense} kind="expense" size="sm" /></div>
          <div><span className="t-caption secondary">Accounts</span><b className="t-headline num">{accounts?.length ?? 0}</b></div>
        </div>
      </section>
      <List footer="eSewa, Khalti, Nabil, HDFC, SBI, Paytm and more. Their SMS alerts then file themselves.">
        <Row icon="zap" color={PALETTE.orange} title="Link a bank or wallet" to="/connect" />
      </List>
      <EntityManager<Account>
        noun="account"
        table={db.accounts}
        blank={{ name: '', kind: 'bank', opening: 0, color: PALETTE.blue }}
        fields={[
          { key: 'name', label: 'Name', type: 'text', placeholder: 'e.g. Salary account' },
          { key: 'kind', label: 'Type', type: 'select', options: (Object.keys(KIND_LABEL) as Account['kind'][]).map((k) => ({ value: k, label: KIND_LABEL[k] })) },
          { key: 'opening', label: 'Opening balance', type: 'number', hint: 'Use a negative number for money owed, like a card balance.' },
          { key: 'last4', label: 'Last 4 digits', type: 'text', optional: true, placeholder: '1234', hint: 'Matches bank SMS to this account.' },
          { key: 'color', label: 'Colour', type: 'swatch' },
        ]}
        onDelete={(a) => deleteAccount(a, toast)}
        row={(a) => {
          const mine = txs.filter((t) => t.accountId === a.id || t.toAccountId === a.id);
          const mm = totals(mine.filter((t) => t.accountId === a.id), month.start, month.end);
          const b = bal.get(a.id) ?? 0;
          return {
            ...(a.provider ? { monogram: monogram(a.name) } : { icon: ACCOUNT_ICONS[a.kind] ?? 'wallet' }),
            color: a.color,
            title: a.name,
            tags: [KIND_LABEL[a.kind] ?? a.kind, plural(mine.length, 'transaction')],
            badge: a.last4 ? `Ending ${a.last4}` : undefined,
            cols: [['Balance', <Money key="b" value={b} sign={false} className={b < 0 ? 'neg' : ''} />], ['Spent this month', money(mm.expense)]],
          };
        }}
      />
    </Screen>
  );
}

/* ---------------------------------------------------------------- Categories */

async function deleteCategory(c: Category) {
  const [txIds, recIds, tplIds, rules, budgets] = await Promise.all([
    db.txs.where('categoryId').equals(c.id).primaryKeys(),
    db.recurring.filter((r) => r.categoryId === c.id).primaryKeys(),
    db.templates.filter((t) => t.categoryId === c.id).primaryKeys(),
    db.rules.filter((r) => r.categoryId === c.id).toArray(),
    db.budgets.filter((b) => b.categoryIds.includes(c.id)).toArray(),
  ]);
  const only = budgets.filter((b) => b.categoryIds.length === 1);
  const lines = [
    txIds.length ? `${plural(txIds.length, 'transaction')} will become No category.` : 'No transactions use it.',
    rules.length ? `${plural(rules.length, 'rule')} for it will be removed.` : '',
    only.length ? `The ${only.map((b) => `“${b.name}”`).join(', ')} budget${only.length > 1 ? 's' : ''} only track${only.length > 1 ? '' : 's'} this category and will be deleted.` : '',
  ].filter(Boolean);
  const ok = await confirm({ title: `Delete “${c.name}”?`, message: lines.join(' '), confirmLabel: 'Delete', destructive: true });
  if (!ok) return false;
  await db.transaction('rw', [db.categories, db.txs, db.recurring, db.templates, db.rules, db.budgets], async () => {
    await db.txs.where('id').anyOf(txIds).modify((t: Tx) => void delete t.categoryId);
    await db.recurring.where('id').anyOf(recIds).modify((r: Recurring) => void delete r.categoryId);
    await db.templates.where('id').anyOf(tplIds).modify((t: { categoryId?: number }) => void delete t.categoryId);
    await db.rules.bulkDelete(rules.map((r) => r.id));
    await db.budgets.bulkDelete(only.map((b) => b.id));
    for (const b of budgets.filter((x) => x.categoryIds.length > 1)) await db.budgets.update(b.id, { categoryIds: b.categoryIds.filter((id) => id !== c.id) });
    await db.categories.delete(c.id);
  });
  const last = getSettings().lastCategoryByType;
  if (last?.[c.kind] === c.id) setSettings({ lastCategoryByType: { ...last, [c.kind]: undefined } });
  return true;
}

export function Categories() {
  const [kind, setKind] = useState<Category['kind']>('expense');
  const counts = useLiveQuery(async () => {
    const m = new Map<number, number>();
    await db.txs.each((t) => t.categoryId != null && m.set(t.categoryId, (m.get(t.categoryId) ?? 0) + 1));
    return m;
  }) ?? new Map<number, number>();
  return (
    <Screen title="Categories" back className="sb">
      <Segmented value={kind} options={[['expense', 'Expense'], ['income', 'Income']] as const} onChange={setKind} aria-label="Category type" />
      <div className="sb-cats">
        <EntityManager<Category>
          key={kind}
          noun="category"
          layout="people"
          table={db.categories}
          filter={(c) => c.kind === kind}
          empty={`No ${kind} categories`}
          blank={{ name: '', kind, icon: 'circle-ellipsis', color: PALETTE.gray }}
          fields={[
            { key: 'name', label: 'Name', type: 'text', placeholder: 'e.g. Momo' },
            { key: 'kind', label: 'For', type: 'select', options: [{ value: 'expense', label: 'Expenses' }, { value: 'income', label: 'Income' }] },
            { key: 'color', label: 'Colour', type: 'swatch' },
            { key: 'icon', label: 'Icon', type: 'icon' },
          ]}
          onDelete={deleteCategory}
          row={(c) => ({ icon: c.icon, color: c.color, title: c.name, sub: plural(counts.get(c.id) ?? 0, 'use') })}
        />
      </div>
      <p className="t-footnote secondary sb-note">Tap a category to rename it or change its icon and colour. Tap + to add one.</p>
    </Screen>
  );
}

/* ---------------------------------------------------------------- Goals */

export function Goals() {
  const [adding, setAdding] = useState<Goal | null>(null);
  const [tab, setTab] = useState<'active' | 'completed'>('active');
  const saved = (g: Goal) => sum(g.contributions);
  const done = (g: Goal) => g.target > 0 && saved(g) >= g.target;
  return (
    <Screen title="Goals" back className="sb">
      <EntityManager<Goal>
        key={tab}
        noun="goal"
        table={db.goals}
        filter={(g) => done(g) === (tab === 'completed')}
        empty={tab === 'completed' ? 'No completed goals yet' : 'No goals yet'}
        blank={{ name: '', target: 0, contributions: [] }}
        fields={[
          { key: 'name', label: 'Name', type: 'text', placeholder: 'e.g. Trip to Pokhara' },
          { key: 'target', label: 'Target amount', type: 'number' },
          { key: 'deadline', label: 'Deadline', type: 'date', optional: true },
        ]}
        row={(g) => {
          const s = saved(g);
          const pct = g.target > 0 ? Math.min(100, Math.round((s / g.target) * 100)) : 0;
          return {
            icon: done(g) ? 'trophy' : 'target',
            color: tintFor(g.id),
            title: g.name,
            sub: g.deadline ? `By ${prettyDate(g.deadline)}` : 'No deadline',
            badge: done(g) ? 'Done' : dueBadge(g.deadline),
            cols: [['Saved', money(s)], ['To go', money(Math.max(0, g.target - s))]],
            progress: { value: s, max: g.target },
            foot: <>Goal <b className="num">{money(g.target)}</b> · {pct}%</>,
          };
        }}
        actions={(g) => (done(g) ? null : <button type="button" className="btn tinted sm" onClick={() => setAdding(g)}>Add money</button>)}
      />
      <DockSeg value={tab} options={['active', 'completed'] as const} onChange={setTab} aria-label="Goals" />
      {adding && (
        <AmountPrompt title={`Add to ${adding.name}`} onClose={() => setAdding(null)}
          onSave={(amount, date) => db.goals.update(adding.id, { contributions: [...adding.contributions, { amount, date }] })} />
      )}
    </Screen>
  );
}

/* ---------------------------------------------------------------- Loans */

export function Loans() {
  const loans = useLiveQuery(() => db.loans.toArray()) ?? [];
  const [paying, setPaying] = useState<Loan | null>(null);
  const [tab, setTab] = useState<Loan['direction']>('lent');
  const left = (l: Loan) => Math.max(0, l.amount - sum(l.payments));
  const lent = loans.filter((l) => l.direction === 'lent').reduce((s, l) => s + left(l), 0);
  const owed = loans.filter((l) => l.direction === 'borrowed').reduce((s, l) => s + left(l), 0);
  return (
    <Screen title="Loans" back className="sb">
      <section className="card sb-summary" aria-label="Loan balance">
        <span className="t-footnote secondary">{lent >= owed ? 'You are owed, net' : 'You owe, net'}</span>
        <Money value={Math.abs(lent - owed)} size="xl" sign={false} className={lent >= owed ? 'pos' : 'neg'} />
        <div className="sb-summary-cols two">
          <div><span className="t-caption secondary">Lent out</span><Money value={lent} size="sm" sign={false} className="pos" /></div>
          <div><span className="t-caption secondary">Borrowed</span><Money value={owed} size="sm" sign={false} className="neg" /></div>
        </div>
      </section>
      <EntityManager<Loan>
        key={tab}
        noun="loan"
        table={db.loans}
        filter={(l) => l.direction === tab}
        empty={tab === 'lent' ? 'Nobody owes you' : "You don't owe anyone"}
        blank={{ person: '', direction: tab, amount: 0, payments: [] }}
        fields={[
          { key: 'person', label: 'Person', type: 'text' },
          { key: 'direction', label: 'Direction', type: 'select', options: [{ value: 'lent', label: 'I lent' }, { value: 'borrowed', label: 'I borrowed' }] },
          { key: 'amount', label: 'Amount', type: 'number' },
          { key: 'dueDate', label: 'Due date', type: 'date', optional: true },
          { key: 'note', label: 'Note', type: 'text', optional: true },
        ]}
        row={(l) => {
          const paid = sum(l.payments);
          return {
            icon: l.direction === 'lent' ? <ArrowUpRight size={20} strokeWidth={2.2} /> : <ArrowDownLeft size={20} strokeWidth={2.2} />,
            color: l.direction === 'lent' ? PALETTE.green : PALETTE.orange,
            title: l.person,
            sub: l.note,
            badge: left(l) <= 0 ? 'Settled' : dueBadge(l.dueDate),
            cols: [['Paid back', money(paid)], ['Total', money(l.amount)]],
            progress: { value: paid, max: l.amount },
            foot: l.dueDate ? `Due ${prettyDate(l.dueDate)}` : `${l.amount > 0 ? Math.round((paid / l.amount) * 100) : 0}% repaid`,
          };
        }}
        actions={(l) => (left(l) > 0 ? <button type="button" className="btn tinted sm" onClick={() => setPaying(l)}>Add payment</button> : null)}
      />
      <DockSeg value={tab} options={[['lent', 'Lent'], ['borrowed', 'Borrowed']] as const} onChange={setTab} aria-label="Loans" />
      {paying && (
        <AmountPrompt title={`Payment from ${paying.person}`} onClose={() => setPaying(null)}
          onSave={(amount, date) => db.loans.update(paying.id, { payments: [...paying.payments, { amount, date }] })} />
      )}
    </Screen>
  );
}

/* ---------------------------------------------------------------- Recurring */

const PER_MONTH = { daily: 30.44, weekly: 4.35, monthly: 1, yearly: 1 / 12 };

export function RecurringPage() {
  const accounts = useLiveQuery(() => db.accounts.toArray()) ?? [];
  const categories = useLiveQuery(() => db.categories.toArray()) ?? [];
  const items = useLiveQuery(() => db.recurring.toArray()) ?? [];
  const [tab, setTab] = useState<'active' | 'paused'>('active');
  const live = items.filter((r) => r.active);
  const monthly = (type: Recurring['type']) => live.filter((r) => r.type === type).reduce((s, r) => s + r.amount * PER_MONTH[r.cycle], 0);
  const end = periodRange('monthly').end;
  const due = live.filter((r) => r.type === 'expense' && r.nextDate <= end).reduce((s, r) => s + r.amount, 0);
  return (
    <Screen title="Recurring" back className="sb">
      <section className="card sb-summary" aria-label="Recurring totals">
        <span className="t-footnote secondary">Bills per month, on average</span>
        <Money value={Math.round(monthly('expense'))} size="xl" sign={false} />
        <div className="sb-summary-cols">
          <div><span className="t-caption secondary">Still due this month</span><Money value={due} size="sm" sign={false} /></div>
          <div><span className="t-caption secondary">Per year</span><Money value={Math.round(monthly('expense') * 12)} size="sm" sign={false} /></div>
          <div><span className="t-caption secondary">Income / month</span><Money value={Math.round(monthly('income'))} kind="income" size="sm" /></div>
        </div>
      </section>
      <p className="t-footnote secondary sb-note">Each item records itself on its due date. Missed dates are caught up the next time you open Khata.</p>
      <EntityManager<Recurring>
        key={tab}
        noun="recurring item"
        table={db.recurring}
        filter={(r) => r.active === (tab === 'active')}
        empty={tab === 'paused' ? 'Nothing is paused' : 'No recurring items yet'}
        blank={{ name: '', amount: 0, type: 'expense', accountId: accounts[0]?.id, cycle: 'monthly', nextDate: todayISO(), subscription: false, active: true }}
        fields={[
          { key: 'name', label: 'Name', type: 'text', placeholder: 'e.g. Netflix' },
          { key: 'amount', label: 'Amount', type: 'number' },
          { key: 'type', label: 'Type', type: 'select', options: [{ value: 'expense', label: 'Expense' }, { value: 'income', label: 'Income' }] },
          { key: 'accountId', label: 'Account', type: 'select', options: accounts.map((a) => ({ value: a.id, label: a.name })) },
          { key: 'categoryId', label: 'Category', type: 'select', optional: true, options: categories.map((c) => ({ value: c.id, label: `${c.name} (${c.kind === 'income' ? 'income' : 'expense'})` })) },
          { key: 'cycle', label: 'Repeats', type: 'select', options: PERIODS },
          { key: 'nextDate', label: 'Next due', type: 'date' },
          { key: 'subscription', label: 'This is a subscription', type: 'checkbox' },
          { key: 'active', label: 'Active', type: 'checkbox' },
        ]}
        // monthly and yearly items keep this day of the month, even after a short month
        prepare={(r) => ({ ...r, anchor: r.nextDate ? fromISO(r.nextDate).getDate() : r.anchor })}
        row={(r) => {
          const c = categories.find((x) => x.id === r.categoryId);
          const acc = accounts.find((a) => a.id === r.accountId);
          return {
            icon: c?.icon ?? (r.type === 'income' ? 'briefcase' : 'repeat'),
            color: c?.color ?? tintFor(r.id),
            title: r.name,
            tags: [r.cycle, ...(r.subscription ? ['Subscription'] : [])],
            right: <Money value={r.amount} kind={r.type} />,
            cols: [['Next', prettyDate(r.nextDate)], [r.type === 'income' ? 'Paid into' : 'Paid from', acc?.name ?? 'No account']],
          };
        }}
      />
      <DockSeg value={tab} options={['active', 'paused'] as const} onChange={setTab} aria-label="Recurring" />
    </Screen>
  );
}

/* ---------------------------------------------------------------- Assets */

export function Assets() {
  const txs = useLiveQuery(() => db.txs.toArray()) ?? [];
  const accounts = useLiveQuery(() => db.accounts.toArray()) ?? [];
  const assets = useLiveQuery(() => db.assets.toArray()) ?? [];
  const cash = [...balances(accounts, txs).values()].reduce((s, v) => s + v, 0);
  const invested = assets.reduce((s, a) => s + a.value, 0);
  return (
    <Screen title="Assets" back className="sb">
      <section className="card sb-summary" aria-label="Net worth">
        <span className="t-footnote secondary">Net worth</span>
        <Money value={cash + invested} size="xl" sign={false} />
        <div className="sb-summary-cols two">
          <div><span className="t-caption secondary">Accounts</span><Money value={cash} size="sm" sign={false} /></div>
          <div><span className="t-caption secondary">Assets</span><Money value={invested} size="sm" sign={false} /></div>
        </div>
      </section>
      <EntityManager<Asset>
        noun="asset"
        table={db.assets}
        header="Assets"
        blank={{ name: '', kind: 'Mutual fund', value: 0, icon: 'trending-up' }}
        fields={[
          { key: 'name', label: 'Name', type: 'text' },
          { key: 'kind', label: 'Kind', type: 'text', placeholder: 'Stocks, mutual fund, gold, property…' },
          { key: 'value', label: 'Current value', type: 'number' },
          { key: 'icon', label: 'Icon', type: 'icon' },
        ]}
        row={(a) => ({ icon: a.icon, color: tintFor(a.id), title: a.name, sub: a.kind, right: money(a.value) })}
      />
    </Screen>
  );
}

/* ---------------------------------------------------------------- Labels, people, places */

export function Tags() {
  const txs = useLiveQuery(() => db.txs.toArray()) ?? [];
  const [kind, setKind] = useState<Tag['kind']>('label');
  return (
    <Screen title={{ label: 'Labels', person: 'People', place: 'Places' }[kind]} back className="sb">
      <EntityManager<Tag>
        key={kind}
        noun={kind}
        layout={kind === 'label' ? 'list' : 'people'}
        table={db.tags}
        filter={(t) => t.kind === kind}
        empty={{ label: 'No labels yet', person: 'No people yet', place: 'No places yet' }[kind]}
        blank={{ name: '', kind }}
        fields={[{ key: 'name', label: 'Name', type: 'text' }]}
        row={(t) => {
          const mine = txs.filter((x) => x.tagIds.includes(t.id));
          const net = mine.reduce((s, x) => s + (x.type === 'income' ? x.amount : x.type === 'expense' ? -x.amount : 0), 0);
          return {
            icon: kind === 'label' ? 'tag' : kind === 'person' ? <User size={22} /> : <MapPin size={22} />,
            color: tintFor(t.id),
            title: t.name,
            sub: plural(mine.length, 'transaction'),
            right: <Money value={net} kind={net > 0 ? 'income' : net < 0 ? 'expense' : 'neutral'} />,
          };
        }}
      />
      <DockSeg value={kind} options={[['label', 'Labels'], ['person', 'People'], ['place', 'Places']] as const} onChange={setKind} aria-label="Kind" className="sb-dockseg" />
    </Screen>
  );
}

/* ---------------------------------------------------------------- Bill splitter */

/** "A, B, C" splits equally; "A:500, B:300" uses the given amounts. */
function parseParts(text: string, total: number) {
  const raw = text.split(',').map((s) => s.trim()).filter(Boolean).map((s) => {
    const [name, amt] = s.split(':').map((x) => x.trim());
    return { name, share: amt ? Number(amt) : NaN };
  });
  const fixed = raw.reduce((s, p) => s + (p.share || 0), 0);
  const open = raw.filter((p) => Number.isNaN(p.share)).length;
  const each = open ? Math.round(((total - fixed) / open) * 100) / 100 : 0;
  return raw.map((p) => ({ name: p.name, share: Number.isNaN(p.share) ? each : p.share, settled: false }));
}

const BLANK_SPLIT = { name: '', total: '', paidBy: 'Me', people: 'Me, ' };

export function Splits() {
  const { toast } = useApp();
  const splits = useLiveQuery(() => db.splits.reverse().toArray());
  const [tab, setTab] = useState<'active' | 'settled'>('active');
  const [open, setOpen] = useState(false);
  const [f, setF] = useState(BLANK_SPLIT);
  const preview = parseParts(f.people, +f.total || 0);
  useFab(() => setOpen(true));
  const owedOf = (s: Split) => s.parts.filter((p) => p.name !== s.paidBy && !p.settled).reduce((a, p) => a + p.share, 0);
  const shown = (splits ?? []).filter((s) => (owedOf(s) > 0) === (tab === 'active'));

  async function remove(s: Split) {
    const ok = await confirm({ title: `Delete “${s.name}”?`, message: 'This can’t be undone.', confirmLabel: 'Delete', destructive: true });
    if (!ok) return;
    await db.splits.delete(s.id);
    toast(`Deleted “${s.name}”`, { label: 'Undo', run: () => void db.splits.put(s) });
  }

  async function save() {
    if (preview.length < 2 || !(+f.total > 0)) return toast('Enter a total and at least two people');
    await db.splits.add({ name: f.name.trim() || 'Bill', date: todayISO(), paidBy: f.paidBy.trim() || preview[0].name, parts: preview });
    setOpen(false);
    setF(BLANK_SPLIT);
  }

  return (
    <Screen title="Bill Splitter" back className="sb">
      {splits && !shown.length && (
        <Empty icon="receipt" title={tab === 'active' ? 'No open bills' : 'No settled bills yet'} message={tab === 'active' ? 'Tap + to split a bill with friends.' : undefined} />
      )}
      <div className="cards rise">
        {shown.map((s) => {
          const total = s.parts.reduce((a, p) => a + p.share, 0);
          const equal = s.parts.every((p) => Math.abs(p.share - s.parts[0].share) < 0.011);
          const owed = owedOf(s);
          return (
            <article className="tinted-card sb-split" key={s.id} style={{ ['--c' as string]: tintFor(s.id) }}>
              <div className="xhead">
                <IconTile name="receipt" color={tintFor(s.id)} />
                <div className="body">
                  <div className="title">{s.name}</div>
                  <div className="tags">
                    <span className="tag">{plural(s.parts.length, 'person', 'people')}</span>
                    <span className="tag">{equal ? 'Equal' : 'Custom'}</span>
                    <span className="tag">{prettyDate(s.date)}</span>
                  </div>
                </div>
                <Money value={total} sign={false} className="xright t-headline" />
              </div>
              <ul className="sb-parts">
                {s.parts.map((p, i) => {
                  const payer = p.name === s.paidBy;
                  return (
                    <li key={i}>
                      {payer ? (
                        <span className="sb-part-mark payer" aria-hidden="true"><Check size={14} strokeWidth={3} /></span>
                      ) : (
                        <button type="button" role="checkbox" aria-checked={p.settled} aria-label={`${p.name} settled`}
                          className={`sb-part-mark ${p.settled ? 'on' : ''}`}
                          onClick={() => db.splits.update(s.id, { parts: s.parts.map((x, j) => (j === i ? { ...x, settled: !x.settled } : x)) })}>
                          {p.settled && <Check size={14} strokeWidth={3} />}
                        </button>
                      )}
                      <span className="sb-part-name">
                        <span className="t-body ellipsis">{p.name}</span>
                        <span className="t-footnote secondary">{payer ? 'Paid the bill' : p.settled ? 'Settled' : `Owes ${s.paidBy}`}</span>
                      </span>
                      <Money value={p.share} sign={false} className="num" />
                    </li>
                  );
                })}
              </ul>
              <div className="xfoot">
                <span>{owed > 0 ? <>Still owed <b className="num">{money(owed)}</b></> : 'All settled'}</span>
                <button type="button" className="icon-btn" aria-label={`Delete ${s.name}`} onClick={() => remove(s)}><Trash2 size={18} /></button>
              </div>
            </article>
          );
        })}
      </div>
      <DockSeg value={tab} options={[['active', 'Open'], ['settled', 'Settled']] as const} onChange={setTab} aria-label="Bills" />
      {open && (
        <Sheet title="Split a bill" onClose={() => setOpen(false)} dirty={!!(f.total || f.name)} action={{ label: 'Save', onClick: () => void save() }}>
          <form className="form" onSubmit={(e) => (e.preventDefault(), void save())}>
            <input className="amount-input" type="number" step="any" min="0" inputMode="decimal" required aria-label="Total" placeholder="0" autoFocus
              value={f.total} onChange={(e) => setF({ ...f, total: e.target.value })} />
            <Field label="What for"><input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Dinner" /></Field>
            <Field label="People" hint="Separate with commas. Add :amount for a custom share, like Ravi:500.">
              <input value={f.people} onChange={(e) => setF({ ...f, people: e.target.value })} placeholder="Me, Asha, Ravi:500" />
            </Field>
            <Field label="Paid by"><input value={f.paidBy} onChange={(e) => setF({ ...f, paidBy: e.target.value })} /></Field>
            {preview.length > 0 && (
              <List header="Shares">
                {preview.map((p, i) => <Row key={i} title={p.name || 'Someone'} value={money(p.share, { force: true })} />)}
              </List>
            )}
            <button className="btn filled lg block">Save</button>
          </form>
        </Sheet>
      )}
    </Screen>
  );
}

/* ---------------------------------------------------------------- Preferences */

const CURRENCIES = ['NPR', 'INR', 'USD', 'EUR', 'GBP', 'AED', 'SGD', 'AUD', 'CAD', 'JPY', 'BDT', 'LKR', 'PKR'];
const BACKUP_TABLES = TABLES.filter((t) => t !== 'kv');

// receipts are Blobs, which JSON can't hold; they travel as data URLs inside the backup
const toDataUrl = (b: Blob) => new Promise<string>((res, rej) => {
  const r = new FileReader();
  r.onload = () => res(r.result as string);
  r.onerror = () => rej(r.error);
  r.readAsDataURL(b);
});
function fromDataUrl(u: string): Blob | undefined {
  const m = /^data:(image\/[\w.+-]+);base64,([A-Za-z0-9+/=\s]+)$/.exec(u);
  if (!m) return undefined;
  try {
    const bin = atob(m[2].replace(/\s/g, ''));
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new Blob([bytes], { type: m[1] });
  } catch {
    return undefined;
  }
}

function Notifications() {
  const s = useSettings();
  const { toast } = useApp();
  const [perm, setPerm] = useState(permission());
  const n = s.notify;
  const setN = (patch: Partial<typeof n>) => (setSettings({ notify: { ...n, ...patch } }), checkAlerts());

  if (!notificationsSupported()) {
    return (
      <List header="Reminders" footer="This browser doesn't support notifications. Installing the app usually fixes it.">
        <Row icon="calendar" color={PALETTE.red} title="Reminders unavailable" />
      </List>
    );
  }
  if (perm !== 'granted') {
    return (
      <List header="Reminders" footer={perm === 'denied' ? 'Notifications are blocked for this site. Allow them in your browser settings, then come back.' : 'A daily nudge, budget alerts and bills coming due.'}>
        <Row icon="calendar" color={PALETTE.red} title="Reminders"
          value={perm !== 'denied' ? <button type="button" className="btn filled sm" onClick={async () => setPerm(await enableNotifications() as NotificationPermission)}>Allow</button> : undefined} />
      </List>
    );
  }
  return (
    <List header="Reminders">
      <Row icon="coffee" color={PALETTE.brown} title="Daily nudge" subtitle="If nothing is logged by this time"
        value={
          <span className="sb-inline">
            {n.daily && <input type="time" aria-label="Reminder time" className="sb-time" value={n.time} onChange={(e) => setN({ time: e.target.value })} />}
            <Switch label="Daily nudge" on={n.daily} onChange={(daily) => setN({ daily })} />
          </span>
        } />
      <Row icon="piggy-bank" color={PALETTE.pink} title="Budget alerts" subtitle="At 80% and when a limit is used up" accessory="switch" checked={n.budgets} onToggle={(budgets) => setN({ budgets })} />
      <Row icon="calendar" color={PALETTE.red} title="Bills and loans" subtitle="A day before something is due" accessory="switch" checked={n.bills} onToggle={(bills) => setN({ bills })} />
      <Row icon="shield" color={PALETTE.teal} title="Weekly backup reminder" accessory="switch" checked={n.backup} onToggle={(backup) => setN({ backup })} />
      <Row title="Send a test notification" accessory="none"
        onClick={() => show({ title: 'Khata', body: 'Reminders are working.', url: '/' }).then((ok) =>
          toast(ok ? 'Test notification sent' : "Couldn't show a notification. Check this site's notification settings."))} />
    </List>
  );
}

export function SettingsPage() {
  const s = useSettings();
  const install = useInstall();
  const { toast } = useApp();
  const file = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function backup() {
    try {
      const data: Record<string, unknown> = { app: 'khata', version: 3, created: new Date().toISOString(), settings: getSettings() };
      for (const t of BACKUP_TABLES) data[t] = await db.table(t).toArray();
      data.txs = await Promise.all((data.txs as Tx[]).map(async (t) => (t.photo ? { ...t, photo: await toDataUrl(t.photo) } : t)));
      download(`khata-backup-${todayISO()}.json`, JSON.stringify(data), 'application/json');
      setSettings({ lastBackup: todayISO() });
      toast('Backup downloaded. Keep it somewhere safe, like Google Drive.');
    } catch (e) {
      toast(`Couldn't make a backup: ${(e as Error).message}`);
    }
  }

  async function restore(f: File) {
    let data: Record<string, unknown>;
    try {
      data = JSON.parse(await f.text());
      if (!data || typeof data !== 'object' || data.app !== 'khata') throw new Error();
    } catch {
      toast("That file isn't a Khata backup");
      return;
    }
    const n = Array.isArray(data.txs) ? data.txs.length : 0;
    const when = typeof data.created === 'string' ? ` from ${prettyDate(data.created.slice(0, 10))}` : '';
    const ok = await confirm({
      title: 'Replace everything with this backup?',
      message: `The backup${when} has ${plural(n, 'transaction')}. Everything in Khata now will be replaced. This can’t be undone.`,
      confirmLabel: 'Replace',
      destructive: true,
    });
    if (!ok) return;
    setBusy(true);
    try {
      const rows = (t: string) => (Array.isArray(data[t]) ? (data[t] as unknown[]).filter((x): x is Record<string, unknown> => !!x && typeof x === 'object') : []);
      const txs = rows('txs').map((t) => {
        const { photo, ...rest } = t;
        const blob = typeof photo === 'string' && photo.startsWith('data:image/') ? fromDataUrl(photo) : undefined;
        return blob ? { ...rest, photo: blob } : rest;
      });
      await db.transaction('rw', BACKUP_TABLES.map((t) => db.table(t)), async () => {
        for (const t of BACKUP_TABLES) {
          await db.table(t).clear();
          const list = t === 'txs' ? txs : rows(t);
          if (list.length) await db.table(t).bulkAdd(list);
        }
      });
      const saved = data.settings && typeof data.settings === 'object' ? (data.settings as Partial<ReturnType<typeof getSettings>>) : {};
      setSettings({ ...saved, linkKey: saved.linkKey || getSettings().linkKey, onboarded: true });
      await processRecurring();
      await checkAlerts();
      toast('Backup restored');
    } catch (e) {
      toast(`Couldn't restore: ${(e as Error).message || 'unknown error'}`);
    } finally {
      setBusy(false);
    }
  }

  async function wipe() {
    const ok = await confirm({ title: 'Delete all transactions?', message: 'Accounts, categories, budgets and rules are kept. This can’t be undone.', confirmLabel: 'Delete all', destructive: true });
    if (!ok) return;
    await db.txs.clear();
    toast('All transactions deleted');
  }

  return (
    <Screen title="Preferences" back className="sb">
      <List header="Appearance">
        <div className="sb-list-pad">
          <Segmented value={s.theme} options={[['system', 'Auto'], ['light', 'Light'], ['dark', 'Dark']] as const} onChange={(theme) => setSettings({ theme })} aria-label="Appearance" />
        </div>
        <Row icon="shield" color={PALETTE.gray} title="Hide amounts" subtitle="Shows dots instead of figures in public" accessory="switch" checked={s.hide} onToggle={(hide) => setSettings({ hide })} />
        <Row icon="smartphone" color={PALETTE.pink} title="Haptics" subtitle="A light tap on Android when you press keys" accessory="switch" checked={s.haptics} onToggle={(haptics) => setSettings({ haptics })} />
        <Row icon="percent" color={PALETTE.orange} title="Calculator pill" subtitle="A floating calculator on every screen" accessory="switch" checked={s.calculator} onToggle={(calculator) => setSettings({ calculator })} />
      </List>

      <List header="Region" footer="Country decides which banks and wallets are suggested.">
        <Row icon="globe" color={PALETTE.blue} title="Country"
          value={
            <select aria-label="Country" className="sb-select" value={s.country}
              onChange={(e) => {
                const country = e.target.value as typeof s.country;
                setSettings({ country, currency: country === 'NP' ? 'NPR' : country === 'IN' ? 'INR' : s.currency });
              }}>
              <option value="NP">Nepal</option>
              <option value="IN">India</option>
              <option value="other">Other</option>
            </select>
          } />
        <Row icon="coins" color={PALETTE.green} title="Currency"
          value={
            <select aria-label="Currency" className="sb-select" value={s.currency} onChange={(e) => setSettings({ currency: e.target.value })}>
              {CURRENCIES.map((c) => <option key={c}>{c}</option>)}
            </select>
          } />
      </List>

      <Notifications />

      <List header="App">
        {install === 'installed' ? (
          <Row icon="smartphone" color={PALETTE.indigo} title="Installed" subtitle="Khata is on your home screen and works offline" />
        ) : install === 'prompt' ? (
          <Row icon="smartphone" color={PALETTE.indigo} title="Install app" subtitle="Add Khata to your home screen. It works offline." onClick={() => void promptInstall()} />
        ) : (
          <Row icon="smartphone" color={PALETTE.indigo} title="Install app"
            subtitle={install === 'ios' ? 'In Safari, tap Share, then “Add to Home Screen”' : 'Use your browser menu, then “Install app” or “Add to Home screen”'} />
        )}
        <Row icon="zap" color={PALETTE.orange} title="Banks & SMS" to="/connect" />
        <Row icon="package" color={PALETTE.purple} title="Categories" to="/categories" />
        <Row icon="tag" color={PALETTE.cyan} title="Labels, people & places" to="/tags" />
      </List>

      <List header="Data" footer="Everything lives only on this device. Download a backup now and then.">
        <Row icon="file-text" color={PALETTE.blue} title="Download backup" subtitle={s.lastBackup ? `Last backup ${prettyDate(s.lastBackup)}` : 'No backup yet'} onClick={backup} />
        <Row icon="repeat" color={PALETTE.teal} title={busy ? 'Restoring…' : 'Restore from backup'} onClick={() => !busy && file.current?.click()} />
        <Row title="Delete all transactions" destructive accessory="none" onClick={wipe} />
      </List>
      <input ref={file} type="file" accept="application/json,.json" hidden
        onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void restore(f); }} />

      <List>
        <Row icon="coffee" color={PALETTE.brown} title="About Khata" subtitle={`Version ${__APP_VERSION__}`} to="/about" />
        <Row icon="sparkles" color={PALETTE.yellow} title="Run setup again" to="/welcome" />
      </List>
    </Screen>
  );
}
