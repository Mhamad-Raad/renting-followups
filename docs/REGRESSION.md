# Regression checklist

Walk through this whole list at the end of every iteration. Each iteration adds the behaviours it introduced.

## Iteration 0: Tooling

- [ ] `npm install` works from a fresh clone.
- [ ] `npm run check` passes (typecheck, lint, formatting, unit tests).
- [ ] The GitHub Actions `check` workflow is green on the latest push.
- [ ] `git status` never lists `CLAUDE.md`, `node_modules/`, `.db` files or logs.
