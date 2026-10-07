import { describe, expect, it } from 'vitest';
import { dueAlerts, type AlertInput } from './alerts';
import { evalAmount } from './format';
import { smsFromSearch } from '../pages/SilentAdd';

const base: AlertInput = {
  today: '2026-10-07',
  hhmm: '21:30',
  prefs: { daily: true, time: '21:00', budgets: true, bills: true, backup: true },
  loggedToday: false,
  lastBackup: '2026-10-06',
  hasData: true,
  budgets: [],
  recurring: [],
  loans: [],
};
const keys = (x: Partial<AlertInput>) => dueAlerts({ ...base, ...x }).map((a) => a.key);

describe('dueAlerts', () => {
  it('nudges after the reminder time only if nothing was logged', () => {
    expect(keys({})).toEqual(['daily:2026-10-07']);
    expect(keys({ loggedToday: true })).toEqual([]);
    expect(keys({ hhmm: '20:59' })).toEqual([]);
    expect(keys({ prefs: { ...base.prefs, daily: false } })).toEqual([]);
  });
  it('warns at 80% and 100% of a budget, once per period', () => {
    const b = { id: 1, name: 'Food', limit: 1000, start: '2026-10-01' };
    expect(keys({ loggedToday: true, budgets: [{ ...b, spent: 790 }] })).toEqual([]);
    expect(keys({ loggedToday: true, budgets: [{ ...b, spent: 850 }] })).toEqual(['budget:1:2026-10-01:80']);
    expect(keys({ loggedToday: true, budgets: [{ ...b, spent: 1200 }] })).toEqual(['budget:1:2026-10-01:100']);
  });
  it('reminds a day before a bill and about due or late loans', () => {
    const r = { id: 3, name: 'Rent', amount: 'Rs 18,000', active: true, type: 'expense' };
    expect(keys({ loggedToday: true, recurring: [{ ...r, nextDate: '2026-10-08' }] })).toEqual(['bill:3:2026-10-08']);
    expect(keys({ loggedToday: true, recurring: [{ ...r, nextDate: '2026-10-09' }] })).toEqual([]);
    const l = { id: 4, person: 'Asha', left: 'Rs 500', open: true, direction: 'lent' };
    expect(keys({ loggedToday: true, loans: [{ ...l, dueDate: '2026-10-05' }] })).toEqual(['loan:4:2026-10-05:late']);
    expect(keys({ loggedToday: true, loans: [{ ...l, dueDate: '2026-10-05', open: false }] })).toEqual([]);
  });
  it('asks for a backup after a week', () => {
    expect(keys({ loggedToday: true, lastBackup: '2026-09-29' })).toHaveLength(1);
    expect(keys({ loggedToday: true, lastBackup: undefined, hasData: false })).toEqual([]);
  });
});

describe('evalAmount', () => {
  it('handles plain numbers and sums', () => {
    expect(evalAmount('1,250')).toBe(1250);
    expect(evalAmount('120+45')).toBe(165);
    expect(evalAmount('3*80 + 20')).toBe(260);
    expect(evalAmount('100-20/4')).toBe(95);
    expect(evalAmount('10/3')).toBe(3.33);
  });
  it('rejects junk', () => {
    expect(evalAmount('')).toBeNaN();
    expect(evalAmount('12+')).toBeNaN();
    expect(evalAmount('alert(1)')).toBeNaN();
    expect(evalAmount('5/0')).toBeNaN();
  });
});

describe('smsFromSearch', () => {
  it('keeps an unencoded & inside the message', () => {
    expect(smsFromSearch('?from=NABIL&sms=Rs 800 debited to MOMO & CO. Bal 2,000')).toBe('Rs 800 debited to MOMO & CO. Bal 2,000');
  });
  it('decodes encoded text and accepts the share-sheet name', () => {
    expect(smsFromSearch('?text=Rs%20100%20paid')).toBe('Rs 100 paid');
    expect(smsFromSearch('?amount=5')).toBeNull();
  });
});
