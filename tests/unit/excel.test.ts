import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { MonthBox } from '@shared/months';
import type { Report, ReportQuery } from '@shared/reports';
import { buildReportWorkbook, STATUS_FILLS } from '../../src/main/services/excel';

const QUERY: ReportQuery = {
  year: 2026,
  month: null,
  categoryId: null,
  currency: null,
  status: 'all',
  excludedIds: [],
  onlyIds: null,
};

const boxes = (paid: number[]): MonthBox[] =>
  Array.from({ length: 12 }, (_, index) => ({
    month: index + 1,
    expected: 250_000,
    paid: paid[index] ?? 0,
    status: (paid[index] ?? 0) >= 250_000 ? 'paid' : index < 4 ? 'late' : 'upcoming',
  }));

const REPORT: Report = {
  candidates: [],
  rows: [
    {
      id: 1,
      name: 'Shop 1',
      categoryName: 'Shops',
      categoryColor: null,
      currency: 'IQD',
      renterName: 'Karwan Ahmed',
      renterPhone: '0750 123 4567',
      notes: 'Pays in cash',
      figures: { rent: 250_000, expected: 3_000_000, received: 500_000, remaining: 500_000 },
      boxes: boxes([250_000, 250_000]),
      summary: 'late',
      monthStatus: null,
    },
    {
      id: 2,
      name: 'Office 2',
      categoryName: 'Offices',
      categoryColor: null,
      currency: 'USD',
      renterName: null,
      renterPhone: null,
      notes: '',
      figures: { rent: 450_50, expected: 0, received: 450_50, remaining: 0 },
      boxes: boxes([]),
      summary: 'paid',
      monthStatus: null,
    },
  ],
  totals: [
    { currency: 'IQD', rent: 250_000, received: 500_000, remaining: 500_000, areas: 1 },
    { currency: 'USD', rent: 450_50, received: 450_50, remaining: 0, areas: 1 },
  ],
};

const OPTIONS = {
  digitStyle: 'western',
  categoryName: null,
  printedOn: '2026-05-15',
  printTitle: '',
} as const;

describe('Excel report', () => {
  it('has the same columns as the printed report, with the area rows and money as numbers', () => {
    const sheet = buildReportWorkbook(REPORT, QUERY, { ...OPTIONS, language: 'en' }).worksheets[0];
    expect(sheet?.getRow(4).values).toEqual([
      undefined,
      'Area',
      'Category',
      'Renter',
      'Phone',
      'Monthly rent',
      'Received',
      'Still owed',
      ...Array.from({ length: 12 }, (_, i) => String(i + 1)),
      'Notes',
    ]);
    const shop = sheet?.getRow(5);
    expect(shop?.getCell(1).value).toBe('Shop 1');
    expect(shop?.getCell(5).value).toBe(250_000);
    expect(shop?.getCell(5).numFmt).toBe('#,##0 "IQD"');
    expect(shop?.getCell(8).value).toBe(250_000);
    expect(shop?.getCell(10).value).toBe('');
    expect(shop?.getCell(20).value).toBe('Pays in cash');
    // Dollars are stored in cents and shown with two decimals.
    expect(sheet?.getRow(6).getCell(5).value).toBe(450.5);
    expect(sheet?.getRow(6).getCell(5).numFmt).toBe('#,##0.00 "USD"');
  });

  it('names an area without a name by its category', () => {
    const [shop, office] = REPORT.rows;
    if (!shop || !office) throw new Error('fixture changed');
    const report = {
      ...REPORT,
      rows: [
        { ...shop, name: '' },
        { ...office, name: '' },
      ],
    };
    const sheet = buildReportWorkbook(report, QUERY, { ...OPTIONS, language: 'en' }).worksheets[0];
    expect(sheet?.getRow(5).getCell(1).value).toBe('Shops');
    expect(sheet?.getRow(6).getCell(1).value).toBe('Offices');
  });

  it('colours month cells by status', () => {
    const sheet = buildReportWorkbook(REPORT, QUERY, { ...OPTIONS, language: 'en' }).worksheets[0];
    const fill = (column: number) => {
      const value = sheet?.getRow(5).getCell(column).fill;
      return value && 'fgColor' in value ? value.fgColor?.argb : undefined;
    };
    expect(fill(8)).toBe('FFdff0e0');
    expect(fill(10)).toBe('FFf8dcd9');
    expect(fill(19)).toBe('FFeceef0');
  });

  it('ends with one total row per currency and the footer sentence', () => {
    const sheet = buildReportWorkbook(REPORT, QUERY, { ...OPTIONS, language: 'en' }).worksheets[0];
    expect(sheet?.getRow(7).getCell(1).value).toBe('Total IQD | Areas: 1');
    expect(sheet?.getRow(7).getCell(6).value).toBe(500_000);
    expect(sheet?.getRow(8).getCell(1).value).toBe('Total USD | Areas: 1');
    expect(String(sheet?.getRow(10).getCell(1).value)).toContain('Received');
  });

  it('reads right to left in Sorani and Arabic, with translated headings', () => {
    const sorani = buildReportWorkbook(REPORT, QUERY, { ...OPTIONS, language: 'ckb' })
      .worksheets[0];
    expect(sorani?.views[0]?.rightToLeft).toBe(true);
    expect(sorani?.getRow(4).getCell(1).value).toBe('شوێن');
    expect(sorani?.getRow(5).getCell(5).numFmt).toBe('#,##0 "دینار"');
    const english = buildReportWorkbook(REPORT, QUERY, { ...OPTIONS, language: 'en' })
      .worksheets[0];
    expect(english?.views[0]?.rightToLeft).toBe(false);
  });

  it('puts the print title from Settings first and keeps the column names in view', () => {
    const plain = buildReportWorkbook(REPORT, QUERY, { ...OPTIONS, language: 'en' }).worksheets[0];
    expect(plain?.getRow(1).getCell(1).value).toBe('Rent report');
    expect(plain?.views[0]).toMatchObject({ state: 'frozen', ySplit: 4 });

    const titled = buildReportWorkbook(REPORT, QUERY, {
      ...OPTIONS,
      language: 'en',
      printTitle: 'Kawa Rentals',
    }).worksheets[0];
    expect(titled?.getRow(1).getCell(1).value).toBe('Kawa Rentals');
    expect(titled?.getRow(2).getCell(1).value).toBe('Rent report');
    expect(titled?.getRow(5).getCell(1).value).toBe('Area');
    expect(titled?.views[0]).toMatchObject({ state: 'frozen', ySplit: 5 });
  });

  it('uses the same status colours as the light theme', () => {
    const css = readFileSync(
      join(import.meta.dirname, '../../src/renderer/styles/themes.css'),
      'utf8',
    );
    const light = css.slice(0, css.indexOf(":root[data-theme='dark']"));
    const color = (name: string) =>
      new RegExp(`--status-${name}-bg:\\s*#([0-9a-f]{6})`).exec(light)?.[1];
    expect(STATUS_FILLS.paid).toBe(color('paid'));
    expect(STATUS_FILLS.due).toBe(color('due'));
    expect(STATUS_FILLS.late).toBe(color('late'));
    expect(STATUS_FILLS.upcoming).toBe(color('upcoming'));
    expect(STATUS_FILLS.not_applicable).toBe(color('na'));
  });
});
