import { useLiveQuery } from 'dexie-react-hooks';
import { db, type Budget } from '../db';
import { budgetStatus } from '../lib/automation';
import { money, prettyDate, todayISO } from '../lib/format';
import { EntityManager, Money, Screen, tintFor } from '../components/ui';
import '../styles/screens-b.css';

export const PERIODS = ['daily', 'weekly', 'monthly', 'yearly'].map((p) => ({ value: p, label: p[0].toUpperCase() + p.slice(1) }));

export function Budgets() {
  const categories = useLiveQuery(() => db.categories.where('kind').equals('expense').toArray()) ?? [];
  const txs = useLiveQuery(() => db.txs.where('type').equals('expense').toArray()) ?? [];
  const budgets = useLiveQuery(() => db.budgets.toArray()) ?? [];
  const all = budgets.map((b) => budgetStatus(b, txs));
  const over = all.filter((s) => s.left < 0).length;

  return (
    <Screen title="Budgets" back className="sb">
      {budgets.length > 0 && (
        <p className="t-subhead secondary sb-note">
          {over ? `${over} of ${budgets.length} budgets are over their limit.` : `All ${budgets.length === 1 ? 'your budget is' : `${budgets.length} budgets are`} on track.`}
        </p>
      )}
      <EntityManager<Budget>
        noun="budget"
        table={db.budgets}
        empty="No budgets yet"
        blank={{ name: '', limit: 0, period: 'monthly', categoryIds: [], rollover: false, createdAt: todayISO() }}
        fields={[
          { key: 'name', label: 'Name', type: 'text', placeholder: 'e.g. Eating out' },
          { key: 'limit', label: 'Limit', type: 'number' },
          { key: 'period', label: 'Period', type: 'select', options: PERIODS },
          { key: 'categoryIds', label: 'Categories (none means all spending)', type: 'multi', options: categories.map((c) => ({ value: c.id, label: c.name })) },
          { key: 'rollover', label: 'Carry unspent or overspent amounts into the next period', type: 'checkbox' },
        ]}
        row={(b) => {
          const st = budgetStatus(b, txs);
          const first = categories.find((c) => c.id === b.categoryIds[0]);
          const names = b.categoryIds.map((id) => categories.find((c) => c.id === id)?.name).filter(Boolean);
          return {
            icon: first?.icon ?? 'piggy-bank',
            color: first?.color ?? tintFor(b.id),
            title: b.name,
            sub: names.length ? names.slice(0, 3).join(', ') + (names.length > 3 ? ` +${names.length - 3}` : '') : 'All spending',
            tags: [b.period, ...(b.rollover ? ['Rollover'] : [])],
            badge: `${st.limit ? Math.round((st.spent / st.limit) * 100) : 0}%`,
            cols: [['Spent', money(st.spent)], ['Budget', money(st.limit)]],
            progress: { value: st.spent, max: st.limit },
            foot: st.left < 0
              ? <span className="neg">Over by <Money value={-st.left} sign={false} className="neg" /></span>
              : <>Left <b className="num">{money(st.left)}</b></>,
            footRight: `Resets after ${prettyDate(st.end)}`,
          };
        }}
      />
    </Screen>
  );
}
