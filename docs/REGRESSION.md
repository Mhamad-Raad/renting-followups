# Regression checklist

Walk through this whole list at the end of every iteration. Each iteration adds the behaviours it introduced.

## Iteration 0: Tooling

- [ ] `npm install` works from a fresh clone.
- [ ] `npm run check` passes (typecheck, lint, formatting, unit tests).
- [ ] The GitHub Actions `check` workflow is green on the latest push.
- [ ] `git status` never lists `CLAUDE.md`, `node_modules/`, `.db` files or logs.

## Iteration 1: App skeleton

Automated (`npm run test:e2e`) unless marked _manual_.

- [ ] The app opens maximized; the window cannot be made smaller than 1100×700.
- [ ] First start is in Sorani, right to left, with the sidebar on the right.
- [ ] The sidebar shows Home, Areas, Reports, Notifications, Settings; each opens its screen and is marked as current.
- [ ] Settings → Language: English flips the whole layout to left to right (sidebar on the left); Arabic and Sorani flip it back.
- [ ] Settings → Light/Dark switches colours at once; Text size changes every text at once.
- [ ] Settings → Number style shows "1 2 3" and "١ ٢ ٣" in their natural order.
- [ ] All settings are still there after closing and reopening the app.
- [ ] The app makes no network requests and the console shows no errors.
- [ ] _manual_ Page changes fade in with a small slide in the reading direction; nothing moves with reduced motion turned on in Windows.
- [ ] _manual_ The title bar shows "[DEV]" when run with `npm run dev`, and never in the installed app.
- [ ] _manual_ A screen that crashes shows "Something went wrong. Your data is safe." with Go back, while the sidebar keeps working.
- [ ] _manual_ A database from a newer app version shows the plain three-language message and is not changed.
