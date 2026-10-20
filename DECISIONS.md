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
