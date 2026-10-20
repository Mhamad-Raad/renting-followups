# Decisions

Choices made during the build, with the reason. Newest iteration last.

## Iteration 0: Repository and tooling

### Node.js 24 and npm

`.nvmrc` pins Node 24 (current LTS) and `package.json` `engines` allows `>=24 <25`. GitHub Actions reads the same `.nvmrc`, so the local and CI versions cannot drift.

### TypeScript 6.0, not 7

TypeScript 7 is out, but `typescript-eslint` (8.72) only supports TypeScript below 6.1. We use TypeScript 6.0.3 so linting with type information keeps working. Revisit when `typescript-eslint` supports 7.

### Strict TypeScript options

Besides `strict`, the config turns on `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes`. Both catch real bugs around money and month arrays (for example reading month 13 of a 12-item list) at compile time.

### Placeholder `dev` and `build` scripts

The Electron app is scaffolded in iteration 1. Until then `npm run dev` and `npm run build` run `scripts/placeholder.mjs`, which only prints a message, so CI and the documented commands work from day one. Iteration 1 replaces both scripts and deletes the placeholder.

### `npm run check`

Runs typecheck, then lint (ESLint and `prettier --check`), then unit tests. Vitest uses `passWithNoTests` so an empty project still passes; the first real tests arrive in iteration 1.

### Formatting excludes the specification files

`ARCHITECTURE.md` and `IMPLEMENTATION.md` are in `.prettierignore` so the owner's text is never reformatted.

### Dependencies (all dev-only, exact versions, locked by `package-lock.json`)

| Package                                                | Why                                                                           |
| ------------------------------------------------------ | ----------------------------------------------------------------------------- |
| `typescript`                                           | Type checking (required by the stack).                                        |
| `@types/node`                                          | Types for Node APIs used by scripts and the main process.                     |
| `eslint`, `@eslint/js`, `typescript-eslint`, `globals` | Linting: catches `any`, stray `console.log`, unsafe patterns.                 |
| `prettier`, `eslint-config-prettier`                   | One code format; the ESLint config turns off rules that would fight Prettier. |
| `vitest`                                               | Unit tests (required by the stack).                                           |

### npm install scripts are reviewed in `allowScripts`

npm 11 lists every dependency install script that is not reviewed in `package.json` (`allowScripts`). Today this is a warning only; a future npm release will block unreviewed scripts. (Corrected in iteration 1: the first version of this note wrongly said npm already blocks them.)

No dependency needs an install script, so every entry is `false`:

- `better-sqlite3`: ships ready-made native builds for Windows and macOS inside the package, and the same build loads in plain Node and in Electron. Its fallback compile step must never run.
- `electron-winstaller`: part of the Squirrel installer, which we do not use (we use NSIS).
- `fsevents`: macOS-only file watcher, optional.

Electron downloads its own binary on first run, so it needs no install script either.

## Iteration 1: App skeleton

### Shared code lives in `src/shared/` (folder structure deviation, approved by the owner)

`ARCHITECTURE.md` places `parseNumber.ts` and `normalizeText.ts` in `src/main/util/`. Both are also needed by the screen (amount fields, search box), and the main process needs them too (Excel import, stored search columns). To keep one copy of each, they live in a new folder, `src/shared/`, together with other pure code used by more than one process: the IPC contract (`ipc.ts`), settings schema, currency rules, digit handling and number formatting. A lint rule forbids Node or Electron imports in `src/shared/`, so it stays safe to load anywhere.

### SQLite build: no rebuild step

`better-sqlite3` 13 ships ready-made builds for Windows and macOS inside the package, and the same build loads in plain Node and in Electron 44. So the unit tests run the real database under plain Node, `npm test` works from a fresh clone, and there is no `electron-builder install-app-deps` step and no need for Visual Studio build tools. Packaging (iteration 14) must still unpack it from the asar archive (`asarUnpack`).

### Electron downloads itself on first use

