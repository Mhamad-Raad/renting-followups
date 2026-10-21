import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type ElectronApplication, type Page } from '@playwright/test';
import ExcelJS from 'exceljs';
import type { ReportQuery } from '../../src/shared/reports';
import { createDataDir, launchUnlocked, removeDataDir } from './launch';

/** Answers the next "Save as" dialogs in the main process with `path`, as if the owner chose it. */
async function chooseSavePath(app: ElectronApplication, path: string) {
  await app.evaluate(({ dialog }, file) => {
    dialog.showSaveDialog = (() =>
      Promise.resolve({ canceled: false, filePath: file })) as typeof dialog.showSaveDialog;
  }, path);
}

/** One area with one numbered payment; returns the receipt id. */
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

test('a receipt saves as PDF; the print is counted, so the next one says Copy', async () => {
  const dataDir = createDataDir();
  const { app, page } = await launchUnlocked(dataDir);
  try {
    const receiptId = await seed(page);
    const file = join(dataDir, 'receipt.pdf');
    await chooseSavePath(app, file);
    const first = await page.evaluate(
      (id) => window.api.invoke('print:receipt', { id, output: 'pdf' }),
      receiptId,
    );
    expect(first).toEqual({ ok: true, data: { ok: true, done: 'saved' } });
    expect(readFileSync(file).subarray(0, 5).toString()).toBe('%PDF-');
    const data = await page.evaluate(
      (id) => window.api.invoke('print:receiptData', { id }),
      receiptId,
    );
    expect(data.ok && data.data?.printCount).toBe(1);
    // Every hidden print window is closed again.
    expect(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length)).toBe(1);
  } finally {
    await app.close();
    removeDataDir(dataDir);
  }
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
    expect(sheet?.getRow(5).getCell(6).value).toBe(500_000);
    expect(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length)).toBe(1);
  } finally {
    await app.close();
    removeDataDir(dataDir);
  }
});

test('cancelling the Save dialog changes nothing; past records cannot print as receipts', async () => {
  const dataDir = createDataDir();
  const { app, page } = await launchUnlocked(dataDir);
  try {
    const receiptId = await seed(page);
    await app.evaluate(({ dialog }) => {
      dialog.showSaveDialog = (() =>
        Promise.resolve({ canceled: true, filePath: '' })) as typeof dialog.showSaveDialog;
    });
    const cancelled = await page.evaluate(
      (id) => window.api.invoke('print:receipt', { id, output: 'pdf' }),
      receiptId,
    );
    expect(cancelled).toEqual({ ok: true, data: { ok: true, done: 'cancelled' } });
    const data = await page.evaluate(
      (id) => window.api.invoke('print:receiptData', { id }),
      receiptId,
    );
    expect(data.ok && data.data?.printCount).toBe(0);
    const missing = await page.evaluate(() =>
      window.api.invoke('print:receipt', { id: 999, output: 'pdf' }),
    );
    expect(missing).toEqual({ ok: true, data: { ok: false, reason: 'not_found' } });
    const past = await page.evaluate(async () => {
      const year = new Date().getFullYear();
      const areas = await window.api.invoke('areas:list', { search: '', categoryId: null });
      const areaId = areas.ok ? (areas.data[0]?.id ?? 0) : 0;
      const created = await window.api.invoke('payments:create', {
        areaId,
        isBackfill: true,
        amount: 250_000,
        from: { year, month: 3 },
        paidOn: `${year}-01-05`,
        note: '',
      });
      if (!created.ok || !created.data.ok) throw new Error('past record failed');
      return window.api.invoke('print:receipt', { id: created.data.id, output: 'pdf' });
    });
    expect(past).toEqual({ ok: true, data: { ok: false, reason: 'past_record' } });
  } finally {
    await app.close();
    removeDataDir(dataDir);
  }
});
