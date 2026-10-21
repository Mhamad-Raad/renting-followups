import { useTranslation } from 'react-i18next';
import { daysInMonth, parseDateString, toDateString, type DateString } from '@shared/dates';
import { formatPlain } from '@shared/formatNumber';
import { useSettings } from '../app/SettingsContext';
import styles from './DateFields.module.css';
import { yearOptions } from './MonthYearField';
import { SelectField } from './SelectField';

interface DateFieldProps {
  label: string;
  value: DateString;
  onChange: (value: DateString) => void;
  error?: string | null | undefined;
}

/**
 * Picks a date as day, month and year, all as numbers in the chosen digit
 * style. Impossible dates cannot be picked: the day is kept within the month.
 */
export function DateField({ label, value, onChange, error }: DateFieldProps) {
  const { t } = useTranslation();
  const { settings } = useSettings();
  const format = (number: number) => formatPlain(number, settings.digitStyle);
  const today = new Date();
  const parts = parseDateString(value) ?? {
    year: today.getFullYear(),
    month: today.getMonth() + 1,
    day: today.getDate(),
  };
  const update = (change: Partial<typeof parts>) => {
    const next = { ...parts, ...change };
    onChange(
      toDateString(next.year, next.month, Math.min(next.day, daysInMonth(next.year, next.month))),
    );
  };
  const range = (count: number) => Array.from({ length: count }, (_, index) => index + 1);

  return (
    <fieldset className={styles.group}>
      <legend className={styles.legend}>{label}</legend>
      <div className={styles.row}>
        <SelectField
          label={t('common.day')}
          value={String(parts.day)}
          onChange={(day) => update({ day: Number(day) })}
        >
          {range(daysInMonth(parts.year, parts.month)).map((day) => (
            <option key={day} value={day}>
              {format(day)}
            </option>
          ))}
        </SelectField>
        <SelectField
          label={t('common.month')}
          value={String(parts.month)}
          onChange={(month) => update({ month: Number(month) })}
        >
          {range(12).map((month) => (
            <option key={month} value={month}>
              {format(month)}
            </option>
          ))}
        </SelectField>
        <SelectField
          label={t('common.year')}
          value={String(parts.year)}
          onChange={(year) => update({ year: Number(year) })}
        >
          {yearOptions(today.getFullYear()).map((year) => (
            <option key={year} value={year}>
              {format(year)}
            </option>
          ))}
        </SelectField>
      </div>
      {error && <p className={styles.error}>{error}</p>}
    </fieldset>
  );
}
