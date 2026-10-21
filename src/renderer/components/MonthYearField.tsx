import { useTranslation } from 'react-i18next';
import { MAX_YEAR, MIN_YEAR, type YearMonth } from '@shared/dates';
import { formatPlain } from '@shared/formatNumber';
import { useSettings } from '../app/SettingsContext';
import styles from './DateFields.module.css';
import { SelectField } from './SelectField';

const MONTHS = Array.from({ length: 12 }, (_, index) => index + 1);

/** Years offered in pickers: from the first year the app accepts to two years ahead. */
export function yearOptions(currentYear: number): number[] {
  const last = Math.min(MAX_YEAR, currentYear + 2);
  return Array.from({ length: last - MIN_YEAR + 1 }, (_, index) => last - index);
}

interface MonthYearFieldProps {
  label: string;
  value: YearMonth;
  onChange: (value: YearMonth) => void;
  error?: string | null | undefined;
  hint?: string | undefined;
}

/** Picks a month (as a number 1–12) and a year. */
export function MonthYearField({ label, value, onChange, error, hint }: MonthYearFieldProps) {
  const { t } = useTranslation();
  const { settings } = useSettings();
  const format = (number: number) => formatPlain(number, settings.digitStyle);
  return (
    <fieldset className={styles.group}>
      <legend className={styles.legend}>{label}</legend>
      <div className={styles.row}>
        <SelectField
          label={t('common.month')}
          value={String(value.month)}
          onChange={(month) => onChange({ ...value, month: Number(month) })}
        >
          {MONTHS.map((month) => (
            <option key={month} value={month}>
              {format(month)}
            </option>
          ))}
        </SelectField>
        <SelectField
          label={t('common.year')}
          value={String(value.year)}
          onChange={(year) => onChange({ ...value, year: Number(year) })}
        >
          {yearOptions(new Date().getFullYear()).map((year) => (
            <option key={year} value={year}>
              {format(year)}
            </option>
          ))}
        </SelectField>
      </div>
      {(error ?? hint) && <p className={error ? styles.error : styles.hint}>{error ?? hint}</p>}
    </fieldset>
  );
}
