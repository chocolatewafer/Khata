import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { Check, ChevronLeft, Search } from 'lucide-react';
import { db } from '../db';
import { setSettings, type Settings } from '../lib/format';
import { PALETTE } from '../lib/icons';
import { enableNotifications, notificationsSupported } from '../lib/notify';
import { monogram, PROVIDERS } from '../lib/providers';
import { promptInstall, useInstall } from '../lib/pwa';
import { IconTile, List, Logo, Row } from '../components/ui';
import '../styles/screens-b.css';

const COUNTRIES: { id: Settings['country']; badge: string; color: string; name: string; currency: string }[] = [
  { id: 'NP', badge: 'NP', color: PALETTE.red, name: 'Nepal', currency: 'NPR' },
  { id: 'IN', badge: 'IN', color: PALETTE.orange, name: 'India', currency: 'INR' },
  { id: 'other', badge: '', color: PALETTE.blue, name: 'Somewhere else', currency: 'USD' },
];
const OTHER_CURRENCIES = ['USD', 'EUR', 'GBP', 'AED', 'SGD', 'AUD', 'CAD', 'JPY', 'BDT', 'LKR', 'PKR'];
const STEPS = 4;

export function Welcome() {
  const navigate = useNavigate();
  const install = useInstall();
  const [step, setStep] = useState(0);
  const [country, setCountry] = useState<Settings['country']>('NP');
  const [currency, setCurrency] = useState('NPR');
  const [picked, setPicked] = useState<string[]>([]);
  const [q, setQ] = useState('');
  const [remind, setRemind] = useState(notificationsSupported());
  const [busy, setBusy] = useState(false);
  const linked = new Set(useLiveQuery(async () => (await db.accounts.toArray()).map((a) => a.provider).filter((p): p is string => !!p)) ?? []);

  const list = PROVIDERS.filter((p) => p.country === country && (!q || p.name.toLowerCase().includes(q.toLowerCase())));
  const fresh = picked.filter((id) => !linked.has(id));

  async function finish() {
    if (busy) return;
    setBusy(true);
    try {
      setSettings({ country, currency });
      if (picked.length) {
        await db.transaction('rw', [db.accounts, db.txs, db.recurring, db.templates], async () => {
          // re-read inside the transaction so a double tap or a second tab can't add the same provider twice
          const accounts = await db.accounts.toArray();
          const have = new Set(accounts.map((a) => a.provider).filter(Boolean));
          const add = [...new Set(picked)].filter((id) => !have.has(id));
          if (!add.length) return;
          // the starter "Bank" account is replaced by the real ones, unless something already uses it
          const starter = accounts.find((a) => a.name === 'Bank' && a.kind === 'bank' && !a.provider && !a.last4);
          if (starter) {
            const used = (await db.txs.where('accountId').equals(starter.id).count())
              + (await db.txs.filter((t) => t.toAccountId === starter.id).count())
              + (await db.recurring.filter((r) => r.accountId === starter.id).count())
              + (await db.templates.filter((t) => t.accountId === starter.id).count());
            if (!used) await db.accounts.delete(starter.id);
          }
          await db.accounts.bulkAdd(add.map((id) => {
            const p = PROVIDERS.find((x) => x.id === id)!;
            return { name: p.name, kind: p.kind, opening: 0, color: p.color, provider: p.id };
          }));
        });
      }
      if (remind) await enableNotifications().catch(() => undefined);
      setSettings({ onboarded: true });
      navigate('/', { replace: true });
    } finally {
      setBusy(false);
    }
  }

  const back = () => setStep(step === 3 && country === 'other' ? 1 : step - 1);
  const toggle = (id: string) => setPicked(picked.includes(id) ? picked.filter((x) => x !== id) : [...picked, id]);

  let content;
  let primary: { label: string; run: () => void };
  let secondary = null;

  if (step === 0) {
    content = (
      <>
        <span className="logo sb-onb-logo"><Logo /></span>
        <h1 className="t-title1">Welcome to Khata</h1>
        <p className="t-body secondary">Track spending in seconds. Everything stays on this device: no account, no server.</p>
        <ul className="sb-onb-points">
          <li><IconTile name="zap" color={PALETTE.orange} /><span><b>Fast to log</b><br /><span className="secondary">Amount, category, done.</span></span></li>
          <li><IconTile name="smartphone" color={PALETTE.blue} /><span><b>Reads bank alerts</b><br /><span className="secondary">Paste or forward SMS from your bank or wallet.</span></span></li>
          <li><IconTile name="shield" color={PALETTE.green} /><span><b>Private</b><br /><span className="secondary">Your ledger never leaves your phone.</span></span></li>
        </ul>
      </>
    );
    primary = { label: 'Get started', run: () => setStep(1) };
    secondary = <Link to="/settings" className="btn plain block" onClick={() => setSettings({ onboarded: true })}>I have a backup to restore</Link>;
  } else if (step === 1) {
    content = (
      <>
        <IconTile name="globe" color={PALETTE.blue} size="xl" />
        <h1 className="t-title1">Where do you live?</h1>
        <p className="t-body secondary">This sets your currency and which banks and wallets Khata knows.</p>
        <div className="sb-onb-list">
          <List>
            {COUNTRIES.map((c) => (
              <Row key={c.id}
                icon={c.badge ? <IconTile text={c.badge} color={c.color} size="md" /> : <IconTile name="globe" color={c.color} size="md" />}
                title={c.name}
                subtitle={c.id === 'other' ? 'Pick a currency below' : c.currency}
                value={country === c.id ? <Check size={20} strokeWidth={2.6} className="accent" aria-label="Selected" /> : undefined}
                accessory="none"
                className={`sb-choice ${country === c.id ? 'on' : ''}`}
                onClick={() => (setCountry(c.id), setCurrency(c.currency), setPicked([]))} />
            ))}
          </List>
          {country === 'other' && (
            <label className="field">
              <span className="field-label">Currency</span>
              <select value={currency} onChange={(e) => setCurrency(e.target.value)}>
                {OTHER_CURRENCIES.map((c) => <option key={c}>{c}</option>)}
              </select>
            </label>
          )}
        </div>
      </>
    );
    primary = { label: 'Continue', run: () => setStep(country === 'other' ? 3 : 2) };
  } else if (step === 2) {
    content = (
      <>
        <IconTile name="landmark" color={PALETTE.indigo} size="xl" />
        <h1 className="t-title1">Which do you use?</h1>
        <p className="t-body secondary">Pick your banks and wallets. Their SMS alerts land in the right account. Cash is already there.</p>
        <label className="sb-search">
          <Search size={17} aria-hidden="true" />
          <input type="search" placeholder="Search banks and wallets" aria-label="Search banks and wallets" value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
        <div className="chips sb-onb-chips">
          {list.map((p) => {
            const has = linked.has(p.id);
            const on = has || picked.includes(p.id);
            return (
              <button type="button" key={p.id} aria-pressed={on} disabled={has} className={`chip sb-pchip ${on ? 'on' : ''}`} onClick={() => toggle(p.id)}>
                <IconTile text={monogram(p.name)} color={p.color} size="sm" />
                <span>{p.name}</span>
                {has && <span className="t-caption secondary">Added</span>}
              </button>
            );
          })}
          {!list.length && <p className="t-subhead secondary">No match. You can add any account later.</p>}
        </div>
      </>
    );
    primary = { label: fresh.length ? `Add ${fresh.length} and continue` : 'Skip for now', run: () => setStep(3) };
  } else {
    content = (
      <>
        <IconTile name="sparkles" color={PALETTE.yellow} size="xl" />
        <h1 className="t-title1">Almost done</h1>
        <p className="t-body secondary">Two optional extras. You can change both later in Preferences.</p>
        <div className="sb-onb-list">
          <List>
            {notificationsSupported() && (
              <Row icon="calendar" color={PALETTE.red} iconSize="md" className="sb-wrap" title="Gentle reminders" subtitle="A nudge at 9 pm if nothing is logged, plus budget alerts"
                accessory="switch" checked={remind} onToggle={setRemind} />
            )}
            {install === 'prompt' && (
              <Row icon="smartphone" color={PALETTE.indigo} iconSize="md" className="sb-wrap" title="Install the app" subtitle="Opens like a normal app and works offline" onClick={() => void promptInstall()} />
            )}
            {install === 'ios' && (
              <Row icon="smartphone" color={PALETTE.indigo} iconSize="md" title="Install on iPhone" subtitle="Tap Share, then “Add to Home Screen”" />
            )}
            {install === 'installed' && <Row icon="smartphone" color={PALETTE.indigo} iconSize="md" title="Installed" subtitle="Khata is on your home screen" />}
            {install === 'manual' && (
              <Row icon="smartphone" color={PALETTE.indigo} iconSize="md" title="Install the app" subtitle="Use your browser menu, then “Install app”" />
            )}
          </List>
        </div>
      </>
    );
    primary = { label: busy ? 'Setting up…' : 'Start tracking', run: finish };
  }

  return (
    <div className="sb-onb">
      <div className="sb-onb-top">
        {step > 0 ? (
          <button type="button" className="nav-back" onClick={back} disabled={busy}>
            <ChevronLeft size={26} strokeWidth={2.4} aria-hidden="true" /><span>Back</span>
          </button>
        ) : <span />}
        <div className="dots" role="img" aria-label={`Step ${step + 1} of ${STEPS}`}>
          {Array.from({ length: STEPS }, (_, i) => <i key={i} className={i === step ? 'on' : ''} />)}
        </div>
        <span />
      </div>
      <div className="sb-onb-body rise" key={step}>{content}</div>
      <div className="sb-onb-foot">
        <button type="button" className="btn filled lg block" onClick={primary.run} disabled={busy} aria-busy={busy || undefined}>{primary.label}</button>
        {secondary}
      </div>
    </div>
  );
}
