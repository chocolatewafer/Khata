import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { Check, ClipboardPaste, FileSpreadsheet, Search, Share2, Smartphone, TriangleAlert, Wand2, X } from 'lucide-react';
import { db, type Account, type Rule } from '../db';
import { ingest, resolve, type Resolved } from '../lib/automation';
import { currencySymbol, getSettings, prettyDate, randomToken, setSettings, todayISO, useSettings } from '../lib/format';
import { PALETTE } from '../lib/icons';
import { parseCsv, parseSmsBlob, parseStatement, toCsv } from '../lib/parse';
import { monogram, PROVIDERS, type Provider } from '../lib/providers';
import { absoluteUrl } from '../lib/base';
import { confirm, EntityManager, Field, IconTile, List, Row, Screen, Segmented, Sheet, useApp } from '../components/ui';
import { download } from './download';
import '../styles/screens-b.css';

const TABS = [['linked', 'Linked'], ['paste', 'Paste'], ['auto', 'Auto'], ['csv', 'Statement'], ['rules', 'Rules']] as const;
type Tab = (typeof TABS)[number][0];

const SAMPLES = {
  NP: `Dear Customer, Your A/C 0012345678901 has been debited by NPR 450.00 on 05-10-2026 for Fonepay QR payment to HIMALAYAN JAVA. -Nabil Bank
Dear user, you have paid NPR 1,280.00 to Bhatbhateni Supermarket. eSewa ID: 98XXXXXX12
Your a/c #XXXX1234 is credited by NRs 65,000.00 on 2026-10-01. Rmks: SALARY OCT. NIC ASIA`,
  IN: `Rs.450.00 debited from A/c **1234 on 03-10-26 to VPA swiggy@icici(UPI Ref No 627712345678) -HDFC Bank
INR 2,499.00 spent on ICICI Bank Card x9876 at AMAZON PAY on 2026-10-02. Avl Lmt INR 1,20,000.00
Your A/C XX1234 is credited with INR 85,000.00 on 01-10-2026 by ACME CORP SALARY. -SBI`,
};
const sample = () => SAMPLES[getSettings().country === 'NP' ? 'NP' : 'IN'];

export const ProviderMark = ({ p, name, color, size = 'sm' }: { p?: Provider; name?: string; color?: string; size?: 'sm' | 'md' }) => (
  <IconTile text={monogram(p?.name ?? name ?? '?')} color={p?.color ?? color ?? PALETTE.gray} size={size} />
);

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** The account a row names outright (by name, card/account digits or provider). Anything else is only a guess. */
function namedAccount(p: Resolved, accounts: Account[]) {
  return (p.accountName && accounts.find((a) => same(a.name, p.accountName!)))
    || (p.last4 && accounts.find((a) => a.last4 && (a.last4.endsWith(p.last4!) || p.last4!.endsWith(a.last4))))
    || (p.provider && accounts.find((a) => a.provider === p.provider))
    || undefined;
}

/** Keeps confident account matches; other rows get `fallback` (an account the person chose) or none, so they must pick. */
async function assign(rows: Resolved[], fallback?: number) {
  const accounts = await db.accounts.toArray();
  return rows.map((r) => ({ ...r, accountId: namedAccount(r, accounts)?.id ?? (accounts.some((a) => a.id === fallback) ? fallback : undefined) }));
}

type Draft = Resolved & { amountText: string; skip?: boolean };

