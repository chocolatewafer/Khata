import { describe, expect, it } from 'vitest';
import { addCycle, parseDate, periodRange } from './format';
import { parseCsv, parseSms, parseSmsBlob, parseStatement } from './parse';

describe('parseSms', () => {
  it('HDFC UPI debit', () => {
    const p = parseSms('Rs.500.00 debited from A/c **1234 on 03-10-26 to VPA swiggy@icici(UPI Ref No 627712345678). Not you? Call 18002586161');
    expect(p).toMatchObject({ amount: 500, type: 'expense', name: 'Swiggy', date: '2026-10-03', last4: '1234' });
  });
  it('ICICI debit with counterparty credited', () => {
    const p = parseSms('ICICI Bank Acct XX123 debited for Rs 250.00 on 03-Oct-26; ZOMATO credited. UPI:627712345678. Call 18002662 for dispute.');
    expect(p).toMatchObject({ amount: 250, type: 'expense', name: 'Zomato', date: '2026-10-03', last4: '123' });
  });
  it('SBI debit without currency symbol', () => {
    const p = parseSms('Dear UPI user A/C X4321 debited by 1,250.0 on date 12Jan26 trf to BIG BAZAAR Refno 600123456789. If not u? call 1800111109. -SBI');
    expect(p).toMatchObject({ amount: 1250, type: 'expense', name: 'Big Bazaar', date: '2026-01-12', last4: '4321' });
  });
  it('card spend', () => {
    const p = parseSms('INR 2,499.00 spent on HDFC Bank Card x9876 at AMAZON PAY on 2026-09-30. Avl Lmt INR 1,20,000.00');
    expect(p).toMatchObject({ amount: 2499, type: 'expense', name: 'Amazon Pay', date: '2026-09-30', last4: '9876' });
  });
  it('salary credit', () => {
    const p = parseSms('Your A/c XX5678 is credited with INR 85,000.00 on 01-10-2026 by ACME CORP SALARY. Avl Bal INR 1,02,340.50');
    expect(p).toMatchObject({ amount: 85000, type: 'income', name: 'Acme Corp Salary', date: '2026-10-01', last4: '5678' });
  });
  it('ignores OTPs, promos and future debits', () => {
    expect(parseSms('123456 is your OTP for txn of Rs.500 at AMAZON. Do not share.')).toBeNull();
    expect(parseSms('Get a pre-approved loan of Rs.5,00,000 today!')).toBeNull();
    expect(parseSms('Rs.999 will be debited from your a/c on 05-10-26 for NETFLIX autopay')).toBeNull();
    expect(parseSms('Your bill of Rs.1200 is ready')).toBeNull();
  });
  it('splits a pasted blob', () => {
    const blob = 'Rs.100 debited from A/c XX1111 to UBER on 01-10-26\nhello there\nRs.200 credited to A/c XX1111 from RAHUL on 02-10-26';
    expect(parseSmsBlob(blob).map((p) => [p.type, p.amount, p.name])).toEqual([
      ['expense', 100, 'Uber'],
      ['income', 200, 'Rahul'],
    ]);
  });
});

