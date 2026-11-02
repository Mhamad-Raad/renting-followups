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
    dialog.showSaveDialog = ((...args: { defaultPath?: string }[]) => {
      // The name the app suggested, for the tests to read back.
      (globalThis as { suggestedName?: string | undefined }).suggestedName =
        args.at(-1)?.defaultPath;
      return Promise.resolve({ canceled: false, filePath: file });
    }) as typeof dialog.showSaveDialog;
  }, path);
}

/** The file name the app last suggested in the Save dialog. */
const suggestedName = (app: ElectronApplication) =>
  app.evaluate(() => (globalThis as { suggestedName?: string }).suggestedName ?? '');

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
      monthCount: 2,
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
    expect(sheet?.getRow(5).getCell(6).value).toBe('IQD');
    expect(sheet?.getRow(5).getCell(8).value).toBe(500_000);
    expect(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length)).toBe(1);
  } finally {
    await app.close();
    removeDataDir(dataDir);
  }
});

test('the sideways report keeps every row and the footer on its pages', async () => {
  const dataDir = createDataDir();
  const { app, page } = await launchUnlocked(dataDir);
  try {
    await page.evaluate(async () => {
      await window.api.invoke('settings:update', { language: 'en' });
      const category = await window.api.invoke('categories:create', { name: 'Shops', color: null });
      if (!category.ok || !category.data.ok) throw new Error('category failed');
      for (let n = 0; n < 40; n += 1) {
        await window.api.invoke('areas:create', {
          categoryId: category.data.id,
          name: `Shop ${n}`,
          currency: 'IQD',
          monthlyPrice: 250_000,
          rentStartsFrom: { year: 2026, month: 1 },
          renter: { fullName: 'Karwan', phone: '0750 123 4567', startedOn: '2026-01-01' },
          address: n % 2 ? 'Main street' : '',
          contractStart: null,
          // The first place has the longest notes allowed: its row must still fit on a page.
          notes:
            n === 0
              ? 'A very long note about this place. '.repeat(140).slice(0, 5000)
              : n % 3
                ? ''
                : 'Pays in cash at the start of each month. '.repeat(3),
        });
      }
    });
    await reloadApp(page);
    await page.getByRole('link', { name: en.nav.reports, exact: true }).click();
    await page.getByRole('button', { name: en.print.actions.pdf }).click();
    const preview = page.getByRole('dialog', { name: en.print.preview.title });
    await expect(preview.getByText('Shop 39').last()).toBeAttached();
    const pages = await preview.locator('section').evaluateAll((sections) =>
      sections.map((section) => {
        const turned = section.firstElementChild as HTMLElement;
        return turned.scrollHeight <= turned.clientHeight;
      }),
    );
    expect(pages.length).toBeGreaterThan(1);
    expect(pages.every(Boolean)).toBe(true);
    await expect(
      preview
        .locator('section')
        .last()
        .getByText(/counts/),
    ).toBeAttached();
    await expect(preview.locator('tbody tr')).toHaveCount(40);

    // At the largest screen text size the preview still shares the rows into the PDF's pages.
    const rowsPerPage = () =>
      preview
        .locator('section')
        .evaluateAll((sections) => sections.map((s) => s.querySelectorAll('tbody tr').length));
    const normal = await rowsPerPage();
    await page.evaluate(() => window.api.invoke('settings:update', { fontSize: 'extraLarge' }));
    await reloadApp(page);
    await page.getByRole('link', { name: en.nav.reports, exact: true }).click();
    await page.getByRole('button', { name: en.print.actions.pdf }).click();
    await expect(preview.getByText('Shop 39').last()).toBeAttached();
    expect(await rowsPerPage()).toEqual(normal);
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
    // Export to PDF opens the report in a pop-up first; Save as PDF and Print are in it.
    await page.getByRole('button', { name: en.print.actions.pdf }).click();
    const preview = page.getByRole('dialog', { name: en.print.preview.title });
    await expect(preview.getByRole('cell', { name: /دوکانی ١/ }).last()).toBeVisible();
    expect(existsSync(pdf)).toBe(false);
    await preview.getByRole('button', { name: en.print.actions.savePdf }).click();
    await expect(preview.getByText(en.print.results.savedPdf)).toBeVisible();
    expect(existsSync(pdf)).toBe(true);
    // The area page's file is named after the place.
    expect(await suggestedName(app)).toContain('دوکانی ١');
    await preview.getByRole('button', { name: en.print.actions.print, exact: true }).click();
    await expect(preview.getByText(en.print.results.printed)).toBeVisible();
    await preview.getByRole('button', { name: en.common.close }).click();
    await expect(preview).toHaveCount(0);

    // Areas list: tick one area, then Export to Excel.
    await page.getByRole('link', { name: en.nav.areas, exact: true }).click();
    await page.getByRole('checkbox', { name: 'Select دوکانی ١' }).check();
    const xlsx = join(dataDir, 'selected.xlsx');
    await chooseSavePath(app, xlsx);
    await page.getByRole('button', { name: en.print.actions.excel }).click();
    await expect(page.getByText(en.print.results.savedExcel)).toBeVisible();
    expect(existsSync(xlsx)).toBe(true);
    // One place on its own: its name is in the file name and the sheet's title.
    expect(await suggestedName(app)).toContain('دوکانی ١');
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(xlsx);
    expect(workbook.worksheets[0]?.getRow(1).getCell(1).value).toBe(
      `Rent report: دوکانی ١, ${new Date().getFullYear()}`,
    );

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
