import Dexie, { type EntityTable } from 'dexie';
import { iconKey, nearestPalette, PALETTE, type IconKey } from './lib/icons';

export type TxType = 'expense' | 'income' | 'transfer';
export type Period = 'daily' | 'weekly' | 'monthly' | 'yearly';
export type TxSource = 'manual' | 'sms' | 'csv' | 'link' | 'recurring';

export interface Account {
  id: number;
  name: string;
  kind: 'bank' | 'cash' | 'card' | 'wallet';
  opening: number;
  color: string;
  last4?: string; // matched against bank SMS / statements
  provider?: string; // bank or wallet id from lib/providers
}
export interface Category {
  id: number;
  name: string;
  kind: 'expense' | 'income';
  icon: string; // key into lib/icons
  color: string;
}
export interface Tx {
  id: number;
  type: TxType;
  amount: number;
  name: string;
  date: string; // yyyy-mm-dd
  accountId: number;
  toAccountId?: number;
  categoryId?: number;
  note?: string;
  tagIds: number[];
  source: TxSource;
  hash?: string; // dedupe key for imported transactions
  photo?: Blob; // receipt
}
export interface Tag {
  id: number;
  kind: 'label' | 'person' | 'place';
  name: string;
}
export interface Budget {
  id: number;
  name: string;
  limit: number;
  period: Period;
  categoryIds: number[]; // empty = all expenses
  rollover: boolean;
  createdAt: string;
}
export interface Entry {
  date: string;
  amount: number;
}
export interface Goal {
  id: number;
  name: string;
  target: number;
  deadline?: string;
  contributions: Entry[];
}
export interface Recurring {
  id: number;
  name: string;
  amount: number;
  type: 'expense' | 'income';
  accountId: number;
  categoryId?: number;
  cycle: Period;
  nextDate: string;
  subscription: boolean;
  active: boolean;
  anchor?: number; // day of month the item falls on, kept across short months
}
export interface Loan {
  id: number;
  person: string;
  direction: 'lent' | 'borrowed';
  amount: number;
  dueDate?: string;
  note?: string;
  payments: Entry[];
}
export interface Asset {
  id: number;
  name: string;
  kind: string;
  value: number;
  icon: string;
}
export interface Rule {
  id: number;
  pattern: string; // case-insensitive substring of the transaction name
  categoryId: number;
}
export interface Template {
  id: number;
  name: string;
  amount: number;
  type: TxType;
  accountId: number;
  categoryId?: number;
}
export interface Split {
  id: number;
  name: string;
  date: string;
  paidBy: string;
  parts: { name: string; share: number; settled: boolean }[];
}

/** Small key/value store the service worker can read too (notification prefs, alerts already sent). */
export interface KV {
  key: string;
  value: unknown;
}

export const db = new Dexie('khata') as Dexie & {
  kv: EntityTable<KV, 'key'>;
  accounts: EntityTable<Account, 'id'>;
  categories: EntityTable<Category, 'id'>;
  txs: EntityTable<Tx, 'id'>;
  tags: EntityTable<Tag, 'id'>;
  budgets: EntityTable<Budget, 'id'>;
  goals: EntityTable<Goal, 'id'>;
  recurring: EntityTable<Recurring, 'id'>;
  loans: EntityTable<Loan, 'id'>;
  assets: EntityTable<Asset, 'id'>;
  rules: EntityTable<Rule, 'id'>;
  templates: EntityTable<Template, 'id'>;
  splits: EntityTable<Split, 'id'>;
};

db.version(1).stores({
  accounts: '++id, name',
  categories: '++id, name, kind',
  txs: '++id, date, accountId, categoryId, type, hash',
  tags: '++id, kind',
  budgets: '++id',
  goals: '++id',
  recurring: '++id, nextDate',
  loans: '++id',
  assets: '++id',
  rules: '++id',
  templates: '++id',
  splits: '++id',
});

db.version(2).stores({ kv: 'key' });

db.version(3)
  .stores({})
  .upgrade(async (tx) => {
    // icons became keys into lib/icons and colours moved to the identity palette
    await tx.table('categories').toCollection().modify((c: Category) => {
      c.icon = iconKey(c.icon);
      c.color = nearestPalette(c.color);
    });
    await tx.table('assets').toCollection().modify((a: Asset) => {
      a.icon = iconKey(a.icon);
    });
  });

db.on('populate', (tx) => {
  tx.table('accounts').bulkAdd([
    { name: 'Cash', kind: 'cash', opening: 0, color: PALETTE.green },
    { name: 'Bank', kind: 'bank', opening: 0, color: PALETTE.blue },
  ]);
  const exp: [string, IconKey, string][] = [
    ['Food', 'utensils', PALETTE.orange],
    ['Coffee & Tea', 'coffee', PALETTE.brown],
    ['Groceries', 'shopping-basket', PALETTE.green],
    ['Transport', 'car', PALETTE.blue],
    ['Shopping', 'shopping-bag', PALETTE.pink],
    ['Bills', 'zap', PALETTE.yellow],
    ['Entertainment', 'clapperboard', PALETTE.purple],
    ['Health', 'pill', PALETTE.red],
    ['Rent', 'house', PALETTE.teal],
    ['Education', 'graduation-cap', PALETTE.indigo],
    ['Travel', 'plane', PALETTE.cyan],
    ['Gifts', 'gift', PALETTE.mint],
    ['Other', 'circle-ellipsis', PALETTE.gray],
  ];
  const inc: [string, IconKey, string][] = [
    ['Salary', 'briefcase', PALETTE.green],
    ['Interest', 'percent', PALETTE.blue],
    ['Other income', 'banknote', PALETTE.gray],
  ];
  tx.table('categories').bulkAdd([
    ...exp.map(([name, icon, color]) => ({ name, icon, color, kind: 'expense' })),
    ...inc.map(([name, icon, color]) => ({ name, icon, color, kind: 'income' })),
  ]);
});

export const TABLES = [
  'accounts', 'categories', 'txs', 'tags', 'budgets', 'goals',
  'recurring', 'loans', 'assets', 'rules', 'templates', 'splits', 'kv',
] as const;
