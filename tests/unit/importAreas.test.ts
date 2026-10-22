import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type ExcelJS from 'exceljs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { IMPORT_COLUMNS, IMPORT_MAX_ROWS, type ImportPreview } from '@shared/import';
import { LANGUAGES } from '@shared/settings';
import {
  buildImportTemplate,
  cellText,
  checkTable,
  importAreas,
  importContext,
  readTable,
  type TableRow,
} from '../../src/main/services/importAreas';
import { translate } from '../../src/main/services/translate';
import { areaInput, createTestDatabase } from './helpers';

const YEAR = 2026;
const HEADER = IMPORT_COLUMNS.map((column) => translate('en', `import.columns.${column}`));

let folder: string;
let db: ReturnType<typeof createTestDatabase>['db'];
let repos: ReturnType<typeof createTestDatabase>['repos'];

beforeEach(() => {
  folder = mkdtempSync(join(tmpdir(), 'rent-tracker-import-'));
  ({ db, repos } = createTestDatabase());
});

afterEach(() => {
  db.close();
  rmSync(folder, { recursive: true, force: true });
});

/** A table with the English header in row 1 and these rows below it. */
function table(...rows: string[][]): TableRow[] {
  return [HEADER, ...rows].map((cells, index) => ({ row: index + 1, cells }));
}

/** A full row; `overrides` replaces columns by name. */
function row(overrides: Partial<Record<(typeof IMPORT_COLUMNS)[number], string>> = {}): string[] {
  const values = {
    name: 'Shop 1',
    category: 'Shops',
    currency: 'IQD',
    monthlyPrice: '250000',
    startMonth: '1',
    startYear: '2025',
    renterName: 'Ahmad Ali',
    renterPhone: '0750 123 4567',
    address: 'Main street',
    notes: '',
    ...overrides,
  };
  return IMPORT_COLUMNS.map((column) => values[column]);
}

function check(rows: TableRow[]): ImportPreview {
  const result = checkTable(rows, 'areas.xlsx', importContext(repos, YEAR));
  if (!result.ok || result.done !== 'checked') throw new Error(JSON.stringify(result));
  return result.preview;
}

