# Khata v3 — plan and design spec

Goal (from the owner): **the best-polished money tracker on the market.** Expense tracking that is
fast, obvious and calm. Paisa's overall theme (warm dark browns, peach accent, colourful tinted
cards) expressed in **Apple's design language** (system type, SF-Symbols-style line icons, inset
grouped lists, sheets, segmented controls, large titles, glass tab bar, spring motion). Fully local,
no backend.

This file is the single source of truth for every agent working on v3. Read it fully before editing.

---

## 0. Ground rules for all agents

- Stack: React 19 + TypeScript (strict) + Vite 8 + Dexie 4 (IndexedDB) + lucide-react. No new
  runtime dependencies without a strong reason; never a UI kit. Fonts are bundled via
  `@fontsource-variable/*`.
- Run `npx tsc --noEmit`, `npx vitest run` and `npm run build` before you hand back. All must pass.
- Do not touch files you don't own (see §7). If you need a change in someone else's file, say so
  in your hand-back instead.
- No emoji anywhere in the UI. Icons are lucide components rendered through `<Icon name>` (§3.4).
- No `window.confirm/alert/prompt`. Use the in-app `confirm()` dialog (§3.7).
- Every interactive element: visible focus ring, accessible name, ≥ 44×44 px hit area on touch.
- Respect `prefers-reduced-motion` (all motion collapses to fades ≤ 120 ms or nothing).
- Copy is plain, friendly, short. Sentence case. No jargon ("Uncategorised" → "No category").
- A dev server may be killed for low memory. Prefer `npm run build && npx vite preview --port 4173`
  for checks, and stop servers you start. Use the Playwright MCP tools for screenshots if available.
- Keep comments sparse and only for non-obvious "why".

---

## 1. Product principles

1. **Four-tap rule.** Logging a normal expense from anywhere: tap **+** → type amount → (optionally
   tap a category) → tap **✓**. Amount digits don't count as taps; everything else must fit in 4.
   One-tap "quick picks" (saved templates) record instantly with an Undo toast.
2. **Nothing hidden behind settings that people need daily.** Daily: add, see today/this month,
   see recent, fix a mistake. Weekly: budgets, reports. Rare: setup, backup, rules.
3. **Never lose input.** Dismissing a sheet with unsaved input asks first. Deletes have Undo.
4. **Honest automation.** SMS/bank capture works from alert texts; never claim direct bank linking.
5. **Calm visuals.** One accent colour, tinted cards for identity, generous spacing, no clutter.

---

## 2. Visual language (tokens)

### 2.1 Colour — "Paisa warm" on Apple semantics

Define as CSS custom properties on `:root`, dark set under
`@media (prefers-color-scheme: dark) { :root:not([data-theme='light']) {…} }` **and**
`:root[data-theme='dark'] {…}`.

| token | dark (default feel) | light |
|---|---|---|
| `--bg` (grouped background) | `#130d0b` | `#f6f1ed` |
| `--bg-elev` (cards, rows) | `#211915` | `#ffffff` |
| `--bg-elev-2` (raised inside card, inputs) | `#2c221d` | `#f1ebe6` |
| `--fill` (segmented track, chips) | `rgba(255,236,224,.08)` | `rgba(60,35,20,.06)` |
| `--fill-strong` | `rgba(255,236,224,.14)` | `rgba(60,35,20,.10)` |
| `--separator` | `rgba(255,236,224,.10)` | `rgba(60,35,20,.12)` |
| `--label` | `#f7ebe4` | `#1d130e` |
| `--label-2` (secondary) | `rgba(247,235,228,.64)` | `rgba(29,19,14,.62)` |
| `--label-3` (tertiary/placeholder) | `rgba(247,235,228,.38)` | `rgba(29,19,14,.36)` |
| `--accent` | `#ffb59a` (peach) | `#9c4a2f` (burnt sienna) |
| `--on-accent` | `#3b1608` | `#ffffff` |
| `--accent-tint` | `rgba(255,181,154,.16)` | `rgba(156,74,47,.10)` |
| `--hero` (balance card gradient start→end) | `#ffc6ad → #f29c7c` | `#a3553a → #6e3420` |
| `--on-hero` | `#3b1608` | `#fff4ee` |
| `--positive` | `#4cd97b` | `#1f8a43` |
| `--negative` | `#ff7a6b` | `#c7392b` |
| `--warning` | `#ffcc4d` | `#a86a00` |
| `--glass` (tab bar, nav bar) | `rgba(33,25,21,.72)` + `backdrop-filter: blur(24px) saturate(180%)` | `rgba(255,255,255,.72)` same filter |

