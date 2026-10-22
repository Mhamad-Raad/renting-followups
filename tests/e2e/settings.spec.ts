import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { createDataDir, launchUnlocked, removeDataDir, reloadApp } from './launch';

// A real 1×1 PNG picture.
const PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

async function openSettings(page: Page) {
  await page.evaluate(() => window.api.invoke('settings:update', { language: 'en' }));
  await reloadApp(page);
  await page.getByRole('navigation').getByRole('link', { name: 'Settings' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Settings');
}

/** Answers the next "Open" dialog in the main process with `path`, as if the owner chose it. */
async function choosePicture(app: ElectronApplication, path: string) {
  await app.evaluate(({ dialog }, file) => {
    dialog.showOpenDialog = (() =>
      Promise.resolve({ canceled: false, filePaths: [file] })) as typeof dialog.showOpenDialog;
  }, path);
}

test('theme colour and font apply at once and are remembered', async () => {
  const dataDir = createDataDir();
  try {
    const first = await launchUnlocked(dataDir);
    await openSettings(first.page);
    await first.page.getByRole('radio', { name: 'Teal', exact: true }).check();
    await first.page.getByRole('radio', { name: /^Vazirmatn/ }).check();
    const look = (page: Page) =>
      page.evaluate(async () => {
        await document.fonts.ready;
        const root = document.documentElement;
        return {
          accent: root.dataset['accent'],
          font: getComputedStyle(document.body).fontFamily.split(',')[0],
          // Resolves with the font faces found: the bundled Vazirmatn file, never a system font.
          loaded: (await document.fonts.load('16px Vazirmatn', 'ڕێ')).length > 0,
        };
      });
    expect(await look(first.page)).toEqual({ accent: 'teal', font: 'Vazirmatn', loaded: true });
    await first.app.close();

    const second = await launchUnlocked(dataDir);
    expect(await look(second.page)).toEqual({ accent: 'teal', font: 'Vazirmatn', loaded: true });
    await second.app.close();
  } finally {
    removeDataDir(dataDir);
  }
});

test('the reminder days setting decides when the month reminder starts', async () => {
  const dataDir = createDataDir();
  const { app, page } = await launchUnlocked(dataDir);
  try {
    const now = new Date();
    const daysLeft =
      new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate() - now.getDate() + 1;
    await page.evaluate(
      async (today) => {
        const category = await window.api.invoke('categories:create', {
          name: 'Shops',
          color: null,
        });
        if (!category.ok || !category.data.ok) throw new Error('category failed');
        await window.api.invoke('areas:create', {
          categoryId: category.data.id,
          name: 'Shop 1',
          currency: 'IQD',
          monthlyPrice: 250_000,
          rentStartsFrom: today,
          renter: null,
          address: '',
          contractStart: null,
          notes: '',
        });
      },
      { year: now.getFullYear(), month: now.getMonth() + 1 },
    );
    await openSettings(page);

    for (const days of [3, 14]) {
      await page.getByRole('radio', { name: String(days), exact: true }).check();
      await expect
        .poll(async () => {
          const reminders = await page.evaluate(() => window.api.invoke('notifications:list'));
          return reminders.ok && reminders.data.some((item) => item.kind === 'month_end');
        })
        .toBe(daysLeft <= Math.max(days, 3));
    }
  } finally {
    await app.close();
    removeDataDir(dataDir);
  }
});

test('print title and logo show in the preview and on printed pages, and the logo can be removed', async () => {
  const dataDir = createDataDir();
  const { app, page } = await launchUnlocked(dataDir);
  try {
    await openSettings(page);
    const picture = join(dataDir, 'my-logo.png');
    writeFileSync(picture, Buffer.from(PNG_BASE64, 'base64'));

    await page.getByRole('textbox', { name: 'Title on printed pages' }).fill('Kawa Rentals');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByText('Title saved.')).toBeVisible();

    await choosePicture(app, picture);
    await page.getByRole('button', { name: 'Choose logo…' }).click();
    await expect(page.getByText('Logo saved.')).toBeVisible();
    const preview = page.getByRole('figure');
    await expect(preview.getByText('Kawa Rentals')).toBeVisible();
    await expect(preview.locator('img')).toHaveAttribute('src', /^data:image\/png;base64,/);

    // The copy in the data folder is the same picture.
    expect(readFileSync(join(dataDir, 'logo', 'logo.png')).toString('base64')).toBe(PNG_BASE64);

    // The printed report page shows them too.
    await page.evaluate(() => {
      window.location.hash =
        '#/print/report?q=' +
        encodeURIComponent(
          JSON.stringify({
            year: new Date().getFullYear(),
            month: null,
            categoryId: null,
            currency: null,
            status: 'all',
            excludedIds: [],
            onlyIds: null,
          }),
        );
    });
    await expect(page.getByText('Kawa Rentals')).toBeVisible();
    await expect(page.locator('header img')).toHaveAttribute('src', /^data:image\/png/);

    await page.evaluate(() => {
      window.location.hash = '#/settings';
    });
    await page.getByRole('button', { name: 'Remove logo' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Remove logo' }).click();
    await expect(page.getByText('Logo removed.')).toBeVisible();
    await expect(page.getByRole('figure').locator('img')).toHaveCount(0);
  } finally {
    await app.close();
    removeDataDir(dataDir);
  }
});

test('a file that is not a picture is refused in plain words', async () => {
  const dataDir = createDataDir();
  const { app, page } = await launchUnlocked(dataDir);
  try {
    await openSettings(page);
    const notPicture = join(dataDir, 'notes.png');
    writeFileSync(notPicture, 'just some text');
    await choosePicture(app, notPicture);
    await page.getByRole('button', { name: 'Choose logo…' }).click();
    await expect(page.getByText('This file is not a PNG or JPG picture.')).toBeVisible();
    await expect(page.getByRole('figure').locator('img')).toHaveCount(0);
  } finally {
    await app.close();
    removeDataDir(dataDir);
  }
});

test('the activity log lists changes, newest first', async () => {
  const dataDir = createDataDir();
  const { app, page } = await launchUnlocked(dataDir);
  try {
    await page.evaluate(async () => {
      const category = await window.api.invoke('categories:create', { name: 'Shops', color: null });
      if (!category.ok || !category.data.ok) throw new Error('category failed');
      await window.api.invoke('categories:update', {
        id: category.data.id,
        name: 'Big shops',
        color: null,
      });
    });
    await openSettings(page);
    await page.getByRole('link', { name: 'Activity log' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Activity log');
    await expect(page.getByRole('main').getByRole('listitem')).toHaveText([
      /Category edited: Big shops/,
      /Category added: Big shops/,
    ]);
  } finally {
    await app.close();
    removeDataDir(dataDir);
  }
});
