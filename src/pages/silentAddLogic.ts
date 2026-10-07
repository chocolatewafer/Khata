import type { Parsed } from '../lib/parse';

export const MAX_AMOUNT = 1e9;
export const MAX_NAME = 80;
export const MAX_NOTE = 300;

function decode(raw: string) {
  const s = raw.replace(/\+/g, ' ');
  try {
    return decodeURIComponent(s);
  } catch {
    return s.replace(/%20/g, ' ');
  }
}

export interface SmsParams {
  text: string;
  from?: string;
  k?: string;
}

/**
 * Reads `sms` (or the share sheet's `text`) as everything after "sms=", because automation apps often
 * insert the message without URL-encoding it: an "&" inside would cut it short, and a "#" pushes the
 * rest into `location.hash`. A `&from=` / `&k=` that an app appended after the message is split off.
 */
export function smsParams(search: string, hash = ''): SmsParams | null {
  const i = search.search(/[?&](?:sms|text)=/);
  if (i < 0) return null;
  let raw = search.slice(search.indexOf('=', i) + 1) + (hash.startsWith('#') ? hash : hash ? `#${hash}` : '');
  const tail: { from?: string; k?: string } = {};
  for (let guard = 0; guard < 2; guard++) {
    const m = raw.match(/&(from|k)=([^&#]*)$/);
    if (!m || tail[m[1] as 'from' | 'k'] !== undefined) break;
    tail[m[1] as 'from' | 'k'] = decode(m[2]);
    raw = raw.slice(0, m.index);
  }
  return { text: decode(raw).trim(), ...tail };
}

export function smsFromSearch(search: string, hash = '') {
  return smsParams(search, hash)?.text ?? null;
}

const clamp = (s: string | null | undefined, n: number) => {
  const t = (s ?? '').replace(/\s+/g, ' ').trim();
  return t ? [...t].slice(0, n).join('') : undefined;
};

const pad = (n: number) => String(n).padStart(2, '0');
const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** A real yyyy-mm-dd date no more than a year ahead of `today`; anything else becomes `today`. */
export function safeDate(value: string | null | undefined, today: string) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value ?? '');
  if (!m) return today;
  const [y, mo, d] = [+m[1], +m[2], +m[3]];
  const dt = new Date(y, mo - 1, d);
  if (y < 1970 || dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== d) return today;
  const [ty, tm, td] = today.split('-').map(Number);
  const limit = iso(new Date(ty + 1, tm - 1, td));
  return value! > limit ? today : value!;
}

export type LinkResult = { ok: true; p: Parsed } | { ok: false; title: string; sub: string };

/** Validates a quick-add link (`amount`, `type`, `name`, `account`, `category`, `description`, `date`). */
export function linkFromParams(q: URLSearchParams, today: string): LinkResult {
  const raw = (q.get('amount') ?? '').replace(/,/g, '').trim();
  const amount = raw === '' ? NaN : Number(raw);
  const type = q.get('type') || 'expense';
  if (!Number.isFinite(amount) || !(amount > 0)) return { ok: false, title: 'Missing amount', sub: 'The link needs amount= with a number above zero.' };
  if (amount > MAX_AMOUNT) return { ok: false, title: 'Amount too large', sub: 'Quick links accept up to 1,000,000,000.' };
  if (type !== 'expense' && type !== 'income') return { ok: false, title: 'Unknown type', sub: 'type must be "expense" or "income".' };
  const category = clamp(q.get('category'), MAX_NAME);
  return {
    ok: true,
    p: {
      amount: Math.round(amount * 100) / 100,
      type,
      name: clamp(q.get('name'), MAX_NAME) ?? category ?? 'Quick add',
      date: safeDate(q.get('date'), today),
      accountName: clamp(q.get('account'), MAX_NAME),
      categoryName: category,
      note: clamp(q.get('description'), MAX_NOTE),
    },
  };
}