Electron 44 no longer downloads its program during `npm install`. `npm run dev`, `npm run preview` and `npm run test:e2e` first run `install-electron`, which downloads it once and otherwise does nothing.

### Migrations

Numbered `.sql` files in `src/main/db/migrations/`, bundled at build time. All pending migrations run in **one** transaction, so the file is either fully upgraded or untouched. Before upgrading an existing database, a complete copy is written with SQLite's `VACUUM INTO` to `safety-copies/` in the data folder. These copies are not deleted automatically (they only appear when the app is updated). A database from a newer app version is refused.

### Data folders

The app is named `Rent Tracker`. Development runs use the `Rent Tracker-dev` folder; end-to-end tests point each test at its own temporary folder with `RENT_TRACKER_DATA_DIR`. Both overrides only work in unpackaged builds, so the installed app always uses its real folder.

### Ghost mode for tests

With `RENT_TRACKER_GHOST=1` (unpackaged builds only) the window is still rendered but invisible, unfocusable, click-through and has no Dock icon. The end-to-end tests always use it, so they never interrupt someone working on the same computer.

### Security

On top of `contextIsolation`, no `nodeIntegration` and a sandboxed preload: a Content Security Policy meta tag, every request outside the app's own files blocked in the main process, all permission requests denied, webviews blocked, new windows denied, and all navigation blocked (page changes use the URL hash, which is not navigation). DevTools are off in the packaged app. IPC handlers check that the caller is the app's own page and validate every input with zod. An end-to-end test confirms no request leaves `file://`.

### Windows has no menu bar

The app's sidebar is the only navigation, so the standard File/Edit/View menu bar is removed on Windows.

### Settings apply instantly

A changed setting is shown at once and saved in the background. If saving fails, the screen goes back to what is really stored and says so in plain words.

### Number parsing is strict rather than clever

Amounts are rejected rather than guessed when they are ambiguous: decimals the currency does not have (`1.000` for IQD), wrongly grouped thousands (`1,5`), or more than 15 digits. This avoids silently saving a wrong amount.

### Search normalization goes slightly beyond the spec

Besides the letters listed in `ARCHITECTURE.md`, search also treats ھ like ە, the alef forms أ إ آ ٱ like ا, and ignores zero-width joiners and direction marks, which are common when typing or pasting Sorani. Different Sorani letters (ڕ/ر, ڵ/ل, ۆ/و, ێ/ی) are never merged.

### Default number style is Western (1 2 3)

`ARCHITECTURE.md` does not say which digit style is the default. The owner confirmed Western digits.

### Fonts: system font until iteration 10

For now the app uses the Windows system font (Segoe UI, which covers Sorani) through the `--font-family` variable. Bundling open-licence fonts, with the automated Sorani letter test, is part of the font setting in iteration 10.

### Styles

Global tokens, themes and base styles are in `src/renderer/styles/`; each component keeps its own CSS module next to it. All layout uses CSS logical properties, so right-to-left needs no separate styles. Animations respect `prefers-reduced-motion`. Contrast of every text colour pair is checked by a unit test in both themes.

### Logging

`userData/logs/app.log`, JSON lines, rotated at 1 MB with three old files kept. Errors are logged by type and stack frames only, never the message, because messages can contain names or numbers the owner typed. Development runs also log memory use every 30 seconds.

### Startup failure

If the data cannot be opened, the app shows one plain message in all three languages (the saved language may not be readable then), logs the error and closes without changing anything. Restore from backup is offered here in iteration 11.

### Not yet built

The preload API has no main-to-screen events yet; the subscribe/unsubscribe pattern is added with the first event (notifications, iteration 9).

### Dependencies added in iteration 1

