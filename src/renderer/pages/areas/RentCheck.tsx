import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { PriceChange, VacantPayment } from '@shared/areas';
import { FRACTION_DIGITS, type Currency } from '@shared/currency';
import { formatMonthRuns, type YearMonth } from '@shared/dates';
import { isolateNumber } from '@shared/digits';
import { formatAmount } from '@shared/formatNumber';
import { formatReceiptNumber } from '@shared/payments';
import { callIpc } from '../../app/ipc';
import { useSettings } from '../../app/SettingsContext';
import { Notice } from '../../components/Notice';
import styles from './AreaPage.module.css';

/** What the first press of Save found: go ahead, the warnings are now shown, or a problem. */
type CheckOutcome = { kind: 'save' } | { kind: 'shown' } | { kind: 'problem'; text: string };

/**
 * The check before a rent change is saved (Change price, Change renter): what
 * it would do to money already paid is shown first (paid months that stay
 * paid at their old rent, or paid months left without rent), and pressing
 * Save again saves, first taking out paid months that would be left without rent.
 */
export function useRentCheck() {
  const { t } = useTranslation();
  // Paid months whose rent this change alters; they stay paid. Once shown, saving again saves.
  const [keptPaid, setKeptPaid] = useState<YearMonth[] | null>(null);
  // Paid months left without rent; once shown, saving again takes them out first.
  const [vacantPayments, setVacantPayments] = useState<VacantPayment[] | null>(null);
  const shown = keptPaid !== null || vacantPayments !== null;

  return {
    /** Forgets what was shown, after the form changes. */
    reset() {
      setKeptPaid(null);
      setVacantPayments(null);
    },

    /** Set on the change once the paid months to take out were shown. */
    takeOut: vacantPayments !== null,

    /** Never saves without the check: if the check fails, it says so and nothing changes. */
    async check(change: PriceChange): Promise<CheckOutcome> {
      if (shown) return { kind: 'save' };
      const impact = await callIpc('areas:priceChangeImpact', change);
      if (!impact.ok || impact.data === null) {
        return {
          kind: 'problem',
          text: t(impact.ok ? 'areaForm.problems.not_found' : 'errors.unexpected'),
        };
      }
      if (impact.data.ok) {
        if (impact.data.keptPaid.length === 0) return { kind: 'save' };
        setKeptPaid(impact.data.keptPaid);
        return { kind: 'shown' };
      }
      if (impact.data.vacantPayments.length === 0) {
        return { kind: 'problem', text: t('priceDialog.no_room') };
      }
      setVacantPayments(impact.data.vacantPayments);
      return { kind: 'shown' };
    },

    warnings: (
      <>
        {keptPaid && <KeptPaidNote months={keptPaid} />}
        {vacantPayments && <VacantPaymentsWarning payments={vacantPayments} />}
      </>
    ),

    saveButton: {
      variant: vacantPayments ? ('danger' as const) : ('primary' as const),
      label: vacantPayments ? t('priceDialog.takeOutAndSave') : t('common.save'),
    },
  };
}

/** Paid months whose rent the change alters: they stay paid at the rent they had. */
function KeptPaidNote({ months }: { months: readonly YearMonth[] }) {
  const { t } = useTranslation();
  const { settings } = useSettings();
  return (
    <Notice tone="warning">
      {t('priceDialog.keptPaid', {
        months: formatMonthRuns(months, settings.digitStyle, t('receipts.separator')),
      })}
    </Notice>
  );
}

/**
 * Paid months that would have no rent in their receipt's currency once saved
 * (vacant, or rent now in another currency), per receipt, for example
 * "Month 12/2026: Receipt No. 1 is cancelled (20,000 IQD)". Saving again takes
 * them out of their receipts first.
 */
function VacantPaymentsWarning({ payments }: { payments: readonly VacantPayment[] }) {
  const { t } = useTranslation();
  const { settings } = useSettings();
  const digits = settings.digitStyle;
  const money = (amount: number, currency: Currency) =>
    `${isolateNumber(formatAmount(amount, FRACTION_DIGITS[currency], digits), digits)} ${t(`currency.${currency}`)}`;
  return (
    <Notice tone="error">
      <p className={styles.warningTitle}>{t('priceDialog.vacantPaid')}</p>
      <ul className={styles.warningList}>
        {payments.map((payment) => (
          <li key={payment.receiptId}>
            {t(payment.cancels ? 'priceDialog.vacantPaidCancels' : 'priceDialog.vacantPaidLowers', {
              months: formatMonthRuns(payment.months, digits, t('receipts.separator')),
              receipt:
                payment.receiptNumber === null
                  ? t('receipts.pastRecord')
                  : t('receipts.number', {
                      number: formatReceiptNumber(payment.receiptNumber, digits),
                    }),
              amount: money(payment.amount, payment.currency),
            })}
          </li>
        ))}
        <li>{t('monthPick.noUndo')}</li>
      </ul>
    </Notice>
  );
}