describe('parseSms Nepal', () => {
  it('bank debit with full account number and QR merchant', () => {
    const p = parseSms('Dear Customer, Your A/C 0012345678901 has been debited by NPR 1,500.00 on 05-10-2026 for Fonepay QR payment to HIMALAYAN JAVA. Bal: NPR 23,450.00. -Nabil Bank');
    expect(p).toMatchObject({ amount: 1500, type: 'expense', name: 'Himalayan Java', date: '2026-10-05', last4: '8901', provider: 'nabil' });
  });
  it('salary credit named by remarks', () => {
    const p = parseSms('Your a/c #XXXX1234 is credited by NRs 25,000.00 on 2026-10-01. Rmks: SALARY OCT. NIC ASIA');
    expect(p).toMatchObject({ amount: 25000, type: 'income', name: 'Salary Oct', last4: '1234', provider: 'nicasia' });
  });
  it('eSewa payment and receipt', () => {
    expect(parseSms('Dear user, you have paid NPR 450.00 to Bhatbhateni Supermarket. eSewa ID: 98XXXXXX12')).toMatchObject({ amount: 450, type: 'expense', name: 'Bhatbhateni Supermarket', provider: 'esewa' });
    expect(parseSms('You have received NPR 1,000.00 from Ram Sharma (98XXXXXX45) on your eSewa wallet.')).toMatchObject({ amount: 1000, type: 'income', name: 'Ram Sharma', provider: 'esewa' });
  });
  it('Khalti and IME Pay', () => {
    expect(parseSms('Rs 200 paid successfully to NTC Topup via Khalti.')).toMatchObject({ amount: 200, type: 'expense', name: 'NTC Topup', provider: 'khalti' });
    expect(parseSms('NPR 500 transferred to 98XXXXXXXX successfully. IME Pay')).toMatchObject({ amount: 500, type: 'expense', name: 'IME Pay payment', provider: 'imepay' });
  });
  it('ATM withdrawal', () => {
    expect(parseSms('NPR 5,000.00 withdrawn from A/C XXX1234 at ATM KTM-01 on 06/10/2026. Global IME Bank')).toMatchObject({ amount: 5000, name: 'ATM withdrawal', last4: '1234', provider: 'gibl', date: '2026-10-06' });
  });
  it('uses the sender ID for the provider', () => {
    expect(parseSms('Rs.120 debited from A/c XX55 on 01-10-26 to CHIYA GHAR', 'NMB_ALERT')?.provider).toBe('nmb');
  });
  it('ignores failed payments', () => {
    expect(parseSms('Your payment of NPR 300 to Daraz has failed.')).toBeNull();
  });
  it('keeps multi-line messages together', () => {
    const blob = 'Dear Customer, Your A/C 001234 has been debited by\nNPR 800.00 on 05-10-2026 to CAFE DU TEMPLE.\nRs.100 debited from A/c XX1111 to UBER on 01-10-26';
    expect(parseSmsBlob(blob).map((p) => [p.amount, p.name])).toEqual([[800, 'Cafe Du Temple'], [100, 'Uber']]);
  });
});

describe('parseStatement', () => {
  it('bank statement with debit/credit columns and preamble', () => {
    const csv = 'Statement for A/c 1234\n\nDate,Narration,Chq/Ref No,Withdrawal Amt,Deposit Amt,Closing Balance\n01/10/26,"UPI-SWIGGY, BLR",123,450.00,,10000\n02/10/26,NEFT SALARY,124,,85000.00,95000\nTotal,,,,,';
    expect(parseStatement(parseCsv(csv))).toMatchObject([
      { date: '2026-10-01', name: 'UPI-SWIGGY, BLR', amount: 450, type: 'expense' },
      { date: '2026-10-02', name: 'NEFT SALARY', amount: 85000, type: 'income' },
    ]);
  });
  it('app export with type column', () => {
    const csv = 'date,type,name,amount,account,category\n2026-10-01,income,Salary,5000,Bank,Salary\n2026-10-02,expense,Tea,20,Cash,Food';
    expect(parseStatement(parseCsv(csv))).toMatchObject([
      { type: 'income', amount: 5000, accountName: 'Bank', categoryName: 'Salary' },
      { type: 'expense', amount: 20, accountName: 'Cash', categoryName: 'Food' },
    ]);
  });
  it('signed amount column', () => {
    const csv = 'Date,Description,Amount\n2026-10-01,Coffee,-120\n2026-10-02,Refund,300';
    expect(parseStatement(parseCsv(csv)).map((p) => p.type)).toEqual(['expense', 'income']);
  });
});

describe('dates', () => {
  it('parses common formats', () => {
    expect(parseDate('03-Oct-2026')).toBe('2026-10-03');
    expect(parseDate('3 October, 2026')).toBe('2026-10-03');
    expect(parseDate('31/12/25')).toBe('2025-12-31');
    expect(parseDate('nope')).toBeNull();
  });
  it('monthly cycle clamps to month end', () => {
    expect(addCycle('2026-01-31', 'monthly')).toBe('2026-02-28');
    expect(addCycle('2026-12-15', 'monthly')).toBe('2027-01-15');
  });
  it('week starts on Monday', () => {
    expect(periodRange('weekly', new Date(2026, 9, 4))).toEqual({ start: '2026-09-28', end: '2026-10-04' });
    expect(periodRange('monthly', new Date(2026, 9, 4), -1)).toEqual({ start: '2026-09-01', end: '2026-09-30' });
  });
});
