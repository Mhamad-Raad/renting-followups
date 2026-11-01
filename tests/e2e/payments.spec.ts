import { expect, test, type Page } from '@playwright/test';
import en from '../../src/renderer/i18n/en.json' with { type: 'json' };
import { createDataDir, launchUnlocked, removeDataDir, reloadApp } from './launch';

const RENT = 250_000;

/** One area whose rent starts this month, opened on its page, in English. */
async function openNewArea(page: Page) {
  const today = new Date();
  await page.evaluate(
    async ({ start, rent }) => {
      await window.api.invoke('settings:update', { language: 'en' });
      const category = await window.api.invoke('categories:create', { name: 'Shops', color: null });
      if (!category.ok || !category.data.ok) throw new Error('category failed');
      await window.api.invoke('areas:create', {
        categoryId: category.data.id,
        name: 'Shop 9',
        currency: 'IQD',
        monthlyPrice: rent,
        rentStartsFrom: start,
        renter: { fullName: 'Karwan Ahmed', phone: '0750 123 4567', startedOn: '2026-01-01' },
        address: '',
        contractStart: null,
        notes: '',
      });
    },
    { start: { year: today.getFullYear(), month: today.getMonth() + 1 }, rent: RENT },
  );
  await reloadApp(page);
  await page.getByRole('link', { name: en.nav.areas }).click();
  await page.getByRole('link', { name: 'Shop 9' }).click();
  return { year: today.getFullYear(), month: today.getMonth() + 1 };
}

const boxLabel = (month: number, status: string) =>
  en.months.box.replace('{{month}}', String(month)).replace('{{status}}', status);
const previewMonth = (month: number, year: number, amount: string) =>
  en.paymentDialog.previewMonth
    .replace('{{month}}', `${month}/${year}`)
    .replace('{{amount}}', amount);
const nextMonth = (year: number, month: number) =>
  month === 12 ? { year: year + 1, month: 1 } : { year, month: month + 1 };

test('record two whole months, see the preview and colours, then cancel it', async () => {
  const dataDir = createDataDir();
  const { app, page } = await launchUnlocked(dataDir);
  try {
    const { year, month } = await openNewArea(page);
    await page.getByRole('button', { name: en.area.recordPayment }).click();
    const dialog = page.getByRole('dialog');
    // One month to start with; the amount is worked out, never typed.
    await expect(dialog.getByLabel(en.paymentDialog.monthCount)).toHaveValue('1');
    await expect(dialog.getByRole('button', { name: en.paymentDialog.fewer })).toBeDisabled();
    await dialog.getByRole('button', { name: en.paymentDialog.more }).click();
    await expect(dialog.getByLabel(en.paymentDialog.monthCount)).toHaveValue('2');

    // This month and the next, each with its whole rent.
    const next = nextMonth(year, month);
    await expect(dialog.getByText(previewMonth(month, year, '250,000'))).toBeVisible();
    await expect(dialog.getByText(previewMonth(next.month, next.year, '250,000'))).toBeVisible();
    await expect(dialog.getByText('Amount received: 500,000 IQD')).toBeVisible();

    await dialog.getByRole('button', { name: en.common.save, exact: true }).click();
    await expect(page.getByText('Payment saved. Receipt No. 0001')).toBeVisible();
    const boxes = page.getByRole('list', { name: new RegExp(`${year}`) });
    await expect(boxes.getByLabel(boxLabel(month, en.months.status.paid))).toBeVisible();
    await expect(page.getByText('Receipt No. 0001', { exact: true })).toBeVisible();

    // No Undo in the message; a wrong payment is cancelled from the receipt list.
    await expect(page.getByRole('button', { name: 'Undo' })).toHaveCount(0);
    await page.getByRole('button', { name: en.receipts.cancel }).click();
    await page.getByRole('dialog').getByRole('button', { name: en.receipts.cancel }).click();
    await expect(page.getByText(en.receipts.cancelledLabel, { exact: true })).toBeVisible();
    await expect(boxes.getByLabel(boxLabel(month, en.months.status.due))).toBeVisible();

    // The next payment gets a new number: 0001 is never reused.
    await page.getByRole('button', { name: en.area.recordPayment }).click();
    await expect(page.getByRole('dialog').getByText('Amount received: 250,000 IQD')).toBeVisible();
    await page
      .getByRole('dialog')
      .getByRole('button', { name: en.common.save, exact: true })
      .click();
    await expect(page.getByText('Payment saved. Receipt No. 0002')).toBeVisible();
  } finally {
    await app.close();
    removeDataDir(dataDir);
  }
});

