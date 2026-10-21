import { expect, test, type Page } from '@playwright/test';
import en from '../../src/renderer/i18n/en.json' with { type: 'json' };
import { createDataDir, launchUnlocked, removeDataDir } from './launch';

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
  await page.reload();
  await page.getByRole('link', { name: en.nav.areas }).click();
  await page.getByRole('link', { name: 'Shop 9' }).click();
  return { year: today.getFullYear(), month: today.getMonth() + 1 };
}

const boxLabel = (month: number, status: string) =>
  en.months.box.replace('{{month}}', String(month)).replace('{{status}}', status);
const monthText = (template: string, month: number, year: number) =>
  template.replace('{{month}}', `${month}/${year}`);

test('record a payment, see the preview and colours, then undo it', async () => {
  const dataDir = createDataDir();
  const { app, page } = await launchUnlocked(dataDir);
  try {
    const { year, month } = await openNewArea(page);
    await page.getByRole('button', { name: en.area.recordPayment }).click();
    const dialog = page.getByRole('dialog');
    const amount = dialog.getByLabel(en.paymentDialog.amount);
    await expect(amount).toBeFocused();
    await amount.pressSequentially('300000');

    // This month is filled, the rest goes to the next month.
    await expect(
      dialog.getByText(monthText(en.paymentDialog.previewFull, month, year)),
    ).toBeVisible();
    await expect(dialog.getByText('partial, 50,000 of 250,000')).toBeVisible();

    await dialog.getByRole('button', { name: en.common.save }).click();
    await expect(page.getByText('Payment saved. Receipt No. 0001')).toBeVisible();
    const boxes = page.getByRole('list', { name: new RegExp(`${year}`) });
    await expect(boxes.getByLabel(boxLabel(month, en.months.status.paid))).toBeVisible();
    await expect(page.getByText('Receipt No. 0001', { exact: true })).toBeVisible();

    await page.getByRole('button', { name: en.receipts.undo }).click();
    await expect(page.getByText(en.receipts.undone.replace('{{number}}', '0001'))).toBeVisible();
    await expect(page.getByText(en.receipts.cancelledLabel, { exact: true })).toBeVisible();
    await expect(boxes.getByLabel(boxLabel(month, en.months.status.due))).toBeVisible();

    // The next payment gets a new number: 0001 is never reused.
    await page.getByRole('button', { name: en.area.recordPayment }).click();
    await page.getByRole('dialog').getByLabel(en.paymentDialog.amount).fill('250000');
    await page.getByRole('dialog').getByRole('button', { name: en.common.save }).click();
    await expect(page.getByText('Payment saved. Receipt No. 0002')).toBeVisible();
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
    await dialog.getByLabel(en.paymentDialog.amount).fill('100000');
    await dialog.getByRole('button', { name: en.common.save }).click();
    await expect(page.getByText('Payment saved. Receipt No. 0001')).toBeVisible();

    await page.getByRole('button', { name: en.common.edit, exact: true }).last().click();
    await expect(dialog.getByRole('heading', { level: 2 })).toHaveText('Edit receipt No. 0001');
    await dialog.getByLabel(en.paymentDialog.amount).fill('250000');
    await dialog.getByRole('button', { name: en.common.save }).click();
    await expect(page.getByText(en.paymentDialog.updated)).toBeVisible();
    await expect(boxes.getByLabel(boxLabel(month, en.months.status.paid))).toBeVisible();

    await page.getByRole('button', { name: en.receipts.cancel }).click();
    await dialog.getByRole('button', { name: en.receipts.cancel }).click();
    await expect(page.getByText(en.receipts.cancelDone)).toBeVisible();
    await expect(boxes.getByLabel(boxLabel(month, en.months.status.due))).toBeVisible();

    await page.getByRole('button', { name: en.area.recordPastPayment }).click();
    await expect(dialog.getByText(en.paymentDialog.pastHint)).toBeVisible();
    await dialog.getByLabel(en.paymentDialog.amount).fill('250000');
    await dialog.getByRole('button', { name: en.common.save }).click();
    await expect(page.getByText(en.paymentDialog.pastSaved)).toBeVisible();
    await expect(page.getByText(en.receipts.pastRecord)).toBeVisible();
    await expect(boxes.getByLabel(boxLabel(month, en.months.status.paid))).toBeVisible();

    await page.getByRole('button', { name: en.area.recordPayment }).click();
    await dialog.getByLabel(en.paymentDialog.amount).fill('999999999');
    await expect(dialog.getByText(en.paymentDialog.too_much)).toBeVisible();
    await dialog.getByRole('button', { name: en.common.save }).click();
    await expect(dialog.getByRole('alert')).toHaveText(en.paymentDialog.too_much);
    await dialog.getByRole('button', { name: en.common.cancel }).click();
    await expect(page.getByText(en.receipts.number.replace('{{number}}', '0002'))).toHaveCount(0);
  } finally {
    await app.close();
    removeDataDir(dataDir);
  }
});
