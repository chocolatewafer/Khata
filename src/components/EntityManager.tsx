import { useState, type ReactNode } from 'react';
import type { Table } from 'dexie';
import { useLiveQuery } from 'dexie-react-hooks';
import { haptic } from '../lib/haptics';
import { ICON_KEYS, iconKey } from '../lib/icons';
import { useApp, useFab } from './context';
import { Field, Progress, SwatchPicker, Switch } from './controls';
import { confirm } from './Dialogs';
import { Empty } from './Empty';
import { Icon, IconTile } from './Icon';
import { List } from './List';
import { Sheet } from './Sheet';

type Opt = { value: string | number; label: string };
export interface FieldSpec {
  key: string;
  label: string;
  /**
   * `icon` = icon picker grid, `swatch` = palette chips. Legacy: `color` renders the swatch picker too,
   * and a `text` field whose key is "icon" renders the icon picker.
   */
  type: 'text' | 'number' | 'date' | 'select' | 'multi' | 'color' | 'swatch' | 'icon' | 'checkbox';
  options?: Opt[];
  optional?: boolean;
  placeholder?: string;
  hint?: ReactNode;
}
export interface RowView {
  /** Icon key (or legacy emoji) for an IconTile, or any node. */
  icon?: ReactNode;
  color?: string;
  /** Monogram text instead of an icon (e.g. provider accounts). */
  monogram?: string;
  title: string;
  sub?: ReactNode;
  right?: ReactNode;
  /** Any of the fields below turn the row into a tinted detail card. */
  tags?: string[];
  badge?: ReactNode;
  cols?: [string, ReactNode][];
  progress?: { value: number; max: number };
  foot?: ReactNode;
  footRight?: ReactNode;
}

function Tile({ v, size = 'md' }: { v: RowView; size?: 'sm' | 'md' | 'lg' }) {
  if (v.monogram) return <IconTile text={v.monogram} color={v.color} size={size} />;
  if (v.icon == null || typeof v.icon === 'string') return <IconTile name={v.icon as string | undefined} color={v.color} size={size} />;
  return <IconTile color={v.color} size={size}>{v.icon}</IconTile>;
}

export function IconPicker({ value, onChange, color, label = 'Icon' }: { value?: string; onChange: (k: string) => void; color?: string; label?: string }) {
  const current = iconKey(value);
  return (
    <div className="icon-grid" role="radiogroup" aria-label={label}>
      {ICON_KEYS.filter((k) => k !== 'transfer').map((k) => (
        <button type="button" role="radio" key={k} aria-checked={k === current} aria-label={k.replace(/-/g, ' ')}
          className={`icon-pick ${k === current ? 'on' : ''}`} style={color ? { ['--c' as string]: color } : undefined} onClick={() => onChange(k)}>
          <Icon name={k} size={20} />
        </button>
      ))}
    </div>
  );
}

