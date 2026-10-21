# Progress

## Current iteration

**Iteration 6: Area page and Home**, on branch `iter-06-area-page`. Built, reviewed, then fully reviewed again on the owner's request (`docs/reviews/review-2026-10-21.md`), fixes pushed; waiting for the owner to say "continue".

## Done

- Iteration 0 (merged, tag `iter-00`): git and GitHub, TypeScript, ESLint, Prettier, Vitest, `npm run check`, Windows CI, project docs.
- Iteration 1 (merged, tag `iter-01`): Electron + React + Vite app with secure IPC (zod), SQLite with migrations and safety copies, settings in the database, sidebar layout with placeholder screens, Sorani/English/Arabic with RTL/LTR, light/dark and text size, base components, error screen, private rotating log, number parsing/formatting and search normalization. Unit tests (125) and end-to-end tests (7, ghost mode) pass locally and on Windows CI.
- Iteration 2 (merged, tag `iter-02`): first-run setup, lock screen, recovery with the 5-tries/30-seconds rule, change password and recovery phrase in Settings, scrypt hashes only, lock enforced by the main process, single running copy. 150 unit tests and 14 end-to-end tests pass locally and on Windows CI.
- Iteration 3 (merged, tag `iter-03`): categories and areas with price and renter history, vacant / set rent again, soft delete with Deleted items and Restore, normalized search, activity-log writes. 215 unit tests and 20 end-to-end tests pass.
- Iteration 4 (merged, tag `iter-04`): `monthStatus.ts` (status table, yearly figures, summary word), month strip and status word on the Areas list, this year's 12 boxes on the area page. 253 unit tests and 21 end-to-end tests pass.
- Iteration 5 (merged, tag `iter-05`): receipts and allocations, Record payment / Record past payment with live preview, Payments list with Edit and Cancel receipt, Undo, "computer date looks wrong" warning. 286 unit tests and 23 end-to-end tests pass.
- Iteration 6: area page Year/Month filter with the four figures and the period's receipts, the price-change warning over paid months, Home cards per currency and the Needs attention list. Owner decided: Still owed counts months up to now; old debts stay on Home. 309 unit tests and 26 end-to-end tests pass.

## Next

- On "continue": merge `iter-06-area-page` into `main` with `--no-ff`, tag `iter-06`, push.
- Then iteration 7 (reports): yearly report table for all areas with filters (category, status, currency), totals per currency, the "Received" explanation in the footer.

## Open questions

- After a price drop, money paid above the new rent is reported but not moved to later months. Should it be moved? (Needs the owner's decision; it is a money rule.)

- Should search also match Sorani-only letters (ێ ڕ ڵ ۆ پ چ ژ گ ڤ) typed as their Arabic-keyboard look-alikes?

## Working notes

- Never launch the app visibly while the owner is working: end-to-end tests use ghost mode (`RENT_TRACKER_GHOST=1`, set in `tests/e2e/launch.ts`).
