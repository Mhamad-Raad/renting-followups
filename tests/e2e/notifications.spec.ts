import { expect, test, type Page } from '@playwright/test';
import en from '../../src/renderer/i18n/en.json' with { type: 'json' };
import { mkdirSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { createDataDir, launchUnlocked, removeDataDir } from './launch';

/** One area that has paid nothing since January last year, and one that is vacant. */
async function seed(page: Page) {
  const lastYear = new Date().getFullYear() - 1;
  await page.evaluate(async (year) => {
    await window.api.invoke('settings:update', { language: 'en' });
    const category = await window.api.invoke('categories:create', { name: 'Shops', color: null });
    if (!category.ok || !category.data.ok) throw new Error('category failed');
    for (const [name, monthlyPrice] of [
      ['Shop late', 100_000],
      ['Shop vacant', 0],
    ] as const) {
      await window.api.invoke('areas:create', {
        categoryId: category.data.id,
        name,
        currency: 'IQD',
        monthlyPrice,
        rentStartsFrom: { year, month: 1 },
        renter: { fullName: 'Karwan Ahmed', phone: '0750 123 4567', startedOn: `${year}-01-01` },
        address: '',
        contractStart: null,
        notes: '',
      });
    }
  }, lastYear);
}

test('the popup on opening and the Notifications page show the same reminders', async () => {
  const dataDir = createDataDir();
  const { app, page } = await launchUnlocked(dataDir);
  try {
    await seed(page);
    // Open the app as the owner would, without the test helper that closes the popup.
    await page.reload();
    const popup = page.getByRole('dialog', { name: en.notifications.popupTitle });
    await expect(popup).toBeVisible();
    await expect(popup.getByText('Shop late')).toBeVisible();
    await expect(popup.getByText('Shop vacant')).toHaveCount(0);
    // No backup has been made yet this month.
    await expect(popup.getByText(en.notifications.backupDue)).toBeVisible();
    await popup.getByRole('button', { name: en.notifications.goTo }).click();
    await expect(popup).toBeHidden();

    await expect(page.getByRole('heading', { level: 1 })).toHaveText(en.pages.notifications.title);
    const late = page.getByRole('list', { name: en.notifications.late });
    await expect(late.getByRole('listitem')).toHaveCount(1);
    await expect(late).toContainText('Shop late');
    await expect(page.getByText('Shop vacant')).toHaveCount(0);
    await expect(page.getByText(en.notifications.backupDue)).toBeVisible();
    await expect(page.getByRole('navigation')).toContainText(
      en.notifications.count.replace('{{number}}', '2'),
    );
  } finally {
    await app.close();
    removeDataDir(dataDir);
  }
});

test('paying everything owed clears the bell at once', async () => {
  const dataDir = createDataDir();
  const { app, page } = await launchUnlocked(dataDir);
  try {
    await seed(page);
    await page.reload();
    await page.getByRole('dialog').getByRole('button', { name: en.common.ok }).click();
    // The late area and the monthly backup reminder.
    const bell = (count: number) =>
      page
        .getByRole('navigation')
        .getByText(en.notifications.count.replace('{{number}}', String(count)));
    await expect(bell(2)).toHaveCount(1);

    // Record payment from the Notifications page opens the area with the form ready.
    await page.getByRole('link', { name: new RegExp(`^${en.nav.notifications}`) }).click();
    await page.getByRole('button', { name: en.area.recordPayment }).first().click();
    const months = 12 + new Date().getMonth() + 1;
    await page
      .getByRole('dialog')
      .getByLabel(en.paymentDialog.amount)
      .fill(String(months * 100_000));
    await page
      .getByRole('dialog')
      .getByRole('button', { name: en.common.save, exact: true })
      .click();
    await expect(page.getByText(/Payment saved/)).toBeVisible();
    await expect(bell(1)).toHaveCount(1);
  } finally {
    await app.close();
    removeDataDir(dataDir);
  }
});

test('Back up now in the popup makes a backup and the reminder goes away', async () => {
  const dataDir = createDataDir();
  const { app, page } = await launchUnlocked(dataDir);
  try {
    await seed(page);
    const folder = join(dataDir, 'usb');
    mkdirSync(folder);
    // The first backup asks for a folder: answer as the owner would.
    await app.evaluate(({ dialog }, chosen) => {
      dialog.showOpenDialog = (() =>
        Promise.resolve({ canceled: false, filePaths: [chosen] })) as typeof dialog.showOpenDialog;
    }, folder);
    await page.reload();
    const popup = page.getByRole('dialog', { name: en.notifications.popupTitle });
    await popup.getByRole('button', { name: en.backup.now }).click();
    await expect(popup.getByText(/Backup saved: rent-backup-\d{4}-\d{2}-\d{2}\.db/)).toBeVisible();
    expect(readdirSync(folder)).toEqual([expect.stringMatching(/^rent-backup-.*\.db$/)]);
    await expect(
      page.getByRole('navigation').getByText(en.notifications.count.replace('{{number}}', '1')),
    ).toHaveCount(1);
  } finally {
    await app.close();
    removeDataDir(dataDir);
  }
});

test('with nothing to report there is no popup and the page says so', async () => {
  const dataDir = createDataDir();
  const { app, page } = await launchUnlocked(dataDir);
  try {
    await page.evaluate(() => window.api.invoke('settings:update', { language: 'en' }));
    await page.reload();
    await page.getByRole('link', { name: new RegExp(`^${en.nav.notifications}`) }).click();
    await expect(page.getByText(en.notifications.none)).toBeVisible();
    await expect(page.getByRole('dialog')).toBeHidden();
  } finally {
    await app.close();
    removeDataDir(dataDir);
  }
});
