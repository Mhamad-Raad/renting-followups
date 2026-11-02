import { expect, test, type Page } from '@playwright/test';
import en from '../../src/renderer/i18n/en.json' with { type: 'json' };
import { createDataDir, launchUnlocked, removeDataDir, reloadApp, setMainClock } from './launch';

const RENT = 100_000;

/** An area whose rent started in January last year, paid for `paidMonths` months. Returns its id. */
async function createArea(page: Page, name: string, paidMonths: number): Promise<number> {
  const year = new Date().getFullYear() - 1;
  return page.evaluate(
    async ({ name, year, paidMonths, rent }) => {
      await window.api.invoke('settings:update', { language: 'en' });
      const categories = await window.api.invoke('categories:list');
      let categoryId = categories.ok ? categories.data[0]?.id : undefined;
      if (categoryId === undefined) {
        const created = await window.api.invoke('categories:create', {
          name: 'Shops',
          color: null,
        });
        if (!created.ok || !created.data.ok) throw new Error('category failed');
        categoryId = created.data.id;
      }
      const area = await window.api.invoke('areas:create', {
        categoryId,
        name,
        currency: 'IQD',
        monthlyPrice: rent,
        rentStartsFrom: { year, month: 1 },
        renter: null,
        address: '',
        contractStart: null,
        notes: '',
      });
      if (!area.ok || !area.data.ok) throw new Error('area failed');
      if (paidMonths > 0) {
        await window.api.invoke('payments:create', {
          areaId: area.data.id,
          isBackfill: true,
          monthCount: paidMonths,
          from: { year, month: 1 },
          paidOn: `${year}-01-01`,
          note: '',
        });
      }
      return area.data.id;
    },
    { name, year, paidMonths, rent: RENT },
  );
}

test('Home shows this year per currency and the areas that need attention', async () => {
  const dataDir = createDataDir();
  const { app, page } = await launchUnlocked(dataDir);
  try {
    // Shop A has paid only last January: 11 months of last year are late, and more this year.
    await createArea(page, 'Shop A', 1);
    // Shop B has paid everything up to this month, so it does not need attention.
    const month = new Date().getMonth() + 1;
    await createArea(page, 'Shop B', 12 + month);
    await reloadApp(page);

    await expect(page.getByRole('heading', { name: en.home.attention })).toBeVisible();
    const rows = page.getByRole('list', { name: en.home.attention }).getByRole('listitem');
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toContainText('Shop A');
    await expect(rows.first()).toContainText(`Late months: ${11 + month - 1}`);
    await expect(page.getByRole('heading', { name: en.currency.IQD, level: 3 })).toBeVisible();
    await expect(page.getByText(en.home.lateAreas)).toBeVisible();

    // Record payment on the row opens that area with the payment form ready.
    await rows.first().getByRole('button', { name: en.area.recordPayment }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Shop A');
    await expect(page.getByRole('dialog').getByLabel(en.paymentDialog.monthCount)).toBeVisible();
  } finally {
    await app.close();
    removeDataDir(dataDir);
  }
});

test('Home with no areas invites adding the first one', async () => {
  const dataDir = createDataDir();
  const { app, page } = await launchUnlocked(dataDir);
  try {
    await page.evaluate(() => window.api.invoke('settings:update', { language: 'en' }));
    await reloadApp(page);
    await expect(page.getByRole('link', { name: en.areas.empty.button })).toBeVisible();
  } finally {
    await app.close();
    removeDataDir(dataDir);
  }
});

test('the area page filters by year and month, and warns before a price change', async () => {
  const dataDir = createDataDir();
  const { app, page } = await launchUnlocked(dataDir);
  try {
    const lastYear = new Date().getFullYear() - 1;
    await createArea(page, 'Shop C', 2);
    await reloadApp(page);
    await page.getByRole('link', { name: en.nav.areas }).click();
    await page.getByRole('link', { name: 'Shop C' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Shop C');

    // This year: the past record only paid last year, so no receipts are listed.
    await expect(page.getByText(en.receipts.none)).toBeVisible();
    await page.getByLabel(en.common.year, { exact: true }).selectOption(String(lastYear));
    await expect(page.getByText(en.receipts.pastRecord)).toBeVisible();
    await expect(page.getByText(en.area.figures.expected)).toBeVisible();
    await expect(page.getByRole('list', { name: new RegExp(String(lastYear)) })).toBeVisible();

    await page.getByLabel(en.common.month, { exact: true }).selectOption('3');
    await expect(page.getByText(en.area.figures.expectedMonth)).toBeVisible();
    await expect(page.getByText(en.receipts.none)).toBeVisible();

    // Raising the price from February last year: the paid February stays paid at the old rent.
    await page.getByRole('button', { name: en.area.changePrice }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel(en.common.year, { exact: true }).selectOption(String(lastYear));
    await dialog.getByLabel(en.common.month, { exact: true }).selectOption('2');
    await dialog.getByLabel(en.priceDialog.newRent).fill('150000');
    await dialog.getByRole('button', { name: en.common.save }).click();
    await expect(
      dialog.getByText(new RegExp(`stays paid at the old rent: month \\W*2/${lastYear}\\W*\\.`)),
    ).toBeVisible();
    await dialog.getByRole('button', { name: en.common.save }).click();
    await expect(page.getByText(en.priceDialog.priceSaved)).toBeVisible();
    const february = en.months.box
      .replace('{{month}}', '2')
      .replace('{{status}}', en.months.status.paid);
    // The box's label also says what a click does ("… Mark as paid").
    await expect(page.getByLabel(new RegExp(`^${february}\\.`))).toBeVisible();
  } finally {
    await app.close();
    removeDataDir(dataDir);
  }
});

test('if Home cannot load again when a month starts, its cards stay on screen', async () => {
  const dataDir = createDataDir();
  const { app, page } = await launchUnlocked(dataDir);
  try {
    await page.evaluate(async () => {
      await window.api.invoke('settings:update', { language: 'en' });
      const category = await window.api.invoke('categories:create', { name: 'Shops', color: null });
      if (!category.ok || !category.data.ok) throw new Error('category failed');
      await window.api.invoke('areas:create', {
        categoryId: category.data.id,
        name: 'Shop 1',
        currency: 'IQD',
        monthlyPrice: 250_000,
        rentStartsFrom: { year: 2026, month: 1 },
        renter: { fullName: 'Karwan', phone: '', startedOn: '2026-01-01' },
        address: '',
        contractStart: null,
        notes: '',
      });
    });
    const monthEnd = new Date(2026, 10, 30, 23, 59, 0).getTime();
    await setMainClock(app, monthEnd);
    await page.clock.install({ time: monthEnd });
    await reloadApp(page);
    const title = page.getByRole('heading', {
      name: en.home.cardsTitle.replace('{{year}}', '2026'),
    });
    await expect(title).toBeVisible();

    // Home's information cannot be read for a moment, just as December starts.
    await app.evaluate(({ ipcMain }) => {
      ipcMain.removeHandler('home:summary');
      ipcMain.handle('home:summary', () => ({ ok: false, error: 'unexpected' }));
    });
    await setMainClock(app, monthEnd + 120_000);
    await page.clock.fastForward(120_000);
    await page.clock.fastForward(1_000);
    await expect(page.getByRole('button', { name: en.common.tryAgain })).toHaveCount(0);
    await expect(title).toBeVisible();
  } finally {
    await app.close();
    removeDataDir(dataDir);
  }
});
