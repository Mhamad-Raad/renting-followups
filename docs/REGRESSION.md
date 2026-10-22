# Regression checklist

Walk through this whole list at the end of every iteration. Each iteration adds the behaviours it introduced.

## Iteration 0: Tooling

- [ ] `npm install` works from a fresh clone.
- [ ] `npm run check` passes (typecheck, lint, formatting, unit tests).
- [ ] The GitHub Actions `check` workflow is green on the latest push.
- [ ] `git status` never lists `CLAUDE.md`, `node_modules/`, `.db` files or logs.

## Iteration 1: App skeleton

Automated (`npm run test:e2e`) unless marked _manual_.

- [ ] The app opens maximized; the window cannot be made smaller than 1100×700.
- [ ] First start is in Sorani, right to left, with the sidebar on the right.
- [ ] The sidebar shows Home, Areas, Reports, Notifications, Settings; each opens its screen and is marked as current.
- [ ] Settings → Language: English flips the whole layout to left to right (sidebar on the left); Arabic and Sorani flip it back.
- [ ] Settings → Light/Dark switches colours at once; Text size changes every text at once.
- [ ] Settings → Number style shows "1 2 3" and "١ ٢ ٣" in their natural order.
- [ ] All settings are still there after closing and reopening the app.
- [ ] The app makes no network requests and the console shows no errors.
- [ ] _manual_ Page changes fade in with a small slide in the reading direction; nothing moves with reduced motion turned on in Windows.
- [ ] _manual_ The title bar shows "[DEV]" when run with `npm run dev`, and never in the installed app.
- [ ] _manual_ A screen that crashes shows "Something went wrong. Your data is safe." with Go back, while the sidebar keeps working.
- [ ] _manual_ A database from a newer app version shows the plain three-language message and is not changed.

## Iteration 2: Authentication

Automated (`npm run test:e2e`) unless marked _manual_.

- [ ] First start shows "Create your password" with the "Write down your recovery phrase" warning.
- [ ] Two different passwords, a password under 4 characters or a phrase under 8 letters are explained in plain words; nothing opens.
- [ ] After setup the app opens; every later start shows the lock screen in the last used language.
- [ ] A wrong password says how many tries are left, clears the box and puts the cursor back in it.
- [ ] Five wrong tries show a 30-second countdown and disable the Open button.
- [ ] "Forgot password?" → the recovery phrase (any case, extra spaces, Arabic or Kurdish letters) sets a new password; the old one stops working.
- [ ] Settings → Security → Change password needs the current password; the new one works on the next start.
- [ ] Settings → Security → Change recovery phrase needs the current password.
- [ ] While locked, nothing but the lock screen's own requests is answered by the main process.
- [ ] The password and phrase never appear in the database, its WAL file or the logs.
- [ ] Starting the app a second time does not open a second copy.
- [ ] _manual_ On Windows, starting the app again from the desktop shortcut brings the open window to the front.
- [ ] _manual_ Show/Hide reveals the typed password; Caps Lock shows a warning under the box.

## Iteration 3: Categories and areas

Automated (`npm run test:e2e`) unless marked _manual_.

- [ ] With no areas, Areas shows one large message and "Add your first area".
- [ ] Add area: name, category (or a new one typed in place), currency, monthly rent with live thousands separators, rent start month, optional renter, address, contract start and notes; then the area page shows "Area saved."
- [ ] Missing name or rent, and a duplicate name in the same category, are explained in plain words; nothing is saved.
- [ ] Change price from a month keeps earlier months' price; both rows show in Price history.
- [ ] Mark as vacant shows "Vacant" on the list; the button becomes "Set rent again".
- [ ] Change renter: the new renter shows on the list; the old one stays in Renter history with an end date.
- [ ] Delete an area (with confirmation), then Settings → Deleted items → Restore brings it back.
- [ ] 200 areas open in under a second; search with Arabic letters (ي ك ه) finds Kurdish names.
- [ ] With Arabic-Indic digits chosen, phone numbers show ٠٧٥٠…
- [ ] _manual_ Categories: add with a colour, rename, recolour; the chip on Areas shows the colour; a category with areas cannot be deleted.
- [ ] _manual_ The currency cannot be changed on Edit area.
- [ ] _manual_ In Sorani and Arabic the table, form and dialogs read right to left; in dark mode everything stays readable.

## Iteration 4: Month status engine

Automated (`npm run test:e2e`) unless marked _manual_.

- [ ] Areas list: each row shows a 12-box strip for this year and a status word under it.
- [ ] An area whose rent starts this month: earlier months say "Not started" (hatched), this month "Due" (orange), later months "Upcoming" (grey).
- [ ] The area page shows 12 boxes for this year with month number and word; Mark as vacant turns this month to "Vacant" at once.
- [ ] _manual_ The table fits a 1100×700 window at normal text size; with extra-large text only the table scrolls sideways.
- [ ] _manual_ In Sorani and Arabic month 1 is on the right; in dark mode the colours stay clearly different.
- [ ] _manual_ The boxes fade in quickly when the area page opens, and not at all with reduced motion turned on in Windows.

