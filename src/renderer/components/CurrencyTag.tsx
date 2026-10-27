import { useTranslation } from 'react-i18next';
import type { Currency } from '@shared/currency';
import styles from './CurrencyTag.module.css';

/** The currency of a row (IQD or USD) in its own column, so the amounts beside it are bare numbers. */
export function CurrencyTag({ currency }: { currency: Currency }) {
  const { t } = useTranslation();
  return <span className={styles.tag}>{t(`currency.${currency}`)}</span>;
}
