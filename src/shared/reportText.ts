import { formatYearMonth } from './dates';
import type { DigitStyle } from './digits';
import { formatPlain } from './formatNumber';
import type { Currency } from './currency';
import type { ReportQuery, ReportStatus } from './reports';

/**
 * Separates short pieces of text on one line. A bar, not a middle dot: next to
 * Arabic-Indic digits a dot looks just like the zero (٠).
 */
export const PART_SEPARATOR = ' | ';

/**
 * The filters a printed or exported report names in its heading, as
 * translation keys and plain values, so the print page and the Excel file
 * describe a report the same way (each translates them with its own `t`).
 */
export interface ReportFilterPart {
  labelKey: 'common.year' | 'common.month' | 'area.category' | 'area.currency' | 'reports.status';
  value:
    | { text: string }
    | {
        key:
          | 'area.allMonths'
          | 'areas.all'
          | `currency.${Currency}`
          | `reports.statuses.${ReportStatus}`;
      };
}

export function reportFilterParts(
  query: ReportQuery,
  categoryName: string | null,
  digits: DigitStyle,
): ReportFilterPart[] {
  return [
    { labelKey: 'common.year', value: { text: formatPlain(query.year, digits) } },
    {
      labelKey: 'common.month',
      value:
        query.month === null
          ? { key: 'area.allMonths' }
          : { text: formatPlain(query.month, digits) },
    },
    {
      labelKey: 'area.category',
      value: categoryName === null ? { key: 'areas.all' } : { text: categoryName },
    },
    {
      labelKey: 'area.currency',
      value: query.currency === null ? { key: 'areas.all' } : { key: `currency.${query.currency}` },
    },
    { labelKey: 'reports.status', value: { key: `reports.statuses.${query.status}` } },
  ];
}

/** A report title as a translation key and its values (see `reportTitle`). */
export interface ReportTitle {
  key: 'print.title' | 'print.titleNamed' | 'print.file' | 'print.fileNamed';
  values: { period: string; name?: string };
}

/**
 * A report's title, and with `forFile` its file name: what it covers (the one
 * place of the area page, else the chosen category) and its period (the year,
 * or the chosen month of it), so saved reports never get mixed up. A file name
 * uses Western digits and "10-2026", as "/" cannot be in a file name.
 */
export function reportTitle(
  query: Pick<ReportQuery, 'year' | 'month'>,
  name: string | null,
  digits: DigitStyle,
  forFile = false,
): ReportTitle {
  const style = forFile ? 'western' : digits;
  const period =
    query.month === null
      ? formatPlain(query.year, style)
      : forFile
        ? `${formatPlain(query.month, style)}-${formatPlain(query.year, style)}`
        : formatYearMonth({ year: query.year, month: query.month }, style);
  if (name === null) return { key: forFile ? 'print.file' : 'print.title', values: { period } };
  return { key: forFile ? 'print.fileNamed' : 'print.titleNamed', values: { period, name } };
}
