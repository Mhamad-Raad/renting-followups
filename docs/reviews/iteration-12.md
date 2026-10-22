# Iteration 12 review: Excel import and demo data

## What was built

Areas → **Import from Excel** (also offered on the empty Areas screen): download a template in the app's language, fill it in Excel, choose it, see a preview (areas to import, rows that will be skipped and why, new categories), then **Import areas**. Everything is saved in one step or not at all. `npm run seed` makes a demo data folder with 200 areas and three years of payments for development.

## Issues found in self-review and how each was fixed

- The "open a file" dialog was written out twice already (backup, logo) and import needed a third: one shared helper (`02170ef`).
- In Sorani and Arabic, ".xlsx" showed as "xlsx." and the step numbers were fixed Arabic-Indic digits whatever the digit setting; with extra-large text, amounts and phone numbers broke across lines; in English, a list of Sorani category names came out in reverse order. All fixed before the page was committed (in `0c690d8`).
- On computers set to Arabic, Excel saves CSV files with `;` instead of `,`, which the import read as one column: the separator is now detected (`5bbbba0`), with a test.
- The demo data script could not load the database upgrade steps outside Vite: it reads them from disk (in `efb7132`).

## Issues found in the independent review and how each was fixed

The independent reviewer confirmed the import is all or nothing, the screen cannot send rows or paths, and duplicates (with letter variants) are caught. Its findings:

1. A monthly rent above the app's limit passed the check, then made every import of that file fail with "something changed": the check now uses the same limit (`f6505c9`), with a test.
2. Cancelling "Choose another file" dropped the checked rows while the old preview stayed on screen, so Import could not work: cancelling now keeps both (`12b036e`), with an end-to-end test.
3. A 9 MB Excel file packed with 300,000 rows made the app use 2.25 GB of memory and freeze for 5 seconds: before opening an Excel file, its table of contents is read and a file that would unpack to more than 50 MB is refused as too large. That same file is now refused in 3 ms using 9 MB (`e8ffc0c`), with a test. (exceljs's row-by-row reader was tried first, but it fails on files saved by exceljs itself.)
4. Excel drops the leading 0 of a phone typed into a number cell: a 10-digit number starting with 7 gets its 0 back, in the same digits (`b5ebb46`), with a test.
5. A CSV saved in another encoding (Excel's "Unicode Text") was reported as having the wrong column names: it is now refused with "save it as CSV UTF-8" (`21eb7f6`), with a test.
6. The years in "the year must be from … to …" ignored the Arabic-Indic digit setting (`fa7225f`).
7. For iteration 14 (packaging): without a file list, the installer's default would include `scripts/` and a local `demo-data/` folder. The packaging setup must list only `out/` and `package.json`, and check that no demo data is inside. Recorded in `docs/PROGRESS.md`.
8. Noted, not changed: when a name is repeated, the later row is the one flagged, even if the first copy is itself skipped for another problem. Fixing the first row and choosing the file again then flags the second as a duplicate, which is the right outcome.

## Regression results

- `npm run check`: **614 unit tests** pass (new: reading Excel and CSV files with `,` or `;`, BOM, leading-0 phones, non-UTF-8 and over-packed files; finding columns in any language and order; every row problem; duplicates in the file and in the app with letter variants; the rent limit; importing with new categories; all or nothing; a 200-row file).
- `npm run test:e2e`: **51 end-to-end tests** pass in ghost mode (new: template download, preview, cancelled re-choose, import, re-import skips; a file without the template columns).
- Screenshots of the Import page with a preview in Sorani (light) and English (dark, extra-large text): no sideways scrolling, file names, category lists, amounts and phone numbers in the right order.

## Memory and performance checks done

- 20 rounds of choosing a file (preview with a table) and going back to Home: event listeners exactly flat (173 → 173), page elements 93 → 95, heap 4.8 → 5.6 MB.
- With the demo data (200 areas, 2532 payments): the area list loads in 85 ms, Home's figures in 21 ms, reminders in 49 ms; the Areas screen shows all 200 rows in 0.23 s, and a search (including its 0.15 s typing pause) in 0.24 s.
- `npm run seed` takes under one second.
- A 200-row Excel file is read, checked and imported in one go (unit test).

## Open questions / decisions made

Recorded in `DECISIONS.md` (iteration 12).
