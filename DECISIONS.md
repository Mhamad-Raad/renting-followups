# Decisions

Choices made during the build, with the reason. Newest iteration last.

## Iteration 0: Repository and tooling

### Node.js 24 and npm

`.nvmrc` pins Node 24 (current LTS) and `package.json` `engines` allows `>=24 <25`. GitHub Actions reads the same `.nvmrc`, so the local and CI versions cannot drift.

### TypeScript 6.0, not 7

TypeScript 7 is out, but `typescript-eslint` (8.72) only supports TypeScript below 6.1. We use TypeScript 6.0.3 so linting with type information keeps working. Revisit when `typescript-eslint` supports 7.

### Strict TypeScript options

Besides `strict`, the config turns on `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes`. Both catch real bugs around money and month arrays (for example reading month 13 of a 12-item list) at compile time.

### Placeholder `dev` and `build` scripts

The Electron app is scaffolded in iteration 1. Until then `npm run dev` and `npm run build` run `scripts/placeholder.mjs`, which only prints a message, so CI and the documented commands work from day one. Iteration 1 replaces both scripts and deletes the placeholder.

### `npm run check`

Runs typecheck, then lint (ESLint and `prettier --check`), then unit tests. Vitest uses `passWithNoTests` so an empty project still passes; the first real tests arrive in iteration 1.

### Formatting excludes the specification files

`ARCHITECTURE.md` and `IMPLEMENTATION.md` are in `.prettierignore` so the owner's text is never reformatted.

### Dependencies (all dev-only, exact versions, locked by `package-lock.json`)

| Package                                                | Why                                                                           |
| ------------------------------------------------------ | ----------------------------------------------------------------------------- |
| `typescript`                                           | Type checking (required by the stack).                                        |
| `@types/node`                                          | Types for Node APIs used by scripts and the main process.                     |
| `eslint`, `@eslint/js`, `typescript-eslint`, `globals` | Linting: catches `any`, stray `console.log`, unsafe patterns.                 |
| `prettier`, `eslint-config-prettier`                   | One code format; the ESLint config turns off rules that would fight Prettier. |
| `vitest`                                               | Unit tests (required by the stack).                                           |

### npm install scripts are reviewed in `allowScripts`

npm 11 lists every dependency install script that is not reviewed in `package.json` (`allowScripts`). Today this is a warning only; a future npm release will block unreviewed scripts. (Corrected in iteration 1: the first version of this note wrongly said npm already blocks them.)

No dependency needs an install script, so every entry is `false`:

- `better-sqlite3`: ships ready-made native builds for Windows and macOS inside the package, and the same build loads in plain Node and in Electron. Its fallback compile step must never run.
- `electron-winstaller`: part of the Squirrel installer, which we do not use (we use NSIS).
- `fsevents`: macOS-only file watcher, optional.

Electron downloads its own binary on first run, so it needs no install script either.

## Iteration 1: App skeleton

### Shared code lives in `src/shared/` (folder structure deviation, approved by the owner)

`ARCHITECTURE.md` places `parseNumber.ts` and `normalizeText.ts` in `src/main/util/`. Both are also needed by the screen (amount fields, search box), and the main process needs them too (Excel import, stored search columns). To keep one copy of each, they live in a new folder, `src/shared/`, together with other pure code used by more than one process: the IPC contract (`ipc.ts`), settings schema, currency rules, digit handling and number formatting. A lint rule forbids Node or Electron imports in `src/shared/`, so it stays safe to load anywhere.

### SQLite build: no rebuild step

`better-sqlite3` 13 ships ready-made builds for Windows and macOS inside the package, and the same build loads in plain Node and in Electron 44. So the unit tests run the real database under plain Node, `npm test` works from a fresh clone, and there is no `electron-builder install-app-deps` step and no need for Visual Studio build tools. Packaging (iteration 14) must still unpack it from the asar archive (`asarUnpack`).

### Electron downloads itself on first use

Electron 44 no longer downloads its program during `npm install`. `npm run dev`, `npm run preview` and `npm run test:e2e` first run `install-electron`, which downloads it once and otherwise does nothing.

### Migrations

Numbered `.sql` files in `src/main/db/migrations/`, bundled at build time. All pending migrations run in **one** transaction, so the file is either fully upgraded or untouched. Before upgrading an existing database, a complete copy is written with SQLite's `VACUUM INTO` to `safety-copies/` in the data folder. These copies are not deleted automatically (they only appear when the app is updated). A database from a newer app version is refused.

### Data folders

The app is named `Rent Tracker`. Development runs use the `Rent Tracker-dev` folder; end-to-end tests point each test at its own temporary folder with `RENT_TRACKER_DATA_DIR`. Both overrides only work in unpackaged builds, so the installed app always uses its real folder.

### Ghost mode for tests

With `RENT_TRACKER_GHOST=1` (unpackaged builds only) the window is still rendered but invisible, unfocusable, click-through and has no Dock icon. The end-to-end tests always use it, so they never interrupt someone working on the same computer.