**Category / identity palette** (Apple system colours, used as solid icon-square backgrounds with a
white glyph; same values both themes): red `#ff453a`, orange `#ff9f0a`, yellow `#ffcc00`,
green `#30d158`, mint `#00c7be`, teal `#30b0c7`, cyan `#32ade6`, blue `#0a84ff`, indigo `#5e5ce6`,
purple `#bf5af2`, pink `#ff375f`, brown `#a2845e`, gray `#8e8e93`. Glyph on yellow/mint/cyan is
`#1c1c1e` for contrast. Tinted cards use `color-mix(in srgb, <c> 16%, var(--bg-elev))`.

Charts: income `--positive`, expense `--accent`. Validate any new categorical chart palette with
the dataviz validator if you add one.

### 2.2 Typography — Apple text styles

Font stack: `-apple-system, BlinkMacSystemFont, "SF Pro Text", "Inter Variable", system-ui, "Segoe UI", Roboto, sans-serif`
(on Apple devices this is SF Pro; elsewhere bundled Inter). Install `@fontsource-variable/inter`,
remove Fraunces and Google Sans Flex. Money figures use
`font-family: ui-rounded, "SF Pro Rounded", "Inter Variable", system-ui;` with `font-variant-numeric: tabular-nums`
in lists/tables and proportional in hero figures. Letter-spacing per Apple's tracking.

| style | size/line | weight | tracking |
|---|---|---|---|
| Large Title | 34/41 | 700 | -0.4px |
| Title 1 | 28/34 | 700 | -0.3px |
| Title 2 | 22/28 | 700 | -0.2px |
| Title 3 | 20/25 | 600 | -0.2px |
| Headline | 17/22 | 600 | -0.2px |
| Body | 17/22 | 400 | -0.2px |
| Callout | 16/21 | 400 | -0.2px |
| Subhead | 15/20 | 400 | -0.1px |
| Footnote | 13/18 | 400 | 0 |
| Caption | 12/16 | 500 | 0 |
| Hero amount | `clamp(36px, 11vw, 52px)` | 700 rounded | -1px |

Expose as utility classes: `.t-large .t-title1 .t-title2 .t-title3 .t-headline .t-body .t-callout .t-subhead .t-footnote .t-caption`.

### 2.3 Shape, spacing, depth

- Spacing scale 4/8/12/16/20/24/32. Page side gutter 16 (phone), 24 (tablet), 32 (desktop).
- Radii: inset-grouped list 12, cards 22, hero card 28, sheet 16 top corners (iOS), buttons
  12 (filled) / 999 (pill), chips 999, icon squares 8 (sm 28px) / 10 (md 36px) / 12 (lg 44px).
- Shadows only on floating things (tab bar, FAB, calculator pill, sheets, menus).
- Hairline separators inset to align with text (left inset = icon width + gap).

### 2.4 Motion

- Easing: iOS spring approximations. Standard `cubic-bezier(.32,.72,0,1)` (sheets, nav), quick
  `cubic-bezier(.2,.8,.2,1)`. Durations 180–420 ms.
- Sheet: slides up 420 ms; drag-to-dismiss (grabber/header) with rubber-banding; dismiss past
  120 px or fast flick.
