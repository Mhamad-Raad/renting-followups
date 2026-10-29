import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FRACTION_DIGITS, type Currency } from '@shared/currency';
import { dateStringFromLocal } from '@shared/dates';
import { isolateNumber } from '@shared/digits';
import { formatAmount, formatPlain } from '@shared/formatNumber';
import type { MonthBox } from '@shared/months';
import { formatReceiptNumber, type MonthTakeOut } from '@shared/payments';
import { callIpc } from '../../app/ipc';
import { useSettings } from '../../app/SettingsContext';
import { useMountedRef } from '../../app/useMountedRef';
import { ConfirmDialog } from '../../components/ConfirmDialog';

/** A month box that was clicked, with the area it belongs to. */
export interface PickedMonth {
  areaId: number;
  year: number;
  /** Its amounts are in `box.currency`, the month's own currency. */
  box: MonthBox;
}

/** What the page shows after a click: a plain sentence, good or bad. */
export interface MonthPickOutcome {
  tone: 'success' | 'error';
  text: string;
}

type Question = { picked: PickedMonth; takeOut: MonthTakeOut[] | null };

/** What is still owed for the month: all of its rent, or the rest of it. */
const restOf = (box: MonthBox) => (box.expected ?? 0) - box.paid;

/**
 * Clicking a month box (ARCHITECTURE.md section 7.4): a short question first,
 * then a month not fully paid gets the rest of its rent as a receipt dated
 * today, and a paid month is taken out of the receipts that paid it.
 */
export function useMonthPick(onDone: (outcome: MonthPickOutcome) => void) {
  const { t } = useTranslation();
  const { settings } = useSettings();
  const mounted = useMountedRef();
  const [question, setQuestion] = useState<Question | null>(null);
  const [busy, setBusy] = useState(false);
  // Refs keep `pick` the same function between renders, so 200 month strips are not drawn again.
  const working = useRef(false);
  const latestOnDone = useRef(onDone);
  useEffect(() => {
    latestOnDone.current = onDone;
  });
  const digits = settings.digitStyle;
  const money = (amount: number, currency: Currency) =>
    `${isolateNumber(formatAmount(amount, FRACTION_DIGITS[currency], digits), digits)} ${t(`currency.${currency}`)}`;
  const receiptName = (change: MonthTakeOut) =>
    change.receiptNumber === null
      ? t('receipts.pastRecord')
      : t('receipts.number', { number: formatReceiptNumber(change.receiptNumber, digits) });
  const finish = useCallback((outcome: MonthPickOutcome) => latestOnDone.current(outcome), []);
  const failed = useCallback(
    (reason?: 'not_paid' | 'not_found') =>
      finish({
        tone: 'error',
        text: t(reason === 'not_paid' ? 'monthPick.notPaid' : 'errors.unexpected'),
      }),
    [finish, t],
  );

  const pick = useCallback(
    async (picked: PickedMonth) => {
      if (working.current || picked.box.status === 'not_applicable') return;
      if (picked.box.status !== 'paid') {
        setQuestion({ picked, takeOut: null });
        return;
      }
      working.current = true;
      const preview = await callIpc('payments:monthTakeOutPreview', {
        areaId: picked.areaId,
        year: picked.year,
        month: picked.box.month,
      });
      working.current = false;
      if (!mounted.current) return;
      if (!preview.ok) failed();
      else if (!preview.data.ok) failed(preview.data.reason);
      else setQuestion({ picked, takeOut: preview.data.changes });
    },
    [failed, mounted],
  );

  const confirm = async () => {
    if (!question || working.current) return;
    working.current = true;
    const { picked, takeOut } = question;
    const where = { areaId: picked.areaId, year: picked.year, month: picked.box.month };
    const month = formatPlain(picked.box.month, digits);
    setBusy(true);
    if (takeOut) {
      const result = await callIpc('payments:monthTakeOut', where);
      working.current = false;
      if (!mounted.current) return;
      setBusy(false);
      setQuestion(null);
      if (!result.ok) failed();
      else if (!result.data.ok) failed(result.data.reason);
      else finish({ tone: 'success', text: t('monthPick.takenOut', { month }) });
      return;
    }
    const result = await callIpc('payments:create', {
      areaId: picked.areaId,
      isBackfill: false,
      amount: restOf(picked.box),
      from: { year: picked.year, month: picked.box.month },
      paidOn: dateStringFromLocal(new Date()),
      note: '',
    });
    working.current = false;
    if (!mounted.current) return;
    setBusy(false);
    setQuestion(null);
    if (!result.ok) failed();
    else if (!result.data.ok) {
      const { reason } = result.data;
      const text =
        reason === 'not_found' ? t('areaForm.problems.not_found') : t(`paymentDialog.${reason}`);
      finish({ tone: 'error', text });
    } else
      finish({
        tone: 'success',
        text: t('monthPick.paid', {
          month,
          number: formatReceiptNumber(result.data.receiptNumber ?? 0, digits),
        }),
      });
  };

  const dialog = question && (
    <ConfirmDialog
      open
      title={t(question.takeOut ? 'monthPick.takeOutTitle' : 'monthPick.payTitle', {
        month: formatPlain(question.picked.box.month, digits),
        year: formatPlain(question.picked.year, digits),
      })}
      confirmLabel={t(question.takeOut ? 'monthPick.takeOutButton' : 'monthPick.payButton')}
      tone={question.takeOut ? 'danger' : 'normal'}
      // Taking a month out can cancel receipts: the keyboard starts on Cancel.
      focusCancel={question.takeOut !== null}
      busy={busy}
      onConfirm={() => void confirm()}
      onCancel={() => setQuestion(null)}
    >
      {question.takeOut ? (
        <ul>
          {question.takeOut.map((change) => (
            <li key={change.receiptId}>
              {t(change.cancels ? 'monthPick.cancels' : 'monthPick.lowers', {
                receipt: receiptName(change),
                amount: money(change.amount, question.picked.box.currency),
              })}
            </li>
          ))}
          <li>{t('monthPick.noUndo')}</li>
        </ul>
      ) : (
        <p>
          {question.picked.box.paid > 0 &&
            `${t('monthPick.alreadyPaid', { amount: money(question.picked.box.paid, question.picked.box.currency) })} `}
          {t('monthPick.payBody', {
            amount: money(restOf(question.picked.box), question.picked.box.currency),
          })}
        </p>
      )}
    </ConfirmDialog>
  );

  return { pick, dialog };
}
