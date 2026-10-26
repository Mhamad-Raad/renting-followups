import { expect, test, type Page } from '@playwright/test';
import { phoneForDisplay } from '../../src/shared/digits';
import en from '../../src/renderer/i18n/en.json' with { type: 'json' };
import {
  createDataDir,
  launchUnlocked,
  removeDataDir,
  type LaunchedApp,
  reloadApp,
} from './launch';

/** Starts unlocked, in English (so the test reads like the screens), on the Areas page. */
async function openAreas(dataDir: string): Promise<LaunchedApp> {
  const launched = await launchUnlocked(dataDir);
  await launched.page.evaluate(() => window.api.invoke('settings:update', { language: 'en' }));
  await reloadApp(launched.page);
  await launched.page.getByRole('link', { name: en.nav.areas }).click();
  return launched;
}

async function createAreasThroughIpc(page: Page, names: string[], categoryName = 'Shops') {
  await page.evaluate(
    async ([list, category]) => {
      const created = await window.api.invoke('categories:create', { name: category, color: null });
      if (!created.ok || !created.data.ok) throw new Error('category failed');
      for (const [index, name] of list.entries()) {
        await window.api.invoke('areas:create', {
          categoryId: created.data.id,
          name,
          currency: 'IQD',
          monthlyPrice: 250_000 + index,
          rentStartsFrom: { year: 2026, month: 1 },
          renter: { fullName: `Renter ${index}`, phone: `0750 ${index}`, startedOn: '2026-01-01' },
          address: '',
          contractStart: null,
          notes: '',
        });
      }
    },
    [names, categoryName] as const,
  );
}

test('the first area is added from the empty screen and shows on the list', async () => {
  const dataDir = createDataDir();
  const { app, page } = await openAreas(dataDir);
  try {
    await expect(page.getByRole('heading', { name: en.areas.empty.title })).toBeVisible();
    await page.getByRole('link', { name: en.areas.empty.button }).click();

    await page.getByLabel(en.areaForm.name).fill('Shop 12');
    await page.getByLabel(en.areaForm.category).selectOption('new');
    await page.getByLabel(en.areaForm.newCategoryName).fill('Shops');
    await page.getByLabel(en.areaForm.monthlyRent).pressSequentially('1250000');
    await expect(page.getByLabel(en.areaForm.monthlyRent)).toHaveValue('1,250,000');
    await page.getByLabel(en.areaForm.renterName).fill('Karwan Ahmed');
    await page.getByLabel(en.areaForm.renterPhone).fill('0750 123 4567');
    await page.getByRole('button', { name: en.areaForm.save }).click();

    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Shop 12');
    await expect(page.getByText(en.areaForm.saved)).toBeVisible();
    await expect(page.getByText('1,250,000 IQD').first()).toBeVisible();

    await page.getByRole('link', { name: en.area.back }).click();
    const rows = page.getByRole('row');
    await expect(rows).toHaveCount(2);
    await expect(rows.nth(1)).toContainText('Karwan Ahmed');
  } finally {
    await app.close();
    removeDataDir(dataDir);
  }
});

