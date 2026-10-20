# Progress

## Current iteration

**Iteration 1: App skeleton**, on branch `iter-01-app-skeleton`. Built, reviewed and pushed; waiting for the owner to say "continue".

## Done

- Iteration 0 (merged, tag `iter-00`): git and GitHub, TypeScript, ESLint, Prettier, Vitest, `npm run check`, Windows CI, project docs.
- Iteration 1: Electron + React + Vite app with secure IPC (zod), SQLite with migrations and safety copies, settings in the database, sidebar layout with placeholder screens, Sorani/English/Arabic with RTL/LTR, light/dark and text size, base components, error screen, private rotating log, number parsing/formatting and search normalization. Unit tests (130) and end-to-end tests (8, ghost mode) pass locally and on Windows CI.

## Next

- On "continue": merge `iter-01-app-skeleton` into `main` with `--no-ff`, tag `iter-01`, push.
- Then iteration 2 (authentication): first-run setup with password and recovery phrase, lock screen, scrypt hashing, recovery with the 5-attempts/30-seconds rule, change password/phrase (service + IPC), single-instance lock.

## Open questions

- Owner to confirm: shared code in `src/shared/` instead of `src/main/util/` for `parseNumber`/`normalizeText`.
- Owner to confirm: default number style (currently Western 1 2 3).
- Sorani and Arabic wording in `docs/glossary.md` needs a native speaker's review.
- Which fields of a receipt can be edited (amount, date, months)? To decide in iteration 5.

## Working notes

- Never launch the app visibly while the owner is working: end-to-end tests use ghost mode (`RENT_TRACKER_GHOST=1`, set in `tests/e2e/launch.ts`).
