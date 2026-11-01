# Review of 2026-11-01: whole-month payments

Scope: `git diff d091c28..HEAD`. The business decided that a month is paid whole or not at all. The owner chose: the payment form asks how many months and works the amount out; when the rent changes, months already paid stay paid at the old rent.

## Checks run

- `npm run check`: typecheck, ESLint, Prettier, 710 unit tests pass.
- `npm run test:e2e`: 64 end-to-end tests pass (ghost mode).
- The payment form and the rent-change note were checked in English, Sorani and Arabic on screenshots taken in ghost mode. Right-to-left layout and number order are correct.
- An independent reviewer read the whole diff.

## Findings and fixes

1. Editing a receipt's number of months re-priced its old months at the new rent. Fixed: months the receipt already paid keep their amount (`fix(payments): an edited receipt keeps its months at their old rent`).
2. The preview trusted a receipt id from another area. Only a hand-made call could reach this. Fixed (`fix(payments): preview ignores a receipt of another area`).
3. The month count box could show one number and use another: typing above the maximum, or an empty box. The count also did not come down when a later start month had fewer open months. Fixed. An empty box now says "Please enter how many months". The count is capped at what is open, and at 600 while the preview loads (`fix(payments): the month count box always shows the count it uses`).
4. Some texts still said "not fully paid" or "partly paid". Fixed in all three languages and the docs (`fix(i18n): say not paid instead of not fully paid`).
5. A remembered "Partial" report filter reset all remembered filters. Fixed: it becomes "Not paid this month" and the others are kept (`fix(reports): an old Partial filter keeps the other remembered filters`).

## Left as is

- `RentCheck.tsx` keeps a fallback message for `no_room` without listed payments. It can no longer happen, and it is harmless.
- Older part payments now count as paid. There are 3 of them, all in the dev test data. The owner should confirm that no real data with part payments exists.
