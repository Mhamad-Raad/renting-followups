import { useTranslation } from 'react-i18next';
import type { Category } from '@shared/categories';
import { CURRENCIES } from '@shared/currency';
import { formatPlain } from '@shared/formatNumber';
import { REPORT_STATUSES, type ReportFilters } from '@shared/reports';
import { useSettings } from '../../app/SettingsContext';
import { yearOptions } from '../../components/MonthYearField';
import { SelectField } from '../../components/SelectField';
import styles from './ReportsPage.module.css';

const ALL = 'all';
const MONTHS = Array.from({ length: 12 }, (_, index) => index + 1);

interface ReportFiltersBarProps {
  year: number;
  filters: ReportFilters;
  categories: readonly Category[];
  onYear: (year: number) => void;
  onFilters: (change: Partial<ReportFilters>) => void;
}

/** Year, Month, Category, Currency and Status, side by side. */
export function ReportFiltersBar({
  year,
  filters,
  categories,
  onYear,
  onFilters,
}: ReportFiltersBarProps) {
  const { t } = useTranslation();
  const { settings } = useSettings();
  const format = (number: number) => formatPlain(number, settings.digitStyle);
  const orAll = (value: string | number | null) => (value === null ? ALL : String(value));
  return (
    <div className={styles.filters} role="group" aria-label={t('reports.filters')}>
      <SelectField
        label={t('common.year')}
        value={String(year)}
        onChange={(v) => onYear(Number(v))}
      >
        {yearOptions(new Date().getFullYear()).map((option) => (
          <option key={option} value={option}>
            {format(option)}
          </option>
        ))}
      </SelectField>
      <SelectField
        label={t('common.month')}
        value={orAll(filters.month)}
        onChange={(v) => onFilters({ month: v === ALL ? null : Number(v) })}
      >
        <option value={ALL}>{t('area.allMonths')}</option>
        {MONTHS.map((month) => (
          <option key={month} value={month}>
            {format(month)}
          </option>
        ))}
      </SelectField>
      <SelectField
        label={t('area.category')}
        value={orAll(filters.categoryId)}
        onChange={(v) => onFilters({ categoryId: v === ALL ? null : Number(v) })}
      >
        <option value={ALL}>{t('areas.all')}</option>
        {categories.map((category) => (
          <option key={category.id} value={category.id}>
            {category.name}
          </option>
        ))}
      </SelectField>
      <SelectField
        label={t('area.currency')}
        value={orAll(filters.currency)}
        onChange={(v) =>
          onFilters({ currency: CURRENCIES.find((currency) => currency === v) ?? null })
        }
      >
        <option value={ALL}>{t('areas.all')}</option>
        {CURRENCIES.map((currency) => (
          <option key={currency} value={currency}>
            {t(`currency.${currency}`)}
          </option>
        ))}
      </SelectField>
      <SelectField
        label={t('reports.status')}
        value={filters.status}
        onChange={(v) =>
          onFilters({ status: REPORT_STATUSES.find((status) => status === v) ?? 'all' })
        }
      >
        {REPORT_STATUSES.map((status) => (
          <option key={status} value={status}>
            {t(`reports.statuses.${status}`)}
          </option>
        ))}
      </SelectField>
    </div>
  );
}
