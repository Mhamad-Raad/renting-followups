import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { AreaDetails } from '@shared/areas';
import type { Receipt } from '@shared/payments';
import { callIpc } from '../../app/ipc';
import { useMountedRef } from '../../app/useMountedRef';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { Notice } from '../../components/Notice';
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
 * their dialogs, and the message after them. The
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
  const close = () => setDialog(null);

  /** A change was saved: say so. */
  const done = (message: string) => {
    setDialog(null);
    setProblem(null);
    setNotice(message);
    onChanged();
  };

  const fail = (message: string) => {
    setNotice(null);
    setProblem(message);
  };

  const paymentSaved = ({ message }: PaymentSaved) => done(message);

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
      {notice && <Notice tone="success">{notice}</Notice>}
      {problem && <Notice tone="error">{problem}</Notice>}
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
    feedback,
    dialogs,
  };
}
