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

## Iteration 2: Authentication

Automated (`npm run test:e2e`) unless marked _manual_.

- [ ] First start shows "Create your password" with the "Write down your recovery phrase" warning.
- [ ] Two different passwords, a password under 4 characters or a phrase under 8 letters are explained in plain words; nothing opens.
- [ ] After setup the app opens; every later start shows the lock screen in the last used language.
- [ ] A wrong password says how many tries are left, clears the box and puts the cursor back in it.
- [ ] Five wrong tries show a 30-second countdown and disable the Open button.
- [ ] "Forgot password?" → the recovery phrase (any case, extra spaces, Arabic or Kurdish letters) sets a new password; the old one stops working.
- [ ] Settings → Security → Change password needs the current password; the new one works on the next start.
- [ ] Settings → Security → Change recovery phrase needs the current password.
- [ ] While locked, nothing but the lock screen's own requests is answered by the main process.
- [ ] The password and phrase never appear in the database, its WAL file or the logs.
- [ ] Starting the app a second time does not open a second copy.
- [ ] _manual_ On Windows, starting the app again from the desktop shortcut brings the open window to the front.
- [ ] _manual_ Show/Hide reveals the typed password; Caps Lock shows a warning under the box.