test('areas without a name are shown by their category, and two may share one', async () => {
  const dataDir = createDataDir();
  const { app, page } = await openAreas(dataDir);
  try {
    await createAreasThroughIpc(page, ['', '']);
    await reloadApp(page);
    await page.getByRole('link', { name: en.nav.areas }).click();
    const rows = page.getByRole('row');
    await expect(rows).toHaveCount(3);
    await expect(page.getByRole('link', { name: 'Shops' })).toHaveCount(2);
    // Each row keeps its renter beside the category, so the two places stay apart.
    await expect(
      page.getByRole('row', { name: /Renter 0/ }).getByRole('link', { name: 'Shops' }),
    ).toBeVisible();

    await page.getByRole('link', { name: en.areas.add }).click();
    await expect(page.getByText(en.areaForm.nameHint)).toBeVisible();
    await page.getByLabel(en.areaForm.category).selectOption({ label: 'Shops' });
    await page.getByLabel(en.areaForm.monthlyRent).fill('100000');
    await page.getByLabel(en.areaForm.renterName).fill('Kazim');
    await page.getByRole('button', { name: en.areaForm.save }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Shops');
  } finally {
    await app.close();
    removeDataDir(dataDir);
  }
});

test('the form explains missing information and duplicate names in plain words', async () => {
  const dataDir = createDataDir();
  const { app, page } = await openAreas(dataDir);
  try {
    await createAreasThroughIpc(page, ['Shop 1']);
    await page.getByRole('link', { name: en.areas.add }).click();
    await page.getByRole('button', { name: en.areaForm.save }).click();
    await expect(page.getByText(en.areaForm.problems.chooseCategory)).toBeVisible();
    await expect(page.getByText(en.areaForm.problems.rentRequired)).toBeVisible();

    await page.getByLabel(en.areaForm.name).fill('shop 1');
    await page.getByLabel(en.areaForm.category).selectOption({ label: 'Shops' });
    await page.getByLabel(en.areaForm.monthlyRent).fill('100000');
    await page.getByRole('button', { name: en.areaForm.save }).click();
    await expect(page.getByText(en.areaForm.problems.duplicate_name)).toBeVisible();
  } finally {
    await app.close();
    removeDataDir(dataDir);
  }
});

test('price changes, vacant and renter changes are kept as history', async () => {
  const dataDir = createDataDir();
  const { app, page } = await openAreas(dataDir);
  try {
    await createAreasThroughIpc(page, ['Shop 1']);
    await reloadApp(page);
    await page.getByRole('link', { name: 'Shop 1' }).click();

    await page.getByRole('button', { name: en.area.changePrice }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByLabel(en.priceDialog.newRent)).toBeFocused();
    await dialog.getByLabel(en.common.year, { exact: true }).selectOption('2026');
    await dialog.getByLabel(en.common.month, { exact: true }).selectOption('3');
    await dialog.getByLabel(en.priceDialog.newRent).fill('300000');
    await dialog.getByRole('button', { name: en.common.save }).click();
    await expect(page.getByText(en.priceDialog.priceSaved)).toBeVisible();
    await expect(page.getByText('From 3/2026')).toBeVisible();
    await expect(page.getByText('From 1/2026')).toBeVisible();

    await page.getByRole('button', { name: en.area.markVacant }).click();
    await page.getByRole('dialog').getByRole('button', { name: en.common.save }).click();
    await expect(page.getByText(en.priceDialog.vacantSaved)).toBeVisible();
    await expect(page.getByRole('button', { name: en.area.setRentAgain })).toBeVisible();

    await page.getByRole('button', { name: en.area.changeRenter }).click();
    await page.getByRole('dialog').getByLabel(en.renterDialog.name).fill('Sara Ali');
    await page.getByRole('dialog').getByRole('button', { name: en.common.save }).click();
    await expect(page.getByText(en.renterDialog.saved)).toBeVisible();
    await expect(page.getByText('Sara Ali').first()).toBeVisible();
    await expect(page.getByText('Renter 0')).toBeVisible();

    await page.getByRole('link', { name: en.area.back }).click();
    await expect(page.getByRole('row').nth(1)).toContainText(en.areas.vacant);
    await expect(page.getByRole('row').nth(1)).toContainText('Sara Ali');
  } finally {
    await app.close();
    removeDataDir(dataDir);
  }
});

test('a deleted area can be restored from Settings', async () => {
  const dataDir = createDataDir();
  const { app, page } = await openAreas(dataDir);
  try {
    await createAreasThroughIpc(page, ['Shop 1']);
    await reloadApp(page);
    await page.getByRole('link', { name: 'Shop 1' }).click();
    await page.getByRole('button', { name: en.common.delete }).click();
    await page.getByRole('dialog').getByRole('button', { name: en.common.delete }).click();
    await expect(page.getByText(en.areas.deleted)).toBeVisible();

    await page.getByRole('link', { name: en.nav.settings }).click();
    await page.getByRole('link', { name: en.deletedItems.open }).click();
    await page.getByRole('button', { name: en.common.restore }).click();
    await expect(page.getByText(en.deletedItems.restored)).toBeVisible();
    await expect(page.getByText(en.deletedItems.empty)).toBeVisible();

    await page.getByRole('link', { name: en.nav.areas }).click();
    await expect(page.getByRole('link', { name: 'Shop 1' })).toBeVisible();
  } finally {
    await app.close();
    removeDataDir(dataDir);
  }
});

test('200 areas open in under a second and Sorani search works across letter variants', async () => {
  const dataDir = createDataDir();
  const { app, page } = await openAreas(dataDir);
  try {
    const names = Array.from({ length: 199 }, (_, index) => `Area ${index + 1}`);
    await createAreasThroughIpc(page, [...names, 'خانووی کەریم']);
    await page.getByRole('link', { name: en.nav.home }).click();

    const started = Date.now();
    await page.getByRole('link', { name: en.nav.areas }).click();
    await expect(page.getByRole('row')).toHaveCount(201);
    expect(Date.now() - started).toBeLessThan(1000);

    // Arabic yeh, kaf and heh typed instead of the Kurdish letters still find the area.
    await page.getByRole('searchbox').fill('خانووي كهريم');
    await expect(page.getByRole('row')).toHaveCount(2);
    await expect(page.getByRole('row').nth(1)).toContainText('خانووی کەریم');
  } finally {
    await app.close();
    removeDataDir(dataDir);
  }
});

test('phone numbers follow the chosen digit style', async () => {
  const dataDir = createDataDir();
  const { app, page } = await openAreas(dataDir);
  try {
    await createAreasThroughIpc(page, ['Shop 1']);
    await page.evaluate(() => window.api.invoke('settings:update', { digitStyle: 'arabic' }));
    await reloadApp(page);
    await expect(page.getByRole('row').nth(1)).toContainText(phoneForDisplay('0750 0', 'arabic'));
    await page.getByRole('link', { name: 'Shop 1' }).click();
    await expect(page.getByText(phoneForDisplay('0750 0', 'arabic')).first()).toBeVisible();
  } finally {
    await app.close();
    removeDataDir(dataDir);
  }
});

test('the list and the area page show this year in month colours', async () => {
  const dataDir = createDataDir();
  const { app, page } = await openAreas(dataDir);
  try {
    // Rent starts this month, so the earlier months are "not started" and this one is due.
    const today = new Date();
    const month = today.getMonth() + 1;
    await page.evaluate(
      async (start) => {
        const created = await window.api.invoke('categories:create', {
          name: 'Shops',
          color: null,
        });
        if (!created.ok || !created.data.ok) throw new Error('category failed');
        await window.api.invoke('areas:create', {
          categoryId: created.data.id,
          name: 'Shop 7',
          currency: 'IQD',
          monthlyPrice: 250_000,
          rentStartsFrom: start,
          renter: null,
          address: '',
          contractStart: null,
          notes: '',
        });
      },
      { year: today.getFullYear(), month },
    );
    await reloadApp(page);

    const boxLabel = (number: number, status: string) =>
      en.months.box.replace('{{month}}', String(number)).replace('{{status}}', status);
    const strip = page.getByRole('list', { name: new RegExp(String(today.getFullYear())) });
    await expect(strip.getByRole('listitem')).toHaveCount(12);
    await expect(strip.getByLabel(boxLabel(month, en.months.status.due))).toBeVisible();
    await expect(page.getByRole('row').nth(1)).toContainText(en.months.summary.due);

    await page.getByRole('link', { name: 'Shop 7' }).click();
    const boxes = page.getByRole('list', { name: new RegExp(String(today.getFullYear())) });
    await expect(boxes.getByRole('listitem')).toHaveCount(12);
    await expect(boxes.getByLabel(boxLabel(month, en.months.status.due))).toBeVisible();
    if (month > 1) {
      await expect(boxes.getByLabel(boxLabel(1, en.months.status.notStarted))).toBeVisible();
    }

    // Marking it vacant from this month turns the month grey and "Vacant" at once.
    await page.getByRole('button', { name: en.area.markVacant }).click();
    await page.getByRole('dialog').getByRole('button', { name: en.common.save }).click();
    await expect(boxes.getByLabel(boxLabel(month, en.months.status.vacant))).toBeVisible();
  } finally {
    await app.close();
    removeDataDir(dataDir);
  }
});

test('ticked areas hidden by a search are not printed or counted', async () => {
  const dataDir = createDataDir();
  const { app, page } = await openAreas(dataDir);
  try {
    await createAreasThroughIpc(page, ['Shop 1', 'Shop 2']);
    await reloadApp(page);
    await page.getByRole('checkbox', { name: 'Select Shop 1' }).check();
    await expect(page.getByText(en.print.selectedCount.replace('{{number}}', '1'))).toBeVisible();
    await page.getByLabel(en.areas.search).fill('Shop 2');
    await expect(page.getByRole('row')).toHaveCount(2);
    await expect(page.getByRole('button', { name: en.print.actions.printSelected })).toHaveCount(0);
    await page.getByLabel(en.areas.search).fill('');
    await expect(page.getByRole('button', { name: en.print.actions.printSelected })).toBeVisible();
  } finally {
    await app.close();
    removeDataDir(dataDir);
  }
});
