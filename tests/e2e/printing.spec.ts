import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type ElectronApplication, type Page } from '@playwright/test';
import ExcelJS from 'exceljs';
import en from '../../src/renderer/i18n/en.json' with { type: 'json' };
import type { ReportQuery } from '../../src/shared/reports';
import { createDataDir, launchUnlocked, removeDataDir, reloadApp } from './launch';

/** Answers the next "Save as" dialogs in the main process with `path`, as if the owner chose it. */
async function chooseSavePath(app: ElectronApplication, path: string) {
  await app.evaluate(({ dialog }, file) => {
    dialog.showSaveDialog = (() =>
      Promise.resolve({ canceled: false, filePath: file })) as typeof dialog.showSaveDialog;
  }, path);
}

/** One area with one numbered payment. */
async function seed(page: Page): Promise<number> {
  const year = new Date().getFullYear();
  return page.evaluate(async (year) => {
    await window.api.invoke('settings:update', { language: 'ckb' });
    const category = await window.api.invoke('categories:create', { name: 'Shops', color: null });
    if (!category.ok || !category.data.ok) throw new Error('category failed');
    const area = await window.api.invoke('areas:create', {
      categoryId: category.data.id,
      name: 'دوکانی ١',
      currency: 'IQD',
      monthlyPrice: 250_000,
      rentStartsFrom: { year, month: 1 },
      renter: { fullName: 'کاروان ئەحمەد', phone: '0750 123 4567', startedOn: `${year}-01-01` },
      address: '',
      contractStart: null,
      notes: '',
    });
    if (!area.ok || !area.data.ok) throw new Error('area failed');
    const payment = await window.api.invoke('payments:create', {
      areaId: area.data.id,
      isBackfill: false,
      amount: 500_000,
      from: { year, month: 1 },
      paidOn: `${year}-01-05`,
      note: '',
    });
    if (!payment.ok || !payment.data.ok) throw new Error('payment failed');
    return payment.data.id;
  }, year);
}

const QUERY = (): ReportQuery => ({
  year: new Date().getFullYear(),
  month: null,
  categoryId: null,
  currency: null,
  status: 'all',
  excludedIds: [],
  onlyIds: null,
});

test('the report saves as PDF and as an Excel sheet that reads right to left', async () => {
  const dataDir = createDataDir();
  const { app, page } = await launchUnlocked(dataDir);
  try {
    await seed(page);
    const pdf = join(dataDir, 'report.pdf');
    await chooseSavePath(app, pdf);
    const printed = await page.evaluate(
      (query) => window.api.invoke('print:report', { query, output: 'pdf' }),
      QUERY(),
    );
    expect(printed).toEqual({ ok: true, data: { ok: true, done: 'saved' } });
    expect(readFileSync(pdf).subarray(0, 5).toString()).toBe('%PDF-');
    // One area fits on one page; no empty page after it.
    expect(readFileSync(pdf, 'latin1').match(/\/Type\s*\/Page[^s]/g)).toHaveLength(1);

    const xlsx = join(dataDir, 'report.xlsx');
    await chooseSavePath(app, xlsx);
    const exported = await page.evaluate(
      (query) => window.api.invoke('export:reportExcel', { query }),
      QUERY(),
    );
    expect(exported).toEqual({ ok: true, data: { ok: true, done: 'saved' } });
    expect(existsSync(xlsx)).toBe(true);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(xlsx);
    const sheet = workbook.worksheets[0];
    expect(sheet?.views[0]?.rightToLeft).toBe(true);
    expect(sheet?.getRow(5).getCell(1).value).toBe('دوکانی ١');
    expect(sheet?.getRow(5).getCell(5).value).toBe('IQD');
    expect(sheet?.getRow(5).getCell(7).value).toBe(500_000);
    expect(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length)).toBe(1);
  } finally {
    await app.close();
    removeDataDir(dataDir);
  }
});

test('a PDF that cannot be written says so plainly', async () => {
  const dataDir = createDataDir();
  const { app, page } = await launchUnlocked(dataDir);
  try {
    await seed(page);
    // A folder that does not exist stands in for a file locked by another program.
    await chooseSavePath(app, join(dataDir, 'missing', 'report.pdf'));
    const result = await page.evaluate(
      (query) => window.api.invoke('print:report', { query, output: 'pdf' }),
      QUERY(),
    );
    expect(result).toEqual({ ok: true, data: { ok: false, reason: 'save_failed' } });
  } finally {
    await app.close();
    removeDataDir(dataDir);
  }
});

test('cancelling the Save dialog changes nothing', async () => {
  const dataDir = createDataDir();
  const { app, page } = await launchUnlocked(dataDir);
  try {
    await seed(page);
    await app.evaluate(({ dialog }) => {
      dialog.showSaveDialog = (() =>
        Promise.resolve({ canceled: true, filePath: '' })) as typeof dialog.showSaveDialog;
    });
    const cancelled = await page.evaluate(
      (query) => window.api.invoke('print:report', { query, output: 'pdf' }),
      QUERY(),
    );
    expect(cancelled).toEqual({ ok: true, data: { ok: true, done: 'cancelled' } });
  } finally {
    await app.close();
    removeDataDir(dataDir);
  }
});

/** Stands in for the Windows print dialog: every print "succeeds" at once. */
async function fakePrinter(app: ElectronApplication) {
  await app.evaluate(({ webContents }) => {
    const prototype = Object.getPrototypeOf(webContents.getAllWebContents()[0]) as {
      print: (options: unknown, callback: (success: boolean, reason: string) => void) => void;
    };
    prototype.print = (_options, callback) => callback(true, '');
  });
}

test('the buttons on screen print and export, with a plain message each time', async () => {
  const dataDir = createDataDir();
  const { app, page } = await launchUnlocked(dataDir);
  try {
    await seed(page);
    await page.evaluate(() => window.api.invoke('settings:update', { language: 'en' }));
    await reloadApp(page);
    await fakePrinter(app);

    // Area page: receipts are not saved as PDF (owner's decision), only the area's report.
    await page.getByRole('link', { name: en.nav.areas, exact: true }).click();
    await page.getByRole('link', { name: 'دوکانی ١' }).click();
    await page.getByRole('button', { name: en.area.recordPayment }).click();
    await expect(page.getByRole('dialog').getByRole('button', { name: /PDF/ })).toHaveCount(0);
    await page.getByRole('dialog').getByRole('button', { name: en.common.cancel }).click();
    await expect(page.getByRole('button', { name: 'Save receipt as PDF' })).toHaveCount(0);

    const pdf = join(dataDir, 'area.pdf');
    await chooseSavePath(app, pdf);
    await page.getByRole('button', { name: en.print.actions.pdf }).click();
    await expect.poll(() => existsSync(pdf)).toBe(true);

    // Areas list: tick one area, then Export to Excel.
    await page.getByRole('link', { name: en.nav.areas, exact: true }).click();
    await page.getByRole('checkbox', { name: 'Select دوکانی ١' }).check();
    const xlsx = join(dataDir, 'selected.xlsx');
    await chooseSavePath(app, xlsx);
    await page.getByRole('button', { name: en.print.actions.excel }).click();
    await expect(page.getByText(en.print.results.savedExcel)).toBeVisible();
    expect(existsSync(xlsx)).toBe(true);

    // Home: Print report.
    await page.getByRole('link', { name: en.nav.home, exact: true }).click();
    await page.getByRole('button', { name: en.print.actions.printReport }).click();
    await expect(page.getByText(en.print.results.printed)).toBeVisible();
    expect(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length)).toBe(1);
  } finally {
    await app.close();
    removeDataDir(dataDir);
  }
});
