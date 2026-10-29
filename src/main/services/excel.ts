import ExcelJS from 'exceljs';
import { areaLabel } from '@shared/areas';
import { FRACTION_DIGITS, type Currency } from '@shared/currency';
import { formatDate, type DateString } from '@shared/dates';
import type { DigitStyle } from '@shared/digits';
import { formatPlain } from '@shared/formatNumber';
import type { MonthStatus } from '@shared/months';
import { PART_SEPARATOR, reportFilterParts } from '@shared/reportText';
import type { Report, ReportQuery } from '@shared/reports';
import type { Language } from '@shared/settings';
import { translate } from './translate';

/**
 * The report as an Excel sheet (ARCHITECTURE.md section 14): the same columns
 * and totals as the printed report, month cells holding the paid amount with
 * the status colour as fill, right to left for Sorani and Arabic.
 */

/** The light theme's status backgrounds (themes.css); a test keeps the two in step. */
/** As on screen: no yellow; this month unpaid is red, a coming month paid in part is grey. */
export const STATUS_FILLS: Record<MonthStatus, string> = {
  paid: 'c4e5c7',
  due: 'f4c4be',
  partial: 'eceef0',
  late: 'f4c4be',
  upcoming: 'eceef0',
  not_applicable: 'f6f6f6',
};

const MONTHS = Array.from({ length: 12 }, (_, index) => index + 1);
/** Rent, received and still owed, after the currency column. */
const MONEY_COLUMNS = [6, 7, 8];
const FIRST_MONTH_COLUMN = 9;

export interface ExcelOptions {
  language: Language;
  digitStyle: DigitStyle;
  categoryName: string | null;
  printedOn: DateString;
  /** The owner's print title from Settings, as the first line; empty for none. */
  printTitle: string;
  /** The one place the report is limited to (the area page), named in its title; null otherwise. */
  areaName?: string | null;
}

export function buildReportWorkbook(
  report: Report,
  query: ReportQuery,
  { language, digitStyle, categoryName, printedOn, printTitle, areaName = null }: ExcelOptions,
): ExcelJS.Workbook {
  const t = (key: string, values?: Record<string, string>) => translate(language, key, values);
  const rtl = language !== 'en';
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(t('pages.reports.title'), {
    pageSetup: {
      paperSize: 9,
      orientation: 'landscape',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
    },
  });
  // A bare number (the currency has its own column), with cents for USD.
  const moneyFormat = (currency: Currency) => `#,##0${FRACTION_DIGITS[currency] > 0 ? '.00' : ''}`;
  const toMajor = (amount: number, currency: Currency) => amount / 10 ** FRACTION_DIGITS[currency];

  if (printTitle) sheet.addRow([printTitle]).font = { bold: true, size: 12 };
  sheet.addRow([
    areaName ? t('print.areaReportTitle', { name: areaName }) : t('print.reportTitle'),
  ]).font = { bold: true, size: 14 };
  sheet.addRow([
    reportFilterParts(query, categoryName, digitStyle)
      .map(
        (part) =>
          `${t(part.labelKey)}: ${'text' in part.value ? part.value.text : t(part.value.key)}`,
      )
      .join(PART_SEPARATOR),
  ]);
  sheet.addRow([t('print.printedOn', { date: formatDate(printedOn, digitStyle) })]);

  const header = sheet.addRow([
    t('reports.columns.area'),
    t('area.category'),
    t('reports.columns.renter'),
    t('area.phone'),
    t('areaForm.currency'),
    t('reports.columns.rent'),
    t('reports.columns.received'),
    t('reports.columns.remaining'),
    ...MONTHS.map((month) => formatPlain(month, digitStyle)),
    t('area.notes'),
  ]);
  header.font = { bold: true };
  // The heading lines and the column names stay in view while scrolling.
  sheet.views = [{ rightToLeft: rtl, state: 'frozen', ySplit: header.number }];

  // One line per currency, so every money column holds one currency and can be added up;
  // an area that changed currency in the year has a line for each, with that currency's months.
  for (const row of report.rows) {
    for (const part of row.figures) {
      const { currency } = part;
      const line = sheet.addRow([
        areaLabel(row),
        row.categoryName,
        row.renterName ?? '',
        row.renterPhone ?? '',
        t(`currency.${currency}`),
        part.rent === null ? '' : toMajor(part.rent, currency),
        toMajor(part.received, currency),
        toMajor(part.remaining, currency),
        ...row.boxes.map((box) =>
          box.paid > 0 && box.currency === currency ? toMajor(box.paid, currency) : '',
        ),
        row.notes,
      ]);
      for (const column of [...MONEY_COLUMNS, ...MONTHS.map((m) => FIRST_MONTH_COLUMN + m - 1)]) {
        line.getCell(column).numFmt = moneyFormat(currency);
      }
      row.boxes.forEach((box, index) => {
        line.getCell(FIRST_MONTH_COLUMN + index).fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: {
            argb: `FF${STATUS_FILLS[box.currency === currency ? box.status : 'not_applicable']}`,
          },
        };
      });
    }
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
      t(`currency.${total.currency}`),
      toMajor(total.rent, total.currency),
      toMajor(total.received, total.currency),
      toMajor(total.remaining, total.currency),
    ]);
    line.font = { bold: true };
    for (const column of MONEY_COLUMNS) line.getCell(column).numFmt = moneyFormat(total.currency);
  }
  sheet.addRow([]);
  sheet.addRow([
    t('reports.footer', {
      december: formatPlain(12, digitStyle),
      november: formatPlain(11, digitStyle),
    }),
  ]);

  sheet.columns.forEach((column, index) => {
    column.width = index < 4 ? 22 : index === 4 ? 10 : index < 8 ? 16 : index < 20 ? 12 : 40;
  });
  return workbook;
}
