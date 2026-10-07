import { db, type Account, type Budget, type Category, type Tx, type TxSource } from '../db';
import { addCycle, fromISO, periodRange, todayISO } from './format';
import { KEYWORDS, type Parsed } from './parse';

const eq = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** user rules → category named on the row → past transactions with the same name → built-in keywords */
export async function categorize(p: Pick<Parsed, 'name' | 'type' | 'categoryName'>, cats?: Category[]) {
  cats ??= await db.categories.toArray();
  const name = p.name.toLowerCase();
  const rules = await db.rules.toArray();
  const rule = rules.find((r) => r.pattern && name.includes(r.pattern.toLowerCase()));
  if (rule && cats.some((c) => c.id === rule.categoryId)) return rule.categoryId;
  if (p.categoryName) {
    const c = cats.find((c) => eq(c.name, p.categoryName!));
    if (c) return c.id;
  }
  const prev = (await db.txs.orderBy('date').reverse().limit(500).toArray()).find(
    (t) => t.categoryId && t.type === p.type && eq(t.name, p.name),
  );
  if (prev && cats.some((c) => c.id === prev.categoryId)) return prev.categoryId;
  const kw = KEYWORDS.find(([re]) => re.test(p.name));
  return cats.find((c) => kw && c.name === kw[1] && c.kind === p.type)?.id;
}

function pickAccount(p: Parsed, accounts: Account[], fallback?: number) {
  const byName = p.accountName && accounts.find((a) => eq(a.name, p.accountName!));
  const by4 = p.last4 && accounts.find((a) => a.last4 && (a.last4.endsWith(p.last4!) || p.last4!.endsWith(a.last4)));
  const byProvider = p.provider && accounts.find((a) => a.provider === p.provider);
  return (byName || by4 || byProvider || accounts.find((a) => a.id === fallback) || accounts.find((a) => a.kind === 'bank') || accounts[0])?.id;
}

/**
 * Duplicate key. A bank reference number is exact; otherwise the full original text (an SMS usually
 * carries a running balance, so two genuine Rs 20 chais differ). Manual-style rows fall back to the fields.
 */
export const txHash = (p: Parsed) =>
  p.ref ? `ref:${p.ref}` : p.raw ? `raw:${p.raw.toLowerCase()}` : `${p.date}|${p.amount}|${p.type}|${p.name.toLowerCase()}`;

export interface Resolved extends Parsed {
  accountId?: number;
  categoryId?: number;
  duplicate: boolean;
}

/** Matches parsed rows to accounts and categories and flags ones already imported (or repeated in this batch). */
export async function resolve(list: Parsed[], fallbackAccount?: number): Promise<Resolved[]> {
  const [accounts, cats] = await Promise.all([db.accounts.toArray(), db.categories.toArray()]);
  const seen = new Set<string>();
  const out: Resolved[] = [];
  for (const p of list) {
    const h = txHash(p);
    out.push({
      ...p,
      accountId: pickAccount(p, accounts, fallbackAccount),
      categoryId: await categorize(p, cats),
      duplicate: seen.has(h) || (await db.txs.where('hash').equals(h).count()) > 0,
    });
    seen.add(h);
  }
  return out;
}

/** Adds rows in one transaction; the duplicate check is repeated inside it so two tabs can't double-add. */
export async function ingest(list: Resolved[], source: TxSource, dedupe = true) {
  let added = 0;
  await db.transaction('rw', db.txs, async () => {
    for (const p of list) {
      if (!p.accountId || (dedupe && p.duplicate)) continue;
      const hash = txHash(p);
      if (dedupe && (await db.txs.where('hash').equals(hash).count())) continue;
      await db.txs.add({
        type: p.type,
        amount: p.amount,
        name: p.name,
        date: p.date,
        accountId: p.accountId,
        categoryId: p.categoryId,
        note: p.foreign ? `${p.foreign} charge — amount may need converting. ${p.note ?? ''}`.trim() : p.note,
        tagIds: [],
        source,
        hash,
      });
      added++;
    }
  });
  return { added, skipped: list.length - added };
}

/**
 * Posts every recurring transaction that has come due. Runs inside one transaction and re-reads each
 * item, so two tabs (or the app and a browser tab) opening at once can't post the same bill twice.
 */
export async function processRecurring() {
  const today = todayISO();
  return db.transaction('rw', db.recurring, db.txs, db.accounts, async () => {
    let posted = 0;
    const accounts = new Set((await db.accounts.toArray()).map((a) => a.id));
    for (const r of await db.recurring.where('nextDate').belowOrEqual(today).toArray()) {
      if (!r.active || !accounts.has(r.accountId)) continue;
      const anchor = r.anchor ?? fromISO(r.nextDate).getDate();
      let next = r.nextDate;
      for (let guard = 0; next <= today && guard < 400; guard++) {
        await db.txs.add({
          type: r.type,
          amount: r.amount,
          name: r.name,
          date: next,
          accountId: r.accountId,
          categoryId: r.categoryId,
          tagIds: [],
          source: 'recurring',
          hash: `rec:${r.id}:${next}`,
        });
        next = addCycle(next, r.cycle, anchor);
        posted++;
      }
      await db.recurring.update(r.id, { nextDate: next, anchor });
    }
    return posted;
  });
}

export function balances(accounts: Account[], txs: Tx[]) {
  const b = new Map(accounts.map((a) => [a.id, a.opening || 0]));
  const add = (id: number | undefined, v: number) => id != null && b.has(id) && b.set(id, b.get(id)! + v);
  for (const t of txs) {
    if (t.type === 'income') add(t.accountId, t.amount);
    else add(t.accountId, -t.amount);
    if (t.type === 'transfer') add(t.toAccountId, t.amount);
  }
  return b;
}

export function totals(txs: Tx[], start: string, end: string) {
  let income = 0;
  let expense = 0;
  for (const t of txs) {
    if (t.date < start || t.date > end) continue;
    if (t.type === 'income') income += t.amount;
    else if (t.type === 'expense') expense += t.amount;
  }
  return { income, expense };
}

export function budgetStatus(b: Budget, txs: Tx[], now = new Date()) {
  const current = periodRange(b.period, now);
  const counts = (t: Tx) => t.type === 'expense' && (!b.categoryIds.length || (t.categoryId != null && b.categoryIds.includes(t.categoryId)));
  const spentBetween = (start: string, end: string) => txs.reduce((s, t) => (counts(t) && t.date >= start && t.date <= end ? s + t.amount : s), 0);

  let carry = 0;
  if (b.rollover) {
    // only whole periods that started on or after the budget was created count; the partial first one doesn't
    let full = 0;
    let firstStart = '';
    for (let o = -1; o > -5000; o--) {
      const r = periodRange(b.period, now, o);
      if (r.start < b.createdAt) break;
      full++;
      firstStart = r.start;
    }
    if (full) {
      const lastEnd = periodRange(b.period, now, -1).end;
      carry = full * b.limit - spentBetween(firstStart, lastEnd);
    }
  }
  const spent = spentBetween(current.start, current.end);
  const limit = Math.max(0, b.limit + carry);
  return { spent, limit, carry, left: limit - spent, ...current };
}
