# Progress

## Current iteration

**Iteration 14 (packaging) is in progress on `iter-14-packaging`.** At the owner's request on 2026-10-28, everything so far was merged into `main` and pushed (no `iter-14` tag yet: that comes when the installer is done). The new app icon is done; on 2026-10-26 to 2026-10-28 the owner asked for many UI and business changes first (listed below). The installer itself is not started.

## Done

- Iteration 0 (merged, tag `iter-00`): git and GitHub, TypeScript, ESLint, Prettier, Vitest, `npm run check`, Windows CI, project docs.
- Iteration 1 (merged, tag `iter-01`): Electron + React + Vite app with secure IPC (zod), SQLite with migrations and safety copies, settings in the database, sidebar layout with placeholder screens, Sorani/English/Arabic with RTL/LTR, light/dark and text size, base components, error screen, private rotating log, number parsing/formatting and search normalization. Unit tests (125) and end-to-end tests (7, ghost mode) pass locally and on Windows CI.
- Iteration 2 (merged, tag `iter-02`): first-run setup, lock screen, recovery with the 5-tries/30-seconds rule, change password and recovery phrase in Settings, scrypt hashes only, lock enforced by the main process, single running copy. 150 unit tests and 14 end-to-end tests pass locally and on Windows CI.
- Iteration 3 (merged, tag `iter-03`): categories and areas with price and renter history, vacant / set rent again, soft delete with Deleted items and Restore, normalized search, activity-log writes. 215 unit tests and 20 end-to-end tests pass.
- Iteration 4 (merged, tag `iter-04`): `monthStatus.ts` (status table, yearly figures, summary word), month strip and status word on the Areas list, this year's 12 boxes on the area page. 253 unit tests and 21 end-to-end tests pass.
- Iteration 5 (merged, tag `iter-05`): receipts and allocations, Record payment / Record past payment with live preview, Payments list with Edit and Cancel receipt, Undo, "computer date looks wrong" warning. 286 unit tests and 23 end-to-end tests pass.
- Iteration 6 (merged, tag `iter-06`): area page Year/Month filter with the four figures and the period's receipts, the price-change warning over paid months, Home cards per currency and the Needs attention list. Owner decided: Still owed counts months up to now; old debts stay on Home; a price change shares paid money out again. 323 unit tests and 26 end-to-end tests pass.
- Iteration 7 (merged, tag `iter-07`): Reports page with remembered filters, area picker, the month strip, totals per currency; areas repository split in three. 341 unit tests and 28 end-to-end tests pass.
- Iteration 8 (merged, tag `iter-08`): receipt and report printing (Windows print dialog or PDF) through hidden windows, Excel export, print buttons on Reports, the area page, the Areas list (tick boxes) and Home; phone digit order fixed for Arabic-Indic digits. 354 unit tests and 33 end-to-end tests pass.
- Iteration 9 (merged, tag `iter-09`): reminders (late rent, month end) from one function, popup on opening, Notifications page, bell count, daily Windows notification, month ranges. 364 unit tests and 36 end-to-end tests pass.
- Iteration 10 (merged, tag `iter-10`): the full Settings page: six theme colours, six bundled fonts tested for Sorani, print title and logo (on prints and the Excel title row) with a live preview, reminder days, Activity log page; fixes for Arabic-Indic number order in English and the popup button. 561 unit tests and 43 end-to-end tests pass.
- Iteration 11 (merged, tag `iter-11`): Back up now (the newest 12 kept, logo copied beside each backup, same-drive warning), Restore in two steps with a safety copy and a restart, a recovery screen for damaged data, receipt numbers that never repeat after a restore, and the monthly backup reminder. 593 unit tests and 49 end-to-end tests pass.
- Iteration 12 (merged, tag `iter-12`): Areas → Import from Excel (template in the app's language, preview with plain row problems, new categories made automatically, duplicates flagged, everything saved together or not at all), and `npm run seed` demo data (200 areas, three years of payments) for development. 614 unit tests and 51 end-to-end tests pass.
- Optional area name (2026-10-25, on `iter-13-polish`): areas may have no name and are shown by their renter; receipts show the category; migration 004; import without the name column. 660 unit tests and 55 end-to-end tests pass.
- Month boxes (2026-10-25, on `iter-13-polish`): numbers instead of symbols in strips and the PDF; click a box to mark a month paid (receipt) or not paid (taken out of its receipts), after a question; no Print button on the area page. 666 unit tests and 56 end-to-end tests. Review: `docs/reviews/review-2026-10-25-month-boxes.md`.
- Iteration 13 (merged, tag `iter-13`): whole-app polish. Dialogs start on the safe button (Cancel on Restore), clearer focus and edges, calmer motion, Try again on every screen that cannot load, plain messages when a file cannot be saved, month ranges and page numbers in the right order in every language, month boxes that fit any amount, clearer wording in all three languages. 200 areas with five years of payments: every screen opens in a quarter of a second or less; memory stays flat. 622 unit tests and 53 end-to-end tests pass.
- Collapsible sidebar (2026-10-27, on `iter-14-packaging`, owner's request): opens collapsed to its icons every time; a button at its top shows or hides the names. 669 unit tests and 58 end-to-end tests pass.
- Owner's UI updates (2026-10-27): slimmer page margins and wider pages; the dock icon on a Mac; the Areas table shows monthly rent, total for the year, received, still owed, the boxes, notes and a ⋯ menu with every area action (opens the area page with that action ready). 669 unit tests and 59 end-to-end tests pass.
- Vacant ends the renter (2026-10-27, owner's decision): Mark as vacant also ends the current renter; Change renter only adds a new renter; a new area marked vacant takes no renter. 671 unit tests and 59 end-to-end tests pass.
- Receipts as PDF only and a wider payment form (2026-10-27, owner's request): every receipt button saves a PDF; the ⋯ menu actions open on the Areas list. 671 unit tests and 59 end-to-end tests pass.
- Look and feel (2026-10-27): calmer focus in the theme colour (no orange ring); a calm blue palette with plain white secondary buttons (blue is the default theme colour again); Settings → Sidebar: Light / Dark, and the green theme colour is now a calmer deep green; a larger reminders popup; clicking the dark background closes any dialog.
- Areas table (2026-10-27): the same table under every category (the Area column always shows); the area form in side-by-side cards; tick boxes line up with fields.
- Currency (2026-10-27): amounts say IQD / USD in every language; lists and reports (screen, PDF, Excel) have a Currency column with bare amounts lined up on the right; totals stay separate per currency, never converted (no exchange rates, the business confirmed); an area's currency can be corrected on Edit until its first payment that counts (migration 005; the rent keeps its written number).
- Fix (2026-10-27): no empty last page in report and receipt PDFs.
- Month colours (2026-10-28, the business): no yellow; this month not fully paid is red at once ("Not paid"), a coming month paid in part is grey; darker green and red; list strips a little deeper; Home warning cards without the red fade. 703 unit tests and 61 end-to-end tests pass.
- Marking vacant over paid months (2026-10-29, owner's request, fewer clicks): instead of only refusing, the dialog lists each receipt paying a month that would become vacant (months, amount, cancelled or lowered) and one button, **Take out and save**, takes those months out and marks the area vacant together (ARCHITECTURE.md section on price changes updated). 706 unit tests pass; payments and areas end-to-end tests pass.
- Part-paid coming months (2026-10-29, owner's choice from mockups): the small list box is filled half green, corner to corner (the owner preferred this to a bar that grows with the share paid); hovering says "Partly paid, 20,000 of 40,000".
- Dev data: `test-1` … `test-10` were added to the dev data folder in a `Test` category (5 IQD, 5 USD, payments as past records); the data before that is kept as `rent-tracker.before-test-data.db` in the same folder.

## Next

- Iteration 14, on a new branch `iter-14-packaging` from `main` (packaging and release): the Windows installer, with an explicit file list (`out/`, `resources/` and `package.json` only; the installer icon is `build/icon.ico`) and a check that no demo data (`demo-data/`, `scripts/`) is packed; then the Windows-only checks listed in `docs/reviews/iteration-13.md`, including printing to paper (the Print buttons failed on the Mac). Put the owner's new logo (white ring, slightly darker green: `~/Desktop/logo-option-2.png`) into `build/icon.png`, `build/icon.ico` and `resources/icon.png`.

## Open questions

- A price change from an earlier month fills a gap left by taking a month out of a receipt (the warning lists it). Keep, or keep such a month closed for that receipt?
- The window-size end-to-end test ("starts maximized") fails now and then on the Mac, also on older code and with the app closed; it passes on other runs. Look into it (probably the hidden window is not maximized when the screen is asleep or locked).
- Offered, not yet answered: a 1,000-area speed check (and virtual scrolling only if a list is slow) instead of pagination; group the printed report by currency; make the large month boxes on the area page as deep as the list strips. (The Excel export already has one total row per currency, checked by its unit tests.)

- Data from the client's old system (three 2023 sheets, typed up on the Desktop) is waiting on the client: IQD or USD for each place, three plots paid once a year, two phones written only as "770", and one shop whose total does not match its start month. Then it can become an import file.
- The new logo (white ring, slightly darker green) is liked by the owner; it goes into the app icons in iteration 14.

- Plainer button names than ARCHITECTURE.md uses? "Change rent" for "Change price", "Save as PDF" for "Export to PDF", "Report options" for "Report filters". Currently as ARCHITECTURE.md says.
- A native Sorani speaker should check the words listed in `DECISIONS.md` (iteration 13).

- Safety copies (made before each restore and each upgrade) are never removed. Keep them all, or keep only the newest few (for example 10)?

- Late rent (Notifications and Home) shows the current renter even when an earlier renter left owing it: show the renter of those months instead?

- Should saving a receipt as PDF count as its print (so a later paper print says "Copy")? Currently yes.

- Should search also match Sorani-only letters (ێ ڕ ڵ ۆ پ چ ژ گ ڤ) typed as their Arabic-keyboard look-alikes?

## Working notes

- Never launch the app visibly while the owner is working: end-to-end tests use ghost mode (`RENT_TRACKER_GHOST=1`, set in `tests/e2e/launch.ts`).
