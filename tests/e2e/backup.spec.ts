import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type ElectronApplication, type Page } from '@playwright/test';
import ckb from '../../src/renderer/i18n/ckb.json' with { type: 'json' };
import en from '../../src/renderer/i18n/en.json' with { type: 'json' };
import {
  createDataDir,
  launchApp,
  launchUnlocked,
  removeDataDir,
  reloadApp,
  TEST_PASSWORD,
} from './launch';

/** Answers the next "Open" dialogs in the main process with `path`, as if the owner chose it. */
async function answerOpenDialog(app: ElectronApplication, path: string) {
  await app.evaluate(({ dialog }, chosen) => {
    dialog.showOpenDialog = (() =>
      Promise.resolve({ canceled: false, filePaths: [chosen] })) as typeof dialog.showOpenDialog;
  }, path);
}

async function addArea(page: Page, name: string) {
  await page.evaluate(async (areaName) => {
    const categories = await window.api.invoke('categories:list');
    let categoryId = categories.ok ? categories.data[0]?.id : undefined;
    if (categoryId === undefined) {
      const created = await window.api.invoke('categories:create', { name: 'Shops', color: null });
      if (!created.ok || !created.data.ok) throw new Error('category failed');
      categoryId = created.data.id;
    }
    const now = new Date();
    await window.api.invoke('areas:create', {
      categoryId,
      name: areaName,
      currency: 'IQD',
      monthlyPrice: 100_000,
      rentStartsFrom: { year: now.getFullYear(), month: now.getMonth() + 1 },
      renter: null,
      address: '',
      contractStart: null,
      notes: '',
    });
  }, name);
}

async function areaNames(page: Page): Promise<string[]> {
  const areas = await page.evaluate(() =>
    window.api.invoke('areas:list', { search: '', categoryId: null }),
  );
  return areas.ok ? areas.data.map((area) => area.name).sort() : [];
}

async function openSettingsInEnglish(page: Page) {
  await page.evaluate(() => window.api.invoke('settings:update', { language: 'en' }));
  await reloadApp(page);
  await page.getByRole('navigation').getByRole('link', { name: 'Settings' }).click();
}

/** Backs up through Settings into `folder` (chosen on the first backup); returns the file. */
async function backUpFromSettings(app: ElectronApplication, page: Page, folder: string) {
  await answerOpenDialog(app, folder);
  await page.getByRole('button', { name: en.backup.now, exact: true }).click();
  await expect(page.getByText(/Backup saved: rent-backup-/)).toBeVisible();
  const [file] = readdirSync(folder).filter((name) => name.endsWith('.db'));
  return join(folder, file ?? '');
}

/** Chooses `file` in Restore from backup and confirms; the app then closes to put it in place. */
async function restoreFromSettings(app: ElectronApplication, page: Page, file: string) {
  await answerOpenDialog(app, file);
  await page.getByRole('button', { name: en.backup.restore }).click();
  const dialog = page.getByRole('dialog', { name: en.backup.confirmTitle });
  await expect(dialog).toContainText('Areas: 1');
  const closed = app.waitForEvent('close');
  await dialog.getByRole('button', { name: en.backup.confirmRestore }).click();
  await closed;
}

test('Back up now writes a backup to the chosen folder and shows its date', async () => {
  const dataDir = createDataDir();
  const { app, page } = await launchUnlocked(dataDir);
  try {
    await addArea(page, 'Shop 1');
    await openSettingsInEnglish(page);
    await expect(page.getByText(en.backup.never)).toBeVisible();
    const folder = join(dataDir, 'backups');
    mkdirSync(folder);
    const file = await backUpFromSettings(app, page, folder);
    expect(readFileSync(file).subarray(0, 15).toString()).toBe('SQLite format 3');
    await expect(page.getByText(/^Last backup: /)).toBeVisible();
    // The test folder is on the same drive as the data, so the advice shows (it never blocks).
    await expect(page.getByText(en.backup.sameDrive)).toBeVisible();
  } finally {
    await app.close();
    removeDataDir(dataDir);
  }
});

