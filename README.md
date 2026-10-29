# Rent Tracker

An offline Windows desktop app for tracking monthly rent across many properties: which months are paid, how much was received, how much is still owed, with printed reports and receipts.

Built with Electron, React, TypeScript and SQLite. It makes no network requests and keeps all data in one local file.

> Status: early development. The app opens with its sidebar, three languages, light and dark mode, and its database; the features arrive step by step (see `docs/PROGRESS.md`).

## Guides

- [`ARCHITECTURE.md`](ARCHITECTURE.md): what the app does, business rules, data model and folder structure.
- [`IMPLEMENTATION.md`](IMPLEMENTATION.md): how the work is done: iterations, commit rules, review checklist.
- [`DECISIONS.md`](DECISIONS.md): choices made during the build and why.
- [`docs/PROGRESS.md`](docs/PROGRESS.md): current iteration and what comes next.
- [`docs/REGRESSION.md`](docs/REGRESSION.md): behaviours checked at the end of every iteration.
- [`docs/glossary.md`](docs/glossary.md): key words in Sorani, English and Arabic.

## Requirements

- Node.js 24 (see `.nvmrc`)
- npm (comes with Node.js)
- Git

## Getting started

```bash
git clone https://github.com/Mhamad-Raad/renting-followups.git
cd renting-followups
npm install
```

## Commands

| Command             | What it does                                                          |
| ------------------- | --------------------------------------------------------------------- |
| `npm run dev`       | Starts the app in development mode, with live reload.                 |
| `npm run build`     | Builds the app into `out/`.                                           |
| `npm run preview`   | Starts the built app.                                                 |
| `npm run dist`      | Builds the Windows installer into `release/` (also works on a Mac).   |
| `npm test`          | Runs the unit tests once (including the real SQLite database).        |
| `npm run test:e2e`  | Builds the app and runs the end-to-end tests against it (Playwright). |
| `npm run typecheck` | Checks TypeScript types.                                              |
| `npm run lint`      | Runs ESLint and checks formatting with Prettier.                      |
| `npm run format`    | Formats all files with Prettier.                                      |
| `npm run check`     | Typecheck, lint and unit tests. Run it before every commit.           |

Every push runs `npm run check`, the build and the end-to-end tests on Windows through GitHub Actions.

## Where the data lives

The app keeps its database, logs and safety copies in the user's app data folder (`%APPDATA%\Rent Tracker` on Windows). Development runs use a separate `Rent Tracker-dev` folder, so testing never touches real data.

Uninstalling the app never deletes this folder; the uninstall screen says so.

## Testing notes

- Unit tests run under plain Node. `better-sqlite3` ships one ready-made build that works in both Node and Electron, so no rebuild step is needed.
- End-to-end tests launch the real built app with a fresh temporary data folder for each test. They run it in "ghost mode" (invisible, unfocusable, click-through), so they never take over the screen of someone working on the same computer.
- Electron downloads its program the first time it is needed (`npm run dev` and `npm run test:e2e` do this automatically).

## Project structure

```
src/
  main/       Electron main process: window, security, database, IPC handlers, services
  preload/    The small, typed bridge exposed to the screen as window.api
  renderer/   The screen: React app, pages, components, translations, styles
  shared/     Pure code used by more than one process (no Node or Electron APIs)
tests/
  unit/       Vitest
  e2e/        Playwright against the built app
```