describe('checking a file', () => {
  it('reads a filled row into an area', () => {
    const preview = check(table(row()));
    expect(preview.problems).toEqual([]);
    expect(preview.newCategories).toEqual(['Shops']);
    expect(preview.rows).toEqual([
      {
        row: 2,
        name: 'Shop 1',
        category: 'Shops',
        currency: 'IQD',
        monthlyPrice: 250_000,
        rentStartsFrom: { year: 2025, month: 1 },
        renter: { fullName: 'Ahmad Ali', phone: '0750 123 4567' },
        address: 'Main street',
        notes: '',
      },
    ]);
  });

  it('understands Arabic-Indic digits, separators, currency words and dollar cents', () => {
    const preview = check(
      table(
        row({ name: 'A', currency: 'دینار', monthlyPrice: '٢٥٠٬٠٠٠', startMonth: '٣' }),
        row({ name: 'B', currency: 'usd', monthlyPrice: '299.50' }),
        row({ name: 'C', currency: '$', monthlyPrice: '1,200', renterName: '', renterPhone: '' }),
      ),
    );
    expect(preview.problems).toEqual([]);
    expect(preview.rows.map((area) => [area.currency, area.monthlyPrice])).toEqual([
      ['IQD', 250_000],
      ['USD', 29_950],
      ['USD', 120_000],
    ]);
    expect(preview.rows[0]?.rentStartsFrom).toEqual({ year: 2025, month: 3 });
    expect(preview.rows[2]?.renter).toBeNull();
  });

  it('finds the columns by their names in any language and in any order', () => {
    for (const language of LANGUAGES) {
      const header = IMPORT_COLUMNS.map((column) =>
        translate(language, `import.columns.${column}`),
      ).reverse();
      const preview = check([
        { row: 1, cells: header },
        { row: 2, cells: row().reverse() },
      ]);
      expect(preview.rows).toHaveLength(1);
      expect(preview.rows[0]?.name).toBe('Shop 1');
    }
  });

  it('may leave out the optional columns', () => {
    const preview = check([
      { row: 1, cells: HEADER.slice(0, 6) },
      { row: 2, cells: row().slice(0, 6) },
    ]);
    expect(preview.rows[0]).toMatchObject({ renter: null, address: '', notes: '' });
  });

  it('explains every problem of a row, with the row number shown in Excel', () => {
    const preview = check(
      table(
        row({ name: '', currency: 'EUR', startMonth: '13', startYear: '1999' }),
        row({ name: 'B', currency: 'IQD', monthlyPrice: '250.5' }),
        row({ name: 'C', currency: 'USD', monthlyPrice: '-5' }),
        row({ name: 'D', renterName: '', renterPhone: '0750' }),
        row({ name: 'E', renterPhone: 'call me' }),
        row({ name: 'F', startYear: String(YEAR + 3), monthlyPrice: '' }),
        row({ name: 'x'.repeat(121) }),
        row({ name: 'G', monthlyPrice: '99999999999999' }),
      ),
    );
    expect(preview.rows).toEqual([]);
    expect(preview.problems).toEqual([
      {
        row: 2,
        problems: [
          { kind: 'missing', column: 'name' },
          { kind: 'bad_currency' },
          { kind: 'bad_month' },
          { kind: 'bad_year', min: 2000, max: YEAR + 2 },
        ],
      },
      { row: 3, problems: [{ kind: 'bad_price', currency: 'IQD' }] },
      { row: 4, problems: [{ kind: 'bad_price', currency: 'USD' }] },
      { row: 5, problems: [{ kind: 'phone_without_renter' }] },
      { row: 6, problems: [{ kind: 'bad_phone' }] },
      {
        row: 7,
        problems: [
          { kind: 'missing', column: 'monthlyPrice' },
          { kind: 'bad_year', min: 2000, max: YEAR + 2 },
        ],
      },
      { row: 8, problems: [{ kind: 'too_long', column: 'name', max: 120 }] },
      { row: 9, problems: [{ kind: 'bad_price', currency: 'IQD' }] },
    ]);
  });

  it('flags a name repeated in the same category, even written with other letter forms', () => {
    const preview = check(
      table(
        row({ name: 'دوکانی یەک' }),
        row({ name: 'Shop 2' }),
        row({ name: 'دوكاني يەك' }),
        row({ name: 'دوکانی یەک', category: 'Flats' }),
      ),
    );
    expect(preview.rows.map((area) => area.row)).toEqual([2, 3, 5]);
    expect(preview.problems).toEqual([
      { row: 4, problems: [{ kind: 'same_as_row', otherRow: 2 }] },
    ]);
    expect(preview.newCategories).toEqual(['Shops', 'Flats']);
  });

  it('flags an area that is already in the app, and knows existing categories', () => {
    const category = repos.categories.create({ name: 'Shops', color: null });
    if (!category.ok) throw new Error('category not created');
    repos.areas.create(areaInput(category.id, { name: 'Shop 1' }));
    const preview = check(
      table(row({ name: 'shop 1' }), row({ name: 'Shop 2', category: 'shops' })),
    );
    expect(preview.problems).toEqual([{ row: 2, problems: [{ kind: 'already_exists' }] }]);
    expect(preview.rows.map((area) => area.name)).toEqual(['Shop 2']);
    expect(preview.newCategories).toEqual([]);
  });

  it('skips empty rows', () => {
    const preview = check([
      { row: 1, cells: ['', ''] },
      { row: 2, cells: HEADER },
      { row: 3, cells: ['', '', ''] },
      { row: 4, cells: row() },
    ]);
    expect(preview.rows.map((area) => area.row)).toEqual([4]);
  });

  it('refuses a file without the needed columns, an empty file, and one too long', () => {
    const context = importContext(repos, YEAR);
    expect(
      checkTable(
        [
          { row: 1, cells: ['Name', 'Price'] },
          { row: 2, cells: ['a', '1'] },
        ],
        'f',
        context,
      ),
    ).toEqual({
      ok: false,
      reason: 'missing_columns',
      columns: ['name', 'category', 'currency', 'monthlyPrice', 'startMonth', 'startYear'],
    });
    expect(checkTable(table(), 'f', context)).toEqual({ ok: false, reason: 'empty' });
    expect(checkTable([], 'f', context)).toEqual({ ok: false, reason: 'empty' });
    const many = Array.from({ length: IMPORT_MAX_ROWS + 1 }, (_, index) =>
      row({ name: `Shop ${index}` }),
    );
    expect(checkTable(table(...many), 'f', context)).toEqual({
      ok: false,
      reason: 'too_many_rows',
      max: IMPORT_MAX_ROWS,
    });
  });
});

