# Progress

## Current iteration

**Iteration 0: Repository and tooling**, on branch `iter-00-tooling`. Built and reviewed; waiting for the owner to say "continue".

## Done

- Iteration 0: git and GitHub set up, TypeScript (strict), ESLint, Prettier, Vitest, `npm run check`, Windows CI, README, `DECISIONS.md`, this file, `docs/REGRESSION.md`, `docs/reviews/`.

## Next

- On "continue": merge `iter-00-tooling` into `main` with `--no-ff`, tag `iter-00`, push.
- Then iteration 1 (app skeleton): Electron + React + Vite via `electron-vite`, secure preload/IPC with `zod`, SQLite and migrations, sidebar layout, three languages with RTL/LTR, themes, base components, `parseNumber` and `normalizeText` with tests.

## Open questions

- Which fields of a receipt can be edited (amount, date, months)? To decide in iteration 5.
- Sorani wording needs a native speaker's review (glossary arrives in iteration 1).
