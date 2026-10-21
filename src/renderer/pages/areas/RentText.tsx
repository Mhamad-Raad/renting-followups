import { useTranslation } from 'react-i18next';
import type { Currency } from '@shared/currency';
import { MoneyText } from '../../components/MoneyText';

/** A monthly price in words: the amount, "Vacant" (0), or "Rent not started yet" (no price yet). */
export function RentText({ price, currency }: { price: number | null; currency: Currency }) {
  const { t } = useTranslation();
  if (price === null) return <span>{t('areas.notStarted')}</span>;
  if (price === 0) return <span>{t('areas.vacant')}</span>;
  return <MoneyText amount={price} currency={currency} />;
}
