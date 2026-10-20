# Iteration 2 review: Authentication

## What was built

First-run setup (password typed twice and a typed recovery phrase, with the "write it down" warning), the lock screen on every start, recovery with the phrase, and Settings → Security with Change password and Change recovery phrase. scrypt hashing with random salts, constant-time comparison, a 5-tries/30-seconds rule with a live countdown. The main process enforces the lock: data channels are refused until the password is entered. Single running copy per data folder. New components: `Dialog`, `TextField`, `PasswordField` (Show/Hide, Caps Lock warning), `Notice`, `Form`.

## Issues found in self-review and how each was fixed

- A style-file rename was swept into the wrong commit, so three unpushed commits would not build (the type check cannot see a missing CSS file). Those commits were redone before pushing, and the per-commit check now also runs a full build.
- After a wrong password the cursor stayed on the button: the box now clears and takes the cursor back (`dad24b4`, with an end-to-end check).
- Form submit code used a hard-to-read comma expression in three places: replaced by one `Form` component (`46b7a1f`).
- The recovery test typed the new password while the previous check was still running: the test now waits for the answer (`e8d0525`). The app itself was correct.
- A translation used i18next's `count`, which triggers plural rules that differ per language (Arabic has six forms): renamed to a neutral `tries` value (`124404f`).

## Regression results

- `npm run check`: typecheck, ESLint, Prettier, **150 unit tests** pass (25 for auth: hashing, salts, the 5-tries rule with a fake clock, setup only once, unlock, recovery with forgiving phrase matching including Arabic/Kurdish letters, change password and phrase, no plain text in the database, input rules).
- `npm run test:e2e`: **14 end-to-end tests** pass locally (ghost mode) and on Windows CI (run 39398877240): the 7 earlier tests plus first-run setup and wrong password, the 30-second wait, recovery, locked data channels, change password, no plain text in database/WAL/log files, and a second copy exiting at once.
- Auth tests repeated 3 times in a row: 21 of 21 passed.
- Screens checked by screenshot (ghost mode): setup with errors and the warning (Sorani), lock screen with a wrong-password message, Change recovery phrase dialog and Forgot password (English).
- Not verified by eye: Caps Lock warning and a real second launch from the Windows desktop shortcut (both listed as manual checks).

## Memory and performance checks done

- Change-password dialog opened, filled and closed 60 times: screen heap 4,489 → 4,964 KB, growth shrinking each round (+313, +129, +33 KB), so it levels off; no leak.
- The countdown timer is the only timer added; it is cleared when the wait ends or the screen closes. Late answers after a screen closes are ignored.
- Each password check takes about 0.1 s (scrypt), so the screens disable their button while checking.

## Open questions / decisions made

Recorded in `DECISIONS.md` (iteration 2): the honest scope (screen lock, not file encryption), the 5-tries rule covering every secret check, minimum lengths (4 and 8), changing the phrase needing the current password, and forgiving phrase matching. No questions block the next iteration.
