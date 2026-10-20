# Progress

## Current iteration

**Iteration 2: Authentication**, on branch `iter-02-auth`. Built, reviewed and pushed; waiting for the owner to say "continue".

## Done

- Iteration 0 (merged, tag `iter-00`): git and GitHub, TypeScript, ESLint, Prettier, Vitest, `npm run check`, Windows CI, project docs.
- Iteration 1 (merged, tag `iter-01`): Electron + React + Vite app with secure IPC (zod), SQLite with migrations and safety copies, settings in the database, sidebar layout with placeholder screens, Sorani/English/Arabic with RTL/LTR, light/dark and text size, base components, error screen, private rotating log, number parsing/formatting and search normalization. Unit tests (125) and end-to-end tests (7, ghost mode) pass locally and on Windows CI.
- Iteration 2: first-run setup, lock screen, recovery with the 5-tries/30-seconds rule, change password and recovery phrase in Settings, scrypt hashes only, lock enforced by the main process, single running copy. 150 unit tests and 14 end-to-end tests pass locally and on Windows CI.

## Next

- On "continue": merge `iter-02-auth` into `main` with `--no-ff`, tag `iter-02`, push.
- Then iteration 3 (categories and areas): migrations for categories, areas, prices, renters and the audit log; category and area management; price changes, vacant / set rent again; renter changes with history; soft delete with Deleted items and Restore; Areas page with category chips, normalized search and the empty state.

## Open questions

- Which fields of a receipt can be edited (amount, date, months)? To decide in iteration 5.

## Working notes

- Never launch the app visibly while the owner is working: end-to-end tests use ghost mode (`RENT_TRACKER_GHOST=1`, set in `tests/e2e/launch.ts`).
