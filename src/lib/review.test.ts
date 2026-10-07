// Regression tests for the adversarial review findings.
import { describe, expect, it } from 'vitest';
import { addCycle, evalAmount, parseDate } from './format';
import { parseCsv, parseSms, parseStatement, toCsv } from './parse';
import { detectProvider } from './providers';

describe('amount is the transaction, not the balance', () => {
  it('skips a leading balance', () => {
    expect(parseSms('Avl Bal Rs 12,345.67. Rs 500 debited from A/c XX1234 on 05-10-26')?.amount).toBe(500);
    expect(parseSms('Bal: Rs 12,345.67 | Debited Rs 500 | A/c XX1234')?.amount).toBe(500);
  });
  it('skips a trailing limit', () => {
    expect(parseSms('INR 2,499.00 spent on ICICI Bank Card XX9876 at AMAZON on 02-10-26. Avl Lmt INR 1,20,000.00')?.amount).toBe(2499);
  });
});

describe('promos are not income, real alerts are not dropped', () => {
  it('rejects promotional texts', () => {
    expect(parseSms('Pay your electricity bill via Paytm and get Rs 100 cashback on first txn')).toBeNull();
    expect(parseSms('Avail personal loan up to Rs 10,00,000 credited instantly in your account. Apply now')).toBeNull();
  });
  it('keeps real alerts that also contain promo words or "due on"', () => {
    expect(parseSms('Rs 500 debited a/c XX1234 on 05-10-26 Avl Bal Rs 1,000. Prime offer: win Rs 5000')).toMatchObject({ amount: 500, type: 'expense' });
    expect(parseSms('Dear Customer, Rs 1,00,000.00 credited to A/c XX1234. Avl Bal Rs 1,50,000.00 EMI of Rs 5000 due on 10-10-26')).toMatchObject({ amount: 100000, type: 'income' });
  });
  it('understands "Debit" and withdrawals', () => {
    expect(parseSms('NIC ASIA: Debit NPR 3,500.00 from A/c 4455 on 2026-10-05 ref 998877665')).toMatchObject({ amount: 3500, type: 'expense', provider: 'nicasia' });
    expect(parseSms('Debit alert: NPR 5,000.00 from Global IME A/c 1234 on 05-10-2026 ATM CASH WITHDRAWAL')).toMatchObject({ amount: 5000, name: 'ATM withdrawal' });
  });
  it('flags foreign-currency charges', () => {
    expect(parseSms('USD 20.00 spent on ICICI Bank Card XX4321 at OPENAI on 05-10-26')).toMatchObject({ amount: 20, foreign: 'USD', name: 'Openai' });
  });
  it('treats refunds and reversals as money in, and ignores card-bill acknowledgements', () => {
    expect(parseSms('Rs 499 reversed to your A/c XX1234 on 05-10-26')?.type).toBe('income');
    expect(parseSms('Payment of Rs 12,450 received towards your HDFC Bank Credit Card XX1234')).toBeNull();
  });
});

describe('duplicate keys', () => {
  it('extracts reference numbers', () => {
    expect(parseSms('Rs.500.00 debited from A/c **1234 on 03-10-26 to VPA swiggy@icici(UPI Ref No 627712345678)')?.ref).toBe('627712345678');
    expect(parseSms('Rs 120 debited A/c XX12 UPI/P2M/628391028374/SWIGGY. Not you?')?.ref).toBe('628391028374');
  });
  it('two identical-looking payments with different balances get different raw keys', () => {
    const a = parseSms('Rs 20 paid to Chai Point from A/c XX12 on 05-10-26. Bal Rs 980');
    const b = parseSms('Rs 20 paid to Chai Point from A/c XX12 on 05-10-26. Bal Rs 960');
    expect(a?.raw).not.toBe(b?.raw);
  });
});

