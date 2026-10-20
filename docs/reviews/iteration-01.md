# Iteration 1 review: App skeleton

## What was built

Electron 44 + React 19 + TypeScript + Vite (electron-vite) in the `ARCHITECTURE.md` folder structure (plus `src/shared/`, see `DECISIONS.md`). A secure preload bridge with a typed IPC contract, every input validated with zod in the main process. SQLite (WAL, foreign keys) with a numbered migration runner, `schema_version`, all-or-nothing upgrades and a safety copy before upgrading. Settings stored in SQLite. Sidebar layout with Home, Areas, Reports, Notifications (placeholders) and a first Settings screen (language, number style, light/dark, text size). Sorani (default), English and Arabic with full RTL/LTR flipping. Light and dark themes with status colours, text-size scaling, base components (`BigButton`, `ConfirmDialog`, `MoneyText`, `ChoiceGroup`, `PageHeader`, `Icon`), page and dialog transitions with reduced-motion support, error boundary, rotating private log, window defaults, plain startup-failure message. Utilities `parseNumber`, `formatNumber`, `normalizeText` with tests. Glossary in three languages.

## Issues found in self-review and how each was fixed

- The "1 2 3" number-style option showed as "3 2 1" in right-to-left languages: label isolated left-to-right (in `1ab8fa5`, before committing).
- A setting changed only after the database answered, a visible lag: settings now apply instantly and fall back to the stored value if saving fails (`7e4ac2b`).
- Light-mode "not applicable" grey failed the contrast check (3.7:1): darkened, and a contrast test now guards every colour pair in both themes (`6b1902e`).
- The same helper type was defined twice: shared from `src/shared/ipc.ts` (`7e4ac2b`).
- Stack-frame extraction was duplicated between main and screen: moved to `src/shared/errors.ts` (`ffe181e`).
- Invisible Unicode characters had ended up in source files: replaced with readable `\u` escapes (before committing).
- The tsconfig commit failed `npm run check` on its own; folded into one working commit before pushing (`bb08974`).
- Test windows took over the owner's screen: added ghost mode for all automated runs (`c344796`).
- A database from a newer version crashed with a raw error: now a plain three-language message, nothing changed (`fc2c733`).

## Regression results

- `npm run check`: typecheck (3 configs), ESLint, Prettier, **125 unit tests** pass.
- `npm run test:e2e`: **7 end-to-end tests** pass locally (ghost mode) and on Windows in GitHub Actions: Sorani RTL start with sidebar on the right, all five screens, English flips to LTR, dark mode and text size apply and survive a restart, settings stored in the real database inside Electron, invalid IPC input rejected, unknown IPC channel rejected, no network requests and no console errors, window maximized with minimum 1100×700.
- Development mode checked with the live-reload server: no CSP or console errors, title shows "[DEV]".
- Checked with temporary test screens (not committed): the confirm dialog (dimmed backdrop, RTL, Enter confirms, Esc cancels, focus on the main button), money display (`1,250,000 دینار`, `1,234.56 دۆلار`), and a deliberate page crash (friendly screen, sidebar still works, Go back works, log contains no name or phone number).
- Startup with a too-new database: no window, error logged by type only, database unchanged. The message box itself could not be photographed (macOS blocks screen capture here).
- Not yet verified by eye: the window on a real Windows screen at 125%/150% scaling (only by automated tests on the Windows runner).

## Memory and performance checks done

Measured with forced garbage collection in both processes, in the built app:

- Main process heap: 6,251 KB → 6,279 KB after 60 rounds of using every screen and changing settings (flat).
- Screen heap: 5,001 KB → 5,266 KB over 300 page changes and 120 setting changes; growth shrinks every round (+144, +128, +72 KB) and fits Chromium's own back/forward history entries. No leak found in our code.
- Every effect, timer and listener has a cleanup; IPC handlers are registered once (a second registration throws); the database connection and the dev memory timer are closed on quit.

## Open questions / decisions made

Recorded in `DECISIONS.md` (iteration 1). For the owner:

1. Shared code moved to `src/shared/` (a small change to the folder plan in `ARCHITECTURE.md`).
2. Default number style: Western (1 2 3) or Arabic-Indic (١ ٢ ٣)?
3. Sorani and Arabic wording in `docs/glossary.md` needs a native speaker's check.