## Iteration 5: Payments

Automated (`npm run test:e2e`) unless marked _manual_.

- [ ] Record payment: the amount box has the cursor; typing 300,000 for a 250,000 rent previews "full" for one month and "partial, 50,000 of 250,000" for the next.
- [ ] Save shows "Payment saved. Receipt No. 0001" and the month turns green; the receipt appears under Payments.
- [ ] Undo crosses the receipt out ("Cancelled") and the month goes back to orange; the next payment gets No. 0002.
- [ ] Edit a receipt: change the amount and the month colours follow; the number stays the same.
- [ ] Cancel receipt asks first ("Cancel receipt" / "Keep it"), then crosses it out and stops it counting.
- [ ] Record past payment explains it gets no number, and shows as "Past record".
- [ ] An amount above two years of rent shows a warning in the preview and cannot be saved.
- [ ] _manual_ A date received after today is refused in plain words.
- [ ] _manual_ With the computer clock set before the last date money was received, the app opens with "The computer date looks wrong".
- [ ] _manual_ Amounts typed with Arabic-Indic digits (٢٥٠٠٠٠) are accepted; USD accepts cents.
- [ ] _manual_ In Sorani and Arabic the payment form and the preview read right to left.

## Iteration 6: Area page and Home

Automated (`npm run test:e2e`) unless marked _manual_.

- [ ] Home with no areas shows "Add your first area".
- [ ] Home shows Received, Still owed and Late areas for this year, one row per currency.
- [ ] Needs attention lists areas late in any year (with the number of late months) or due this month; fully paid areas are not listed.
- [ ] Record payment on an attention row opens that area with the payment form ready.
- [ ] Area page: choosing another year shows its boxes, figures and receipts; choosing a month shows "Total for the month" and outlines that month.
- [ ] A price change over paid months lists them ("Month 2/2025: Paid 100,000 → Late 100,000") and needs "Save anyway"; afterwards the month shows its new colour.
- [ ] _manual_ A lower rent moves the extra money on to the next months; a higher rent fills fewer months; the receipt keeps its number and total.
- [ ] _manual_ Marking vacant months that are paid, with no rent later, is refused with "would have no month to go to".
- [ ] _manual_ Still owed does not count months after this one; a prepaid future month counts as Received.
- [ ] _manual_ Changing year or month updates without blinking; the boxes change colour softly.
- [ ] _manual_ Large amounts fit in the figure cards at 1100×700 and with extra-large text.

## Iteration 7: Reports

Automated (`npm run test:e2e`) unless marked _manual_.

- [ ] Reports lists every area with rent, received, still owed, the month strip and status, and one total row per currency.
- [ ] Status Late / Paid / Due or partly paid and Currency narrow the list; the totals follow.
- [ ] The area picker leaves areas out; Select none shows "No areas match"; Select all brings them back.
- [ ] Filters except the year are remembered after a restart.
- [ ] _manual_ Choosing a month shows that month's figures, outlines it in every strip and shows its status word.
- [ ] _manual_ 200 areas open in well under a second; changing filters does not blink.
- [ ] _manual_ In Sorani and Arabic the table reads right to left; the footer numbers follow the digit style.

## Iteration 8: Printing and exports

Automated (`npm run test:e2e`) unless marked _manual_.

- [ ] A receipt saves as PDF; it then counts as printed, and the next print shows "Copy".
- [ ] Cancelling the Save dialog changes nothing; a past record cannot print as a receipt.
- [ ] The report saves as PDF and as Excel; the Excel sheet reads right to left in Sorani.
- [ ] Save and print receipt, the area page's Export to PDF, the Areas list's ticked Export to Excel and Home's Print report each end with a plain message; every hidden window closes.
- [ ] _manual_ On Windows, Print opens the Windows print dialog; choosing a printer prints; Cancel shows no message.
- [ ] _manual_ The printed report is A4 landscape with the header row on every page, page numbers, ✓ ½ ✗ – symbols and the totals only at the end.
- [ ] _manual_ The receipt is one A4 page with title, number, date, area, renter, phone, months, amount, note and a signature line; Sorani and Arabic read right to left.
- [ ] _manual_ With Arabic-Indic digits, phone numbers read in the right order on screen, in print and in PDF.

## Iteration 9: Notifications

Automated (`npm run test:e2e`) unless marked _manual_.

- [ ] Opening the app with late rent shows the popup with the same areas as the Notifications page; vacant areas never appear.
- [ ] Go to Notifications opens the page; OK closes the popup; with nothing to report there is no popup and the page says so.
- [ ] The bell shows the number of reminders; paying everything owed clears it at once.
- [ ] Record payment on a reminder opens that area with the payment form ready.
- [ ] _manual_ In the last 7 days of a month an unpaid current month shows under "This month ends soon" with its last date; on the last day it says "ends today".
- [ ] _manual_ On Windows, with the app left open overnight and something late, one Windows notification appears the next day; clicking it brings the app to the front.
- [ ] _manual_ The bell pulses once when its number changes, and not at all with reduced motion.
