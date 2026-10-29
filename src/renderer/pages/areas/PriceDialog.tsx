import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { AreaDetails, VacantPayment } from '@shared/areas';
import { FRACTION_DIGITS } from '@shared/currency';
import type { StatusChange } from '@shared/months';
import { formatMonthRuns, formatYearMonth, yearMonthOf } from '@shared/dates';
import { isolateNumber } from '@shared/digits';
import { formatAmount } from '@shared/formatNumber';
import { formatReceiptNumber } from '@shared/payments';
import { callIpc } from '../../app/ipc';
import { useMountedRef } from '../../app/useMountedRef';
import { useSettings } from '../../app/SettingsContext';
import { AmountField } from '../../components/AmountField';
import { BigButton } from '../../components/BigButton';
import { Dialog, DialogActions } from '../../components/Dialog';
import { Form } from '../../components/Form';
import { monthWord } from '../../components/MonthBoxes';
import { MonthYearField } from '../../components/MonthYearField';
import { Notice } from '../../components/Notice';
import styles from './AreaPage.module.css';

/** 'change' sets a new price, 'vacant' sets no rent (price 0), 'rentAgain' ends a vacancy. */
export type PriceMode = 'change' | 'vacant' | 'rentAgain';

const TITLES = {
  change: 'priceDialog.changeTitle',
  vacant: 'priceDialog.vacantTitle',
  rentAgain: 'priceDialog.rentAgainTitle',
} as const;

interface PriceDialogProps {
  area: AreaDetails;
  mode: PriceMode | null;
  onDone: (message: string) => void;
  onClose: () => void;
}

export function PriceDialog({ area, mode, onDone, onClose }: PriceDialogProps) {
  const { t } = useTranslation();
  return (
    <Dialog open={mode !== null} title={mode ? t(TITLES[mode]) : ''} onClose={onClose}>
      {mode && <PriceForm area={area} mode={mode} onDone={onDone} onClose={onClose} />}
    </Dialog>
  );
}

function PriceForm({ area, mode, onDone, onClose }: PriceDialogProps & { mode: PriceMode }) {
  const { t } = useTranslation();
  const mounted = useMountedRef();
  const { settings } = useSettings();
  const [from, setFrom] = useState(yearMonthOf(new Date()));
  const [price, setPrice] = useState<number | null>(null);
  const [showProblems, setShowProblems] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Paid months this change would alter; once shown, saving again means "save anyway".
  const [changes, setChanges] = useState<StatusChange[] | null>(null);
  // Paid months that would become vacant; once shown, saving again takes them out first.
  const [vacantPayments, setVacantPayments] = useState<VacantPayment[] | null>(null);
  const needsPrice = mode !== 'vacant';
  const rentStart = area.prices[0];

  const edit =
    <T,>(set: (value: T) => void) =>
    (value: T) => {
      set(value);
      setChanges(null);
      setVacantPayments(null);
      setProblem(null);
    };

  const submit = async () => {
    setShowProblems(true);
    if ((needsPrice && price === null) || busy) return;
    setBusy(true);
    const takeOut = vacantPayments !== null;
    const change = {
      areaId: area.id,
      from,
      monthlyPrice: needsPrice ? (price ?? 0) : 0,
      ...(takeOut && { takeOutVacantMonths: true }),
    };
    if (changes === null && !takeOut) {
      const impact = await callIpc('areas:priceChangeImpact', change);
      if (!mounted.current) return;
      // Never save without the check: if it fails, say so and change nothing.
      if (!impact.ok || impact.data === null) {
        setBusy(false);
        setProblem(t(impact.ok ? 'areaForm.problems.not_found' : 'errors.unexpected'));
        return;
      }
      if (!impact.data.ok || impact.data.changes.length > 0) {
        setBusy(false);
        if (impact.data.ok) setChanges(impact.data.changes);
        else if (impact.data.vacantPayments.length > 0)
          setVacantPayments(impact.data.vacantPayments);
        else setProblem(t('priceDialog.no_room'));
        return;
      }
    }
    const result = await callIpc('areas:changePrice', change);
    // A saved change always reaches the page, even if the dialog was closed meanwhile.
    if (result.ok && result.data.ok) {
      onDone(t(mode === 'vacant' ? 'priceDialog.vacantSaved' : 'priceDialog.priceSaved'));
      return;
    }
    if (!mounted.current) return;
    setBusy(false);
    if (!result.ok) {
      setProblem(t('errors.unexpected'));
    } else if (!result.data.ok) {
      const { reason } = result.data;
      setProblem(
        reason === 'before_rent_start' && rentStart
          ? t('priceDialog.before_rent_start', {
              month: formatYearMonth(rentStart, settings.digitStyle),
            })
          : reason === 'no_room'
            ? t('priceDialog.no_room')
            : t('areaForm.problems.not_found'),
      );
    }
  };

  return (
    <Form className={styles.dialogForm} onSubmit={() => void submit()}>
      <MonthYearField
        label={t('priceDialog.from')}
        value={from}
        onChange={edit(setFrom)}
        hint={t(mode === 'vacant' ? 'priceDialog.vacantHint' : 'priceDialog.changeHint')}
      />
      {needsPrice && (
        <AmountField
          label={t('priceDialog.newRent')}
          currency={area.currency}
          value={price}
          onChange={edit(setPrice)}
          autoFocus
          error={showProblems && price === null ? t('areaForm.problems.rentRequired') : null}
        />
      )}
      {changes && changes.length > 0 && <ChangeWarning changes={changes} area={area} />}
      {vacantPayments && <VacantPaymentsWarning payments={vacantPayments} area={area} />}
      {problem && <Notice tone="error">{problem}</Notice>}
      <DialogActions>
        <BigButton type="submit" variant={vacantPayments ? 'danger' : 'primary'} disabled={busy}>
          {vacantPayments
            ? t('priceDialog.takeOutAndSave')
            : changes
              ? t('priceDialog.saveAnyway')
              : t('common.save')}
        </BigButton>
        <BigButton onClick={onClose}>{t('common.cancel')}</BigButton>
      </DialogActions>
    </Form>
  );
}

