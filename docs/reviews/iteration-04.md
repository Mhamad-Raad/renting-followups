# Iteration 4 review: Month status engine

## What was built

`src/main/services/monthStatus.ts`: the single source of truth for month status (paid, due, partial, late, upcoming, not applicable), yearly figures (expected, received, still owed) and the year's summary word. Pure functions; `today` is always passed in. The Areas list now carries this year's 12 boxes per area, and a new `areas:year` channel gives any year of one area. `MonthBoxes` component: large boxes (month number, amount paid, word) with a soft colour transition and a short staggered fade-in, and a compact strip with symbols for the Areas list. The area page shows this year's boxes.

## Issues found in self-review and how each was fixed

- With the strip and status columns added, the Areas table overflowed a 1100px window: category moved under the area name, phone under the renter, status word under the strip (in `7334656`). With extra-large text only the table scrolls, not the page.
- A flex layout on a table cell broke the row lines: contents wrapped in an inner box instead (in `7334656`).
- Boxes repeated a dash and a symbol next to the word: large boxes now show only the word; the amount line stays empty but keeps its height (in `7334656`).
- Status colour rules were first written as global selectors that could colour any element with `data-status`: scoped to the box classes (in `7334656`).
- The two-rows-of-six rule queried the grid itself, which a container query cannot do: moved to a wrapper (in `7334656`).

## Regression results

- `npm run check`: **253 unit tests** pass (35 new for the status engine: every row of the status table, the 1st-of-next-month rule, year boundaries, rent starting mid-year or next year, vacant and rented again, price change mid-year, partial and prepaid months, figures, summary; 3 new for the repository).
- `npm run test:e2e`: **21 end-to-end tests** pass (1 new: strip, summary word, area page boxes, vacant turning grey). One run had a one-off timeout in the older lock test on a busy machine; it passed 5 times in a row and in two full runs afterwards.
- Screens checked by screenshot at 1100×700: English light, Sorani dark (RTL), Arabic with extra-large text.

## Memory and performance checks done

- 200 areas, opening an area and going back to the list 90 times: page elements (11,025) and event listeners (569) exactly flat; screen heap 9.3 → 10.3 → 10.5 → 10.6 MB after garbage collection (growth slowing, settling rather than leaking); main process 7.6–9.1 MB.
- One full trip, opening an area and returning to the 200-row list: about 0.6 s. The 200-areas end-to-end test (under 1 s) still passes.

## Open questions / decisions made

Recorded in `DECISIONS.md` (iteration 4). Until payments exist (iteration 5), every past month with rent shows as Late.
