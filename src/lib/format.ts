import { useSyncExternalStore } from 'react';
import type { Period } from '../db';

export interface NotifyPrefs {
  daily: boolean; // "log today's spending" nudge
  time: string; // hh:mm for the daily nudge
  budgets: boolean;
  bills: boolean; // recurring items and loans coming due
  backup: boolean; // weekly backup reminder
}
export interface Settings {
  currency: string;
  country: 'NP' | 'IN' | 'other';
  theme: 'system' | 'light' | 'dark';
  hide: boolean;
  onboarded: boolean;
  notify: NotifyPrefs;
  lastBackup?: string;
  installDismissed?: boolean;
  haptics: boolean;
  /** Shows the floating calculator pill. */
  calculator: boolean;
  calcPos?: { x: number; y: number };
  /** Token that links built in the app carry (`k=`), so /silent_add can trust them. */
  linkKey: string;
  lastAccountId?: number;
  lastCategoryByType?: Partial<Record<'expense' | 'income', number>>;
}
const DEFAULTS: Settings = {
  currency: 'INR',
  country: 'IN',
  theme: 'system',
  hide: false,
  onboarded: false,
  notify: { daily: true, time: '21:00', budgets: true, bills: true, backup: true },
  haptics: true,
  calculator: true,
  linkKey: '',
};
const KEY = 'khata-settings';

// 64 URL-safe characters, so `b & 63` has no modulo bias
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
export function randomToken(len = 16) {
  const bytes = new Uint8Array(len);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => ALPHABET[b & 63]).join('');
}

function load(): Settings {
  let s: Settings;
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? '{}');
    s = { ...DEFAULTS, ...saved, notify: { ...DEFAULTS.notify, ...saved.notify } };
  } catch {
    s = DEFAULTS;
  }
  if (!s.linkKey && typeof crypto !== 'undefined') {
    s = { ...s, linkKey: randomToken() };
    try {
      localStorage.setItem(KEY, JSON.stringify(s));
    } catch {
      // private mode: the token lives for this session
    }
  }
  return s;
}
let settings: Settings = typeof localStorage === 'undefined' ? DEFAULTS : load();
const listeners = new Set<() => void>();

export const getSettings = () => settings;
export function setSettings(patch: Partial<Settings>) {
  settings = { ...settings, ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    // private mode: keep settings for this session only
  }
  listeners.forEach((l) => l());
}
export function useSettings() {
  return useSyncExternalStore(
    (l) => (listeners.add(l), () => listeners.delete(l)),
    getSettings,
  );
}

// lakh/crore grouping for the subcontinent; "Rs" rather than "NPR" for Nepal
const locale = () => (settings.currency === 'INR' || settings.currency === 'NPR' ? 'en-IN' : undefined);

export function money(n: number, opts: { force?: boolean } = {}) {
  if (settings.hide && !opts.force) return '••••';
  return new Intl.NumberFormat(locale(), {
    style: 'currency',
    currency: settings.currency,
    currencyDisplay: 'narrowSymbol',
    maximumFractionDigits: Number.isInteger(n) ? 0 : 2,
  }).format(n);
}
export const currencySymbol = () =>
  new Intl.NumberFormat(locale(), { style: 'currency', currency: settings.currency, currencyDisplay: 'narrowSymbol' })
    .formatToParts(0).find((p) => p.type === 'currency')?.value ?? settings.currency;

/** Evaluates what people type in the amount box: "120", "1,200", "450+120", "3*80". Returns NaN for anything else. */
export function evalAmount(input: string): number {
  // "12,5" or "12,50" is a decimal comma; "1,250" and "1,00,000" are digit grouping
  const s = input.trim().replace(/^(\d+),(\d{1,2})$/, '$1.$2').replace(/[,\s]/g, '').replace(/×/g, '*').replace(/÷/g, '/');
  if (!/^[\d.+\-*/]+$/.test(s)) return NaN;
  const nums = s.split(/[+\-*/]/);
  const ops = s.match(/[+\-*/]/g) ?? [];
  if (nums.some((x) => x === '' || isNaN(+x))) return NaN;
  // * and / first, then + and -
  const vals = [+nums[0]];
  const add: string[] = [];
  ops.forEach((op, i) => {
    const v = +nums[i + 1];
    if (op === '*') vals[vals.length - 1] *= v;
    else if (op === '/') vals[vals.length - 1] /= v;
    else (add.push(op), vals.push(v));
  });
  const total = vals.reduce((t, v, i) => (i ? (add[i - 1] === '+' ? t + v : t - v) : v), 0);
  return Number.isFinite(total) ? Math.round(total * 100) / 100 : NaN;
}
/** "₹1.2L" style, for tiles where the full figure won't fit. */
export function moneyShort(n: number) {
  if (settings.hide) return money(n);
  return new Intl.NumberFormat(locale(), { style: 'currency', currency: settings.currency, currencyDisplay: 'narrowSymbol', notation: 'compact', maximumFractionDigits: 1 }).format(n);
}
export function compact(n: number) {
  return new Intl.NumberFormat(locale(), { notation: 'compact', maximumFractionDigits: 1 }).format(n);
}

