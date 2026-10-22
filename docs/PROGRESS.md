# Progress

## Current iteration

**Iteration 12: Excel import and demo data**, on branch `iter-12-import`. Built, fully reviewed (self-review plus an independent review), pushed; waiting for the owner to say "continue".

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
- Iteration 12: Areas → Import from Excel (template in the app's language, preview with plain row problems, new categories made automatically, duplicates flagged, everything saved together or not at all), and `npm run seed` demo data (200 areas, three years of payments) for development. 614 unit tests and 51 end-to-end tests pass.

## Next

- On "continue": merge `iter-12-import` into `main` with `--no-ff`, tag `iter-12`, push.
- Then iteration 13 (polish, QA and performance), 14 packaging. In 14 the installer must get an explicit file list (`out/` and `package.json` only) and a check that no demo data (`demo-data/`, `scripts/`) is packed.

## Open questions

- Safety copies (made before each restore and each upgrade) are never removed. Keep them all, or keep only the newest few (for example 10)?

- Late rent (Notifications and Home) shows the current renter even when an earlier renter left owing it: show the renter of those months instead?

- Should saving a receipt as PDF count as its print (so a later paper print says "Copy")? Currently yes.

- Should search also match Sorani-only letters (ێ ڕ ڵ ۆ پ چ ژ گ ڤ) typed as their Arabic-keyboard look-alikes?

## Working notes

- Never launch the app visibly while the owner is working: end-to-end tests use ghost mode (`RENT_TRACKER_GHOST=1`, set in `tests/e2e/launch.ts`).
