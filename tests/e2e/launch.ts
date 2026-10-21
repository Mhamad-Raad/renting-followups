import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { _electron as electron, type ElectronApplication, type Page } from '@playwright/test';

export interface LaunchedApp {
  app: ElectronApplication;
  page: Page;
  dataDir: string;
}

/** Creates an empty data folder for one test, so tests never share or keep data. */
export function createDataDir(): string {
  return mkdtempSync(join(tmpdir(), 'rent-tracker-e2e-'));
}

export function removeDataDir(dataDir: string): void {
  rmSync(dataDir, { recursive: true, force: true });
}

/** Starts the built app (run `npm run build` first) against the given data folder. */
export async function launchApp(dataDir: string): Promise<LaunchedApp> {
  const app = await electron.launch({
    args: [join(import.meta.dirname, '../../out/main/index.js')],
    // Ghost mode keeps the test window invisible so it never interrupts the person at the computer.
    env: { ...process.env, RENT_TRACKER_DATA_DIR: dataDir, RENT_TRACKER_GHOST: '1' },
  });
  const page = await app.firstWindow();
  await page.waitForLoadState('domcontentloaded');
  return { app, page, dataDir };
}

export const TEST_PASSWORD = 'test-pass-1';
export const TEST_RECOVERY_PHRASE = 'blue door on the old street';

/**
 * Starts the app and gets past the password, creating it on first run. Goes
 * through IPC rather than the screen so it works in any language; the auth
 * screens themselves are tested in auth.spec.ts.
 */
export async function launchUnlocked(dataDir: string): Promise<LaunchedApp> {
  const launched = await launchApp(dataDir);
  const { page } = launched;
  const status = await page.evaluate(() => window.api.invoke('auth:status'));
  if (!status.ok) throw new Error('Could not read the lock status');
  if (status.data === 'setup') {
    await page.evaluate(
      ([password, recoveryPhrase]) => window.api.invoke('auth:setup', { password, recoveryPhrase }),
      [TEST_PASSWORD, TEST_RECOVERY_PHRASE] as const,
    );
  } else if (status.data === 'locked') {
    await page.evaluate(
      (password) => window.api.invoke('auth:unlock', { password }),
      TEST_PASSWORD,
    );
  }
  await reloadApp(page);
  return launched;
}

/**
 * Reloads the page and, when there are reminders, closes the popup the app
 * shows on opening, so a test can carry on. Whether a popup comes is read
 * from the same reminders the app uses, so this never waits on a guess.
 */
export async function reloadApp(page: Page): Promise<void> {
  await page.reload();
  await page.getByRole('navigation').waitFor();
  const reminders = await page.evaluate(() => window.api.invoke('notifications:list'));
  if (reminders.ok && reminders.data.length > 0) {
    const popup = page.getByRole('dialog');
    await popup.waitFor();
    await page.keyboard.press('Escape');
    await popup.waitFor({ state: 'hidden' });
  }
}
