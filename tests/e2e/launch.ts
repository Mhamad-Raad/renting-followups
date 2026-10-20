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
    env: { ...process.env, RENT_TRACKER_DATA_DIR: dataDir },
  });
  const page = await app.firstWindow();
  await page.waitForLoadState('domcontentloaded');
  return { app, page, dataDir };
}
