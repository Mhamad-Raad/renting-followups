import { useTranslation } from 'react-i18next';
import { FRACTION_DIGITS, type Currency } from '@shared/currency';
import { formatAmount } from '@shared/formatNumber';
import { useSettings } from '../app/SettingsContext';

interface MoneyTextProps {
  /** Integer amount in the currency's smallest unit (dinars, or cents for USD). */
  amount: number;
  currency: Currency;
  /** False in tables, where the currency has a column of its own. */
  withCurrency?: boolean;
}

/**
 * Shows an amount with thousands separators, in the chosen digit style, with
 * its currency. The number is isolated so it never reorders inside RTL text.
 */
export function MoneyText({ amount, currency, withCurrency = true }: MoneyTextProps) {
  const { t } = useTranslation();
  const { settings } = useSettings();
  return (
    <span>
      <bdi dir="ltr">{formatAmount(amount, FRACTION_DIGITS[currency], settings.digitStyle)}</bdi>
      {withCurrency && ` ${t(`currency.${currency}`)}`}
    </span>
  );
}
