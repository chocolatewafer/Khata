# Khata design system (v3), API reference for phase 2

Everything UI is imported from `src/components/ui.tsx` (barrel). Tokens and utility classes live in
`src/styles.css` (frozen in phase 2). Put screen CSS in your own `src/styles/<name>.css`, imported
from your component, using only the tokens below.

## Tokens (CSS custom properties)

Colour: `--bg` (grouped background), `--bg-elev` (cards, rows, sheets), `--bg-elev-2` (inputs,
raised inside a card), `--fill`, `--fill-strong` (tracks, chips, gray buttons), `--separator`,
`--label`, `--label-2`, `--label-3`, `--accent`, `--on-accent`, `--accent-tint`, `--hero-a`,
`--hero-b` (hero gradient), `--on-hero`, `--positive`, `--negative`, `--warning`, `--glass`
(use with `backdrop-filter: blur(24px) saturate(180%)`), `--delete` (solid swipe red),
`--shadow-float` (only for floating things), `--shadow-card`.

Type: `--font` (system / Inter), `--font-rounded` (money figures). Motion: `--ease` (sheets, nav,
thumbs), `--ease-quick` (presses). Layout: `--gutter` (16/24/32), `--side` (sidebar width),
`--nav-h` (nav bar height incl. safe area; use as `top` for sticky headers), `--dock-space`.

Identity palette (`PALETTE` in `src/lib/icons.ts`): red, orange, yellow, green, mint, teal, cyan,
blue, indigo, purple, pink, brown, gray. Tinted card: `color-mix(in srgb, <c> 16%, var(--bg-elev))`.

Old names (`--primary`, `--surface`, `--text-2`, `--muted`, `--serif`, ...) are aliases so old
markup renders; do not use them in new code. `--serif` now points at the rounded font: there is
no serif anywhere.

Breakpoints: phone ≤ 699, tablet 700–1023, desktop ≥ 1024 (sidebar, no tab bar). Sheets become
centred cards from 600.

## Utility classes

- Text styles: `.t-large .t-title1 .t-title2 .t-title3 .t-headline .t-body .t-callout .t-subhead
  .t-footnote .t-caption .t-hero` (hero amount, rounded). Colour: `.secondary` (label-2),
  `.tertiary` (label-3), `.pos`, `.neg`, `.accent`. `.num` = tabular numbers, `.rounded`,
  `.ellipsis`, `.sr` (screen-reader only), `.no-print`, `.hide-desktop`.
- Layout: `.stack` (vertical grid, gap 12), `.row` (flex, gap 8, wraps), `.between`, `.cols`
  (2 equal columns), `.cards` (1 / 2 / auto-fill 320px columns), `.tiles` (2 / 4 / 3 columns,
  each child auto-coloured), `.home-grid > .col` (two columns on desktop), `.scroll-x`.
- Buttons: `.btn` + variant `filled | tinted | gray | plain | destructive` + size `sm | lg` +
  `block` (+ `strong`). Default `.btn` = gray. Legacy `primary`=filled, `ghost`=plain,
  `danger`=destructive. `.icon-btn` (44 px round, label-2), `.nav-btn` (44 px round, accent; for
  `Screen` actions), `.close-btn` (30 px gray circle).
- Chips: `.chips` container, `.chip` (+ `.on` or `aria-pressed="true"`).
- Cards: `.card` (bg-elev, r22), `.tinted-card` (set `--c`), `.hero` (peach gradient, r28),
  `.stat` (+ `.fill`, `.pos-t`, `.neg-t`), `.banner`, `.badge`, `.tag`.
- Forms: `.form` (grid gap 16), inputs/selects/textarea are pre-styled, `.switch-row`.
- Motion: `.rise` staggers its first 6 children (fade + 8 px rise).
- Old classes still styled (migrate away): `.group/.item`, `.section`, `.greeting`, `.strip`,
  `.filters`, `.xcard/.xhead/.xcols/.xfoot`, `.tile/.tile-head/.tile-body`, `.cat-grid/.cat`,
  `.amount-input`, `.steps`, `.choice`, `.dots`, `.welcome`, `.empty`.

## Components

### Screen
`<Screen title subtitle? large? back? actions? className?>{children?}</Screen>`
- Tab pages: `<Screen title="Activity" actions={<button className="nav-btn" aria-label="Export"><Download size={22}/></button>}>`.
- Pushed pages: `back` (`true` = "Back", or a string label). Back goes `navigate(-1)` or Home.
- `subtitle` shows above the large title (uppercase footnote), e.g. the date on Home.
- `large={false}`: compact bar only, title always visible.
- With children it renders `<div class="screen stack">` around header + children; without
  children it renders just the header (so it can sit first inside your own `.stack`).
