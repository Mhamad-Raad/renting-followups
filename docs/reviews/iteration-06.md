# Iteration 6 review: Area page and Home

## What was built

Area page: Year and Month filter, the four figures (rent price, total for the year or month, received, still owed), the 12 boxes of the chosen year with the chosen month outlined, and the receipts of that period. A warning before a price change that would alter paid months, with Save anyway. Home: Received, Still owed and Late areas for this year per currency, and the Needs attention now list (late in any year, or due this month) with Record payment on each row. Engine: the owner's Still owed rule, figures for one month, each area's standing across all years, Home totals, status changes for the price warning.

## Issues found in self-review and how each was fixed

- Large amounts overflowed the figure cards in a 1100px window: cards now go two per row when needed and the currency may wrap under the number (in `8d8f874`).
- "Owes" was first built from an empty placeholder followed by the amount, which breaks word order in RTL: now a word and a separate amount (in `ab0cf80`).
- The attention rows could not be told apart from the sidebar's list items by assistive tools: the list is now labelled "Needs attention now" (in `ab0cf80`).
- The area page would have grown past 300 lines: the period section moved to `AreaPeriod`, `PeriodFilter` and the `useAreaPeriod` hook; area links to `links.ts`.

## Regression results

- `npm run check`: **309 unit tests** pass (new: still owed up to now, month figures, rent month, standing across years, Home totals and order, price-change status changes, receipts per period, all-areas history).
- `npm run test:e2e`: **26 end-to-end tests** pass (3 new: Home cards and attention with Record payment; Home empty state; area filters and the price warning).
- Screens checked by screenshot at 1100×700: Home (English), area page by month (English, Arabic dark), past year, price warning.

## Memory and performance checks done

- 200 areas: opening an area, switching to next year and to one month, and going back, 90 times: page elements (11,025) and listeners (569) exactly flat; screen heap 10.7 → 10.9 → 11.0 MB after garbage collection (growth slowing); main process 8.3–9.5 MB. A full round trip takes about 0.7 s.
- Home and the Areas list each read every area's prices and payments in one query.

## Open questions / decisions made

Recorded in `DECISIONS.md` (iteration 6) and in `ARCHITECTURE.md` sections 6 and 8.2.
