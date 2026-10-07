# Khata architecture

A guide for contributors. Khata is a static single-page app with no backend: React renders the UI, Dexie stores everything in IndexedDB, and a small service worker provides offline support and background reminders.

## Stack

| Concern | Choice |
|---|---|
| UI | React 19, TypeScript (strict), React Router 7 |
| Storage | Dexie 4 over IndexedDB (`dexie-react-hooks` `useLiveQuery` for reactive reads) |
| Build | Vite 8 (Rolldown), custom plugin that builds the service worker |
| Icons / type | lucide-react, bundled Inter (`@fontsource-variable/inter`) behind the system font stack |
| Tests | Vitest (pure logic: parser, dates, reminders, links, icons) |

No UI kit and no state library: shared state is Dexie (data) plus a tiny `useSyncExternalStore` settings store.

## Layout

```
src/
  main.tsx              entry: fonts, router (basename = BASE), PWA init
  App.tsx               shell: routes, tab bar, sidebar, dock (+ button / page segmented control), toasts, dialogs,
                        onboarding redirect, recurring + reminder checks
  db.ts                 Dexie schema (v1→v3), seed data, TABLES list
  sw.ts                 service worker (built separately into sw.js)
  styles.css            design tokens, text styles, shell and component styles
  styles/*.css          screen-specific styles (quickadd, calc, screens-a, screens-b)
  components/
    ui.tsx              barrel: re-exports everything below
    Screen.tsx          large-title page scaffold + collapsing glass nav bar (TopBar/PageHead wrappers)
    Sheet.tsx           iOS sheet: drag-to-dismiss, focus trap, Escape, dirty → confirm (Modal wrapper)
    Dialogs.tsx         promise-based confirm() and actionSheet() + DialogHost
    Toast.tsx           toast queue with Undo precedence
    Segmented.tsx       segmented control with sliding thumb (Seg / DockSeg aliases)
    List.tsx            inset grouped List / Row
    Icon.tsx            Icon, IconTile (coloured rounded square), IconSq
    Money.tsx, Empty.tsx, controls.tsx (Logo, Switch, Progress, Field, SwatchPicker…), hooks.ts, overlay.ts, context.ts
    EntityManager.tsx   generic list + editor sheet for a Dexie table (field spec driven)
    TxForm.tsx          quick-add sheet (keypad, category guess, quick picks, edit/delete)
    Keypad.tsx          reusable keypad (add / calc modes) + keyboard handling
    CalcPill.tsx        floating draggable calculator
    TxList.tsx          day-grouped transaction list with swipe-to-delete and context menu
    charts.tsx          TrendBars (SVG grouped bars) and Breakdown (ranked bars)
  pages/                one file per screen (More.tsx holds the smaller ones), silentAddLogic.ts, download.ts
  lib/
    format.ts           settings store, money formatting, evalAmount, dates (periodRange, addCycle, parseDate)
    parse.ts            SMS parser, CSV parser/writer, statement mapper, merchant keywords
    providers.ts        banks and wallets (India + Nepal): names, colours, text and sender-ID matchers
    automation.ts       categorize, resolve, ingest (dedupe), processRecurring, balances, totals, budgetStatus
    alerts.ts           pure dueAlerts() shared by the app and the service worker
    notify.ts           snapshot for the worker, show(), checkAlerts(), enableNotifications()
    pwa.ts              install prompt + service-worker registration
    icons.ts            curated icon map, identity palette, emoji migration table
    base.ts             BASE path helpers (appUrl, absoluteUrl)
    haptics.ts          haptic() (navigator.vibrate, gated by settings)
scripts/icons.mjs       renders the logo to every icon size with resvg
public/                 manifest, icons, favicon, host config (_redirects, _headers)
```

## Data model (`src/db.ts`)

| Table | Key fields |
|---|---|
| `accounts` | `name`, `kind` (bank/cash/card/wallet), `opening`, `color`, `last4?`, `provider?` |
| `categories` | `name`, `kind` (expense/income), `icon` (icon key), `color` |
| `txs` | `type` (expense/income/transfer), `amount`, `name`, `date` (yyyy-mm-dd, local), `accountId`, `toAccountId?`, `categoryId?`, `note?`, `tagIds`, `source` (manual/sms/csv/link/recurring), `hash?` (dedupe key), `photo?` (Blob) |
| `tags` | `kind` (label/person/place), `name` |
| `budgets` | `limit`, `period`, `categoryIds` (empty = all), `rollover`, `createdAt` |
| `goals`, `loans` | targets/amounts with `contributions` / `payments` arrays |
| `recurring` | `amount`, `type`, `accountId`, `categoryId?`, `cycle`, `nextDate`, `anchor?` (day of month), `subscription`, `active` |
| `assets`, `rules`, `templates` (quick picks), `splits` | |
| `kv` | small key/value store the service worker can read: `snapshot`, `fired` |