- Press: scale .97 on buttons/rows/cards (transform, 120 ms).
- Segmented control thumb slides between options (transform), never jumps.
- Lists: new rows fade+rise 8 px, staggered ≤ 6 items.
- Numbers: hero balance counts up (existing `useCountUp`).
- Haptics: `navigator.vibrate?.(10)` on keypad taps, save, delete, segment change (Android only;
  wrapped in a `haptic()` helper that no-ops elsewhere and respects a setting).

---

## 3. Component library (owned by the Design-System agent; others consume)

All in `src/components/` (split into files; keep `ui.tsx` as the barrel that re-exports). Keep
existing exported names working or update every call site you own.

1. **`<Screen title large? back? actions? subtitle?>`** — page scaffold.
   - Tab pages: large title left-aligned (Large Title style) with optional subtitle (e.g. date)
     and trailing actions; on scroll past the title a compact glass nav bar fades in with the
     centred inline title (IntersectionObserver).
   - Pushed pages: glass nav bar with `‹ Back` (accent, chevron + previous label or "Back"),
     centred title that appears on scroll, large title below.
   - Replaces `TopBar` and `PageHead` (keep those as thin wrappers so pages compile until migrated).
2. **`<Sheet title onClose dirty? detents?>`** — iOS sheet: grabber, header with Cancel (left) /
   title / primary action (right) optional, drag-to-dismiss, Escape closes, focus moves in and is
   restored, `aria-modal`, focus trap, scroll lock on body. If `dirty`, any dismissal asks
   "Discard this transaction?" via `confirm()`. On ≥ 600 px renders as centred card (max 560 px).
   Replaces `Modal` (keep `Modal` as a wrapper).
3. **`<Segmented value options onChange>`** — gray track, raised thumb that slides; full-width or
   intrinsic; keyboard arrow support; `role="tablist"`. Replaces `Seg` (keep alias).
4. **`<Icon name size? />` + `<IconTile name color size="sm|md|lg" />`** — `name` is a key from a
   curated map in `src/lib/icons.ts` (≈ 60 lucide icons: food `utensils`, coffee `coffee`,
   groceries `shopping-basket`, transport `car`, bus, plane, fuel, shopping `shopping-bag`, bills
   `receipt`, electricity `zap`, internet `wifi`, phone `smartphone`, entertainment `clapperboard`,
   music, health `heart-pulse`, pharmacy `pill`, education `graduation-cap`, books, rent/home
   `house`, gifts `gift`, travel `luggage`, salary `briefcase`, interest `percent`, investment
   `trending-up`, cash `banknote`, bank `landmark`, card `credit-card`, wallet `wallet`, savings
   `piggy-bank`, kids `baby`, pets `paw-print`, fitness `dumbbell`, beauty `sparkles`, clothes
   `shirt`, tools `wrench`, charity `hand-heart`, tax `file-text`, insurance `shield`, other
   `circle-ellipsis`, …). `IconTile` = solid rounded square in `color`, white glyph (dark glyph on
   light colours). Unknown name → `circle-ellipsis`.
5. **Lists:** `<List header? footer?>` (inset grouped, radius 12) and `<Row icon? title subtitle?
   value? accessory="chevron|switch|none" onClick? to? destructive?>`; 44 px min height, inset
   separator.
6. **Buttons:** `.btn` variants `filled` (accent), `tinted` (accent-tint bg, accent text), `gray`
   (fill), `plain` (text only, accent), `destructive`; sizes `sm/md/lg`; `block`. Pills only for
   chips and the tab bar.
7. **Dialogs:** `confirm({ title, message?, confirmLabel, destructive? }) → Promise<boolean>` and
   `actionSheet({ title?, actions:[{label, destructive?, value}] }) → Promise<value|null>`;
   promise-based, rendered by a provider in `App`. iOS alert look (centred, 270 px, stacked
   buttons) and action-sheet look (bottom, grouped, separate Cancel).
