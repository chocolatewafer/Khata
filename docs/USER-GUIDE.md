# Khata user guide

Everything you can do in Khata, and how to set up automatic capture of your bank and wallet alerts.

- [First run](#first-run)
- [Adding expenses](#adding-expenses)
- [Finding and fixing transactions](#finding-and-fixing-transactions)
- [Banks, wallets and SMS](#banks-wallets-and-sms)
- [Budgets, goals and recurring](#budgets-goals-and-recurring)
- [Loans, bill splitter, assets, labels](#loans-bill-splitter-assets-labels)
- [Reports](#reports)
- [Calculator pill](#calculator-pill)
- [Reminders](#reminders)
- [Install and offline](#install-and-offline)
- [Backup, restore and moving phones](#backup-restore-and-moving-phones)
- [Preferences](#preferences)
- [Troubleshooting](#troubleshooting)

---

## First run

1. **Where do you live?** Nepal, India or elsewhere. This sets your currency (NPR shows as *Rs*, INR as *₹*) and which banks and wallets are suggested.
2. **Which do you use?** Tap your banks and wallets. Each becomes an account, so alerts that mention it are filed there automatically. *Cash* is always added.
3. **Last step.** Turn on reminders and install the app if you like.

You can run setup again later from *Preferences → Run setup again*; accounts you already have are not duplicated.

## Adding expenses

Tap the round **+** button (bottom right on phones; the button in the sidebar on desktop).

1. Type the amount on the keypad. Sums work: `120 + 45`, `3 × 80`. The total shows as you type.
2. The category is already chosen — from the name you typed, or what you used last time, or your most used one. Tap another tile to change it.
3. Tap **✓ Add**.

That's it: **two taps** for a normal expense. Optional, in the row under the categories:

- **Account** — which account paid (defaults to the last one you used).
- **Date** — Today, Yesterday, or pick a date.
- **Add note** — what it was for. Khata suggests names you've used before and guesses the category from them.

Under **More details**: labels, people and places; a **receipt photo**; **Save as quick pick**; and **Add and start another** (keeps the type, account and date).

**Income and transfers:** switch the segmented control at the top to *Income* or *Transfer*. A transfer moves money between two of your accounts and doesn't count as spending.

**Quick picks** are saved expenses you make often (coffee, bus fare). They appear at the top of the add sheet and in the *Today* card on Home. **One tap records them instantly**, with Undo. Long-press (or right-click) a quick pick to edit or delete it.

**On a computer** you can just type: digits, `+ - * /`, Backspace, and **Enter** to save.

## Finding and fixing transactions

**Activity** (tab bar) lists everything, newest first, grouped by day.

- **Search** by name, note or amount.
- **Filter chips** — Type, Account, Category, Month, Label. Active filters show filled; tap the × to clear one.
- **Edit:** tap a transaction.
- **Delete:** swipe left on a row, or long-press / right-click → *Delete*. Every delete has **Undo**.
- **Duplicate:** long-press / right-click → *Duplicate* (adds a copy dated today).
- **Export:** the share icon in the top bar downloads the filtered list as CSV.

## Banks, wallets and SMS

Open **Banks & SMS** from the Home tile, the sidebar, or *Preferences*. Banks in India and Nepal don't offer a free way for personal apps to connect, and a web page can't read your inbox — so Khata works from the alert messages your bank already sends.

### Linked
Link a bank or wallet so its alerts land in the right account. For banks, optionally add the **last 4 digits** of the account or card — useful if you have two accounts at the same bank.

### Paste
1. In your Messages app, long-press your alerts and copy them (many at once is fine).
2. Paste into the box and tap **Read messages**.
3. Check the list: you can change the amount, account and category of each row. Rows Khata already has are skipped. Rows with no matching account are highlighted until you choose one. **Foreign-currency charges** (e.g. USD) must have the amount entered in your currency.
4. Tap **Add**.

Khata skips OTPs, offers, failed or declined payments, "will be debited" notices and credit-card bill acknowledgements, and it reads the *transaction* amount, not the balance.

### Auto — forward every alert automatically

**Android (MacroDroid, free):**
1. Install Khata to your home screen first, so alerts open in the app.
2. Install MacroDroid and allow it to read SMS.
3. New macro → trigger **SMS Received** (your bank/wallet senders, or any sender with content containing *debited*, *credited* or *paid*).
4. Action **Open Website** with the address shown in the Auto tab. It contains your private link key (`k=…`) and placeholders for the sender and message — insert them with MacroDroid's magic-text button. Keep `sms=` last.
5. Tap **Test with a sample alert**.

**Tasker:** the same address, with `%SMSRF` (sender) and `%SMSRB` (message).

**iPhone (Shortcuts):** Automation → New → **Message**, "Message contains" *debited*, **Run Immediately** → *URL Encode* the message → *Open URLs* with the address from the Auto tab. Repeat for *credited* and *paid*. Note: iOS opens links in Safari, which keeps separate data from the home-screen app — use Khata in Safari if you automate, or paste instead.

**Share sheet (Android, installed app):** long-press an alert → *Share* → *Khata*.

**Your link key** keeps other websites from adding entries to your ledger. Links that don't carry it show an "Add Rs X for Y?" confirmation instead of adding silently. If a link ever leaks, make a new key in the Auto tab and update your automations.

### One-tap links
In the Auto tab, build a link for something you buy often (e.g. Coffee, Rs 120, Cash) and pin it to your home screen or a voice-assistant shortcut. Opening it records the expense.

Link parameters: `amount` (required), `type` (`expense`/`income`), `name`, `account`, `category`, `description`, `date` (`yyyy-mm-dd`), `k` (your key) — or `sms` (+ optional `from`) with an alert's text.

### Statement
Download your statement from net banking or your wallet as **CSV** (if it only offers Excel, open it and *Save as CSV*). Choose the file — Khata finds the date, description and debit/credit (or signed amount, `Cr`/`Dr`, `(500)`) columns by itself and tells you if any rows couldn't be read. Exports from other expense apps work too; there's a blank template to download.

### Rules
"When the name contains *X*, use category *Y*." Rules beat Khata's built-in merchant guesses (Swiggy, Daraz, Pathao, NEA, Bhatbhateni…) and apply to SMS, statements, links and the add form.

## Budgets, goals and recurring

- **Budgets:** a limit per day, week, month or year, for all spending or chosen categories. Turn on **rollover** to carry unspent (or overspent) amounts into the next period. Bars turn amber at 80 % and red when over.
- **Goals:** a target and optional deadline; tap **+ Add** to record contributions.
- **Recurring:** rent, salary, EMIs, subscriptions. Each posts itself on its due date — missed dates are caught up next time you open Khata. Items due on the 29th–31st keep their day (28 Feb, then back to 31 Mar). Mark subscriptions to see their monthly and yearly cost.

## Loans, bill splitter, assets, labels

- **Loans:** money you lent or borrowed, with due dates and partial repayments.
- **Bill splitter:** enter a total and people (`Me, Asha, Ravi:500` — names alone split equally, `:amount` sets a custom share); tick people off as they pay.
- **Assets:** investments and property, added to your net worth.
- **Labels, people & places:** extra tags on transactions; each shows its transaction count and total.

## Reports

Pick a month from the strip, **This year**, or **Custom…** for any older month or year. You'll see net income, change versus the previous period, quick insights (savings rate, average daily spend, top category, largest expense), an income-vs-expense chart, and breakdowns by category, account and label. The filter button narrows by account or leaves categories out. Export as **CSV** or **Print / PDF**.

## Calculator pill

The small floating button with a calculator icon. Drag it to either edge — it remembers where you left it. Tap it for a calculator with **Copy**, **Add as expense** (opens the add sheet with the result) and **Clear**. Turn it off in *Preferences → Calculator pill*.

## Reminders

*Preferences → Reminders.* Allow notifications, then choose:

- **Daily nudge** at a time you pick, if nothing has been logged that day.
- **Budget alerts** at 80 % and 100 %.
- **Bills and loans** a day before they're due.
- **Weekly backup reminder.**

Each reminder is sent once. With the app installed on Android or desktop Chrome/Edge, reminders can arrive while Khata is closed; elsewhere they appear when you open it.

## Install and offline

Installing puts Khata on your home screen, opens it full-screen and makes it work without a connection.

- **Android / desktop (Chrome, Edge):** the *Install* banner on Home, *Preferences → Install app*, or the browser menu → *Install app*.
- **iPhone / iPad:** Safari → *Share* → *Add to Home Screen*.

Home-screen shortcuts: *Add expense*, *Paste bank SMS*, *Reports* (long-press the icon).

## Backup, restore and moving phones

Your data lives only on the device and browser you use.

- **Back up:** *Preferences → Download backup* saves a `.json` file (receipts included). Keep it somewhere safe, like Google Drive.
- **Restore:** *Preferences → Restore backup* replaces everything in the app with the file.
- **New phone:** back up on the old one, open Khata on the new one, restore.

Clearing your browser's site data for Khata deletes the ledger — back up first.

## Preferences

Appearance (Auto / Light / Dark), Hide amounts (dots instead of figures), Haptics, Calculator pill, Country and Currency, Reminders, Install, Banks & SMS, Categories (icons and colours), Labels, Backup / Restore / Delete all transactions, About, Run setup again.

## Troubleshooting

| Problem | Try |
|---|---|
| An alert was read wrongly or skipped | Fix it in the Paste preview, then [open an issue](https://github.com/chocolatewafer/Khata/issues) with the message text (mask your account number). |
| Alert filed under the wrong account | Add the last 4 digits to the right account in *Banks & SMS → Linked* or *Accounts*. |
| Category guessed wrongly | Change it once — Khata remembers names — or add a rule. |
| No notifications | Check *Preferences → Reminders* and your browser's site permissions; install the app for background reminders. |
| Automation opens the browser instead of the app | Install Khata first and allow it to open supported links. |
| Data missing after clearing the browser | Restore your latest backup. |
| Can't install on iPhone | Use Safari (other iOS browsers can't add web apps in all versions). |
