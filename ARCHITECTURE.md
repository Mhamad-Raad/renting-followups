# Rent Tracker: Architecture & Build Spec

This file is the full blueprint for a **Windows desktop application**. Build it exactly as described, in the milestone order given in section 18. Do not add features that are not listed. When something is unclear, pick the simplest option that matches the "Design principles" in section 2, and note the decision in `DECISIONS.md`.

Every rule in this file is binding and there are no conflicting sections: if two places seem to disagree, stop, write the question in `DECISIONS.md`, and choose the simpler, safer option.

---

## 1. Purpose

A fully **offline** Windows app for one person (the owner) who rents out many properties: houses, buildings, tourist areas, companies, land. Roughly **100-200 areas** in total. Each pays rent monthly. The app tracks which months each area has paid, how much was received, how much is left, and prints reports and receipts.

- Single user, single computer, no internet, no accounts, no cloud.
- Everything is stored in a local SQLite file.
- The owner is **old-fashioned** (not visually impaired). He is not used to modern software. The UI must be calm, classic, obvious and forgiving. See section 2.

**Out of scope (do NOT build):** documents or photo attachments, multi-user, login sessions or auto-logout, online sync, email/SMS, currency conversion, contract end dates, deposits.

---

## 2. Design principles (most important section)

UX matters more than anything else in this project.

1. **Few screens, plain words.** Use everyday wording ("Money received", "Still owed"), not technical terms. Every user-facing message, including errors, is plain and exists in all three languages.
2. **Classic layout.** A fixed sidebar on the start side (right in RTL languages, left in English) with big labelled items. It opens collapsed to its icons (every item and the bell count stay visible); one button at its top shows or hides the names. No hidden menus (the one exception: the ⋯ menu on each row of the Areas list, whose actions are also visible buttons on the area page), no hamburger menus, no gestures, no hover-only actions.
3. **One obvious main action per screen.** Every area page has one large primary button: **Record Payment**.
4. **Readable by default:** base font 18px, buttons at least 48px tall, generous spacing. Font size can be raised in settings.
5. **Never lose data by mistake:**
   - Every delete asks for confirmation in plain words.
   - Deleting is a **soft delete** (moves to a "Deleted items" list that can be restored).
   - After saving a payment, show an **Undo** option for it for as long as the screen is open, and the payment can be edited or removed later from the area's payment list.
   - Edits and cancellations are recorded in an audit log (section 5).
