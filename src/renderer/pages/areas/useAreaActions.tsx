import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { AreaDetails } from '@shared/areas';
import type { Receipt } from '@shared/payments';
import { callIpc } from '../../app/ipc';
import { useMountedRef } from '../../app/useMountedRef';
import { BigButton } from '../../components/BigButton';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { Notice } from '../../components/Notice';
import { usePrint } from '../../print/usePrint';
import styles from './AreaPage.module.css';
import type { AreaAction } from './links';
import { PaymentDialog, type PaymentMode, type PaymentSaved } from './PaymentDialog';
import { PriceDialog, type PriceMode } from './PriceDialog';
import { RenterDialog } from './RenterDialog';

export type AreaDialog =
  | { kind: 'price'; mode: PriceMode }
  | { kind: 'payment'; mode: PaymentMode }
  | { kind: 'cancelReceipt'; receipt: Receipt }
  | { kind: 'renter' }
  | { kind: 'delete' };

/** The dialog each area action opens, from the area page or the Areas list's ⋯ menu. */
export const ACTION_DIALOGS: Record<AreaAction, AreaDialog> = {
  payment: { kind: 'payment', mode: { kind: 'new' } },
  pastPayment: { kind: 'payment', mode: { kind: 'past' } },
  changePrice: { kind: 'price', mode: 'change' },
  markVacant: { kind: 'price', mode: 'vacant' },
  setRentAgain: { kind: 'price', mode: 'rentAgain' },
  changeRenter: { kind: 'renter' },
  delete: { kind: 'delete' },
};

type SavedReceipt = NonNullable<PaymentSaved['receipt']>;

interface AreaActionOptions {
  /** Something about the area changed: load it again. */
  onChanged: () => void;
  /** The area was moved to Deleted items; without this, the message shows here like any change. */
  onDeleted?: (message: string) => void;
  initialDialog?: AreaDialog | null;
  initialNotice?: string | null;
}

/**
 * The actions that change one area (payments, price, vacant, renter, delete),
 * their dialogs, and the message after them with Save receipt as PDF. The
 * area page and the Areas list share it, so both behave the same.
 */
export function useAreaActions(
  area: AreaDetails | null,
  { onChanged, onDeleted, initialDialog = null, initialNotice = null }: AreaActionOptions,
) {
  const { t } = useTranslation();
  const mounted = useMountedRef();
  const [dialog, setDialog] = useState<AreaDialog | null>(initialDialog);
  const [notice, setNotice] = useState<string | null>(initialNotice);
  const [problem, setProblem] = useState<string | null>(null);
  // The payment just saved, whose receipt the message offers as a PDF.
  const [saved, setSaved] = useState<SavedReceipt | null>(null);
  const printing = usePrint();
  // Receipts are only ever saved as PDF from here (owner's decision); printing is done from the PDF.
  const saveReceiptPdf = (id: number) => void printing.run({ kind: 'receipt', id, output: 'pdf' });
  const close = () => setDialog(null);

  /** A change was saved: say so, and offer its receipt as a PDF when it made one. */
  const done = (message: string, receipt: SavedReceipt | null = null) => {
    setDialog(null);
    setProblem(null);
    setNotice(message);
    setSaved(receipt);
    onChanged();
  };

  const fail = (message: string) => {
    setNotice(null);
    setProblem(message);
  };

  const paymentSaved = ({ message, receipt, pdf }: PaymentSaved) => {
    done(message, receipt ?? null);
    if (pdf && receipt) saveReceiptPdf(receipt.id);
  };

  // A cancelled receipt stays listed, and its number is never reused.
  const cancelReceipt = async (id: number, message: string) => {
    setDialog(null);
    const result = await callIpc('payments:void', { id });
    if (!mounted.current) return;
    if (result.ok && result.data.ok) done(message);
    else fail(t('errors.unexpected'));
  };

  const remove = async () => {
    if (!area) return;
    setDialog(null);
    const result = await callIpc('areas:delete', { id: area.id });
    if (!mounted.current) return;
    if (!result.ok || !result.data.ok) fail(t('errors.unexpected'));
    else if (onDeleted) onDeleted(t('areas.deleted'));
    else done(t('areas.deleted'));
  };

  const feedback: ReactNode = (
    <>
      {notice && (
        <Notice tone="success">
          <div className={styles.saved}>
            <span>{notice}</span>
            {saved && saved.receiptNumber !== null && (
              <BigButton disabled={printing.busy} onClick={() => saveReceiptPdf(saved.id)}>
                {t('print.actions.receiptPdf')}
              </BigButton>
            )}
          </div>
        </Notice>
      )}
      {problem && <Notice tone="error">{problem}</Notice>}
      {printing.message && <Notice tone={printing.message.tone}>{printing.message.text}</Notice>}
    </>
  );

  const dialogs: ReactNode = area && (
    <>
      <PriceDialog
        area={area}
        mode={dialog?.kind === 'price' ? dialog.mode : null}
        onDone={done}
        onClose={close}
      />
      <PaymentDialog
        area={area}
        mode={dialog?.kind === 'payment' ? dialog.mode : null}
        onSaved={paymentSaved}
        onClose={close}
      />
      <ConfirmDialog
        open={dialog?.kind === 'cancelReceipt'}
        title={t('receipts.cancelTitle')}
        confirmLabel={t('receipts.cancel')}
        cancelLabel={t('receipts.keep')}
        tone="danger"
        onConfirm={() => {
          if (dialog?.kind === 'cancelReceipt') {
            void cancelReceipt(dialog.receipt.id, t('receipts.cancelDone'));
          }
        }}
        onCancel={close}
      >
        {t('receipts.cancelBody')}
      </ConfirmDialog>
      <RenterDialog area={area} open={dialog?.kind === 'renter'} onDone={done} onClose={close} />
      <ConfirmDialog
        open={dialog?.kind === 'delete'}
        title={t('area.deleteTitle')}
        confirmLabel={t('common.delete')}
        tone="danger"
        onConfirm={() => void remove()}
        onCancel={close}
      >
        {t('area.deleteBody')}
      </ConfirmDialog>
    </>
  );

  return {
    open: setDialog,
    done,
    fail,
    saveReceiptPdf,
    saving: printing.busy,
    feedback,
    dialogs,
  };
}
