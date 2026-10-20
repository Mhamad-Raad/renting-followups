import { expect, test } from '@playwright/test';
import { createDataDir, launchApp, removeDataDir } from './launch';

test('the app opens its main window', async () => {
  const dataDir = createDataDir();
  const { app, page } = await launchApp(dataDir);
  try {
    await expect(page.locator('#root')).not.toBeEmpty();
  } finally {
    await app.close();
    removeDataDir(dataDir);
  }
});
