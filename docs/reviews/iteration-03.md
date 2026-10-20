# Iteration 3 review: Categories and areas

## What was built

Migration 2 with categories, areas, price history, renter history and the activity log, with database-level rules (fixed currency, unique names, one current renter). Repositories for categories, areas, prices, renters and the activity log, created once by `createRepositories`; every multi-step change runs in one transaction and writes its activity-log entry in the same transaction. Screens: Areas list (category chips, normalized search, empty state), Add/Edit area, area page (change price, vacant / set rent again, change renter, delete, price and renter history), Categories, Settings → Deleted items with Restore. New components: amount box with live separators, month/year and date pickers (numbers in the chosen digit style), drop-down, search box, colour swatches, checkbox, empty state, link button, phone text.

## Issues found in self-review and how each was fixed

- New migration files were invisible to the unit tests because of Vitest's file cache (`a290246`).
- Restoring an area could restore its category even when the area restore was then refused: checks now run before any change (fixed before commit, covered by a test).
- After saving, the area page reloaded through a loading state, so the success message vanished and the page blinked: added a quiet refresh (`ec884de`), covered by the end-to-end history test.
- In dialogs the cursor went to the first control instead of the field meant for it (for example the amount box): dialogs now honour the field that asks for focus (`45d97f0`).
- Phone numbers ignored the Arabic-Indic digit setting (`acdb4ef`, test `cc26496`).
- The renter dialog repeated its title as the question: now asks "What happened?" (`4033eab`).
- The renter dialog first had a "left" button that reused the "Starts on" date: reworked into a clear New renter / The renter left choice.
- Count texts used i18next's `count`, which triggers per-language plural rules: renamed to `number`.
- The area form grew past 300 lines: rent and renter parts split into their own components.
- Invisible Unicode characters had been written into a shared file again: restored as `\u` escapes.

## Regression results

- `npm run check`: **215 unit tests** pass (23 for areas, 5 for categories, 21 for live amount input, 14 for dates and prices, plus a populated upgrade test for migration 2).
- `npm run test:e2e`: **20 end-to-end tests** pass locally (ghost mode); Windows CI green (run 39407612052, before the last two fixes; the final push is checked again).
- Screens checked by screenshot in English, Sorani (RTL) and dark mode with Arabic-Indic digits.

## Memory and performance checks done

- 200 areas: list and search in the database under 100 ms; Areas screen shows 201 table rows in under 1 s (end-to-end test).
- Opening an area and going back to the list 160 times: page always holds 105 elements with none left detached, screen heap flat at 5.4–5.5 MB. (A first measurement suggested detached elements growing; that came from the measuring tool keeping references, confirmed by releasing them.)
- Main process memory stable.

## Open questions / decisions made

Recorded in `DECISIONS.md` (iteration 3). For the owner: should search also treat the Sorani-only letters (ێ ڕ ڵ ۆ پ چ ژ گ ڤ) like their Arabic-keyboard look-alikes (ی ر ل و ب ج ز ک ف)?
