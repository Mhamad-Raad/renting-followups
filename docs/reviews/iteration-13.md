# Iteration 13 review: Polish, QA and performance

## What was done

A pass over the whole app as a first-time user would meet it: two independent audits (all three languages; keyboard, screen states, animation, contrast and resource rules), a performance test with 200 areas and five years of payments, the full memory routine of IMPLEMENTATION.md section 7, and the regression list.

## Findings and fixes

Two independent audits read the whole app: one for the three languages, one for keyboard use, screen states, motion, contrast and the resource rules. Fixed, each in its own commit and with a test where one could show it:

1. **The Restore question put the keyboard on the red Restore button**, so a stray Enter would replace all data; the reminders popup started on the wrong button too. React focused the button before the dialog was shown, which did nothing. Dialogs now focus the marked button once open: Cancel on Restore, OK on the popup (`3baff83`), with end-to-end tests that failed before the fix.
2. **A PDF or Excel file that could not be written** (for example, open in Excel) said "check the printer" or "something went wrong": it now says to close the file in the other program and try again, and a failed PDF does not count as a print (`c2b2a48`), with a test.
3. **Motion:** closing a dialog showed an empty, shrinking frame; with reduced motion buttons and dialogs still changed size; the bell pulse ran 600 ms. All fixed (`ebae964`).
4. **Light-theme contrast:** the focus ring (about 2:1) and the edges of fields and buttons (1.5:1) were too faint; now 4.6:1 and 4:1, with tests for both themes (`f2961a5`).
5. **Screens updating after they closed** (about ten save handlers), and a double-click on Restore in Deleted items sending two requests. Fixed with the shared guard; a dialog closed during a save still tells the page "saved" (`341e953`).
6. **No way to retry** when a screen could not load, and an area page that said "not found" for any failure: a Try again button everywhere, "not found" only when true (`b7da3b4`).
7. **A full copy of the data** stayed in the app's folder if the app was closed on the Restore question: removed at the next start (`dceb08a`), with a test.
8. **The empty Home screen** did not offer Import from Excel; Home and Areas now share one empty state (`b6ff48a`).
9. **Month boxes:** the amount and status word were below the reading size. They are bigger now and shrink to stay on one line in a narrow box; before this, very large text broke "900,000" over two lines and "Upcoming" spilled out. Tick boxes in the Areas list are easier to hit (`75bce74`).
10. **The Windows notification** wrote its number in Western digits whatever the setting (`f5b3d63`).
11. **A middle dot (·)** between parts of a line looked like the Arabic-Indic zero (٠) next to numbers: a bar ( | ) instead, on screen, in print and in Excel (`7d84f0d`).
12. **Numbers inside import messages** ignored the digit setting (`4e29e46`).
13. **Wording:** the Sorani "Undo" read like "the money was given back"; backup texts sometimes said only "save"; "past payment" and "past record" were mixed; several English sentences were unclear; a few Arabic phrases were awkward; five texts were unused (`64beb1a`).

Checked and not changed:

- The audit said the window title was always English. It is not: the screen sets the translated title whenever the language changes.
- Button names that ARCHITECTURE.md fixes ("Change price", "Export to PDF", "Report filters") stay until the owner decides. The Sorani words the review was unsure of are listed in `DECISIONS.md` for a native speaker.
- File names for saved receipts and reports, and the Excel template's help text, keep Western digits on purpose. They are file names and Excel content.

### The regression list

Every _manual_ item of `docs/REGRESSION.md` was walked through in the real app, with its window hidden, using fresh data and PDFs rendered to pictures for the printed items. Result: 23 passed at once, 3 failed, 6 need Windows or the owner.

The three failures, fixed:

14. **Month ranges with Arabic-Indic digits read backwards in Sorani and Arabic** ("٣/٢٠٢٦ – ١/٢٠٢٦" for months 1 to 3) on receipts and in reminders. The iteration 10 fix forced left-to-right order. Each date is now marked as a self-contained piece, so the range follows the reading direction of its text, in every language (`10ca48c`), checked on screen in English and Sorani.
15. **Report page numbers**: "Page ١٩ / ٢" in English with Arabic-Indic digits, laid out left to right in Sorani and Arabic, and in the wrong font. Fixed (`0fc7645`), checked in PDFs in English and Sorani.
16. **Enormous amounts** (for example 1.5 billion dinars a month, with extra-large text) ran past the month boxes and figure cards. They now shrink further or wrap inside the card (`1222e87`).

Also from the walk-through:

- A three-digit reminder count covered the bell; it shows "99+" and sits beside the bell (`efb13f2`).
- A phone number could break mid-number in a reminder row, and "ends today" lacked its full stop (`d1e609d`).

Still to check on Windows, by the owner or in iteration 14: the [DEV] title (25), the desktop shortcut bringing the window forward (44), the Windows print dialog (127), the overnight Windows notification (141), removing a USB drive during a backup (171), and filling the template in Excel (184).

Seen twice in the full end-to-end run and not reproduced since: one test stalled for minutes (once the first test, once a printing test). The tests passed when run again, alone and as a whole suite (three full runs, 53 of 53). Keep an eye on it in the Windows run.

Sound according to the audits: Enter submits every form; Esc closes every dialog and focus returns; no dialog opens another; table rows have real links; colour is never the only signal; buttons are 48 px tall; no animation moves layout or loops; every timer and listener is cleaned up; hidden print windows are always destroyed; IPC handlers are registered once; statements are prepared once.

## Performance (200 areas, 4635 payments over 5 years)

- Areas screen with all 200 rows: 0.23 s. An area page: 0.09 s. Reports screen: 0.21 s. Home: 0.07 s. Notifications: 0.07 s.
- A report of all 200 areas for a year: about 0.1 s (this year and five years ago alike).
- `npm run seed -- demo-data 5` makes the data in about one second.

## Test results

- `npm run check`: **622 unit tests** pass (new: control edges and focus ring contrast in both themes; isolated Arabic-Indic dates).
- `npm run test:e2e`: **53 end-to-end tests** pass (new: focus starts on Cancel in the Restore question and on OK in the reminders popup; a PDF that cannot be written; an unconfirmed restore copy removed at start).

## Memory (IMPLEMENTATION.md section 7)

- The routine (open 30 areas with Record payment opened and closed, 10 reports, every screen in Sorani dark, Arabic light, English dark and light), run three times and measured at Home after clean-up each time: event listeners 564 / 564 / 564, page elements 5404 / 5404 / 5404, screen heap 8.4 / 8.4 / 8.4 MB. Main process 217 / 214 / 215 MB. Nothing grows.
- Main process left alone for two minutes: settles at 198 MB and stays there.