6. **Always show the result of an action** with a clear message ("Payment saved. Receipt No. 0042").
7. **Colour is never the only signal.** Month boxes show the month number on the status colour; the large boxes also show the amount and a status word, and every box has a spoken label. *(Owner's decision, 2026-10-25: numbers instead of symbols in the small strips too.)*
8. **No modal chains.** At most one dialog open at a time.
9. **The app stays unlocked** once the password is entered (see section 10). No timeouts, no surprise lock screens.
10. **Keyboard friendly:** logical tab order, **Enter** submits the main action, **Esc** closes dialogs, visible focus outline. Amount fields select their content on focus and show thousands separators while typing.
11. **Empty states are helpful:** on an empty database show one large message and one button ("Add your first area" / "Import from Excel").
12. **Window:** minimum size 1100x700, starts maximized, correct on high-DPI screens and 125%/150% Windows scaling.

---

## 3. Technology stack

| Concern | Choice |
|---|---|
| Shell | **Electron** (latest stable), Windows 10 and 11, x64 |
| UI | **React + TypeScript**, bundled with **Vite** |
| Database | **SQLite** via `better-sqlite3` (runs in the Electron main process) |
| Validation | `zod` for every IPC payload |
| i18n | `i18next` + `react-i18next`, JSON translation files |
| PDF | Electron `webContents.printToPDF` from print-styled HTML pages |
| Printing | Electron `webContents.print` with A4 print CSS |
| Excel export/import | `exceljs` |
| Password hashing | Node `crypto.scrypt` with a random salt (no plain text anywhere) |
| Installer | `electron-builder`, NSIS installer (`.exe`), per-user install, desktop shortcut |
| Tests | `vitest` (unit), Playwright for Electron (end-to-end) |
| Styling | CSS variables for themes. No heavy UI framework; keep components simple and large |

Security rules for Electron: `contextIsolation: true`, `nodeIntegration: false`, a preload script exposing a small typed API (IPC) to the renderer. The renderer never touches the database or filesystem directly and is never trusted (all IPC input is validated in the main process). Disable remote content: the app must make **zero network requests**.

---

## 4. Folder structure

```
rent-tracker/
├─ ARCHITECTURE.md
├─ DECISIONS.md                 # notes on any choices made during the build
├─ package.json
├─ electron-builder.yml
├─ scripts/seed.ts              # dev only: 200 demo areas with 3 years of payments
├─ src/
│  ├─ main/                     # Electron main process
│  │  ├─ index.ts               # window creation, app lifecycle, single-instance lock
│  │  ├─ ipc/                   # one file per area: areas, payments, reports, settings, auth, backup, import
│  │  ├─ db/
│  │  │  ├─ connection.ts       # opens the SQLite file in app.getPath('userData'); the ONLY place that knows about encryption
│  │  │  ├─ migrations/         # numbered .sql files, run in order, tracked in schema_version
│  │  │  └─ repositories/       # categories, areas, renters, prices, payments, receipts, settings, audit
│  │  ├─ services/
│  │  │  ├─ monthStatus.ts      # the single source of truth for paid/partial/late logic
│  │  │  ├─ allocation.ts       # splits a payment across months
│  │  │  ├─ auth.ts             # password + recovery phrase
│  │  │  ├─ backup.ts
│  │  │  ├─ notifications.ts
│  │  │  ├─ importAreas.ts      # Excel/CSV import
│  │  │  ├─ pdf.ts
│  │  │  ├─ excel.ts
│  │  │  └─ logger.ts           # local rotating log file
│  │  └─ util/
│  │     ├─ parseNumber.ts      # Western / Arabic-Indic / Persian digits, separators
│  │     └─ normalizeText.ts    # Kurdish/Arabic letter normalization for search
│  ├─ preload/index.ts          # exposes window.api
│  └─ renderer/
│     ├─ app/                   # routing, layout, theme + direction provider, error boundary
│     ├─ pages/                 # see section 8
│     ├─ components/            # MonthBoxes, MoneyText, BigButton, ConfirmDialog, etc.
│     ├─ print/                 # print-only templates: ReportPrint, ReceiptPrint
│     ├─ i18n/                  # ckb.json (Sorani), en.json, ar.json
│     └─ styles/                # tokens.css, themes.css, print.css
└─ tests/
   ├─ unit/                     # monthStatus, allocation, totals, parseNumber, normalizeText, backup, migrations
   └─ e2e/                      # Playwright flows (section 17)
```

---

## 5. Data model (SQLite)

All money values are stored as **integers in the smallest sensible unit** (IQD: whole dinar; USD: **cents**) to avoid floating-point errors. Business dates are stored as date-only text (`YYYY-MM-DD`) in local time; never store timestamps with time zones for business dates. Every table has `id INTEGER PRIMARY KEY`, `created_at`, and (where deletable) `deleted_at NULL`.

Database settings: WAL mode, `foreign_keys = ON`, all multi-row writes inside transactions.

### categories
`id, name, color (nullable hex), sort_order, deleted_at`

### areas
`id, category_id → categories, name, name_normalized, currency ('IQD' | 'USD'), address (nullable), contract_start (nullable date, informational only), notes (text), deleted_at`
- `currency` is chosen when the area is created. It can be **corrected on Edit until the area has a payment that counts** (cancelled receipts keep their own currency and do not block it); the rent keeps its written number (250,000 dinar becomes 250,000 dollars). From the first payment on it **cannot be changed**, enforced by the database. *(Owner's decision, 2026-10-27: a wrongly chosen currency must be fixable.)*
- The area form requires **"Rent starts from" (month number + year, default current month)**. It becomes the first `area_prices` row and decides which months count as applicable.
- The area name is **optional**: many owners know a place only by its category and its renter. An area without a name is shown everywhere by its **category** as its name, with the renter in their own column beside it (or on the line under it where there is no renter column), so places of one category are told apart by their renter. Lists sort by that name, then by renter. *(Owner's decision, iteration 13; the category replaced the renter as the name on 2026-10-26 at the client's request.)*
- Area names that are filled in are unique within a category (warn, do not crash). Areas without a name never clash.
- `name_normalized` supports search (section 9).

### area_prices (rent price history)
`id, area_id, monthly_price (int), effective_from_year, effective_from_month`
- The price for a given month is the row with the latest `(year, month)` that is ≤ that month. Months before the first row are **not applicable**.
- Creating an area creates its first row. "Change price" adds a new row from the chosen month; **old months keep their old price**.
- A `monthly_price` of **0** means the area is **vacant** from that month (see section 6). The UI never shows the word "zero price"; it offers **Mark as vacant from month...** and **Set rent again from month...**. Marking an area vacant also ends its current renter, on the first day of the vacant month (or the day they started, if later); a vacant area never has a renter, and a new area marked vacant takes no renter. *(Owner's decision, 2026-10-27.)*

### renters (renter history per area)
`id, area_id, full_name, full_name_normalized, phone, started_on (date), ended_on (nullable date)`
- The current renter is the row with `ended_on IS NULL`. **Change renter** only adds a new renter: it closes the old row and opens a new one. A renter leaving is recorded by **Mark as vacant** (section 4, prices). History stays visible on the area page.

### receipts
`id, receipt_number (unique, sequential, displayed zero-padded as 0001; NULL for backfilled payments), is_backfill (bool), area_id, renter_name_snapshot, renter_phone_snapshot, currency, total_amount, paid_on (date), note, voided_at (nullable), print_count`
- Numbers never repeat and are never reused, even after a void. Backfilled (historical) payments do not consume a receipt number (section 7.3).
- Snapshots keep old receipts correct even if the renter later changes.
- `print_count` makes reprints stamped **"Copy"** (first print is the original).

### payment_allocations
`id, receipt_id, area_id, year, month, amount`
- A single payment is split across one or more months. This is how "several months at once" and "partial months" work.
- A month's paid amount = sum of `amount` over non-voided receipts for that `(area_id, year, month)`.

### audit_log
`id, at, action, entity, entity_id, details_json`
Records edits and voids of receipts, price changes, renter changes, deletes and restores. Read-only list viewable from Settings.

### settings
Key/value table: `language, digit_style, theme_mode, theme_color, sidebar_style, font_family, font_size, print_title, logo_path, backup_folder, last_backup_at, remind_days_before_month_end, password_hash, password_salt, recovery_hash, recovery_salt, last_receipt_number, report_filters_last_used`

### schema_version
`version, applied_at`. Migrations run automatically on startup, in order, inside a transaction, after an automatic safety snapshot of the database.

---

## 6. Core business logic (`monthStatus.ts`)

This one module decides every colour and every total. Everything (UI, print, Excel, notifications, Home cards) must call it. Do not duplicate this logic anywhere else. Write unit tests for it first.

**Inputs:** `expected` (price effective for that month), `paid` (sum of allocations), `today`, and the month in question.

**Output status per month box:**

| Condition | Status | Colour |
|---|---|---|
| Month is before the area's first price row, or its effective price is 0 (vacant) | **not applicable** | Light hatched/empty, excluded from totals, never late |
| `paid >= expected` (and `expected > 0`) | **paid** | **Green** |
| Month is in the **past** (before the current month) and `paid < expected` (partial or nothing) | **late** | **Red** |
| Month is the **current month** and `paid < expected` (partial or nothing) | **due** | **Orange** |
| Month is in the **future** and `0 < paid < expected` | **partial** | Orange |
| Month is in the **future** and `paid == 0` | **upcoming** | Neutral grey |

Rules:
- A month turns red on **the 1st of the next month** (no grace period).
- A partial payment is orange while it is the current month (or a future month) and turns red once the month has passed.
- "Today" comes from the Windows clock. At startup, if the clock date is earlier than the latest recorded payment date or the last backup date, show a plain warning ("The computer date looks wrong. Late rent colours may be incorrect.").
- Overpayment on one month is never silently kept in that month: allocation fills each month only up to its expected amount (see section 7).

**Yearly figures for one area and one year:**
- `expected_year` = sum of expected for applicable months.
- `received_year` = sum of paid, capped per month at expected for the "still owed" calculation.
- `remaining_year` (**Still owed**) = the rent not yet paid for applicable months **up to and including the current month** (the late and due months); months still to come are not counted. Never below 0. For a past year this is every month; for a future year it is 0. *(Owner's decision, iteration 6.)*

**What "received" means:** all yearly figures (area page, reports, Home cards) are based on **the rent month a payment was allocated to**, not the date cash arrived. Example: rent for month 12 paid in November counts toward the year of that month 12. Show one plain sentence explaining this in the footer of the Reports page. Use the same definition everywhere.

**Report status filter (year view):**
- *Late* = at least one red month.
- *Partial* = at least one orange month and no red month.
- *Paid* = every applicable month up to and including the current month is green.

**Changing a price:** the form asks "From which month?" and defaults to the **current month**. Money already paid for the chosen month or later is **shared out again with the new rent**, oldest receipt first, each receipt filling oldest month first from the later of the change month and the month it originally started at (the same rules as section 7.1). A higher rent fills fewer months; a lower rent moves the extra on to the next months. Each receipt keeps its number and total; only the months it covers change. Months before the change and cancelled receipts are not touched. Before saving, show a plain warning listing every month that gains or loses money or changes status (for example "Month 4: Paid 250,000 → Late 200,000") and require confirmation. If the money would have no month to go to (for example the area stays vacant), refuse and ask to cancel or edit those receipts first. Never silently rewrite the past. *(Owner's decision, iteration 6 review.)*

**Totals in any report** are always shown **separately per currency**: one total row for IQD, one for USD. **No conversion, ever.**

Numbers display as thousands-separated. IQD has no decimals; USD shows 2 decimals.

---

## 7. Payments and receipts

### 7.1 Record Payment (the most-used flow)

Button: **Record Payment**, always visible on the area page and on rows of the "Needs attention" list.

Form (large, single column):
1. **Amount received** (big number field; currency label fixed by the area; parsing per section 9).
2. **From which month** (defaults to the oldest month that is not fully paid; year + month number selectors).
3. **Date received** (defaults to today).
4. **Note** (optional).

**Allocation preview**, shown live before saving: the amount is distributed **oldest unpaid month first starting from the chosen month**, filling each month up to its expected amount, for example "Month 3: full, Month 4: full, Month 5: partial 50,000 of 250,000". Months that are vacant or not applicable are skipped. The remainder continues into following months and years.

**Overpayment horizon:** allocation may run forward at most **24 months** past the current month. If the amount is larger than everything owed within that horizon, block saving and say so plainly ("This amount is more than 2 years of rent. Please check the number.").

Buttons: **Save** and **Save and make receipt PDF**. After saving, show "Payment saved. Receipt No. 0042" with **Save receipt as PDF**, **Undo**, and **Close**. Receipts are only ever saved as PDF, never sent straight to a printer; the owner prints from the PDF if needed. *(Owner's decision, 2026-10-27.)*

### 7.2 Editing and cancelling

Each receipt in the area's payment list has **Edit** and **Cancel receipt** (confirmation required; voided receipts stay listed, crossed out, and stop counting). Both actions are written to the audit log.

### 7.3 Record past payment (backfill)

A second button on the area page, **Record past payment**, lets the user mark months as paid for earlier dates **without** a numbered receipt (`is_backfill = true`, `receipt_number = NULL`). This is how the user catches up on existing data. These entries are marked "Past record" in lists and cannot be printed as numbered receipts. They count in all totals exactly like normal payments.

### 7.4 Click a month box (owner's decision, 2026-10-25)

On the area page and in the Areas list, every month box that has rent is a button:
- **A month not fully paid** (late, due, partial or upcoming): after a short question ("Mark month 5 of 2026 as paid? 825,000 IQD"), the rest of that month's rent is recorded as a normal payment dated today, **with a receipt number**, filling only that month.
- **A paid month**: after a short question that lists what will change, that month is taken out of the receipts that paid it. A receipt that paid only this month is cancelled; a receipt that paid other months too keeps its number and its other months, and its amount goes down by this month's share. Its months may then have a gap (for example 1-2 and 4-8). The change is in the Activity log.
- A month marked as paid can be undone like any new payment. Editing a receipt with a gap only for its date or note keeps its months; changing its amount or start month, or a price change from an earlier month, shares its money out again oldest month first (with the usual preview or warning), which fills the gap.
- Vacant and not-started months are not buttons. Report screens and prints are not clickable.

---

## 8. Screens

Sidebar items (always visible, large, with icons; the names show when the sidebar is opened): **Home, Areas, Reports, Notifications, Settings.**

### 8.1 Lock screen (app start only)
Large password field and one **Open** button. A "Forgot password?" link goes to recovery (section 10). The app language is the last used.

### 8.2 Home
- Big summary cards for the current year: **Received**, **Still owed**, **Late areas count**, separate per currency.
- A list "Needs attention now" (late and due areas) with a **Record Payment** button on each row. It includes areas that still owe from **earlier years**, so a new year never hides a debt; the Late areas count uses the same rule. *(Owner's decision, iteration 6.)*
- Big shortcut buttons: **Add area**, **Record payment**, **Print report**.

### 8.3 Areas list
- Category chips (All + each category, in its colour). Add / edit / delete categories from here.
- Search box (by area name, renter name, phone), using normalized text matching (section 9).
- Each row: area name, category, renter name, phone, monthly rent, then for the current year: **Total for the year**, **Received**, **Still owed**, the compact 12-box strip with a status word, then **Notes** (two lines at most) and a **⋯ menu** with the area page's actions (Record payment, Record past payment, Edit, Change price, Mark as vacant / Set rent again, Change renter, Delete); each opens its form right on the list, without leaving it; Edit opens its own page and returns to the list after saving. Click a row to open the area page.
- Big **Add area** button and an **Import from Excel** button (section 16).
- Checkboxes to select several areas, then **Print selected** / **Export selected**.

### 8.4 Area page (the key screen)
Top: area name, category, currency, address, notes, current renter (name + phone), current monthly price (or "Vacant"), and buttons **Record Payment** (primary), **Record past payment**, Edit, **Change price**, **Mark as vacant / Set rent again**, **Change renter**.

Filter bar on top: **Year** selector (default **current year**, range from the earliest year with data, or the current year, up to the current year + 2) and optional **Month** selector (All / 1-12).

Then, for the selected year:
- Four figures: **Rent price**, **Total for the year** (expected), **Received**, **Still owed**.
- **12 boxes** in a row/grid (2 rows of 6 on narrow widths). Each box shows the month number (1-12), the amount paid, and a status word. Colours per section 6: green / orange / red / grey / hatched.
- Notes field.
- List of receipts for the year (number or "Past record", date, amount, months covered) with Save receipt as PDF / Edit / Cancel.
- Price history and renter history (collapsible, plain).
- Buttons: **Export to PDF**, **Export to Excel**. *(Owner's decision, 2026-10-25: no direct Print button here.)*

### 8.5 Reports
Filter container at the top:
- **Year** (default current year, always), **Month** (All or a specific one), **Category** (All or one), **Currency** (All / IQD / USD), **Status** (All / Paid / Partial / Late). The last-used filters except the year are remembered.
- Area picker with checkboxes ("Select all" / "Select none").

Result table, one row per area, with these columns:
**Area name, Category, Renter name, Renter phone, Monthly price, Received, Still owed, the 12 month boxes (coloured), Notes.**

At the bottom: **totals per currency**, in separate rows (IQD total, USD total), for price, received and still owed. A one-sentence footer explains what "received" means (section 6).

Buttons: **Print**, **Export PDF**, **Export Excel**. Print, PDF and Excel contain **exactly the same fields and the totals at the bottom**. Printing uses the logo and title from settings. A4, landscape for the wide report table.

When a specific month is chosen in the filter, the table shows that month's status per area and totals for that month.

### 8.6 Receipt print
A4 page: logo (if set), print title (if set), "Receipt No. 0042", date, area name, renter name and phone, months covered, amount (with currency), note, signature line. One receipt per page, saved as PDF. Saving it again is stamped **"Copy"**.

### 8.7 Notifications (see section 11)

### 8.8 Settings (see section 12)

### 8.9 Deleted items
Reachable from Settings. Lists soft-deleted areas, categories and so on, each with **Restore**.

### 8.10 Activity log
Reachable from Settings. Read-only list of the audit log (who/what/when for edits, cancellations, price and renter changes, deletes, restores).

---

## 9. Languages, direction and text handling

- Languages: **Kurdish Sorani (main/default)**, **English**, **Arabic**.
- Sorani and Arabic are **RTL**; English is **LTR**. Switching language flips the whole layout (`dir` on the root element). Use **CSS logical properties** (`margin-inline-start`, `padding-inline-end`, etc.) everywhere so no screen needs separate RTL styling. Icons that imply direction (arrows, back buttons) must flip.
- All text comes from `ckb.json`, `en.json`, `ar.json`. No hard-coded strings in components. Provide complete translations for all three languages. Sorani wording must be natural and is flagged in `DECISIONS.md` for review by a native speaker.
- **Months are shown as numbers 1-12**, not names. Digit style is a setting: **Western (1 2 3)** or **Arabic-Indic (١ ٢ ٣)**; it applies to all numbers, dates and receipt numbers, including prints and Excel.
- Dates use the Gregorian calendar.
- Printed documents use the language chosen at print time (default: current app language).
- **Fonts:** bundle fonts locally (no web fonts). Every bundled font must be checked for the full Sorani character set (ڕ ڵ ۆ ێ ە ڤ پ چ ژ گ ک); a font that lacks a letter must not be offered in Settings.
- **Search normalization:** searching treats equivalent letters as the same: Arabic ي / Kurdish ی, Arabic ك / Kurdish ک, ه / ە, ة, and ignores diacritics and the tatweel (ـ). Store normalized copies (`name_normalized`, `full_name_normalized`) and normalize the query the same way (`normalizeText.ts`).
- **Number input parsing** (`parseNumber.ts`): the user may type Western digits (123), Arabic-Indic digits (١٢٣) or Persian digits (۱۲۳), with or without thousands separators (`,` or `٬`) and decimal separators (`.` or `٫`). All must parse to the same value regardless of the digit-style display setting.
- **Sorting:** sort names with `Intl.Collator` using the locale for the active language (`ckb`, `ar`, `en`).
- **Mixed text:** phone numbers and amounts inside RTL text must keep correct visual order (use `dir="ltr"` / `<bdi>`). Test printed output and Excel for this.

---

## 10. Authentication and password recovery

- On every app launch, show the lock screen. There are **no sessions, no auto-logout, no idle timeout.** Once unlocked, the app stays open until the user closes it or the computer turns off.
- First run: a setup screen asks the user to create a **password** and a **recovery phrase** (typed by the user, something he writes down himself; the app does not generate it). The password is entered twice.
- Store only **scrypt hashes with salts**. Never store or log either value in plain text.
- **Forgot password:** the user enters the recovery phrase; if it matches, he can set a new password. After 5 wrong attempts, wait 30 seconds before trying again.
- Settings has **Change password** (requires the current one) and **Change recovery phrase**.
- If both password and recovery phrase are lost there is no reset. Say this clearly on the setup screen in plain words: "Write down your recovery phrase and keep it safe."
- **Honest scope:** the password **locks the app interface**; it does not encrypt the database file. Someone with access to the Windows account could read the file. This is acceptable for one PC and one user, and must be recorded in `DECISIONS.md`. If real protection is wanted later, switch to SQLCipher (`better-sqlite3-multiple-ciphers`) with a key derived from the password; all database access goes through `db/connection.ts`, so this swap must touch only that file.

---

## 11. Notifications

Notifications are computed from the data (not stored), shown in two places:
1. A **popup when the app opens** (after unlock), one large, plain dialog listing items, with an **OK** button and a **Go to Notifications** button. Not shown if there is nothing to report.
2. The **Notifications** page and a **bell icon with a count** in the sidebar.

Types:
- **Late rent:** an area has a month that has passed unpaid or partly paid. Shows area, renter, month number(s), amount owed, with **Record Payment**. Vacant months never appear.
- **Month reminder:** the current month is unpaid or partly paid and the month ends within *N* days (setting `remind_days_before_month_end`, default **7**). Also shown on the **last 3 days** regardless.
- **Backup reminder:** a backup has not been made this calendar month (see section 13).

The popup and the page use the same function so they never disagree. Also fire a normal Windows toast once per day if the app is running and something needs attention (optional; do not make it a dependency).

---

## 12. Settings

One page, grouped into big sections, each with a short plain label and live preview where relevant:

- **Language** (Sorani / English / Arabic) and **Number style** (1 2 3 / ١ ٢ ٣).
- **Appearance:** **Light mode / Dark mode** toggle; **Theme colour** (6-8 ready-made colour choices shown as large swatches, blue by default); **Sidebar** (Light / Dark navy, light by default); **Font family** (choose from a list of bundled fonts, each shown in its own font, including at least 4 fonts that support Sorani well); **Font size** (Small / Normal / Large / Extra large, default Normal, applied app-wide via a CSS variable).
- **Printing:** **Print title** (text, optional) and **Logo** (choose an image file, optional; copied into the app data folder; shown on reports and receipts; a **Remove logo** button). Include a live **print preview** of a sample receipt header.
- **Reminders:** days before month end (default 7).
- **Backup:** folder, **Back up now**, **Restore from backup** (see section 13).
- **Security:** change password, change recovery phrase.
- **Deleted items** and **Activity log.**

All settings apply immediately and persist.

Light and dark themes must both have adequate contrast, and the month status colours (green, orange, red, grey) must stay clearly distinguishable in both.

---

## 13. Backup and restore

- **Back up now:** copies the SQLite database (using SQLite's safe backup API, not a raw file copy while open) to a chosen folder, named `rent-backup-YYYY-MM-DD.db`. Settings, logo and the receipt counter are included (logo copied alongside in a `.zip` is fine).
- **Monthly reminder:** if no backup exists for the current calendar month, show the backup reminder (section 11) with a one-click **Back up now** button that uses the saved folder (asks for a folder the first time).
- **Backup location warning:** if the chosen folder is on the same drive as the database, show plain advice ("A copy on the same drive is lost if the drive fails. Please also copy backups to a USB drive."). Never block.
- **Restore:** pick a backup file, show its date and a plain warning ("This will replace all current data"), require confirmation, and automatically save a safety copy of the current data first. Restart the app after restoring.
- **Compatibility:** a backup created by a newer app version is refused with a plain message. An older backup is migrated forward after restoring.
- Keep the last 12 backups in the folder; do not delete anything the user did not create through the app.
- Backup files are plain copies of the database; tell the user in plain words to keep them somewhere safe.
- A safety snapshot is also written automatically before every database migration.

---

## 14. Printing and exporting details

- Paper: **A4**. Reports use landscape; receipts portrait.
- The print layout is separate from the screen layout (`print.css` / `src/renderer/print/`). It must be RTL/LTR aware and use the chosen font.
- Month boxes print with their colours and the month number, as on screen (owner's decision, 2026-10-25). Vacant and not-started months stay hatched. A black-and-white printer no longer tells the statuses apart; the Received and Still owed figures on every row still do.
- Every printed report has: logo + title (if set), report title, filters used (year, month, category), generated date, the table, and the **totals per currency at the bottom**. Long tables repeat the header row on every page and add page numbers.
- **PDF:** the same print HTML rendered to PDF; the user picks the save location.
- **Excel:** one sheet with the same columns and totals rows; month columns contain the paid amount with the same colours as cell fills; the sheet is set right-to-left for Sorani and Arabic.

---

## 15. Reliability and data safety

- **Integrity:** run `PRAGMA integrity_check` at startup; if it fails, show a plain message and offer **Restore from backup**.
- **Single instance:** `app.requestSingleInstanceLock()`. A second launch focuses the existing window, so two copies never write to one database.
- **Data location:** `app.getPath('userData')`. The installer and **uninstaller must never delete the data folder**; add a clear note on the uninstall screen.
- **Validation:** validate every IPC payload in the main process with `zod`. Reject negative amounts, impossible months, and impossible dates.
- **Error handling:** a React error boundary shows a friendly "Something went wrong. Your data is safe." page with **Go back**. Technical details go only to a local rotating log file in `userData/logs`, containing IDs only, no names or phone numbers.
- **No network:** no telemetry, no update checks, no remote fonts or images.

---

## 16. Getting existing data in (critical: the owner already has 100-200 areas)

- **Excel/CSV import of areas:** the app provides a downloadable template (area name (optional), category, currency, monthly price, rent start month/year, renter name, renter phone, address, notes). The import shows a preview with row-level errors in plain wording (e.g. "Row 12: currency must be IQD or USD") and only commits when the user confirms. Unknown categories are created automatically. Duplicate names inside a category are flagged, not silently merged.
- **Record past payment (backfill):** section 7.3.
- **Demo data generator:** `npm run seed` (dev only) creates 200 areas with 3 years of mixed payments, for performance and UI testing. It is never included in the installer.

---

## 17. Testing

- **Unit tests (vitest):** month status (every row of the table in section 6, including vacant and year boundaries), price history and price-change warnings, allocation (partial, prepaid, several months at once, 24-month horizon), totals per currency, number parsing, text normalization, backup/restore, migrations.
- **Migration test:** open a database from every previous schema version and upgrade it.
- **End-to-end tests (Playwright for Electron):** first-run setup and unlock; add area; record a payment with a partial month; change price; backfill a past payment; report totals with IQD and USD separate; print-to-PDF output exists; language switch flips layout; backup then restore.

---

## 18. Build order (milestones)

Build and test each milestone before starting the next. After each one, make sure `npm run dev` and `npm test` work, and write a short note in `DECISIONS.md` of anything decided along the way.

1. **Project setup:** Electron + React + TS + Vite, the preload/IPC pattern with `zod`, SQLite connection, migration runner, base layout with sidebar, i18n with the three languages and the RTL/LTR switch, theme tokens (light/dark), `parseNumber` and `normalizeText` utilities with tests.
2. **Auth:** first-run setup, lock screen, hashing, recovery flow, single-instance lock.
3. **Categories and areas:** CRUD, currency fixed at creation, rent start month, price history, vacant/set rent again, renter history, soft delete + restore, search, audit log.
4. **Month status engine:** `monthStatus.ts` with thorough unit tests (partial, prepaid, price changes mid-year, year boundaries, current month vs past, not-applicable and vacant months).
5. **Payments:** the Record Payment form with live allocation preview and horizon limit, receipts with sequential numbers, edit/void, undo, "Record past payment" (backfill).
6. **Area page:** filter bar (year default current, month), the four figures, the 12 coloured boxes, receipts list, price-change warning.
7. **Reports:** filter container, table, totals per currency, selection of areas, status filter.
8. **Printing and exports:** receipt print (with "Copy" stamp), report print, PDF, Excel, logo and title.
9. **Notifications:** popup on open, notifications page, bell count, month reminders, backup reminder, clock warning.
10. **Settings:** fonts, font size, theme colours, dark/light, digit style, print settings, reminder days, deleted items, activity log.
11. **Backup and restore:** including safety snapshots, location warning, compatibility check, integrity check at startup.
12. **Excel import of areas** and the `npm run seed` demo data generator.
13. **Polish and QA:** full translation review, accessibility of sizes and contrast, empty states, keyboard flow, performance with 200 areas and 5 years of data, end-to-end tests.
14. **Packaging:** NSIS installer (data folder never deleted on uninstall), app icon, version number, auto-created data folder, first-run experience.

---

## 19. Acceptance criteria

The app is done when all of these are true:

- [ ] Installs with a normal Windows installer on Windows 10 and 11 and runs with **no internet connection**; no network requests are made. Uninstalling never deletes data.
- [ ] Password is required on launch; there is no session timeout; recovery works with the user-typed phrase; nothing sensitive is stored in plain text. A second launch does not open a second copy.
- [ ] Areas are grouped into named categories (with optional colour), carry a currency set at creation, and support price changes from a chosen month without altering past months; a price change over paid months shows a warning first.
- [ ] Areas can be imported from Excel, and past payments can be backfilled without numbered receipts.
- [ ] A renter can pay several months at once and pay partially; the preview shows exactly how the money is allocated before saving; absurdly large amounts are blocked.
- [ ] Month boxes: **green** = fully paid, **orange** = the current month not fully paid (or a partial prepayment), **red** from the 1st of the next month for any unpaid or partly paid month, **grey** for future months, **hatched** for vacant or not-yet-started months, which are excluded from late status and totals.
- [ ] The area page shows price, year total, received, still owed, the 12 boxes, renter name and phone, and notes, and filters by year (default current) and month.
- [ ] Reports filter by year, month, category, currency and status; print, PDF and Excel contain the same fields; **IQD and USD totals are separate** at the bottom.
- [ ] Receipts are numbered sequentially (never reused), print on A4, show the logo and title when set in settings, and reprints are marked "Copy".
- [ ] All three languages work, with Sorani as default; switching flips the layout correctly; months display as numbers; digit style is switchable.
- [ ] Amounts typed in Western, Arabic-Indic or Persian digits are all understood; searching Sorani names works regardless of Arabic/Kurdish letter variants.
- [ ] Settings change font family, font size, theme colours, and light/dark mode immediately and persistently.
- [ ] Notifications appear on open (late rent, month reminder, backup reminder) and on the Notifications page with the same content.
- [ ] Monthly backup reminder works; Back up now and Restore work; a safety copy is made before restoring; a damaged database offers restore.
- [ ] Every delete is confirmed and recoverable; saved payments can be undone; edits and cancellations appear in the activity log.
- [ ] With 200 areas and several years of payments, the Areas list and Reports open in under 1 second.
- [ ] All unit, migration and end-to-end tests pass.
