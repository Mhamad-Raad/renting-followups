import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { AreaDetails } from '@shared/areas';
import { FRACTION_DIGITS } from '@shared/currency';
import { dateStringFromLocal, formatYearMonth, yearMonthOf, type YearMonth } from '@shared/dates';
import { formatAmount } from '@shared/formatNumber';
import {
  formatReceiptNumber,
  PAYMENT_NOTE_MAX,
  type AllocationResult,
  type PaymentCreateResult,
  type PaymentUpdateResult,
  type Receipt,
} from '@shared/payments';
import { callIpc, useIpcQuery, type QueryState } from '../../app/ipc';
import { useSettings } from '../../app/SettingsContext';
import { useDebouncedValue } from '../../app/useDebouncedValue';
import { AmountField } from '../../components/AmountField';
import { BigButton } from '../../components/BigButton';
import { DateField } from '../../components/DateField';
import { Dialog, DialogActions } from '../../components/Dialog';
import { Form } from '../../components/Form';
import { MonthYearField } from '../../components/MonthYearField';
import { Notice } from '../../components/Notice';
import { TextField } from '../../components/TextField';
import styles from './AreaPage.module.css';

const PREVIEW_DELAY_MS = 200;

/** A new payment, a past record (no receipt number), or a correction of a saved receipt. */
export type PaymentMode = { kind: 'new' } | { kind: 'past' } | { kind: 'edit'; receipt: Receipt };

/** What the area page needs after a save, to show the message and offer Undo. */
export interface PaymentSaved {
  message: string;
  /** Set for a new payment, which can be undone. */
  undo?: { id: number; receiptNumber: number | null };
}

interface PaymentDialogProps {
  area: AreaDetails;
  mode: PaymentMode | null;
  onSaved: (saved: PaymentSaved) => void;
  onClose: () => void;
}

export function PaymentDialog({ area, mode, onSaved, onClose }: PaymentDialogProps) {
  const { t } = useTranslation();
  const { settings } = useSettings();
  const title = (() => {
    if (!mode) return '';
    if (mode.kind !== 'edit')
      return t(mode.kind === 'new' ? 'paymentDialog.newTitle' : 'paymentDialog.pastTitle');
    const { receiptNumber } = mode.receipt;
    return receiptNumber === null
      ? t('paymentDialog.editPastTitle')
      : t('paymentDialog.editTitle', {
          number: formatReceiptNumber(receiptNumber, settings.digitStyle),
        });
  })();
  return (
    <Dialog open={mode !== null} title={title} onClose={onClose}>
      {mode?.kind === 'edit' ? (
        <PaymentForm
          area={area}
          mode={mode}
          start={mode.receipt.allocations[0] ?? yearMonthOf(new Date())}
          onSaved={onSaved}
          onClose={onClose}
        />
      ) : (
        mode && <NewPaymentForm area={area} mode={mode} onSaved={onSaved} onClose={onClose} />
      )}
    </Dialog>
  );
}

/** Waits for the suggested first month (the oldest not fully paid) before showing the form. */
function NewPaymentForm(props: Omit<PaymentFormProps, 'start'>) {
  const { t } = useTranslation();
  const suggested = useIpcQuery('payments:suggestedStart', { areaId: props.area.id });
  if (suggested.state.status === 'loading') return null;
  if (suggested.state.status === 'error')
    return <Notice tone="error">{t('errors.unexpected')}</Notice>;
  return <PaymentForm {...props} start={suggested.state.data ?? yearMonthOf(new Date())} />;
}

interface PaymentFormProps {
  area: AreaDetails;
  mode: PaymentMode;
  start: YearMonth;
  onSaved: (saved: PaymentSaved) => void;
  onClose: () => void;
}

