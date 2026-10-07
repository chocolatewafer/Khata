import { describe, expect, it } from 'vitest';
import { linkFromParams, safeDate, smsFromSearch, smsParams } from './silentAddLogic';

const TODAY = '2026-10-07';
const link = (s: string) => linkFromParams(new URLSearchParams(s), TODAY);

describe('smsParams', () => {
  it('includes an unencoded # that the browser moved into the hash', () => {
    expect(smsFromSearch('?sms=Rs 500 debited from A/c ', '#1234 to ASHA')).toBe('Rs 500 debited from A/c #1234 to ASHA');
  });
  it('splits a trailing &from= and &k= off the message', () => {
    expect(smsParams('?sms=Rs 80 paid to MOMO & CO&from=VM-NABIL&k=abc123')).toEqual({ text: 'Rs 80 paid to MOMO & CO', from: 'VM-NABIL', k: 'abc123' });
    expect(smsParams('?sms=Rs 80 paid&k=abc&from=NABIL')).toEqual({ text: 'Rs 80 paid', from: 'NABIL', k: 'abc' });
  });
  it('finds the tail even when it sits after a # in the hash', () => {
    expect(smsParams('?sms=Paid A/c ', '#99 Rs 20&k=key1')).toEqual({ text: 'Paid A/c #99 Rs 20', k: 'key1' });
  });
  it('leaves params before sms alone', () => {
    expect(smsParams('?k=abc&from=X&sms=Rs%2010%20paid')).toEqual({ text: 'Rs 10 paid' });
    expect(smsParams('?amount=5')).toBeNull();
  });
});

describe('safeDate', () => {
  it('accepts real dates up to a year ahead', () => {
    expect(safeDate('2026-02-14', TODAY)).toBe('2026-02-14');
    expect(safeDate('2027-10-07', TODAY)).toBe('2027-10-07');
  });
  it('falls back to today for junk, impossible and far-future dates', () => {
    expect(safeDate('2026-02-30', TODAY)).toBe(TODAY);
    expect(safeDate('2027-10-08', TODAY)).toBe(TODAY);
    expect(safeDate('7/10/2026', TODAY)).toBe(TODAY);
    expect(safeDate(null, TODAY)).toBe(TODAY);
    expect(safeDate('2026-13-01', TODAY)).toBe(TODAY);
  });
});

describe('linkFromParams', () => {
  it('builds a transaction from a valid link', () => {
    const r = link('amount=120&name=Coffee&category=Food&date=2026-10-01');
    expect(r).toEqual({ ok: true, p: { amount: 120, type: 'expense', name: 'Coffee', date: '2026-10-01', accountName: undefined, categoryName: 'Food', note: undefined } });
  });
  it('rejects zero, negative, huge and non-numeric amounts', () => {
    expect(link('amount=0').ok).toBe(false);
    expect(link('amount=-5').ok).toBe(false);
    expect(link('amount=abc').ok).toBe(false);
    expect(link('amount=1e10').ok).toBe(false);
    expect(link('amount=1000000000').ok).toBe(true);
    expect(link('').ok).toBe(false);
  });
  it('rejects unknown types', () => {
    expect(link('amount=5&type=transfer').ok).toBe(false);
  });
  it('clamps name to 80 and description to 300 characters', () => {
    const r = link(`amount=5&name=${'n'.repeat(200)}&description=${'d'.repeat(500)}`);
    if (!r.ok) throw new Error('expected ok');
    expect(r.p.name).toHaveLength(80);
    expect(r.p.note).toHaveLength(300);
  });
  it('replaces a bad date with today', () => {
    const r = link('amount=5&date=2099-01-01');
    expect(r.ok && r.p.date).toBe(TODAY);
  });
});
