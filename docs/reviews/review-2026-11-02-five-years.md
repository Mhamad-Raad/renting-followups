# Review of 2026-11-02: address search, and five years of use

The owner asked for a review of bugs, clean code and logic, and whether the app can run for five years without bugs.

Scope:

- The address search change (`8e2d533`), reviewed line by line.
- The whole app checked for problems that only show over years: date limits, files that keep growing, and an app left open across months and years.

## Checks run

- `npm run check`: typecheck, ESLint, Prettier and 736 unit tests pass.
- `npm run test:e2e`: 69 end-to-end tests pass (ghost mode). The "starts maximized" test failed once and passed on its own rerun. It is the known intermittent failure listed in PROGRESS.
- Two independent reviews: one of the address search commit, one of the whole app over five years.
- The long-run test now covers six years and a quarter, January 2026 to March 2032, with 200 places and the leap years 2028 and 2032. It made 10,320 payments, 555 renter changes, 287 vacancies and 370 receipt edits or cancellations. After every month, all figures, colours, receipts, Home cards and report totals still add up. The database passes its integrity checks, and the screens take under a second at the end. The 42 refused payments were all correct: each was for months more than 24 months ahead.
- The address search upgrade (migration 007) was run on a copy of the owner's dev data: it upgraded cleanly and passed the integrity check.

## Findings and fixes

1. **Medium: the Areas list could pay a month of the wrong year after New Year.** This happened if the list stayed open across midnight on 31 December. Each list row now carries the year it was loaded for, and a month box pays that year (`fix(areas): a month box pays the year the list shows`).
2. **Medium: open screens did not move on to a new month or year.** Home, Areas and the area page kept last month's colours and figures until the owner moved to another page. The app now looks at the calendar every minute and when its window is focused. When a month starts, every open screen loads again. An end-to-end test opens Areas at 23:59 on 31 December 2026 and moves the clock past midnight. It fails without the fix (`fix(app): open screens load again when a new month starts`).
3. **Low: the daily Windows notification could appear just after midnight** when the app was left running. It now waits until 9:00 (`fix(reminders): the daily notification waits for the morning`).
4. **Low: the "computer date looks wrong" warning did not say why.** A payment saved while the clock was ahead kept the warning showing after the clock was fixed. The warning now names that date, so the owner can find and correct it. An end-to-end test covers it (`fix(app): the clock warning names the date that is after today`).
5. **Low: safety copy names used world time,** three hours behind the clock in Iraq. They now use local time (`fix(backup): safety copies are named in local time`).
6. **Low: two comments.** The search function used during upgrades must never appear in a lasting part of the database. The text cleaner's comment now lists the address copy (`docs: the migration-only search function and the address search copy`).

## Checked and safe for years

- **No hard-coded years in the logic.** Years are checked between 2000 and 2100 everywhere. The year lists grow by themselves. The two-year payment limit counts from today.
- **Dates:**
  - Dates are handled as local calendar days, so time zones and daylight saving do not shift them.
  - 29 February and the December-to-January change work.
- **Every timer is stopped when its screen or the app closes.**
- **Growth:**
  - The activity log is read page by page.
  - The app's log file rotates.
  - Only the newest 12 backups are kept.
  - Screens read one year of payments at a time.
  - Whole-history totals are small: about 12,000 rows by 2031.
- **Receipt numbers are unique and never reused,** also after restoring an older backup.
- **Database upgrades run all at once or not at all,** after a safety copy.
- **Address search:**
  - Every way an address is written keeps its search copy up to date: create, edit, Excel import and the upgrade of older backups.
  - `%` and `_` are searched as plain characters.

## Waiting for the owner

- **Safety copies:** one is made before each restore and each upgrade, and none is ever deleted. They are small, a few MB each, so this is harmless for years. Keep them all, or keep only the newest 10?
- **Reports area picker:** it searches by name and renter, not by address. Should it also find the address?

## Second pass: review of the fixes above

An independent reviewer checked every screen that loads data, because the new-month reload touches all of them. It found nothing serious. Forms keep what is typed, nothing is saved twice, and no query writes. A new end-to-end test confirms this: a payment form left open past midnight on New Year keeps its month count and note, and saves one receipt.

Fixed, each in its own commit with a test that fails without the fix:

1. **Medium: the startup popup could open in the middle of work.** This happened when the app opened with nothing to report and a reminder appeared at the start of a new month. The popup now decides once, from its first answer (`fix(notifications): a new month never opens the startup popup mid-work`).
2. **Medium: the clock warning said "payment" when the future date was a backup's.** It now names which one, and for a backup says to make a new one once the date is right (`fix(app): the clock warning says when the date is a backup's`).
3. **Low: a failed background reload replaced the screen with Try again.** It could also wipe a form being filled in. The data on screen now stays (`fix(app): a failed background reload keeps the screen as it was`).
4. **Low: Home's Print report used the computer's year,** not the year its cards show (`fix(home): Print report uses the year the cards show`).

Left as is: safety copies named in local time could repeat during a daylight-saving hour. Iraq has had no daylight saving since 2008, so this cannot happen there.

Checks: 736 unit tests and 73 end-to-end tests pass.
