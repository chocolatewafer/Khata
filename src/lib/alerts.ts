/**
 * Decides which reminders are due. Pure and dependency-free on purpose: the service worker
 * imports this same file (bundled separately) so background checks match what the app shows.
 */
export interface AlertInput {
  today: string; // yyyy-mm-dd
  hhmm: string; // current local time, "21:05"
  prefs: { daily: boolean; time: string; budgets: boolean; bills: boolean; backup: boolean };
  loggedToday: boolean;
  lastBackup?: string;
  hasData: boolean;
  budgets: { id: number; name: string; spent: number; limit: number; start: string }[];
  recurring: { id: number; name: string; amount: string; nextDate: string; active: boolean; type: string }[];
  loans: { id: number; person: string; left: string; dueDate?: string; open: boolean; direction: string }[];
}
export interface Alert {
  key: string; // stable id so an alert is sent once
  title: string;
  body: string;
  url: string;
}

const addDays = (iso: string, n: number) => {
  const [y, m, d] = iso.split('-').map(Number);
  const t = new Date(y, m - 1, d + n);
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
};

export function dueAlerts(x: AlertInput): Alert[] {
  const out: Alert[] = [];
  const tomorrow = addDays(x.today, 1);

  if (x.prefs.daily && !x.loggedToday && x.hhmm >= x.prefs.time) {
    out.push({ key: `daily:${x.today}`, title: 'Anything to log today?', body: "Nothing logged today yet. Add today's spending while you remember it.", url: '/?add=1' });
  }
  if (x.prefs.budgets) {
    for (const b of x.budgets) {
      if (!(b.limit > 0)) continue;
      const pct = b.spent / b.limit;
      if (pct >= 1) out.push({ key: `budget:${b.id}:${b.start}:100`, title: `${b.name} budget is used up`, body: `You've spent ${Math.round(pct * 100)}% of this period's limit.`, url: '/budgets' });
      else if (pct >= 0.8) out.push({ key: `budget:${b.id}:${b.start}:80`, title: `${b.name} budget is at ${Math.round(pct * 100)}%`, body: 'Getting close to the limit for this period.', url: '/budgets' });
    }
  }
  if (x.prefs.bills) {
    for (const r of x.recurring) {
      if (!r.active || r.type !== 'expense' || r.nextDate !== tomorrow) continue;
      out.push({ key: `bill:${r.id}:${r.nextDate}`, title: `${r.name} is due tomorrow`, body: `${r.amount} will be recorded automatically.`, url: '/recurring' });
    }
    for (const l of x.loans) {
      if (!l.open || !l.dueDate || l.dueDate > tomorrow) continue;
      const late = l.dueDate < x.today;
      const who = l.direction === 'lent' ? `${l.person} owes you ${l.left}` : `You owe ${l.person} ${l.left}`;
      out.push({ key: `loan:${l.id}:${l.dueDate}:${late ? 'late' : 'due'}`, title: late ? 'Loan overdue' : 'Loan due soon', body: who, url: '/loans' });
    }
  }
  if (x.prefs.backup && x.hasData && (!x.lastBackup || x.lastBackup <= addDays(x.today, -7))) {
    // one key per week so it nags weekly, not daily
    const week = Math.floor(new Date(x.today).getTime() / (7 * 864e5));
    out.push({ key: `backup:${week}`, title: 'Back up your ledger', body: 'Your data lives only on this device. Download a backup from Preferences.', url: '/settings' });
  }
  return out;
}
