# Changelog

## 3.0.0 — October 2026

A ground-up redesign and a hardening pass.

**Design**
- Apple-style design language in a warm Paisa-inspired palette: system font with bundled Inter, line icons on coloured tiles (no emoji), large titles with a collapsing glass nav bar, iOS sheets with drag-to-dismiss, segmented controls with a sliding thumb, inset grouped lists, floating glass tab bar, iPadOS-style sidebar on desktop.
- Light and dark themes, reduced-motion support, focus management in sheets and dialogs, 44 px touch targets.
- Checked at ten screen sizes from 320 px phones to 1920 px desktops, plus landscape.

**Faster entry**
- New keypad add sheet: **+ → amount → ✓** (2 taps), category pre-selected from your habits, live sums, desktop keyboard entry.
- One-tap quick picks with Undo, on Home and in the add sheet.
- Floating, draggable calculator pill with "Add as expense".
- Swipe-to-delete, context menus, Undo on deletes, confirm before discarding unsaved input.

**Smarter SMS and statements**
- Reads the transaction amount, not the balance or card limit.
- Rejects promos by structure while keeping real alerts that mention offers or EMIs; understands "Debit", withdrawals, reversals; ignores card-bill acknowledgements; flags foreign-currency charges.
- Duplicate detection by bank reference number or full message text (two identical purchases in a day both count).
- Stricter bank/wallet detection with SMS sender codes; UPI handles no longer mis-tag alerts.
- Better merchant names (UPI paths, "for …", "from …"), real calendar date checks, dates without a year, month/day fallback.
- Statements: `Cr`/`Dr`/bracketed amounts, semicolon and tab files, count of unreadable rows.
- Editable import preview: amount, account (required) and category per row.

**Reliability and safety**
- Recurring items keep their day of month and can't double-post across tabs; deleted accounts are skipped.
- Budget rollover counts whole periods only, with no cap.
- Quick-add links carry a private key; other links ask first; reloads never re-add; refused inside iframes.
- Deleting an account offers to move its transactions; deleting a category explains the effect.
- Backups exclude internal reminder state, validate receipt images and report clear errors; restore re-runs recurring and reminders.
- Turning on reminders no longer hangs without a service worker; the worker can't create an empty database and serves the app on 404.
- Configurable base path; GitHub Pages deployment with `404.html` fallback; host configs for Netlify, Cloudflare Pages and Vercel.

## 2.0.0

Installable offline web app with bundled fonts and generated icons, onboarding, Nepal and India banks and wallets, SMS auto-forwarding, local notifications, receipt photos, quick picks, logging streak, About page.

## 1.0.0

First version: accounts, categories, transactions, budgets, goals, recurring, loans, bill splitter, assets, labels, reports, SMS paste, CSV import, rules, quick-add links, backup and restore.
