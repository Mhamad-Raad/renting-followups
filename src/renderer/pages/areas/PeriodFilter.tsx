import { useTranslation } from 'react-i18next';
import { formatPlain } from '@shared/formatNumber';
import { useSettings } from '../../app/SettingsContext';
import { SelectField } from '../../components/SelectField';
import styles from './AreaPage.module.css';

const MONTHS = Array.from({ length: 12 }, (_, index) => index + 1);
const ALL = 'all';

interface PeriodFilterProps {
  years: readonly number[];
  year: number;
  month: number | null;
  onYear: (year: number) => void;
  onMonth: (month: number | null) => void;
}

/** The Year and Month selectors above the area's figures. */
export function PeriodFilter({ years, year, month, onYear, onMonth }: PeriodFilterProps) {
  const { t } = useTranslation();
  const { settings } = useSettings();
  const format = (number: number) => formatPlain(number, settings.digitStyle);
  return (
    <div className={styles.filter}>
      <SelectField
        label={t('common.year')}
        value={String(year)}
        onChange={(value) => onYear(Number(value))}
      >
        {years.map((option) => (
          <option key={option} value={option}>
            {format(option)}
          </option>
        ))}
      </SelectField>
      <SelectField
        label={t('common.month')}
        value={month === null ? ALL : String(month)}
        onChange={(value) => onMonth(value === ALL ? null : Number(value))}
      >
        <option value={ALL}>{t('area.allMonths')}</option>
        {MONTHS.map((option) => (
          <option key={option} value={option}>
            {format(option)}
          </option>
        ))}
      </SelectField>
    </div>
  );
}

/** Years offered on the area page: from when the rent started (or this year) to two years ahead. */
export function areaYears(firstYear: number | undefined, currentYear: number): number[] {
  const from = Math.min(firstYear ?? currentYear, currentYear);
  return Array.from({ length: currentYear + 2 - from + 1 }, (_, index) => currentYear + 2 - index);
}
