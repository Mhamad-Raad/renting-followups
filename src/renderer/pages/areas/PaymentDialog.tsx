import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { AreaDetails } from '@shared/areas';
import { FRACTION_DIGITS, type Currency } from '@shared/currency';
import { dateStringFromLocal, formatYearMonth, yearMonthOf, type YearMonth } from '@shared/dates';
import { isolateNumber } from '@shared/digits';
import { formatAmount } from '@shared/formatNumber';
import { paymentCurrency } from '@shared/prices';
import {
  formatReceiptNumber,
  PAYMENT_NOTE_MAX,
  type AllocationResult,
  type PaymentCreateResult,
  type PaymentUpdateResult,
  type Receipt,
} from '@shared/payments';
import { callIpc, useIpcQuery, type QueryState } from '../../app/ipc';
import { useMountedRef } from '../../app/useMountedRef';
import { useSettings } from '../../app/SettingsContext';
import { useDebouncedValue } from '../../app/useDebouncedValue';
import { BigButton } from '../../components/BigButton';
import { CountField } from '../../components/CountField';
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

/** What the area page shows after a save. */
export interface PaymentSaved {
  message: string;
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
    <Dialog open={mode !== null} title={title} onClose={onClose} size="wide">
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

/** Waits for the suggested first month (the oldest not paid) before showing the form. */
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
  const mounted = useMountedRef();
  const { settings } = useSettings();
  const editing = mode.kind === 'edit' ? mode.receipt : null;
  // A month is paid whole or not at all: the form asks how many months, and the amount follows.
  const [monthCount, setMonthCount] = useState(editing?.allocations.length || 1);
  const [from, setFrom] = useState<YearMonth>({ year: start.year, month: start.month });
  // A receipt is in one currency: a saved one keeps its own, new money takes that of its first month.
  const currency = editing?.currency ?? paymentCurrency(area.prices, from) ?? area.currency;
  const [paidOn, setPaidOn] = useState(editing?.paidOn ?? dateStringFromLocal(new Date()));
  const [note, setNote] = useState(editing?.note ?? '');
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const explain = (result: PaymentCreateResult | PaymentUpdateResult) =>
    result.ok
      ? null
      : result.reason === 'not_found'
        ? t('areaForm.problems.not_found')
        : t(`paymentDialog.${result.reason}`);

  // A stable object, so the preview's delay only restarts when the months really change.
  const previewInput = useMemo(
    () => ({ areaId: area.id, monthCount, from, receiptId: editing?.id ?? null }),
    [area.id, monthCount, from, editing?.id],
  );
  const previewQuery = useDebouncedValue(previewInput, PREVIEW_DELAY_MS);
  const preview = useIpcQuery('payments:preview', previewQuery);
  const plan = preview.state.status === 'ready' ? preview.state.data : null;
  const open = plan && (plan.ok || plan.reason === 'too_much') ? plan.open : undefined;

  const submit = async () => {
    if (busy) return;
    setBusy(true);
    const details = { monthCount, from, paidOn, note };
    if (editing) {
      const result = await callIpc('payments:update', { id: editing.id, ...details });
      // A saved change always reaches the page, even if the dialog was closed meanwhile.
      if (result.ok && result.data.ok) return onSaved({ message: t('paymentDialog.updated') });
      if (!mounted.current) return;
      setBusy(false);
      return setProblem(result.ok ? explain(result.data) : t('errors.unexpected'));
    }
    const isBackfill = mode.kind === 'past';
    const result = await callIpc('payments:create', { areaId: area.id, isBackfill, ...details });
    if (!result.ok || !result.data.ok) {
      if (!mounted.current) return;
      setBusy(false);
      return setProblem(result.ok ? explain(result.data) : t('errors.unexpected'));
    }
    const { receiptNumber } = result.data;
    onSaved({
      message:
        receiptNumber === null
          ? t('paymentDialog.pastSaved')
          : t('paymentDialog.saved', {
              number: formatReceiptNumber(receiptNumber, settings.digitStyle),
            }),
    });
  };

  return (
    <Form className={styles.dialogForm} onSubmit={() => void submit()}>
      {mode.kind === 'past' && <p className={styles.hint}>{t('paymentDialog.pastHint')}</p>}
      <MonthYearField
        label={t('paymentDialog.from')}
        value={from}
        onChange={setFrom}
        hint={t('paymentDialog.fromHint')}
      />
      <CountField
        label={t('paymentDialog.monthCount')}
        value={monthCount}
        onChange={setMonthCount}
        max={open}
        lessLabel={t('paymentDialog.fewer')}
        moreLabel={t('paymentDialog.more')}
      />
      {/* While the months change, the shown ones belong to the earlier choice: dimmed until they catch up. */}
      <PreviewText
        state={preview.state}
        currency={currency}
        stale={previewQuery !== previewInput}
      />
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

/** Shows, before saving, which months will be paid and the amount, worked out by the main process. */
function PreviewText({
  state,
  currency,
  stale,
}: {
  state: QueryState<AllocationResult | null>;
  currency: Currency;
  stale: boolean;
}) {
  const { t } = useTranslation();
  const { settings } = useSettings();
  if (state.status === 'loading') return null;
  if (state.status === 'error' || state.data === null) {
    return <Notice tone="error">{t('errors.unexpected')}</Notice>;
  }
  if (!state.data.ok)
    return <Notice tone="warning">{t(`paymentDialog.${state.data.reason}`)}</Notice>;
  const digits = settings.digitStyle;
  const money = (value: number) =>
    isolateNumber(formatAmount(value, FRACTION_DIGITS[currency], digits), digits);
  const total = state.data.months.reduce((sum, month) => sum + month.amount, 0);
  return (
    <div className={styles.preview} data-stale={stale || undefined} aria-live="polite">
      <h3 className={styles.previewTitle}>{t('paymentDialog.preview')}</h3>
      <ul>
        {state.data.months.map((paid) => (
          <li key={`${paid.year}-${paid.month}`}>
            {t('paymentDialog.previewMonth', {
              month: formatYearMonth(paid, digits),
              amount: money(paid.amount),
            })}
          </li>
        ))}
      </ul>
      <p className={styles.previewTotal}>
        {t('paymentDialog.total', { amount: `${money(total)} ${t(`currency.${currency}`)}` })}
      </p>
    </div>
  );
}