Versions: **v1** base schema · **v2** adds `kv` · **v3** converts emoji icons to icon keys and snaps colours to the palette. Add a new `db.version(n)` for any schema or data migration; never edit an old one.

Dates are local calendar strings (`yyyy-mm-dd`) built with `toISO()` — never `toISOString()`, which would shift dates in UTC+5:30 / +5:45.

Settings live in `localStorage` (`khata-settings`) via `lib/format.ts` (`getSettings`, `setSettings`, `useSettings`).

## SMS and statement pipeline

```
text ──parseSms()──▶ Parsed ──resolve()──▶ Resolved ──ingest()──▶ txs
                     (amount, type, name,   (accountId, categoryId,   (one Dexie transaction,
                      date, last4, provider, duplicate)                dedupe re-checked inside)
                      ref, raw, foreign)
```

- **`parseSms`** rejects noise (OTP, failed, "will be debited", card-bill acknowledgements) and promos without a masked account/reference. It collects every currency amount, drops ones preceded by *balance / available / limit / due*, and picks the one closest to a debit/credit verb; that verb sets the direction. Names come from `to/at`, `;X credited`, `UPI/P2M/<ref>/<NAME>`, `for X`, `from/by`, then remarks. Provider: sender ID first, then strict names in the text (UPI handles ignored, wallets before banks). Foreign-currency amounts are flagged, not converted.
- **`resolve`** picks the account (name → last 4 digits → provider → fallback) and category (`categorize`: user rules → named category → previous choice for the same name → keyword table).
- **`txHash`**: bank reference number if present, else the full raw text (balances make genuine repeats differ), else date|amount|type|name.
- **`parseStatement`** finds the header row, maps date / description / debit / credit / amount / type columns, reads `Cr`/`Dr`/`(…)`/`-` signs, accepts comma, semicolon or tab separators, and reports unreadable rows in a non-enumerable `skipped` count.

Add a bank or wallet by appending to `PROVIDERS` in `lib/providers.ts` with a distinctive text matcher and its SMS sender codes, then add a parser test.

## Recurring, budgets, reminders

- `processRecurring()` runs on app start and whenever the tab becomes visible. Inside one read-write transaction it re-reads due items, posts every missed occurrence (`hash: rec:<id>:<date>`), and advances `nextDate` with `addCycle(…, anchor)` so month-end items keep their day.
- `budgetStatus()` sums the current period; rollover adds `full periods since creation × limit − spending in them` (the partial creation period doesn't count).
- `checkAlerts()` (app) writes a `snapshot` of budgets, recurring items, loans and prefs to `kv`, computes `dueAlerts()` and shows any not yet in `kv.fired`. The service worker's `periodicsync` handler (installed Chromium only) runs the same `dueAlerts()` from the snapshot plus a count of today's transactions.

## Service worker and hosting

`vite.config.ts` contains a plugin that, after the main build, writes `404.html` (a copy of `index.html` for hosts without SPA rewrites) and builds `src/sw.ts` as an IIFE into `sw.js` with:

- `__PRECACHE__`: every built asset plus public files (Latin font subsets only), prefixed with `BASE`;
- `__VERSION__`: package version + build time, so each deploy gets a fresh cache.

The worker precaches on install, deletes old caches on activate, serves navigations network-first with the cached shell as fallback (also when the host answers 404), and serves assets cache-first. It never creates the database (aborting `onupgradeneeded`), so Dexie's seeding isn't skipped.

`BASE` (env var, default `/`) sets Vite's `base`, the router `basename`, service-worker scope, notification URLs and the quick-add links (`lib/base.ts`). The manifest uses relative URLs so it works under any base.

## Quick-add endpoint (`/silent_add`)

`pages/silentAddLogic.ts` (pure, tested) parses the URL: `sms` is everything after `sms=` (plus the hash) because automation apps often don't encode it; trailing `&from=`/`&k=` are peeled off. Links with the right `k` (the per-device `linkKey`) — or a share-sheet message with no referrer — are added instantly; anything else shows a confirmation card. After handling, the URL is replaced with `?done` so a reload never re-adds. The page refuses to act inside an iframe; `_headers` / `vercel.json` also send `frame-ancestors 'none'`.

## Testing and checks

```bash
npm test            # vitest: parse, review (regressions), alerts, icons, silentAdd
npm run typecheck
npm run build
```

Parser changes should come with a test using a realistic, anonymised message. UI is verified manually (Playwright screenshots at 320–1920 px, both themes); keep pages free of horizontal scroll at 320 px.

## Conventions

- Design tokens and components only — see [DESIGN-SYSTEM.md](DESIGN-SYSTEM.md). No emoji in the UI, no `window.confirm/alert/prompt` (use `confirm()` / `actionSheet()`).
- Every destructive action is either confirmed or undoable (usually both).
- Comments explain *why*, sparingly.