- `TopBar` / `PageHead` are legacy wrappers (TopBar adds a Preferences gear on phone/tablet).

### Sheet
`<Sheet title onClose dirty? dirtyTitle? dirtyMessage? action? cancelLabel? footer? size? hideTitle?>`
- `action={{ label: 'Save', onClick, disabled }}` puts a bold action top-right and Cancel top-left.
  Without `action`/`cancelLabel` there is a close (x) button top-right.
- `dirty` = unsaved input: Escape, backdrop, Cancel, close and drag-down all ask
  `dirtyTitle` (default "Discard changes?"; pass "Discard this transaction?" for TxForm).
- `footer` is pinned under the scrolling body (e.g. a `.btn filled lg block`).
- `size`: `sm` (420) | `md` (560, default) | `lg` (720) on ≥ 600 px.
- Focus moves to the first `autoFocus`/`[data-autofocus]` element (else the panel), is trapped,
  and is restored on close. Body scroll is locked; the dock hides while any sheet/dialog is open
  (`body.has-layer`). Calling `onClose()` yourself (after a save) closes immediately.
- `Modal({title, onClose, children, dirty?})` is a legacy wrapper.

### Dialogs (promise-based; host is mounted in App)
```ts
const ok = await confirm({ title: 'Delete “Rent”?', message: 'This can’t be undone.', confirmLabel: 'Delete', destructive: true });
const v = await actionSheet({ title: 'Move 12 transactions', actions: [{ label: 'To Cash', value: 1 }, { label: 'Delete them too', value: 'del', destructive: true }] }); // value or null
```
`confirm` options: `title, message?, confirmLabel? (default OK / Delete), cancelLabel?, destructive?`.
Action items: `label, value, destructive?, disabled?`. Never use `window.confirm/alert/prompt`.

### Toast
`const { toast } = useApp(); toast('Saved'); toast('Deleted “Coffee”', { label: 'Undo', run: () => db.txs.add(old) });`
Also `showToast(text, action?)` outside React. Action toasts stay ~6.5 s (paused on hover/focus)
and are never replaced by a plain toast (plain ones queue); a newer action toast replaces an older one.

