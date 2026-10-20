# Iteration 0 review: Repository and tooling

## What was built

Git repository pushed to GitHub (`main` plus `iter-00-tooling`); `package.json` with Node 24 pin; strict TypeScript; ESLint and Prettier; Vitest; scripts `dev`, `build`, `test`, `lint`, `typecheck`, `format`, `check`; Windows GitHub Actions workflow; `README.md`, `DECISIONS.md`, `docs/PROGRESS.md`, `docs/REGRESSION.md`, `docs/reviews/`.

## Issues found in self-review and how each was fixed

- The TypeScript config was first committed on its own, where `tsc` fails with "no inputs". Before pushing, it was combined with the Vitest config into one commit (`9e73171`) so every commit passes `npm run check`.
- `tseslint.config()` is deprecated; switched to ESLint's own `defineConfig` (in `866f0c0`, before committing).
- npm 11 warns about unapproved install scripts (`fsevents`, macOS only). Harmless today; recorded in `DECISIONS.md` because Electron and SQLite need approval in iteration 1.

## Regression results

- Fresh clone, `npm ci`, `npm run check`, `npm run build` and `npm run dev`: all pass.
- GitHub Actions on `windows-latest`: green (run 39389872846).
- Lint rules proven to fire: a probe file with `any` and `console.log` was rejected.
- Git history checked: no `CLAUDE.md`, database, log or secret file has ever been committed, and no commit message mentions tooling authorship.

## Memory and performance checks done

Not applicable: there is no app code yet.

## Open questions / decisions made

See `DECISIONS.md` (iteration 0): TypeScript 6.0 instead of 7, placeholder `dev`/`build`, npm install-script policy. Open questions are in `docs/PROGRESS.md`.