test('marking a paid area vacant lists the payments and takes them out in one step', async () => {
  const dataDir = createDataDir();
  const { app, page } = await launchUnlocked(dataDir);
  try {
    const { year, month } = await openNewArea(page);
    await page.getByRole('button', { name: en.area.recordPayment }).click();
    await page.getByRole('dialog').getByRole('button', { name: en.paymentDialog.more }).click();
    await expect(page.getByRole('dialog').getByText('Amount received: 500,000 IQD')).toBeVisible();
    await page
      .getByRole('dialog')
      .getByRole('button', { name: en.common.save, exact: true })
      .click();
    await expect(page.getByText('Payment saved. Receipt No. 0001')).toBeVisible();

    await page.getByRole('button', { name: en.area.markVacant }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('button', { name: en.common.save }).click();
    await expect(dialog.getByText(en.priceDialog.vacantPaid)).toBeVisible();
    await expect(dialog.getByText(/Receipt No\. 0001 is cancelled \(500,000 IQD\)/)).toBeVisible();

    await dialog.getByRole('button', { name: en.priceDialog.takeOutAndSave }).click();
    await expect(page.getByText(en.priceDialog.vacantSaved)).toBeVisible();
    const boxes = page.getByRole('list', { name: new RegExp(`${year}`) });
    await expect(boxes.getByLabel(boxLabel(month, en.months.status.vacant))).toBeVisible();
    await expect(page.getByText(en.receipts.cancelledLabel, { exact: true })).toBeVisible();
  } finally {
    await app.close();
    removeDataDir(dataDir);
  }
});

test('a new renter can pay another rent in another currency from their first month', async () => {
  const dataDir = createDataDir();
  const { app, page } = await launchUnlocked(dataDir);
  try {
    const { year, month } = await openNewArea(page);
    await page.getByRole('button', { name: en.area.changeRenter }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel(en.renterDialog.name).fill('Ahmed Ali');
    // The same rent is ticked; unticking it shows the currency and the rent.
    await dialog.getByRole('checkbox', { name: /250,000 IQD/ }).uncheck();
    await dialog.getByRole('radio', { name: 'USD' }).check();
    await dialog.getByLabel(en.renterDialog.rent).fill('300');
    await dialog.getByRole('button', { name: en.common.save }).click();
    await expect(page.getByText(en.renterDialog.saved)).toBeVisible();
    await expect(page.getByText(`From ${month}/${year}`)).toBeVisible();

    // New money for this month is asked and saved in dollars.
    await page.getByRole('button', { name: en.area.recordPayment }).click();
    await expect(page.getByRole('dialog').getByText('Amount received: 300.00 USD')).toBeVisible();
    await page
      .getByRole('dialog')
      .getByRole('button', { name: en.common.save, exact: true })
      .click();
    await expect(page.getByText('Payment saved. Receipt No. 0001')).toBeVisible();
    const boxes = page.getByRole('list', { name: new RegExp(`${year}`) });
    await expect(boxes.getByLabel(boxLabel(month, en.months.status.paid))).toBeVisible();
  } finally {
    await app.close();
    removeDataDir(dataDir);
  }
});

test('change price empties the rent when the month is in another currency', async () => {
  const dataDir = createDataDir();
  const { app, page } = await launchUnlocked(dataDir);
  try {
    const { year, month } = await openNewArea(page);
    // Dollars from next month, dinars before.
    const next = month === 12 ? { year: year + 1, month: 1 } : { year, month: month + 1 };
    await page.evaluate(
      async ({ from }) => {
        const areas = await window.api.invoke('areas:list', { search: '', categoryId: null });
        const areaId = areas.ok ? (areas.data[0]?.id ?? 0) : 0;
        await window.api.invoke('areas:changePrice', {
          areaId,
          from,
          monthlyPrice: 300_00,
          currency: 'USD',
        });
      },
      { from: next },
    );
    await reloadApp(page);
    await page.getByRole('button', { name: en.area.changePrice }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel(en.common.year, { exact: true }).selectOption(String(next.year));
    await dialog.getByLabel(en.common.month, { exact: true }).selectOption(String(next.month));
    await dialog.getByLabel(en.priceDialog.newRent).fill('500');
    await expect(dialog.getByText('USD', { exact: true })).toBeVisible();
    await dialog.getByLabel(en.common.year, { exact: true }).selectOption(String(year));
    await dialog.getByLabel(en.common.month, { exact: true }).selectOption(String(month));
    await expect(dialog.getByLabel(en.priceDialog.newRent)).toHaveValue('');
    await expect(dialog.getByText('IQD', { exact: true })).toBeVisible();
  } finally {
    await app.close();
    removeDataDir(dataDir);
  }
});

test('a renter who starts before the rent saves with only the renter', async () => {
  const dataDir = createDataDir();
  const { app, page } = await launchUnlocked(dataDir);
  try {
    const { year, month } = await openNewArea(page);
    await page.getByRole('button', { name: en.area.changeRenter }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel(en.renterDialog.name).fill('Ahmed Ali');
    // An emptied rent, then a start before the rent starts: the rent part goes away.
    await dialog.getByRole('checkbox').uncheck();
    await dialog.getByLabel(en.renterDialog.rent).fill('');
    const before = month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 };
    await dialog.getByLabel(en.common.year, { exact: true }).selectOption(String(before.year));
    await dialog.getByLabel(en.common.month, { exact: true }).selectOption(String(before.month));
    await expect(dialog.getByLabel(en.renterDialog.rent)).toHaveCount(0);
    await dialog.getByRole('button', { name: en.common.save }).click();
    await expect(page.getByText(en.renterDialog.saved)).toBeVisible();
  } finally {
    await app.close();
    removeDataDir(dataDir);
  }
});

test('edit and cancel a receipt, record a past payment, and refuse too much', async () => {
  const dataDir = createDataDir();
  const { app, page } = await launchUnlocked(dataDir);
  try {
    const { year, month } = await openNewArea(page);
    const boxes = page.getByRole('list', { name: new RegExp(`${year}`) });
    const dialog = page.getByRole('dialog');

    await page.getByRole('button', { name: en.area.recordPayment }).click();
    await dialog.getByRole('button', { name: en.paymentDialog.more }).click();
    await expect(dialog.getByText('Amount received: 500,000 IQD')).toBeVisible();
    await dialog.getByRole('button', { name: en.common.save, exact: true }).click();
    await expect(page.getByText('Payment saved. Receipt No. 0001')).toBeVisible();

    // The edit starts with the receipt's two months; one fewer pays only this month.
    await page.getByRole('button', { name: en.common.edit, exact: true }).last().click();
    await expect(dialog.getByRole('heading', { level: 2 })).toHaveText('Edit receipt No. 0001');
    await expect(dialog.getByLabel(en.paymentDialog.monthCount)).toHaveValue('2');
    await dialog.getByRole('button', { name: en.paymentDialog.fewer }).click();
    await expect(dialog.getByText('Amount received: 250,000 IQD')).toBeVisible();
    await dialog.getByRole('button', { name: en.common.save, exact: true }).click();
    await expect(page.getByText(en.paymentDialog.updated)).toBeVisible();
    await expect(boxes.getByLabel(boxLabel(month, en.months.status.paid))).toBeVisible();

    await page.getByRole('button', { name: en.receipts.cancel }).click();
    await dialog.getByRole('button', { name: en.receipts.cancel }).click();
    await expect(page.getByText(en.receipts.cancelDone)).toBeVisible();
    await expect(boxes.getByLabel(boxLabel(month, en.months.status.due))).toBeVisible();

    await page.getByRole('button', { name: en.area.recordPastPayment }).click();
    await expect(dialog.getByText(en.paymentDialog.pastHint)).toBeVisible();
    await dialog.getByRole('button', { name: en.common.save, exact: true }).click();
    await expect(page.getByText(en.paymentDialog.pastSaved)).toBeVisible();
    await expect(page.getByText(en.receipts.pastRecord, { exact: true })).toBeVisible();
    await expect(boxes.getByLabel(boxLabel(month, en.months.status.paid))).toBeVisible();

    // No more months than are open up to two years ahead: the count stops there.
    await page.getByRole('button', { name: en.area.recordPayment }).click();
    const count = dialog.getByLabel(en.paymentDialog.monthCount);
    await expect(dialog.getByText(/^Amount received/)).toBeVisible();
    await count.fill('999');
    await expect(count).toHaveValue('24');
    await expect(dialog.getByRole('button', { name: en.paymentDialog.more })).toBeDisabled();
    // A start month with fewer open months brings the count down with it.
    const later = nextMonth(year + 1, month);
    const start = dialog.getByRole('group', { name: en.paymentDialog.from });
    await start.getByLabel(en.common.year, { exact: true }).selectOption(String(later.year));
    await start.getByLabel(en.common.month, { exact: true }).selectOption(String(later.month));
    // From that month up to two years after this one: 12 months.
    await expect(count).toHaveValue('12');
    // An empty box is not saved as some hidden number: it says what is wrong.
    await count.fill('');
    await count.press('Enter');
    await expect(dialog.getByText(en.paymentDialog.monthCountRequired)).toBeVisible();
    await count.blur();
    await expect(count).toHaveValue('12');
    await expect(dialog.getByText(en.paymentDialog.monthCountRequired)).toHaveCount(0);
    await dialog.getByRole('button', { name: en.common.cancel }).click();
    await expect(page.getByText(en.receipts.number.replace('{{number}}', '0002'))).toHaveCount(0);
  } finally {
    await app.close();
    removeDataDir(dataDir);
  }
});