/**
 * What saving would do to money already paid: each month that gains or loses
 * money or changes colour, for example "Month 4/2026: Paid 250,000 → Late 200,000".
 */
function ChangeWarning({ changes, area }: { changes: readonly StatusChange[]; area: AreaDetails }) {
  const { t } = useTranslation();
  const { settings } = useSettings();
  // A price change can only make a paid month "not applicable" by marking it vacant (rent 0).
  const word = (status: StatusChange['before']) =>
    t(`months.status.${monthWord({ status, expected: 0 })}`);
  const money = (amount: number) =>
    formatAmount(amount, FRACTION_DIGITS[area.currency], settings.digitStyle);
  return (
    <Notice tone="warning">
      <p className={styles.warningTitle}>{t('priceDialog.warning')}</p>
      <ul className={styles.warningList}>
        {changes.map((change) => (
          <li key={`${change.year}-${change.month}`}>
            {t('priceDialog.statusChange', {
              month: formatYearMonth(change, settings.digitStyle),
              before: word(change.before),
              paidBefore: money(change.paidBefore),
              after: word(change.after),
              paidAfter: money(change.paidAfter),
            })}
          </li>
        ))}
      </ul>
    </Notice>
  );
}

/**
 * Paid months that would have no rent once saved, per receipt, for example
 * "Month 12/2026: Receipt No. 1 is cancelled (20,000 IQD)". Saving again takes
 * them out of their receipts first.
 */
function VacantPaymentsWarning({
  payments,
  area,
}: {
  payments: readonly VacantPayment[];
  area: AreaDetails;
}) {
  const { t } = useTranslation();
  const { settings } = useSettings();
  const digits = settings.digitStyle;
  const money = (amount: number) =>
    `${isolateNumber(formatAmount(amount, FRACTION_DIGITS[area.currency], digits), digits)} ${t(`currency.${area.currency}`)}`;
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
              amount: money(payment.amount),
            })}
          </li>
        ))}
        <li>{t('monthPick.noUndo')}</li>
      </ul>
    </Notice>
  );
}