### Security

On top of `contextIsolation`, no `nodeIntegration` and a sandboxed preload: a Content Security Policy meta tag, every request outside the app's own files blocked in the main process, all permission requests denied, webviews blocked, new windows denied, and all navigation blocked (page changes use the URL hash, which is not navigation). DevTools are off in the packaged app. IPC handlers check that the caller is the app's own page and validate every input with zod. An end-to-end test confirms no request leaves `file://`.

### Windows has no menu bar

The app's sidebar is the only navigation, so the standard File/Edit/View menu bar is removed on Windows.

### Settings apply instantly

A changed setting is shown at once and saved in the background. If saving fails, the screen goes back to what is really stored and says so in plain words.

### Number parsing is strict rather than clever

Amounts are rejected rather than guessed when they are ambiguous: decimals the currency does not have (`1.000` for IQD), wrongly grouped thousands (`1,5`), or more than 15 digits. This avoids silently saving a wrong amount.

### Search normalization goes slightly beyond the spec

Besides the letters listed in `ARCHITECTURE.md`, search also treats ھ like ە, the alef forms أ إ آ ٱ like ا, and ignores zero-width joiners and direction marks, which are common when typing or pasting Sorani. Different Sorani letters (ڕ/ر, ڵ/ل, ۆ/و, ێ/ی) are never merged.

### Default number style is Western (1 2 3)

`ARCHITECTURE.md` does not say which digit style is the default. The owner confirmed Western digits.

### Fonts: system font until iteration 10

For now the app uses the Windows system font (Segoe UI, which covers Sorani) through the `--font-family` variable. Bundling open-licence fonts, with the automated Sorani letter test, is part of the font setting in iteration 10. (Done in iteration 10; see below.)

### Styles

Global tokens, themes and base styles are in `src/renderer/styles/`; each component keeps its own CSS module next to it. All layout uses CSS logical properties, so right-to-left needs no separate styles. Animations respect `prefers-reduced-motion`. Contrast of every text colour pair is checked by a unit test in both themes.

### Logging

`userData/logs/app.log`, JSON lines, rotated at 1 MB with three old files kept. Errors are logged by type and stack frames only, never the message, because messages can contain names or numbers the owner typed. Development runs also log memory use every 30 seconds.

### Startup failure

If the data cannot be opened, the app shows one plain message in all three languages (the saved language may not be readable then), logs the error and closes without changing anything. Restore from backup is offered here in iteration 11.

### Not yet built

The preload API has no main-to-screen events yet; the subscribe/unsubscribe pattern is added with the first event (notifications, iteration 9).

### Dependencies added in iteration 1

| Package                                                     | Why                                                  |
| ----------------------------------------------------------- | ---------------------------------------------------- |
| `electron`, `electron-vite`, `vite`, `@vitejs/plugin-react` | The stack: desktop shell and build tool.             |
| `react`, `react-dom`, `react-router`                        | The stack: screens and `HashRouter`.                 |
| `better-sqlite3` (+ types)                                  | The stack: SQLite.                                   |
| `zod`                                                       | The stack: validation of every IPC input.            |
| `i18next`, `react-i18next`                                  | The stack: three languages.                          |
| `electron-builder`                                          | The stack: Windows installer (used in iteration 14). |
| `@playwright/test`                                          | The stack: end-to-end tests of the real app.         |
| `eslint-plugin-react-hooks`                                 | Catches missing effect cleanups and wrong hook use.  |

`npm audit` reports 8 moderate issues, all inside `electron-builder`'s download tooling (`global-agent` → `sprintf-js`). It runs only on the developer's machine at build time and is not part of the installed app. Re-check when `electron-builder` updates.

### Sorani and Arabic wording

All terms are collected in `docs/glossary.md`. The owner approved the current wording: "Areas" is شوێنەکان in Sorani and العقارات in Arabic; the app name is بەدواداچوونی کرێ / متابعة الإيجارات; a receipt is پسوولە / وصل.

## Iteration 2: Authentication

### Honest scope: the password locks the screen, not the file

The password locks the app interface; it does **not** encrypt the database file. Someone with access to the Windows account could read the file with other software. This is acceptable for one PC and one user (as `ARCHITECTURE.md` section 10 says). If real protection is wanted later, switch to SQLCipher (`better-sqlite3-multiple-ciphers`) with a key derived from the password; all database access goes through `src/main/db/connection.ts`, so only that file changes.

### Hashing

scrypt with N = 2^15, r = 8, p = 1, a 64-byte key and a new 16-byte random salt per secret (about 0.1 s per check). Stored as `password_hash`/`password_salt` and `recovery_hash`/`recovery_salt` in the settings table. Hashes carry a format prefix (`scrypt1:`) so stronger settings can be introduced later without breaking existing passwords. Comparison is constant-time. The hashes are kept in a separate repository and never returned with the normal settings.

### Password exact, recovery phrase forgiving