8. **Toast:** queue-aware; a toast with an action (Undo) stays ≥ 6 s and is not replaced by a plain
   toast while visible (the plain one waits). Bottom-centre above the tab bar; on desktop centred
   in the content column.
9. **`<Empty icon title message action?>`** — Apple ContentUnavailableView: large tinted circle
   icon, Title 3, Subhead secondary text, optional tinted button. Replaces `EmptyCup` (alias kept).
10. **`<Money value kind="expense|income|transfer|neutral" size?>`** — formats via `money()`,
    colours by kind, hidden mode shows `••••` (not shapes) with `aria-label="Hidden"`.
11. **Tab bar (mobile ≤ 1023 px):** floating glass pill (iOS 26 style), 4 items Home, Activity,
    Reports, Accounts; active item gets accent glyph + subtle accent-tint capsule; labels Caption;
    round accent **+** button beside it. Bottom sheet/page filter segmented controls render in the
    same dock slot (existing `DockSeg` portal mechanism).
12. **Sidebar (≥ 1024 px):** iPadOS-style: app name + logo, search field (navigates to Activity
    with query), grouped nav (Library: Home, Activity, Reports, Accounts; Plan: Budgets, Goals,
    Recurring; Money: Loans, Bill Splitter, Assets, Labels; Automate: Banks & SMS), bottom:
    Preferences, About. Selected row = accent-tint fill + accent icon.
13. **`haptic()`**, **`useMediaQuery()`**, **`useCountUp()`** helpers.

`EntityManager` must be rebuilt on the new primitives (List/Row or tinted cards; Sheet editor) and
gain:
- `onDelete?: (item) => Promise<boolean>` hook (return false to cancel); default asks `confirm()`
  ("Delete “X”?") — never deletes silently.
- `prepare?: (draft) => draft` before save (used to set recurring `anchor` from `nextDate`).
- Field types add `icon` (icon picker grid from `src/lib/icons.ts`) and `swatch` (category palette
  chips) replacing raw emoji text inputs and `<input type="color">`.

---

## 4. Data changes (Design-System agent, since icons drive them)

- Dexie **version 3** upgrade: convert every `category.icon`, `asset.icon` emoji to an icon key with
  a mapping table (🍔→utensils, ☕→coffee, 🛒→shopping-basket, 🚕→car, 🛍️→shopping-bag, 💡→zap,
  🎬→clapperboard, 💊→pill, 🏠→house, 📚→graduation-cap, ✈️→plane, 🎁→gift, 📦→circle-ellipsis,
  💼→briefcase, 🏦→landmark, 💰→banknote, 📈→trending-up, else circle-ellipsis). Category colours
  re-mapped to the nearest identity palette colour.
- Seed (populate) uses icon keys and palette colours.
- Accounts keep `kind` (bank/cash/card/wallet) → icons landmark/banknote/credit-card/wallet;
  provider accounts show a monogram tile in the provider colour.
- Settings additions (in `src/lib/format.ts`, owned by DS agent): `haptics: boolean` (default true),
  `calculator: boolean` (default true, shows the floating pill), `calcPos?: {x:number;y:number}`,
  `linkKey: string` (random 16-char token generated on first load; see §6 SilentAdd),
  `lastAccountId?`, `lastCategoryByType?: Record<'expense'|'income', number>`.

---

## 5. Screens (Screens agents)

Every screen uses `Screen`, `List/Row`, `IconTile`, `Money`, `Empty`, `Sheet`. Specific notes:

- **Home** — Large title "Home"? No: large title = greeting-free **date** style like Apple Fitness:
  subtitle "Wednesday, 7 October", large title "Summary". Then: hero balance card (Paisa peach
  gradient, hide toggle, this-month income/expense with % vs last month), **Today** strip (spent
  today + quick picks as one-tap chips + "Add" chip), Budgets glance (top 3 progress rows), Overview
  tiles grid (Apple Health "summary cards": coloured icon + coloured caption title, big value,
  chevron), Trend chart, Recent (inset list, 8 rows, "See all"). Install banner kept (dismissible).
  Streak shown subtly in the Today strip. Desktop: two columns (left: hero, today, tiles, trend;
  right: budgets glance, recent).
