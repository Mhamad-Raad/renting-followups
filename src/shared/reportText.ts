import type { DigitStyle } from './digits';
import { formatPlain } from './formatNumber';
import type { ReportQuery } from './reports';

/**
 * The filters a printed or exported report names in its heading, as
 * translation keys and plain values, so the print page and the Excel file
 * describe a report the same way (each translates them with its own `t`).
 */
export interface ReportFilterPart {
  labelKey: 'common.year' | 'common.month' | 'area.category' | 'area.currency' | 'reports.status';
  value: { text: string } | { key: string };
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