The password is compared exactly as typed. The recovery phrase is written on paper and typed again much later, so it is compared after the same normalization as search: case, extra spaces, and Arabic/Kurdish letter variants (ي/ی, ك/ک, ه/ە…) do not matter.

### The 5-tries rule covers every secret check

`ARCHITECTURE.md` asks for the 5-wrong-attempts/30-seconds rule on the recovery phrase. It is applied to every check of a secret (unlocking, recovery, and the current password when changing the password or phrase), counted together, because the password needs the same protection against guessing. After the wait, five more tries are allowed. The count is kept in memory, so it starts again when the app restarts (restarting takes long enough that this does not help guessing much, and it keeps the owner from being stuck).

### Minimum lengths

A password needs at least 4 characters and a recovery phrase at least 8, and the phrase may not simply repeat the password. `ARCHITECTURE.md` sets no lengths; these keep the rules gentle for the owner while preventing an empty or trivial secret.

### Changing the recovery phrase needs the current password

`ARCHITECTURE.md` says only "Change recovery phrase". It asks for the current password too, so nobody can quietly replace the phrase at an unlocked computer and then use it to take over the password.

### The main process enforces the lock

The lock is not only on screen. Each IPC channel is marked in `OPEN_WHILE_LOCKED` (`src/shared/ipc.ts`); until the password is entered, the main process refuses every channel except reading settings (for the lock screen's language and theme), crash reports and the auth channels themselves. The lock screen cannot change the language; it uses the last one used.

### Secrets are never logged or kept on screen

Only outcomes are logged (`auth.unlock ok=false`), never the typed text; invalid IPC input is logged by field name only. Dialogs render their content only while open, so a typed password is discarded as soon as the dialog closes. A test reads every database, WAL and log file after setup and checks neither secret appears.

### Single running copy

`app.requestSingleInstanceLock()` keeps one copy per data folder; a second launch only brings the existing window to the front (in ghost mode it does nothing, so tests never take focus).

### Friendlier password boxes

Every password box has a **Show/Hide** button and warns when Caps Lock is on. After a wrong password the box is cleared and the cursor returns to it.

## Iteration 3: Categories and areas

### Extra columns beyond the data model

- `categories.name_normalized`: category names are compared like search (case and letter variants), so "خانووەکان" and "خانووەكان" cannot exist twice, and the Excel import (iteration 12) can match categories by name.
- `renters.phone_digits`: only the digits of the phone in Western form, so searching "07501234567" finds "٠٧٥٠ ١٢٣ ٤٥٦٧".

Both are written only by the repositories, from the same functions as the search query (`normalizeText`, `normalizePhone`), so they cannot drift.

### Rules enforced by the database itself

The currency cannot change (a trigger refuses it, even by direct SQL); names are unique per category among areas in use; one price row per area and month; at most one current renter per area; months 1–12, years 2000–2100, prices never negative.

### Duplicate area names are refused, not merged

"Area names are unique within a category (warn, do not crash)": saving a duplicate shows a plain message and nothing is saved. The same name in another category is allowed. A deleted area frees its name.

### Deleting

- A category can only be deleted when it has no areas in use ("Move or delete them first"), so no area is ever left without a category.
- Restoring an area whose category was deleted restores the category too. Restore is refused, with nothing changed, when the name is now used by another item.
- Deletion times are stored in UTC; Deleted items shows the local day.

### Prices

- "Change price" from a month that already has a price row replaces that row (one price per month).
- A change before the first price row ("Rent starts from") is refused: it would silently make months applicable that were not.
- "Mark as vacant" adds a 0 row; "Set rent again" adds a new price. Only the price history decides a month's price, through one function, `priceForMonth` (`src/shared/prices.ts`), used everywhere.
- "Rent starts from" cannot be edited after creation yet. The warning for paid months arrives in iteration 6.

### Renters

- Change renter asks first: **New renter** (closes the current one on the day the new one starts) or **The renter left** (closes it without a new one). Dates before the current renter started are refused.
- Edit area corrects the current renter's name or phone (a spelling mistake) without creating a new history row.

### Screens

- Add area and Edit area are full pages, not dialogs: a long form is easier to read, and one dialog never opens another. A new category can be created right inside the area form.
- The area page in this iteration shows details, current rent, Change price, Mark as vacant / Set rent again, Change renter, Delete, and the price and renter history. Year filter, figures, month boxes and receipts come in iterations 4–6.
- The "Import from Excel" button and the selection checkboxes (Print/Export selected) are added in iterations 12 and 8, when they work.
- Categories keep their creation order; there is no reordering yet.
- After a save, the screen refreshes quietly (the old data stays visible) so success messages are not lost and the page never blinks.
- Phone numbers are shown in the chosen digit style, like all other numbers.

### Search

Search runs in the main process (SQL `LIKE` on the normalized columns, with `%` and `_` treated as plain characters) after a 150 ms pause in typing. Results are sorted on screen with `Intl.Collator` for the active language. 200 areas list and search in well under a second (measured: under 100 ms in the database, the whole screen in under 1 s).

**Open question for the owner:** the spec's letter equivalences (ي/ی, ك/ک, ه/ە, ة) are applied. Sorani-only letters (ێ ڕ ڵ ۆ پ چ ژ گ ڤ) are still treated as different letters, so someone typing on an Arabic keyboard cannot find "هەولێر" by typing "هەولیر".

### Test setup

Vitest's persistent module cache is turned off: it keys files by their own content, so the migration list (built from the folder's `.sql` files) did not see a newly added migration file.

