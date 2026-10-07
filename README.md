<div align="center">

<img src="public/icons/icon-192.png" width="96" height="96" alt="Khata logo" />

# Khata

**A calm, private expense tracker for India and Nepal.**
Log a purchase in two taps, let your bank's SMS alerts fill in the rest, and keep every rupee of data on your own device.

[**Open the app →**](https://chocolatewafer.github.io/Khata/) · [User guide](docs/USER-GUIDE.md) · [Architecture](docs/ARCHITECTURE.md) · [Changelog](CHANGELOG.md)

</div>

---

## Why Khata

*Khata* (खाता) is the ledger book every shop keeps. This one is yours.

- **Two taps to log an expense.** Tap **+**, type the amount on the keypad, tap **✓**. The category is already guessed from your habits.
- **Reads your bank and wallet alerts.** Paste, share or auto-forward SMS from ~45 banks and wallets — eSewa, Khalti, IME Pay, Nabil, NIC Asia, Global IME, HDFC, SBI, ICICI, Axis, Kotak, Paytm and more. Amount, merchant, date and account are filled in; OTPs, offers, failed payments and duplicates are skipped.
- **Private by design.** No account, no server, no tracking. Everything is stored in your browser (IndexedDB) and never leaves the device unless you export a backup.
- **Works offline.** Install it to your home screen and it opens like a native app, with or without a connection.
- **Feels native.** Apple-style design language — system font, line icons on coloured tiles, sheets, segmented controls, a floating glass tab bar — in a warm Paisa-inspired palette, with light and dark themes.

## Features

| | |
|---|---|
| **Fast entry** | On-screen keypad that does sums (`120+45`), pre-selected category, one-tap quick picks, Today/Yesterday, notes, labels, receipt photos, Undo everywhere |
| **Automation** | Bank/wallet SMS parsing (India + Nepal), auto-forwarding via MacroDroid / Tasker / iOS Shortcuts, share-to-app, CSV statement import, merchant rules, one-tap quick-add links |
| **Planning** | Budgets (daily/weekly/monthly/yearly, with rollover), savings goals, recurring bills and income that post themselves |
| **Money in motion** | Transfers, loans lent/borrowed, bill splitter, assets and net worth |
| **Insight** | Home summary, Activity search with filters, Reports by month/year/custom with category, account and label breakdowns, CSV and PDF export |
| **Reminders** | Daily "anything to log?" nudge, budget alerts at 80 % / 100 %, bills and loans due tomorrow, weekly backup reminder |
| **Extras** | Floating calculator pill, logging streak, hide-amounts mode, haptics, full backup/restore |

## Getting started

### Use it

Open **https://chocolatewafer.github.io/Khata/** and follow the three-step setup (country → your banks and wallets → reminders).
To install: **Android/desktop Chrome or Edge** → *Install app* from the menu or the banner; **iPhone** → Safari → *Share* → *Add to Home Screen*.

The [user guide](docs/USER-GUIDE.md) covers everything, including setting up automatic SMS capture.

### Run it locally

Requires Node.js 20+.

```bash
git clone https://github.com/chocolatewafer/Khata.git
cd Khata
npm install
npm run dev          # http://localhost:5173
```

| Command | What it does |
|---|---|
| `npm run dev` | Development server with hot reload |
| `npm test` | Unit tests (SMS parser, dates, reminders, quick-add links, icons) |
| `npm run typecheck` | TypeScript check |
| `npm run build` | Type-check and build to `dist/` (includes the offline service worker) |
| `npm run preview` | Serve the production build locally |
| `npm run icons` | Re-render the app icons from `scripts/icons.mjs` |

Notifications, offline mode and installing need HTTPS (or `localhost`).

## Deploying

Khata is a static site — host `dist/` anywhere.

- **GitHub Pages (this repo):** every push to `main` runs [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml), which tests, builds with `BASE=/Khata/` and publishes. A `404.html` copy of the app makes deep links such as `/Khata/silent_add` work.
- **Netlify / Cloudflare Pages:** build command `npm run build`, output `dist`. `public/_redirects` and `public/_headers` provide the SPA rewrite and security headers.
- **Vercel:** `vercel.json` provides the same.
- **Any other path or domain:** set `BASE` at build time, e.g. `BASE=/money/ npm run build`. It defaults to `/`.

## Privacy

Khata has no backend. Transactions, settings and receipts live in your browser's storage on one device. Nothing is sent anywhere — not even analytics. That also means **clearing site data deletes your ledger**, so use *Preferences → Download backup* now and then (the app reminds you weekly).

## Limits worth knowing

- A web app can't read your SMS inbox, and Indian and Nepali banks offer no free API for personal apps, so capture works from the alert texts your bank already sends (paste, share or auto-forward).
- Reminders arrive in the background only on Android/desktop Chromium with the app installed; elsewhere they appear when you open the app.
- On iPhone, automation links open in Safari, whose storage is separate from a home-screen app.
- Single currency per ledger; foreign-currency card charges are flagged for you to convert.

## Project docs

- [User guide](docs/USER-GUIDE.md) — how to use every feature, SMS automation setup, troubleshooting
- [Architecture](docs/ARCHITECTURE.md) — code layout, data model, SMS parser, service worker, testing
- [Design system](docs/DESIGN-SYSTEM.md) — tokens, components and their APIs
- [v3 plan and spec](docs/PLAN.md) — the design brief and acceptance checklist behind v3
- [Changelog](CHANGELOG.md)

## Credits

Made by **[Chocolate Wafer](https://github.com/chocolatewafer)**.
Layout inspired by [Paisa](https://paisa-tracker.app/) by Hemanth Savarala. Built with [React](https://react.dev), [Dexie](https://dexie.org), [Lucide](https://lucide.dev) icons and the [Inter](https://rsms.me/inter/) typeface.
