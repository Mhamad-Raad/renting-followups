# Iteration 5 review: Payments

## What was built

Migration 3 with `receipts` and `payment_allocations` (receipt numbers unique, unchangeable, NULL only for past records). `allocation.ts`: fills months oldest first from the chosen month, skipping vacant and not-started months, at most 24 months past the current month; and the suggested first month. Payment repository: create (number, renter snapshot, months and activity-log entry in one transaction), edit (months worked out again, number kept), cancel, list per area, paid amounts per year for the month colours, latest date received. Channels for all of these plus the clock check. Screens: Record payment and Record past payment with live preview, Payments list on the area page with Edit and Cancel receipt, Undo after saving, and the "computer date looks wrong" warning.

## Issues found in self-review and how each was fixed

- The live preview passed a new object to the 200 ms delay on every render, which would restart the timer and re-render forever: the input is now memoized (fixed before commit, in `ce73535`).
- A preview query that mixed grouped and ungrouped columns, and an edit path that read all of an area's months to find one receipt's: replaced by exact queries (in `f9ae888`).
- "Cancel receipt?" answered with "Cancel" was confusing: the confirm dialog can now name its no-button, here "Keep it" (in `ce73535`).
- The area page grew past 300 lines: split into `AreaFacts`, `AreaHistory` and `ReceiptList` (in `ce73535`).
- The clock-warning commit came before the wording it uses; the two unpushed commits were reordered so each one builds.

## Regression results

- `npm run check`: **286 unit tests** pass (14 for allocation, 18 for the payment repository, a populated upgrade test for migration 3).
- `npm run test:e2e`: **23 end-to-end tests** pass (2 new: record with preview, colours, undo, number not reused; edit, cancel, past record, too much refused).
- Screens checked by screenshot at 1100×700 in English (light) and Sorani (dark).

## Memory and performance checks done

- Opening the payment form, typing an amount, waiting for the preview and closing it, 200 times: page elements (1,050) and event listeners (202) exactly flat; screen heap 5.8 → 6.4 MB with growth shrinking from 0.2 to 0.02 MB per 25 forms (settling, not leaking).
- The Areas list gets every area's paid months for the year in one query; the 200-areas end-to-end test (under 1 s) still passes.

## Open questions / decisions made

Recorded in `DECISIONS.md` (iteration 5). The owner chose: edit everything on a receipt; numbers start at 0001.
