import ExcelJS from 'exceljs';
import { FRACTION_DIGITS, type Currency } from '@shared/currency';
import { formatDate, type DateString } from '@shared/dates';
import type { DigitStyle } from '@shared/digits';
import { formatPlain } from '@shared/formatNumber';
import type { MonthStatus } from '@shared/months';
import { reportFilterParts } from '@shared/reportText';
import type { Report, ReportQuery } from '@shared/reports';
import type { Language } from '@shared/settings';
import { translate } from './translate';

/**
 * The report as an Excel sheet (ARCHITECTURE.md section 14): the same columns
 * and totals as the printed report, month cells holding the paid amount with
 * the status colour as fill, right to left for Sorani and Arabic.
 */

/** The light theme's status backgrounds (themes.css); a test keeps the two in step. */
export const STATUS_FILLS: Record<MonthStatus, string> = {
  paid: 'dff0e0',
  due: 'fde8cc',
  partial: 'fde8cc',
  late: 'f8dcd9',
  upcoming: 'eceef0',
  not_applicable: 'f6f6f6',
};

const MONTHS = Array.from({ length: 12 }, (_, index) => index + 1);
const FIRST_MONTH_COLUMN = 8;

export interface ExcelOptions {
  language: Language;
  digitStyle: DigitStyle;
  categoryName: string | null;
  printedOn: DateString;
}

export function buildReportWorkbook(
  report: Report,
  query: ReportQuery,
  { language, digitStyle, categoryName, printedOn }: ExcelOptions,
): ExcelJS.Workbook {
  const t = (key: string, values?: Record<string, string>) => translate(language, key, values);
  const rtl = language !== 'en';
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(t('pages.reports.title'), {
    views: [{ rightToLeft: rtl, state: 'frozen', ySplit: 4 }],
    pageSetup: {
      paperSize: 9,
      orientation: 'landscape',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
    },
  });
  // A cell number format that shows the amount with its currency name, like the screen.
  const moneyFormat = (currency: Currency) =>
    `#,##0${FRACTION_DIGITS[currency] > 0 ? '.00' : ''} "${t(`currency.${currency}`)}"`;
  const toMajor = (amount: number, currency: Currency) => amount / 10 ** FRACTION_DIGITS[currency];

  sheet.addRow([t('print.reportTitle')]).font = { bold: true, size: 14 };
  sheet.addRow([
    reportFilterParts(query, categoryName, digitStyle)
      .map(
        (part) =>
          `${t(part.labelKey)}: ${'text' in part.value ? part.value.text : t(part.value.key)}`,
      )
      .join('   '),
  ]);
  sheet.addRow([t('print.printedOn', { date: formatDate(printedOn, digitStyle) })]);

  const header = sheet.addRow([
    t('reports.columns.area'),
    t('area.category'),
    t('reports.columns.renter'),
    t('area.phone'),
    t('reports.columns.rent'),
    t('reports.columns.received'),
    t('reports.columns.remaining'),
    ...MONTHS.map((month) => formatPlain(month, digitStyle)),
    t('area.notes'),
  ]);
  header.font = { bold: true };

  for (const row of report.rows) {
    const line = sheet.addRow([
      row.name,
      row.categoryName,
      row.renterName ?? '',
      row.renterPhone ?? '',
      row.figures.rent === null ? '' : toMajor(row.figures.rent, row.currency),
      toMajor(row.figures.received, row.currency),
      toMajor(row.figures.remaining, row.currency),
      ...row.boxes.map((box) => (box.paid > 0 ? toMajor(box.paid, row.currency) : '')),
      row.notes,
    ]);
    for (const column of [5, 6, 7, ...MONTHS.map((m) => FIRST_MONTH_COLUMN + m - 1)]) {
      line.getCell(column).numFmt = moneyFormat(row.currency);
    }
    row.boxes.forEach((box, index) => {
      line.getCell(FIRST_MONTH_COLUMN + index).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: `FF${STATUS_FILLS[box.status]}` },
      };
    });
  }

  for (const total of report.totals) {
    const line = sheet.addRow([
      t('reports.total', {
        currency: t(`currency.${total.currency}`),
        number: formatPlain(total.areas, digitStyle),
      }),
      '',
      '',
      '',
      toMajor(total.rent, total.currency),
      toMajor(total.received, total.currency),
      toMajor(total.remaining, total.currency),
    ]);
    line.font = { bold: true };
    for (const column of [5, 6, 7]) line.getCell(column).numFmt = moneyFormat(total.currency);
  }
  sheet.addRow([]);
  sheet.addRow([
    t('reports.footer', {
      december: formatPlain(12, digitStyle),
      november: formatPlain(11, digitStyle),
    }),
  ]);

  sheet.columns.forEach((column, index) => {
    column.width = index < 4 ? 22 : index < 7 ? 16 : index < 19 ? 12 : 40;
  });
  return workbook;
}
