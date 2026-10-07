import { useRef, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { Check, ChevronDown, ChevronLeft, ChevronRight, Download, Search, X } from 'lucide-react';
import { db, type Account, type Category, type Tag, type Tx } from '../db';
import { todayISO } from '../lib/format';
import { ACCOUNT_ICONS, PALETTE } from '../lib/icons';
import { toCsv } from '../lib/parse';
import { byNewest, TxList } from '../components/TxList';
import { actionSheet, Empty, haptic, IconTile, List, Money, Row, Screen, Sheet } from '../components/ui';
import '../styles/screens-a.css';

export function download(name: string, text: string, mime = 'text/csv') {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: mime }));
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // some browsers start the download asynchronously; revoking at once can cancel it
  window.setTimeout(() => URL.revokeObjectURL(a.href), 1500);
}

export function exportCsv(txs: Tx[], accounts: Account[], categories: Category[], tags: Tag[], name = 'transactions.csv') {
  const acc = new Map(accounts.map((a) => [a.id, a.name]));
  const cat = new Map(categories.map((c) => [c.id, c.name]));
  const tag = new Map(tags.map((t) => [t.id, t.name]));
  download(
    name,
    toCsv([
      ['date', 'type', 'name', 'amount', 'account', 'to_account', 'category', 'labels', 'note'],
      ...txs.map((t) => [
        t.date, t.type, t.name, t.amount, acc.get(t.accountId), t.toAccountId ? acc.get(t.toAccountId) : '',
        t.categoryId ? cat.get(t.categoryId) : '', t.tagIds.map((i) => tag.get(i)).filter(Boolean).join('; '), t.note,
      ]),
    ]),
  );
}

export const accountIcon = (a: Account) => ACCOUNT_ICONS[a.kind] ?? 'wallet';

export const monthLabel = (ym: string, long = false) => {
  const d = new Date(+ym.slice(0, 4), +ym.slice(5, 7) - 1, 1);
  const thisYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString(undefined, { month: long ? 'long' : 'short', year: thisYear && !long ? undefined : 'numeric' });
};

