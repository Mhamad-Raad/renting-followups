import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router';
import { formatDate, formatMonthRuns } from '@shared/dates';
import { formatReceiptNumber } from '@shared/payments';
import { useIpcQuery } from '../app/ipc';
import { useSettings } from '../app/SettingsContext';
import { MoneyText } from '../components/MoneyText';
import { PhoneText } from '../components/PhoneText';
import { parseRouteId } from '../app/parseRouteId';
import styles from './print.module.css';
import { PrintFrame } from './PrintFrame';
import { usePrintReady } from './printPage';

/** One receipt on one A4 page (ARCHITECTURE.md section 8.6); reprints are stamped "Copy". */
export function ReceiptPrint() {
  const { t } = useTranslation();
  const { settings } = useSettings();
  const id = parseRouteId(useParams().id);
  const query = useIpcQuery('print:receiptData', { id: id ?? 0 });
  const data = query.state.status === 'ready' ? query.state.data : null;
  usePrintReady(query.state.status === 'loading' ? null : data !== null);
  if (!data || data.receipt.receiptNumber === null) return null;

  const { receipt } = data;
  const digits = settings.digitStyle;
  const rows: [string, ReactNode][] = [
    [t('print.date'), formatDate(receipt.paidOn, digits)],
    [t('print.area'), data.areaName],
    [t('print.renter'), receipt.renterName ?? t('areas.noRenter')],
    [t('print.phone'), data.renterPhone ? <PhoneText phone={data.renterPhone} /> : '—'],
    [t('print.months'), formatMonthRuns(receipt.allocations, digits, t('receipts.separator'))],
  ];
  return (
    <PrintFrame
      title={t('print.receiptNumber', {
        number: formatReceiptNumber(receipt.receiptNumber ?? 0, digits),
      })}
    >
      {data.printCount > 0 && <p className={styles.copy}>{t('print.copy')}</p>}
      <dl className={styles.receipt}>
        {rows.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
        <div className={styles.amount}>
          <dt>{t('print.amount')}</dt>
          <dd>
            <MoneyText amount={receipt.totalAmount} currency={receipt.currency} />
          </dd>
        </div>
        {receipt.note && (
          <div>
            <dt>{t('print.note')}</dt>
            <dd dir="auto">{receipt.note}</dd>
          </div>
        )}
      </dl>
      <div className={styles.signature}>
        <span>{t('print.signature')}</span>
      </div>
      <p className={styles.detail}>
        {t('print.printedOn', { date: formatDate(data.printedOn, digits) })}
      </p>
    </PrintFrame>
  );
}
