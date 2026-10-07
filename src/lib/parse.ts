import { parseDate, todayISO } from './format';
import { detectProvider, providerById } from './providers';

/** A transaction extracted from an SMS, a statement row or a quick-add link, before it is matched to ids. */
export interface Parsed {
  amount: number;
  type: 'expense' | 'income';
  name: string;
  date: string;
  last4?: string;
  provider?: string;
  accountName?: string;
  categoryName?: string;
  note?: string;
  /** Bank / UPI reference number: the most reliable duplicate key. */
  ref?: string;
  /** The untouched source (SMS text or CSV row) used as a duplicate key when there is no reference. */
  raw?: string;
  /** ISO code when the charge isn't in the home currency; the amount then needs checking. */
  foreign?: string;
}

const HOME = String.raw`INR|NPR|NRs\.?|Rs\.?|रु\.?|₹`;
const FOREIGN = String.raw`USD|US\$|EUR|€|GBP|£|AED|SGD|AUD|CAD|JPY|THB|MYR`;
const MONEY = new RegExp(String.raw`(${HOME}|${FOREIGN})\s*([\d,]+(?:\.\d{1,2})?)`, 'gi');
const AMOUNT_BARE = /(?:debited|credited)\s+(?:by|for|with)\s+([\d,]+(?:\.\d{1,2})?)/i;
const DEBIT = /\b(debited|debit|spent|paid|sent|withdrawn|withdrawal|purchase|deducted|transferred|used for|dr)\b/gi;
const CREDIT = /\b(credited|credit(?!\s*card)|received|deposited|refund(?:ed)?|reversed|reversal|cr)\b/gi;
// an amount right after one of these is a balance or limit, not the transaction
const NOT_TXN_AMOUNT = /(?:bal(?:ance)?|avl|avail(?:able)?|limit|lmt|outstanding|o\/s|due|min(?:imum)?|total)\W{0,12}$/i;
// never a completed transaction
const NOISE = /\b(otp|one[- ]time password|verification code|will be (?:debited|credited|deducted)|is due|requested|request(?:ing)? money|has requested|failed|declined|unsuccessful|could not be|insufficient)\b/i;
// marketing language: only rejected when there's no masked account / card number or reference to vouch for it
const PROMO = /\b(apply now|offer|win|up ?to|t&c|click|download|avail|eligible|pre-?approved|voucher|coupon|get flat|hurry)\b/i;
const MASKED = /(?:[xX*#]{2,}\s?\d{2,6}|(?:a\/c|acct?|account|card)(?:\s*no\.?)?\s*[:#-]?\s*\d{3,})/;
const CARD_BILL = /received towards your .*credit card|credit card.*payment.*received|payment .* received .*card ending/i;
const LAST4 = /(?:a\/c|acct?|account|card)(?:\s*(?:no\.?|number|ending(?:\s+in)?|ending\s+with))?\s*[:#-]?\s*[\dxX*.#-]*?(\d{3,4})\b/i;
const REF = /(?:\b(?:ref(?:erence)?|utr|rrn|txn(?:\s*id)?|transaction id|upi ref|imps ref)(?:\s*no)?\.?\s*[:#-]?\s*|\bupi\/(?:p2[ma]\/)?|\/)([A-Z0-9]{9,22})\b/i;
const STOP = String.raw`(?=\s+(?:on|ref|refno|upi|via|avl|bal|not|if|using|thru|through|dt|dated|successfully|is|has|for|from|to)\b|[.,;:(|]|\s*$)`;
const NOT_PARTY = String.raw`(?!a\/c|acct?\b|account|your|card|rs\b|inr\b|npr\b|nrs\b|₹|you\b|atm\b|upi\b|mobile\b)`;
const PARTY = String.raw`(?:vpa\s+)?([A-Za-z][\w&'@*/ -]{1,40}?)`;
const TO = new RegExp(String.raw`\b(?:at|to|towards)\s+${NOT_PARTY}${PARTY}${STOP}`, 'i');
const FROM = new RegExp(String.raw`\b(?:from|by)\s+${NOT_PARTY}${PARTY}${STOP}`, 'i');
const FOR = new RegExp(String.raw`\bfor\s+(?!fonepay|upi|your|a\/c|txn|transaction|rs\b|inr\b|npr\b)${PARTY}${STOP}`, 'i');
const COUNTERPARTY = /;\s*([A-Za-z][\w &.'-]{1,30}?)\s+credited/i;
const UPI_PATH = /\bupi\/(?:p2[ma]|cr|dr)\/\d+\/([A-Za-z][\w &.'-]{1,30}?)(?=[/.,]|\s+(?:not|on|ref)\b|$)/i;
const REMARK = /\b(?:remarks?|rmks?|narration|desc(?:ription)?|purpose)\s*[:-]\s*([^.;\n]{2,40})/i;

const num = (s: string) => Number(s.replace(/,/g, ''));
const ISO: Record<string, string> = { 'US$': 'USD', '€': 'EUR', '£': 'GBP' };

function tidy(name: string) {
  let n = name.trim().replace(/^vpa\s+/i, '');
  if (n.includes('@')) n = n.split('@')[0].replace(/[._-]+/g, ' ');
  n = n.replace(/\s+/g, ' ').trim();
  // bank SMS shout in capitals and UPI handles are lowercase; title-case both
  if (n === n.toUpperCase() || n === n.toLowerCase()) n = n.toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase());
  return n.slice(0, 60);
}

const positions = (re: RegExp, text: string) => [...text.matchAll(re)].map((m) => m.index!);

/**
 * Parses one bank / wallet / UPI / card alert from India or Nepal.
 * Returns null for OTPs, promos, failed payments, card-bill acknowledgements and anything that
 * isn't a completed transaction. `sender` is the SMS sender ID (e.g. "VM-HDFCBK") when forwarded.
 */
export function parseSms(raw: string, sender = ''): Parsed | null {
  const text = raw.replace(/\s+/g, ' ').trim();
  if (!text || NOISE.test(text) || CARD_BILL.test(text)) return null;
  if (PROMO.test(text) && !MASKED.test(text) && !REF.test(text)) return null;

  const debits = positions(DEBIT, text);
  const credits = positions(CREDIT, text);
  const verbs = [...debits, ...credits];
  if (!verbs.length) return null;

  // candidate amounts that aren't balances or limits; choose the one closest to a verb
  const cands = [...text.matchAll(MONEY)]
    .filter((m) => !NOT_TXN_AMOUNT.test(text.slice(Math.max(0, m.index! - 24), m.index)))
    .map((m) => ({ at: m.index!, cur: m[1], amount: num(m[2]) }))
    .filter((c) => c.amount > 0);
  let pick: { at: number; cur?: string; amount: number } | undefined;
  let best = Infinity;
  for (const c of cands) {
    const d = Math.min(...verbs.map((v) => Math.abs(v - c.at)));
    if (d < best) (best = d), (pick = c);
  }
  if (!pick) {
    const bare = text.match(AMOUNT_BARE);
    if (bare) pick = { at: bare.index!, amount: num(bare[1]) };
  }
  if (!pick || !(pick.amount > 0)) return null;

  // direction comes from the verb nearest the amount ("debited from A/c ..; MERCHANT credited")
  const near = (list: number[]) => Math.min(Infinity, ...list.map((v) => Math.abs(v - pick!.at)));
  const type = near(debits) <= near(credits) ? 'expense' : 'income';

  const provider = detectProvider(text, sender);
  const party = /\batm\b|cash withdrawal/i.test(text) && type === 'expense'
    ? 'ATM withdrawal'
    : (type === 'expense'
      ? (text.match(TO)?.[1] ?? text.match(COUNTERPARTY)?.[1] ?? text.match(UPI_PATH)?.[1] ?? text.match(FOR)?.[1])
      : (text.match(FROM)?.[1] ?? text.match(UPI_PATH)?.[1])) ?? text.match(REMARK)?.[1];
  const via = providerById(provider)?.name;
  const cur = pick.cur?.toUpperCase();
  const foreign = cur && new RegExp(`^(?:${FOREIGN})$`, 'i').test(cur) ? (ISO[cur] ?? cur) : undefined;
  return {
    amount: pick.amount,
    type,
    name: party ? tidy(party) : via ? `${via} ${type === 'expense' ? 'payment' : 'credit'}` : type === 'expense' ? 'Bank debit' : 'Bank credit',
    date: parseDate(text) ?? todayISO(),
    last4: text.match(LAST4)?.[1],
    provider,
    note: text,
    ref: text.match(REF)?.[1]?.toUpperCase(),
    raw: text,
    foreign,
  };
}

/** Splits a pasted blob into messages and parses each. A line is glued to the one before while that one is still incomplete. */
export function parseSmsBlob(blob: string): Parsed[] {
  if (/\n\s*\n/.test(blob)) return blob.split(/\n\s*\n/).map((b) => parseSms(b)).filter((p): p is Parsed => p !== null);
  const blocks: string[] = [];
  for (const line of blob.split(/\n/)) {
    const prev = blocks[blocks.length - 1];
    if (prev && !parseSms(prev)) blocks[blocks.length - 1] = `${prev} ${line}`;
    else blocks.push(line);
  }
  return blocks.map((b) => parseSms(b)).filter((p): p is Parsed => p !== null);
}

/** Parses CSV, also accepting semicolon- and tab-separated files (common in European and bank exports). */
export function parseCsv(text: string): string[][] {
  const firstLine = text.slice(0, text.indexOf('\n') >>> 0 || 2000);
  const counts = [',', ';', '\t'].map((d) => [d, firstLine.split(d).length] as const);
  const sep = counts.sort((a, b) => b[1] - a[1])[0][0];
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') (cell += '"'), i++;
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === sep) (row.push(cell), (cell = ''));
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else cell += ch;
  }
  if (cell || row.length) (row.push(cell), rows.push(row));
  return rows.map((r) => r.map((c) => c.trim())).filter((r) => r.some(Boolean));
}

/** CSV cells starting with = + - @ are formulas to spreadsheet apps; text from SMS must not run as one. */
const safeCell = (c: string | number | undefined) => {
  const s = String(c ?? '');
  return typeof c === 'string' && /^[=+\-@\t\r]/.test(s) && !/^-?\d/.test(s) ? `'${s}` : s;
};

export function toCsv(rows: (string | number | undefined)[][]) {
  return rows
    .map((r) => r.map((c) => {
      const s = safeCell(c);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    }).join(','))
    .join('\n');
}

/** Reads "1,250.00", "-500", "500 Dr", "500.00 CR", "(500.00)". Negative means money out. */
function signed(cell: string) {
  const s = cell.trim();
  if (!s) return 0;
  const v = num(s.replace(/[^\d.,]/g, '')) || 0;
  if (/^\(.*\)$/.test(s) || /^-/.test(s) || /\bdr\.?$/i.test(s)) return -v;
  return v;
}

/** Maps a bank statement or app export to transactions by sniffing the header row. */
export function parseStatement(rows: string[][]): Parsed[] & { skipped?: number } {
  const out: Parsed[] & { skipped?: number } = [];
  // how many dated-looking rows couldn't be read; shown after import. Non-enumerable so it stays out of comparisons.
  Object.defineProperty(out, 'skipped', { value: 0, writable: true, enumerable: false });
  const hi = rows.findIndex((r) => r.filter(Boolean).length >= 3 && r.some((c) => /date/i.test(c)));
  if (hi < 0) return out;
  const head = rows[hi].map((h) => h.toLowerCase());
  const col = (re: RegExp, not?: RegExp) => head.findIndex((h) => re.test(h) && !(not && not.test(h)));
  const iDate = col(/date/, /value date/) >= 0 ? col(/date/, /value date/) : col(/date/);
  const iName = col(/narration|description|particular|details|remark|^name$|merchant|payee/);
  const iDebit = col(/debit|withdraw/);
  const iCredit = col(/credit|deposit/);
  const iAmount = col(/amount|^amt/, /debit|credit|withdraw|deposit|balance/);
  const iType = col(/^type$|dr\s*\/\s*cr|cr\s*\/\s*dr/);
  const iCat = col(/category/);
  const iAcc = col(/^account$/);
  const iNote = col(/^note|^comment/);
  const body = rows.slice(hi + 1);
  // a plain amount column is signed when any row is negative or marked Dr/Cr
  const signedCol = iAmount >= 0 && body.some((r) => signed(r[iAmount] ?? '') < 0 || /cr\.?$/i.test(r[iAmount] ?? ''));

  for (const r of body) {
    const date = parseDate(r[iDate] ?? '');
    if (!date) {
      // totals and footers have no date; count real-looking rows we couldn't read
      if (r.filter(Boolean).length >= 3 && !/total|balance|closing|opening/i.test(r.join(' '))) out.skipped!++;
      continue;
    }
    let amount = 0;
    let type: Parsed['type'] = 'expense';
    const debit = iDebit >= 0 ? Math.abs(signed(r[iDebit] ?? '')) : 0;
    const credit = iCredit >= 0 ? Math.abs(signed(r[iCredit] ?? '')) : 0;
    if (debit > 0) amount = debit;
    else if (credit > 0) (amount = credit), (type = 'income');
    else if (iAmount >= 0) {
      const v = signed(r[iAmount] ?? '');
      amount = Math.abs(v);
      const t = (r[iType] ?? '').toLowerCase();
      if (t === 'transfer') continue;
      if (/^(income|cr|credit|deposit)/.test(t) || (iType < 0 && signedCol && v > 0)) type = 'income';
    }
    if (!(amount > 0)) continue;
    out.push({
      amount,
      type,
      date,
      name: (r[iName] ?? '').replace(/\s+/g, ' ').trim().slice(0, 60) || 'Imported',
      categoryName: iCat >= 0 ? r[iCat] : undefined,
      accountName: iAcc >= 0 ? r[iAcc] : undefined,
      note: iNote >= 0 ? r[iNote] : undefined,
      raw: r.join('|'),
    });
  }
  return out;
}

/** Built-in merchant → category guesses, used when no user rule or history matches. */
export const KEYWORDS: [RegExp, string][] = [
  [/coffee|chiya|chai|\btea\b|starbucks|himalayan java|barista|\bccd\b/i, 'Coffee & Tea'],
  [/swiggy|zomato|foodmandu|restaurant|cafe|momo|domino|pizza|mcdonald|kfc|eatery|dhaba|biryani|khaja|bhojanalaya/i, 'Food'],
  [/bigbasket|blinkit|zepto|instamart|dmart|bhatbhateni|big mart|salesberry|grocer|supermarket|kirana/i, 'Groceries'],
  [/uber|ola\b|rapido|pathao|indrive|tootle|metro|irctc|redbus|buddha air|yeti air|fuel|petrol|nepal oil|hpcl|bpcl|iocl|indian ?oil|fastag|parking/i, 'Transport'],
  [/amazon|flipkart|myntra|ajio|meesho|nykaa|daraz|sastodeal/i, 'Shopping'],
  [/netflix|spotify|hotstar|prime video|youtube|bookmyshow|pvr|inox|qfx|big movies/i, 'Entertainment'],
  [/electric|\bnea\b|airtel|jio|vodafone|\bvi\b|\bntc\b|ncell|worldlink|vianet|broadband|recharge|top-?up|bescom|\bgas\b|khanepani|water bill|dth|dishhome/i, 'Bills'],
  [/pharma|apollo|medplus|hospital|clinic|1mg|netmeds|diagnostic|teaching hospital|grande|norvic/i, 'Health'],
  [/school|college|tuition|udemy|coursera|byju|book/i, 'Education'],
  [/\brent\b|landlord/i, 'Rent'],
  [/salary|payroll/i, 'Salary'],
  [/interest/i, 'Interest'],
];
