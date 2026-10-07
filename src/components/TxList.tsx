import { useEffect, useRef, useState } from 'react';
import { Paperclip, Trash2 } from 'lucide-react';
import { db, type Account, type Category, type Tx } from '../db';
import { prettyDate, todayISO } from '../lib/format';
import { haptic } from '../lib/haptics';
import { useApp } from './context';
import { actionSheet } from './Dialogs';
import { Empty } from './Empty';
import { IconTile } from './Icon';
import { Money } from './Money';

const SOURCE: Record<string, string> = { sms: 'SMS', csv: 'Import', link: 'Link', recurring: 'Auto' };
const ACTION_W = 88;
const LONG_PRESS_MS = 480;

export function TxList({ txs, accounts, categories, empty = 'No transactions yet' }: {
  txs: Tx[];
  accounts: Account[];
  categories: Category[];
  empty?: string;
}) {
  const [openId, setOpenId] = useState<number | null>(null);
  const acc = new Map(accounts.map((a) => [a.id, a]));
  const cat = new Map(categories.map((c) => [c.id, c]));

  // tapping anywhere else closes an open swipe row
  useEffect(() => {
    if (openId == null) return;
    const close = (e: PointerEvent) => !(e.target as HTMLElement).closest?.(`[data-swipe="${openId}"]`) && setOpenId(null);
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [openId]);

  if (!txs.length) return <Empty icon="receipt" title={empty} message="Tap + to log an expense. It takes a few seconds." />;

  const days = new Map<string, Tx[]>();
  for (const t of txs) days.set(t.date, [...(days.get(t.date) ?? []), t]);

  return (
    <div className="txlist">
      {[...days].map(([date, list]) => {
        const net = list.reduce((s, t) => s + (t.type === 'income' ? t.amount : t.type === 'expense' ? -t.amount : 0), 0);
        return (
          <section key={date} className="tx-day">
            <h3 className="day-head">
              <span>{prettyDate(date)}</span>
              <Money value={net} kind={net > 0 ? 'income' : net < 0 ? 'expense' : 'neutral'} className="day-net" />
            </h3>
            <div className="list">
              {list.map((t) => (
                <TxRow key={t.id} t={t} cat={t.categoryId != null ? cat.get(t.categoryId) : undefined} acc={acc}
                  open={openId === t.id} setOpen={(o) => setOpenId(o ? t.id : null)} />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function TxRow({ t, cat: c, acc, open, setOpen }: {
  t: Tx;
  cat?: Category;
  acc: Map<number, Account>;
  open: boolean;
  setOpen: (o: boolean) => void;
}) {
  const { editTx, toast } = useApp();
  const [dx, setDx] = useState(0);
  const [dragging, setDragging] = useState(false);
  const g = useRef<{ x: number; y: number; id: number; base: number; mode: 'idle' | 'h' | 'v'; moved: boolean } | null>(null);
  const press = useRef(0);
  const suppressClick = useRef(false);

  useEffect(() => setDx(open ? -ACTION_W : 0), [open]);

  const where = t.type === 'transfer'
    ? `${acc.get(t.accountId)?.name ?? 'Unknown'} → ${acc.get(t.toAccountId!)?.name ?? 'Unknown'}`
    : [c?.name ?? 'No category', acc.get(t.accountId)?.name].filter(Boolean).join(' · ');

  async function remove() {
    const old = await db.txs.get(t.id);
    setOpen(false);
    await db.txs.delete(t.id);
    haptic('medium');
    if (old) toast(`Deleted “${old.name}”`, { label: 'Undo', run: () => void db.txs.add(old) });
  }
  async function duplicate() {
    const { id: _id, hash: _h, ...rest } = t;
    const id = await db.txs.add({ ...rest, date: todayISO(), source: 'manual' });
    haptic('success');
    toast(`Duplicated “${t.name}” for today`, { label: 'Undo', run: () => void db.txs.delete(id) });
  }
  async function menu() {
    clearTimeout(press.current);
    haptic('medium');
    setOpen(false);
    const choice = await actionSheet({
      title: t.name,
      actions: [
        { label: 'Edit', value: 'edit' as const },
        { label: 'Duplicate', value: 'dup' as const },
        { label: 'Delete', value: 'del' as const, destructive: true },
      ],
    });
    if (choice === 'edit') editTx(t);
    else if (choice === 'dup') duplicate();
    else if (choice === 'del') remove();
  }

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    g.current = { x: e.clientX, y: e.clientY, id: e.pointerId, base: open ? -ACTION_W : 0, mode: 'idle', moved: false };
    suppressClick.current = false;
    if (e.pointerType !== 'mouse') {
      press.current = window.setTimeout(() => {
        suppressClick.current = true;
        g.current = null;
        menu();
      }, LONG_PRESS_MS);
    }
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const s = g.current;
    if (!s || s.id !== e.pointerId) return;
    const mx = e.clientX - s.x;
    const my = e.clientY - s.y;
    if (s.mode === 'idle') {
      if (Math.abs(mx) < 8 && Math.abs(my) < 8) return;
      clearTimeout(press.current);
      s.mode = Math.abs(mx) > Math.abs(my) ? 'h' : 'v';
      if (s.mode === 'h') {
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        setDragging(true);
      }
    }
    if (s.mode !== 'h') return;
    s.moved = true;
    let x = s.base + mx;
    // follow the finger leftwards, resist rightwards and past a full swipe
    if (x > 0) x = Math.sqrt(x) * 2;
    setDx(x);
  };
  const onPointerUp = (e: React.PointerEvent) => {
    clearTimeout(press.current);
    const s = g.current;
    g.current = null;
    setDragging(false);
    if (!s || s.mode !== 'h') return;
    suppressClick.current = true;
    const x = s.base + (e.clientX - s.x);
    const width = (e.currentTarget as HTMLElement).offsetWidth;
    if (x < -width * 0.6) {
      setDx(-width);
      remove();
    } else if (x < -ACTION_W / 2) {
      setDx(-ACTION_W);
      setOpen(true);
    } else {
      setDx(0);
      setOpen(false);
    }
  };

  return (
    <div className="swipe" data-swipe={t.id}>
      <div className="swipe-actions" aria-hidden={!open} style={dx < 0 ? undefined : { visibility: 'hidden' }}>
        <button type="button" className="swipe-del" tabIndex={open ? 0 : -1} onClick={remove} style={{ width: Math.max(ACTION_W, -dx) }}>
          <Trash2 size={20} aria-hidden="true" />
          <span>Delete</span>
        </button>
      </div>
      <button
        type="button"
        className={`row-item tappable tx-row ${dragging ? 'dragging' : ''}`}
        style={dx ? { transform: `translateX(${dx}px)` } : undefined}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onContextMenu={(e) => (e.preventDefault(), menu())}
        onKeyDown={(e) => (e.key === 'Delete' || e.key === 'Backspace') && (e.preventDefault(), menu())}
        onClick={() => {
          if (suppressClick.current) return void (suppressClick.current = false);
          if (open) return setOpen(false);
          editTx(t);
        }}
      >
        {t.type === 'transfer' ? <IconTile name="transfer" color="#8e8e93" /> : <IconTile name={c?.icon} color={c?.color ?? '#8e8e93'} />}
        <span className="row-main">
          <span className="row-title">{t.name}</span>
          <span className="row-sub">
            <span className="ellipsis">{where}</span>
            {SOURCE[t.source] && <span className="badge">{SOURCE[t.source]}</span>}
            {t.photo && <Paperclip size={13} className="clip" aria-label="Has receipt" />}
          </span>
        </span>
        <Money value={t.amount} kind={t.type === 'income' ? 'income' : t.type === 'expense' ? 'expense' : 'transfer'} className="row-value" />
      </button>
    </div>
  );
}

export const byNewest = (a: Tx, b: Tx) => (a.date === b.date ? b.id - a.id : a.date < b.date ? 1 : -1);