/** List + add/edit/delete sheet for a Dexie table, driven by a field spec. The dock button adds a new one. */
export function EntityManager<T extends { id: number }>({
  table, fields, blank, row, filter, actions, noun, layout = 'list', empty, onDelete, prepare, header,
}: {
  noun: string;
  table: Table<T, number, Omit<T, 'id'> & { id?: number }>;
  fields: FieldSpec[];
  blank: Omit<T, 'id'>;
  row: (item: T) => RowView;
  filter?: (item: T) => boolean;
  actions?: (item: T) => ReactNode;
  layout?: 'list' | 'people';
  empty?: string;
  /**
   * Runs before deleting. Return false to cancel. Use it to ask your own question and move references.
   * Without it, a confirm dialog asks first and the toast offers Undo.
   */
  onDelete?: (item: T) => Promise<boolean>;
  /** Adjusts the draft just before it is saved. */
  prepare?: (draft: T) => T;
  /** Header text above a plain list. */
  header?: ReactNode;
}) {
  const { toast } = useApp();
  const all = useLiveQuery(() => table.toArray(), [table]);
  const items = filter ? all?.filter(filter) : all;
  const [draft, setDraft] = useState<Record<string, any> | null>(null);
  const [initial, setInitial] = useState('');
  const set = (k: string, v: unknown) => setDraft((d) => ({ ...d, [k]: v }));
  const open = (d: Record<string, any>) => (setDraft(d), setInitial(JSON.stringify(d)));
  useFab(() => open({ ...blank }));

  const dirty = !!draft && JSON.stringify(draft) !== initial;

  function clean(): T {
    const c: Record<string, any> = { ...draft };
    for (const f of fields) if (f.type === 'number') c[f.key] = Number(c[f.key]) || 0;
    return prepare ? prepare(c as T) : (c as T);
  }

  async function save(e?: React.FormEvent) {
    e?.preventDefault();
    if (!draft) return;
    const missing = fields.find((f) => !f.optional && ['text', 'select', 'date'].includes(f.type) && f.key !== 'icon' && (draft[f.key] == null || draft[f.key] === ''));
    if (missing) return toast(`Add ${missing.label.toLowerCase()} first`);
    await table.put(clean());
    haptic('success');
    setDraft(null);
  }

  async function remove(item: T) {
    const title = row(item).title;
    if (onDelete) {
      if (!(await onDelete(item))) return;
      await table.delete(item.id);
      haptic('medium');
      setDraft(null);
      return;
    }
    const ok = await confirm({ title: `Delete “${title}”?`, message: 'This can’t be undone.', confirmLabel: 'Delete', destructive: true });
    if (!ok) return;
    await table.delete(item.id);
    haptic('medium');
    setDraft(null);
    toast(`Deleted “${title}”`, { label: 'Undo', run: () => void table.put(item) });
  }

  const views = items?.map((it) => ({ it, v: row(it) })) ?? [];
  const rich = views.some(({ v }) => v.cols || v.progress || v.tags || v.badge != null);
  const tap = (it: T) => ({
    role: 'button',
    tabIndex: 0,
    onClick: () => open({ ...it }),
    onKeyDown: (e: React.KeyboardEvent) => (e.key === 'Enter' || e.key === ' ') && e.target === e.currentTarget && (e.preventDefault(), open({ ...it })),
  });

  const colorKey = fields.find((f) => f.type === 'color' || f.type === 'swatch')?.key;

  return (
    <>
      {items && !items.length && <Empty icon="circle-ellipsis" title={empty ?? `No ${noun}s yet`} message={`Tap + to add a ${noun}.`} />}
      {!!views.length && (layout === 'people' ? (
        <div className="people rise">
          {views.map(({ it, v }) => (
            <div className="person tinted-card" key={it.id} style={{ ['--c' as string]: v.color }} {...tap(it)}>
              <Tile v={v} size="lg" />
              <b className="t-headline">{v.title}</b>
              {v.sub && <span className="t-footnote secondary">{v.sub}</span>}
              {v.right != null && <span className="t-subhead num">{v.right}</span>}
            </div>
          ))}
        </div>
      ) : rich ? (
        <div className="cards rise">
          {views.map(({ it, v }) => (
            <div className="xcard tinted-card" key={it.id} style={{ ['--c' as string]: v.color }} {...tap(it)}>
              <div className="xhead">
                <Tile v={v} />
                <div className="body">
                  <div className="title">{v.title}</div>
                  {v.sub && <div className="muted">{v.sub}</div>}
                  {v.tags && <div className="tags">{v.tags.map((t) => <span className="tag" key={t}>{t}</span>)}</div>}
                </div>
                {v.badge != null && <span className="xbadge">{v.badge}</span>}
                {v.right != null && <b className="num xright">{v.right}</b>}
              </div>
              {v.cols && (
                <div className="xcols">
                  {v.cols.map(([label, value]) => (
                    <div key={label}><span>{label}</span><b className="num">{value}</b></div>
                  ))}
                </div>
              )}
              {v.progress && <Progress {...v.progress} warn color={v.color} />}
              {(v.foot || v.footRight || actions) && (
                <div className="xfoot">
                  <span>{v.foot}</span>
                  <span className="row" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>{v.footRight}{actions?.(it)}</span>
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <List header={header} className="rise-list">
          {views.map(({ it, v }) => (
            <div className="row-item tappable" key={it.id} {...tap(it)}>
              {(v.icon !== undefined || v.monogram) && <Tile v={v} size="sm" />}
              <span className="row-main">
                <span className="row-title">{v.title}</span>
                {v.sub && <span className="row-sub">{v.sub}</span>}
              </span>
              {v.right != null && <span className="row-value num">{v.right}</span>}
              {actions && <span onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>{actions(it)}</span>}
            </div>
          ))}
        </List>
      ))}

      {draft && (
        <Sheet
          title={`${draft.id ? 'Edit' : 'New'} ${noun}`}
          onClose={() => setDraft(null)}
          dirty={dirty}
          action={{ label: draft.id ? 'Done' : 'Add', onClick: () => void save() }}
        >
          <form className="form" onSubmit={save}>
            {fields.map((f) => {
              const val = draft[f.key];
              const type = f.type === 'text' && f.key === 'icon' ? 'icon' : f.type === 'color' ? 'swatch' : f.type;
              if (type === 'checkbox')
                return (
                  <div className="switch-row" key={f.key}>
                    <span>{f.label}</span>
                    <Switch on={!!val} onChange={(v) => set(f.key, v)} label={f.label} />
                  </div>
                );
              if (type === 'icon')
                return (
                  <div className="field" key={f.key}>
                    <span className="field-label">{f.label.replace(/\s*\(any emoji\)/i, '')}</span>
                    <IconPicker value={val} color={colorKey ? draft[colorKey] : undefined} onChange={(k) => set(f.key, k)} label={f.label} />
                  </div>
                );
              if (type === 'swatch')
                return (
                  <div className="field" key={f.key}>
                    <span className="field-label">{f.label}</span>
                    <SwatchPicker value={val} onChange={(c) => set(f.key, c)} label={f.label} />
                  </div>
                );
              if (type === 'multi')
                return (
                  <div className="field" key={f.key}>
                    <span className="field-label">{f.label}</span>
                    <div className="chips">
                      {f.options?.map((o) => {
                        const on = (val as unknown[])?.includes(o.value);
                        return (
                          <button type="button" key={o.value} aria-pressed={on} className={`chip ${on ? 'on' : ''}`}
                            onClick={() => set(f.key, on ? val.filter((x: unknown) => x !== o.value) : [...(val ?? []), o.value])}>
                            {o.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              if (type === 'select')
                return (
                  <Field label={f.label} key={f.key} hint={f.hint}>
                    <select required={!f.optional} value={val ?? ''} onChange={(e) => set(f.key, f.options?.find((o) => String(o.value) === e.target.value)?.value)}>
                      <option value="">{f.optional ? 'None' : 'Choose…'}</option>
                      {f.options?.map((o) => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                  </Field>
                );
              return (
                <Field label={f.label} key={f.key} hint={f.hint}>
                  <input
                    type={type}
                    step={type === 'number' ? 'any' : undefined}
                    inputMode={type === 'number' ? 'decimal' : undefined}
                    required={!f.optional}
                    placeholder={f.placeholder}
                    value={val ?? ''}
                    onChange={(e) => set(f.key, e.target.value === '' && f.optional ? undefined : e.target.value)}
                  />
                </Field>
              );
            })}
            <button type="submit" className="btn filled lg block">{draft.id ? 'Save' : `Add ${noun}`}</button>
            {draft.id && (
              <button type="button" className="btn destructive block" onClick={() => remove(all?.find((i) => i.id === draft.id) ?? (draft as T))}>
                Delete {noun}
              </button>
            )}
          </form>
        </Sheet>
      )}
    </>
  );
}