describe('names', () => {
  it('reads real-world merchant formats', () => {
    expect(parseSms('Rs 120 debited from A/c XX12 on 05-10-26 UPI/P2M/628391028374/SWIGGY. Not you?')?.name).toBe('Swiggy');
    expect(parseSms('Rs 350 debited from A/c XX12 on 05-10-26 for Uber trip')?.name).toBe('Uber trip');
    expect(parseSms('Rs.450 paid to RELIANCE JIO from A/c XXXX5599 on 05-10-26')?.name).toBe('Reliance Jio');
    expect(parseSms('A/c XX12 credited by Rs 5000 on 05-10-26 by UPI/ref 628391028374 from RAHUL SHARMA')?.name).toBe('Rahul Sharma');
  });
});

describe('providers do not match ordinary words', () => {
  it('ignores bob, sbl, citizens advice, union, yes', () => {
    expect(detectProvider('Hi, my bob and I paid Rs 100')).toBeUndefined();
    expect(detectProvider('my sbl and nbl')).toBeUndefined();
    expect(detectProvider('citizens advice says yes to union')).toBeUndefined();
  });
  it('a bank alert mentioning a @paytm handle stays with the bank', () => {
    expect(detectProvider('Rs 50 debited from HDFC Bank A/c XX12 to shop@paytm')).toBe('hdfc');
  });
  it('matches sender IDs', () => {
    expect(detectProvider('Rs 50 debited', 'VM-HDFCBK')).toBe('hdfc');
    expect(detectProvider('Rs 50 debited', 'AD-SBIINB')).toBe('sbi');
    expect(detectProvider('Rs 50 debited', 'BX-RANDOM')).toBeUndefined();
  });
});

describe('dates', () => {
  it('rejects impossible and Nepali-calendar dates', () => {
    expect(parseDate('31-02-26')).toBeNull();
    expect(parseDate('2082-06-19')).toBeNull();
  });
  it('accepts month/day when day/month is impossible', () => {
    expect(parseDate('12/31/2025')).toBe('2025-12-31');
  });
  it('reads a date without a year', () => {
    const d = parseDate('spent on 1 Jan');
    expect(d).toMatch(/^\d{4}-01-01$/);
  });
});

describe('recurring dates keep their day', () => {
  it('monthly on the 31st comes back after February', () => {
    expect(addCycle('2026-01-31', 'monthly', 31)).toBe('2026-02-28');
    expect(addCycle('2026-02-28', 'monthly', 31)).toBe('2026-03-31');
  });
  it('yearly on 29 Feb returns to 29 Feb in leap years', () => {
    expect(addCycle('2027-02-28', 'yearly', 29)).toBe('2028-02-29');
  });
});

describe('statements', () => {
  it('reads Cr/Dr and bracketed amounts', () => {
    const csv = 'Date,Narration,Amount\n01/10/26,Salary,"85,000.00 Cr"\n02/10/26,Groceries,500.00 Dr\n03/10/26,Fee,(50.00)';
    expect(parseStatement(parseCsv(csv)).map((r) => [r.type, r.amount])).toEqual([['income', 85000], ['expense', 500], ['expense', 50]]);
  });
  it('reads semicolon-separated files and counts unreadable rows', () => {
    const rows = parseStatement(parseCsv('Date;Description;Debit;Credit\n01/10/26;Coffee;120;\nsoon;Mystery;99;'));
    expect(rows.map((r) => r.name)).toEqual(['Coffee']);
    expect(rows.skipped).toBe(1);
  });
});

describe('small things', () => {
  it('a decimal comma is a decimal', () => {
    expect(evalAmount('12,5')).toBe(12.5);
    expect(evalAmount('1,00,000')).toBe(100000);
    expect(evalAmount('1,250')).toBe(1250);
  });
  it('CSV export neutralises formulas but keeps negative numbers', () => {
    expect(toCsv([['=HYPERLINK("x")', -5, '-12']])).toBe(`"'=HYPERLINK(""x"")",-5,-12`);
  });
});