function PaymentForm({ area, mode, start, onSaved, onClose }: PaymentFormProps) {
  const { t } = useTranslation();
  const { settings } = useSettings();
  const editing = mode.kind === 'edit' ? mode.receipt : null;
  const [amount, setAmount] = useState<number | null>(editing?.totalAmount ?? null);
  const [from, setFrom] = useState<YearMonth>({ year: start.year, month: start.month });
  const [paidOn, setPaidOn] = useState(editing?.paidOn ?? dateStringFromLocal(new Date()));
  const [note, setNote] = useState(editing?.note ?? '');
  const [showProblems, setShowProblems] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const explain = (result: PaymentCreateResult | PaymentUpdateResult) =>
    result.ok
      ? null
      : result.reason === 'not_found'
        ? t('areaForm.problems.not_found')
        : t(`paymentDialog.${result.reason}`);

  const submit = async () => {
    setShowProblems(true);
    if (amount === null || amount === 0 || busy) return;
    setBusy(true);
    const details = { amount, from, paidOn, note };
    if (editing) {
      const result = await callIpc('payments:update', { id: editing.id, ...details });
      setBusy(false);
      if (!result.ok) return setProblem(t('errors.unexpected'));
      if (!result.data.ok) return setProblem(explain(result.data));
      return onSaved({ message: t('paymentDialog.updated') });
    }
    const isBackfill = mode.kind === 'past';
    const result = await callIpc('payments:create', { areaId: area.id, isBackfill, ...details });
    setBusy(false);
    if (!result.ok) return setProblem(t('errors.unexpected'));
    if (!result.data.ok) return setProblem(explain(result.data));
    const { id, receiptNumber } = result.data;
    onSaved({
      message:
        receiptNumber === null
          ? t('paymentDialog.pastSaved')
          : t('paymentDialog.saved', {
              number: formatReceiptNumber(receiptNumber, settings.digitStyle),
            }),
      undo: { id, receiptNumber },
    });
  };

  return (
    <Form className={styles.dialogForm} onSubmit={() => void submit()}>
      {mode.kind === 'past' && <p className={styles.hint}>{t('paymentDialog.pastHint')}</p>}
      <AmountField
        label={t('paymentDialog.amount')}
        currency={area.currency}
        value={amount}
        onChange={setAmount}
        autoFocus
        error={showProblems && !amount ? t('paymentDialog.amountRequired') : null}
      />
      <MonthYearField
        label={t('paymentDialog.from')}
        value={from}
        onChange={setFrom}
        hint={t('paymentDialog.fromHint')}
      />
      {amount ? (
        <AllocationPreview
          area={area}
          amount={amount}
          from={from}
          receiptId={editing?.id ?? null}
        />
      ) : null}
      <DateField label={t('paymentDialog.paidOn')} value={paidOn} onChange={setPaidOn} />
      <TextField
        label={`${t('paymentDialog.note')} ${t('common.optional')}`}
        value={note}
        onChange={setNote}
        maxLength={PAYMENT_NOTE_MAX}
        dir="auto"
      />
      {problem && <Notice tone="error">{problem}</Notice>}
      <DialogActions>
        <BigButton type="submit" variant="primary" disabled={busy}>
          {t('common.save')}
        </BigButton>
        <BigButton onClick={onClose}>{t('common.cancel')}</BigButton>
      </DialogActions>
    </Form>
  );
}

interface AllocationPreviewProps {
  area: AreaDetails;
  amount: number;
  from: YearMonth;
  receiptId: number | null;
}

/** Shows, before saving, which months the money will fill, worked out by the main process. */
function AllocationPreview({ area, amount, from, receiptId }: AllocationPreviewProps) {
  // A stable object, so the delay only restarts when the amount or month really changes.
  const input = useMemo(
    () => ({ areaId: area.id, amount, from, receiptId }),
    [area.id, amount, from, receiptId],
  );
  const query = useDebouncedValue(input, PREVIEW_DELAY_MS);
  const preview = useIpcQuery('payments:preview', query);
  return <PreviewText state={preview.state} area={area} />;
}

function PreviewText({
  state,
  area,
}: {
  state: QueryState<AllocationResult | null>;
  area: AreaDetails;
}) {
  const { t } = useTranslation();
  const { settings } = useSettings();
  if (state.status === 'loading') return null;
  if (state.status === 'error' || state.data === null) {
    return <Notice tone="error">{t('errors.unexpected')}</Notice>;
  }
  if (!state.data.ok) return <Notice tone="warning">{t('paymentDialog.too_much')}</Notice>;
  const money = (value: number) =>
    formatAmount(value, FRACTION_DIGITS[area.currency], settings.digitStyle);
  return (
    <div className={styles.preview} aria-live="polite">
      <h3 className={styles.previewTitle}>{t('paymentDialog.preview')}</h3>
      <ul>
        {state.data.months.map((planned) => {
          const month = formatYearMonth(planned, settings.digitStyle);
          const after = planned.paidBefore + planned.amount;
          return (
            <li key={`${planned.year}-${planned.month}`}>
              {after >= planned.expected
                ? t('paymentDialog.previewFull', { month })
                : t('paymentDialog.previewPartial', {
                    month,
                    paid: money(after),
                    expected: money(planned.expected),
                  })}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