function Preview({ rows, source, skipped = 0, onDone }: { rows: Resolved[]; source: 'sms' | 'csv'; skipped?: number; onDone: () => void }) {
  const { toast } = useApp();
  const accounts = useLiveQuery(() => db.accounts.toArray()) ?? [];
  const categories = useLiveQuery(() => db.categories.toArray()) ?? [];
  const [list, setList] = useState<Draft[]>(() => rows.map((r) => ({ ...r, amountText: r.foreign ? '' : String(r.amount) })));
  const [busy, setBusy] = useState(false);
  const patch = (i: number, p: Partial<Draft>) => setList((l) => l.map((r, j) => (j === i ? { ...r, ...p } : r)));

  const live = list.filter((r) => !r.duplicate && !r.skip);
  const amountOk = (r: Draft) => { const v = Number(r.amountText.replace(/,/g, '')); return Number.isFinite(v) && v > 0 && v <= 1e9; };
  const accountOk = (r: Draft) => !!r.accountId && accounts.some((a) => a.id === r.accountId);
  const noAccount = live.filter((r) => !accountOk(r)).length;
  const noAmount = live.filter((r) => !amountOk(r)).length;
  const dupes = list.filter((r) => r.duplicate).length;
  const blocked = !live.length || noAccount > 0 || noAmount > 0;
  const sym = currencySymbol();

  async function save() {
    if (blocked || busy) return;
    setBusy(true);
    try {
      const out: Resolved[] = live.map(({ amountText, skip: _skip, ...r }) => {
        const amount = Math.round(Number(amountText.replace(/,/g, '')) * 100) / 100;
        return r.foreign ? { ...r, amount, foreign: undefined, note: `Converted from a ${r.foreign} charge. ${r.note ?? ''}`.trim() } : { ...r, amount };
      });
      const { added } = await ingest(out, source);
      toast(added ? `Added ${added} transaction${added === 1 ? '' : 's'}` : 'Nothing new to add');
      onDone();
    } finally {
      setBusy(false);
    }
  }

  async function discard() {
    if (await confirm({ title: 'Discard these transactions?', message: 'Nothing will be added.', confirmLabel: 'Discard', destructive: true })) onDone();
  }

  return (
    <div className="stack">
      <section className="card sb-prev-head">
        <h2 className="t-title3">{live.length} to add</h2>
        <p className="t-subhead secondary">
          {dupes ? `${dupes} already in Khata and will be skipped. ` : ''}Check the amount, account and category of each one.
        </p>
        {skipped > 0 && (
          <p className="sb-warn-line"><TriangleAlert size={16} aria-hidden="true" /> {skipped} row{skipped === 1 ? '' : 's'} couldn't be read and {skipped === 1 ? 'was' : 'were'} left out.</p>
        )}
        {noAccount > 0 && accounts.length > 0 && (
          <label className="field">
            <span className="field-label">{noAccount} need{noAccount === 1 ? 's' : ''} an account. Set all of them to</span>
            <select value="" onChange={(e) => { const id = +e.target.value; if (id) setList((l) => l.map((r) => (!r.duplicate && !r.skip && !accountOk(r) ? { ...r, accountId: id } : r))); }}>
              <option value="">Choose account</option>
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </label>
        )}
      </section>

      <ul className="sb-prev-list">
        {list.map((r, i) => {
          const off = r.duplicate || r.skip;
          const missingAcc = !off && !accountOk(r);
          const missingAmt = !off && !amountOk(r);
          return (
            <li key={i} className={`sb-prev-row ${off ? 'off' : ''} ${missingAcc || missingAmt ? 'needs' : ''}`}>
              <div className="sb-prev-top">
                <div className="sb-prev-name">
                  <span className="t-headline ellipsis">{r.name}</span>
                  <span className="t-footnote secondary">{prettyDate(r.date)} · {r.type === 'income' ? 'Income' : 'Expense'}</span>
                </div>
                {r.duplicate ? <span className="badge">Already in Khata</span> : (
                  <button type="button" className="close-btn" aria-label={r.skip ? `Include ${r.name}` : `Leave out ${r.name}`} aria-pressed={!!r.skip} onClick={() => patch(i, { skip: !r.skip })}>
                    {r.skip ? <Check size={16} /> : <X size={16} />}
                  </button>
                )}
              </div>
              {r.foreign && !off && (
                <p className="sb-warn-line"><TriangleAlert size={16} aria-hidden="true" /> {r.foreign} charge ({r.foreign} {r.amount}). Enter the amount in your currency.</p>
              )}
              {!off && (
                <div className="sb-prev-fields">
                  <label className={`sb-amt ${missingAmt ? 'bad' : ''}`}>
                    <span className="sr">Amount</span>
                    <span className="sb-amt-sym" aria-hidden="true">{r.type === 'income' ? '+' : '−'}{sym}</span>
                    <input inputMode="decimal" value={r.amountText} placeholder={r.foreign ? 'Amount' : '0'} aria-invalid={missingAmt || undefined}
                      onChange={(e) => patch(i, { amountText: e.target.value.replace(/[^\d.,]/g, '') })} />
                  </label>
                  <select aria-label="Account" className={missingAcc ? 'bad' : ''} aria-invalid={missingAcc || undefined} value={accountOk(r) ? r.accountId : ''}
                    onChange={(e) => patch(i, { accountId: +e.target.value || undefined })}>
                    <option value="" disabled>Choose account</option>
                    {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select>
                  <select aria-label="Category" value={r.categoryId ?? ''} onChange={(e) => patch(i, { categoryId: +e.target.value || undefined })}>
                    <option value="">No category</option>
                    {categories.filter((c) => c.kind === r.type).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
              )}
            </li>
          );
        })}
      </ul>

      <div className="sb-prev-bar">
        <p className="t-footnote secondary" role="status">
          {!accounts.length ? 'Add an account first.' : noAccount ? `Choose an account for ${noAccount} row${noAccount === 1 ? '' : 's'}.` : noAmount ? `Enter an amount for ${noAmount} row${noAmount === 1 ? '' : 's'}.` : live.length ? 'Ready to add.' : 'Nothing new to add.'}
        </p>
        <div className="row">
          <button type="button" className="btn gray" onClick={discard}>Discard</button>
          <button type="button" className="btn filled" disabled={blocked || busy} onClick={save}>Add {live.length || ''}</button>
        </div>
      </div>
    </div>
  );
}

function Linked() {
  const { toast } = useApp();
  const s = useSettings();
  const accounts = useLiveQuery(() => db.accounts.toArray()) ?? [];
  const auto = useLiveQuery(() => db.txs.filter((t) => t.source === 'sms' || t.source === 'csv').toArray()) ?? [];
  const [country, setCountry] = useState<'NP' | 'IN'>(s.country === 'IN' ? 'IN' : 'NP');
  const [q, setQ] = useState('');
  const [adding, setAdding] = useState<Provider | null>(null);
  const [last4, setLast4] = useState('');
  const [opening, setOpening] = useState('');
  const linked = accounts.filter((a) => a.provider || a.last4);
  const list = PROVIDERS.filter((p) => p.country === country && (!q || p.name.toLowerCase().includes(q.toLowerCase())));

  async function link() {
    if (!adding) return;
    if (await db.accounts.filter((a) => a.provider === adding.id).count()) {
      toast(`${adding.name} is already linked`);
      return setAdding(null);
    }
    await db.accounts.add({ name: adding.name, kind: adding.kind, opening: Number(opening) || 0, color: adding.color, provider: adding.id, last4: last4.trim() || undefined });
    toast(`${adding.name} linked`);
    setAdding(null);
  }

  return (
    <div className="stack">
      {linked.length > 0 && (
        <List header="Linked">
          {linked.map((a) => {
            const p = PROVIDERS.find((x) => x.id === a.provider);
            const n = auto.filter((t) => t.accountId === a.id).length;
            return (
              <Row key={a.id} icon={<ProviderMark p={p} name={a.name} color={a.color} />} title={a.name}
                subtitle={`${a.last4 ? `Ending ${a.last4}` : 'Matched by name'} · ${n} added automatically`}
                value={<Check size={18} className="pos" aria-label="Linked" />} />
            );
          })}
        </List>
      )}
      <div className="sb-filter">
        <Segmented value={country} options={[['NP', 'Nepal'], ['IN', 'India']] as const} onChange={setCountry} aria-label="Country" block={false} />
        <label className="sb-search">
          <Search size={17} aria-hidden="true" />
          <input type="search" placeholder="Search" aria-label="Search banks and wallets" value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
      </div>
      <List header="Add a bank or wallet" footer="Khata never connects to your bank. It reads the alerts your bank already sends you.">
        {list.map((p) => {
          const has = accounts.some((a) => a.provider === p.id);
          return (
            <Row key={p.id} icon={<ProviderMark p={p} />} title={p.name} subtitle={p.kind === 'wallet' ? 'Wallet' : 'Bank'}
              accessory="none"
              value={has ? <span className="t-subhead secondary">Linked</span> : <span className="btn tinted sm" aria-hidden="true">Link</span>}
              onClick={has ? undefined : () => (setAdding(p), setLast4(''), setOpening(''))} />
          );
        })}
        {!list.length && <Row title="No match" subtitle="Add it as an account under Accounts instead." />}
      </List>
      {adding && (
        <Sheet title={`Link ${adding.name}`} onClose={() => setAdding(null)} dirty={!!(last4 || opening)} size="sm" action={{ label: 'Link', onClick: () => void link() }}>
          <form className="form" onSubmit={(e) => (e.preventDefault(), void link())}>
            <div className="sb-link-head">
              <ProviderMark p={adding} size="md" />
              <p className="t-subhead secondary">
                Alerts that mention {adding.name}{adding.kind === 'bank' ? ' or your account number' : ''} will be filed under this account.
                {adding.note && <> {adding.note}</>}
              </p>
            </div>
            {adding.kind === 'bank' && (
              <Field label="Last 4 digits (optional)" hint="Of your account or card. Helps if you have two.">
                <input inputMode="numeric" maxLength={4} placeholder="1234" value={last4} onChange={(e) => setLast4(e.target.value.replace(/\D/g, ''))} />
              </Field>
            )}
            <Field label="Current balance (optional)">
              <input inputMode="decimal" placeholder="0" value={opening} onChange={(e) => setOpening(e.target.value)} />
            </Field>
            <button className="btn filled lg block">Link {adding.name}</button>
          </form>
        </Sheet>
      )}
    </div>
  );
}

function Paste({ initial }: { initial?: string }) {
  const { toast } = useApp();
  const [text, setText] = useState(initial ?? '');
  const [rows, setRows] = useState<Resolved[] | null>(null);

  async function read(t = text) {
    const parsed = await assign(await resolve(parseSmsBlob(t)));
    if (parsed.length) setRows(parsed);
    else toast('No transactions found in that text');
  }
  // arriving from /silent_add with a message that needs a hand (e.g. a foreign-currency charge)
  useEffect(() => {
    if (initial) void read(initial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (rows) return <Preview rows={rows} source="sms" onDone={() => (setRows(null), setText(''))} />;
  return (
    <section className="card form">
      <ol className="steps">
        <li><span>In Messages, long-press your bank or wallet alerts and <b>copy</b> them. Many at once is fine.</span></li>
        <li><span><b>Paste</b> below. Amount, merchant, date and account are read for you. OTPs, offers and failed payments are skipped.</span></li>
        <li><span>Check the list and tap <b>Add</b>. Anything added before is skipped.</span></li>
      </ol>
      <textarea className="sb-textarea" value={text} onChange={(e) => setText(e.target.value)} placeholder={sample()} aria-label="Messages" />
      <div className="row">
        <button type="button" className="btn filled" disabled={!text.trim()} onClick={() => void read()}>Read messages</button>
        <button type="button" className="btn gray" onClick={() => navigator.clipboard?.readText().then(setText).catch(() => toast('Long-press the box and paste instead'))}>
          <ClipboardPaste size={16} aria-hidden="true" /> Paste
        </button>
        <button type="button" className="btn plain" onClick={() => setText(sample())}>Try a sample</button>
      </div>
    </section>
  );
}

function CopyUrl({ u }: { u: string }) {
  const { toast } = useApp();
  return (
    <div className="sb-url">
      <code>{u}</code>
      <button type="button" className="btn gray sm" onClick={() => navigator.clipboard.writeText(u).then(() => toast('Copied'), () => toast('Select and copy it manually'))}>Copy</button>
    </div>
  );
}

function Auto() {
  const { linkKey } = useSettings();
  const [os, setOs] = useState<'android' | 'iphone' | 'share'>(/iphone|ipad/i.test(navigator.userAgent) ? 'iphone' : 'android');
  const base = `${absoluteUrl('/silent_add')}?k=${encodeURIComponent(linkKey)}`;
  return (
    <div className="stack">
      <div className="banner">
        <IconTile color={PALETTE.purple}><Wand2 size={20} /></IconTile>
        <p className="body t-footnote secondary">
          Banks in India and Nepal don't offer a free way for personal apps to connect, and a web app can't read your inbox. So Khata works
          from the alerts your bank already sends. Set this up once and every alert files itself.
        </p>
      </div>
      <Segmented value={os} options={[['android', 'Android'], ['iphone', 'iPhone'], ['share', 'Share']] as const} onChange={setOs} aria-label="Phone" />

      {os === 'android' && (
        <section className="card stack">
          <h2 className="t-headline sb-h"><Smartphone size={18} aria-hidden="true" /> Forward alerts with MacroDroid</h2>
          <ol className="steps">
            <li><span>Install Khata to your home screen first (Preferences, then Install app) so alerts open in the app.</span></li>
            <li><span>Install <b>MacroDroid</b> (free) from the Play Store and let it read SMS.</span></li>
            <li><span>Add a macro. Trigger: <b>SMS Received</b> from your bank and wallet senders, or any number with content containing <i>debited</i>, <i>credited</i> or <i>paid</i>.</span></li>
            <li><span>Action: <b>Open Website</b> with this address, putting the sender and message in with the magic-text button:</span></li>
          </ol>
          <CopyUrl u={`${base}&from=[sms_number]&sms=[sms_message]`} />
          <p className="t-footnote secondary">Using Tasker instead? Same address with <code>%SMSRF</code> and <code>%SMSRB</code>. Keep <code>sms=</code> last.</p>
          <a className="btn gray" href={`${base}&from=TEST&sms=${encodeURIComponent(sample().split('\n')[0])}`}>Test with a sample alert</a>
        </section>
      )}

      {os === 'iphone' && (
        <section className="card stack">
          <h2 className="t-headline sb-h"><Smartphone size={18} aria-hidden="true" /> Forward alerts with Shortcuts</h2>
          <ol className="steps">
            <li><span>Open <b>Shortcuts</b>, then Automation, New, <b>Message</b>. Set “Message contains” to <i>debited</i> and choose <b>Run Immediately</b>.</span></li>
            <li><span>Add <b>URL Encode</b> on the Shortcut Input's <i>Content</i>, then <b>Open URLs</b> with this address followed by the encoded text:</span></li>
          </ol>
          <CopyUrl u={`${base}&sms=`} />
          <p className="t-footnote secondary">Repeat for <i>credited</i> and <i>paid</i>.</p>
          <p className="t-footnote secondary">
            Heads-up: iOS opens links in Safari, which keeps separate data from a home-screen app. If you automate on iPhone, use Khata in
            Safari, or paste messages in the Paste tab.
          </p>
        </section>
      )}

      {os === 'share' && (
        <section className="card stack">
          <h2 className="t-headline sb-h"><Share2 size={18} aria-hidden="true" /> Share a message to Khata</h2>
          <ol className="steps">
            <li><span>Install Khata to your home screen (Android with Chrome or Edge).</span></li>
            <li><span>In Messages, long-press an alert, tap <b>Share</b>, then <b>Khata</b>. It's added straight away.</span></li>
          </ol>
          <p className="t-footnote secondary">No setup, one tap per message. Good if you only get a few alerts a day.</p>
        </section>
      )}

      <QuickLinks />
    </div>
  );
}

function QuickLinks() {
  const { toast } = useApp();
  const { linkKey } = useSettings();
  const accounts = useLiveQuery(() => db.accounts.toArray()) ?? [];
  const categories = useLiveQuery(() => db.categories.toArray()) ?? [];
  const [f, setF] = useState({ amount: '120', type: 'expense', name: 'Coffee', account: '', category: '' });
  const q = new URLSearchParams([['k', linkKey], ...Object.entries(f).filter(([k, v]) => v && !(k === 'type' && v === 'expense'))]);
  const url = `${absoluteUrl('/silent_add')}?${q.toString().replace(/\+/g, '%20')}`;
  const set = (k: string, v: string) => setF({ ...f, [k]: v });

  async function newKey() {
    const ok = await confirm({
      title: 'Make a new link key?',
      message: 'Links and automations you set up before will ask before adding, until you copy the new address into them.',
      confirmLabel: 'Make new key',
    });
    if (ok) (setSettings({ linkKey: randomToken() }), toast('New link key made'));
  }

  return (
    <details className="card sb-details">
      <summary className="t-headline">One-tap links for things you buy often</summary>
      <div className="form">
        <p className="t-subhead secondary">Opening this link records the expense straight away. Pin it to your home screen or a voice-assistant shortcut.</p>
        <div className="cols">
          <Field label="Amount"><input inputMode="decimal" value={f.amount} onChange={(e) => set('amount', e.target.value)} /></Field>
          <Field label="Type">
            <select value={f.type} onChange={(e) => setF({ ...f, type: e.target.value, category: '' })}><option value="expense">Expense</option><option value="income">Income</option></select>
          </Field>
        </div>
        <Field label="Name"><input value={f.name} onChange={(e) => set('name', e.target.value)} /></Field>
        <div className="cols">
          <Field label="Account">
            <select value={f.account} onChange={(e) => set('account', e.target.value)}>
              <option value="">Default</option>
              {accounts.map((a) => <option key={a.id}>{a.name}</option>)}
            </select>
          </Field>
          <Field label="Category">
            <select value={f.category} onChange={(e) => set('category', e.target.value)}>
              <option value="">Automatic</option>
              {categories.filter((c) => c.kind === f.type).map((c) => <option key={c.id}>{c.name}</option>)}
            </select>
          </Field>
        </div>
        <CopyUrl u={url} />
        <div className="row">
          <a className="btn gray" href={url}>Test it</a>
          <button type="button" className="btn plain" onClick={newKey}>Make a new link key</button>
        </div>
        <p className="t-footnote secondary">
          Parameters: <code>amount</code> (required) · <code>type</code> · <code>name</code> · <code>account</code> · <code>category</code> ·{' '}
          <code>description</code> · <code>date</code> (yyyy-mm-dd), or <code>sms</code> with an alert's text. <code>k</code> is your private
          key: links without it ask before adding.
        </p>
      </div>
    </details>
  );
}

function Statement() {
  const { toast } = useApp();
  const accounts = useLiveQuery(() => db.accounts.toArray()) ?? [];
  const [account, setAccount] = useState('');
  const [rows, setRows] = useState<{ list: Resolved[]; skipped: number } | null>(null);
  if (rows) return <Preview rows={rows.list} skipped={rows.skipped} source="csv" onDone={() => setRows(null)} />;
  return (
    <section className="card form">
      <h2 className="t-headline sb-h"><FileSpreadsheet size={18} aria-hidden="true" /> Import a statement</h2>
      <p className="t-subhead secondary">
        Download your statement from net banking or your wallet app as <b>CSV</b>. If it only offers Excel, open it and “Save as CSV”.
        Khata finds the date, description and debit/credit columns by itself. Exports from other expense apps work too.
      </p>
      <Field label="Put rows that don't name an account in">
        <select value={account} onChange={(e) => setAccount(e.target.value)}>
          <option value="">Choose for each row</option>
          {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
      </Field>
      <label className="btn filled">
        Choose CSV file
        <input type="file" accept=".csv,text/csv,text/plain" hidden
          onChange={async (e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (!file) return;
            const st = parseStatement(parseCsv(await file.text()));
            const skipped = st.skipped ?? 0;
            const list = await assign(await resolve(st, +account || undefined), +account || undefined);
            if (list.length) setRows({ list, skipped });
            else toast(skipped ? `No transactions found. ${skipped} row${skipped === 1 ? '' : 's'} couldn't be read.` : 'No transactions found. Does the file have a header row with a Date column?');
          }} />
      </label>
      <button type="button" className="btn plain"
        onClick={() => download('khata-template.csv', toCsv([
          ['date', 'type', 'name', 'amount', 'account', 'category', 'note'],
          [todayISO(), 'expense', 'Coffee', 120, 'Cash', 'Coffee & Tea', ''],
        ]))}>
        Download a blank template
      </button>
    </section>
  );
}

function Rules() {
  const categories = useLiveQuery(() => db.categories.toArray()) ?? [];
  return (
    <div className="stack">
      <p className="t-footnote secondary sb-note">
        Teach Khata your merchants: when a name contains the text, it gets that category. Rules beat the built-in guesses and apply
        everywhere: SMS, statements, links and the add form.
      </p>
      <EntityManager<Rule>
        noun="rule"
        table={db.rules}
        empty="No rules yet"
        blank={{ pattern: '', categoryId: undefined as unknown as number }}
        fields={[
          { key: 'pattern', label: 'Name contains', type: 'text', placeholder: 'e.g. chiya pasal' },
          { key: 'categoryId', label: 'Category', type: 'select', options: categories.map((c) => ({ value: c.id, label: `${c.name} (${c.kind === 'income' ? 'income' : 'expense'})` })) },
        ]}
        row={(r) => {
          const c = categories.find((x) => x.id === r.categoryId);
          return { icon: c?.icon ?? 'circle-ellipsis', color: c?.color ?? PALETTE.gray, title: `“${r.pattern}”`, sub: c?.name ?? 'Deleted category' };
        }}
      />
      <p className="t-footnote secondary sb-note">Common merchants like Swiggy, Daraz, Pathao and NEA are already known.</p>
    </div>
  );
}

export function Connect() {
  const accounts = useLiveQuery(() => db.accounts.toArray());
  const { state } = useLocation();
  const pasted = typeof (state as { paste?: unknown } | null)?.paste === 'string' ? (state as { paste: string }).paste : undefined;
  const [tab, setTab] = useState<Tab | null>(pasted ? 'paste' : null);
  const current = tab ?? (accounts?.some((a) => a.provider || a.last4) ? 'paste' : 'linked');
  return (
    <Screen title="Banks & SMS" back className="sb">
      <div className="sb-tabs"><Segmented value={current} options={TABS} onChange={setTab} aria-label="Section" /></div>
      {accounts && (
        <>
          {current === 'linked' && <Linked />}
          {current === 'paste' && <Paste initial={pasted} />}
          {current === 'auto' && <Auto />}
          {current === 'csv' && <Statement />}
          {current === 'rules' && <Rules />}
        </>
      )}
    </Screen>
  );
}
