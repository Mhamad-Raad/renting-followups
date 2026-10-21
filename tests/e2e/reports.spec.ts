import { expect, test, type Page } from '@playwright/test';
import en from '../../src/renderer/i18n/en.json' with { type: 'json' };
import { createDataDir, launchUnlocked, removeDataDir } from './launch';

/** Two shops in dinars (one paid up to this month, one never paid) and an office in dollars. */
async function seed(page: Page) {
  const month = new Date().getMonth() + 1;
  const year = new Date().getFullYear();
  await page.evaluate(
    async ({ month, year }) => {
      await window.api.invoke('settings:update', { language: 'en' });
      const ids: number[] = [];
      for (const name of ['Shops', 'Offices']) {
        const created = await window.api.invoke('categories:create', { name, color: null });
        if (!created.ok || !created.data.ok) throw new Error('category failed');
        ids.push(created.data.id);
      }
      const areas = [
        ['Shop paid', ids[0], 'IQD', 100_000, month],
        ['Shop late', ids[0], 'IQD', 200_000, 0],
        ['Office dollars', ids[1], 'USD', 50_00, 0],
      ] as const;
      for (const [name, categoryId, currency, monthlyPrice, paidMonths] of areas) {
        const area = await window.api.invoke('areas:create', {
          categoryId: categoryId ?? 0,
          name,
          currency,
          monthlyPrice,
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
            amount: monthlyPrice * paidMonths,
            from: { year, month: 1 },
            paidOn: `${year}-01-01`,
            note: '',
          });
        }
      }
    },
    { month, year },
  );
  await page.reload();
  await page.getByRole('link', { name: en.nav.reports }).click();
}

const rows = (page: Page) => page.locator('tbody tr');
/** "Total IQD (2 areas)" for a currency and a number of areas. */
const total = (currency: string, areas: number) =>
  en.reports.total.replace('{{currency}}', currency).replace('{{number}}', String(areas));

test('the report lists every area with totals per currency, and filters by status', async () => {
  const dataDir = createDataDir();
  const { app, page } = await launchUnlocked(dataDir);
  try {
    await seed(page);
    await expect(rows(page)).toHaveCount(3);
    await expect(page.locator('tfoot tr')).toHaveCount(2);
    await expect(page.locator('tfoot')).toContainText(total('IQD', 2));
    await expect(page.locator('tfoot')).toContainText(total('USD', 1));

    await page.getByLabel(en.reports.status).selectOption('late');
    await expect(rows(page)).toHaveCount(2);
    await page.getByLabel(en.reports.status).selectOption('paid');
    await expect(rows(page)).toHaveCount(1);
    await expect(rows(page).first()).toContainText('Shop paid');

    await page.getByLabel(en.reports.status).selectOption('all');
    await page.getByLabel(en.area.currency).selectOption('USD');
    await expect(rows(page)).toHaveCount(1);
    await expect(page.locator('tfoot tr')).toHaveCount(1);
  } finally {
    await app.close();
    removeDataDir(dataDir);
  }
});

test('filters except the year are remembered; the area picker leaves areas out', async () => {
  const dataDir = createDataDir();
  let launched = await launchUnlocked(dataDir);
  try {
    await seed(launched.page);
    const { page } = launched;
    await page.getByLabel(en.area.category).selectOption({ label: 'Shops' });
    await expect(rows(page)).toHaveCount(2);

    await page.getByText(/Areas to include/).click();
    await page.getByRole('checkbox', { name: 'Shop late' }).uncheck();
    await expect(rows(page)).toHaveCount(1);
    await page.getByRole('button', { name: en.reports.picker.none }).click();
    await expect(page.getByText(en.reports.empty)).toBeVisible();
    await page.getByRole('button', { name: en.reports.picker.all }).click();
    await expect(rows(page)).toHaveCount(2);

    await launched.app.close();
    launched = await launchUnlocked(dataDir);
    await launched.page.getByRole('link', { name: en.nav.reports }).click();
    await expect(launched.page.getByLabel(en.area.category)).toHaveValue(/\d+/);
    await expect(rows(launched.page)).toHaveCount(2);
  } finally {
    await launched.app.close();
    removeDataDir(dataDir);
  }
});