- **Activity (was Search)** — large title, search field (iOS style, magnifier, clear button),
  filter chips row (Type, Account, Category, Month) opening action sheets/pickers instead of
  six raw selects, sections by day with sticky day headers, swipe-left on a row reveals Delete
  (pointer events; plus long-press/right-click menu Edit/Duplicate/Delete) with Undo. Totals
  summary at top. CSV export in nav actions.
- **Reports** — month strip (scrollable, last 24 months) + "Year" + "Custom…" (month/year
  picker sheet) so older months are reachable; net card; quick insights; income vs expense chart;
  category breakdown with IconTiles; by account; by tag. Filter sheet. Print/PDF + CSV.
- **Accounts** — net worth header, accounts as tinted cards (provider monogram or kind icon),
  "Link a bank or wallet" row → /connect, add/edit in Sheet. **Delete account with transactions**:
  action sheet "Move N transactions to…" (pick another account) or "Delete transactions too";
  recurring items pointing at it are moved too; never orphan.
- **Categories** — Segmented Expense/Income, grid of IconTiles with names, editor Sheet with name,
  icon picker, colour swatches. Deleting a used category: confirm "N transactions will become No
  category".
- **Budgets / Goals / Loans / Recurring / Bill Splitter / Assets / Labels** — keep current
  features, re-skin as tinted cards with IconTiles and progress bars (rounded 6 px, track =
  fill, value = card colour; over = negative; ≥80% = warning). Recurring form sets `anchor`.
- **Banks & SMS** — Segmented (Linked · Paste · Auto · Statement · Rules). Preview table becomes a
  list of editable rows: amount editable (required for `foreign` rows, shown with a warning
  badge), account picker with an explicit "Choose account" placeholder (rows without an account are
  highlighted and block Import until set), category picker. Statement import shows "N rows
  couldn't be read" when `skipped > 0`. Quick links include the `k=` token (§6).
- **Preferences** — iOS Settings style lists: Appearance (Auto/Light/Dark), Hide amounts,
  Haptics, Calculator pill; Region; Reminders; App (install, Banks & SMS, Categories, Labels);
  Data (backup, restore, delete all — all destructive via confirm); About; Run setup again.
- **About** — logo, name, version, tagline, three feature rows, **Made by Chocolate Wafer —
  github.com/chocolatewafer** (keep), credits (Paisa inspiration, React, Dexie, lucide, Inter).
- **Welcome** — 4 steps as today but Apple onboarding style (big icon, Title 1, body, primary
  button pinned to bottom, page dots). Finish is guarded against double taps and never creates a
  provider account that already exists.
- **SilentAdd** — Apple-style result card (big check/warn symbol). See §6 for logic.

---

## 6. Remaining review fixes (assignment in §7)

