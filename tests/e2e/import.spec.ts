import { existsSync } from 'node:fs';
import { join } from 'node:path';
import ExcelJS from 'exceljs';
import { expect, test, type ElectronApplication, type Page } from '@playwright/test';
import en from '../../src/renderer/i18n/en.json' with { type: 'json' };
import { createDataDir, launchUnlocked, reloadApp, removeDataDir } from './launch';

const COLUMNS = en.import.columns;
const HEADER = [
  COLUMNS.name,
  COLUMNS.category,
  COLUMNS.currency,
  COLUMNS.monthlyPrice,
  COLUMNS.startMonth,
  COLUMNS.startYear,
  COLUMNS.renterName,
  COLUMNS.renterPhone,
];

/** Answers the next Open and Save dialogs with `path`, as if the owner chose it. */
async function answerDialogs(app: ElectronApplication, path: string) {
  await app.evaluate(({ dialog }, chosen) => {
    dialog.showOpenDialog = (() =>
      Promise.resolve({ canceled: false, filePaths: [chosen] })) as typeof dialog.showOpenDialog;
    dialog.showSaveDialog = (() =>
      Promise.resolve({ canceled: false, filePath: chosen })) as typeof dialog.showSaveDialog;
  }, path);
}

async function writeAreasFile(file: string, rows: (string | number)[][]) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Areas');
  sheet.addRow(HEADER);
  for (const row of rows) sheet.addRow(row);
  await workbook.xlsx.writeFile(file);
}

async function openImportInEnglish(page: Page) {
  await page.evaluate(() => window.api.invoke('settings:update', { language: 'en' }));
  await reloadApp(page);
  await page.getByRole('navigation').getByRole('link', { name: 'Areas' }).click();
  // The empty Areas screen offers it too, under Add your first area.
  await page.getByRole('link', { name: en.areas.empty.importButton }).last().click();
  await expect(page.getByRole('heading', { name: en.import.title })).toBeVisible();
}

test('the template downloads, and a filled file imports its good rows after a preview', async () => {
  const dataDir = createDataDir();
  const { app, page } = await launchUnlocked(dataDir);
  try {
    await openImportInEnglish(page);

    const template = join(dataDir, 'template.xlsx');
    await answerDialogs(app, template);
    await page.getByRole('button', { name: en.import.downloadTemplate }).click();
    await expect(page.getByText(en.import.templateSaved)).toBeVisible();
    expect(existsSync(template)).toBe(true);

    const year = new Date().getFullYear();
    const file = join(dataDir, 'my areas.xlsx');
    await writeAreasFile(file, [
      ['Shop 1', 'Shops', 'IQD', 250000, 1, year, 'Ahmad Ali', '07501234567'],
      ['Flat 1', 'Flats', 'USD', 300, 2, year, '', ''],
      ['Shop 2', 'Shops', 'EUR', 100, 1, year, '', ''],
    ]);
    await answerDialogs(app, file);
    await page.getByRole('button', { name: en.import.chooseFile }).click();

    // Nothing is saved yet: the preview says what will happen.
    await expect(page.getByText('Areas to import: 2')).toBeVisible();
    await expect(page.getByText('Rows that will be skipped: 1')).toBeVisible();
    // Each name is isolated with invisible direction marks, so the list keeps its order.
    await expect(
      page.getByText('New categories that will be made: \u2068Shops\u2069, \u2068Flats\u2069'),
    ).toBeVisible();
    await expect(page.getByText('Row 4: currency must be IQD or USD')).toBeVisible();
    await expect(page.getByRole('cell', { name: 'Flat 1' })).toBeVisible();
    const before = await page.evaluate(() =>
      window.api.invoke('areas:list', { search: '', categoryId: null }),
    );
    expect(before.ok && before.data).toEqual([]);

    // Cancelling "Choose another file" keeps this preview, and Import still works.
    await app.evaluate(({ dialog }) => {
      dialog.showOpenDialog = (() =>
        Promise.resolve({ canceled: true, filePaths: [] })) as typeof dialog.showOpenDialog;
    });
    await page.getByRole('button', { name: en.import.chooseAnother }).click();
    await expect(page.getByText('Areas to import: 2')).toBeVisible();
    await answerDialogs(app, file);

    await page.getByRole('button', { name: en.import.importButton }).click();
    await expect(page.getByText('Imported areas: 2. New categories: 2.')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Shop 1' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Flat 1' })).toBeVisible();

    // Choosing the same file again skips the areas already imported.
    await page.locator('header').getByRole('link', { name: en.areas.import }).click();
    await page.getByRole('button', { name: en.import.chooseFile }).click();
    await expect(
      page.getByText('Row 2: an area with this name is already in this category'),
    ).toBeVisible();
    await expect(page.getByText(en.import.nothingToImport)).toBeVisible();
    await expect(page.getByRole('button', { name: en.import.importButton })).toHaveCount(0);
  } finally {
    await app.close();
    removeDataDir(dataDir);
  }
});

test('a file without the template columns is refused in plain words', async () => {
  const dataDir = createDataDir();
  const { app, page } = await launchUnlocked(dataDir);
  try {
    await openImportInEnglish(page);
    const file = join(dataDir, 'list.xlsx');
    const workbook = new ExcelJS.Workbook();
    workbook.addWorksheet('List').addRows([
      ['Shop', 'Price'],
      ['Shop 1', 100],
    ]);
    await workbook.xlsx.writeFile(file);
    await answerDialogs(app, file);
    await page.getByRole('button', { name: en.import.chooseFile }).click();
    await expect(page.getByText(/^The first row must have the column names/)).toBeVisible();
    await expect(page.getByRole('button', { name: en.import.importButton })).toHaveCount(0);
  } finally {
    await app.close();
    removeDataDir(dataDir);
  }
});
