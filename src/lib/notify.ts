import { db } from '../db';
import { budgetStatus } from './automation';
import { dueAlerts, type Alert, type AlertInput } from './alerts';
import { getSettings, money, todayISO } from './format';
import { appUrl } from './base';

export type Snapshot = Omit<AlertInput, 'today' | 'hhmm' | 'loggedToday'>;

export const notificationsSupported = () => typeof Notification !== 'undefined';
export const permission = () => (notificationsSupported() ? Notification.permission : 'denied');

const hhmm = () => new Date().toTimeString().slice(0, 5);

/** Everything the background check needs, precomputed so the service worker stays tiny. */
async function snapshot(): Promise<Snapshot> {
  const s = getSettings();
  const [budgets, recurring, loans, txs] = await Promise.all([db.budgets.toArray(), db.recurring.toArray(), db.loans.toArray(), db.txs.toArray()]);
  return {
    prefs: s.notify,
    lastBackup: s.lastBackup,
    hasData: txs.length > 0,
    budgets: budgets.map((b) => {
      const st = budgetStatus(b, txs);
      return { id: b.id, name: b.name, spent: st.spent, limit: st.limit, start: st.start };
    }),
    recurring: recurring.map((r) => ({ id: r.id, name: r.name, amount: money(r.amount, { force: true }), nextDate: r.nextDate, active: r.active, type: r.type })),
    loans: loans.map((l) => {
      const left = l.amount - l.payments.reduce((t, p) => t + p.amount, 0);
      return { id: l.id, person: l.person, left: money(left, { force: true }), dueDate: l.dueDate, open: left > 0, direction: l.direction };
    }),
  };
}

/** The service worker that can show notifications, once it's active. On first launch it may still be installing. */
async function activeWorker() {
  if (!navigator.serviceWorker) return undefined;
  const reg = await navigator.serviceWorker.getRegistration().catch(() => undefined);
  if (!reg) return undefined;
  if (reg.active) return reg;
  const timeout = new Promise<undefined>((r) => setTimeout(() => r(undefined), 4000));
  return Promise.race([navigator.serviceWorker.ready, timeout]);
}

/** Returns true if the notification was shown. */
export async function show(a: Pick<Alert, 'title' | 'body' | 'url'> & { key?: string }) {
  const opts = { body: a.body, icon: appUrl('/icons/icon-192.png'), badge: appUrl('/icons/badge.png'), tag: a.key, data: { url: appUrl(a.url) } };
  try {
    const reg = await activeWorker();
    if (reg) {
      await reg.showNotification(a.title, opts);
      return true;
    }
    const n = new Notification(a.title, opts);
    n.onclick = () => (window.focus(), (location.href = appUrl(a.url)));
    return true;
  } catch {
    // Android Chrome only allows notifications through a service worker
    return false;
  }
}

/** Stores the snapshot for the service worker and sends any reminder that hasn't been sent yet. */
export async function checkAlerts() {
  const snap = await snapshot();
  await db.kv.put({ key: 'snapshot', value: snap });
  if (permission() !== 'granted') return;
  const today = todayISO();
  const loggedToday = (await db.txs.where('date').equals(today).count()) > 0;
  const fired = new Set<string>(((await db.kv.get('fired'))?.value as string[]) ?? []);
  const fresh = dueAlerts({ ...snap, today, hhmm: hhmm(), loggedToday }).filter((a) => !fired.has(a.key));
  let sent = 0;
  for (const a of fresh) if (await show(a)) (fired.add(a.key), sent++);
  if (sent) await db.kv.put({ key: 'fired', value: [...fired].slice(-300) });
}

/** Asks for permission and, where the browser allows it, schedules a background check about twice a day. */
export async function enableNotifications() {
  if (!notificationsSupported()) return 'unsupported' as const;
  const result = await Notification.requestPermission();
  if (result !== 'granted') return result;
  try {
    // `ready` never settles when no worker is registered (dev server, plain http), so don't wait on it
    const reg = await activeWorker();
    // Chromium, installed app only; elsewhere reminders arrive when the app is opened
    await (reg as unknown as { periodicSync?: { register: (t: string, o: object) => Promise<void> } })?.periodicSync?.register('khata-check', { minInterval: 12 * 3600e3 });
  } catch {
    // not installed or not supported
  }
  await checkAlerts();
  return result;
}
