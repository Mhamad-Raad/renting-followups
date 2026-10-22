# Iteration 11 review: Backup and restore

## What was built

Back up now in Settings (SQLite's backup API, checked before it gets its final name, the logo copied beside it, the newest 12 kept, a warning when the folder is on the same drive as the data). Restore in two steps: the chosen file is checked in a staging folder and the owner sees what it holds; after confirming, the app restarts and swaps it in before opening the data, keeping a safety copy first. A damaged data file at start shows a recovery screen that can restore a backup. A monthly reminder to back up, with Back up now in the reminder.

## Issues found in the first review and how each was fixed

- A failed check left an unreadable file open: closed (`44ac411`).
- The backup result disappeared from the screen, and two screens had their own back-up code: one shared hook (`e02140b`).
- Pruning could remove the backup just made when older ones had later dates (a clock that was ahead); unfinished backups were left behind after a crash: both fixed (`f6ef063`).
- The owner was not told that only 12 backups are kept (`8322fd2`).
- An older backup that the upgrade could not handle was accepted and would have stopped the app from starting: it is now tried on a scratch copy first and refused in plain words (`674cfd8`).
- After restoring an older backup, receipt numbers printed since then would be given again: counting goes on from the highest number ever given (`07901dc`).
- A damaged data file's journal could be lost during the swap, and a briefly locked file (virus scanner) failed the restore: an exact copy is taken before SQLite touches anything, and the swap is retried (`53a987d`).
- The confirm dialog now says the recovery phrase from the backup's time comes back too (`66e2714`).

## Issues found in the independent review and how each was fixed

The independent reviewer found no serious problem. Its findings:

1. Restoring from the damaged-data screen could reuse receipt numbers, because the damaged file cannot be read: the highest number is then read from the safety copies, each from a scratch copy so the copies themselves are never touched (`661608b`), with a test.
2. A logo left over from a backup deleted by hand could be paired with a new backup of the same name: old logo copies for that name are removed first (`4b8e8ab`), with a test.
3. A computer clock set far back makes each new backup look oldest, so earlier ones are pruned first. Ordering by the date in the name has the same weakness; the newest backup is always kept and the app already warns about a wrong date. The code comment now says this plainly (`d35b77b`).
4. Confirming a restore while a backup was still being written would close the app mid-backup: the restore now waits for it (`a5dda80`).
5. Saying no to a checked backup left a full copy of the data in the app's folder: it is removed (`557675c`), with an end-to-end test.
6. Safety copies are never removed, so that folder grows with each restore and upgrade: a question for the owner (see below).

## Regression results

- `npm run check`: **593 unit tests** pass (typecheck, ESLint and Prettier clean).
- `npm run test:e2e`: **49 end-to-end tests** pass in ghost mode (6 for backup and restore, including saying no to a checked backup, plus the reminder's Back up now).
- Screenshots of Settings → Backup in Sorani (light), English (dark) and Arabic (extra-large text): no sideways scrolling, the file name and folder read in the right order.
- `docs/REGRESSION.md` has a new iteration 11 section.

## Memory and performance checks done

- 25 rounds of Back up now from Settings, then Home, measured after clean-up: 186 event listeners, about 100 page elements and a 5.4 MB heap. Two separate runs gave the same listener count, so nothing piles up with use. The folder held exactly 12 backups at the end.
- Backups run in the main process without blocking the screen; no new timers.

## Open questions

- Safety copies (made before each restore and each upgrade) are never removed. Keep them all, or keep only the newest few (for example 10)?

Decisions are recorded in `DECISIONS.md` (iteration 11).
