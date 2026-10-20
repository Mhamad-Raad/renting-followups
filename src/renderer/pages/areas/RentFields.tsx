import { useTranslation } from 'react-i18next';
import type { AreaDetails } from '@shared/areas';
import { CURRENCIES, type Currency } from '@shared/currency';
import { formatYearMonth, type YearMonth } from '@shared/dates';
import { useSettings } from '../../app/SettingsContext';
import { AmountField } from '../../components/AmountField';
import { Checkbox } from '../../components/Checkbox';
import { ChoiceGroup } from '../../components/ChoiceGroup';
import { MonthYearField } from '../../components/MonthYearField';
import styles from './AreaFormPage.module.css';

/** What a new area starts with: its currency and its first price ("Rent starts from"). */
export interface NewRent {
  currency: Currency;
  monthlyPrice: number | null;
  vacant: boolean;
  startsFrom: YearMonth;
}

interface RentFieldsProps {
  /** An existing area: currency and start are fixed and only shown. */
  area: AreaDetails | null;
  rent: NewRent;
  onChange: (rent: NewRent) => void;
  rentError: string | null;
}

/** The currency and rent part of the area form. */
export function RentFields({ area, rent, onChange, rentError }: RentFieldsProps) {
  const { t } = useTranslation();
  const { settings } = useSettings();
  const change = (changes: Partial<NewRent>) => onChange({ ...rent, ...changes });

  if (area) {
    const firstPrice = area.prices[0];
    return (
      <>
        <p>
          <strong>{t('areaForm.currency')}:</strong> {t(`currency.${area.currency}`)} —{' '}
          {t('areaForm.currencyFixed')}
        </p>
        {firstPrice && (
          <p className={styles.hint}>
            {t('areaForm.rentStartsFromFixed', {
              month: formatYearMonth(firstPrice, settings.digitStyle),
            })}
          </p>
        )}
      </>
    );
  }

  return (
    <>
      <ChoiceGroup
        label={t('areaForm.currency')}
        value={rent.currency}
        choices={CURRENCIES.map((code) => ({ value: code, label: t(`currency.${code}`) }))}
        onChange={(currency) => change({ currency, monthlyPrice: null })}
      />
      <p className={styles.hint}>{t('areaForm.currencyHint')}</p>
      {/* A new key re-creates the amount box when the currency (and its decimals) changes. */}
      <AmountField
        key={rent.currency}
        label={t('areaForm.monthlyRent')}
        currency={rent.currency}
        value={rent.monthlyPrice}
        onChange={(monthlyPrice) => change({ monthlyPrice })}
        disabled={rent.vacant}
        error={rentError}
      />
      <Checkbox
        label={t('areaForm.vacantNow')}
        checked={rent.vacant}
        onChange={(vacant) => change({ vacant })}
      />
      <MonthYearField
        label={t('areaForm.rentStartsFrom')}
        value={rent.startsFrom}
        onChange={(startsFrom) => change({ startsFrom })}
      />
    </>
  );
}