/** Year stepper plus a 4×3 grid of months. Months after the current one are disabled. */
export function MonthGrid({ year, setYear, selected, onPick, minYear }: {
  year: number;
  setYear: (y: number) => void;
  selected?: string;
  onPick: (ym: string) => void;
  minYear: number;
}) {
  const now = todayISO().slice(0, 7);
  const maxYear = new Date().getFullYear();
  return (
    <div className="sa-mgrid">
      <div className="sa-mgrid-head">
        <button type="button" className="icon-btn" aria-label="Previous year" disabled={year <= minYear} onClick={() => setYear(year - 1)}>
          <ChevronLeft size={22} />
        </button>
        <span className="t-title3 rounded" aria-live="polite">{year}</span>
        <button type="button" className="icon-btn" aria-label="Next year" disabled={year >= maxYear} onClick={() => setYear(year + 1)}>
          <ChevronRight size={22} />
        </button>
      </div>
      <div className="sa-mgrid-months">
        {Array.from({ length: 12 }, (_, i) => {
          const ym = `${year}-${String(i + 1).padStart(2, '0')}`;
          const label = new Date(year, i, 1).toLocaleDateString(undefined, { month: 'short' });
          return (
            <button type="button" key={ym} className={`sa-month ${selected === ym ? 'on' : ''} ${ym === now ? 'now' : ''}`}
              aria-pressed={selected === ym} disabled={ym > now} onClick={() => onPick(ym)}>
              {label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export type PickItem = { value: string; title: string; icon?: string; color?: string; text?: string };

/** A sheet with grouped rows; tapping one picks it and closes. */
export function PickSheet({ title, groups, selected, onPick, onClose }: {
  title: string;
  groups: { header?: string; items: PickItem[] }[];
  selected: string;
  onPick: (v: string) => void;
  onClose: () => void;
}) {
  return (
    <Sheet title={title} onClose={onClose} size="sm">
      <div className="stack sa-picksheet">
        {groups.filter((g) => g.items.length).map((g, i) => (
          <List key={i} header={g.header}>
            {g.items.map((it) => (
              <Row key={it.value} icon={it.icon} color={it.color} title={it.title} accessory="none"
                value={selected === it.value ? <Check className="accent" size={20} strokeWidth={2.6} aria-label="Selected" /> : undefined}
                onClick={() => (haptic(), onPick(it.value), onClose())} />
            ))}
          </List>
        ))}
      </div>
    </Sheet>
  );
}

type Key = 'type' | 'account' | 'category' | 'month' | 'tag';

function FilterChip({ label, value, onOpen, onClear }: { label: string; value?: string; onOpen: () => void; onClear: () => void }) {
  if (!value)
    return (
      <button type="button" className="sa-fchip" onClick={onOpen} aria-haspopup="dialog">
        {label}
        <ChevronDown size={15} strokeWidth={2.4} aria-hidden="true" />
      </button>
    );
  return (
    <span className="sa-fchip on">
      <button type="button" className="sa-fchip-main" onClick={onOpen} aria-label={`${label}: ${value}. Change`}>{value}</button>
      <button type="button" className="sa-fchip-x" onClick={onClear} aria-label={`Clear ${label.toLowerCase()} filter`}>
        <X size={14} strokeWidth={2.8} />
      </button>
    </span>
  );
}

export function Transactions() {
  const accounts = useLiveQuery(() => db.accounts.toArray()) ?? [];
  const categories = useLiveQuery(() => db.categories.toArray()) ?? [];
  const tags = useLiveQuery(() => db.tags.toArray()) ?? [];
  const txs = useLiveQuery(() => db.txs.toArray()) ?? [];
  // filters live in the URL so the sidebar search (/search?q=) and back navigation keep them
  const [params, setParams] = useSearchParams();
  const f = { q: params.get('q') ?? '', type: params.get('type') ?? '', account: params.get('account') ?? '', category: params.get('category') ?? '', month: params.get('month') ?? '', tag: params.get('tag') ?? '' };
  const set = (patch: Partial<typeof f>) => {
    const next = { ...f, ...patch };
    setParams(Object.fromEntries(Object.entries(next).filter(([, v]) => v)), { replace: true });
  };
  const [open, setOpen] = useState<Key | null>(null);
  const [year, setYear] = useState(() => +(f.month || todayISO()).slice(0, 4));
  const input = useRef<HTMLInputElement>(null);

  const needle = f.q.trim().toLowerCase();
  const shown = txs
    .filter(
      (t) =>
        (!needle || t.name.toLowerCase().includes(needle) || t.note?.toLowerCase().includes(needle) || String(t.amount).includes(needle)) &&
        (!f.type || t.type === f.type) &&
        (!f.account || t.accountId === +f.account || t.toAccountId === +f.account) &&
        (!f.category || (f.category === 'none' ? !t.categoryId && t.type !== 'transfer' : t.categoryId === +f.category)) &&
        (!f.tag || t.tagIds.includes(+f.tag)) &&
        (!f.month || t.date.startsWith(f.month)),
    )
    .sort(byNewest);
  const income = shown.reduce((s, t) => (t.type === 'income' ? s + t.amount : s), 0);
  const expense = shown.reduce((s, t) => (t.type === 'expense' ? s + t.amount : s), 0);
  const net = income - expense;
  const filtered = !!(f.q || f.type || f.account || f.category || f.month || f.tag);
  const minYear = Math.min(new Date().getFullYear() - 1, ...txs.map((t) => +t.date.slice(0, 4)).filter((y) => y > 1999));

  const acc = accounts.find((a) => String(a.id) === f.account);
  const cat = categories.find((c) => String(c.id) === f.category);
  const tag = tags.find((t) => String(t.id) === f.tag);
  const TYPES: Record<string, string> = { expense: 'Expenses', income: 'Income', transfer: 'Transfers' };

  const pickType = async () => {
    const v = await actionSheet({
      title: 'Show',
      actions: [
        { label: 'All types', value: '' },
        { label: 'Expenses', value: 'expense' },
        { label: 'Income', value: 'income' },
        { label: 'Transfers', value: 'transfer' },
      ],
    });
    if (v !== null) (haptic(), set({ type: v }));
  };

  let sheet: ReactNode = null;
  if (open === 'account')
    sheet = (
      <PickSheet title="Account" selected={f.account} onPick={(v) => set({ account: v })} onClose={() => setOpen(null)}
        groups={[
          { items: [{ value: '', title: 'All accounts', icon: 'wallet', color: PALETTE.gray }] },
          { header: 'Accounts', items: accounts.map((a) => ({ value: String(a.id), title: a.name, icon: accountIcon(a), color: a.color })) },
        ]} />
    );
  else if (open === 'category')
    sheet = (
      <PickSheet title="Category" selected={f.category} onPick={(v) => set({ category: v })} onClose={() => setOpen(null)}
        groups={[
          { items: [{ value: '', title: 'All categories', icon: 'circle-ellipsis', color: PALETTE.gray }, { value: 'none', title: 'No category', icon: 'tag', color: PALETTE.gray }] },
          { header: 'Expense', items: categories.filter((c) => c.kind === 'expense').map((c) => ({ value: String(c.id), title: c.name, icon: c.icon, color: c.color })) },
          { header: 'Income', items: categories.filter((c) => c.kind === 'income').map((c) => ({ value: String(c.id), title: c.name, icon: c.icon, color: c.color })) },
        ]} />
    );
  else if (open === 'tag')
    sheet = (
      <PickSheet title="Label" selected={f.tag} onPick={(v) => set({ tag: v })} onClose={() => setOpen(null)}
        groups={[
          { items: [{ value: '', title: 'Any label', icon: 'tag', color: PALETTE.gray }] },
          ...(['label', 'person', 'place'] as const).map((k) => ({
            header: k === 'label' ? 'Labels' : k === 'person' ? 'People' : 'Places',
            items: tags.filter((t) => t.kind === k).map((t) => ({ value: String(t.id), title: t.name, icon: k === 'person' ? 'users' : k === 'place' ? 'store' : 'tag', color: k === 'person' ? PALETTE.blue : k === 'place' ? PALETTE.teal : PALETTE.purple })),
          })),
        ]} />
    );
  else if (open === 'month')
    sheet = (
      <Sheet title="Month" onClose={() => setOpen(null)} size="sm">
        <MonthGrid year={year} setYear={setYear} selected={f.month} minYear={minYear}
          onPick={(ym) => (haptic(), set({ month: ym }), setOpen(null))} />
      </Sheet>
    );

  return (
    <div className="stack sa-activity">
      <Screen title="Activity"
        actions={<button className="nav-btn" aria-label="Export CSV" title="Export CSV" disabled={!shown.length} onClick={() => exportCsv(shown, accounts, categories, tags)}><Download size={22} /></button>} />

      <div className="sa-search" role="search">
        <Search className="sa-search-ic" size={18} strokeWidth={2.4} aria-hidden="true" />
        <input ref={input} type="search" placeholder="Search name, note or amount" aria-label="Search transactions" value={f.q}
          enterKeyHint="search" onChange={(e) => set({ q: e.target.value })} onKeyDown={(e) => e.key === 'Enter' && input.current?.blur()} />
        {f.q && (
          <button type="button" className="sa-search-x" aria-label="Clear search" onClick={() => (set({ q: '' }), input.current?.focus())}>
            <X size={13} strokeWidth={3} />
          </button>
        )}
      </div>

      <div className="sa-fchips" role="group" aria-label="Filters">
        <FilterChip label="Type" value={f.type ? TYPES[f.type] : undefined} onOpen={pickType} onClear={() => set({ type: '' })} />
        <FilterChip label="Account" value={acc?.name} onOpen={() => setOpen('account')} onClear={() => set({ account: '' })} />
        <FilterChip label="Category" value={f.category === 'none' ? 'No category' : cat?.name} onOpen={() => setOpen('category')} onClear={() => set({ category: '' })} />
        <FilterChip label="Month" value={f.month ? monthLabel(f.month) : undefined}
          onOpen={() => (setYear(+(f.month || todayISO()).slice(0, 4)), setOpen('month'))} onClear={() => set({ month: '' })} />
        {tags.length > 0 && <FilterChip label="Label" value={tag?.name} onOpen={() => setOpen('tag')} onClear={() => set({ tag: '' })} />}
      </div>

      {shown.length > 0 && (
        <div className="card sa-totals" aria-label="Totals for these transactions">
          <div><span className="t-footnote secondary">Income</span><Money value={income} kind="income" size="md" sign={false} /></div>
          <div><span className="t-footnote secondary">Expense</span><Money value={expense} kind="expense" size="md" sign={false} /></div>
          <div><span className="t-footnote secondary">Net</span><Money value={net} kind={net < 0 ? 'expense' : 'neutral'} size="md" /></div>
        </div>
      )}

      {shown.length ? (
        <div className="sa-results">
          <div className="list-header">
            <span>{shown.length} transaction{shown.length === 1 ? '' : 's'}</span>
            {filtered && <button type="button" onClick={() => setParams({}, { replace: true })}>Clear filters</button>}
          </div>
          <TxList txs={shown.slice(0, 500)} accounts={accounts} categories={categories} />
          {shown.length > 500 && <p className="t-footnote secondary sa-cap">Showing the newest 500. Narrow the filters to see older ones.</p>}
        </div>
      ) : filtered ? (
        <Empty icon="receipt" title="No results" message={f.q ? `Nothing matches “${f.q.trim()}” with these filters.` : 'Nothing matches these filters.'}
          action={{ label: 'Clear filters', onClick: () => setParams({}, { replace: true }) }} />
      ) : (
        <TxList txs={[]} accounts={accounts} categories={categories} />
      )}
      {sheet}
    </div>
  );
}
