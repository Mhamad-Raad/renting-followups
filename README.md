# Rent Tracker

An offline Windows desktop app for tracking monthly rent across many properties: which months are paid, how much was received, how much is still owed, with printed reports and receipts.

Built with Electron, React, TypeScript and SQLite. It makes no network requests and keeps all data in one local file.

> Status: early development. The project tooling is in place; the app itself arrives step by step (see `docs/PROGRESS.md`).

## Guides

- [`ARCHITECTURE.md`](ARCHITECTURE.md): what the app does, business rules, data model and folder structure.
- [`IMPLEMENTATION.md`](IMPLEMENTATION.md): how the work is done: iterations, commit rules, review checklist.
- [`DECISIONS.md`](DECISIONS.md): choices made during the build and why.
- [`docs/PROGRESS.md`](docs/PROGRESS.md): current iteration and what comes next.
- [`docs/REGRESSION.md`](docs/REGRESSION.md): behaviours checked at the end of every iteration.

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

| Command             | What it does                                                |
| ------------------- | ----------------------------------------------------------- |
| `npm run dev`       | Starts the app in development mode (from iteration 1).      |
| `npm run build`     | Builds the app (from iteration 1).                          |
| `npm test`          | Runs the unit tests once.                                   |
| `npm run typecheck` | Checks TypeScript types.                                    |
| `npm run lint`      | Runs ESLint and checks formatting with Prettier.            |
| `npm run format`    | Formats all files with Prettier.                            |
| `npm run check`     | Typecheck, lint and unit tests. Run it before every commit. |

Every push runs `npm run check` and the build on Windows through GitHub Actions.