## Iteration 4: Month status engine

### Where the logic lives

`src/main/services/monthStatus.ts` is the only code that decides a month's status, the yearly figures and the year's summary word. The main process works them out and sends them to the screen ready to show (`areas:list` carries the current year's 12 boxes; `areas:year` gives any year of one area). The screen only maps a status to a colour, in one stylesheet (`MonthBoxes.module.css`). Shared types are in `src/shared/months.ts`.

### Rules as built

- Status uses the month only, not the day: a month turns late on the 1st of the next month.
- A month with money on it that later became vacant (price 0) is not applicable and counts for nothing; the warning before such a change arrives in iteration 6.
- "Received" in the yearly figures is capped per month at the rent, as the spec asks; allocation (iteration 5) never fills a month past its rent anyway.
- Year summary word (Areas list): **Late** if any month is late, else **Due** if this month is not fully paid, else **Partly paid** if a future month is part-paid, else **Paid** if any month is paid, else **Nothing due** (rent not started, or vacant all year so far). The Reports "Partial" filter (iteration 7) will be Due or Partly paid.
- A month that is not applicable says why: **Vacant** (price 0) or **Not started** (before "Rent starts from").

### Screens

- Areas list: the category moved under the area name and the phone under the renter's name, and the status word sits under the month strip, so the table fits a 1100px window. With extra-large text only the table scrolls sideways, never the page.
- The compact strip shows a symbol in each box (✓ paid, ! late, • due, ½ partly paid, – vacant or not started, empty for upcoming), with the full words as each box's label. The large boxes show month number, amount paid and the word.
- The area page shows this year's 12 boxes; the year selector, figures and receipts come in iteration 6.

### Not yet

- Until payments exist (iteration 5) nothing is paid, so every past month with rent shows as **Late**.
- The "computer date looks wrong" warning needs the latest payment date, so it is added with payments in iteration 5.

## Iteration 5: Payments

### Decided by the owner

- **Editing a receipt changes everything:** amount, starting month, date received and note. The months are worked out again, the receipt keeps its number, and the before/after is written to the activity log.
- **Receipt numbers start at 0001.**

### Rules as built

- The receipt counter is the `last_receipt_number` setting, raised inside the same transaction as the receipt; the next number is one above both the counter and the highest number ever saved, so a number is never reused. The database refuses to change a receipt's number.
- **Undo** cancels the receipt (like Cancel receipt): it stays listed, crossed out, and its number is not reused. This keeps every number accounted for. Undo is offered next to the "Payment saved" message until another change is made on the screen or the screen is left.
- A cancelled receipt cannot be edited or cancelled again.
- **Date received** cannot be after today (refused in plain words). This keeps the "computer date looks wrong" check meaningful: it shows when the latest date money was received is later than today's date on the computer. The backup date joins this check in iteration 11.
- **Record past payment** uses the same form and the same month filling as Record payment; it simply gets no receipt number and shows as "Past record".
- The form starts at the oldest month that is not fully paid since the rent started, or this month when everything is paid. While a receipt is being edited, its own months count as open again.
- The preview is worked out by the main process (`allocation.ts`), the same code that saves, so what is shown is exactly what is saved.
- Renter name and phone are copied onto the receipt when it is saved.

### Screens

- Record payment is the primary button in the area page header; Record past payment is the first button in the row below.
- The area page lists all receipts of the area for now; iteration 6 limits the list to the chosen year.
- **Save and print receipt** and **Print receipt** are added in iteration 8, when printing works, rather than as buttons that do nothing.
- The Cancel receipt question answers with "Cancel receipt" and "Keep it", so "Cancel" never means two things.
- The area page was split into `AreaFacts`, `AreaHistory` and `ReceiptList` to stay readable.

## Iteration 6: Area page and Home

### Decided by the owner (also written into ARCHITECTURE.md)

- **Still owed** counts only rent of months that have already come (up to and including this month), never months still to come. A past year owes every unpaid month; a future year owes nothing yet.
- **Needs attention now** includes areas that still owe from earlier years, so a new year never hides a debt. The Late areas count on Home uses the same rule.

### Rules as built

- The yearly figures, the figures of one chosen month, each area's standing across all years, the Home totals per currency and the attention order all come from `monthStatus.ts`; the screens only show them.
- **Rent price** on the area page is the chosen month's rent; for the whole year it is this month's rent in the current year, December's for a past year and January's for a future year.
- The year list runs from the year the rent started (or this year, if later) to two years ahead.
- Receipts are listed for the chosen year (or month) when they paid any month of it; cancelled ones stay listed.
- **Price-change warning:** before saving, the main process compares every paid month from the chosen month onward under the old and the new prices. If any would change status (for example Paid → Late, or Paid → Vacant), the dialog lists them and the button becomes **Save anyway**. Changing the month or the amount asks again.
- Needs attention is ordered by most late months, then most owed.
- Home's **Record payment** shortcut opens Areas with "Choose the area that paid"; the button on each attention row opens that area with the payment form already open (`?pay=1`).
- **Print report** on Home arrives with printing in iteration 8.

### Price changes share paid money out again (owner's decision after the review)

- When the rent changes from a month, the money of every receipt that paid that month or later is shared out again with the new rent: oldest receipt first, each filling oldest month first from the later of the change month and the month it originally started at. A higher rent fills fewer months; a lower rent moves the extra on. Receipts keep their number and total; only their months change. Months before the change and cancelled receipts are untouched.
- A receipt for later months (for example paid in advance for month 8) stays with those months rather than being pulled back to fill earlier gaps.
- If the money would have nowhere to go (vacant from then on, or beyond the 24-month limit), the change is refused in plain words: cancel or edit those receipts first.
- The warning lists every month that gains or loses money or changes colour ("Month 4/2026: Paid 250,000 → Late 200,000"), worked out by the same code that saves. The re-share is written in the same transaction as the new price, and the activity log names the re-shared receipts.

## Iteration 7: Reports

- The report is built in the main process in one pass: one query for the areas (with category, current renter and notes), one for all price rows, one for the year's payments. Figures, the status filter and the totals per currency all come from `monthStatus.ts`.
- **Status filter:** Late = at least one late month; Partial ("Due or partly paid") = at least one orange month and none late; Paid = no late or due month and at least one paid month (so a year with no rent yet is not called Paid). With a month chosen, that month's own status decides, and the figures and totals are for that month.
- **Totals** per currency (IQD first), each with its number of areas; currencies are never added together. The "price" total is the sum of the rent shown in each row.
- **Remembered filters:** month, category, currency and status, in the `report_filters_last_used` setting; the year always starts at the current one.
- **Area picker:** folded away by default; it lists the areas matching the category and currency filters. It records the areas left out, so new areas are included until unticked. Not remembered between visits.
- **Screen layout:** to fit a normal window without sideways scrolling, the category and notes sit under the area name, the phone under the renter, rent / received / still owed are labelled lines in one "Money" column, and the status word sits under the month strip. Printing and Excel (iteration 8) use separate columns on landscape paper.
- **Print, Export PDF and Export Excel** buttons arrive with iteration 8.
- The areas repository was split into `areas.ts` (create, edit, renters, delete, restore), `areaViews.ts` (list, year, Home overview) and `priceChanges.ts` (price change and its warning), each under 250 lines.

## Iteration 8: Printing and exports

### Dependency: exceljs 4.4.0

Named in ARCHITECTURE.md for Excel export; pure JavaScript, runs in the main process, writes `.xlsx` with right-to-left sheets and cell colours. `npm audit` reports a moderate issue in its `uuid` dependency (a missing bounds check in `v3`/`v5`/`v6` when a buffer is passed). exceljs only calls `uuid.v4()` without a buffer (`lib/xlsx/xform/sheet/cf-ext/cf-rule-ext-xform.js`), so the flaw cannot be reached. Re-check when exceljs updates.

### How printing works

- Print pages are ordinary app pages (`#/print/receipt/:id`, `#/print/report?q=…`, in `src/renderer/print/`) without the sidebar. The main process (`services/pdf.ts`) opens one in a hidden window with the same locked-down settings as the main window, waits until the page says it has drawn everything (`print:ready`, after fonts load; 30-second limit), then shows the Windows print dialog or saves a PDF, and destroys the window on every path. One print at a time; a second is answered "Another print is still being prepared". No temporary files: the PDF and Excel data are written straight to the place the owner chose.
- Paper is always light and at normal text size, whatever the screen uses. Page size, orientation and page numbers ("Page 1 / 4", in the chosen digits) come from the page's own `@page` CSS, so print and PDF look the same.
- The report query in a print page's address is checked again with the same schema as every IPC input.
- **Print count:** a receipt counts as printed after a finished print or PDF; a cancelled dialog does not count. Every print after the first is stamped "Copy". Past records and cancelled receipts are never printed as receipts.
- **Same fields everywhere:** the printed report and Excel use the separate columns of the spec (area, category, renter, phone, monthly rent, received, still owed, the 12 months, notes) and the totals per currency; the filter heading is built by one shared function (`reportText.ts`).
- **Excel:** amounts are numbers (so they add up in Excel) with the currency in the cell format; month cells hold the paid amount with the light-theme status colour as fill (a test keeps the colours equal to `themes.css`); the sheet is right to left for Sorani and Arabic. Excel shows the numbers in Western digits, as Excel does.
- The main process reads the screen's translation files (`services/translate.ts`) for Excel headings and suggested file names; suggested names are made safe for Windows.
- Until the Settings screen (iteration 10) adds a print title and logo, printed pages show the app name.
- The late symbol is now ✗ everywhere (screen strip and print), as section 14 asks for black-and-white printing.

### Where the buttons are

- Reports: Print, Export to PDF, Export to Excel for the report as filtered.
- Area page: Print this area / Export to PDF / Export to Excel for the chosen year (and month); Print on each numbered receipt; Print receipt next to Undo after saving; Save and print receipt in the payment form.
- Areas list: tick boxes (and tick all shown); Print selected / Export to PDF / Export to Excel appear once something is ticked, for this year.
- Home: Print report prints this year's report for every area.

### Fixed along the way

- With Arabic-Indic digits, phone numbers showed their digit groups in reverse order (the bidirectional algorithm treats spaces between Arabic-Indic digits as right-to-left). Separators now carry invisible left-to-right marks (`phoneForDisplay`).

## Iteration 9: Notifications

- One function, `buildReminders` (`services/notifications.ts`), feeds the popup, the Notifications page, the bell and the Windows notification, so they never disagree. It uses `unpaidMonths` from `monthStatus.ts`, which `areaStanding` (Home) now also uses.
- **Late rent:** every past month not fully paid, in any year; vacant months and months before the rent started never appear. **Month reminder:** this month not fully paid and the month ends within 7 days (counting today), or always in its last 3 days. The "days before month end" setting is added on the Settings screen (iteration 10); until then 7 is used.
- **Backup reminder:** added with backups in iteration 11, so it never asks for something the app cannot do yet.
- Order: late rent first (most late months first), then month reminders; same urgency by name.
- **Popup:** once each time the app is opened (after the password), showing the first 6 reminders and "… and N more", with OK and Go to Notifications; nothing when there is nothing to report.
- **Bell:** the count sits on the bell icon with one soft pulse when it changes (none with reduced motion); screen readers hear "Notifications, Reminders: 3". It recounts after every save that changes rent data (`CHANGES_DATA` in `shared/ipc.ts`, one entry per channel) and every 10 minutes, so a month that turns late at midnight shows without a restart.
- **Windows notification:** at most once a day while the app runs, only when something needs attention, never on the day the app was opened (the popup covers it), not in test ghost mode; its hourly timer is stopped when the app quits.
- **Wording:** a reminder names the month's last day ("ends on 31/5/2026", "ends today") instead of counting days, which avoids plural forms and off-by-one confusion. Runs of months show as ranges ("1/2026 – 9/2026"), also on receipts.
- `monthStatus.ts` is about 300 lines: kept as one file on purpose, because ARCHITECTURE.md makes it the single module for colours and totals.

## Iteration 10: Settings

### Bundled fonts

- Six open-licence (OFL 1.1) fonts are bundled in `src/renderer/fonts/`, each with its licence file: Noto Sans Arabic (the default, closest to the earlier system look), Noto Naskh Arabic, Vazirmatn, IBM Plex Sans Arabic, Amiri and Scheherazade New. The files come from the Fontsource packages (version 5.3.0), regular and bold only, split into an Arabic-script part and a Latin part so the screen loads only what it shows (under 1 MB in total). Segoe UI stays as the fallback for any other letter.
- `tests/unit/fonts.test.ts` opens every font file and fails if any Sorani letter (ڕ ڵ ۆ ێ ە ڤ پ چ ژ گ ک) or Arabic-Indic digit is missing, checks each licence file, and checks that `fonts.css` offers exactly the tested list (`FONT_FAMILIES` in `src/shared/fonts.ts`). All six pass.
- Iteration 14 (packaging) must ship the `OFL.txt` files with the installer.

| Package (dev only) | Why                                                                     |
| ------------------ | ----------------------------------------------------------------------- |
| `fontkit` 2.0.4    | Reads the bundled font files in the Sorani letter test. Not in the app. |

### Settings page

- One page of big sections in the order of ARCHITECTURE.md section 12: language and number style, appearance (light/dark, theme colour, font, text size), printing, reminders, security, and data (Deleted items, Activity log). Backup is added in iteration 11. The settings screens moved to `src/renderer/pages/settings/`.
- **Theme colour:** six colours (blue, the default, teal, indigo, purple, brown, slate grey). None is green, orange or red, so the app's colour never looks like a month status. Each has light and dark values in `themes.css` (`--accent-<name>`); the chosen one is mapped onto `--color-accent` with `data-accent` on `<html>`, the same CSS-variable mechanism as light/dark and text size. The contrast test checks every colour in both modes.
- **Font:** `data-font` on `<html>` picks the bundled font; printed pages use it too.
- **Reminder days:** choices 3, 5, 7, 10, 14 (default 7); the last 3 days always remind. Stored as text under `remind_days_before_month_end` and read back as a number; anything unreadable falls back to 7.
- **Print title:** up to 80 characters. Saved with the Save button, with Enter, and when leaving the box (which also happens when going to another page), not on every key, so spaces can be typed and a typed title is never lost. Empty means no title line; printed pages no longer show the app name instead, as section 8.6 says "(if set)". The Excel sheet starts with the title when there is one.
- **Logo:** PNG or JPEG only, up to 2 MB, recognised by its first bytes, not its name (SVG is refused because it can contain scripts). The app keeps a copy as `logo/logo.png` or `logo/logo.jpg` in its data folder and stores only that file name in `logo_path`, so the setting can never point anywhere else and still works if the data folder moves. The screen receives the picture as a `data:` address (already allowed by the page's security policy). Print pages wait for the logo before printing. The logo is not put into the Excel sheet. Remove logo asks first and deletes the copy.
- **Activity log:** read-only, newest first, 100 entries at a time with "Show older". Each line is a plain sentence ("Rent changed: Shop 1") with the useful details (receipt number, month, renter, old → new amount) and the local date and time. Areas and categories show their current name. Settings changes are not logged (ARCHITECTURE.md section 5 lists what the log records).
- **Arabic-Indic numbers in English:** between Arabic-Indic numbers, spaces and dashes counted as right-to-left, so in English month ranges and lists came out backwards ("9/2026 – 1/2026"). Separators between numbers now carry invisible left-to-right marks (`numberSeparator` in `shared/digits.ts`, used for month ranges and the activity log's date and time), as phone numbers already did. In the activity log the details are separate boxes with a thin line between them: a middle dot (·) looks just like the Arabic-Indic zero (٠).
- **To review in iteration 13:** the middle dot is still used between words in a few places (the report filter line, the totals row, the Areas list selection count, reminder rows). It is not next to a number in most of them, but next to Arabic-Indic digits it can look like a zero.
- **For iteration 11 (backup):** the logo is a file in the data folder, outside the database, so backups must copy it too (ARCHITECTURE.md section 13 already asks for this). Restoring a database without its logo is safe: the logo is simply missing.

## Iteration 11: Backup and restore

- **Backup file:** `rent-backup-YYYY-MM-DD.db` (a second one on the same day gets `-2`, and so on), written with SQLite's backup API to a `.partial` file, checked with `integrity_check`, made self-contained (no journal) and only then renamed. The logo is copied beside it as `rent-backup-…logo.png` or `.jpg`. What an interrupted backup leaves behind is removed the next time.
- **Keeping 12:** only files named exactly as the app names backups are ever removed, never the one just made. "Newest" means last written, so backups named with a clock that was ahead do not crowd out later ones. A clock set back makes new backups look oldest; the newest is still always kept, and the app already warns when the computer date looks wrong.
- **Restore in two steps:** the chosen file is copied into the app's `restore` folder and checked (an app backup, undamaged, not from a newer version, and an older one must upgrade cleanly on a scratch copy). The owner sees its date, areas and payments and confirms; the app restarts and swaps it in before opening any data. Saying no removes the checked copy. A restore waits for a backup still being written.
- **Safety copy before a restore:** an exact copy of the data file, its journal files and the logo goes to `safety-copies/` before SQLite touches anything; if the swap fails the current data is left exactly as it was. A locked file (virus scanner, sync tool) is retried for a moment.
- **Receipt numbers after a restore** go on from the highest number ever given (the replaced data's, or, when it is damaged, the highest in the safety copies), so a printed number is never given twice. This can leave a gap in the numbers, which is allowed.
- **Password and recovery phrase** come back with the backup; the confirm dialog says so.
- **Damaged data at start:** a recovery screen offers only restoring a backup (no password can be checked, so nothing else is reachable).
- **Monthly reminder:** shown when there is at least one area and no backup was made this calendar month, with Back up now in the reminder.
- **Open for the owner:** safety copies are never removed, so the folder grows with each restore and each upgrade.

## Iteration 12: Excel import and demo data

- **Template:** an Excel file with the ten columns of ARCHITECTURE.md section 16 named in the app's language, a frozen header row, right to left for Sorani and Arabic, Excel checking currency (IQD/USD) and month (1–12) as they are typed in the first 1000 rows, the phone column kept as text (so a leading 0 stays), and a second sheet explaining how to fill it with an example (the example is not on the first sheet, so it is never imported by mistake).
- **Reading a file:** Excel (.xlsx) or CSV. The first row with text is the header; columns are found by name in any of the three languages and in any order, so a template downloaded in Sorani can be filled on an English computer. The six needed columns (name, category, currency, monthly rent, rent start month and year) must be there; the rest may be left out. Empty rows are ignored. CSV: UTF-8 (with or without BOM), separated by `,`, `;` or tab (detected from the first line), every value kept as text. A CSV saved in an old Arabic code page is not supported; the screen asks for CSV "UTF-8" or Excel. At most 5000 rows, 10 MB, and (for Excel) 50 MB once unpacked. A mobile number that lost its leading 0 in an Excel number cell (10 digits starting with 7) gets it back.
- **Values:** amounts and numbers go through the same `parseAmount` as typing (Western, Arabic-Indic and Persian digits, `,` `٬` thousands separators); IQD must be whole dinars, USD may have cents. Currency accepts IQD/USD and the usual words (دینار، دۆلار، دولار، $, dinar, dollar). The rent start year runs from 2000 to two years ahead, as in the area form. A phone without a renter name is a problem. The renter is taken to have started on the 1st of the rent start month.
- **Bad rows are skipped, not imported, and listed** ("Row 12: currency must be IQD or USD"), with the row number as Excel shows it. The good rows can be imported at once; after fixing the file, choosing it again skips the areas already imported (they now count as duplicates), so nothing is imported twice.
- **Duplicates:** the same area name in the same category (letter variants such as ي/ی and ك/ک count as the same) is flagged, both inside the file ("already in row 2") and against the areas already in the app. Never merged.
- **New categories** are created automatically (no colour) and listed in the preview before anything is saved.
- **All or nothing:** the import runs in one transaction; if any area can no longer be created (for example one of the same name was added meanwhile), nothing is saved and the owner is asked to choose the file again. The screen never sends rows or a file path; the main process keeps the checked rows and imports exactly those.
- **Demo data:** `npm run seed` (dev only) makes `demo-data/` (git-ignored) with 200 areas in five categories, a mix of IQD and USD, some price changes and vacancies, and three years of payments (earlier years as past records, this year with receipt numbers), password `demo1234`. It always makes the same data, only ever replaces a folder it made itself (marked with `.rent-tracker-demo`), and lives in `scripts/`, outside `src/`, so the app never includes it. Iteration 14 must give the installer an explicit file list (`out/` and `package.json` only) and check that no demo data is packed.

## Iteration 13: Polish, QA and performance

- **Dialogs** start with the keyboard on the button meant for it: OK in the reminders popup, Cancel in the Restore question (so a stray Enter never replaces the data). Closing a dialog is instant; only opening fades in.
- **Motion:** with "reduce motion" on in Windows, buttons and dialogs no longer change size; the bell's pulse lasts as long as other short animations.
- **Contrast (light theme):** a darker focus ring with a thin gap in the surface colour (visible on any button colour), and a separate, darker edge colour for fields, buttons and choices (`--color-control-border`); card and table lines stay soft. A test keeps edges and the focus ring at 3:1 or more in both themes.
- **Month boxes:** the amount and status word are at the normal reading size and shrink just enough to stay on one line in a narrow box (very large text, small window).
- **Separators:** a bar ( | ) instead of a middle dot (·) between parts of a line, because next to Arabic-Indic digits the dot looks like the zero (٠).
- **Errors:** every screen that cannot load its information shows the plain message with a **Try again** button; "not found" is shown only when the area really does not exist. A PDF or Excel file that cannot be written (for example, open in Excel) says so plainly.
- **Seed:** `npm run seed -- <folder> <years>` makes 1 to 10 years of payments (3 by default); the performance test used 5.
- **Kept as ARCHITECTURE.md names them** (changing them is the owner's call): "Change price", "Price history", "Rent price", "Export to PDF", "Export to Excel" and "Report filters". The language review suggested "Change rent", "Save as PDF" and "Report options" as plainer words.
- **Sorani wording for a native speaker to check** (suggestions from the language review, not yet applied): `months.status.due` "کاتی دانیەتی" (maybe "کاتی دانە"); `months.summary.nothing_due` (maybe "هیچ کرێیەک داوا ناکرێت"); `common.optional` (maybe "(پێویست نییە)"); `areaForm.renterSince`; `auth.passwordAgain` and `auth.newPasswordAgain` (maybe "… دووبارە بنووسەوە"); `auth.problems.passwordsDiffer`; `auth.capsLock`; `reports.filters` (پاڵاوتن, maybe "هەڵبژاردنەکانی ڕاپۆرت"); `print.actions.pdf` and `print.actions.excel` (هەناردن, maybe "پاشەکەوتکردن وەک …"); `print.printedOn` and `deletedItems.deletedOn` (ڕێکەوت and بەروار are both used for "date"); "template" نموونە also means "for example" (maybe "فۆرمی ئامادە"); "category" پۆل (maybe "جۆر"); "folder" بوخچە (maybe "فۆڵدەر"); `settings.themeColors.teal`; `area.figures.remainingHint`.
- Applied from the language review: Sorani "Undo" now says "remove" (لابردن), because گەڕاندنەوە read as "the money was given back"; backup texts always say پاشەکەوتی یەدەگ, never just پاشەکەوت (which is also "save"); "past record" is used for payments entered afterwards, as in the glossary.