| Package                                                     | Why                                                  |
| ----------------------------------------------------------- | ---------------------------------------------------- |
| `electron`, `electron-vite`, `vite`, `@vitejs/plugin-react` | The stack: desktop shell and build tool.             |
| `react`, `react-dom`, `react-router`                        | The stack: screens and `HashRouter`.                 |
| `better-sqlite3` (+ types)                                  | The stack: SQLite.                                   |
| `zod`                                                       | The stack: validation of every IPC input.            |
| `i18next`, `react-i18next`                                  | The stack: three languages.                          |
| `electron-builder`                                          | The stack: Windows installer (used in iteration 14). |
| `@playwright/test`                                          | The stack: end-to-end tests of the real app.         |
| `eslint-plugin-react-hooks`                                 | Catches missing effect cleanups and wrong hook use.  |

`npm audit` reports 8 moderate issues, all inside `electron-builder`'s download tooling (`global-agent` → `sprintf-js`). It runs only on the developer's machine at build time and is not part of the installed app. Re-check when `electron-builder` updates.

### Sorani and Arabic wording

All terms are collected in `docs/glossary.md`. The owner approved the current wording: "Areas" is شوێنەکان in Sorani and العقارات in Arabic; the app name is بەدواداچوونی کرێ / متابعة الإيجارات; a receipt is پسوولە / وصل.

## Iteration 2: Authentication

### Honest scope: the password locks the screen, not the file

The password locks the app interface; it does **not** encrypt the database file. Someone with access to the Windows account could read the file with other software. This is acceptable for one PC and one user (as `ARCHITECTURE.md` section 10 says). If real protection is wanted later, switch to SQLCipher (`better-sqlite3-multiple-ciphers`) with a key derived from the password; all database access goes through `src/main/db/connection.ts`, so only that file changes.

### Hashing

scrypt with N = 2^15, r = 8, p = 1, a 64-byte key and a new 16-byte random salt per secret (about 0.1 s per check). Stored as `password_hash`/`password_salt` and `recovery_hash`/`recovery_salt` in the settings table. Hashes carry a format prefix (`scrypt1:`) so stronger settings can be introduced later without breaking existing passwords. Comparison is constant-time. The hashes are kept in a separate repository and never returned with the normal settings.

### Password exact, recovery phrase forgiving

The password is compared exactly as typed. The recovery phrase is written on paper and typed again much later, so it is compared after the same normalization as search: case, extra spaces, and Arabic/Kurdish letter variants (ي/ی, ك/ک, ه/ە…) do not matter.

### The 5-tries rule covers every secret check

`ARCHITECTURE.md` asks for the 5-wrong-attempts/30-seconds rule on the recovery phrase. It is applied to every check of a secret (unlocking, recovery, and the current password when changing the password or phrase), counted together, because the password needs the same protection against guessing. After the wait, five more tries are allowed. The count is kept in memory, so it starts again when the app restarts (restarting takes long enough that this does not help guessing much, and it keeps the owner from being stuck).

### Minimum lengths

A password needs at least 4 characters and a recovery phrase at least 8, and the phrase may not simply repeat the password. `ARCHITECTURE.md` sets no lengths; these keep the rules gentle for the owner while preventing an empty or trivial secret.

### Changing the recovery phrase needs the current password

`ARCHITECTURE.md` says only "Change recovery phrase". It asks for the current password too, so nobody can quietly replace the phrase at an unlocked computer and then use it to take over the password.

### The main process enforces the lock

The lock is not only on screen. Each IPC channel is marked in `OPEN_WHILE_LOCKED` (`src/shared/ipc.ts`); until the password is entered, the main process refuses every channel except reading settings (for the lock screen's language and theme), crash reports and the auth channels themselves. The lock screen cannot change the language; it uses the last one used.

### Secrets are never logged or kept on screen

Only outcomes are logged (`auth.unlock ok=false`), never the typed text; invalid IPC input is logged by field name only. Dialogs render their content only while open, so a typed password is discarded as soon as the dialog closes. A test reads every database, WAL and log file after setup and checks neither secret appears.

### Single running copy

`app.requestSingleInstanceLock()` keeps one copy per data folder; a second launch only brings the existing window to the front (in ghost mode it does nothing, so tests never take focus).

### Friendlier password boxes

Every password box has a **Show/Hide** button and warns when Caps Lock is on. After a wrong password the box is cleared and the cursor returns to it.
