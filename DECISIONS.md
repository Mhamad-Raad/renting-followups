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

### npm install scripts are opt-in

npm 11 only runs a dependency's install script when it is approved in `package.json` (`allowScripts`). Today the only package with one is `fsevents`, a macOS-only file watcher that Windows never installs, so it stays unapproved and the warning on macOS is harmless. Iteration 1 must explicitly approve `electron` and `better-sqlite3` (and the `electron-builder install-app-deps` step), or the app will not start.