const pad = (n: number) => String(n).padStart(2, '0');
export const toISO = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const todayISO = () => toISO(new Date());
export function fromISO(s: string) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}
export function prettyDate(iso: string) {
  const today = todayISO();
  if (iso === today) return 'Today';
  const d = fromISO(iso);
  return d.toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: d.getFullYear() === new Date().getFullYear() ? undefined : 'numeric',
  });
}

/** Inclusive [start, end] of the period containing `ref`, shifted by `offset` periods. */
export function periodRange(period: Period, ref = new Date(), offset = 0) {
  const y = ref.getFullYear();
  const m = ref.getMonth();
  const d = ref.getDate();
  let start: Date;
  let end: Date;
  if (period === 'daily') {
    start = end = new Date(y, m, d + offset);
  } else if (period === 'weekly') {
    const monday = d - ((ref.getDay() + 6) % 7);
    start = new Date(y, m, monday + offset * 7);
    end = new Date(y, m, monday + offset * 7 + 6);
  } else if (period === 'monthly') {
    start = new Date(y, m + offset, 1);
    end = new Date(y, m + offset + 1, 0);
  } else {
    start = new Date(y + offset, 0, 1);
    end = new Date(y + offset, 11, 31);
  }
  return { start: toISO(start), end: toISO(end) };
}

const daysIn = (y: number, m0: number) => new Date(y, m0 + 1, 0).getDate();

/**
 * Next occurrence after `iso`. Monthly and yearly items keep their original day (`anchor`, 1–31),
 * so rent due on the 31st lands on 28 Feb and then back on 31 Mar instead of drifting to the 28th.
 */
export function addCycle(iso: string, cycle: Period, anchor?: number) {
  const d = fromISO(iso);
  if (cycle === 'daily') d.setDate(d.getDate() + 1);
  else if (cycle === 'weekly') d.setDate(d.getDate() + 7);
  else {
    const day = anchor ?? d.getDate();
    const y = d.getFullYear() + (cycle === 'yearly' ? 1 : 0);
    const m = d.getMonth() + (cycle === 'monthly' ? 1 : 0);
    const first = new Date(y, m, 1);
    first.setDate(Math.min(day, daysIn(first.getFullYear(), first.getMonth())));
    return toISO(first);
  }
  return toISO(d);
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

/** A real calendar date in a plausible window. Rejects 31 Feb and Nepali (BS) years like 2082. */
function valid(y: number, m: number, d: number) {
  if (y < 100) y += 2000;
  const now = new Date().getFullYear();
  if (m < 1 || m > 12 || d < 1 || y < 2000 || y > now + 1 || d > daysIn(y, m - 1)) return null;
  return `${y}-${pad(m)}-${pad(d)}`;
}

/** "1 Oct" with no year: this year, unless that's in the future, then last year. */
function noYear(m: number, d: number) {
  const now = new Date();
  const v = valid(now.getFullYear(), m, d);
  return v && v > toISO(now) ? valid(now.getFullYear() - 1, m, d) : v;
}

/** Finds the first date in free text: yyyy-mm-dd, dd-MMM-yy, 12Jan24, 1 Oct, dd/mm/yy (or mm/dd/yy when dd/mm is impossible). */
export function parseDate(s: string): string | null {
  const iso = s.match(/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/);
  if (iso) {
    const v = valid(+iso[1], +iso[2], +iso[3]);
    if (v) return v;
  }
  for (const m of s.matchAll(/\b(\d{1,2})[-/. ]?([A-Za-z]{3})[A-Za-z]*[-/., ]{0,2}(\d{4}|\d{2})?\b/g)) {
    const mi = MONTHS.indexOf(m[2].toLowerCase());
    if (mi < 0) continue;
    const v = m[3] ? valid(+m[3], mi + 1, +m[1]) : noYear(mi + 1, +m[1]);
    if (v) return v;
  }
  for (const m of s.matchAll(/\b(\d{1,2})[-/.](\d{1,2})[-/.](\d{4}|\d{2})\b/g)) {
    const v = valid(+m[3], +m[2], +m[1]) ?? valid(+m[3], +m[1], +m[2]);
    if (v) return v;
  }
  return null;
}
