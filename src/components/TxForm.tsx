import { useEffect, useMemo, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { ArrowRight, Check, Calendar, Camera, ChevronDown, MapPin, NotebookPen, Plus, Tag as TagIcon, User, X, Zap } from 'lucide-react';
import { db, type Template, type Tx, type TxType } from '../db';
import { categorize } from '../lib/automation';
import { checkAlerts } from '../lib/notify';
import { currencySymbol, fromISO, getSettings, money, setSettings, toISO, todayISO, useSettings } from '../lib/format';
import { ACCOUNT_ICONS } from '../lib/icons';
import { Keypad, evalPartial, hasOperator, prettyExpr, prettyNumber, useKeyEntry, useLongPress } from './Keypad';
import { Icon, IconTile, Segmented, Sheet, actionSheet, haptic, useApp, useMediaQuery } from './ui';
import '../styles/quickadd.css';

const shiftDay = (n: number) => toISO(new Date(Date.now() + n * 864e5));

/** True when `el` sits in the top-most sheet or dialog (so nested sheets don't both react to keys). */
function inTopLayer(el: HTMLElement | null) {
  if (!el) return false;
  const roots = document.querySelectorAll('.sheet-root, .dialog-root');
  return !!roots.length && roots[roots.length - 1].contains(el);
}

function loadImage(file: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => (URL.revokeObjectURL(url), resolve(img));
    img.onerror = () => (URL.revokeObjectURL(url), reject(new Error('image')));
    img.src = url;
  });
}