| # | Fix | Owner |
|---|---|---|
| R1 | Parser: amount nearest verb, skip balances/limits; promo vs real; Debit/withdrawal; foreign currency flag; reversals; card-bill acks ignored; names (UPI path, "for X", "from" stop); refs | **done** (lead) |
| R2 | Dedupe by ref → raw text → fields; within-batch; inside transaction | **done** (lead) |
| R3 | Dates: real calendar check, BS years rejected, no-year dates, m/d fallback | **done** (lead) |
| R4 | Providers: strict text names, sender-ID codes, ignore `@handle` | **done** (lead) |
| R5 | Recurring: anchor day, atomic transaction, stable hash, skip deleted accounts | **done** (lead); App must also run `processRecurring` on `visibilitychange` (DS agent) and recurring form sets `anchor` (Screens B) |
| R6 | Budget rollover: whole periods only, no 60-period cap | **done** (lead) |
| R7 | `enableNotifications` no longer hangs; SW won't create an empty DB; SW serves shell on 404 | **done** (lead) |
| R8 | `/silent_add`: validate `date` (yyyy-mm-dd real date, not > 1 year ahead), clamp `name` 80 / `description` 300 / `amount` ≤ 1e9; refuse inside an iframe; **link token** — links built in-app carry `k=<settings.linkKey>`; with a valid `k` (or `sms` from the share target when `document.referrer` is empty) add instantly, otherwise show a confirm card "Add Rs X for Y?" with Add/Cancel; after handling `history.replaceState` to `/silent_add?done` so reload never re-adds; `foreign` SMS rows are not auto-added (show "open Khata to enter the amount"). `smsFromSearch`: strip a trailing `&from=…`/`&k=…` from the captured text and read `from`/`k` from it; include `location.hash` in the captured text (unencoded `#`). | Screens B |
| R9 | Backup: exclude `kv` from backup/restore; delay `revokeObjectURL` (≥ 1 s) in `download()`; only accept `photo` strings starting `data:image/`; distinct errors ("not a Khata backup" vs "couldn't restore: <reason>"); after restore run `processRecurring()` + `checkAlerts()` | Screens B |
| R10 | Deletes: confirm + reference handling for accounts/categories (see §5) | DS (EntityManager hook) + Screens B (wiring) |
| R11 | Welcome: guard double tap; skip existing providers | Screens B |
| R12 | Modal/Sheet: Escape, focus trap/restore, aria-modal, dirty-discard confirm | DS |
| R13 | Test-notification toast reflects `show()` result | Screens B |
| R14 | Receipt `shrink` fallback via `<canvas>` when `OffscreenCanvas`/`createImageBitmap` missing | QuickAdd |
| R15 | Reports: older months reachable | Screens A |
| R16 | Preview: amount edit for foreign rows, account placeholder, blocking unassigned rows; skipped-rows message | Screens B |
| R17 | Toast precedence for Undo | DS |

---

## 7. Work breakdown and file ownership

Phase 1 runs alone. Phase 2 agents run in parallel on **disjoint files**. Shared files
(`styles.css`, `components/ui.tsx` & friends, `App.tsx`, `lib/format.ts`, `lib/icons.ts`, `db.ts`)
are **frozen** in phase 2; phase-2 agents put screen-specific CSS in their own stylesheet under
`src/styles/` imported from their own component, using only the tokens from §2.

### Phase 1 — Design-System & Shell agent
Owns: `src/styles.css` (rewrite), `src/components/ui.tsx` (+ any new files in `src/components/`
except those listed below), `src/lib/icons.ts` (new), `src/lib/haptics.ts` (new),
`src/lib/format.ts` (settings additions only), `src/db.ts` (v3 + seed), `src/App.tsx`,
`src/main.tsx`, `index.html`, `package.json` (fonts), `src/components/charts.tsx` (restyle),
`src/components/TxList.tsx` (restyle to List/Row + IconTile + swipe-to-delete + context menu).
Deliverables: §2 tokens, §3 components, §4 data, shell (tab bar, sidebar, dock, toast, dialogs
provider, Screen), `processRecurring` on visibility, keep all pages compiling (old aliases),
quick visual pass so nothing is broken. Write `docs/DESIGN-SYSTEM.md` (short component API
reference for phase 2).

