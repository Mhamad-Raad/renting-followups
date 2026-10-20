import { expect, test } from '@playwright/test';
import { createDataDir, launchApp, removeDataDir } from './launch';

test('settings are saved in the database and survive a restart', async () => {
  const dataDir = createDataDir();
  try {
    const first = await launchApp(dataDir);
    const initial = await first.page.evaluate(() => window.api.invoke('settings:get'));
    expect(initial).toMatchObject({ ok: true, data: { language: 'ckb', themeMode: 'light' } });
    const updated = await first.page.evaluate(() =>
      window.api.invoke('settings:update', { language: 'en', themeMode: 'dark' }),
    );
    expect(updated).toMatchObject({ ok: true, data: { language: 'en', themeMode: 'dark' } });
    await first.app.close();

    const second = await launchApp(dataDir);
    const reloaded = await second.page.evaluate(() => window.api.invoke('settings:get'));
    expect(reloaded).toMatchObject({ ok: true, data: { language: 'en', themeMode: 'dark' } });
    await second.app.close();
  } finally {
    removeDataDir(dataDir);
  }
});

test('the main process rejects invalid input', async () => {
  const dataDir = createDataDir();
  const { app, page } = await launchApp(dataDir);
  try {
    const result = await page.evaluate(() =>
      // Deliberately bypass the types to send what a compromised page might send.
      (window.api.invoke as (channel: string, input: unknown) => Promise<unknown>)(
        'settings:update',
        { language: 'fr', passwordHash: 'x' },
      ),
    );
    expect(result).toEqual({ ok: false, error: 'invalid_input' });
    const unknownChannel = await page.evaluate(() =>
      (window.api.invoke as (channel: string) => Promise<unknown>)('db:dropEverything').catch(
        () => 'rejected',
      ),
    );
    expect(unknownChannel).toBe('rejected');
  } finally {
    await app.close();
    removeDataDir(dataDir);
  }
});
