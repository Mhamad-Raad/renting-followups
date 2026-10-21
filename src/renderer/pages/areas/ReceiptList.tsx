import { useTranslation } from 'react-i18next';
import { formatDate, formatYearMonth } from '@shared/dates';
import { formatReceiptNumber, type Receipt } from '@shared/payments';
import { useSettings } from '../../app/SettingsContext';
import { BigButton } from '../../components/BigButton';
import { MoneyText } from '../../components/MoneyText';
import styles from './ReceiptList.module.css';

interface ReceiptListProps {
  receipts: readonly Receipt[];
  onEdit: (receipt: Receipt) => void;
  onCancel: (receipt: Receipt) => void;
}

/** The area's payments, newest first. Cancelled ones stay listed, crossed out. */
export function ReceiptList({ receipts, onEdit, onCancel }: ReceiptListProps) {
  const { t } = useTranslation();
  const { settings } = useSettings();
  const digits = settings.digitStyle;

  if (receipts.length === 0) return <p className={styles.none}>{t('receipts.none')}</p>;
  return (
    <ul className={styles.list}>
      {receipts.map((receipt) => (
        <li key={receipt.id} className={styles.row} data-cancelled={receipt.voided || undefined}>
          <div className={styles.details}>
            <strong>
              {receipt.receiptNumber === null
                ? t('receipts.pastRecord')
                : t('receipts.number', {
                    number: formatReceiptNumber(receipt.receiptNumber, digits),
                  })}
            </strong>
            {receipt.voided && (
              <span className={styles.cancelled}>{t('receipts.cancelledLabel')}</span>
            )}
            <span className={styles.struck}>{formatDate(receipt.paidOn, digits)}</span>
            <strong className={styles.struck}>
              <MoneyText amount={receipt.totalAmount} currency={receipt.currency} />
            </strong>
            <span className={styles.months}>
              {t('receipts.months', {
                months: receipt.allocations
                  .map((month) => formatYearMonth(month, digits))
                  .join(t('receipts.separator')),
              })}
            </span>
            {receipt.note && (
              <span className={styles.note} dir="auto">
                {receipt.note}
              </span>
            )}
          </div>
          {!receipt.voided && (
            <div className={styles.actions}>
              <BigButton onClick={() => onEdit(receipt)}>{t('common.edit')}</BigButton>
              <BigButton onClick={() => onCancel(receipt)}>{t('receipts.cancel')}</BigButton>
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}
