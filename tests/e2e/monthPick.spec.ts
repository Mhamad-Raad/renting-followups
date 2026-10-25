import { expect, test, type Page } from '@playwright/test';
import en from '../../src/renderer/i18n/en.json' with { type: 'json' };
import { createDataDir, launchUnlocked, reloadApp, removeDataDir } from './launch';

/** One area renting from January this year, in English; returns its id. */
async function seed(page: Page): Promise<number> {
  const year = new Date().getFullYear();
  const id = await page.evaluate(async (from) => {
    await window.api.invoke('settings:update', { language: 'en' });
    const category = await window.api.invoke('categories:create', { name: 'Shops', color: null });
    if (!category.ok || !category.data.ok) throw new Error('category failed');
    const area = await window.api.invoke('areas:create', {
      categoryId: category.data.id,
      name: 'Shop 1',
      currency: 'IQD',
      monthlyPrice: 100_000,
      rentStartsFrom: { year: from, month: 1 },
      renter: { fullName: 'Karwan Ahmed', phone: '', startedOn: `${from}-01-01` },
      address: '',
      contractStart: null,
      notes: '',
    });
    if (!area.ok || !area.data.ok) throw new Error('area failed');
    return area.data.id;
  }, year);
  await reloadApp(page);
  return id;
}

const monthButton = (page: Page, status: string) =>
  page.getByRole('button', { name: new RegExp(`^Month 1: ${status}\\.`) });

test('a click on a month box asks first, then marks it paid or not paid', async () => {
  const dataDir = createDataDir();
  const { app, page } = await launchUnlocked(dataDir);
  try {
    const id = await seed(page);
    await page.goto(page.url().replace(/#.*/, '') + `#/areas/${id}`);
    await page.getByRole('heading', { level: 1, name: 'Shop 1' }).waitFor();

    // Cancel changes nothing.
    await monthButton(page, en.months.status.late).click();
    const question = page.getByRole('dialog');
    await expect(question).toContainText('100,000 IQD');
    await question.getByRole('button', { name: en.common.cancel }).click();
    await expect(monthButton(page, en.months.status.late)).toBeVisible();

    await monthButton(page, en.months.status.late).click();
    await question.getByRole('button', { name: en.monthPick.payButton }).click();
    await expect(page.getByText('Month 1 is paid. Receipt No. 0001')).toBeVisible();
    await expect(monthButton(page, en.months.status.paid)).toBeVisible();
    await expect(page.getByRole('button', { name: en.receipts.undo })).toBeVisible();

    await monthButton(page, en.months.status.paid).click();
    await expect(question).toContainText('Receipt No. 0001 is cancelled');
    await expect(question).toContainText(en.monthPick.noUndo);
    // The keyboard starts on Cancel, as this can cancel receipts.
    await expect(question.getByRole('button', { name: en.common.cancel })).toBeFocused();
    await question.getByRole('button', { name: en.monthPick.takeOutButton }).click();
    await expect(page.getByText('Month 1 is marked as not paid.')).toBeVisible();
    await expect(monthButton(page, en.months.status.late)).toBeVisible();
    // No direct Print button on the area page; PDF and Excel stay.
    await expect(
      page.getByRole('button', { name: en.print.actions.print, exact: true }),
    ).toHaveCount(0);
    await expect(page.getByRole('button', { name: en.print.actions.pdf })).toBeVisible();

    // In the Areas list a click on a box asks, and does not open the area.
    await page.getByRole('navigation').getByRole('link', { name: en.nav.areas }).click();
    await monthButton(page, en.months.status.late).click();
    await page.getByRole('dialog').getByRole('button', { name: en.monthPick.payButton }).click();
    await expect(page.getByText('Month 1 is paid. Receipt No. 0002')).toBeVisible();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(en.pages.areas.title);
    await expect(monthButton(page, en.months.status.paid)).toBeVisible();
  } finally {
    await app.close();
    removeDataDir(dataDir);
  }
});