describe('importing', () => {
  it('creates the areas, their first price and renter, and the new categories', () => {
    const preview = check(
      table(row(), row({ name: 'Flat 1', category: 'Flats', renterName: '', renterPhone: '' })),
    );
    expect(importAreas(db, repos, preview.rows)).toEqual({ ok: true, areas: 2, categories: 2 });

    const categories = repos.categories.list();
    expect(categories.map((category) => [category.name, category.areaCount])).toEqual([
      ['Shops', 1],
      ['Flats', 1],
    ]);
    const shops = repos.areas.get(1);
    expect(shops).toMatchObject({ name: 'Shop 1', currency: 'IQD', address: 'Main street' });
    expect(shops?.prices).toEqual([{ year: 2025, month: 1, monthlyPrice: 250_000 }]);
    expect(shops?.renters).toMatchObject([
      { fullName: 'Ahmad Ali', phone: '0750 123 4567', startedOn: '2025-01-01', endedOn: null },
    ]);
    expect(repos.areas.get(2)?.renters).toEqual([]);
  });

  it('saves nothing at all when one area can no longer be created', () => {
    const preview = check(table(row({ name: 'Shop 1' }), row({ name: 'Shop 2' })));
    // Someone adds "Shop 2" between the check and the import.
    const category = repos.categories.create({ name: 'Shops', color: null });
    if (!category.ok) throw new Error('category not created');
    repos.areas.create(areaInput(category.id, { name: 'Shop 2' }));

    expect(importAreas(db, repos, preview.rows)).toEqual({ ok: false, reason: 'changed' });
    expect(repos.categories.list().map((item) => [item.name, item.areaCount])).toEqual([
      ['Shops', 1],
    ]);
  });
});

describe('a full file', () => {
  it('imports 200 areas from an Excel file in one go', async () => {
    const workbook = buildImportTemplate('ckb', YEAR);
    const sheet = workbook.worksheets[0];
    if (!sheet) throw new Error('no sheet');
    for (let number = 1; number <= 200; number += 1) {
      sheet.addRow([
        `دووکانی ${number}`,
        number % 2 === 0 ? 'دووکانەکان' : 'شوقەکان',
        number % 5 === 0 ? 'USD' : 'IQD',
        number % 5 === 0 ? 450.5 : 250_000 + number * 1000,
        (number % 12) + 1,
        2024,
        number % 3 === 0 ? '' : `کرێچی ${number}`,
        number % 3 === 0 ? '' : `0750${String(number).padStart(7, '0')}`,
      ]);
    }
    const file = join(folder, 'areas.xlsx');
    await workbook.xlsx.writeFile(file);
    const read = await readTable(file);
    if (!Array.isArray(read)) throw new Error('not read');
    const preview = check(read);
    expect(preview.problems).toEqual([]);
    expect(preview.rows).toHaveLength(200);

    expect(importAreas(db, repos, preview.rows)).toEqual({ ok: true, areas: 200, categories: 2 });
    expect(repos.categories.list().map((category) => category.areaCount)).toEqual([100, 100]);
    expect(repos.areas.get(5)).toMatchObject({
      currency: 'USD',
      prices: [{ monthlyPrice: 45_050 }],
    });
    expect(repos.areas.get(7)?.renters[0]?.phone).toBe('07500000007');
  });
});