/** Shrinks a photo to a JPEG under ~200 KB so receipts don't bloat the backup. Falls back to <canvas> on older browsers. */
async function shrink(file: File): Promise<Blob> {
  if (typeof OffscreenCanvas !== 'undefined' && typeof createImageBitmap === 'function') {
    try {
      const img = await createImageBitmap(file);
      const k = Math.min(1, 1280 / Math.max(img.width, img.height));
      const c = new OffscreenCanvas(Math.round(img.width * k), Math.round(img.height * k));
      c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
      return await c.convertToBlob({ type: 'image/jpeg', quality: 0.75 });
    } catch {
      // fall through to the canvas path
    }
  }
  const img = await loadImage(file);
  const k = Math.min(1, 1280 / Math.max(img.naturalWidth, img.naturalHeight));
  const c = document.createElement('canvas');
  c.width = Math.round(img.naturalWidth * k);
  c.height = Math.round(img.naturalHeight * k);
  c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
  return new Promise((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob'))), 'image/jpeg', 0.75));
}

/** Big rounded amount with the live expression under it ("120 + 45 = 165"). Not focusable: no OS keyboard. */
function AmountDisplay({ value, type, hint }: { value: string; type: TxType; hint?: string }) {
  const total = evalPartial(value);
  const expr = hasOperator(value);
  const big = !value ? '0' : expr ? prettyNumber(total) : prettyExpr(value);
  const len = big.length;
  return (
    <div className={`txf-amount ${type} ${value ? '' : 'empty'}`} role="status" aria-live="polite" aria-atomic="true"
      aria-label={`Amount ${value ? money(total, { force: true }) : 'empty'}`}>
      <div className="txf-big" aria-hidden="true">
        <span className="txf-cur">{currencySymbol()}</span>
        <span className={`txf-num ${len > 11 ? 'xs' : len > 8 ? 's' : ''}`}>{big}</span>
      </div>
      <div className="txf-expr" aria-hidden="true">{expr ? `${prettyExpr(value)} = ${prettyNumber(total)}` : hint ?? ''}</div>
    </div>
  );
}

/** One-tap quick pick; long-press or right-click opens its menu. */
function PickChip({ t, icon, color, onPick, onMenu }: { t: Template; icon?: string; color?: string; onPick: () => void; onMenu: () => void }) {
  const { consumed, ...press } = useLongPress(() => (haptic('medium'), onMenu()));
  return (
    <button type="button" className="txf-pick" {...press} onClick={() => !consumed() && onPick()}
      aria-label={`Add ${t.name}, ${money(t.amount, { force: true })} now`} title="Tap to add now. Hold for options.">
      {icon ? <IconTile name={icon} color={color} size="sm" /> : <span className="txf-pick-ic"><Zap size={14} strokeWidth={2.4} /></span>}
      <span className="ellipsis">{t.name}</span>
      <span className="txf-pick-amt num">{money(t.amount, { force: true })}</span>
    </button>
  );
}

/** Small keypad sheet for changing a quick pick's amount. */
function PickAmountSheet({ pick, onClose }: { pick: Template; onClose: () => void }) {
  const { toast } = useApp();
  const [v, setV] = useState(String(pick.amount));
  const ref = useRef<HTMLDivElement>(null);
  const total = evalPartial(v);
  const save = async () => {
    if (!(total > 0)) return;
    await db.templates.update(pick.id, { amount: total });
    haptic('success');
    toast(`“${pick.name}” is now ${money(total, { force: true })}`);
    onClose();
  };
  useKeyEntry({ active: () => inTopLayer(ref.current), value: v, onChange: setV, onEnter: save });
  return (
    <Sheet title={`${pick.name} amount`} onClose={onClose} dirty={total !== pick.amount} size="sm" cancelLabel="Cancel" className="txf"
      footer={<Keypad value={v} onChange={setV} onSubmit={save} submitDisabled={!(total > 0)} submitLabel={`Save ${total > 0 ? money(total, { force: true }) : ''}`} />}>
      <div ref={ref}><AmountDisplay value={v} type={pick.type} /></div>
    </Sheet>
  );
}

export function TxForm({ initial, onClose }: { initial: Partial<Tx>; onClose: () => void }) {
  const { toast } = useApp();
  const s = useSettings();
  const coarse = useMediaQuery('(pointer: coarse)');
  const accounts = useLiveQuery(() => db.accounts.toArray()) ?? [];
  const categories = useLiveQuery(() => db.categories.toArray()) ?? [];
  const tags = useLiveQuery(() => db.tags.toArray()) ?? [];
  const templates = useLiveQuery(() => db.templates.toArray()) ?? [];
  const historyQ = useLiveQuery(() => db.txs.orderBy('date').reverse().limit(500).toArray());
  const history = useMemo(() => historyQ ?? [], [historyQ]);

  const editing = initial.id != null;
  const [type, setType] = useState<TxType>(initial.type ?? 'expense');
  const [amount, setAmount] = useState(initial.amount ? String(initial.amount) : '');
  const [baseAmount, setBaseAmount] = useState(amount);
  // undefined = pick automatically, null = deliberately none (an edited row without a category)
  const [cat, setCat] = useState<number | null | undefined>(editing ? (initial.categoryId ?? null) : initial.categoryId);
  const [guess, setGuess] = useState<number>();
  const [accountId, setAccountId] = useState(initial.accountId);
  const [toAccountId, setToAccountId] = useState(initial.toAccountId);
  const [date, setDate] = useState(initial.date ?? todayISO());
  const [name, setName] = useState(initial.name ?? '');
  const [showName, setShowName] = useState(!!initial.name);
  const [note, setNote] = useState(initial.note ?? '');
  const [tagIds, setTagIds] = useState<number[]>(initial.tagIds ?? []);
  const [photo, setPhoto] = useState(initial.photo);
  const [photoUrl, setPhotoUrl] = useState<string>();
  const [details, setDetails] = useState(!!(initial.note || initial.tagIds?.length || initial.photo));
  const [typing, setTyping] = useState(false);
  const [inlineDate, setInlineDate] = useState(false);
  const [editPick, setEditPick] = useState<Template | null>(null);
  const [pickSaved, setPickSaved] = useState(false);
  const [added, setAdded] = useState<{ msg: string; undo: () => unknown } | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const catRow = useRef<HTMLDivElement>(null);
  const dateInput = useRef<HTMLInputElement>(null);
  const nameInput = useRef<HTMLInputElement>(null);
  const saving = useRef(false);
  const typingTimer = useRef(0);

  const names = useMemo(() => {
    const count = new Map<string, number>();
    for (const t of history) if (t.name) count.set(t.name, (count.get(t.name) ?? 0) + 1);
    return [...count].sort((a, b) => b[1] - a[1]).slice(0, 40).map(([n]) => n);
  }, [history]);

  // most-used first so the usual ones are a single tap away
  // usage is counted once when history loads, so chips don't reshuffle under the finger after a save
  const [uses, setUses] = useState<Map<number, number> | null>(null);
  useEffect(() => {
    if (uses || !historyQ) return;
    const m = new Map<number, number>();
    for (const t of historyQ) if (t.categoryId) m.set(t.categoryId, (m.get(t.categoryId) ?? 0) + 1);
    setUses(m);
  }, [historyQ, uses]);
  const cats = useMemo(() => {
    const u = uses ?? new Map<number, number>();
    return categories.filter((c) => c.kind === type).sort((a, b) => (u.get(b.id) ?? 0) - (u.get(a.id) ?? 0) || a.id - b.id);
  }, [categories, uses, type]);

  const isCat = (id?: number | null) => (id != null && cats.some((c) => c.id === id) ? id : undefined);
  const autoCat = type === 'transfer' ? undefined : (isCat(guess) ?? isCat(s.lastCategoryByType?.[type]) ?? cats[0]?.id);
  const catId = type === 'transfer' ? undefined : cat === undefined ? autoCat : (cat ?? undefined);
  const category = categories.find((c) => c.id === catId);

  const byId = (id?: number) => accounts.find((a) => a.id === id);
  const account = byId(accountId) ?? byId(s.lastAccountId) ?? accounts[0];
  const toAccount = (toAccountId !== account?.id ? byId(toAccountId) : undefined) ?? accounts.find((a) => a.id !== account?.id);

  const total = evalPartial(amount);
  const canSave = total > 0 && !!account && (type !== 'transfer' || !!toAccount);

  const dirty = editing
    ? total !== initial.amount || type !== initial.type || name.trim() !== (initial.name ?? '').trim() || note !== (initial.note ?? '') ||
      date !== initial.date || account?.id !== initial.accountId || (type !== 'transfer' && catId !== initial.categoryId) ||
      (type === 'transfer' && toAccount?.id !== initial.toAccountId) || photo !== initial.photo ||
      tagIds.join() !== (initial.tagIds ?? []).join()
    : amount !== baseAmount || !!name.trim() || !!note.trim() || tagIds.length > 0 || !!photo;

  useEffect(() => {
    if (!photo) return setPhotoUrl(undefined);
    const url = URL.createObjectURL(photo);
    setPhotoUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [photo]);

  // keep the chosen category chip in view
  useEffect(() => {
    const row = catRow.current;
    const chip = row?.querySelector<HTMLElement>('[aria-checked="true"]');
    if (!row || !chip) return;
    const left = chip.offsetLeft - row.offsetLeft;
    if (left < row.scrollLeft || left + chip.offsetWidth > row.scrollLeft + row.clientWidth) row.scrollTo({ left: Math.max(0, left - 16) });
  }, [catId, cats.length]);

  // guess the category from the name while typing (rules, history, keywords)
  useEffect(() => {
    const n = name.trim();
    if (type === 'transfer' || n.length < 2) return setGuess(undefined);
    let live = true;
    const id = window.setTimeout(() => categorize({ name: n, type }).then((g) => live && setGuess(g)), 250);
    return () => ((live = false), window.clearTimeout(id));
  }, [name, type]);

  useEffect(() => () => window.clearTimeout(typingTimer.current), []);
  useEffect(() => setPickSaved(false), [total, catId, name, type]);

  useKeyEntry({ active: () => inTopLayer(root.current), value: amount, onChange: setAmount, onEnter: (shift) => save(shift && !editing) });

  async function save(another = false) {
    if (saving.current) return;
    if (!(total > 0)) return toast('Enter an amount');
    if (!account) return toast('Add an account first');
    if (type === 'transfer' && !toAccount) return toast('Add a second account to move money between');
    saving.current = true;
    const tx: Omit<Tx, 'id'> = {
      type,
      amount: total,
      name: name.trim() || (type === 'transfer' ? 'Transfer' : category?.name || 'Untitled'),
      date,
      accountId: account.id,
      toAccountId: type === 'transfer' ? toAccount!.id : undefined,
      categoryId: type === 'transfer' ? undefined : catId,
      note: note.trim() || undefined,
      tagIds,
      source: initial.source ?? 'manual',
      hash: initial.hash,
      photo,
    };
    let undo: () => unknown;
    try {
      if (editing) {
        const old = await db.txs.get(initial.id!);
        await db.txs.put({ ...tx, id: initial.id! });
        undo = () => (old ? db.txs.put(old) : db.txs.delete(initial.id!));
      } else {
        const id = await db.txs.add(tx);
        undo = () => db.txs.delete(id);
      }
    } catch {
      saving.current = false;
      return toast('Couldn’t save. Try again.');
    }
    const last = getSettings().lastCategoryByType;
    setSettings({ lastAccountId: account.id, ...(type !== 'transfer' && catId ? { lastCategoryByType: { ...last, [type]: catId } } : {}) });
    checkAlerts();
    haptic('success');
    const what = type === 'transfer' ? `${account.name} to ${toAccount!.name}` : (category?.name ?? tx.name);
    const msg = `${editing ? 'Saved · ' : ''}${money(total, { force: true })} · ${what}`;
    if (!another) {
      onClose();
      return toast(msg, { label: 'Undo', run: () => void undo() });
    }
    // the sheet stays open, so confirm inline instead of a toast over the keypad
    setAdded({ msg, undo });
    saving.current = false;
    setAmount('');
    setBaseAmount('');
    setName('');
    setShowName(false);
    setNote('');
    setTagIds([]);
    setPhoto(undefined);
    setCat(undefined);
    setGuess(undefined);
  }

  async function remove() {
    const ok = await actionSheet({ title: 'Delete this transaction?', actions: [{ label: 'Delete transaction', value: true, destructive: true }] });
    if (!ok) return;
    const old = await db.txs.get(initial.id!);
    await db.txs.delete(initial.id!);
    haptic('warning');
    checkAlerts();
    onClose();
    if (old) toast('Transaction deleted', { label: 'Undo', run: () => void db.txs.add(old) });
  }

  async function recordPick(t: Template) {
    if (saving.current) return;
    if (t.type === 'transfer') return fillFrom(t);
    const acc = byId(t.accountId) ?? account;
    if (!acc) return toast('Add an account first');
    saving.current = true;
    const id = await db.txs.add({ type: t.type, amount: t.amount, name: t.name, date: todayISO(), accountId: acc.id, categoryId: t.categoryId, tagIds: [], source: 'manual' });
    haptic('success');
    checkAlerts();
    onClose();
    toast(`${money(t.amount, { force: true })} · ${t.name}`, { label: 'Undo', run: () => void db.txs.delete(id) });
  }

  function fillFrom(t: Template) {
    setType(t.type);
    setAmount(String(t.amount));
    setCat(t.categoryId);
    setAccountId(t.accountId);
    setName(t.name);
    setShowName(true);
  }

  async function pickMenu(t: Template) {
    const v = await actionSheet({
      title: t.name,
      message: `${money(t.amount, { force: true })} quick pick`,
      actions: [
        { label: 'Edit amount', value: 'amount' as const },
        { label: 'Change details first', value: 'fill' as const },
        { label: 'Delete quick pick', value: 'delete' as const, destructive: true },
      ],
    });
    if (v === 'amount') setEditPick(t);
    else if (v === 'fill') fillFrom(t);
    else if (v === 'delete') {
      await db.templates.delete(t.id);
      toast(`Removed “${t.name}”`, { label: 'Undo', run: () => void db.templates.add(t) });
    }
  }

  async function saveTemplate() {
    if (!(total > 0)) return toast('Enter an amount first');
    if (type === 'transfer') return toast('Quick picks work for expenses and income');
    if (!account) return toast('Add an account first');
    const label = name.trim() || category?.name || 'Quick pick';
    await db.templates.add({ name: label, amount: total, type, accountId: account.id, categoryId: catId });
    haptic('success');
    setPickSaved(true);
  }

  async function chooseAccount(which: 'from' | 'to') {
    const list = which === 'to' ? accounts.filter((a) => a.id !== account?.id) : accounts;
    if (!list.length) return toast(which === 'to' ? 'Add a second account first' : 'Add an account first');
    const v = await actionSheet({
      title: which === 'to' ? 'To account' : type === 'transfer' ? 'From account' : type === 'income' ? 'Received in' : 'Paid with',
      actions: list.map((a) => ({ label: a.name, value: a.id, disabled: a.id === (which === 'to' ? toAccount?.id : account?.id) })),
    });
    if (v == null) return;
    if (which === 'to') setToAccountId(v);
    else setAccountId(v);
  }

  async function chooseDate() {
    const d2 = shiftDay(-2);
    const v = await actionSheet({
      title: 'Date',
      actions: [
        { label: 'Today', value: todayISO(), disabled: date === todayISO() },
        { label: 'Yesterday', value: shiftDay(-1), disabled: date === shiftDay(-1) },
        { label: fromISO(d2).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'short' }), value: d2, disabled: date === d2 },
        { label: 'Pick a date…', value: 'pick' },
      ],
    });
    if (!v) return;
    if (v !== 'pick') return setDate(v);
    const el = dateInput.current;
    try {
      if (!el || typeof el.showPicker !== 'function') throw new Error('no picker');
      el.showPicker();
    } catch {
      setInlineDate(true);
    }
  }

  const dateLabel =
    date === todayISO() ? 'Today' : date === shiftDay(-1) ? 'Yesterday'
      : fromISO(date).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: fromISO(date).getFullYear() === new Date().getFullYear() ? undefined : 'numeric' });

  const openName = () => {
    setShowName(true);
    requestAnimationFrame(() => nameInput.current?.focus());
  };
  const onNameFocus = () => (window.clearTimeout(typingTimer.current), setTyping(true));
  // a short delay so a tap that blurs the field still lands where it was aimed
  const onNameBlur = () => {
    window.clearTimeout(typingTimer.current);
    typingTimer.current = window.setTimeout(() => setTyping(false), 160);
  };

  const keysHidden = coarse && typing;
  const submitText = total > 0 ? `${editing ? 'Save' : 'Add'} ${money(total, { force: true })}` : editing ? 'Save' : 'Add';

  const accountChip = (which: 'from' | 'to') => {
    const a = which === 'to' ? toAccount : account;
    return (
      <button type="button" className="txf-meta" onClick={() => chooseAccount(which)}
        aria-label={`${which === 'to' ? 'To' : type === 'transfer' ? 'From' : 'Account'}: ${a?.name ?? 'none'}. Change`}>
        {a ? <span className="txf-dot" style={{ background: a.color }}><Icon name={ACCOUNT_ICONS[a.kind] ?? 'wallet'} size={12} strokeWidth={2.6} /></span> : null}
        <span className="ellipsis">{a?.name ?? (which === 'to' ? 'To…' : 'Account')}</span>
        <ChevronDown size={14} strokeWidth={2.6} className="txf-chev" aria-hidden="true" />
      </button>
    );
  };

  return (
    <>
      <Sheet
        title={editing ? 'Edit transaction' : 'New transaction'}
        onClose={onClose}
        dirty={dirty}
        dirtyTitle="Discard this transaction?"
        cancelLabel="Cancel"
        action={editing ? { label: 'Delete', onClick: remove } : undefined}
        className={`txf ${editing ? 'editing' : ''} ${keysHidden ? 'typing' : ''}`}
        footer={keysHidden ? (
          <button type="button" className="btn filled lg block txf-submit-solo" disabled={!canSave}
            onPointerDown={(e) => e.preventDefault()} onClick={() => save()}>{submitText}</button>
        ) : (
          <Keypad value={amount} onChange={setAmount} onSubmit={() => save()} submitLabel={submitText} submitDisabled={!canSave} />
        )}
      >
        <div ref={root} className="txf-body">
          {added && (
            <div className="txf-added" role="status">
              <Check size={16} strokeWidth={2.8} aria-hidden="true" />
              <span className="ellipsis">Added {added.msg}</span>
              <button type="button" className="btn plain sm" onClick={() => (void added.undo(), setAdded(null))}>Undo</button>
            </div>
          )}
          {!editing && templates.length > 0 && (
            <div className="txf-picks scroll-x" aria-label="Quick picks">
              {templates.map((t) => {
                const c = categories.find((x) => x.id === t.categoryId);
                return <PickChip key={t.id} t={t} icon={c?.icon} color={c?.color} onPick={() => recordPick(t)} onMenu={() => pickMenu(t)} />;
              })}
            </div>
          )}

          <Segmented value={type} aria-label="Type" options={[['expense', 'Expense'], ['income', 'Income'], ['transfer', 'Transfer']] as const}
            onChange={(v) => (setType(v), setCat(undefined))} />

          <AmountDisplay value={amount} type={type} hint={coarse ? undefined : 'Type an amount or a sum like 120+45'} />

          {type !== 'transfer' && cats.length > 0 && (
            <div ref={catRow} className="txf-cats scroll-x" role="radiogroup" aria-label="Category">
              {cats.map((c) => (
                <button type="button" role="radio" key={c.id} aria-checked={catId === c.id} className="txf-cat"
                  onClick={() => (haptic('light'), setCat(c.id))}>
                  <IconTile name={c.icon} color={c.color} size="md" />
                  <span className="ellipsis">{c.name}</span>
                </button>
              ))}
            </div>
          )}

          <div className="txf-metas">
            {accountChip('from')}
            {type === 'transfer' && <><ArrowRight size={16} className="txf-arrow" aria-hidden="true" />{accountChip('to')}</>}
            <span className="txf-date-wrap">
              <button type="button" className="txf-meta" onClick={chooseDate} aria-label={`Date: ${dateLabel}. Change`}>
                <Calendar size={15} strokeWidth={2.4} aria-hidden="true" />
                <span>{dateLabel}</span>
                <ChevronDown size={14} strokeWidth={2.6} className="txf-chev" aria-hidden="true" />
              </button>
              <input ref={dateInput} type="date" className="txf-date-input" tabIndex={-1} aria-hidden="true" value={date}
                onChange={(e) => e.target.value && setDate(e.target.value)} />
            </span>
            {!showName && (
              <button type="button" className="txf-meta" onClick={openName}>
                <NotebookPen size={15} strokeWidth={2.4} aria-hidden="true" />
                <span>Add note</span>
              </button>
            )}
          </div>

          {inlineDate && (
            <label className="txf-inline">
              <span className="sr">Date</span>
              <input type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} />
            </label>
          )}

          {showName && (
            <div className="txf-name">
              <input ref={nameInput} list="txf-names" value={name} enterKeyHint="done" autoComplete="off"
                aria-label={type === 'transfer' ? 'Note' : 'What was it for'}
                placeholder={type === 'expense' ? 'What was it for? Coffee, rent…' : type === 'income' ? 'From? Salary, refund…' : 'Note'}
                onChange={(e) => setName(e.target.value)} onFocus={onNameFocus} onBlur={onNameBlur}
                onKeyDown={(e) => {
                  if (e.key !== 'Enter') return;
                  e.preventDefault();
                  if (canSave) save();
                  else nameInput.current?.blur();
                }} />
              <datalist id="txf-names">{names.map((n) => <option key={n} value={n} />)}</datalist>
            </div>
          )}

          <button type="button" className="txf-more" aria-expanded={details} onClick={() => setDetails((x) => !x)}>
            <span>More details</span>
            <span className="txf-more-hint secondary">{[note && 'note', tagIds.length && `${tagIds.length} label${tagIds.length > 1 ? 's' : ''}`, photo && 'receipt'].filter(Boolean).join(', ')}</span>
            <ChevronDown size={18} className={`txf-chev ${details ? 'up' : ''}`} aria-hidden="true" />
          </button>

          {details && (
            <div className="txf-details">
              <label className="field">
                <span className="field-label">Note</span>
                <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} onFocus={onNameFocus} onBlur={onNameBlur} />
              </label>
              {tags.length > 0 && (
                <div className="field">
                  <span className="field-label">Labels, people, places</span>
                  <div className="chips">
                    {tags.map((t) => {
                      const on = tagIds.includes(t.id);
                      const G = t.kind === 'person' ? User : t.kind === 'place' ? MapPin : TagIcon;
                      return (
                        <button type="button" key={t.id} className="chip" aria-pressed={on}
                          onClick={() => setTagIds(on ? tagIds.filter((x) => x !== t.id) : [...tagIds, t.id])}>
                          <G size={14} strokeWidth={2.4} aria-hidden="true" />{t.name}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
              <div className="txf-receipt">
                {photoUrl && (
                  <a className="txf-thumb" href={photoUrl} target="_blank" rel="noreferrer">
                    <img src={photoUrl} alt="Receipt" />
                    <button type="button" className="close-btn" aria-label="Remove receipt" onClick={(e) => (e.preventDefault(), setPhoto(undefined))}><X size={14} strokeWidth={2.6} /></button>
                  </a>
                )}
                <label className="btn gray sm">
                  <Camera size={16} aria-hidden="true" /> {photoUrl ? 'Replace receipt' : 'Add receipt photo'}
                  <input type="file" accept="image/*" capture="environment" hidden
                    onChange={async (e) => {
                      const f = e.target.files?.[0];
                      e.target.value = '';
                      if (f) setPhoto(await shrink(f).catch(() => f));
                    }} />
                </label>
              </div>
              {!editing && (
                <div className="txf-actions">
                  <button type="button" className="btn tinted sm" onClick={saveTemplate} disabled={pickSaved}><Zap size={15} aria-hidden="true" /> {pickSaved ? 'Saved as quick pick' : 'Save as quick pick'}</button>
                  <button type="button" className="btn tinted sm" disabled={!canSave} onClick={() => save(true)}><Plus size={15} aria-hidden="true" /> Add and start another</button>
                </div>
              )}
            </div>
          )}
        </div>
      </Sheet>
      {editPick && <PickAmountSheet pick={editPick} onClose={() => setEditPick(null)} />}
    </>
  );
}