### Phase 2 (parallel)
- **QuickAdd agent** — owns `src/components/TxForm.tsx`, new `src/components/Keypad.tsx`,
  `src/components/CalcPill.tsx`, `src/styles/quickadd.css`, `src/styles/calc.css`. Mounting the
  pill in `App.tsx` is a one-line change: QuickAdd may make exactly that edit (import + render
  `<CalcPill />` next to the dock) and nothing else in App.
  - **Quick add sheet:** opens with a custom on-screen keypad (no OS keyboard on touch):
    `1 2 3 ÷ / 4 5 6 × / 7 8 9 − / . 0 ⌫ +` and a full-width **✓ Add** key (shows the evaluated
    total; disabled until > 0). Long-press ⌫ clears. Physical keyboard works on desktop (digits,
    operators, Backspace, Enter = save, Esc = close) unless a text field has focus.
  - Header: Segmented Expense / Income / Transfer. Amount display large, rounded font, live
    expression line ("120 + 45 = 165").
  - Category: horizontal scroller of IconTile chips ordered by usage; **pre-selected** = name
    rule/guess, else last used for this type (`settings.lastCategoryByType`), else most used.
    Account chip (defaults to `settings.lastAccountId`) and Date chip (Today/Yesterday/pick) in a
    compact meta row; tapping opens small action sheets. "Add note" field (reveals text input;
    keypad hides while it has focus); name suggestions from history; category guess on name.
  - Details drawer (collapsed): labels/people/places, receipt photo (+ R14), save as quick pick.
  - Quick picks row at top: **one tap records immediately** (haptic + Undo toast). Long-press →
    action sheet Edit/Delete.
  - Save: haptic, toast "Rs 165 · Coffee" with Undo; "Add another" keeps type/account/date.
  - Edit mode: same layout, Delete (with Undo) in the header menu.
  - Tap count audit must hold: + → digits → ✓ = 2 taps; with a category change 3.
- **CalcPill:** small floating glass pill (calculator glyph + last result, 44 px tall) default
  bottom-left above the dock; draggable (pointer events, snaps to the nearest horizontal edge,
  stays inside safe areas, position saved in `settings.calcPos`); tap expands a 280 px panel with
  the same `Keypad` (with `=` instead of ✓), result display, actions **Copy**, **Add as expense**
  (opens TxForm prefilled), **Clear**; Escape/outside tap collapses. Hidden when
  `settings.calculator` is false, on `/welcome` and `/silent_add`, and while a sheet is open.
- **Screens A agent** — owns `src/pages/Home.tsx`, `src/pages/Transactions.tsx` (Activity),
  `src/pages/Reports.tsx`, `src/styles/screens-a.css`. Fix R15.
- **Screens B agent** — owns `src/pages/More.tsx` (Accounts, Categories, Goals, Loans, Recurring,
  Assets, Labels, Bill Splitter, Preferences), `src/pages/Budgets.tsx`, `src/pages/Automation.tsx`,
  `src/pages/Welcome.tsx`, `src/pages/About.tsx`, `src/pages/SilentAdd.tsx`,
  `src/styles/screens-b.css`. Fix R8, R9, R10 wiring, R11, R13, R16.

### Phase 3 — QA
- **Responsive & a11y QA agent** (read + fix CSS only in `src/styles/*` and report others):
  screenshot every route at 320×640, 375×812, 390×844, 430×932, 768×1024, 1024×768, 1280×800,
  1440×900, 1920×1080 and 844×390 landscape, both themes; check no horizontal overflow, no text
  clipping, tab bar/FAB/pill never cover content without scroll room, tap targets ≥ 44 px, focus
  visible, contrast AA for text.
- **Adversarial UI reviewer** (read-only): try to break flows; count taps for the top 10 jobs;
  look for dead ends, inconsistent components, leftover emoji/serif/old styles.
- Lead integrates, fixes, re-verifies, final build + tests.

---

## 8. Acceptance checklist

- [ ] No emoji, no Fraunces/Google Sans; system font + Inter fallback everywhere.
- [ ] Add expense ≤ 4 taps (target 2) on phone and desktop; quick pick = 1 tap + Undo.
- [ ] Every sheet: drag/Esc/backdrop dismiss with dirty confirm; focus managed.
- [ ] No `window.confirm` / `alert` / `prompt` in `src/`.
- [ ] All review items R1–R17 done and covered by tests where testable.
- [ ] Responsive matrix screenshots clean in both themes; no horizontal scroll at 320 px.
- [ ] Calculator pill works, draggable, persists position, adds as expense.
- [ ] `tsc`, `vitest`, `build` all green; production preview works offline; reminders fire.
