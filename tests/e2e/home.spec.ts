import { expect, test, type Page } from '@playwright/test';
import en from '../../src/renderer/i18n/en.json' with { type: 'json' };
import { createDataDir, launchUnlocked, removeDataDir } from './launch';

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
          amount: rent * paidMonths,
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
    await page.reload();

    await expect(page.getByRole('heading', { name: en.home.attention })).toBeVisible();
    const rows = page.getByRole('list', { name: en.home.attention }).getByRole('listitem');
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toContainText('Shop A');
    await expect(rows.first()).toContainText(`Late months: ${11 + month - 1}`);
    await expect(page.getByText(`${en.home.lateAreas} · IQD`)).toBeVisible();

    // Record payment on the row opens that area with the payment form ready.
    await rows.first().getByRole('button', { name: en.area.recordPayment }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Shop A');
    await expect(page.getByRole('dialog').getByLabel(en.paymentDialog.amount)).toBeFocused();
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
    await page.reload();
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
    await page.reload();
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

    // Raising the price from January last year would turn the two paid months late.
    await page.getByRole('button', { name: en.area.changePrice }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel(en.common.year, { exact: true }).selectOption(String(lastYear));
    await dialog.getByLabel(en.common.month, { exact: true }).selectOption('2');
    await dialog.getByLabel(en.priceDialog.newRent).fill('150000');
    await dialog.getByRole('button', { name: en.common.save }).click();
    await expect(dialog.getByText(en.priceDialog.warning)).toBeVisible();
    await expect(dialog.getByText(`Month 2/${lastYear}: Paid → Late`)).toBeVisible();
    await dialog.getByRole('button', { name: en.priceDialog.saveAnyway }).click();
    await expect(page.getByText(en.priceDialog.priceSaved)).toBeVisible();
  } finally {
    await app.close();
    removeDataDir(dataDir);
  }
});
