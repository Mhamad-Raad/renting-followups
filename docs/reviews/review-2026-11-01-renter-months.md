# Review of 2026-11-01: a renter pays only for their own months

Scope: commits `e1021df` (feat) and `9c67cfe` (docs), made by another session: months no renter was in have no rent (`chargedRent`, `repositories/rent.ts`); the payment form starts from the current renter's first month.

## Checks run

- `npm run check`: typecheck, ESLint, Prettier, 727 unit tests pass.
- `npm run test:e2e`: 65 end-to-end tests pass (ghost mode).
- Probes on a real database for the cases most likely to break: an earlier renter's history brought in after a new renter, a renter who starts next month, a place that never had a renter.
- A new long-run test (`tests/unit/longRun.test.ts`): 150 places over four years (2026–2029, with the leap year 2028), 4,956 payments, 233 renter changes, 128 vacancies, 188 receipt edits and cancellations, on a real SQLite database. After every month it checks that receipt totals match their months, that no month is paid twice, that no money sits on a month without rent, that receipt numbers never repeat, that year figures, Home cards and Report totals add up, and that colours match the dates. At the end it checks the database integrity and that the screens take under a second. The 7 refused payments were all correct refusals: more than two years ahead.

## Findings and fixes

1. **Record past payment could not bring in an earlier renter's months** once a new renter was in (`before_renter`). That would have blocked loading the business's old notebooks. Fixed: a past record is history and may start at any month. A normal payment still starts at the current renter's first month (`fix(payments): a past record may pay an earlier renter's months`).
2. **The area page and the Areas list disagreed on an empty place.** For a renter who starts next month, the list said "Vacant" and hid Change price, while the page showed the rent and the buttons. Fixed: both read the rent as charged (`AreaDetails.chargedPrices`). They use one rule, `isEmptyPlace` (no renter now and no rent charged), so a renter who is still to come does not make a place empty (`fix(areas): the area page and the Areas list agree on an empty place`).
3. DECISIONS.md had no entry for whole months and empty places, and its older entries still described part payments and resharing. New entries record what replaced them.

## Checked and correct

- `chargedRent` handles: renters who leave on the 1st or later in a month, gaps between renters, paid months that keep counting, places that never had a renter, and currency changes.
- Payments, colours, figures, Home, Reports, exports and reminders all read the charged rent. Price editing reads the saved history.
- A month box can still pay an earlier renter's single unpaid month. The form cannot.
- No new query runs once per area: renters for every area come from one query.

## Left as is

- `renterFirstMonth` and `dateMonthIndex` split a date string themselves instead of using `parseDateString`. The result is the same for stored dates, so I left them.