### Segmented
`<Segmented value options onChange block? size? aria-label?>`; `options` = `['a','b']` (auto
capitalised) or `[['expense','Expense'], ...]`. `block` (default true) stretches; `size="sm"`.
Sliding thumb, arrow/Home/End keys, haptic on change. `Seg` = alias. `DockSeg` (same props)
renders in the floating dock instead of the tab bar (pushed pages' filters).

### Icon, IconTile
- `<Icon name size? strokeWidth? label?>`: `name` is a key from `ICONS` in `src/lib/icons.ts`
  (legacy emoji are mapped; unknown → `circle-ellipsis`). Decorative unless `label`.
- `<IconTile name? color? size="sm|md|lg|xl" text? label?>{children?}</IconTile>`: solid square
  (28/36/44/64 px), white glyph or dark on yellow/mint/cyan. `text` renders a monogram (provider
  accounts: `<IconTile text={monogram(name)} color={provider.color} />`). No `color` → accent tint.
- Helpers in `src/lib/icons.ts`: `ICONS`, `ICON_KEYS`, `IconKey`, `iconKey(v)`, `iconFor(v)`,
  `PALETTE`, `PALETTE_COLORS`, `nearestPalette(hex)`, `glyphOn(hex)`, `ACCOUNT_ICONS`
  (`bank→landmark, cash→banknote, card→credit-card, wallet→wallet`).
- `IconSq({icon, color?, small?})` is legacy (string → IconTile, node → tile with that node).

### List, Row
```tsx
<List header="Appearance" footer="Applies to this device." action={<Link to="/search">See all</Link>}>
  <Row icon="zap" color={PALETTE.orange} title="Banks & SMS" value="2 linked" to="/connect" />
  <Row title="Haptics" accessory="switch" checked={s.haptics} onToggle={(v) => setSettings({ haptics: v })} />
  <Row title="Delete all data" destructive onClick={wipe} accessory="none" />
</List>
```
Row props: `icon` (key or node), `color`, `iconSize` (default `sm`), `title`, `subtitle`, `value`
(string or node, e.g. `<Money>`), `accessory` `chevron|switch|none` (chevron is the default when
`to`/`onClick` is set), `to` (Link) or `onClick` (button), `destructive`, `children` (extra
content under the title). Separators inset automatically to the text.

### Money
`<Money value kind="expense|income|transfer|neutral" size="sm|md|lg|xl|hero" sign? force? className?>`
Expense shows `−` in label colour, income `+` in `--positive`, transfer secondary. Hidden mode
renders `••••` with `aria-label="Hidden"`. `money()` in format.ts now also returns `••••` when hidden.

### Empty
`<Empty icon="receipt" title="No transactions yet" message="Tap + to log one." action={{ label: 'Add', onClick }} compact? />`
(`action` may also be any node). `EmptyCup({text, hint})` is a legacy alias.

### Controls
- `Switch({on, onChange, label})`, `Progress({value, max, warn?, color?})` (6 px; amber ≥ 80 % with
  `warn`, red when over; colour from `color` or inherited `--c`), `Field({label, hint?, children})`
  (label above control), `SwatchPicker({value, onChange, label?})`, `IconPicker({value, onChange,
  color?, label?})`, `AmountPrompt({title, onSave(amount, date), onClose})`, `Logo({still?})`,
  `tintFor(id)` (stable palette colour).

### EntityManager
```tsx
<EntityManager<Category>
  noun="category" table={db.categories} blank={{ name: '', kind, icon: 'circle-ellipsis', color: PALETTE.gray }}
  fields={[{ key: 'name', label: 'Name', type: 'text' }, { key: 'icon', label: 'Icon', type: 'icon' }, { key: 'color', label: 'Colour', type: 'swatch' }]}
  row={(c) => ({ icon: c.icon, color: c.color, title: c.name })}
  onDelete={async (c) => { const n = await db.txs.where('categoryId').equals(c.id).count(); return !n || confirm({ title: `Delete “${c.name}”?`, message: `${n} transactions will become No category.`, destructive: true }); }}
  prepare={(r) => ({ ...r, anchor: fromISO(r.nextDate).getDate() })}
/>
```
- Field types: `text number date select multi checkbox icon swatch` (+ legacy `color` → swatch;
  a `text` field keyed `icon` renders the icon picker). Field options: `options, optional,
  placeholder, hint`.
- `row(item)` → `RowView`: `icon, color, monogram?, title, sub, right, tags, badge, cols, progress,
  foot, footRight`. Any of `tags/badge/cols/progress` switches to tinted cards; otherwise an inset
  list. `layout="people"` = grid of tinted cards. `actions(item)` adds trailing buttons. `header`
  sets the list header.
- `onDelete(item) → Promise<boolean>`: return false to cancel; EntityManager then deletes the row
  (do your reference moves inside the hook). Without it: confirm dialog + "Deleted" toast with Undo.
- `prepare(draft) → draft` runs just before `put`. The editor is a Sheet with Cancel/Add|Done,
  dirty-confirm, and a destructive Delete button for existing items. The dock + opens a blank draft.

### Context and hooks
`useApp()` → `{ editTx(t?), toast(msg, action?), setFab, dock }`; `useFab(run, 'plus'|'filter')`
overrides the dock's round button; `useMediaQuery('(min-width: 1024px)')`; `useCountUp(n, ms?)`;
`prefersReducedMotion()`; `haptic('light'|'medium'|'success'|'warning')` (no-op when
`settings.haptics` is false or unsupported).

### TxList
`<TxList txs accounts categories empty? />`: inset lists grouped by day with sticky day headers
(day net on the right), IconTile per category, source badge, receipt paperclip. Swipe left reveals
Delete (full swipe deletes); long-press / right-click / Delete key opens Edit · Duplicate · Delete.
Deletes and duplicates show an Undo toast. `byNewest` sort helper unchanged.

### Charts
`<TrendBars data />` (income `--positive`, expense `--accent`, draws at real pixel width, hover/tap
tooltip, axis labels blank in hidden mode). `<Breakdown rows empty? />`: rows accept optional
`icon` and `color` to show an IconTile and tint the bar.

## Settings (src/lib/format.ts)
New fields: `haptics` (true), `calculator` (true), `calcPos?: {x, y}`, `linkKey` (16 URL-safe
chars, generated once with `crypto.getRandomValues`, persisted), `lastAccountId?`,
`lastCategoryByType?: { expense?: number; income?: number }`. Helper `randomToken(len)`.

## Data
Dexie v3: category and asset `icon` are icon keys; category colours are palette colours. Seed uses
keys/palette. Accounts keep their colour; show `ACCOUNT_ICONS[kind]` or a monogram tile.