describe('reading files', () => {
  async function saveWorkbook(workbook: ExcelJS.Workbook, name: string): Promise<string> {
    const file = join(folder, name);
    await workbook.xlsx.writeFile(file);
    return file;
  }

  it('reads back a filled-in template, in every language', async () => {
    for (const language of LANGUAGES) {
      const workbook = buildImportTemplate(language, YEAR);
      const sheet = workbook.worksheets[0];
      if (!sheet) throw new Error('no sheet');
      // Numbers typed as numbers, the phone as text.
      sheet.addRow(['Shop 1', 'Shops', 'IQD', 250000, 1, 2025, 'Ahmad Ali', '07501234567', '', '']);
      const file = await saveWorkbook(workbook, `${language}.xlsx`);
      const read = await readTable(file);
      if (!Array.isArray(read)) throw new Error('not read');
      const preview = check(read);
      expect(preview.rows[0]).toMatchObject({
        name: 'Shop 1',
        monthlyPrice: 250_000,
        renter: { fullName: 'Ahmad Ali', phone: '07501234567' },
      });
    }
  });

  it('keeps the template right to left for Sorani and Arabic, with its help sheet', () => {
    const workbook = buildImportTemplate('ckb', YEAR);
    expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual([
      translate('ckb', 'import.template.sheet'),
      translate('ckb', 'import.template.helpSheet'),
    ]);
    expect(workbook.worksheets[0]?.views[0]?.rightToLeft).toBe(true);
    expect(buildImportTemplate('en', YEAR).worksheets[0]?.views[0]?.rightToLeft).toBe(false);
  });

  it('reads a CSV file, keeping the leading 0 of a phone', async () => {
    const file = join(folder, 'areas.csv');
    writeFileSync(
      file,
      `\uFEFF${HEADER.join(',')}\nShop 1,Shops,IQD,250000,1,2025,Ahmad Ali,07501234567,,\n`,
    );
    const read = await readTable(file);
    if (!Array.isArray(read)) throw new Error('not read');
    expect(check(read).rows[0]?.renter?.phone).toBe('07501234567');
  });

  it('reads a CSV file separated by semicolons, as Excel writes it on Arabic computers', async () => {
    const file = join(folder, 'areas.csv');
    writeFileSync(
      file,
      `${HEADER.join(';')}\r\nShop 1;Shops;IQD;250000;1;2025;;;Main street, 2;\r\n`,
    );
    const read = await readTable(file);
    if (!Array.isArray(read)) throw new Error('not read');
    expect(check(read).rows[0]).toMatchObject({ name: 'Shop 1', address: 'Main street, 2' });
  });

  it('says plainly when a file is not a spreadsheet', async () => {
    const file = join(folder, 'photo.xlsx');
    writeFileSync(file, 'not a spreadsheet');
    expect(await readTable(file)).toBeNull();
    expect(await readTable(join(folder, 'missing.xlsx'))).toBeNull();
  });

  it('turns any kind of cell into plain text', () => {
    expect(cellText(null)).toBe('');
    expect(cellText(250000)).toBe('250000');
    expect(cellText(0.1 + 0.2)).toBe('0.3');
    expect(cellText('  Shop  ')).toBe('Shop');
    expect(cellText({ richText: [{ text: 'Sh' }, { text: 'op' }] })).toBe('Shop');
    expect(cellText({ formula: 'A1*2', result: 500 })).toBe('500');
    expect(cellText({ formula: 'A1/0', result: { error: '#DIV/0!' } })).toBe('');
    expect(cellText({ text: 'link', hyperlink: 'https://example.com' })).toBe('link');
  });
});