test('backup then restore brings back exactly the backed-up data', async () => {
  const dataDir = createDataDir();
  try {
    const first = await launchUnlocked(dataDir);
    await addArea(first.page, 'Shop 1');
    await openSettingsInEnglish(first.page);
    const folder = join(dataDir, 'backups');
    mkdirSync(folder);
    const backup = await backUpFromSettings(first.app, first.page, folder);
    await addArea(first.page, 'Shop added after the backup');
    await reloadApp(first.page);
    await first.page.getByRole('navigation').getByRole('link', { name: 'Settings' }).click();
    await restoreFromSettings(first.app, first.page, backup);

    // On the next start the lock screen says what happened, in the backup's language.
    const second = await launchApp(dataDir);
    await expect(second.page.getByText(/Your data was restored from the backup of/)).toBeVisible();
    await second.page.evaluate(
      (password) => window.api.invoke('auth:unlock', { password }),
      TEST_PASSWORD,
    );
    expect(await areaNames(second.page)).toEqual(['Shop 1']);
    // What was replaced is kept as a safety copy.
    expect(readdirSync(join(dataDir, 'safety-copies'))).toContainEqual(
      expect.stringMatching(/^before-restore_.*\.db$/),
    );
    await second.app.close();
  } finally {
    removeDataDir(dataDir);
  }
});

test('saying no to a checked backup changes nothing and leaves no copy behind', async () => {
  const dataDir = createDataDir();
  const { app, page } = await launchUnlocked(dataDir);
  try {
    await addArea(page, 'Shop 1');
    await openSettingsInEnglish(page);
    const folder = join(dataDir, 'backups');
    mkdirSync(folder);
    const backup = await backUpFromSettings(app, page, folder);
    await answerOpenDialog(app, backup);
    await page.getByRole('button', { name: en.backup.restore }).click();
    const dialog = page.getByRole('dialog', { name: en.backup.confirmTitle });
    // The keyboard starts on Cancel: a stray Enter must never replace the data.
    await expect(dialog.getByRole('button', { name: en.common.cancel })).toBeFocused();
    await dialog.getByRole('button', { name: en.common.cancel }).click();
    await expect(dialog).toHaveCount(0);
    await expect.poll(() => readdirSync(join(dataDir, 'restore'))).toEqual([]);
    expect(await areaNames(page)).toEqual(['Shop 1']);
  } finally {
    await app.close();
    removeDataDir(dataDir);
  }
});

test('a file that is not a backup is refused in plain words and nothing changes', async () => {
  const dataDir = createDataDir();
  const { app, page } = await launchUnlocked(dataDir);
  try {
    await addArea(page, 'Shop 1');
    await openSettingsInEnglish(page);
    const notBackup = join(dataDir, 'holiday-photos.db');
    writeFileSync(notBackup, 'not a database');
    await answerOpenDialog(app, notBackup);
    await page.getByRole('button', { name: en.backup.restore }).click();
    await expect(page.getByText(en.backup.refused.not_backup)).toBeVisible();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect(await areaNames(page)).toEqual(['Shop 1']);
  } finally {
    await app.close();
    removeDataDir(dataDir);
  }
});

test('a damaged data file shows the recovery screen, and a backup brings the data back', async () => {
  const dataDir = createDataDir();
  try {
    const first = await launchUnlocked(dataDir);
    for (let index = 1; index <= 40; index += 1) await addArea(first.page, `Shop ${index}`);
    await openSettingsInEnglish(first.page);
    const folder = join(dataDir, 'backups');
    mkdirSync(folder);
    const backup = await backUpFromSettings(first.app, first.page, folder);
    await first.app.close();

    // The disk spoils the middle of the data file.
    const database = join(dataDir, 'rent-tracker.db');
    const bytes = readFileSync(database);
    bytes.fill(0x55, 4096 * 2 + 50, Math.min(bytes.length, 4096 * 8));
    writeFileSync(database, bytes);

    const second = await launchApp(dataDir);
    const titles = [en.backup.damaged.title, ckb.backup.damaged.title];
    await expect(second.page.getByRole('heading', { level: 1 })).toHaveText(
      new RegExp(titles.join('|')),
    );
    // The damaged screen offers nothing but restoring: no other data is reachable.
    const areas = await second.page.evaluate(() =>
      window.api.invoke('areas:list', { search: '', categoryId: null }).catch(() => 'refused'),
    );
    expect(areas).toBe('refused');
    await answerOpenDialog(second.app, backup);
    await second.page.getByRole('button').first().click();
    const closed = second.app.waitForEvent('close');
    await second.page.getByRole('dialog').getByRole('button').first().click();
    await closed;

    const third = await launchUnlocked(dataDir);
    expect(await areaNames(third.page)).toHaveLength(40);
    // The damaged file is kept, never deleted.
    const kept = readdirSync(join(dataDir, 'safety-copies')).find((name) =>
      name.startsWith('before-restore_'),
    );
    expect(kept && existsSync(join(dataDir, 'safety-copies', kept))).toBe(true);
    await third.app.close();
  } finally {
    removeDataDir(dataDir);
  }
});
